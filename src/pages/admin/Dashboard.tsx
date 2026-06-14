import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Calendar, AlertTriangle, Undo2, Info, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { Application, Arrangement, ExamRoom, OperationSnapshot, Pagination } from '@/types';

const operationTypeLabels: Record<string, string> = {
  override_qualification: '覆盖资格',
  approve_application: '审批通过',
  reject_application: '拒绝申请',
  create_arrangement: '创建排考',
  update_threshold: '修改阈值',
  import_grades: '导入成绩',
};

const operationTypeBadge: Record<string, 'approved' | 'rejected' | 'overridden' | 'scheduled' | 'pending'> = {
  override_qualification: 'overridden',
  approve_application: 'approved',
  reject_application: 'rejected',
  create_arrangement: 'scheduled',
  update_threshold: 'pending',
  import_grades: 'pending',
};

const typeFilterOptions = [
  { value: '', label: '全部类型' },
  { value: 'override_qualification', label: '覆盖资格' },
  { value: 'approve_application', label: '审批通过' },
  { value: 'reject_application', label: '拒绝申请' },
  { value: 'create_arrangement', label: '创建排考' },
  { value: 'update_threshold', label: '修改阈值' },
  { value: 'import_grades', label: '导入成绩' },
];

function getSnapshotPreview(op: OperationSnapshot): string[] {
  const data = op.snapshotData;
  const fields: string[] = [];

  switch (op.operationType) {
    case 'override_qualification': {
      const orig = (data.originalQualification as Record<string, unknown>) || {};
      fields.push(`学生ID: ${orig.student_id ?? '-'}`);
      fields.push(`课程ID: ${orig.course_id ?? '-'}`);
      fields.push(`原状态: ${orig.status ?? '-'}`);
      fields.push(`原资格: ${orig.qualified ? '有资格' : '无资格'}`);
      fields.push(`原来源: ${orig.source ?? '-'}`);
      break;
    }
    case 'approve_application':
    case 'reject_application': {
      const app = (data.application as Record<string, unknown>) || {};
      fields.push(`学生ID: ${app.student_id ?? '-'}`);
      fields.push(`课程ID: ${app.course_id ?? '-'}`);
      fields.push(`原状态: ${app.status ?? '-'}`);
      break;
    }
    case 'create_arrangement': {
      const arr = (data.arrangement as Record<string, unknown>) || {};
      fields.push(`学生ID: ${arr.student_id ?? '-'}`);
      fields.push(`课程ID: ${arr.course_id ?? '-'}`);
      fields.push(`考试日期: ${arr.exam_date ?? '-'}`);
      fields.push(`时间: ${arr.start_time ?? '-'} - ${arr.end_time ?? '-'}`);
      break;
    }
    case 'update_threshold': {
      fields.push(`原阈值: ${data.oldScore ?? '-'}`);
      fields.push(`新阈值: ${data.newScore ?? '-'}`);
      break;
    }
    case 'import_grades': {
      fields.push(`导入前成绩: ${data.gradeCount ?? 0} 条`);
      fields.push(`导入前资格: ${data.qualCount ?? 0} 条`);
      break;
    }
  }

  return fields;
}

