import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  PenTool,
  Plus,
  Send,
  RotateCcw,
  Trash2,
  Edit3,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Search,
  Download,
  X,
  Undo2,
} from 'lucide-react';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type {
  Application,
  ExamRoom,
  ArrangementDraft,
  Arrangement,
  BatchResultItem,
  DraftAddResult,
  DraftPublishResult,
  DraftUndoStackResponse,
  DraftUndoResult,
} from '@/types';

interface ConflictInfo {
  applicationId: number;
  conflict: boolean;
  reason?: string;
}

export default function AdminExamDrafts() {
  const [approvedApps, setApprovedApps] = useState<Application[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [drafts, setDrafts] = useState<ArrangementDraft[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showPublishValidate, setShowPublishValidate] = useState(false);

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

  const [draftAddResult, setDraftAddResult] = useState<DraftAddResult | null>(null);
  const [publishResult, setPublishResult] = useState<DraftPublishResult | null>(null);
  const [publishValidateResult, setPublishValidateResult] = useState<DraftPublishResult | null>(null);
  const [resultType, setResultType] = useState<'draft-add' | 'publish'>('draft-add');

  const [filterStudent, setFilterStudent] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterRoom, setFilterRoom] = useState('');

  const [conflictsMap, setConflictsMap] = useState<Map<number, ConflictInfo>>(new Map());

  const showToast = (type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, rms, arrs, drfts, undo] = await Promise.all([
        api.get<Application[]>('/applications?status=approved'),
        api.get<ExamRoom[]>('/exam-rooms'),
        api.get<Arrangement[]>('/arrangements'),
        api.get<ArrangementDraft[]>('/arrangements/drafts'),
        api.get<DraftUndoStackResponse>('/arrangements/drafts/undo-stack').catch(() => ({ stack: [], count: 0 })),
      ]);
      setApprovedApps(apps);
      setRooms(rms);
      setArrangements(arrs);
      setDrafts(drfts);
      setUndoCount(undo.count || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ctrl+Z 撤销
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        await handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoCount]);

  const scheduledAppIds = useMemo(
    () => new Set(arrangements.filter((a) => a.status === 'scheduled').map((a) => a.applicationId)),
    [arrangements]
  );
  const draftAppIds = useMemo(() => new Set(drafts.map((d) => d.applicationId)), [drafts]);
  const unscheduledApps = useMemo(
    () => approvedApps.filter((a) => !scheduledAppIds.has(a.id) && !draftAppIds.has(a.id)),
    [approvedApps, scheduledAppIds, draftAppIds]
  );

  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      if (filterStudent && !d.studentName?.toLowerCase().includes(filterStudent.toLowerCase())) return false;
      if (filterCourse && !d.courseName?.toLowerCase().includes(filterCourse.toLowerCase())) return false;
      if (filterRoom && !d.examRoomName?.toLowerCase().includes(filterRoom.toLowerCase())) return false;
      return true;
    });
  }, [drafts, filterStudent, filterCourse, filterRoom]);

  // 计算单个申请的冲突
  const computeAppConflict = useCallback(
    (app: Application): ConflictInfo => {
      if (!addRoomId || !addExamDate || !addStartTime || !addEndTime) {
        return { applicationId: app.id, conflict: false };
      }

      const sameStudentAppsSelected = selectedAppIds
        .map((id) => unscheduledApps.find((a) => a.id === id))
        .filter((a): a is Application => !!a && a.id !== app.id && a.studentId === app.studentId);

      if (sameStudentAppsSelected.length > 0) {
        return {
          applicationId: app.id,
          conflict: true,
          reason: `同批次已选同学生其他科目（${sameStudentAppsSelected.map((a) => a.courseName).join('、')}），时间冲突`,
        };
      }

      const studentConflictScheduled = arrangements.find(
        (a) =>
          a.studentId === app.studentId &&
          a.examDate === addExamDate &&
          a.status === 'scheduled' &&
          !(addEndTime <= a.startTime || addStartTime >= a.endTime)
      );
      if (studentConflictScheduled) {
        return {
          applicationId: app.id,
          conflict: true,
          reason: `与正式排考冲突：${studentConflictScheduled.courseName}（${studentConflictScheduled.startTime}-${studentConflictScheduled.endTime}）`,
        };
      }

      const studentConflictDraft = drafts.find(
        (d) =>
          d.studentId === app.studentId &&
          d.examDate === addExamDate &&
          !(addEndTime <= d.startTime || addStartTime >= d.endTime)
      );
      if (studentConflictDraft) {
        return {
          applicationId: app.id,
          conflict: true,
          reason: `与现有草稿冲突：${studentConflictDraft.courseName}（${studentConflictDraft.startTime}-${studentConflictDraft.endTime}，${studentConflictDraft.examRoomName}）`,
        };
      }

      return { applicationId: app.id, conflict: false };
    },
    [addRoomId, addExamDate, addStartTime, addEndTime, selectedAppIds, unscheduledApps, arrangements, drafts]
  );

  // 当添加参数变化时重新计算所有选中项的冲突
  useEffect(() => {
    if (!showAddModal) {
      setConflictsMap(new Map());
      return;
    }
    const m = new Map<number, ConflictInfo>();
    for (const app of unscheduledApps) {
      m.set(app.id, computeAppConflict(app));
    }
    setConflictsMap(m);
  }, [showAddModal, addRoomId, addExamDate, addStartTime, addEndTime, selectedAppIds, unscheduledApps, computeAppConflict]);

  const hasTimeOverlap = (s1: string, e1: string, s2: string, e2: string) =>
    !(e1 <= s2 || s1 >= e2);

  // 全量校验草稿（发布前）
  const validateAllDrafts = useCallback(() => {
    const details: BatchResultItem[] = [];
    const publishedByStudent: Map<number, Array<{ date: string; start: string; end: string; courseName: string }>> = new Map();
    const roomCounts: Map<string, number> = new Map();

    for (const draft of drafts) {
      let failed = false;
      let reason = '';

      const scheduledConflict = arrangements.find(
        (a) =>
          a.studentId === draft.studentId &&
          a.examDate === draft.examDate &&
          a.status === 'scheduled' &&
          hasTimeOverlap(a.startTime, a.endTime, draft.startTime, draft.endTime)
      );
      if (scheduledConflict) {
        failed = true;
        reason = `与正式排考冲突：${scheduledConflict.courseName}（${scheduledConflict.startTime}-${scheduledConflict.endTime}）`;
      }

      if (!failed) {
        const studentPubs = publishedByStudent.get(draft.studentId) || [];
        const selfConflict = studentPubs.find(
          (s) => s.date === draft.examDate && hasTimeOverlap(s.start, s.end, draft.startTime, draft.endTime)
        );
        if (selfConflict) {
          failed = true;
          reason = `草稿内部学生时间冲突：与${selfConflict.courseName}（${selfConflict.start}-${selfConflict.end}）冲突`;
        }
      }

      if (!failed) {
        const roomKey = `${draft.examRoomId}-${draft.examDate}`;
        const usedSameDay = arrangements.filter(
          (a) => a.examRoomId === draft.examRoomId && a.examDate === draft.examDate && a.status === 'scheduled'
        ).length;
        const cnt = (roomCounts.get(roomKey) || 0) + 1;
        const room = rooms.find((r) => r.id === draft.examRoomId);
        if (room && usedSameDay + cnt > room.capacity) {
          failed = true;
          reason = `考场容量不足（${draft.examRoomName} 容量${room.capacity}，已用${usedSameDay}+草稿${cnt}）`;
        } else {
          roomCounts.set(roomKey, cnt);
        }
      }

      if (!failed) {
        publishedByStudent.set(draft.studentId, [
          ...(publishedByStudent.get(draft.studentId) || []),
          { date: draft.examDate, start: draft.startTime, end: draft.endTime, courseName: draft.courseName || '' },
        ]);
        details.push({ id: draft.id, status: 'success' });
      } else {
        details.push({ id: draft.id, status: 'failed', reason });
      }
    }

    const failed = details.filter((d) => d.status === 'failed').length;
    const success = details.filter((d) => d.status === 'success').length;
    return {
      success: failed === 0,
      total: drafts.length,
      published: success,
      failed,
      skipped: 0,
      details,
    } as DraftPublishResult;
  }, [drafts, arrangements, rooms]);

  const handleValidateAndConfirmPublish = () => {
    const result = validateAllDrafts();
    setPublishValidateResult(result);
    setShowPublishValidate(true);
  };

  const handlePublish = async () => {
    if (drafts.length === 0) return;
    setShowPublishValidate(false);
    setShowPublishConfirm(false);
    setSubmitting(true);
    try {
      const result = await api.post<DraftPublishResult>('/arrangements/drafts/publish');
      setPublishResult(result);
      setResultType('publish');
      setShowResultModal(true);
      showToast('success', `发布成功！共发布 ${result.published} 条`);
      await loadData();
    } catch (e) {
      // 服务端校验失败可能返回带 details 的 200 success=false
      try {
        const res = e as Error & { response?: { data?: DraftPublishResult } };
        if (res?.response?.data && (res.response.data as DraftPublishResult).details) {
          setPublishResult(res.response.data as DraftPublishResult);
          setResultType('publish');
          setShowResultModal(true);
        }
      } catch {
        // ignore
      }
      showToast('error', e instanceof Error ? e.message : '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToDraft = async () => {
    if (!addRoomId || !addExamDate || !addStartTime || !addEndTime || selectedAppIds.length === 0) return;
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
      setConflictsMap(new Map());
      showToast('success', `添加成功 ${result.added} 条，跳过 ${result.skipped} 条`);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '添加草稿失败');
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
      showToast('success', '草稿已修改');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemoveDraft = async (id: number) => {
    if (!confirm('确定要移除此草稿项吗？')) return;
    try {
      await api.delete(`/arrangements/drafts/${id}`);
      showToast('info', '已移除草稿项');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleClearDrafts = async () => {
    if (!confirm('确定要清空所有草稿吗？可以通过撤销栈恢复。')) return;
    try {
      await api.delete('/arrangements/drafts');
      showToast('info', '已清空草稿（可 Ctrl+Z 撤销）');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '清空失败');
    }
  };

  const handleUndo = async () => {
    if (undoCount <= 0) {
      showToast('info', '撤销栈为空');
      return;
    }
    try {
      const result = await api.post<DraftUndoResult>('/arrangements/drafts/undo');
      setDrafts(result.drafts);
      setUndoCount(result.remainingUndoCount);
      showToast('success', `${result.description}，恢复 ${result.restoredCount} 项`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '撤销失败');
    }
  };

  const handleExportCsv = () => {
    api.download('/export/exam-drafts', `排考草稿_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast('success', '正在导出CSV...');
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const renderBatchResult = () => {
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
                      {d.status === 'added' ? (
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} />已添加</span>
                      ) : (
                        <span className="text-yellow-600 flex items-center gap-1"><AlertCircle size={14} />跳过</span>
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
                <AlertTriangle size={16} />发布前检查发现冲突，请修正后重试
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
    }
    return null;
  };

  const filters = (
    <>
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
          placeholder="搜索学生姓名"
          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={filterCourse}
          onChange={(e) => setFilterCourse(e.target.value)}
          placeholder="搜索课程名称"
          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          placeholder="搜索考场"
          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      {(filterStudent || filterCourse || filterRoom) && (
        <button
          onClick={() => { setFilterStudent(''); setFilterCourse(''); setFilterRoom(''); }}
          className="flex items-center gap-1 px-3 py-2 text-slate-500 hover:text-slate-700 text-sm"
        >
          <X size={14} /> 清除筛选
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-4 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all
          ${toast.type === 'success' ? 'bg-emerald-500 text-white' : ''}
          ${toast.type === 'error' ? 'bg-red-500 text-white' : ''}
          ${toast.type === 'info' ? 'bg-slate-700 text-white' : ''}
        `}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PenTool size={24} className="text-amber-500" /> 排考草稿
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            预排方案暂存区，支持 Ctrl+Z 撤销，校验通过后发布为正式排考
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleValidateAndConfirmPublish}
            disabled={drafts.length === 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Send size={16} /> 确认发布 ({drafts.length})
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={unscheduledApps.length === 0}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} /> 加入草稿
          </button>
          <button
            onClick={handleExportCsv}
            disabled={drafts.length === 0}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} /> 导出CSV
          </button>
          <button
            onClick={handleUndo}
            disabled={undoCount === 0}
            title={undoCount > 0 ? `撤销（剩${undoCount}步）Ctrl+Z` : '撤销栈为空'}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200"
          >
            <Undo2 size={16} /> 撤销{undoCount > 0 && <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{undoCount}</span>}
          </button>
          <button
            onClick={handleClearDrafts}
            disabled={drafts.length === 0}
            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:bg-slate-50 disabled:text-slate-400 text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-red-200"
          >
            <RotateCcw size={16} /> 清空
          </button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-lg border border-slate-200">
          <PenTool size={56} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">暂无排考草稿</p>
          <p className="text-sm mt-2">点击右上角"加入草稿"从已批准申请中勾选批量添加</p>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'studentName', title: '学生', sortable: true },
            { key: 'courseName', title: '课程', sortable: true },
            { key: 'examRoomName', title: '考场' },
            { key: 'examDate', title: '日期', sortable: true },
            { key: 'startTime', title: '开始' },
            { key: 'endTime', title: '结束' },
          ]}
          data={filteredDrafts}
          keyField="id"
          filters={filters}
          actions={(row) => {
            const d = row as ArrangementDraft;
            return (
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(d)}
                  className="text-amber-500 hover:text-amber-700 text-sm transition-colors flex items-center gap-1"
                >
                  <Edit3 size={14} /> 修改
                </button>
                <button
                  onClick={() => handleRemoveDraft(d.id)}
                  className="text-red-500 hover:text-red-700 text-sm transition-colors flex items-center gap-1"
                >
                  <Trash2 size={14} /> 移除
                </button>
              </div>
            );
          }}
        />
      )}

      {/* 加入草稿 Modal */}
      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedAppIds([]);
          setConflictsMap(new Map());
        }}
        title="批量加入草稿"
        footer={
          <>
            <button
              onClick={() => {
                setShowAddModal(false);
                setSelectedAppIds([]);
                setConflictsMap(new Map());
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleAddToDraft}
              disabled={
                submitting ||
                selectedAppIds.length === 0 ||
                !addRoomId ||
                !addExamDate ||
                !addStartTime ||
                !addEndTime
              }
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '提交中...' : '加入草稿'}
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
                {selectedAppIds.some((id) => conflictsMap.get(id)?.conflict) && (
                  <span className="text-red-500 ml-2">⚠ 含冲突项（标红跳过）</span>
                )}
              </span>
            </label>
            <div className="max-h-56 overflow-y-auto border border-slate-300 rounded-lg">
              {unscheduledApps.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">暂无可排考的已批准申请</p>
              ) : (
                unscheduledApps.map((app) => {
                  const c = conflictsMap.get(app.id);
                  const isConflict = !!c?.conflict && selectedAppIds.includes(app.id);
                  const isSelected = selectedAppIds.includes(app.id);
                  return (
                    <label
                      key={app.id}
                      className={`flex items-start gap-2 text-sm py-1.5 px-2 border-b border-slate-100 last:border-0 cursor-pointer transition-colors
                        ${isConflict ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}
                        ${isSelected && !isConflict ? 'bg-amber-50/50' : ''}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAppIds([...selectedAppIds, app.id]);
                          } else {
                            setSelectedAppIds(selectedAppIds.filter((id) => id !== app.id));
                          }
                        }}
                        className="mt-0.5 rounded text-amber-500 focus:ring-amber-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate ${isConflict ? 'text-red-700 font-medium' : 'text-slate-700'}`}>
                            {app.studentName} - {app.courseName}
                          </span>
                        </div>
                        {isConflict && c?.reason && (
                          <div className="text-xs text-red-600 mt-0.5 flex items-start gap-1">
                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                            <span>{c.reason}</span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
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
                  {r.name} - {r.location} (容量{r.capacity})
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
        </div>
      </Modal>

      {/* 编辑单个草稿 Modal */}
      <Modal
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingDraft(null); }}
        title="修改草稿项"
        footer={
          <>
            <button
              onClick={() => { setShowEditModal(false); setEditingDraft(null); }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >取消</button>
            <button
              onClick={handleSaveEdit}
              disabled={editSaving || !editRoomId || !editExamDate || !editStartTime || !editEndTime}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {editSaving ? '保存中...' : '保存修改'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="text-slate-600"><span className="font-medium">学生：</span>{editingDraft?.studentName}</div>
            <div className="text-slate-600 mt-1"><span className="font-medium">课程：</span>{editingDraft?.courseName}</div>
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
                  {r.name} - {r.location} (容量{r.capacity})
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

      {/* 发布校验 Modal */}
      <Modal
        open={showPublishValidate}
        onClose={() => setShowPublishValidate(false)}
        title="发布前校验"
        footer={
          <>
            <button
              onClick={() => setShowPublishValidate(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >返回修改</button>
            <button
              onClick={handlePublish}
              disabled={submitting || (publishValidateResult && publishValidateResult.failed > 0)}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white
                ${publishValidateResult && publishValidateResult.failed > 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-600'}
              `}
            >
              {submitting ? '发布中...' : '确认发布'}
            </button>
          </>
        }
      >
        {publishValidateResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{publishValidateResult.published}</div>
                <div className="text-xs text-emerald-600">通过校验</div>
              </div>
              <div className={`${publishValidateResult.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} border rounded-lg p-3 text-center`}>
                <div className={`text-2xl font-bold ${publishValidateResult.failed > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                  {publishValidateResult.failed}
                </div>
                <div className={`text-xs ${publishValidateResult.failed > 0 ? 'text-red-600' : 'text-slate-500'}`}>未通过</div>
              </div>
            </div>

            {publishValidateResult.failed > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <div className="font-medium flex items-center gap-2 mb-2">
                  <XCircle size={16} /> 存在 {publishValidateResult.failed} 项问题，请修正后重试
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <CheckCircle size={16} /> 全部通过校验
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-emerald-600 mt-1">
                  <li>无学生时间冲突</li>
                  <li>考场容量充足</li>
                  <li>点击"确认发布"将事务写入正式排考表</li>
                  <li>发布成功后草稿和撤销栈自动清空</li>
                </ul>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">草稿ID</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">学生</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">课程</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {publishValidateResult.details.map((d, i) => {
                    const draft = drafts.find((x) => x.id === d.id);
                    return (
                      <tr key={i} className={`border-t border-slate-100 ${d.status === 'failed' ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2">#{d.id}</td>
                        <td className="px-3 py-2">{draft?.studentName || '-'}</td>
                        <td className="px-3 py-2">{draft?.courseName || '-'}</td>
                        <td className="px-3 py-2">
                          {d.status === 'success' ? (
                            <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} />通过</span>
                          ) : (
                            <div className="text-red-600">
                              <div className="flex items-center gap-1 font-medium"><XCircle size={14} />未通过</div>
                              <div className="text-xs text-red-500 mt-0.5">{d.reason}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* 操作结果 Modal */}
      <Modal
        open={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setDraftAddResult(null);
          setPublishResult(null);
        }}
        title={resultType === 'draft-add' ? '加入草稿结果' : '发布结果'}
        footer={
          <>
            <button
              onClick={() => {
                setShowResultModal(false);
                setDraftAddResult(null);
                setPublishResult(null);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium"
            >关闭</button>
          </>
        }
      >
        {renderBatchResult()}
      </Modal>
    </div>
  );
}
