import type { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  value: number | string;
  label: string;
  accent?: string;
}

export default function StatsCard({ icon, value, label, accent = 'bg-amber-500' }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg p-5 shadow-sm border border-slate-200 flex items-center gap-4">
      <div className={`${accent} text-white p-3 rounded-lg`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}
