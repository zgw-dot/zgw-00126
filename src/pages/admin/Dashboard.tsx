import { useEffect, useState } from 'react';
import { ClipboardList, Calendar, AlertTriangle } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import Badge from '@/components/Badge';
import { api } from '@/utils/api';
import type { Application, Arrangement, ExamRoom } from '@/types';

interface AuditLog {
  id: number;
  action: string;
  user: string;
  detail: string;
  time: string;
}

export default function AdminDashboard() {
  const [pendingCount, setPendingCount] = useState(0);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Application[]>('/applications?status=pending'),
      api.get<Arrangement[]>('/arrangements?courseId='),
      api.get<ExamRoom[]>('/exam-rooms'),
    ])
      .then(([apps, arrs, rooms]) => {
        setPendingCount(apps.length);
        setScheduledCount(arrs.filter((a) => a.status === 'scheduled').length);
        setWarnings(rooms.filter((r) => r.usedSeats / r.capacity >= 0.9).length);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">教务管理仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          icon={<ClipboardList size={24} />}
          value={pendingCount}
          label="待审核申请"
          accent="bg-amber-500"
        />
        <StatsCard
          icon={<Calendar size={24} />}
          value={scheduledCount}
          label="已安排考试"
          accent="bg-blue-500"
        />
        <StatsCard
          icon={<AlertTriangle size={24} />}
          value={warnings}
          label="考场容量预警"
          accent="bg-red-500"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">最近操作日志</h2>
        {recentLogs.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无操作日志</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <Badge variant="active" label={log.action} />
                  <span className="text-sm text-slate-600">{log.detail}</span>
                </div>
                <span className="text-xs text-slate-400">{new Date(log.time).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
