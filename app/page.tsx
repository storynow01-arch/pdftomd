'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ── 步驟指示器 ──────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { label: '上傳 PDF', icon: '📄' },
    { label: 'MD 預覽', icon: '✏️' },
    { label: '寫入 Notion', icon: '📝' },
    { label: '加入行事曆', icon: '📅' },
  ];
  return (
    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 'bold',
              backgroundColor: i + 1 === current ? 'var(--google-blue)' : i + 1 < current ? 'var(--google-green)' : 'var(--bg-secondary)',
              color: i + 1 <= current ? 'white' : 'var(--text-muted)'
            }}
          >
            {i + 1 < current ? '✓' : i + 1}
          </div>
          <span style={{ fontSize: 13, color: i + 1 === current ? 'var(--google-blue)' : 'var(--text-secondary)', fontWeight: i + 1 === current ? 600 : 400 }}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div style={{ width: 24, height: 1, backgroundColor: 'var(--border-subtle)' }} />}
        </div>
      ))}
    </div>
  );
}

// ── 主頁面（Step 1：上傳）────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') {
      setFile(dropped);
      setError('');
    } else {
      setError('請上傳 PDF 格式檔案');
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === 'application/pdf') {
      setFile(selected);
      setError('');
    } else {
      setError('請上傳 PDF 格式檔案');
    }
  };

  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setProgress(0);
      setProgressText('正在平行發送初次解析請求...');
      
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return 95;
          // 對數遞減增長：越靠近 95 增加越慢
          // 期望在前 15 秒達到 60%，在後 30 秒慢慢從 60% 爬到 95%
          const remaining = 95 - prev;
          const increment = (remaining * 0.05) + (Math.random() * 0.5);
          const newProgress = Math.min(prev + increment, 95);
          
          if (newProgress > 60 && prev <= 60) {
            setProgressText('正在進行 AI 交叉比對以提高準確率...');
          }
          
          return newProgress;
        });
      }, 500);
    } else {
      setProgress(0);
      setProgressText('');
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pdf/parse', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      // 設定進度到 100%
      setProgress(100);
      
      // 稍微延遲一下讓使用者看到 100% 的狀態再跳轉
      setTimeout(() => {
        // 存入 sessionStorage，傳給下一頁
        sessionStorage.setItem('parsedMarkdown', data.markdown);
        sessionStorage.setItem('sourceFilename', data.filename);
        
        // 如果使用了備用模型，把資訊存入，讓前端顯示警告
        if (data.isFallback) {
          sessionStorage.setItem('isFallbackModel', 'true');
          sessionStorage.setItem('usedModel', data.usedModel);
        } else {
          sessionStorage.removeItem('isFallbackModel');
        }

        router.push('/preview');
      }, 500);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '解析失敗，請重試');
      setLoading(false);
    }
  };

  return (
    <div className="cornell-layout">
      {/* Header 區塊 */}
      <header className="cornell-header">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--google-blue)' }}>📅</span> 行事曆解析系統
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          將 PDF 轉換為結構化資料，並一鍵同步至 Notion 與 Google 行事曆。
        </p>
        <StepIndicator current={1} />
      </header>

      {/* 左側線索區 */}
      <aside className="cornell-cue">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--google-blue)' }}>
          本頁操作提示
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-red)' }}>📄</span>
            <span>支援各式 PDF 格式，包含圖片掃描檔或文字排版。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-blue)' }}>🧠</span>
            <span>系統使用高效能 <strong>Gemini 2.5 Flash</strong> 模型進行智能辨識。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-yellow)' }}>⏳</span>
            <span>解析過程約需 10~30 秒，進度條完成後將自動跳轉。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-green)' }}>🔄</span>
            <span>流程：預覽校對 ➔ 單位複選 ➔ 同步 Notion ➔ 匯入行事曆。</span>
          </li>
        </ul>

        {/* 將執行按鈕移到提示區下方 */}
        <div style={{ marginTop: '2rem' }}>
          <button
            className="btn-primary"
            onClick={handleParse}
            disabled={!file || loading}
            style={{ width: '100%', fontSize: '1.05rem', padding: '0.75rem 1rem', boxShadow: '0 4px 16px rgba(66,133,244,0.3)' }}
          >
            {loading ? '🤖 解析中...' : '開始解析 →'}
          </button>
        </div>
      </aside>

      {/* 右側核心區：Dropzone */}
      <main className="cornell-notes">
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 1,
              border: `2px dashed ${isDragging ? 'var(--google-blue)' : 'var(--border-subtle)'}`,
              borderRadius: '8px',
              backgroundColor: isDragging ? 'rgba(66, 133, 244, 0.05)' : 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
            {file ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <p style={{ color: 'var(--google-blue)', fontWeight: 600, fontSize: '1.1rem' }}>{file.name}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '1rem' }}>點擊重新選擇</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.8 }}>📥</div>
                <p style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                  拖曳 PDF 到這裡，或點擊選擇檔案
                </p>
                <p style={{ color: 'var(--text-secondary)' }}>最大支援 10MB 的 PDF 文件</p>
              </div>
            )}
          </div>
          {error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'rgba(234, 67, 53, 0.1)', color: 'var(--google-red)', borderRadius: '4px', border: '1px solid var(--google-red)' }}>
              ⚠️ {error}
            </div>
          )}
          
          {/* 百分比進度條 */}
          {loading && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--google-blue)', fontWeight: 600, marginBottom: '0.5rem' }}>
                🤖 {progress === 100 ? '解析完成，即將跳轉...' : progressText} ({Math.round(progress)}%)
              </p>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${progress}%`,
                  backgroundColor: 'var(--google-blue)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* footer 已經不需要了，移除以保持版面簡潔 */}
    </div>
  );
}
