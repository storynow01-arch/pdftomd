'use client';

import { useState, useEffect, useMemo } from 'react';
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

/**
 * 依據關鍵字篩選 Markdown 內容中的事件區塊
 * 以 "### " 作為事件分隔符，只保留標題或內容包含關鍵字的區塊
 */
function filterMarkdownByKeyword(md: string, keyword: string): string {
  if (!keyword.trim()) return md;

  const lowerKeyword = keyword.toLowerCase();
  // 先用 "## 單位：" 切分出各個單位段落
  const unitSections = md.split(/(?=^## 單位：)/m);

  const filteredSections = unitSections.map(section => {
    // 取出單位標題行
    const unitHeaderMatch = section.match(/^(## 單位：.*?)$/m);
    const unitHeader = unitHeaderMatch ? unitHeaderMatch[1] : '';

    // 切出事件區塊（以 ### 分隔）
    const eventBlocks = section.split(/(?=^### )/m);
    const filtered = eventBlocks.filter(block => {
      // 保留非事件區塊（例如單位標題段落）
      if (!block.trim().startsWith('### ')) {
        // 如果是單位標題本身，先保留，稍後判斷是否有匹配事件
        return false;
      }
      return block.toLowerCase().includes(lowerKeyword);
    });

    if (filtered.length === 0) return '';
    return unitHeader + '\n\n' + filtered.join('\n');
  });

  const result = filteredSections.filter(s => s.trim()).join('\n\n');
  return result || `> 🔍 沒有找到包含「${keyword}」的事件`;
}

export default function PreviewPage() {
  const router = useRouter();
  const [sections, setSections] = useState<{ unit: string; content: string }[]>([]);
  // activeTab: -1 表示「全部」，0~n 表示各單位分頁
  const [activeTab, setActiveTab] = useState<number>(-1);
  const [filename, setFilename] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

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

  // 計算當前顯示內容（考慮篩選和分頁）
  const displayContent = useMemo(() => {
    let rawContent: string;
    if (activeTab === -1) {
      // 全部分頁：合併所有內容
      rawContent = sections.map(s => s.content).join('\n\n');
    } else if (sections[activeTab]) {
      rawContent = sections[activeTab].content;
    } else {
      rawContent = '';
    }
    // 套用關鍵字篩選
    return filterMarkdownByKeyword(rawContent, searchKeyword);
  }, [sections, activeTab, searchKeyword]);

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

  // 跳過 Notion，直接前往行事曆步驟
  const handleSkipNotion = () => {
    const fullMarkdown = getFullMarkdown();
    sessionStorage.setItem('confirmedMarkdown', fullMarkdown);
    sessionStorage.removeItem('notionPageUrl');
    sessionStorage.removeItem('notionPageId');
    router.push('/calendar');
  };

  const handleContentChange = (newContent: string) => {

    if (activeTab === -1) {
      // 全部模式下不支援編輯，避免複雜度
      return;
    }
    const newSections = [...sections];
    newSections[activeTab].content = newContent;
    setSections(newSections);
  };

  // 計算篩選結果的事件數量
  const filteredEventCount = useMemo(() => {
    if (!searchKeyword.trim()) return null;
    const matches = displayContent.match(/^### /gm);
    return matches ? matches.length : 0;
  }, [displayContent, searchKeyword]);

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
            <span style={{ color: 'var(--google-blue)' }}>🔍</span>
            <span>使用「篩選」功能快速找到特定事件。</span>
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
              {/* 全部分頁 */}
              <button
                onClick={() => { setActiveTab(-1); setIsEditing(false); }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: activeTab === -1 ? 'var(--google-blue)' : 'var(--bg-secondary)',
                  color: activeTab === -1 ? 'white' : 'var(--text-secondary)',
                  fontWeight: activeTab === -1 ? 'bold' : 'normal',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease'
                }}
              >
                📋 全部
              </button>
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

          {/* 搜尋篩選框 + 預覽/編輯切換 */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={!isEditing ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIsEditing(false)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              👁 預覽
            </button>
            {activeTab !== -1 && (
              <button
                className={isEditing ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setIsEditing(true)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                ✏️ 編輯
              </button>
            )}

            {/* 篩選輸入框 */}
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>🔍</span>
              <input
                id="event-search"
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="輸入關鍵字篩選事件（如：段考、會議、研習...）"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--border-focus)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border-subtle)'; }}
              />
            </div>
            {/* 篩選結果計數 */}
            {filteredEventCount !== null && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                找到 <strong style={{ color: 'var(--google-blue)' }}>{filteredEventCount}</strong> 筆
              </span>
            )}
          </div>
          
          <div style={{ flex: 1, minHeight: '500px' }}>
            {sections.length > 0 ? (
              isEditing && activeTab !== -1 ? (
                <textarea
                  value={sections[activeTab]?.content || ''}
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
                    outline: 'none',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              ) : (
                <div className="prose" style={{ padding: '1rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                </div>
              )
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>無內容可預覽</p>
            )}
          </div>
        </div>
      </main>

      {/* Summary */}
      <footer className="cornell-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          className="btn-secondary"
          onClick={handleSkipNotion}
          disabled={loading || sections.length === 0}
          title="不寫入 Notion，直接前往選擇要加入行事曆的事件"
        >
          跳過 Notion，直接到行事曆 →
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error && <span style={{ color: 'var(--google-red)' }}>⚠️ {error}</span>}
          {success && <span style={{ color: 'var(--google-green)', fontWeight: 'bold' }}>{success}</span>}
          <button
            className="btn-primary"
            onClick={handleWriteNotion}
            disabled={loading || sections.length === 0}
          >
            {loading ? '📝 寫入中...' : '寫入 Notion 並繼續 →'}
          </button>
        </div>
      </footer>
    </div>
  );
}
