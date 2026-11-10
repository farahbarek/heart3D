import { Suspense, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TextureLoader } from 'three';
import * as THREE from 'three';

type Slice = {
  file_name: string;
  position: number;
  image_data: string;
};

type SeriesResponse = {
  series_id: string;
  series_number: string;
  series_description: string;
  file_count: number;
  dimensions: number[];
  spacing_mm: number[];
  slices: Slice[];
};

type SeriesUploadResponse = {
  series: SeriesResponse[];
  notice: string;
};

function SlicePlane({
  slice,
  width,
  height,
  z,
}: {
  slice: Slice;
  width: number;
  height: number;
  z: number;
}) {
  const texture = useLoader(TextureLoader, slice.image_data);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SliceStack({ series }: { series: SeriesResponse }) {
  const [columns, rows] = series.dimensions;
  const [rowSpacing, columnSpacing, sliceSpacing] = series.spacing_mm;
  const imageWidth = columns * columnSpacing;
  const imageHeight = rows * rowSpacing;
  const positions = series.slices.map((slice) => slice.position);
  const firstPosition = Math.min(...positions);
  const lastPosition = Math.max(...positions);
  const depth = Math.max(lastPosition - firstPosition, sliceSpacing);
  const scale = 2.8 / Math.max(imageWidth, imageHeight, depth);
  const centerPosition = (firstPosition + lastPosition) / 2;

  return (
    <group>
      {series.slices.map((slice, index) => (
        <Suspense key={`${slice.file_name}-${index}`} fallback={null}>
          <SlicePlane
            slice={slice}
            width={imageWidth * scale}
            height={imageHeight * scale}
            z={(slice.position - centerPosition) * scale}
          />
        </Suspense>
      ))}
    </group>
  );
}

function Placeholder() {
  return (
    <group>
      <mesh scale={[1, 1.4, 0.55]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#f28a98" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.8, 20]} />
        <meshStandardMaterial color="#f5b7a8" />
      </mesh>
    </group>
  );
}

export default function MedicalImage3D() {
  const [seriesList, setSeriesList] = useState<SeriesResponse[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const series = seriesList.find((item) => item.series_id === selectedSeriesId) ?? null;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;

    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/imaging/series', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.detail === 'string' ? result.detail : 'Échec de l’import de la série.');
      }
      const uploadedSeries = (result as SeriesUploadResponse).series;
      setSeriesList(uploadedSeries);
      setSelectedSeriesId(uploadedSeries[0]?.series_id ?? '');
    } catch (reason) {
      setSeriesList([]);
      setSelectedSeriesId('');
      setError(reason instanceof Error ? reason.message : 'Impossible de contacter le backend. Vérifie qu’il est démarré.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Visualisation 3D</h3>
          <p className="text-xs text-slate-500">Importe des coupes DICOM du même organe, même si elles viennent de séries différentes.</p>
        </div>
        <label className="cursor-pointer rounded-xl bg-medical-500 px-4 py-2 text-sm font-medium text-white hover:bg-medical-700">
          {loading ? 'Import en cours…' : 'Choisir des fichiers DICOM'}
          <input
            className="sr-only"
            type="file"
            accept=".dcm,application/dicom"
            multiple
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
      </div>

      <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
        <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
          <color attach="background" args={['#111827']} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 4, 5]} intensity={1.5} />
          {series ? <SliceStack series={series} /> : <Placeholder />}
          <OrbitControls />
        </Canvas>
        {seriesList.length > 1 && (
          <label className="absolute right-3 top-3 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">
            Série
            <select
              aria-label="Série DICOM affichée"
              className="max-w-56 bg-transparent font-medium text-slate-900 outline-none"
              value={selectedSeriesId}
              onChange={(event) => setSelectedSeriesId(event.target.value)}
            >
              {seriesList.map((item, index) => (
                <option key={item.series_id} value={item.series_id}>
                  {item.series_number ? `N° ${item.series_number} · ` : `Série ${index + 1} · `}
                  {item.series_description || `${item.file_count} coupes`}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow">
          {series
            ? `${series.file_count} coupe(s) · dimensions ${series.dimensions.join(' × ')} · espacement ${series.spacing_mm.map((n) => n.toFixed(2)).join(' × ')} mm`
            : 'Sélectionne des fichiers DICOM du même organe.'}
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {series && <p className="mt-2 text-xs text-slate-500">{seriesList.length} série(s) importée(s). Affichage : {series.series_description || series.series_id}. Fais glisser pour tourner et utilise la molette pour zoomer.</p>}
      <p className="mt-2 text-xs text-amber-800">Prototype de visualisation des coupes DICOM empilées ; il ne réalise pas de segmentation ni de diagnostic médical.</p>
    </section>
  );
}
