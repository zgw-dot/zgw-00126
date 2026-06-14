interface CapacityBarProps {
  used: number;
  capacity: number;
}

export default function CapacityBar({ used, capacity }: CapacityBarProps) {
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const color =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';
  const textColor =
    pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-200 rounded-full h-2.5">
        <div
          className={`${color} h-2.5 rounded-full transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${textColor} whitespace-nowrap`}>
        {used}/{capacity} ({pct}%)
      </span>
    </div>
  );
}
