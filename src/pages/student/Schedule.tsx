import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { Arrangement } from '@/types';

export default function StudentSchedule() {
  const { user } = useAuthStore();
  const [data, setData] = useState<Arrangement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .get<Arrangement[]>(`/arrangements?studentId=${user.id}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">考试安排</h1>
      <DataTable
        columns={[
          { key: 'courseName', title: '课程名称', sortable: true },
          { key: 'examRoomName', title: '考场' },
          { key: 'examDate', title: '考试日期', sortable: true, render: (row) => row.examDate },
          { key: 'startTime', title: '开始时间' },
          { key: 'endTime', title: '结束时间' },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
        ]}
        data={data}
        keyField="id"
      />
    </div>
  );
}
