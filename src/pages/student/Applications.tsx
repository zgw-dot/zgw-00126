import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { Qualification, Application } from '@/types';

export default function StudentApplications() {
  const { user } = useAuthStore();
  const [applications, setApplications] = useState<Application[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      api.get<Application[]>(`/applications?studentId=${user.id}`),
      api.get<Qualification[]>(`/qualifications?studentId=${user.id}&status=active`),
    ])
      .then(([apps, qs]) => {
        setApplications(apps);
        setQualifications(qs.filter((q) => q.qualified));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleApply = async () => {
    if (!selectedCourse) return;
    setSubmitting(true);
    try {
      await api.post('/applications', { courseId: selectedCourse });
      setShowNew(false);
      setSelectedCourse(null);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id: number) => {
    try {
      await api.delete(`/applications/${id}`);
      loadData();
    } catch {
      // error handling
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const appliedCourseIds = applications.map((a) => a.courseId);
  const availableCourses = qualifications.filter(
    (q) => !appliedCourseIds.includes(q.courseId)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">补考申请</h1>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> 新建申请
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'courseName', title: '课程名称', sortable: true },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
          { key: 'rejectReason', title: '拒绝原因', render: (row) => row.rejectReason || '-' },
          { key: 'createdAt', title: '申请时间', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
        ]}
        data={applications}
        keyField="id"
        actions={(row) =>
          row.status === 'pending' ? (
            <button
              onClick={() => handleWithdraw(row.id)}
              className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm transition-colors"
            >
              <X size={14} /> 撤回
            </button>
          ) : null
        }
      />

      <Modal
        open={showNew}
        onClose={() => { setShowNew(false); setSelectedCourse(null); }}
        title="新建补考申请"
        footer={
          <>
            <button
              onClick={() => { setShowNew(false); setSelectedCourse(null); }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedCourse || submitting}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? '提交中...' : '提交'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">选择课程</label>
          {availableCourses.length === 0 ? (
            <p className="text-sm text-slate-400">没有可申请的补考课程</p>
          ) : (
            <select
              value={selectedCourse ?? ''}
              onChange={(e) => setSelectedCourse(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">请选择课程</option>
              {availableCourses.map((q) => (
                <option key={q.courseId} value={q.courseId}>
                  {q.courseName}
                </option>
              ))}
            </select>
          )}
        </div>
      </Modal>
    </div>
  );
}
