import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { Qualification } from '@/types';

export default function AdminQualifications() {
  const [data, setData] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<'override' | 'cancel' | null>(null);
  const [selected, setSelected] = useState<Qualification | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    api
      .get<Qualification[]>('/qualifications?studentId=&courseId=&status=')
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOverride = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/qualifications/${selected.id}/override`, {
        qualified: !selected.qualified,
        reason,
      });
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

  const handleCancel = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/qualifications/${selected.id}/cancel`, { reason });
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
      <h1 className="text-2xl font-bold text-slate-800">资格管理</h1>

      <DataTable
        columns={[
          { key: 'studentName', title: '学生', sortable: true },
          { key: 'courseName', title: '课程', sortable: true },
          { key: 'qualified', title: '是否合格', render: (row) => (
            <Badge variant={row.qualified ? 'active' : 'rejected'} label={row.qualified ? '合格' : '不合格'} />
          )},
          { key: 'source', title: '来源', render: (row) => <Badge variant={row.source} /> },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
          { key: 'reason', title: '原因', render: (row) => row.reason || '-' },
          { key: 'updatedAt', title: '更新时间', sortable: true, render: (row) => new Date(row.updatedAt).toLocaleString() },
        ]}
        data={data}
        keyField="id"
        actions={(row) => (
          <div className="flex gap-2">
            <button
              onClick={() => { setSelected(row); setModalType('override'); setReason(''); }}
              className="text-purple-600 hover:text-purple-800 text-sm transition-colors"
            >
              覆盖
            </button>
            {row.status !== 'cancelled' && (
              <button
                onClick={() => { setSelected(row); setModalType('cancel'); setReason(''); }}
                className="text-red-500 hover:text-red-700 text-sm transition-colors"
              >
                取消
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalType === 'override'}
        onClose={() => { setModalType(null); setSelected(null); }}
        title="覆盖资格"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleOverride}
              disabled={submitting || !reason}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '提交中...' : '确认覆盖'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          将 <strong>{selected?.studentName}</strong> 的 <strong>{selected?.courseName}</strong> 资格从
          <strong>{selected?.qualified ? '合格' : '不合格'}</strong> 更改为
          <strong>{selected?.qualified ? '不合格' : '合格'}</strong>
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">覆盖原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="请输入覆盖原因"
        />
      </Modal>

      <Modal
        open={modalType === 'cancel'}
        onClose={() => { setModalType(null); setSelected(null); }}
        title="取消资格"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting || !reason}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '提交中...' : '确认取消'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          取消 <strong>{selected?.studentName}</strong> 的 <strong>{selected?.courseName}</strong> 补考资格
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">取消原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="请输入取消原因"
        />
      </Modal>
    </div>
  );
}
