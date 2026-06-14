import { useEffect, useState } from 'react';
import { Award, FileText, Calendar } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import Badge from '@/components/Badge';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { Qualification, Application, Arrangement } from '@/types';

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Qualification[]>(`/qualifications?studentId=${user.id}`),
      api.get<Application[]>(`/applications?studentId=${user.id}`),
      api.get<Arrangement[]>(`/arrangements?studentId=${user.id}`),
    ])
      .then(([qs, apps, arrs]) => {
        setQualifications(qs);
        setApplications(apps);
        setArrangements(arrs);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  const qualifiedCount = qualifications.filter((q) => q.qualified && q.status === 'active').length;
  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const scheduledCount = arrangements.filter((a) => a.status === 'scheduled').length;
  const recentApps = applications.slice(-5).reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">
        你好，{user?.name}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard icon={<Award size={24} />} value={qualifiedCount} label="已获资格课程" accent="bg-green-500" />
        <StatsCard icon={<FileText size={24} />} value={pendingCount} label="待处理申请" accent="bg-amber-500" />
        <StatsCard icon={<Calendar size={24} />} value={scheduledCount} label="已安排考试" accent="bg-blue-500" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">资格列表</h2>
        {qualifications.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无资格记录</p>
        ) : (
          <div className="space-y-2">
            {qualifications.slice(0, 5).map((q) => (
              <div key={q.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                <div>
                  <span className="text-sm font-medium text-slate-700">{q.courseName}</span>
                  <span className="text-xs text-slate-400 ml-2">{q.source === 'auto' ? '自动' : '人工'}</span>
                </div>
                <Badge variant={q.qualified ? 'active' : 'rejected'} label={q.qualified ? '已获资格' : '未获资格'} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">最近申请</h2>
        {recentApps.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无申请记录</p>
        ) : (
          <div className="space-y-2">
            {recentApps.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                <div>
                  <span className="text-sm font-medium text-slate-700">{a.courseName}</span>
                  <span className="text-xs text-slate-400 ml-2">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
                <Badge variant={a.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
