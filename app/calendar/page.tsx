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

/** 轉義 ICS 特殊字元以防規格破裂 */
function escapeIcsText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/** 格式化日期為 ICS 標準規格 */
function formatDateToIcs(dateStr: string, isAllDay: boolean, isEnd = false): string {
  const date = new Date(dateStr);
  
  if (isNaN(date.getTime())) {
    const clean = dateStr.replace(/[-:]/g, '');
    if (isAllDay) return clean.split('T')[0];
    return clean;
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  
  if (isAllDay) {
    if (isEnd) {
      // RFC 5545: 全天事件的 DTEND 必須是結束日期當天的下一天
      const endDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      const ey = endDate.getFullYear();
      const em = String(endDate.getMonth() + 1).padStart(2, '0');
      const ed = String(endDate.getDate()).padStart(2, '0');
      return `${ey}${em}${ed}`;
    }
    return `${yyyy}${mm}${dd}`;
  } else {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
  }
}

/** 生成符合 RFC 5545 標準的 .ics 格式檔案內容 */
function generateIcsContent(events: CalendarEvent[]): string {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//Calendar Parser//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  // 使用標準 UTC 當前時間做為 DTSTAMP
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  events.forEach((event, idx) => {
    ics.push('BEGIN:VEVENT');
    ics.push(`UID:event-${idx}-${nowStr}@antigravity.parser`);
    ics.push(`DTSTAMP:${nowStr}`);
    
    if (event.isAllDay) {
      ics.push(`DTSTART;VALUE=DATE:${formatDateToIcs(event.startTime, true, false)}`);
      ics.push(`DTEND;VALUE=DATE:${formatDateToIcs(event.endTime, true, true)}`);
    } else {
      ics.push(`DTSTART:${formatDateToIcs(event.startTime, false, false)}`);
      ics.push(`DTEND:${formatDateToIcs(event.endTime, false, true)}`);
    }
    
    ics.push(`SUMMARY:${escapeIcsText(event.title)}`);
    
    if (event.description) {
      ics.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.location) {
      ics.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    
    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
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
  const [showIcsGuide, setShowIcsGuide] = useState(false);
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

  const handleDownloadIcs = () => {
    const toDownload = events.filter((e) => selected.has(e.id));
    if (toDownload.length === 0) {
      setError('請至少選擇一個事件進行下載');
      return;
    }
    setError('');
    try {
      const icsContent = generateIcsContent(toDownload);
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const dateLabel = new Date().toISOString().split('T')[0].replace(/-/g, '');
      link.href = url;
      link.download = `calendar_events_${dateLabel}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // 顯示下載成功暨日曆匯入指南
      setShowIcsGuide(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '下載行事曆檔案失敗');
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
                📋 全部 <span style={{ opacity: 0.85, fontSize: '0.85em', marginLeft: '0.15rem' }}>({events.length})</span>
              </button>
              {units.map((unit) => {
                const count = events.filter(e => e.unit === unit).length;
                return (
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
                    {unit} <span style={{ opacity: 0.85, fontSize: '0.85em', marginLeft: '0.15rem' }}>({count})</span>
                  </button>
                );
              })}
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
        gap: '0.8rem',
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
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 返回預覽（次要按鈕） */}
        <button
          className="btn-secondary"
          onClick={() => router.push('/preview')}
          style={{ 
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)', 
            backdropFilter: 'blur(8px)', 
            padding: '0.55rem 1.1rem', 
            fontSize: '0.9rem',
            transition: 'transform 0.2s, background-color 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          ← 返回預覽
        </button>

        {/* 主要操作按鈕區（並列） */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 免設定下載 .ics */}
          <button
            className="btn-primary"
            style={{ 
              backgroundColor: 'var(--google-blue)', 
              boxShadow: '0 4px 16px rgba(66,133,244,0.45)', 
              padding: '0.75rem 1.5rem', 
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'transform 0.2s, filter 0.2s'
            }}
            onClick={handleDownloadIcs}
            disabled={selected.size === 0}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}
          >
            <span>📥</span> 下載 .ics 檔案 (免設定)
          </button>

          {/* 同步 Google 行事曆 (使用個人 GAS) */}
          <button
            className="btn-primary"
            style={{ 
              backgroundColor: 'var(--google-green)', 
              boxShadow: '0 4px 16px rgba(52,168,83,0.45)', 
              padding: '0.75rem 1.5rem', 
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'transform 0.2s, filter 0.2s'
            }}
            onClick={handleSync}
            disabled={loading || selected.size === 0}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}
          >
            {loading ? '同步中...' : `📅 加入 Google 日曆 (GAS)`}
          </button>
        </div>
      </div>

      {/* ── 下載成功暨日曆匯入指南 Modal ───────────────────── */}
      {showIcsGuide && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div className="card" style={{
            width: '90%',
            maxWidth: '560px',
            padding: '2.2rem',
            borderRadius: '16px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            position: 'relative',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {/* 關閉按鈕 */}
            <button 
              onClick={() => setShowIcsGuide(false)}
              style={{
                position: 'absolute',
                top: '1.2rem',
                right: '1.2rem',
                background: 'none',
                border: 'none',
                fontSize: '1.3rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color 0.2s, transform 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
              <div style={{ fontSize: '3.8rem', marginBottom: '0.5rem', display: 'inline-block' }}>🎉</div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--google-green)', margin: 0, letterSpacing: '0.5px' }}>
                行事曆檔案下載成功！
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.6rem', lineHeight: 1.5 }}>
                成功下載了 <strong>{events.filter(e => selected.has(e.id)).length}</strong> 個日程事件，請參考下方指南將其快速匯入：
              </p>
            </div>

            {/* 匯入教學分流 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* 🌐 Google Calendar (網頁版) */}
              <div style={{
                padding: '1.2rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(66, 133, 244, 0.04)',
                border: '1px solid rgba(66, 133, 244, 0.12)'
              }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--google-blue)', margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🌐</span> 匯入至 Google 日曆 (電腦網頁版)
                </h3>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  <li>開啟 <a href="https://calendar.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--google-blue)', textDecoration: 'underline', fontWeight: 600 }}>Google 日曆網頁</a></li>
                  <li>點選右上角齒輪圖示 ⚙️ 進入 <strong>「設定」</strong></li>
                  <li>在左側導覽列中，點選 <strong>「匯入與匯出」</strong></li>
                  <li>從電腦上選擇剛下載的 <code>.ics</code> 檔案並按下 <strong>「匯入」</strong> 即可！</li>
                </ol>
              </div>

              {/* 💻 Apple Calendar / 手機內建 */}
              <div style={{
                padding: '1.2rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(52, 168, 83, 0.04)',
                border: '1px solid rgba(52, 168, 83, 0.12)'
              }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--google-green)', margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>💻</span> 匯入至 Apple 日曆 / 內建日曆 (手機或電腦)
                </h3>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  <li><strong>雙擊</strong> (Double Click) 剛下載的 <code>.ics</code> 檔案</li>
                  <li>系統將會自動喚起您設備上的<strong>內建日曆應用程式</strong></li>
                  <li>在彈出的對話框中選取您要同步的日曆，點擊 <strong>「加入/確認」</strong> 即可！</li>
                </ol>
              </div>
            </div>

            {/* 底部按鈕 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.8rem', marginTop: '2.2rem' }}>
              <button 
                className="btn-primary" 
                onClick={() => {
                  setShowIcsGuide(false);
                  router.push('/');
                }}
                style={{ padding: '0.65rem 1.6rem', fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(66,133,244,0.2)' }}
              >
                ＋ 解析新的 PDF
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => setShowIcsGuide(false)}
                style={{ padding: '0.65rem 1.6rem', fontSize: '0.95rem' }}
              >
                留在本頁檢查
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
