import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, CheckCheck } from 'lucide-react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { Application, BatchOperationResult, BatchResultItem } from '@/types';

export default function AdminApplications() {
  const [data, setData] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<'approve' | 'reject' | 'batch-approve' | 'batch-reject' | 'batch-result' | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchOperationResult | null>(null);

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
      setSelectedIds([]);
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
      setSelectedIds([]);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      const result = await api.post<BatchOperationResult>('/applications/batch-approve', { ids: selectedIds });
      setBatchResult(result);
      setModalType('batch-result');
      setSelectedIds([]);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedIds.length === 0 || !reason) return;
    setSubmitting(true);
    try {
      const result = await api.post<BatchOperationResult>('/applications/batch-reject', { ids: selectedIds, reason });
      setBatchResult(result);
      setModalType('batch-result');
      setSelectedIds([]);
      setReason('');
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = data.filter((a) => a.status === 'pending').length;
  const selectedPendingIds = selectedIds.filter((id) => data.find((a) => a.id === id)?.status === 'pending');

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const renderBatchResult = () => {
    if (!batchResult) return null;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{batchResult.success}</div>
            <div className="text-xs text-green-600">成功</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{batchResult.skipped}</div>
            <div className="text-xs text-yellow-600">跳过</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{batchResult.failed}</div>
            <div className="text-xs text-red-600">失败</div>
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">申请ID</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">说明</th>
              </tr>
            </thead>
            <tbody>
              {batchResult.details.map((d: BatchResultItem) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">#{d.id}</td>
                  <td className="px-3 py-2">
                    {d.status === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} />成功</span>}
                    {d.status === 'skipped' && <span className="text-yellow-600 flex items-center gap-1"><AlertCircle size={14} />跳过</span>}
                    {d.status === 'failed' && <span className="text-red-600 flex items-center gap-1"><XCircle size={14} />失败</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{d.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">申请审核</h1>
        {selectedPendingIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">已选 {selectedPendingIds.length} 条待审核</span>
            <button
              onClick={() => setModalType('batch-approve')}
              disabled={submitting}
              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <CheckCheck size={16} /> 批量通过
            </button>
            <button
              onClick={() => { setModalType('batch-reject'); setReason(''); }}
              disabled={submitting}
              className="flex items-center gap-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <XCircle size={16} /> 批量拒绝
            </button>
          </div>
        )}
      </div>

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
        selectable
        selectedIds={selectedIds}
        onSelectionChange={(ids) => setSelectedIds(ids)}
        isRowSelectable={(row) => row.status === 'pending'}
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

      <div className="text-xs text-slate-400">共 {pendingCount} 条待审核申请</div>

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

      <Modal
        open={modalType === 'batch-approve'}
        onClose={() => { setModalType(null); }}
        title="批量通过申请"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleBatchApprove}
              disabled={submitting}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '处理中...' : '确认批量通过'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          确认批量通过 <strong>{selectedPendingIds.length}</strong> 条申请？
        </p>
        <p className="text-xs text-slate-400 mt-1">已被其他教务处理的申请将自动跳过，不会报错。</p>
      </Modal>

      <Modal
        open={modalType === 'batch-reject'}
        onClose={() => { setModalType(null); }}
        title="批量拒绝申请"
        footer={
          <>
            <button
              onClick={() => setModalType(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleBatchReject}
              disabled={submitting || !reason}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '处理中...' : '确认批量拒绝'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">
          批量拒绝 <strong>{selectedPendingIds.length}</strong> 条申请
        </p>
        <p className="text-xs text-slate-400 mb-2">已被其他教务处理的申请将自动跳过，不会报错。</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">统一拒绝原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="请输入拒绝原因（将用于所有选中的申请）"
        />
      </Modal>

      <Modal
        open={modalType === 'batch-result'}
        onClose={() => { setModalType(null); setBatchResult(null); }}
        title="批量操作结果"
        footer={
          <>
            <button
              onClick={() => { setModalType(null); setBatchResult(null); }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium"
            >
              关闭
            </button>
          </>
        }
      >
        {renderBatchResult()}
      </Modal>
    </div>
  );
}