export default function AdminDashboard() {
  const [pendingCount, setPendingCount] = useState(0);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [operations, setOperations] = useState<OperationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedOp, setSelectedOp] = useState<OperationSnapshot | null>(null);
  const [reverting, setReverting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const loadStats = useCallback(() => {
    Promise.all([
      api.get<Application[]>('/applications?status=pending'),
      api.get<Arrangement[]>('/arrangements?courseId='),
      api.get<ExamRoom[]>('/exam-rooms'),
    ]).then(([apps, arrs, rooms]) => {
      setPendingCount(apps.length);
      setScheduledCount(arrs.filter((a) => a.status === 'scheduled').length);
      setWarnings(rooms.filter((r) => (r.usedSeats || 0) / (r.capacity || 1) >= 0.9).length);
    });
  }, []);

  const loadOperations = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '20', page: String(page) });
    if (typeFilter) {
      params.set('type', typeFilter);
    }
    api.get<{ items: OperationSnapshot[]; pagination: Pagination }>(`/operations?${params.toString()}`)
      .then((res) => {
        setOperations(res.items);
        setPagination(res.pagination);
      })
      .finally(() => setLoading(false));
  }, [page, typeFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleRevert = (op: OperationSnapshot) => {
    setSelectedOp(op);
    setConfirmOpen(true);
  };

  const confirmRevert = async () => {
    if (!selectedOp) return;
    setReverting(true);
    try {
      await api.post(`/operations/${selectedOp.id}/revert`);
      setConfirmOpen(false);
      setSelectedOp(null);
      loadOperations();
      loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : '撤销失败');
    } finally {
      setReverting(false);
    }
  };

  if (loading && operations.length === 0) return <div className="text-center py-12 text-slate-400">加载中...</div>;

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">操作记录</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => handleTypeFilterChange(e.target.value)}
                className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                {typeFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Info size={14} />
              <span>悬停查看详情</span>
            </div>
          </div>
        </div>

        {operations.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无操作记录</p>
        ) : (
          <div className="space-y-2">
            {operations.map((op) => (
              <div
                key={op.id}
                className="group relative flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge
                    variant={operationTypeBadge[op.operationType] || 'pending'}
                    label={operationTypeLabels[op.operationType] || op.operationType}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 truncate">
                      {op.targetType} #{op.targetId}
                    </div>
                    <div className="text-xs text-slate-400">
                      操作人: {op.operatorName || '-'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(op.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleRevert(op)}
                  disabled={op.reverted}
                  className={`ml-3 p-1.5 rounded-md transition-colors flex-shrink-0 ${
                    op.reverted
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                  }`}
                  title={op.reverted ? '已撤销' : '撤销此操作'}
                >
                  <Undo2 size={16} />
                </button>

                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-10 hidden group-hover:block pointer-events-none">
                  <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-nowrap">
                    <div className="font-medium mb-1">快照详情</div>
                    {getSnapshotPreview(op).map((field, i) => (
                      <div key={i} className="text-slate-300">{field}</div>
                    ))}
                    {op.reverted && (
                      <div className="text-amber-400 mt-1">已撤销</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              共 {pagination.total} 条记录，第 {pagination.page}/{pagination.totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                    acc.push('...');
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  typeof p === 'string' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] h-7 rounded-md text-xs transition-colors ${
                        p === page
                          ? 'bg-amber-500 text-white font-medium'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !reverting && setConfirmOpen(false)}
        title="确认撤销"
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={reverting}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={confirmRevert}
              disabled={reverting}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {reverting ? '撤销中...' : '确认撤销'}
            </button>
          </>
        }
      >
        {selectedOp && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              确定要撤销以下操作吗？此操作将级联影响相关数据。
            </p>
            <div className="bg-slate-50 rounded-md p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">操作类型</span>
                <span className="font-medium">{operationTypeLabels[selectedOp.operationType] || selectedOp.operationType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">目标</span>
                <span className="font-medium">{selectedOp.targetType} #{selectedOp.targetId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">操作时间</span>
                <span className="font-medium">{new Date(selectedOp.createdAt).toLocaleString()}</span>
              </div>
            </div>
            {getSnapshotPreview(selectedOp).length > 0 && (
              <div className="bg-amber-50 rounded-md p-3 space-y-1">
                <div className="text-xs font-medium text-amber-700 mb-1">快照详情</div>
                {getSnapshotPreview(selectedOp).map((field, i) => (
                  <div key={i} className="text-xs text-amber-600">{field}</div>
                ))}
              </div>
            )}
            <p className="text-xs text-amber-600">
              ⚠ 撤销后相关的申请和排考也会被级联取消
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
