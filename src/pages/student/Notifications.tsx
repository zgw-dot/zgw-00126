import { useEffect, useState } from 'react';
import { Bell, CheckCheck, CheckCircle, XCircle, Calendar, AlertTriangle } from 'lucide-react';
import { api } from '@/utils/api';
import type { Notification } from '@/types';

const typeIcons: Record<string, React.ReactNode> = {
  application_approved: <CheckCircle size={18} className="text-green-500" />,
  application_rejected: <XCircle size={18} className="text-red-500" />,
  exam_scheduled: <Calendar size={18} className="text-blue-500" />,
  qualification_cancelled: <AlertTriangle size={18} className="text-orange-500" />,
};

const typeLabels: Record<string, string> = {
  application_approved: '申请通过',
  application_rejected: '申请拒绝',
  exam_scheduled: '考试安排',
  qualification_cancelled: '资格取消',
};

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    api
      .get<Notification[]>('/notifications')
      .then(setNotifications)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all', {});
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Bell size={24} className="text-amber-500" />
          我的通知
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <CheckCheck size={16} /> 全部标为已读
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-12 text-center">
          <Bell size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && handleMarkRead(n.id)}
              className={`bg-white rounded-lg border shadow-sm p-4 transition-all cursor-pointer ${
                n.isRead
                  ? 'border-slate-200 opacity-75'
                  : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {typeIcons[n.type] || <Bell size={18} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{n.title}</span>
                    <span className="text-xs text-slate-400">{typeLabels[n.type] || n.type}</span>
                    {!n.isRead && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-slate-600 mt-1 break-words">{n.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
