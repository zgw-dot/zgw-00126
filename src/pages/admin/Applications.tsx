import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { Application } from '@/types';

export default function AdminApplications() {
  const [data, setData] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<'approve' | 'reject' | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    api
      .get<Application[]>('/applications?studentId=&status=')
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/applications/${selected.id}/approve`, {});
      setModalType(null);
      setSelected(null);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/applications/${selected.id}/reject`, { reason });
      setModalType(null);
      setSelected(null);
      setReason('');
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">申请审核</h1>

      <DataTable
        columns={[
          { key: 'studentName', title: '学生', sortable: true },
          { key: 'courseName', title: '课程', sortable: true },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
          { key: 'rejectReason', title: '拒绝原因', render: (row) => row.rejectReason || '-' },
          { key: 'createdAt', title: '申请时间', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
        ]}
        data={data}
        keyField="id"
        actions={(row) => {
          if (row.status !== 'pending') return null;
          return (
            <div className="flex gap-2">
              <button
                onClick={() => { setSelected(row); setModalType('approve'); }}
                className="text-green-600 hover:text-green-800 text-sm transition-colors"
              >
                通过
              </button>
              <button
                onClick={() => { setSelected(row); setModalType('reject'); setReason(''); }}
                className="text-red-500 hover:text-red-700 text-sm transition-colors"
              >
                拒绝
              </button>
            </div>
          );
        }}
      />

      <Modal
        open={modalType === 'approve'}
        onClose={() => { setModalType(null); setSelected(null); }}
        title="通过申请"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '处理中...' : '确认通过'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          确认通过 <strong>{selected?.studentName}</strong> 的 <strong>{selected?.courseName}</strong> 补考申请？
        </p>
      </Modal>

      <Modal
        open={modalType === 'reject'}
        onClose={() => { setModalType(null); setSelected(null); }}
        title="拒绝申请"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleReject}
              disabled={submitting || !reason}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '处理中...' : '确认拒绝'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          拒绝 <strong>{selected?.studentName}</strong> 的 <strong>{selected?.courseName}</strong> 补考申请
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">拒绝原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="请输入拒绝原因"
        />
      </Modal>
    </div>
  );
}
