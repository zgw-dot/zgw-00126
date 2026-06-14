import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { api } from '@/utils/api';

export default function AdminExport() {
  const [notificationPreview, setNotificationPreview] = useState<string | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewNotification = async () => {
    setLoading(true);
    try {
      const text = await api.get<string>('/export/notification-list');
      setNotificationPreview(text);
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  const previewSchedule = async () => {
    setLoading(true);
    try {
      const text = await api.get<string>('/export/exam-schedule');
      setSchedulePreview(text);
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  const downloadNotification = () => {
    api.download('/export/notification-list', 'notification-list.csv');
  };

  const downloadSchedule = () => {
    api.download('/export/exam-schedule', 'exam-schedule.csv');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">数据导出</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">通知名单</h2>
          <div className="flex gap-3 mb-4">
            <button
              onClick={previewNotification}
              disabled={loading}
              className="flex items-center gap-2 border border-amber-500 text-amber-600 hover:bg-amber-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Eye size={16} /> 预览
            </button>
            <button
              onClick={downloadNotification}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={16} /> 下载 CSV
            </button>
          </div>
          {notificationPreview && (
            <div className="bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap">{notificationPreview}</pre>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">考试安排表</h2>
          <div className="flex gap-3 mb-4">
            <button
              onClick={previewSchedule}
              disabled={loading}
              className="flex items-center gap-2 border border-amber-500 text-amber-600 hover:bg-amber-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Eye size={16} /> 预览
            </button>
            <button
              onClick={downloadSchedule}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={16} /> 下载 CSV
            </button>
          </div>
          {schedulePreview && (
            <div className="bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap">{schedulePreview}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
