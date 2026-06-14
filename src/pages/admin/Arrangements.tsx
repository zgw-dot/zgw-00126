import { useEffect, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  Trash2,
  Edit3,
  Send,
  RotateCcw,
  Plus,
} from 'lucide-react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type {
  Application,
  ExamRoom,
  Arrangement,
  ArrangementDraft,
  BatchOperationResult,
  BatchResultItem,
  DraftAddResult,
  DraftPublishResult,
} from '@/types';

type TabType = 'scheduled' | 'drafts';

export default function AdminArrangements() {
  const [approvedApps, setApprovedApps] = useState<Application[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [drafts, setDrafts] = useState<ArrangementDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('scheduled');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [addRoomId, setAddRoomId] = useState<number | null>(null);
  const [addExamDate, setAddExamDate] = useState('');
  const [addStartTime, setAddStartTime] = useState('');
  const [addEndTime, setAddEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingDraft, setEditingDraft] = useState<ArrangementDraft | null>(null);
  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [editExamDate, setEditExamDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [addConflicts, setAddConflicts] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<BatchOperationResult | null>(null);
  const [draftAddResult, setDraftAddResult] = useState<DraftAddResult | null>(null);
  const [publishResult, setPublishResult] = useState<DraftPublishResult | null>(null);
  const [resultType, setResultType] = useState<'schedule' | 'draft-add' | 'publish'>('schedule');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<Application[]>('/applications?status=approved'),
      api.get<ExamRoom[]>('/exam-rooms'),
      api.get<Arrangement[]>('/arrangements?studentId=&courseId=&examRoomId='),
      api.get<ArrangementDraft[]>('/arrangements/drafts'),
    ])
      .then(([apps, rms, arrs, drfts]) => {
        setApprovedApps(apps);
        setRooms(rms);
        setArrangements(arrs);
        setDrafts(drfts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const scheduledAppIds = new Set(
    arrangements.filter((a) => a.status === 'scheduled').map((a) => a.applicationId)
  );
  const draftAppIds = new Set(drafts.map((d) => d.applicationId));
  const unscheduledApps = approvedApps.filter(
    (a) => !scheduledAppIds.has(a.id) && !draftAppIds.has(a.id)
  );

  const checkAddConflicts = () => {
    if (!addRoomId || !addExamDate || !addStartTime || !addEndTime) {
      setAddConflicts([]);
      return;
    }
    const overlappingScheduled = arrangements.filter(
      (a) =>
        a.examRoomId === addRoomId &&
        a.examDate === addExamDate &&
        a.status === 'scheduled' &&
        !(addEndTime <= a.startTime || addStartTime >= a.endTime)
    );
    const overlappingDrafts = drafts.filter(
      (d) =>
        d.examRoomId === addRoomId &&
        d.examDate === addExamDate &&
        !(addEndTime <= d.startTime || addStartTime >= d.endTime)
    );
    const conflicts: string[] = [];
    overlappingScheduled.forEach((a) => {
      conflicts.push(
        `[正式] ${a.courseName} (${a.startTime}-${a.endTime}) 学生: ${a.studentName}`
      );
    });
    overlappingDrafts.forEach((d) => {
      conflicts.push(
        `[草稿] ${d.courseName} (${d.startTime}-${d.endTime}) 学生: ${d.studentName}`
      );
    });
    setAddConflicts(conflicts);
  };

  useEffect(() => {
    checkAddConflicts();
  }, [addRoomId, addExamDate, addStartTime, addEndTime]);

  const handleAddToDraft = async () => {
    if (
      !addRoomId ||
      !addExamDate ||
      !addStartTime ||
      !addEndTime ||
      selectedAppIds.length === 0
    )
      return;
    setSubmitting(true);
    try {
      const result = await api.post<DraftAddResult>('/arrangements/drafts/batch-add', {
        applicationIds: selectedAppIds,
        examRoomId: addRoomId,
        examDate: addExamDate,
        startTime: addStartTime,
        endTime: addEndTime,
      });
      setDraftAddResult(result);
      setResultType('draft-add');
      setShowResultModal(true);
      setShowAddModal(false);
      setSelectedAppIds([]);
      setAddRoomId(null);
      setAddExamDate('');
      setAddStartTime('');
      setAddEndTime('');
      setAddConflicts([]);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '添加草稿失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedule = async () => {
    if (
      !addRoomId ||
      !addExamDate ||
      !addStartTime ||
      !addEndTime ||
      selectedAppIds.length === 0
    )
      return;
    setSubmitting(true);
    try {
      const result = await api.post<BatchOperationResult>('/arrangements', {
        applicationIds: selectedAppIds,
        examRoomId: addRoomId,
        examDate: addExamDate,
        startTime: addStartTime,
        endTime: addEndTime,
      });
      setBatchResult(result);
      setResultType('schedule');
      setShowResultModal(true);
      setShowAddModal(false);
      setSelectedAppIds([]);
      setAddRoomId(null);
      setAddExamDate('');
      setAddStartTime('');
      setAddEndTime('');
      setAddConflicts([]);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '排考失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (draft: ArrangementDraft) => {
    setEditingDraft(draft);
    setEditRoomId(draft.examRoomId);
    setEditExamDate(draft.examDate);
    setEditStartTime(draft.startTime);
    setEditEndTime(draft.endTime);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDraft || !editRoomId || !editExamDate || !editStartTime || !editEndTime) return;
    setEditSaving(true);
    try {
      await api.put<ArrangementDraft>(`/arrangements/drafts/${editingDraft.id}`, {
        examRoomId: editRoomId,
        examDate: editExamDate,
        startTime: editStartTime,
        endTime: editEndTime,
      });
      setShowEditModal(false);
      setEditingDraft(null);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemoveDraft = async (id: number) => {
    if (!confirm('确定要移除此草稿项吗？')) return;
    try {
      await api.delete(`/arrangements/drafts/${id}`);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleClearDrafts = async () => {
    if (!confirm('确定要清空所有草稿吗？此操作不可撤销。')) return;
    try {
      await api.delete('/arrangements/drafts');
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '清空失败');
    }
  };

  const handlePublish = async () => {
    if (drafts.length === 0) return;
    setShowPublishConfirm(false);
    setSubmitting(true);
    try {
      const result = await api.post<DraftPublishResult>('/arrangements/drafts/publish');
      setPublishResult(result);
      setResultType('publish');
      setShowResultModal(true);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '发布失败');
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

  const renderBatchResult = () => {
    if (resultType === 'schedule' && batchResult) {
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
                      {d.status === 'success' && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle size={14} />成功
                        </span>
                      )}
                      {d.status === 'skipped' && (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <AlertCircle size={14} />跳过
                        </span>
                      )}
                      {d.status === 'failed' && (
                        <span className="text-red-600 flex items-center gap-1">
                          <XCircle size={14} />失败
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{d.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    if (resultType === 'draft-add' && draftAddResult) {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{draftAddResult.added}</div>
              <div className="text-xs text-green-600">已添加</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{draftAddResult.skipped}</div>
              <div className="text-xs text-yellow-600">跳过</div>
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
                {draftAddResult.details.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">#{d.applicationId}</td>
                    <td className="px-3 py-2">
                      {d.status === 'added' && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle size={14} />已添加
                        </span>
                      )}
                      {d.status === 'skipped' && (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <AlertCircle size={14} />跳过
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{d.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    if (resultType === 'publish' && publishResult) {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{publishResult.published}</div>
              <div className="text-xs text-green-600">已发布</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{publishResult.skipped}</div>
              <div className="text-xs text-yellow-600">跳过</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{publishResult.failed}</div>
              <div className="text-xs text-red-600">失败</div>
            </div>
          </div>
          {publishResult.failed > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <div className="font-medium flex items-center gap-2">
                <AlertTriangle size={16} />
                发布前检查发现冲突，草稿已保留，请修正后重试
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">说明</th>
                </tr>
              </thead>
              <tbody>
                {publishResult.details.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">#{d.id}</td>
                    <td className="px-3 py-2">
                      {d.status === 'success' && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle size={14} />成功
                        </span>
                      )}
                      {d.status === 'skipped' && (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <AlertCircle size={14} />跳过
                        </span>
                      )}
                      {d.status === 'failed' && (
                        <span className="text-red-600 flex items-center gap-1">
                          <XCircle size={14} />失败
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{d.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">考试编排</h1>
        <div className="flex gap-2">
          {activeTab === 'drafts' && (
            <>
              <button
                onClick={handleClearDrafts}
                disabled={drafts.length === 0}
                className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RotateCcw size={16} /> 清空草稿
              </button>
              <button
                onClick={() => setShowPublishConfirm(true)}
                disabled={drafts.length === 0}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Send size={16} /> 确认发布 ({drafts.length})
              </button>
            </>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            disabled={unscheduledApps.length === 0}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <CalendarPlus size={16} />{' '}
            {activeTab === 'drafts' ? '加入草稿' : '安排考试'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'scheduled'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={16} className="inline mr-1" />
          正式安排 ({arrangements.filter((a) => a.status === 'scheduled').length})
        </button>
        <button
          onClick={() => setActiveTab('drafts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'drafts'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Edit3 size={16} className="inline mr-1" />
          排考草稿 ({drafts.length})
        </button>
      </div>

      {activeTab === 'scheduled' && (
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
      )}

      {activeTab === 'drafts' && (
        <div>
          {drafts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Edit3 size={48} className="mx-auto mb-3 opacity-30" />
              <p>暂无排考草稿</p>
              <p className="text-sm mt-1">点击右上角"加入草稿"开始预排方案</p>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'courseName', title: '课程', sortable: true },
                { key: 'studentName', title: '学生', sortable: true },
                { key: 'examRoomName', title: '考场' },
                { key: 'examDate', title: '日期', sortable: true },
                { key: 'startTime', title: '开始' },
                { key: 'endTime', title: '结束' },
              ]}
              data={drafts}
              keyField="id"
              actions={(row) => (
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(row as ArrangementDraft)}
                    className="text-amber-500 hover:text-amber-700 text-sm transition-colors flex items-center gap-1"
                  >
                    <Edit3 size={14} /> 修改
                  </button>
                  <button
                    onClick={() => handleRemoveDraft((row as ArrangementDraft).id)}
                    className="text-red-500 hover:text-red-700 text-sm transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} /> 移除
                  </button>
                </div>
              )}
            />
          )}
        </div>
      )}

      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedAppIds([]);
          setAddConflicts([]);
        }}
        title={activeTab === 'drafts' ? '加入草稿' : '安排考试'}
        footer={
          <>
            <button
              onClick={() => {
                setShowAddModal(false);
                setSelectedAppIds([]);
                setAddConflicts([]);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={activeTab === 'drafts' ? handleAddToDraft : handleSchedule}
              disabled={
                submitting ||
                selectedAppIds.length === 0 ||
                addConflicts.length > 0 ||
                !addRoomId ||
                !addExamDate ||
                !addStartTime ||
                !addEndTime
              }
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting
                ? '提交中...'
                : activeTab === 'drafts'
                ? '加入草稿'
                : '确认安排'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              选择学生申请
              <span className="text-slate-400 font-normal ml-2">
                已选 {selectedAppIds.length} 人
              </span>
            </label>
            <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
              {unscheduledApps.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无可排考的申请</p>
              ) : (
                unscheduledApps.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50"
                  >
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
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考场</label>
            <select
              value={addRoomId ?? ''}
              onChange={(e) => setAddRoomId(Number(e.target.value) || null)}
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
              value={addExamDate}
              onChange={(e) => setAddExamDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
              <input
                type="time"
                value={addStartTime}
                onChange={(e) => setAddStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
              <input
                type="time"
                value={addEndTime}
                onChange={(e) => setAddEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {addConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-600 font-medium text-sm mb-2">
                <AlertTriangle size={16} /> 检测到时间冲突
              </div>
              <ul className="text-sm text-red-500 list-disc list-inside">
                {addConflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingDraft(null);
        }}
        title="修改草稿项"
        footer={
          <>
            <button
              onClick={() => {
                setShowEditModal(false);
                setEditingDraft(null);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={
                editSaving || !editRoomId || !editExamDate || !editStartTime || !editEndTime
              }
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {editSaving ? '保存中...' : '保存修改'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="text-slate-600">
              <span className="font-medium">学生：</span>
              {editingDraft?.studentName}
            </div>
            <div className="text-slate-600 mt-1">
              <span className="font-medium">课程：</span>
              {editingDraft?.courseName}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考场</label>
            <select
              value={editRoomId ?? ''}
              onChange={(e) => setEditRoomId(Number(e.target.value) || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">请选择考场</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.location}) - 容量{r.capacity}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考试日期</label>
            <input
              type="date"
              value={editExamDate}
              onChange={(e) => setEditExamDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="确认发布"
        footer={
          <>
            <button
              onClick={() => setShowPublishConfirm(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handlePublish}
              disabled={submitting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '发布中...' : '确认发布'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            确定要将 <span className="font-bold text-emerald-600">{drafts.length}</span>{' '}
            条草稿发布为正式排考吗？
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            <div className="font-medium flex items-center gap-2 mb-1">
              <AlertTriangle size={16} />
              发布说明
            </div>
            <ul className="list-disc list-inside space-y-1">
              <li>发布后将写入正式排考记录和审计日志</li>
              <li>任一项失败将整体回滚，草稿保留</li>
              <li>发布成功后学生和教师可查看安排</li>
              <li>发布成功后草稿自动清空</li>
            </ul>
          </div>
        </div>
      </Modal>

      <Modal
        open={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setBatchResult(null);
          setDraftAddResult(null);
          setPublishResult(null);
        }}
        title={
          resultType === 'schedule'
            ? '批量排考结果'
            : resultType === 'draft-add'
            ? '加入草稿结果'
            : '发布结果'
        }
        footer={
          <>
            <button
              onClick={() => {
                setShowResultModal(false);
                setBatchResult(null);
                setDraftAddResult(null);
                setPublishResult(null);
              }}
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
