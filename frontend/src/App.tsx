import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const chartData = [
  { name: 'Jan', volume: 40 },
  { name: 'Feb', volume: 52 },
  { name: 'Mar', volume: 49 },
  { name: 'Apr', volume: 63 },
  { name: 'May', volume: 71 },
  { name: 'Jun', volume: 68 },
];

function LungModel() {
  return (
    <group position={[0, -0.05, 0]}>
      {/* Illustrative lung-shaped forms, not reconstructed from a patient scan. */}
      <mesh position={[-0.68, -0.05, 0]} scale={[0.72, 1.18, 0.48]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#ef7185" roughness={0.48} />
      </mesh>
      <mesh position={[0.68, -0.05, 0]} scale={[0.72, 1.18, 0.48]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color="#f28a98" roughness={0.48} />
      </mesh>

      {/* Trachea and main bronchi are diagrammatic details. */}
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

function LungViewer() {
  return (
    <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-100 via-white to-slate-100">
      <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={['#f1f8fc']} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 4, 5]} intensity={2} />
        <directionalLight position={[-4, 1, -3]} intensity={0.8} color="#93c5fd" />
        <LungModel />
        <OrbitControls enablePan enableZoom enableRotate minDistance={2.8} maxDistance={8} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow">
        Modèle 3D illustratif · glisser pour tourner · molette pour zoomer
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('Backend unavailable');
        return res.json();
      })
      .then((data) => setHealth(data))
      .catch(() => setHealth({ status: 'offline', service: 'backend not running' }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed left-0 top-0 h-screen w-72 bg-medical-900 p-6 text-white">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Medical AI</p>
          <h1 className="mt-2 text-2xl font-semibold">Digital Twin</h1>
        </div>
        <nav className="space-y-2">
          {['Dashboard', 'Patients', 'Medical Imaging', 'AI Segmentation', '3D Reconstruction', 'Digital Twin Simulation', 'Results & Reports', 'Settings'].map((item, index) => (
            <button
              key={item}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${index === 0 ? 'bg-medical-700' : 'bg-slate-800/40 hover:bg-slate-800'}`}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="ml-72 p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Clinical data platform</p>
            <h2 className="text-3xl font-semibold">Pulmonary Digital Twin</h2>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {health?.status || 'Checking backend...'}
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-4">
          {[
            { label: 'Patients', value: '128', trend: '+12%' },
            { label: 'Digital twins', value: '42', trend: '+8%' },
            { label: 'Simulations', value: '96', trend: '+15%' },
            { label: 'AI status', value: 'Healthy', trend: 'Online' },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl bg-white p-5 shadow-soft">
              <p className="text-sm text-slate-500">{card.label}</p>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-3xl font-bold">{card.value}</span>
                <span className="text-sm text-emerald-600">{card.trend}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-soft">
            <div className="mb-4">
              <p className="text-sm text-slate-500">Aperçu anatomique interactif</p>
              <h3 className="text-xl font-semibold">Poumons — vue 3D</h3>
            </div>
            <LungViewer />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">Processing pipeline</p>
            <div className="mt-4 space-y-4">
              {['Patient intake', 'CT import', 'Segmentation', '3D reconstruction', 'Respiratory motion'].map((step, idx) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medical-100 text-sm font-semibold text-medical-700">
                    {idx + 1}
                  </div>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${idx < 4 ? 'w-full bg-medical-500' : 'w-1/3 bg-slate-200'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-soft">
          <p className="text-sm text-slate-500">Respiratory metrics</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="volume" stroke="#2563eb" fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </main>
    </div>
  );
}
