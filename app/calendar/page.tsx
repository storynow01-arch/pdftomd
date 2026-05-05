'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  description?: string;
  location?: string;
  unit?: string; // 所屬單位
}

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

/** 從 Markdown 文字中解析出事件列表（含單位資訊） */
function parseEventsFromMarkdown(md: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  // 1. 先依據單位切分
  const sections = md.split(/(?=^## 單位：)/m);

  sections.forEach((section, secIdx) => {
    // 找出單位名稱
    const unitMatch = section.match(/^## 單位：(.*?)$/m);
    const unitRaw = unitMatch ? unitMatch[1].trim().replace(/【|】/g, '') : '';
    const unitPrefix = unitRaw ? `【${unitRaw}】` : '';

    // 2. 依據事件切分
    const eventBlocks = section.split(/(?=^### )/m);
    
    eventBlocks.forEach((block, evIdx) => {
      if (!block.trim().startsWith('### ')) return;
      
      const lines = block.split('\n');
      const rawTitle = lines[0].replace(/^### /, '').trim();
      if (!rawTitle) return;
      
      const title = unitPrefix ? `${unitPrefix} ${rawTitle}` : rawTitle;

      let startDateStr = '';
      let endDateStr = '';
      let timeStr = '';
      let location = '';
      let description = '';

      lines.forEach((line) => {
        // 舊版相容與新版格式
        if (line.includes('**開始日期**')) startDateStr = line.replace(/.*\*\*開始日期\*\*：?/, '').trim();
        else if (line.includes('**日期**')) startDateStr = line.replace(/.*\*\*日期\*\*：?/, '').trim(); // 相容舊版
        
        if (line.includes('**結束日期**')) endDateStr = line.replace(/.*\*\*結束日期\*\*：?/, '').trim();
        
        if (line.includes('**時間**')) timeStr = line.replace(/.*\*\*時間\*\*：?/, '').trim();
        if (line.includes('**地點**')) location = line.replace(/.*\*\*地點\*\*：?/, '').trim();
        if (line.includes('**說明**')) description = line.replace(/.*\*\*說明\*\*：?/, '').trim();
      });

      if (!startDateStr) return;
      if (!endDateStr) endDateStr = startDateStr; // 若無結束日期，則等於開始日期

      // 解析時間
      const isAllDay = !timeStr || timeStr === '全天';
      const startTime = isAllDay
        ? `${startDateStr}T00:00:00`
        : `${startDateStr}T${timeStr.split('-')[0].trim().padStart(5, '0')}:00`;
        
      const endTime = isAllDay
        ? `${endDateStr}T23:59:59`
        : `${endDateStr}T${(timeStr.split('-')[1] || timeStr.split('-')[0]).trim().padStart(5, '0')}:00`;

      events.push({
        id: `event-${secIdx}-${evIdx}`,
        title,
        startTime,
        endTime,
        isAllDay,
        location,
        description,
        unit: unitRaw || '其他',
      });
    });
  });

  return events;
}

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notionUrl, setNotionUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeUnit, setActiveUnit] = useState<string>('全部'); // 當前選中的單位分頁

  // 從事件中提取所有單位名稱
  const units = useMemo(() => {
    const unitSet = new Set<string>();
    events.forEach(e => { if (e.unit) unitSet.add(e.unit); });
    return Array.from(unitSet);
  }, [events]);

  // 依據分頁 + 關鍵字篩選事件（不影響勾選狀態）
  const filteredEvents = useMemo(() => {
    let filtered = events;
    
    // 先依單位篩選
    if (activeUnit !== '全部') {
      filtered = filtered.filter(e => e.unit === activeUnit);
    }
    
    // 再依關鍵字篩選
    if (searchKeyword.trim()) {
      const lower = searchKeyword.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(lower) ||
        e.startTime.includes(lower) ||
        e.endTime.includes(lower) ||
        (e.location && e.location.toLowerCase().includes(lower)) ||
        (e.description && e.description.toLowerCase().includes(lower))
      );
    }
    
    return filtered;
  }, [events, activeUnit, searchKeyword]);

  // 當前分頁下被選中的事件數
  const selectedInTab = useMemo(() => {
    return filteredEvents.filter(e => selected.has(e.id)).length;
  }, [filteredEvents, selected]);

  useEffect(() => {
    const md = sessionStorage.getItem('confirmedMarkdown');
    const url = sessionStorage.getItem('notionPageUrl');
    if (!md) { router.push('/'); return; }
    setNotionUrl(url || '');
    const parsed = parseEventsFromMarkdown(md);
    setEvents(parsed);
    setSelected(new Set(parsed.map((e) => e.id)));
  }, [router]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // 全選/取消全選：只影響當前分頁顯示的事件
  const selectAllInTab = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      filteredEvents.forEach(e => next.add(e.id));
      return next;
    });
  }, [filteredEvents]);

  const deselectAllInTab = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      filteredEvents.forEach(e => next.delete(e.id));
      return next;
    });
  }, [filteredEvents]);

  const handleSync = async () => {
    const toSync = events.filter((e) => selected.has(e.id));
    if (toSync.length === 0) { setError('請至少選擇一個事件'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: toSync }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSynced(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '同步失敗');
    } finally {
      setLoading(false);
    }
  };

  if (synced) {
    return (
      <div className="cornell-layout">
        <header className="cornell-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
          <h1 style={{ fontSize: '2rem', color: 'var(--google-green)', marginBottom: '1rem' }}>
            全部完成！
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            已成功將 {selected.size} 個事件加入 Google 行事曆
          </p>
        </header>
        <main className="cornell-notes" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'flex-start' }}>
          {notionUrl && (
            <a href={notionUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
              📝 查看 Notion Page
            </a>
          )}
          <button className="btn-primary" onClick={() => router.push('/')}>
            ＋ 解析新的 PDF
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="cornell-layout">
      {/* Header */}
      <header className="cornell-header">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--google-blue)' }}>📅</span> 加入 Google 行事曆
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          確認解析出的事件，並選擇要同步至 Google Calendar 的項目。
        </p>
        <StepIndicator current={4} />
      </header>

      {/* Cue */}
      <aside className="cornell-cue">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--google-blue)' }}>
          同步設定
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-green)' }}>✓</span>
            <span>預設已全選所有成功解析的事件。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-yellow)' }}>💡</span>
            <span>點擊事件卡片即可取消或勾選。</span>
          </li>
          <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--google-blue)' }}>📋</span>
            <span>使用分頁切換不同單位的事件。</span>
          </li>
        </ul>
        
        {notionUrl && (
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Notion 狀態</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--google-green)', marginBottom: '0.5rem' }}>✅ 已成功寫入頁面</p>
            <a href={notionUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--google-blue)', textDecoration: 'none' }}>
              前往查看 Notion →
            </a>
          </div>
        )}
      </aside>

      {/* Notes */}
      <main className="cornell-notes">
        <div className="card" style={{ height: '100%', minHeight: '500px', paddingBottom: '1rem' }}>

          {/* 單位分頁 Tab */}
          {units.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveUnit('全部')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: activeUnit === '全部' ? 'var(--google-blue)' : 'var(--bg-secondary)',
                  color: activeUnit === '全部' ? 'white' : 'var(--text-secondary)',
                  fontWeight: activeUnit === '全部' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease'
                }}
              >
                📋 全部
              </button>
              {units.map((unit) => (
                <button
                  key={unit}
                  onClick={() => setActiveUnit(unit)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: activeUnit === unit ? 'var(--google-blue)' : 'var(--bg-secondary)',
                    color: activeUnit === unit ? 'white' : 'var(--text-secondary)',
                    fontWeight: activeUnit === unit ? 'bold' : 'normal',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {unit}
                </button>
              ))}
            </div>
          )}

          {/* 統計 + 全選/取消全選 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {activeUnit === '全部' ? `共 ${events.length} 個事件` : `${activeUnit} ${filteredEvents.length} 個事件`}
              {' '}(本頁已選 {selectedInTab})
              {searchKeyword && ` / 篩選出 ${filteredEvents.length} 筆`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-secondary"
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                onClick={selectAllInTab}
              >
                本頁全選
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                onClick={deselectAllInTab}
              >
                本頁取消
              </button>
            </div>
          </div>

          {/* 搜尋篩選框 */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>🔍</span>
            <input
              id="calendar-event-search"
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜尋事件（標題、日期、地點...）"
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

          {/* 事件列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => toggleSelect(event.id)}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '1rem',
                  border: `1px solid ${selected.has(event.id) ? 'var(--google-blue)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  backgroundColor: selected.has(event.id) ? 'rgba(66, 133, 244, 0.05)' : 'var(--bg-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ width: 24, paddingTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(event.id)}
                    readOnly
                    style={{ width: 18, height: 18, accentColor: 'var(--google-blue)', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>{event.title}</h4>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>📅 {event.startTime.split('T')[0]}</span>
                    {!event.isAllDay && (
                      <span>🕐 {event.startTime.split('T')[1]?.slice(0, 5)} - {event.endTime.split('T')[1]?.slice(0, 5)}</span>
                    )}
                    {event.location && <span>📍 {event.location}</span>}
                  </div>
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                {events.length === 0 ? '無可解析的事件，請確認 Markdown 格式是否正確。' : '目前篩選條件下沒有符合的事件。'}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 浮動按鈕（右下角 fixed） */}
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
        {/* 錯誤訊息 */}
        {error && (
          <div style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(234,67,53,0.1)',
            border: '1px solid var(--google-red)',
            fontSize: '0.9rem',
            color: 'var(--google-red)',
            backdropFilter: 'blur(8px)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 次要：返回預覽 */}
        <button
          className="btn-secondary"
          onClick={() => router.push('/preview')}
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', padding: '0.55rem 1.1rem', fontSize: '0.9rem' }}
        >
          ← 返回預覽
        </button>

        {/* 主要：加入行事曆 */}
        <button
          className="btn-primary"
          style={{ backgroundColor: 'var(--google-green)', boxShadow: '0 4px 16px rgba(52,168,83,0.45)', padding: '0.75rem 1.5rem', fontSize: '1rem' }}
          onClick={handleSync}
          disabled={loading || selected.size === 0}
        >
          {loading ? '同步中...' : `📅 加入 ${selected.size} 個事件`}
        </button>
      </div>
    </div>
  );
}
