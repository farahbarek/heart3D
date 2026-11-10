import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import dicomParser from 'dicom-parser';
import * as THREE from 'three';

type SliceSource = {
  name: string;
  canvas: HTMLCanvasElement;
  position: number;
};

function parseVector(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split('\\')
    .map((part) => Number.parseFloat(part.trim()))
    .filter((n) => Number.isFinite(n));
}

function getDicomSlicePosition(dataSet: dicomParser.DataSet): number {
  const position = parseVector(dataSet.string('x00200032'));
  if (position.length >= 3) return position[2];

  const instanceNumber = Number.parseFloat(dataSet.string('x00200013') ?? '');
  if (Number.isFinite(instanceNumber)) return instanceNumber;

  return 0;
}

function decodeDicomToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; position: number }> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(bytes);
    const transferSyntax = dataSet.string('x00020010');
    const supportedSyntaxes = ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'];
    if (transferSyntax && !supportedSyntaxes.includes(transferSyntax)) {
      throw new Error('Ce DICOM utilise une compression non prise en charge. Utilisez un DICOM monochrome non compressé.');
    }

    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const samples = dataSet.uint16('x00280002') ?? 1;
    const bitsAllocated = dataSet.uint16('x00280100');
    const pixelRepresentation = dataSet.uint16('x00280103') ?? 0;
    const photo = dataSet.string('x00280004') ?? '';
    const pixelElement = dataSet.elements.x7fe00010;

    if (!rows || !columns || !pixelElement || samples !== 1 || !photo.startsWith('MONOCHROME')) {
      throw new Error('DICOM invalide ou non pris en charge : une image monochrome est requise.');
    }
    if (bitsAllocated !== 8 && bitsAllocated !== 16) {
      throw new Error('Seuls les pixels DICOM 8 ou 16 bits sont pris en charge.');
    }

    const count = rows * columns;
    const values = new Float64Array(count);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = pixelElement.dataOffset;

    for (let i = 0; i < count; i += 1) {
      const offset = start + i * (bitsAllocated / 8);
      if (offset + bitsAllocated / 8 > bytes.byteLength) {
        throw new Error('Le fichier DICOM est incomplet ou tronqué.');
      }
      values[i] = bitsAllocated === 8
        ? (pixelRepresentation ? view.getInt8(offset) : view.getUint8(offset))
        : (pixelRepresentation ? view.getInt16(offset, true) : view.getUint16(offset, true));
    }

    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const range = max - min || 1;

    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de créer l’image DICOM dans le navigateur.');
    const image = ctx.createImageData(columns, rows);

    for (let i = 0; i < count; i += 1) {
      let gray = Math.round(((values[i] - min) / range) * 255);
      if (photo === 'MONOCHROME1') gray = 255 - gray;
      const pixel = i * 4;
      image.data[pixel] = gray;
      image.data[pixel + 1] = gray;
      image.data[pixel + 2] = gray;
      image.data[pixel + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    return { canvas, position: getDicomSlicePosition(dataSet) };
  });
}

async function decodeImage(file: File): Promise<{ canvas: HTMLCanvasElement; position: number }> {
  if (file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom') {
    return decodeDicomToCanvas(file);
  }

  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type) && !file.name.match(/\.(png|jpg|jpeg)$/i)) {
    throw new Error('Format non pris en charge. Choisissez des images PNG/JPG/JPEG ou des fichiers DICOM.');
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossible de lire cette image dans le navigateur.');
    context.drawImage(image, 0, 0);
    return { canvas, position: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadSeries(files: File[]): Promise<SliceSource[]> {
  if (files.length === 0) return [];

  const parsed = await Promise.all(
    files.map(async (file, index) => {
      const result = await decodeImage(file);
      return {
        name: file.name,
        canvas: result.canvas,
        position: Number.isFinite(result.position) ? result.position : index,
      };
    }),
  );

  parsed.sort((a, b) => a.position - b.position);
  return parsed;
}

function SliceStack({ slices }: { slices: SliceSource[] }) {
  const depth = slices.length;

  return (
    <group>
      {slices.map((slice, index) => {
        const texture = useMemo(() => {
          const result = new THREE.CanvasTexture(slice.canvas);
          result.colorSpace = THREE.SRGBColorSpace;
          return result;
        }, [slice.canvas]);

        const z = depth > 1 ? ((index / (depth - 1)) - 0.5) * 3.2 : 0;

        return (
          <mesh key={`${slice.name}-${index}`} position={[0, 0, z]}>
            <planeGeometry args={[2.8, 2.8]} />
            <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function MedicalImage3D() {
  const [slices, setSlices] = useState<SliceSource[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setError('');
    setLoading(true);

    try {
      const nextSlices = await loadSeries(files);
      if (nextSlices.length === 0) {
        throw new Error('Aucune image valide n’a été détectée dans la sélection.');
      }
      setSlices(nextSlices);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de traiter la série sélectionnée.');
      setSlices([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Visualisation 3D</h3>
          <p className="text-xs text-slate-500">Sélectionne une série d’images locales pour créer une simulation 3D.</p>
        </div>
        <label className="cursor-pointer rounded-xl bg-medical-500 px-4 py-2 text-sm font-medium text-white hover:bg-medical-700">
          {loading ? 'Traitement…' : slices.length > 0 ? 'Changer la série' : 'Choisir une série'}
          <input
            className="sr-only"
            type="file"
            accept=".png,.jpg,.jpeg,.dcm,image/png,image/jpeg,application/dicom"
            multiple
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
      </div>

      <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-100 via-white to-slate-100">
        <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
          <color attach="background" args={[slices.length > 0 ? '#111827' : '#f1f8fc']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[3, 4, 5]} intensity={2} />
          <directionalLight position={[-4, 1, -3]} intensity={0.8} color="#93c5fd" />
          {slices.length > 0 ? <SliceStack slices={slices} /> : <LungIllustration />}
          <OrbitControls enablePan enableZoom enableRotate minDistance={2.5} maxDistance={9} />
        </Canvas>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap justify-between gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow">
          <span>
            {slices.length > 0
              ? `Série chargée : ${slices.length} coupe(s)`
              : 'Aperçu illustratif — importe une série d’images locales pour la reconstruire en 3D.'}
          </span>
          <span>Glisser : tourner · molette : zoomer</span>
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      <p className="mt-2 text-xs text-amber-800">
        Cette vue reconstruit un stack 3D à partir d’une série d’images locales (DICOM/PNG/JPG) ; elle est adaptée à la démonstration et à un prototype de simulation 3D, pas à un diagnostic médical.
      </p>
    </section>
  );
}

function LungIllustration() {
  return (
    <group position={[0, -0.05, 0]}>
      <mesh position={[-0.68, -0.05, 0]} scale={[0.72, 1.18, 0.48]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#ef7185" roughness={0.48} />
      </mesh>
      <mesh position={[0.68, -0.05, 0]} scale={[0.72, 1.18, 0.48]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#f28a98" roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.72, 24]} />
        <meshStandardMaterial color="#f5b7a8" roughness={0.4} />
      </mesh>
      <mesh position={[-0.25, 0.48, 0]} rotation={[0, 0, -0.65]}>
        <cylinderGeometry args={[0.09, 0.13, 0.68, 20]} />
        <meshStandardMaterial color="#f5b7a8" roughness={0.4} />
      </mesh>
      <mesh position={[0.25, 0.48, 0]} rotation={[0, 0, 0.65]}>
        <cylinderGeometry args={[0.09, 0.13, 0.68, 20]} />
        <meshStandardMaterial color="#f5b7a8" roughness={0.4} />
      </mesh>
    </group>
  );
}
