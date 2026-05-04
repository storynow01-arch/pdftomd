# Google Apps Script Calendar 設定說明

## 步驟 1：建立 GAS 腳本

1. 前往 [script.google.com](https://script.google.com)
2. 點「新增專案」
3. 將專案名稱改為：`行事曆解析系統`
4. 刪除預設的空白函數
5. 將 `calendar.gs` 的**全部內容**複製貼上

## 步驟 2：設定密鑰

1. 在 GAS 編輯器左側，找到 `setupSecretKey` 函數
2. 先修改程式碼，把 `YOUR_SECRET_KEY` 換成您自訂的密鑰（例如：`mySecret123abc`）
3. 點「執行」→ 選擇 `setupSecretKey` 函數執行（只需執行一次）
4. 第一次執行會要求授權，點「審查權限」→「允許」

## 步驟 3：部署為 Web App

1. 右上角點「部署」→「新部署」
2. 點齒輪圖示 → 選「Web 應用程式」
3. 設定：
   - **說明**：`行事曆 API v1`
   - **執行身分**：**我（您的 Gmail）**
   - **誰可以存取**：**所有人**（允許匿名請求，由密鑰控制安全性）
4. 點「部署」
5. 複製「Web 應用程式 URL」

## 步驟 4：填入環境變數

將以下內容填入 `.env.local`：

```
GAS_CALENDAR_URL=https://script.google.com/macros/s/你的腳本ID/exec
GAS_SECRET_KEY=你在步驟2設定的密鑰
```

## 更新腳本後的重新部署

修改 GAS 程式碼後：
1. 點「部署」→「管理部署」
2. 點鉛筆圖示編輯 → 版本選「新版本」
3. 點「部署」

> ⚠️ 每次更新腳本後都要重新部署，URL 不會改變。
