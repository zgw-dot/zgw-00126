import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Award, BookOpen } from 'lucide-react';
import { api } from '@/utils/api';
import type { StudentGradeHistory } from '@/types';

export default function StudentGrades() {
  const [gradeHistory, setGradeHistory] = useState<StudentGradeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<StudentGradeHistory[]>('/statistics/my-grades')
      .then((data) => setGradeHistory(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  const totalCourses = gradeHistory.length;
  const latestScores = gradeHistory.map((c) => c.history[c.history.length - 1]?.score || 0);
  const avgScore = latestScores.length > 0
    ? (latestScores.reduce((a, b) => a + b, 0) / latestScores.length).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">我的成绩</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-amber-500 text-white p-3 rounded-lg">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{totalCourses}</p>
            <p className="text-sm text-slate-500">已修课程</p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-blue-500 text-white p-3 rounded-lg">
            <Award size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{avgScore}</p>
            <p className="text-sm text-slate-500">最新平均分</p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-green-500 text-white p-3 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">
              {gradeHistory.filter((c) => {
                const last = c.history[c.history.length - 1];
                return last?.rankChange === '↑';
              }).length}
            </p>
            <p className="text-sm text-slate-500">排名上升科目</p>
          </div>
        </div>
      </div>

      {gradeHistory.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-slate-400">暂无成绩记录</p>
        </div>
      ) : (
        <div className="space-y-4">
          {gradeHistory.map((course) => (
            <div
              key={course.courseCode}
              className="bg-white rounded-lg border border-slate-200 shadow-sm p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{course.courseName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{course.courseCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">共 {course.history.length} 次考试</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left font-medium text-slate-600">学期</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600">分数</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600">班级排名</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600">年级排名</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600">排名变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...course.history].reverse().map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-700">{item.semester}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-slate-800">
                          {item.score}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600">
                          {item.classRank ? `第 ${item.classRank} 名` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600">
                          {item.gradeRank ? `第 ${item.gradeRank} 名` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.rankChange ? (
                            <span
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                                item.rankChange === '↑'
                                  ? 'bg-green-100 text-green-700'
                                  : item.rankChange === '↓'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item.rankChange === '↑' && <TrendingUp size={12} />}
                              {item.rankChange === '↓' && <TrendingDown size={12} />}
                              {item.rankChange === '-' && <Minus size={12} />}
                              {item.rankChange === '↑' ? '上升' : item.rankChange === '↓' ? '下降' : '持平'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">首次考试</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
