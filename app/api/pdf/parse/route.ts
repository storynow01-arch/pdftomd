import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { createRequire } from 'module';

// pdf-parse 是 CommonJS 模組，需用 createRequire 引入
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require('pdf-parse');
// 兼容 .default export 與直接 function export
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> =
  typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default ?? pdfParseModule);

// 使用新版官方 SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 模型優先順序：2.5 繁忙時，退回到有高配額的 Gemma 3 模型
const MODELS = [
  'gemini-2.5-flash',
  'gemma-3-27b-it',
  'gemini-flash-latest'
];

const buildPrompt = (pdfText: string, filename: string) => `你是一個行事曆解析助手。請分析以下從 PDF 提取的文字內容，找出所有行事曆相關資訊（活動、行程、時間、日期、地點等）。

【重要年份與學期推算邏輯】
來源檔名為：「${filename}」
1. 台灣的學年度為「民國年」。西元年 = 民國年 + 1911。例如 114 學年度 = 西元 2025 年開始。
2. 檔名中的「-1」代表上學期（西元 2025 年 8 月 ~ 2026 年 1 月）。
3. 檔名中的「-2」代表下學期（西元 2026 年 2 月 ~ 2026 年 7 月）。
4. 請根據檔名與上述邏輯，為每個事件加上「正確的西元年份」。例如檔名是 114-2，如果文本寫 2/25，日期應解析為 2026-02-25。

=== PDF 文字內容開始 ===
${pdfText}
=== PDF 文字內容結束 ===

【極度重要：絕對不可遺漏任何事件】
1. PDF 中可能包含密集的表格或跨行文字，請你「逐行、逐字」仔細掃描。
2. 即使一天內有多個單位的不同活動（例如 3/22 有重補修、停課等），也必須「全部獨立列出」，絕對不能因為在同一格就省略或合併。
3. 任何出現「日期數字」的地方（如 22日、23-27日），請務必解析出來，寧可多列，不可少列。

輸出格式要求：
1. 使用 Markdown 格式。
2. 請先「依據處室單位」（例如：【教】代表教務處、【總】代表總務處、【實】代表實習處等）進行分類。
3. 每個分類下再列出事件，並依日期排序。結構如下：

## 單位：[單位名稱或簡稱，例如：【教務處】]

### [事件標題]
- **開始日期**：YYYY-MM-DD（必須包含正確的西元年）
- **結束日期**：YYYY-MM-DD（若是同一天，請填寫與開始日期相同的日期；若是區間則填寫結束日）
- **時間**：HH:MM - HH:MM（若全天則寫「全天」）
- **地點**：（若有）
- **說明**：（若有）

4. 若文件不含行事曆資訊，請說明文件主要內容並嘗試提取任何有時間性的資訊。
5. 請用繁體中文輸出。`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: '僅支援 PDF 格式' }, { status: 400 });
    }

    // Step 1: 用 pdf-parse 在本地提取 PDF 文字（不需要 AI）
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfText = '';
    try {
      const pdfData = await pdfParse(buffer);
      pdfText = pdfData.text?.trim() ?? '';
      console.log(`[PDF 解析] pdf-parse 提取文字長度：${pdfText.length} 字`);
    } catch (parseErr) {
      console.error('[PDF 解析] pdf-parse 失敗:', parseErr);
      return NextResponse.json({ error: 'PDF 文字提取失敗，請確認 PDF 未加密' }, { status: 422 });
    }

    if (!pdfText || pdfText.length < 10) {
      return NextResponse.json({
        error: 'PDF 文字內容為空，可能是純圖片掃描版 PDF。目前版本暫不支援，請使用含文字的 PDF。'
      }, { status: 422 });
    }

    // Step 2: 將提取的文字傳給 Gemini API 分析
    const prompt = buildPrompt(pdfText, file.name);
    let markdownContent = '';
    let lastError: Error | null = null;

    for (const modelName of MODELS) {
      try {
        console.log(`[PDF 解析] 嘗試模型：${modelName}`);
        
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        markdownContent = response.text ?? '';
        console.log(`[PDF 解析] 成功，使用：${modelName}`);
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('404');

        if (isRetryable) {
          console.warn(`[PDF 解析] 模型 ${modelName} 暫時不可用，切換備用...`);
          continue;
        }
        throw lastError;
      }
    }

    if (!markdownContent) {
      throw lastError || new Error('所有模型均無法回應，請稍後再試');
    }

    return NextResponse.json({
      success: true,
      markdown: markdownContent,
      filename: file.name,
      fileSize: file.size,
    });
  } catch (error: unknown) {
    console.error('PDF 解析錯誤:', error);
    const message = error instanceof Error ? error.message : '解析失敗';
    return NextResponse.json(
      { error: `PDF 解析失敗：${message}` },
      { status: 500 }
    );
  }
}
