'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export default function PreviewPage() {
  const router = useRouter();
  const [sections, setSections] = useState<{ unit: string; content: string }[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [filename, setFilename] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 輔助函式：組合所有內容
  const getFullMarkdown = () => sections.map(s => s.content).join('\n\n');

  useEffect(() => {
    const md = sessionStorage.getItem('parsedMarkdown');
    const fn = sessionStorage.getItem('sourceFilename');
    if (!md) { router.push('/'); return; }
    
    // 依據「## 單位：」切割 markdown
    const parts = md.split(/(?=^## 單位：)/m).filter(p => p.trim().length > 0);
    const parsedSections = parts.map(part => {
      const match = part.match(/^## 單位：(.*?)$/m);
      const unit = match ? match[1].trim() : '其他';
      return { unit, content: part.trim() };
    });
    
    setSections(parsedSections);
    setFilename(fn || 'document.pdf');
  }, [router]);

  const handleWriteNotion = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const fullMarkdown = getFullMarkdown();
    try {
      const title = `行事曆解析 - ${filename} - ${new Date().toLocaleDateString('zh-TW')}`;
      const res = await fetch('/api/notion/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: fullMarkdown, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem('notionPageUrl', data.pageUrl);
      sessionStorage.setItem('notionPageId', data.pageId);
      sessionStorage.setItem('confirmedMarkdown', fullMarkdown);
      setSuccess(`✅ 已寫入 Notion！`);
      setTimeout(() => router.push('/calendar'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = (newContent: string) => {
    const newSections = [...sections];
    newSections[activeTab].content = newContent;
    setSections(newSections);
  };

  return (
    <div className="cornell-layout">
      {/* Header */}
      <header className="cornell-header">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--google-blue)' }}>📋</span> 預覽解析結果
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          來源檔案：{filename}
        </p>
        <StepIndicator current={2} />
      </header>

      {/* Cue */}
      <aside className="cornell-cue">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--google-blue)' }}>
          預覽與編輯
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-green)' }}>👁️</span>
            <span>「預覽模式」可查看實際的格式渲染效果。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-yellow)' }}>✏️</span>
            <span>「編輯模式」允許您手動修正 AI 辨識錯誤的地方。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-blue)' }}>📝</span>
            <span>確認無誤後，請點擊右下角寫入 Notion。</span>
          </li>
        </ul>
        <div style={{ marginTop: '2rem' }}>
          <button className="btn-secondary" onClick={() => router.push('/')} style={{ width: '100%' }}>
            ← 返回重新上傳
          </button>
        </div>
      </aside>

      {/* Notes */}
      <main className="cornell-notes">
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          
          {/* Tabs Navigation */}
          {sections.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              {sections.map((section, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: activeTab === idx ? 'var(--google-blue)' : 'var(--bg-secondary)',
                    color: activeTab === idx ? 'white' : 'var(--text-secondary)',
                    fontWeight: activeTab === idx ? 'bold' : 'normal',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {section.unit}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
            <button
              className={!isEditing ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIsEditing(false)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              👁 預覽
            </button>
            <button
              className={isEditing ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIsEditing(true)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              ✏️ 編輯
            </button>
          </div>
          
          <div style={{ flex: 1, minHeight: '500px' }}>
            {sections.length > 0 ? (
              isEditing ? (
                <textarea
                  value={sections[activeTab].content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '500px',
                    padding: '1rem',
                    border: '1px solid var(--border-focus)',
                    borderRadius: '4px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
              ) : (
                <div className="prose" style={{ padding: '1rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sections[activeTab].content}</ReactMarkdown>
                </div>
              )
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>無內容可預覽</p>
            )}
          </div>
        </div>
      </main>

      {/* Summary */}
      <footer className="cornell-summary" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
        {error && <span style={{ color: 'var(--google-red)' }}>⚠️ {error}</span>}
        {success && <span style={{ color: 'var(--google-green)', fontWeight: 'bold' }}>{success}</span>}
        
        <button
          className="btn-primary"
          onClick={handleWriteNotion}
          disabled={loading || sections.length === 0}
        >
          {loading ? '📝 寫入中...' : '確認並寫入 Notion →'}
        </button>
      </footer>
    </div>
  );
}
