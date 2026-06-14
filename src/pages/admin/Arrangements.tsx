import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { Application, ExamRoom, Arrangement, BatchOperationResult, BatchResultItem } from '@/types';

export default function AdminArrangements() {
  const [approvedApps, setApprovedApps] = useState<Application[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<BatchOperationResult | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<Application[]>('/applications?status=approved'),
      api.get<ExamRoom[]>('/exam-rooms'),
      api.get<Arrangement[]>('/arrangements?studentId=&courseId=&examRoomId='),
    ])
      .then(([apps, rms, arrs]) => {
        setApprovedApps(apps);
        setRooms(rms);
        setArrangements(arrs);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const checkConflicts = () => {
    if (!roomId || !examDate || !startTime || !endTime) {
      setConflicts([]);
      return;
    }
    const overlapping = arrangements.filter(
      (a) =>
        a.examRoomId === roomId &&
        a.examDate === examDate &&
        a.status === 'scheduled' &&
        !(endTime <= a.startTime || startTime >= a.endTime)
    );
    if (overlapping.length > 0) {
      setConflicts(
        overlapping.map(
          (a) => `${a.courseName} (${a.startTime}-${a.endTime}) 学生: ${a.studentName}`
        )
      );
    } else {
      setConflicts([]);
    }
  };

  useEffect(() => {
    checkConflicts();
  }, [roomId, examDate, startTime, endTime]);

  const handleSchedule = async () => {
    if (!roomId || !examDate || !startTime || !endTime || selectedAppIds.length === 0) return;
    setSubmitting(true);
    try {
      const result = await api.post<BatchOperationResult>('/arrangements', {
        applicationIds: selectedAppIds,
        examRoomId: roomId,
        examDate,
        startTime,
        endTime,
      });
      setBatchResult(result);
      setShowResultModal(true);
      setShowModal(false);
      setSelectedAppIds([]);
      setRoomId(null);
      setExamDate('');
      setStartTime('');
      setEndTime('');
      setConflicts([]);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelArrangement = async (id: number, reason: string) => {
    try {
      await api.delete(`/arrangements/${id}`, { reason });
      loadData();
    } catch {
      // error handling
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const scheduledAppIds = new Set(arrangements.filter((a) => a.status === 'scheduled').map((a) => a.applicationId));
  const unscheduledApps = approvedApps.filter((a) => !scheduledAppIds.has(a.id));

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
        <h1 className="text-2xl font-bold text-slate-800">考试编排</h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={unscheduledApps.length === 0}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <CalendarPlus size={16} /> 安排考试
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'courseName', title: '课程', sortable: true },
          { key: 'studentName', title: '学生', sortable: true },
          { key: 'examRoomName', title: '考场' },
          { key: 'examDate', title: '日期', sortable: true },
          { key: 'startTime', title: '开始' },
          { key: 'endTime', title: '结束' },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
        ]}
        data={arrangements}
        keyField="id"
        actions={(row) =>
          row.status === 'scheduled' ? (
            <button
              onClick={() => {
                const reason = prompt('请输入取消原因');
                if (reason) handleCancelArrangement(row.id, reason);
              }}
              className="text-red-500 hover:text-red-700 text-sm transition-colors"
            >
              取消
            </button>
          ) : null
        }
      />

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setSelectedAppIds([]); setConflicts([]); }}
        title="安排考试"
        footer={
          <>
            <button
              onClick={() => { setShowModal(false); setSelectedAppIds([]); setConflicts([]); }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSchedule}
              disabled={submitting || selectedAppIds.length === 0 || conflicts.length > 0}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '提交中...' : '确认安排'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">选择学生申请</label>
            <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
              {unscheduledApps.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无可排考的申请</p>
              ) : (
                unscheduledApps.map((app) => (
                  <label key={app.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedAppIds.includes(app.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAppIds([...selectedAppIds, app.id]);
                        } else {
                          setSelectedAppIds(selectedAppIds.filter((id) => id !== app.id));
                        }
                      }}
                      className="rounded text-amber-500 focus:ring-amber-400"
                    />
                    {app.studentName} - {app.courseName}
                  </label>
                ))
              )}
            </div>
            {selectedAppIds.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">已选择 {selectedAppIds.length} 人</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考场</label>
            <select
              value={roomId ?? ''}
              onChange={(e) => setRoomId(Number(e.target.value) || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">请选择考场</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.location}) - 剩余{r.capacity - r.usedSeats}座
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考试日期</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {conflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-600 font-medium text-sm mb-2">
                <AlertTriangle size={16} /> 检测到时间冲突
              </div>
              <ul className="text-sm text-red-500 list-disc list-inside">
                {conflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={showResultModal}
        onClose={() => { setShowResultModal(false); setBatchResult(null); }}
        title="批量排考结果"
        footer={
          <>
            <button
              onClick={() => { setShowResultModal(false); setBatchResult(null); }}
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
