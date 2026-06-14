import { useEffect, useState } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { api } from '@/utils/api';
import type { Grade, Qualification } from '@/types';

export default function TeacherCourses() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Grade[]>('/grades?courseId='),
      api.get<Qualification[]>('/qualifications?courseId='),
    ])
      .then(([g, q]) => {
        setGrades(g);
        setQualifications(q);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const qualMap = new Map<number, Qualification>();
  qualifications.forEach((q) => qualMap.set(q.studentId * 10000 + q.courseId, q));

  const enrichedGrades = grades.map((g) => ({
    ...g,
    qualStatus: qualMap.get(g.studentId * 10000 + g.courseId)?.status || '-',
    qualQualified: qualMap.get(g.studentId * 10000 + g.courseId)?.qualified ?? null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">我的课程</h1>
      <DataTable
        columns={[
          { key: 'courseName', title: '课程名称', sortable: true },
          { key: 'studentName', title: '学生', sortable: true },
          { key: 'score', title: '成绩', sortable: true },
          { key: 'semester', title: '学期', sortable: true },
          {
            key: 'qualQualified',
            title: '资格状态',
            render: (row) => {
              if (row.qualQualified === null) return <span className="text-slate-400">-</span>;
              return row.qualQualified
                ? <Badge variant="active" label="有资格" />
                : <Badge variant="rejected" label="无资格" />;
            },
          },
        ]}
        data={enrichedGrades}
        keyField="id"
      />
    </div>
  );
}
