import { useState } from 'react';
import DataTable from '@/components/DataTable';
import FileUpload from '@/components/FileUpload';
import { api } from '@/utils/api';
import type { Grade } from '@/types';

export default function AdminGrades() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [studentFilter, setStudentFilter] = useState('');

  const loadGrades = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (courseFilter) params.set('courseId', courseFilter);
    if (studentFilter) params.set('studentId', studentFilter);
    api
      .get<Grade[]>(`/grades?${params.toString()}`)
      .then(setGrades)
      .finally(() => setLoading(false));
  };

  const handleUpload = async (csvText: string) => {
    return api.uploadCsv<{ imported: number; errors: string[] }>('/grades/import', csvText);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">成绩管理</h1>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">导入成绩</h2>
        <FileUpload onUpload={handleUpload} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">成绩列表</h2>
        <DataTable
          columns={[
            { key: 'studentName', title: '学生', sortable: true },
            { key: 'courseName', title: '课程', sortable: true },
            { key: 'score', title: '成绩', sortable: true },
            { key: 'semester', title: '学期', sortable: true },
          ]}
          data={grades}
          keyField="id"
          filters={
            <>
              <input
                type="text"
                placeholder="课程ID"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <input
                type="text"
                placeholder="学生ID"
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={loadGrades}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                查询
              </button>
            </>
          }
        />
      </div>
    </div>
  );
}
