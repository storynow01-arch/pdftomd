'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 'bold',
            backgroundColor: i + 1 === current ? 'var(--google-blue)' : i + 1 < current ? 'var(--google-green)' : 'var(--bg-secondary)',
            color: i + 1 <= current ? 'white' : 'var(--text-muted)'
          }}>
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

/** 依據關鍵字篩選 Markdown 內容中的事件區塊 */
function filterMarkdownByKeyword(md: string, keyword: string): string {
  if (!keyword.trim()) return md;
  const lowerKeyword = keyword.toLowerCase();
  const unitSections = md.split(/(?=^## 單位：)/m);
  const filteredSections = unitSections.map(section => {
    const unitHeaderMatch = section.match(/^(## 單位：.*?)$/m);
    const unitHeader = unitHeaderMatch ? unitHeaderMatch[1] : '';
    const eventBlocks = section.split(/(?=^### )/m);
    const filtered = eventBlocks.filter(block => {
      if (!block.trim().startsWith('### ')) return false;
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
  const [filename, setFilename] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // ── 複選狀態：空 Set = 全部模式 ──────────────────────────────
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const isAllMode = selectedUnits.size === 0;

  // 只有剛好選一個單位時才允許編輯
  const singleEditIdx = useMemo(() => {
    if (selectedUnits.size !== 1) return -1;
    const unit = Array.from(selectedUnits)[0];
    return sections.findIndex(s => s.unit === unit);
  }, [selectedUnits, sections]);

  // 全部內容
  const getFullMarkdown = useCallback(
    () => sections.map(s => s.content).join('\n\n'),
    [sections]
  );

  // 已選單位內容（全部模式 = 全部）
  const getSelectedMarkdown = useCallback(() => {
    if (isAllMode) return sections.map(s => s.content).join('\n\n');
    return sections.filter(s => selectedUnits.has(s.unit)).map(s => s.content).join('\n\n');
  }, [sections, selectedUnits, isAllMode]);

  useEffect(() => {
    const md = sessionStorage.getItem('parsedMarkdown');
    const fn = sessionStorage.getItem('sourceFilename');
    if (!md) { router.push('/'); return; }
    const parts = md.split(/(?=^## 單位：)/m).filter(p => p.trim().length > 0);
    const parsedSections = parts.map(part => {
      const match = part.match(/^## 單位：(.*?)$/m);
      const unit = match ? match[1].trim() : '其他';
      return { unit, content: part.trim() };
    });
    setSections(parsedSections);
    setFilename(fn || 'document.pdf');
  }, [router]);

  // 當前顯示內容
  const displayContent = useMemo(() => {
    const rawContent = isAllMode
      ? sections.map(s => s.content).join('\n\n')
      : sections.filter(s => selectedUnits.has(s.unit)).map(s => s.content).join('\n\n');
    return filterMarkdownByKeyword(rawContent, searchKeyword);
  }, [sections, selectedUnits, isAllMode, searchKeyword]);

  // 篩選計數
  const filteredEventCount = useMemo(() => {
    if (!searchKeyword.trim()) return null;
    const matches = displayContent.match(/^### /gm);
    return matches ? matches.length : 0;
  }, [displayContent, searchKeyword]);

  // ── Tab 操作 ───────────────────────────────────────────────
  const toggleUnit = (unit: string) => {
    setIsEditing(false);
    setSelectedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  };

  const selectAll = () => {
    setIsEditing(false);
    setSelectedUnits(new Set()); // 清空 = 全部模式
  };

  // ── Notion 寫入 ────────────────────────────────────────────
  const handleWriteNotion = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const markdown = getSelectedMarkdown(); // 只寫所選單位
    try {
      const title = `行事曆解析 - ${filename} - ${new Date().toLocaleDateString('zh-TW')}`;
      const res = await fetch('/api/notion/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem('notionPageUrl', data.pageUrl);
      sessionStorage.setItem('notionPageId', data.pageId);
      // 行事曆頁面只顯示並處理使用者在預覽頁勾選的單位事件
      sessionStorage.setItem('confirmedMarkdown', getSelectedMarkdown());
      setSuccess('✅ 已寫入 Notion！');
      setTimeout(() => router.push('/calendar'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setLoading(false);
    }
  };

  // ── 跳過 Notion ────────────────────────────────────────────
  const handleSkipNotion = () => {
    // 行事曆頁面只顯示並處理使用者在預覽頁勾選的單位事件
    sessionStorage.setItem('confirmedMarkdown', getSelectedMarkdown());
    sessionStorage.removeItem('notionPageUrl');
    sessionStorage.removeItem('notionPageId');
    router.push('/calendar');
  };

  const handleContentChange = (newContent: string) => {
    if (singleEditIdx === -1) return;
    const newSections = [...sections];
    newSections[singleEditIdx].content = newContent;
    setSections(newSections);
  };

  const selectedLabel = Array.from(selectedUnits).join('、');

  return (
    <div className="cornell-layout" style={{ paddingBottom: '6rem' }}>
      {/* Header */}
      <header className="cornell-header">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--google-blue)' }}>📋</span> 預覽解析結果
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>來源檔案：{filename}</p>
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
            <span>「預覽模式」可查看實際格式。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-yellow)' }}>✏️</span>
            <span>選取單一單位後可切換「編輯模式」。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-blue)' }}>🔲</span>
            <span>可複選單位，只寫入所選單位至 Notion。</span>
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

          {/* ── 單位分頁（複選） ─────────────────────────────── */}
          {sections.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              {/* 全部 Tab */}
              <button
                onClick={selectAll}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '20px',
                  border: `2px solid ${isAllMode ? 'var(--google-blue)' : 'transparent'}`,
                  backgroundColor: isAllMode ? 'var(--google-blue)' : 'var(--bg-secondary)',
                  color: isAllMode ? 'white' : 'var(--text-secondary)',
                  fontWeight: isAllMode ? 'bold' : 'normal',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.18s ease',
                }}
              >
                📋 全部 ({sections.reduce((acc, s) => acc + (s.content.match(/^### /gm)?.length || 0), 0)})
              </button>

              {/* 各單位 Tab（複選） */}
              {sections.map((section, idx) => {
                const isSelected = selectedUnits.has(section.unit);
                return (
                  <button
                    key={idx}
                    onClick={() => toggleUnit(section.unit)}
                    style={{
                      padding: '0.4rem 1rem',
                      borderRadius: '20px',
                      border: `2px solid ${isSelected ? 'var(--google-blue)' : 'transparent'}`,
                      backgroundColor: isSelected ? 'var(--google-blue)' : 'var(--bg-secondary)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.18s ease',
                      position: 'relative',
                    }}
                  >
                    {section.unit} <span style={{ opacity: 0.85, fontSize: '0.85em', marginLeft: '0.15rem' }}>({section.content.match(/^### /gm)?.length || 0})</span>
                    {/* 已選角標 */}
                    {isSelected && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 14, height: 14, borderRadius: '50%',
                        backgroundColor: 'var(--google-green)',
                        color: 'white', fontSize: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 'bold',
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── 已選提示 ────────────────────────────────────── */}
          {!isAllMode && (
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📌 已選：</span>
              <strong style={{ color: 'var(--google-blue)' }}>{selectedLabel}</strong>
              <span style={{ color: 'var(--text-muted)' }}>（Notion 只寫這些單位）</span>
            </div>
          )}

          {/* ── 搜尋篩選框 + 預覽/編輯切換 ───────────────────── */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={!isEditing ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIsEditing(false)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              👁 預覽
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                className={singleEditIdx !== -1 && isEditing ? 'btn-primary' : 'btn-secondary'}
                onClick={() => {
                  if (singleEditIdx !== -1) setIsEditing(true);
                }}
                disabled={singleEditIdx === -1}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  opacity: singleEditIdx === -1 ? 0.5 : 1,
                  cursor: singleEditIdx === -1 ? 'not-allowed' : 'pointer'
                }}
                title={singleEditIdx === -1 ? '請僅選取單一單位來進行編輯' : '切換至編輯模式'}
              >
                ✏️ 編輯
              </button>
              {singleEditIdx === -1 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  (需選單一單位才可編輯)
                </span>
              )}
            </div>
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
            {filteredEventCount !== null && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                找到 <strong style={{ color: 'var(--google-blue)' }}>{filteredEventCount}</strong> 筆
              </span>
            )}
          </div>

          {/* ── 內容區 ──────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: '500px' }}>
            {sections.length > 0 ? (
              isEditing && singleEditIdx !== -1 ? (
                <textarea
                  value={sections[singleEditIdx]?.content || ''}
                  onChange={(e) => handleContentChange(e.target.value)}
                  style={{
                    width: '100%', height: '100%', minHeight: '500px',
                    padding: '1rem',
                    border: '1px solid var(--border-focus)',
                    borderRadius: '4px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.9rem', lineHeight: '1.6',
                    resize: 'vertical', outline: 'none',
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

      {/* ── 浮動按鈕（右下角 fixed） ──────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '0.6rem',
        zIndex: 1000,
      }}>
        {/* 狀態訊息浮動顯示 */}
        {(error || success) && (
          <div style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            backgroundColor: error ? 'rgba(234,67,53,0.1)' : 'rgba(52,168,83,0.1)',
            border: `1px solid ${error ? 'var(--google-red)' : 'var(--google-green)'}`,
            fontSize: '0.9rem',
            color: error ? 'var(--google-red)' : 'var(--google-green)',
            backdropFilter: 'blur(8px)',
            maxWidth: '360px',
          }}>
            {error ? `⚠️ ${error}` : success}
          </div>
        )}

        {/* 次要：跳過 Notion */}
        <button
          className="btn-secondary"
          onClick={handleSkipNotion}
          disabled={loading || sections.length === 0}
          title="不寫入 Notion，直接前往行事曆"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', padding: '0.55rem 1.1rem', fontSize: '0.9rem' }}
        >
          跳過 Notion →
        </button>

        {/* 主要：寫入 Notion */}
        <button
          className="btn-primary"
          onClick={handleWriteNotion}
          disabled={loading || sections.length === 0}
          style={{ boxShadow: '0 4px 16px rgba(66,133,244,0.45)', padding: '0.75rem 1.5rem', fontSize: '1rem' }}
        >
          {loading
            ? '📝 寫入中...'
            : isAllMode
              ? '寫入 Notion（全部）→'
              : `寫入 Notion（${selectedUnits.size} 個單位）→`}
        </button>
      </div>
    </div>
  );
}
