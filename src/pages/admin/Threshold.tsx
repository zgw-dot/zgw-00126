import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/utils/api';
import type { ThresholdConfig, ThresholdHistory } from '@/types';

export default function AdminThreshold() {
  const [config, setConfig] = useState<ThresholdConfig | null>(null);
  const [history, setHistory] = useState<ThresholdHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreInput, setScoreInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<ThresholdConfig>('/threshold'),
      api.get<ThresholdHistory[]>('/threshold/history'),
    ])
      .then(([cfg, hist]) => {
        setConfig(cfg);
        setScoreInput(String(cfg.score));
        setHistory(hist);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    const score = Number(scoreInput);
    if (isNaN(score) || score < 0 || score > 100) return;
    setSaving(true);
    try {
      const updated = await api.put<ThresholdConfig>('/threshold', { score });
      setConfig(updated);
      loadData();
    } catch {
      // error handling
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">阈值设置</h1>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">当前阈值</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-slate-700 mb-1">补考资格分数线</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                min={0}
                max={100}
                className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">分</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              成绩低于此分数的学生将自动获得补考资格
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={16} /> {saving ? '保存中...' : '保存'}
          </button>
        </div>
        {config && (
          <p className="text-xs text-slate-400 mt-3">
            上次更新: {new Date(config.updatedAt).toLocaleString()} | 更新人: ID {config.updatedBy}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">修改历史</h2>
        {history.length === 0 ? (
          <p className="text-slate-400 text-sm">暂无修改记录</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-200" />
            <div className="space-y-4">
              {history.map((h, idx) => (
                <div key={h.id} className="relative">
                  <div
                    className={`absolute -left-[18px] top-1.5 w-3 h-3 rounded-full border-2 ${
                      idx === 0 ? 'bg-amber-500 border-amber-300' : 'bg-white border-slate-300'
                    }`}
                  />
                  <div className="bg-slate-50 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">分数线: {h.score} 分</span>
                      <span className="text-xs text-slate-400">
                        {new Date(h.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">操作人 ID: {h.updatedBy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
