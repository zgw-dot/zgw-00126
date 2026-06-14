import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import DataTable from '@/components/DataTable';
import CapacityBar from '@/components/CapacityBar';
import Modal from '@/components/Modal';
import { api } from '@/utils/api';
import type { ExamRoom } from '@/types';

export default function AdminExamRooms() {
  const [data, setData] = useState<ExamRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ExamRoom | null>(null);
  const [form, setForm] = useState({ name: '', capacity: 0, location: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamRoom | null>(null);

  const loadData = () => {
    setLoading(true);
    api
      .get<ExamRoom[]>('/exam-rooms')
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', capacity: 0, location: '' });
    setShowModal(true);
  };

  const openEdit = (room: ExamRoom) => {
    setEditing(room);
    setForm({ name: room.name, capacity: room.capacity, location: room.location });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/exam-rooms/${editing.id}`, form);
      } else {
        await api.post('/exam-rooms', form);
      }
      setShowModal(false);
      loadData();
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/exam-rooms/${deleteTarget.id}`);
      setDeleteTarget(null);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">考场管理</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> 新增考场
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'name', title: '考场名称', sortable: true },
          { key: 'location', title: '位置', sortable: true },
          { key: 'capacity', title: '容量/使用量', render: (row) => (
            <CapacityBar used={row.usedSeats} capacity={row.capacity} />
          )},
        ]}
        data={data}
        keyField="id"
        actions={(row) => (
          <div className="flex gap-2">
            <button
              onClick={() => openEdit(row)}
              className="text-blue-500 hover:text-blue-700 transition-colors"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setDeleteTarget(row)}
              className="text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

      />

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '编辑考场' : '新增考场'}
        footer={
          <>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.name || form.capacity <= 0}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '提交中...' : '确认'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">考场名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">容量</label>
            <input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              min={1}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">位置</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="删除考场"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? '删除中...' : '确认删除'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          确认删除考场 <strong>{deleteTarget?.name}</strong>？此操作不可撤销。
        </p>
      </Modal>
    </div>
  );
}
