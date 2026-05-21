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

  // ── 自訂憑證 state ─────────────────────────────────────────
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionPageId, setNotionPageId] = useState('');
  const [gasUrl, setGasUrl] = useState('');
  const [gasSecretKey, setGasSecretKey] = useState('');
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  const [showGemini, setShowGemini] = useState(false);
  const [showNotionToken, setShowNotionToken] = useState(false);
  const [showGasSecret, setShowGasSecret] = useState(false);

  useEffect(() => {
    const savedGemini = localStorage.getItem('pdftomd_gemini_api_key') || '';
    const savedNotionToken = localStorage.getItem('pdftomd_notion_token') || '';
    const savedNotionPageId = localStorage.getItem('pdftomd_notion_page_id') || '';
    const savedGasUrl = localStorage.getItem('pdftomd_gas_url') || '';
    const savedGasSecret = localStorage.getItem('pdftomd_gas_secret_key') || '';

    setGeminiApiKey(savedGemini);
    setNotionToken(savedNotionToken);
    setNotionPageId(savedNotionPageId);
    setGasUrl(savedGasUrl);
    setGasSecretKey(savedGasSecret);

    // 如果沒有 Gemini API key，預設展開 API 設定面板進行引導
    if (!savedGemini) {
      setIsAccordionOpen(true);
    }
  }, []);

  const handleKeyChange = (key: string, value: string) => {
    if (key === 'gemini') {
      setGeminiApiKey(value);
      localStorage.setItem('pdftomd_gemini_api_key', value);
    } else if (key === 'notion_token') {
      setNotionToken(value);
      localStorage.setItem('pdftomd_notion_token', value);
    } else if (key === 'notion_page_id') {
      setNotionPageId(value);
      localStorage.setItem('pdftomd_notion_page_id', value);
    } else if (key === 'gas_url') {
      setGasUrl(value);
      localStorage.setItem('pdftomd_gas_url', value);
    } else if (key === 'gas_secret_key') {
      setGasSecretKey(value);
      localStorage.setItem('pdftomd_gas_secret_key', value);
    }
  };

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
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timer: NodeJS.Timeout;

    if (loading) {
      setProgress(0);
      setElapsedTime(0);
      setProgressText('🚀 正在讀取 PDF 並進行本地純文字提取...');

      // 累計秒數計時器
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);

      // 進度增長計時器
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return 95;
          const remaining = 95 - prev;
          const increment = (remaining * 0.05) + (Math.random() * 0.5);
          return Math.min(prev + increment, 95);
        });
      }, 500);
    } else {
      setProgress(0);
      setElapsedTime(0);
      setProgressText('');
    }

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [loading]);

  // 動態依據耗時更新溫馨提示文字
  useEffect(() => {
    if (!loading) return;
    if (progress === 100) {
      setProgressText('🎉 解析完成，即將跳轉...');
      return;
    }

    if (elapsedTime <= 8) {
      setProgressText('🚀 正在讀取 PDF 並進行本地純文字提取...');
    } else if (elapsedTime <= 18) {
      setProgressText('🧠 正在使用 Gemini 3.5 Flash 進行智慧解析...');
    } else if (elapsedTime <= 30) {
      setProgressText('✨ 正在進行深度語意分析與處室分類（已耗時：' + elapsedTime + ' 秒）...');
    } else if (elapsedTime <= 45) {
      setProgressText('🔍 偵測到事件數量較多，正在進行最後的格式校校（已耗時：' + elapsedTime + ' 秒）...');
    } else {
      setProgressText('⏳ 請耐心等候，AI 正在將數百項日程做高精確度的整理（已耗時：' + elapsedTime + ' 秒）...');
    }
  }, [elapsedTime, loading, progress]);

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (geminiApiKey.trim()) {
        formData.append('customGeminiApiKey', geminiApiKey.trim());
      }
      
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
        
        if (data.accuracy) {
          sessionStorage.setItem('parsedAccuracy', JSON.stringify(data.accuracy));
        } else {
          sessionStorage.removeItem('parsedAccuracy');
        }
        
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
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-blue)' }}>🔒</span>
            <span>自訂 API 金鑰 100% 儲存於您本地瀏覽器 (localStorage)，安全且不經由本站伺服器轉存。</span>
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

        {/* 自訂金鑰設定折疊面板 */}
        <div className="card" style={{ marginTop: '1.5rem', padding: '1.2rem', transition: 'all 0.3s ease' }}>
          <div 
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span>🔧</span> 個人 API 設定 (自訂金鑰免部署)
            </h3>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', transform: isAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
              ▼
            </span>
          </div>

          {isAccordionOpen && (
            <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 0.5rem 0', backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid var(--google-blue)' }}>
                💡 <strong>為什麼要填寫？</strong> 為了讓本系統對所有人開放自由使用，且不需要任何個人 Vercel 部署程序，您可以自訂個人的 API 金鑰。所有金鑰<strong>皆僅儲存於您本地瀏覽器</strong>，伺服器絕不上傳收集，請放心使用。
              </p>

              {/* Gemini API Key */}
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  <span>Gemini API Key (自訂解析金鑰)</span>
                  <a 
                    href="https://aistudio.google.com/" 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ color: 'var(--google-blue)', textDecoration: 'underline', fontWeight: 'normal' }}
                  >
                    免費申請 Gemini 憑證 ↗
                  </a>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showGemini ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => handleKeyChange('gemini', e.target.value)}
                    placeholder="請輸入 Gemini API 金鑰 (AIzaSy...，留空則採用伺服器預設)"
                    style={{
                      width: '100%',
                      padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      outline: 'none',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGemini(!showGemini)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.6
                    }}
                  >
                    {showGemini ? '👁️' : '🙈'}
                  </button>
                </div>
              </div>

              {/* Notion Token */}
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  <span>Notion Integration Token (寫入 Notion 時必填)</span>
                  <a 
                    href="https://www.notion.so/my-integrations" 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ color: 'var(--google-blue)', textDecoration: 'underline', fontWeight: 'normal' }}
                  >
                    建立 Notion 整合 ↗
                  </a>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNotionToken ? 'text' : 'password'}
                    value={notionToken}
                    onChange={(e) => handleKeyChange('notion_token', e.target.value)}
                    placeholder="請輸入 Notion 整合 Token (secret_...)"
                    style={{
                      width: '100%',
                      padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      outline: 'none',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNotionToken(!showNotionToken)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.6
                    }}
                  >
                    {showNotionToken ? '👁️' : '🙈'}
                  </button>
                </div>
              </div>

              {/* Notion Page ID */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  Notion Page ID (寫入 Notion 時必填，須先將此頁面與 Notion 整合共享連結)
                </label>
                <input
                  type="text"
                  value={notionPageId}
                  onChange={(e) => handleKeyChange('notion_page_id', e.target.value)}
                  placeholder="請輸入 Notion 父頁面 ID (32位十六進位字元)"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    outline: 'none',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* GAS URL */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  Google Calendar GAS Web App URL (選填，若留空可直接在第四步下載 .ics 檔案一鍵匯入)
                </label>
                <input
                  type="text"
                  value={gasUrl}
                  onChange={(e) => handleKeyChange('gas_url', e.target.value)}
                  placeholder="請輸入 GAS 網頁應用程式 URL (https://script.google.com/...)"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    outline: 'none',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* GAS Secret Key */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  GAS Secret Key (選填，配合 GAS 驗證使用的安全金鑰)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showGasSecret ? 'text' : 'password'}
                    value={gasSecretKey}
                    onChange={(e) => handleKeyChange('gas_secret_key', e.target.value)}
                    placeholder="請輸入 GAS Secret Key"
                    style={{
                      width: '100%',
                      padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      outline: 'none',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGasSecret(!showGasSecret)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.6
                    }}
                  >
                    {showGasSecret ? '👁️' : '🙈'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* footer 已經不需要了，移除以保持版面簡潔 */}
    </div>
  );
}
