import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onUpload: (csvText: string) => Promise<{ imported: number; errors: string[] }>;
}

export default function FileUpload({ onUpload }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setError('请上传 CSV 文件');
        return;
      }
      setError(null);
      setResult(null);
      setUploading(true);
      try {
        const text = await file.text();
        const res = await onUpload(text);
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-amber-400 bg-amber-50'
            : 'border-slate-300 hover:border-amber-400 hover:bg-slate-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleChange}
          className="hidden"
        />
        <Upload size={40} className={`mx-auto mb-3 ${dragging ? 'text-amber-500' : 'text-slate-400'}`} />
        {uploading ? (
          <p className="text-slate-600">上传中...</p>
        ) : (
          <>
            <p className="text-slate-600 font-medium">拖拽 CSV 文件到此处，或点击选择</p>
            <p className="text-sm text-slate-400 mt-1">支持 .csv 格式</p>
          </>
        )}
      </div>

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-500 mt-0.5" />
          <div>
            <p className="text-green-700 font-medium">成功导入 {result.imported} 条记录</p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-red-600 text-sm font-medium">错误信息：</p>
                <ul className="text-sm text-red-500 list-disc list-inside">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 mt-0.5" />
          <p className="text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
