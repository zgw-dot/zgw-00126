import { useEffect, useState } from 'react';
import {
  BarChart3,
  Plus,
  Trash2,
  Download,
  Eye,
  FileBarChart,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
} from 'lucide-react';
import { api } from '@/utils/api';
import Modal from '@/components/Modal';
import StatsCard from '@/components/StatsCard';
import type {
  StatConfigOptions,
  ScoreRange,
  StatReport,
  ReportSubjectData,
  ReportStudentData,
} from '@/types';

export default function AdminStatistics() {
  const [options, setOptions] = useState<StatConfigOptions | null>(null);
  const [reports, setReports] = useState<StatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [reportName, setReportName] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  const [scoreRanges, setScoreRanges] = useState<ScoreRange[]>([]);

  const [detailReport, setDetailReport] = useState<StatReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<StatConfigOptions>('/statistics/config/options'),
      api.get<StatReport[]>('/statistics/reports'),
    ])
      .then(([opts, reps]) => {
        setOptions(opts);
        setReports(reps);
        if (opts.defaultScoreRanges.length > 0 && scoreRanges.length === 0) {
          setScoreRanges(opts.defaultScoreRanges);
        }
        if (opts.grades.length > 0 && !selectedGrade) {
          setSelectedGrade(opts.grades[0]);
        }
        if (opts.semesters.length > 0 && !selectedSemester) {
          setSelectedSemester(opts.semesters[0]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableCourses = options?.coursesBySemester[selectedSemester] || [];

  useEffect(() => {
    if (availableCourses.length > 0 && selectedSubjects.length === 0) {
      setSelectedSubjects(availableCourses.map((c) => c.id));
    }
  }, [availableCourses, selectedSubjects.length]);

  const handleSubjectToggle = (subjectId: number) => {
    setSelectedSubjects((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const addScoreRange = () => {
    setScoreRanges((prev) => [
      ...prev,
      { min: 0, max: 100, label: `区间${prev.length + 1}` },
    ]);
  };

  const removeScoreRange = (index: number) => {
    setScoreRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const updateScoreRange = (index: number, field: keyof ScoreRange, value: string) => {
    setScoreRanges((prev) => {
      const updated = [...prev];
      if (field === 'label') {
        updated[index] = { ...updated[index], label: value };
      } else {
        updated[index] = { ...updated[index], [field]: Number(value) || 0 };
      }
      return updated;
    });
  };

  const handleGenerate = async () => {
    if (!reportName.trim() || !selectedGrade || !selectedSemester || selectedSubjects.length === 0 || scoreRanges.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      await api.post<StatReport>('/statistics/generate', {
        name: reportName.trim(),
        grade: selectedGrade,
        subjectIds: selectedSubjects,
        semester: selectedSemester,
        scoreRanges,
      });
      setReportName('');
      loadData();
    } finally {
      setGenerating(false);
    }
  };

  const handleViewDetail = async (reportId: number) => {
    setDetailLoading(true);
    try {
      const report = await api.get<StatReport>(`/statistics/reports/${reportId}`);
      setDetailReport(report);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = (report: StatReport) => {
    api.download(`/statistics/reports/${report.id}/export`, `${report.name}.csv`);
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">成绩统计分析</h1>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileBarChart size={20} className="text-amber-500" />
          生成统计报告
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">报告名称</label>
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="例如：2023级期中成绩分析"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">年级</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {options?.grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">学期</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {options?.semesters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              统计科目（已选 {selectedSubjects.length} 门）
            </label>
            <div className="flex flex-wrap gap-2 border border-slate-300 rounded-lg px-3 py-2 min-h-[40px]">
              {availableCourses.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                    selectedSubjects.includes(c.id)
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSubjects.includes(c.id)}
                    onChange={() => handleSubjectToggle(c.id)}
                    className="hidden"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">分数段区间</label>
            <button
              onClick={addScoreRange}
              className="flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs font-medium"
            >
              <Plus size={14} /> 添加区间
            </button>
          </div>
          <div className="space-y-2">
            {scoreRanges.map((range, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={range.label}
                  onChange={(e) => updateScoreRange(idx, 'label', e.target.value)}
                  className="w-20 border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <input
                  type="number"
                  value={range.min}
                  onChange={(e) => updateScoreRange(idx, 'min', e.target.value)}
                  min={0}
                  max={100}
                  className="w-16 border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-slate-400 text-sm">~</span>
                <input
                  type="number"
                  value={range.max}
                  onChange={(e) => updateScoreRange(idx, 'max', e.target.value)}
                  min={0}
                  max={100}
                  className="w-16 border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-xs text-slate-500">分</span>
                {scoreRanges.length > 1 && (
                  <button
                    onClick={() => removeScoreRange(idx)}
                    className="text-red-400 hover:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !reportName.trim() || selectedSubjects.length === 0}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <BarChart3 size={16} />
          {generating ? '生成中...' : '生成报告'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileBarChart size={20} className="text-amber-500" />
          历史报告
        </h2>
        {reports.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">暂无报告，请先生成</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition-colors"
              >
                <div>
                  <h3 className="font-medium text-slate-800">{r.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{r.grade}</span>
                    <span>{r.semester}</span>
                    <span>{r.subjectIds.length} 门科目</span>
                    <span>创建人：{r.creatorName}</span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetail(r.id)}
                    className="flex items-center gap-1 text-slate-600 hover:text-amber-600 text-sm px-3 py-1.5 rounded hover:bg-amber-50 transition-colors"
                  >
                    <Eye size={16} /> 查看
                  </button>
                  <button
                    onClick={() => handleExport(r)}
                    className="flex items-center gap-1 text-slate-600 hover:text-amber-600 text-sm px-3 py-1.5 rounded hover:bg-amber-50 transition-colors"
                  >
                    <Download size={16} /> 导出CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={detailReport !== null}
        onClose={() => setDetailReport(null)}
        title={detailReport?.name || '报告详情'}
      >
        {detailLoading ? (
          <div className="text-center py-8 text-slate-400">加载中...</div>
        ) : detailReport ? (
          <ReportDetailContent report={detailReport} />
        ) : null}
      </Modal>
    </div>
  );
}

function ReportDetailContent({ report }: { report: StatReport }) {
  const subjects = report.subjects || [];
  const students = report.students || [];

  const belowThresholdCount = subjects.filter((s) => s.belowThreshold).length;

  const uniqueStudents = new Map<number, { name: string; classNo: string }>();
  for (const s of students) {
    uniqueStudents.set(s.studentId, { name: s.studentName, classNo: s.classNo });
  }

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-3 gap-3">
        <StatsCard
          icon={<FileBarChart size={20} />}
          value={subjects.length}
          label="统计科目数"
          accent="bg-blue-500"
        />
        <StatsCard
          icon={<Users size={20} />}
          value={uniqueStudents.size}
          label="学生人数"
          accent="bg-green-500"
        />
        <StatsCard
          icon={<AlertTriangle size={20} />}
          value={belowThresholdCount}
          label="预警科目"
          accent="bg-red-500"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">各科统计</h3>
        <div className="space-y-3">
          {subjects.map((s: ReportSubjectData) => (
            <div
              key={s.subjectId}
              className={`p-3 rounded-lg border ${
                s.belowThreshold
                  ? 'border-red-300 bg-red-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-800 flex items-center gap-2">
                  {s.subjectName}
                  {s.belowThreshold && (
                    <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">
                      低于预警线
                    </span>
                  )}
                </span>
                <span className={`text-lg font-bold ${
                  s.belowThreshold ? 'text-red-600' : 'text-slate-800'
                }`}>
                  {s.averageScore}分
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">及格率</span>
                  <span className="font-medium text-slate-700">{s.passRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">预警状态</span>
                  <span className={`font-medium ${s.belowThreshold ? 'text-red-600' : 'text-green-600'}`}>
                    {s.belowThreshold ? '预警' : '正常'}
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <p className="text-xs text-slate-500 mb-1">分数段分布</p>
                <div className="flex gap-1">
                  {Object.entries(s.scoreDistribution).map(([label, count]) => (
                    <div key={label} className="flex-1 text-center">
                      <div className="bg-slate-100 rounded text-xs py-1 text-slate-600">{label}</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{count}人</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">学生成绩明细</h3>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium text-slate-600">学生</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">班级</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">科目</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">本次</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">上次</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">涨跌</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">班排</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">级排</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600">排名变化</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: ReportStudentData, idx: number) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-700">{s.studentName}</td>
                  <td className="px-3 py-2 text-slate-500">{s.classNo}</td>
                  <td className="px-3 py-2 text-slate-700">{s.subjectName}</td>
                  <td className="px-3 py-2 text-center font-medium text-slate-800">{s.currentScore}</td>
                  <td className="px-3 py-2 text-center text-slate-500">
                    {s.previousScore ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.scoreChange !== undefined && s.scoreChange !== null ? (
                      <span className={`inline-flex items-center gap-0.5 ${
                        s.changeMarker === 'up' ? 'text-green-600' :
                        s.changeMarker === 'down' ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {s.changeMarker === 'up' && <TrendingUp size={12} />}
                        {s.changeMarker === 'down' && <TrendingDown size={12} />}
                        {s.changeMarker === 'same' && <Minus size={12} />}
                        {s.scoreChange > 0 ? '+' : ''}{s.scoreChange}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">{s.classRank}</td>
                  <td className="px-3 py-2 text-center text-slate-700">{s.gradeRank}</td>
                  <td className="px-3 py-2 text-center">
                    {s.rankChange ? (
                      <span className={`font-medium ${
                        s.rankChange === '↑' ? 'text-green-600' :
                        s.rankChange === '↓' ? 'text-red-500' : 'text-slate-400'
                      }`}>{s.rankChange}</span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
