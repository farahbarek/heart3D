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

const chartData = [
  { name: 'Jan', volume: 40 },
  { name: 'Feb', volume: 52 },
  { name: 'Mar', volume: 49 },
  { name: 'Apr', volume: 63 },
  { name: 'May', volume: 71 },
  { name: 'Jun', volume: 68 },
];

export default function App() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth({ status: 'offline', service: 'backend not running' }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed left-0 top-0 h-screen w-72 bg-medical-900 text-white p-6">
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
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">3D respiratory model preview</p>
                <h3 className="text-xl font-semibold">Lung anatomy</h3>
              </div>
              <button className="rounded-xl bg-medical-500 px-4 py-2 text-white">Run simulation</button>
            </div>
            <div className="h-72 rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-100 via-white to-slate-100 flex items-center justify-center">
              <div className="flex h-48 w-48 items-center justify-center rounded-full border-8 border-sky-300 bg-sky-200/50 shadow-inner text-xl font-bold text-medical-700">
                3D
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">Processing pipeline</p>
            <div className="mt-4 space-y-4">
              {['Patient intake', 'CT import', 'Segmentation', '3D reconstruction', 'Respiratory motion'].map((step, idx) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medical-100 text-sm font-semibold text-medical-700">
                    {idx + 1}
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-slate-100">
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
