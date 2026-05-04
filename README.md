# 行事曆解析系統（PDF → Notion → Google Calendar）

一個部署在 Vercel 的全自動行事曆解析系統。

## 功能流程

1. **上傳 PDF** → 支援任意格式的 PDF 文件
2. **AI 解析** → 使用 Gemini 2.0 Flash 提取行事曆資訊，輸出 Markdown
3. **預覽確認** → 可編輯 Markdown 內容
4. **寫入 Notion** → 自動建立 Notion 子頁面
5. **同步行事曆** → 透過 Google Apps Script 加入 Google 行事曆

## 快速開始

### 1. 複製環境變數

```bash
cp .env.example .env.local
```

### 2. 填入 API Keys

編輯 `.env.local`，填入以下資訊：

| 變數 | 說明 | 申請連結 |
|------|------|---------|
| `GEMINI_API_KEY` | Gemini API 金鑰 | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `NOTION_TOKEN` | Notion Integration Token | [notion.so/my-integrations](https://www.notion.so/my-integrations) |
| `NOTION_PAGE_ID` | 目標 Notion Page ID | 從 Page URL 複製 |
| `GAS_CALENDAR_URL` | GAS Web App URL | 詳見 gas/README.md |
| `GAS_SECRET_KEY` | 自訂驗證密鑰 | 自行設定 |

### 3. 設定 Google Apps Script（Google Calendar）

詳見 gas/README.md，約 5 分鐘完成。

### 4. 設定 Notion Integration

1. 前往 notion.so/my-integrations 建立 Integration
2. 複製 Internal Integration Token → 填入 NOTION_TOKEN
3. 在目標 Notion Page 右上角「...」→「連線」→ 選擇您的 Integration
4. 從 Page URL 取得 Page ID → 填入 NOTION_PAGE_ID

### 5. 本地開發

```bash
npm run dev
```

打開 http://localhost:3000

## 部署到 Vercel

```bash
npm i -g vercel
vercel
vercel env add GEMINI_API_KEY
vercel env add NOTION_TOKEN
vercel env add NOTION_PAGE_ID
vercel env add GAS_CALENDAR_URL
vercel env add GAS_SECRET_KEY
```

## 技術棧

- Next.js 14 (App Router)
- Google Gemini 2.0 Flash API (Multimodal PDF 解析)
- @notionhq/client
- Google Apps Script (Calendar)
- Vercel 部署
