import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { Qualification } from '@/types';

export default function StudentQualifications() {
  const { user } = useAuthStore();
  const [data, setData] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .get<Qualification[]>(`/qualifications?studentId=${user.id}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">我的资格</h1>
      <DataTable
        columns={[
          { key: 'courseName', title: '课程名称', sortable: true },
          { key: 'qualified', title: '是否合格', render: (row) => (
            <Badge variant={row.qualified ? 'active' : 'rejected'} label={row.qualified ? '合格' : '不合格'} />
          )},
          { key: 'source', title: '来源', render: (row) => <Badge variant={row.source} /> },
          { key: 'status', title: '状态', render: (row) => <Badge variant={row.status} /> },
          { key: 'createdAt', title: '创建时间', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
        ]}
        data={data}
        keyField="id"
      />
    </div>
  );
}
