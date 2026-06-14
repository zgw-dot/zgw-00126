import { useEffect, useState } from 'react';
import { BookOpen, Users, Award } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { Qualification, Grade } from '@/types';

interface CourseStats {
  courseId: number;
  courseName: string;
  studentCount: number;
  qualifiedCount: number;
  failedCount: number;
}

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const [courses, setCourses] = useState<CourseStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Grade[]>(`/grades?courseId=`),
      api.get<Qualification[]>(`/qualifications?courseId=`),
    ])
      .then(([grades, quals]) => {
        const teacherGrades = grades;
        const courseMap = new Map<number, CourseStats>();
        teacherGrades.forEach((g) => {
          if (!courseMap.has(g.courseId)) {
            courseMap.set(g.courseId, {
              courseId: g.courseId,
              courseName: g.courseName,
              studentCount: 0,
              qualifiedCount: 0,
              failedCount: 0,
            });
          }
          const c = courseMap.get(g.courseId)!;
          c.studentCount++;
        });
        quals.forEach((q) => {
          const c = courseMap.get(q.courseId);
          if (c) {
            if (q.qualified) c.qualifiedCount++;
            else c.failedCount++;
          }
        });
        setCourses(Array.from(courseMap.values()));
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  const totalStudents = courses.reduce((s, c) => s + c.studentCount, 0);
  const totalQualified = courses.reduce((s, c) => s + c.qualifiedCount, 0);
  const totalCourses = courses.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">教师仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard icon={<BookOpen size={24} />} value={totalCourses} label="我的课程" accent="bg-indigo-500" />
        <StatsCard icon={<Users size={24} />} value={totalStudents} label="学生总数" accent="bg-blue-500" />
        <StatsCard icon={<Award size={24} />} value={totalQualified} label="获资格学生" accent="bg-green-500" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">课程概览</h2>
        {courses.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无课程数据</p>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <div key={c.courseId} className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-50 border border-slate-100">
                <div>
                  <p className="font-medium text-slate-700">{c.courseName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.studentCount} 名学生</p>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">{c.qualifiedCount} 合格</span>
                  <span className="text-red-500">{c.failedCount} 不合格</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
