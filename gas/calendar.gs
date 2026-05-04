// ============================================================
// Google Apps Script - Calendar 操作腳本
// 複製此程式碼到 script.google.com 並部署為 Web App
// ============================================================

/**
 * 處理 POST 請求（來自 Next.js 後端）
 * 支援的 action：addEvent, deleteEvent, listEvents
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // 驗證密鑰（從環境變數讀取，與 Next.js .env.local 一致）
    const SECRET_KEY = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
    if (SECRET_KEY && data.secretKey !== SECRET_KEY) {
      return buildResponse(403, { error: '驗證失敗' });
    }

    const action = data.action;

    if (action === 'addEvent') {
      return handleAddEvent(data.event);
    } else if (action === 'addEvents') {
      return handleAddEvents(data.events);
    } else if (action === 'deleteEvent') {
      return handleDeleteEvent(data.eventId);
    } else if (action === 'listEvents') {
      return handleListEvents(data.startDate, data.endDate);
    } else {
      return buildResponse(400, { error: '未知的 action: ' + action });
    }
  } catch (err) {
    return buildResponse(500, { error: err.message });
  }
}

/**
 * 新增單一行事曆事件
 */
function handleAddEvent(event) {
  if (!event) return buildResponse(400, { error: '缺少 event 資料' });

  const calendar = CalendarApp.getDefaultCalendar();
  
  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);
  
  let calEvent;
  if (event.isAllDay) {
    calEvent = calendar.createAllDayEvent(
      event.title,
      startTime,
      { description: event.description || '', location: event.location || '' }
    );
  } else {
    calEvent = calendar.createEvent(
      event.title,
      startTime,
      endTime,
      { description: event.description || '', location: event.location || '' }
    );
  }

  return buildResponse(200, {
    success: true,
    eventId: calEvent.getId(),
    title: calEvent.getTitle(),
    message: '事件已成功加入 Google 行事曆'
  });
}

/**
 * 批次新增多個事件
 */
function handleAddEvents(events) {
  if (!events || !Array.isArray(events)) {
    return buildResponse(400, { error: '缺少 events 陣列' });
  }

  const results = [];
  const errors = [];

  events.forEach(function(event, index) {
    try {
      const response = handleAddEvent(event);
      const result = JSON.parse(response.getContent());
      results.push({ index: index, ...result });
    } catch (err) {
      errors.push({ index: index, error: err.message });
    }
  });

  return buildResponse(200, {
    success: true,
    added: results.length,
    errors: errors,
    results: results
  });
}

/**
 * 刪除行事曆事件
 */
function handleDeleteEvent(eventId) {
  if (!eventId) return buildResponse(400, { error: '缺少 eventId' });

  const calendar = CalendarApp.getDefaultCalendar();
  const event = calendar.getEventById(eventId);
  
  if (!event) {
    return buildResponse(404, { error: '找不到指定事件' });
  }

  event.deleteEvent();
  return buildResponse(200, { success: true, message: '事件已刪除' });
}

/**
 * 列出指定時間範圍的事件
 */
function handleListEvents(startDate, endDate) {
  const calendar = CalendarApp.getDefaultCalendar();
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const events = calendar.getEvents(start, end);
  
  const eventList = events.map(function(event) {
    return {
      id: event.getId(),
      title: event.getTitle(),
      startTime: event.getStartTime().toISOString(),
      endTime: event.getEndTime().toISOString(),
      description: event.getDescription(),
      location: event.getLocation()
    };
  });

  return buildResponse(200, { success: true, events: eventList });
}

/**
 * 建構 JSON 回應
 */
function buildResponse(statusCode, data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
// 設定密鑰（在 GAS 編輯器執行此函數一次即可）
// 把 YOUR_SECRET_KEY 換成和 .env.local 裡 GAS_SECRET_KEY 一樣的值
// ============================================================
function setupSecretKey() {
  PropertiesService.getScriptProperties().setProperty('SECRET_KEY', 'YOUR_SECRET_KEY');
  Logger.log('密鑰設定完成');
}
