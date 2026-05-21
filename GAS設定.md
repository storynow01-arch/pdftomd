# 📅 Google Apps Script (GAS) 部署與安全金鑰設定指南

本指南將引導您如何將本系統的 Google Apps Script (GAS) 程式碼部署至 Google 帳戶中，並設定 **「GAS 安全驗證金鑰」** 以保障您的行事曆隱私安全。

---

## 🛠️ Google Apps Script 完整程式碼

請將以下程式碼複製，並貼入您的 Google Apps Script 專案中：

```javascript
// ============================================================
// Google Apps Script - Calendar 操作腳本
// 複製此程式碼到 script.google.com 並部署為 Web App
// ============================================================

/**
 * 處理 POST 請求（來自 Next.js 後端）
 * 支援的 action：addEvent, addEvents, deleteEvent, listEvents
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // 驗證密鑰（從後台 Script Properties 讀取，與 Next.js 輸入的 Secret Key 一致）
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
```

---

## 🔑 如何設定「GAS 安全驗證金鑰」？

> [!IMPORTANT]  
> 設定安全驗證金鑰，可以確保只有本系統能存取您的日曆。即使您的 GAS API 網址流出，其他人沒有這串自訂金鑰，也無法修改您的 Google 行事曆。

您可以從以下 **兩種方法** 中選擇一種來設定您的金鑰：

### 💡 方法一：在 GAS 編輯器中修改並直接執行（最簡單、最直覺）

1. **修改程式碼**：
   在 GAS 編輯器中，將程式碼最底部的 `'YOUR_SECRET_KEY'` 改為您自訂的一串密碼（例如：`mySecureKey2026`）。
   ```javascript
   function setupSecretKey() {
     PropertiesService.getScriptProperties().setProperty('SECRET_KEY', 'mySecureKey2026');
     Logger.log('密鑰設定完成');
   }
   ```
2. **選取並執行**：
   * 在 GAS 編輯器上方的工具列中，展開 **「要執行的函數」** 下拉選單，選取 **`setupSecretKey`**。
   * 點擊旁邊的 **「執行 (▶️)」** 按鈕。
   * *(首次執行時，Google 會跳出「需要授權」權限視窗，請一路點選「允許」與「繼續執行」)*。
3. **抹除程式碼痕跡**（資安好習慣）：
   執行成功後，此金鑰已經永久儲存至 Google 腳本的後台安全屬性中。您可以將代碼中的 `'mySecureKey2026'` 重新改回 `'YOUR_SECRET_KEY'`，這樣即使代碼不小心外流，您的真實密碼也不會曝光！

---

### ⚙️ 方法二：在 GAS 專案設定中手動新增（最安全，不需更改程式碼）

1. 在 GAS 編輯器左側導覽列，點擊 **「齒輪圖示 ⚙️ (專案設定)」**。
2. 滾動至頁面最下方，找到 **「指令碼屬性 (Script Properties)」** 區塊。
3. 點擊 **「新增指令碼屬性」**（或是 Edit script properties）按鈕：
   * **屬性 (Property)** 欄位填入：`SECRET_KEY`
   * **值 (Value)** 欄位填入：您自訂的密碼（例如：`mySecureKey2026`）
4. 點擊 **「儲存指令碼屬性」** 即設定完成！

---

## 🚀 部署為 Web App 步驟

設定完金鑰後，您需要將此腳本部署，才能取得對接網址：

1. 點擊 GAS 編輯器右上角的 **「部署」** -> **「新增部署」**。
2. 點擊左側「選取類型」齒輪，選取 **「網頁應用程式 (Web App)」**。
3. 進行設定：
   * **說明**：輸入自訂備忘（例如：`v1.0.0`）。
   * **委託產生的主體 (Execute as)**：選取 **「我 (Me)」** *(以您的 Google 權限來存取日曆)*。
   * **誰有權限存取 (Who has access)**：選取 **「任何人 (Anyone)」** *(以利本系統進行連線；請放心，我們已有 Secret Key 驗證防護，其他人無法任意存取)*。
4. 點擊 **「部署」**。
5. 部署完成後，複製畫面上顯示的 **「網頁應用程式 URL」**。

---

## 🔗 在網頁首頁進行對接

將複製好的資料回到本系統首頁的 **「🔧 個人 API 設定 (免部署自訂金鑰)」** 中填寫：

1. **Google Calendar GAS URL**：貼上部署取得的 **「網頁應用程式 URL」**。
2. **GAS Secret Key**：填入您剛才設定的自訂密碼（例如：`mySecureKey2026`）。

填寫完成後即可永久記憶於您本機的瀏覽器中，您可以隨時在預覽與同步頁面安全地將行事曆一鍵同步至 Google Calendar！
