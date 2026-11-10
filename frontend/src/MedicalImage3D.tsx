import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import dicomParser from 'dicom-parser';
import * as THREE from 'three';

type ImageSource = {
  canvas: HTMLCanvasElement;
  name: string;
};

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

function makeReliefGeometry(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Impossible de lire les pixels de cette image.');

  const columns = Math.min(120, canvas.width);
  const rows = Math.min(120, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      const px = Math.min(canvas.width - 1, Math.floor((x / columns) * canvas.width));
      const py = Math.min(canvas.height - 1, Math.floor((y / rows) * canvas.height));
      const offset = (py * canvas.width + px) * 4;
      const luminance = (pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114) / 255;
      positions.push((x / columns - 0.5) * 3, (0.5 - y / rows) * 3, luminance * 0.45);
      uvs.push(x / columns, 1 - y / rows);
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const a = y * (columns + 1) + x;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ImageRelief({ canvas }: { canvas: HTMLCanvasElement }) {
  const geometry = useMemo(() => makeReliefGeometry(canvas), [canvas]);
  const texture = useMemo(() => {
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [canvas]);

  return (
    <mesh geometry={geometry} rotation={[-0.25, 0, 0]}>
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.8} />
    </mesh>
  );
}

async function decodeDicom(file: File): Promise<HTMLCanvasElement> {
  const bytes = new Uint8Array(await file.arrayBuffer());
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
  return canvas;
}

async function decodeImage(file: File): Promise<HTMLCanvasElement> {
  if (file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom') {
    return decodeDicom(file);
  }
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Format non pris en charge. Choisissez une image PNG, JPG/JPEG ou un DICOM monochrome non compressé.');
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
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function MedicalImage3D() {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setLoading(true);
    try {
      const canvas = await decodeImage(file);
      setSource({ canvas, name: file.name });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de traiter ce fichier.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Visualisation 3D</h3>
          <p className="text-xs text-slate-500">Importez une image pour créer un relief 3D interactif.</p>
        </div>
        <label className="cursor-pointer rounded-xl bg-medical-500 px-4 py-2 text-sm font-medium text-white hover:bg-medical-700">
          {loading ? 'Traitement…' : 'Choisir une image'}
          <input
            className="sr-only"
            type="file"
            accept=".png,.jpg,.jpeg,.dcm,image/png,image/jpeg,application/dicom"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
      </div>

      <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-100 via-white to-slate-100">
        <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
          <color attach="background" args={[source ? '#111827' : '#f1f8fc']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[3, 4, 5]} intensity={2} />
          <directionalLight position={[-4, 1, -3]} intensity={0.8} color="#93c5fd" />
          {source ? <ImageRelief canvas={source.canvas} /> : <LungIllustration />}
          <OrbitControls enablePan enableZoom enableRotate minDistance={2.5} maxDistance={9} />
        </Canvas>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap justify-between gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow">
          <span>{source ? `Relief dérivé de : ${source.name}` : 'Aperçu illustratif — importez une image pour la convertir en relief 3D.'}</span>
          <span>Glisser : tourner · molette : zoomer</span>
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-2 text-xs text-amber-800">
        Le relief traduit la luminosité de l’image, ce n’est pas une reconstruction anatomique ni une segmentation médicale. Pour reconstruire un volume pulmonaire, il faut une série CT/DICOM complète ou un volume NIfTI et un traitement de segmentation dédié.
      </p>
    </section>
  );
}
