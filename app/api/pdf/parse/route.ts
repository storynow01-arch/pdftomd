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

// 解析 API Keys（支援多組，以逗號分隔）
const apiKeys = (process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k);

let currentKeyIndex = 0;

function getNextAIClient() {
  if (apiKeys.length === 0) {
    throw new Error('Server Configuration Error: GEMINI_API_KEY is missing.');
  }
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  console.log(`[API Key 輪詢] 目前使用第 ${currentKeyIndex === 0 ? apiKeys.length : currentKeyIndex} 組 Key`);
  return new GoogleGenAI({ apiKey: key });
}

// 模型優先順序：優先讀取環境變數，預設使用 gemini-3-flash-preview
const defaultModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const MODELS = Array.from(new Set([
  defaultModel,
  'gemini-2.5-flash',
  'gemini-flash-latest'
]));

const buildPrompt = (pdfText: string, filename: string) => `你是一個行事曆解析助手。請分析以下從 PDF 提取的文字內容，找出所有行事曆相關資訊（活動、行程、時間、日期、地點等）。

【重要：年份與學期推算邏輯】
來源檔名為：「${filename}」

台灣的學年度使用「民國年」。西元年 = 民國年 + 1911。
請從檔名中提取「民國學年度」和「學期代號」（-1 或 -2）。

■ 若為「下學期」（檔名含 -2）：
  - 下學期的範圍是 2月 ~ 7月
  - 所有月份的西元年 = 民國年 + 1912
  - 範例：檔名「114-2」→ 民國 114 年下學期
    - 2月 → 2026 年、3月 → 2026 年、4月 → 2026 年 ... 7月 → 2026 年
    - 例如文本寫「2/25」→ 解析為 2026-02-25
    - 例如文本寫「6/30」→ 解析為 2026-06-30

■ 若為「上學期」（檔名含 -1）：
  - 上學期的範圍是 8月 ~ 隔年 2月
  - 8月、9月、10月、11月、12月 → 西元年 = 民國年 + 1911（今年）
  - 1月、2月 → 西元年 = 民國年 + 1912（隔年）
  - 範例：檔名「114-1」→ 民國 114 年上學期
    - 9月 → 2025 年、12月 → 2025 年
    - 1月 → 2026 年、2月 → 2026 年

=== PDF 文字內容開始 ===
${pdfText}
=== PDF 文字內容結束 ===

【極度重要：絕對不可遺漏任何事件】
1. PDF 中可能包含密集的表格或跨行文字。請你採用「逐列、逐格」掃描策略：
   - 先從左到右讀完第一行每個欄位，再讀第二行，以此類推。
   - 同一個日期格中若有多個事件（例如用換行分隔的不同活動），必須「每一項都獨立列出」。
2. 即使一天內有多個單位的不同活動（例如 3/22 有重補修、停課、研習等），也必須「全部獨立列出」，絕對不能因為在同一格就省略或合併。
3. 任何出現「日期數字」的地方（如 22日、23-27日、3/22~3/26），請務必解析出來，寧可多列，不可少列。
4. 跨日範圍（例如「3/22~3/26」）應解析為一個事件，開始日期為起始日、結束日期為結束日。

【輸出前自我檢查】
輸出前請逐項確認：
- ✅ 每個月份是否都有掃描到？（不要跳過任何月份）
- ✅ 同一天有多個活動時，是否每個都獨立列出？
- ✅ 所有日期的西元年份是否依上述規則正確推算？

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
5. 請用繁體中文輸出。
6. 不要輸出任何開頭的解說或推算過程，直接從「## 單位：」開始輸出。`;

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
    // 獨立出單次解析函式
    const runParsingPass = async (modelName: string): Promise<string> => {
      const ai = getNextAIClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return response.text ?? '';
    };

    let markdownContent = '';
    let lastError: Error | null = null;

    for (const modelName of MODELS) {
      try {
        console.log(`[PDF 解析] 嘗試模型：${modelName} (雙軌並行)`);
        
        // 雙軌並行發送
        const [resA, resB] = await Promise.allSettled([
          runParsingPass(modelName),
          runParsingPass(modelName)
        ]);

        const validResults: string[] = [];
        if (resA.status === 'fulfilled' && resA.value) validResults.push(resA.value);
        if (resB.status === 'fulfilled' && resB.value) validResults.push(resB.value);

        if (validResults.length === 0) {
          // 如果兩個都失敗，提取第一個失敗的錯誤訊息來拋出
          const errReason = resA.status === 'rejected' ? resA.reason : (resB.status === 'rejected' ? resB.reason : '未知錯誤');
          throw errReason instanceof Error ? errReason : new Error(String(errReason));
        }

        if (validResults.length === 1) {
          console.warn(`[PDF 解析] 雙軌解析其中一軌失敗，退回單軌結果`);
          markdownContent = validResults[0];
        } else {
          console.log(`[PDF 解析] 雙軌解析皆成功，開始進行 AI 交叉比對合併...`);
          const mergePrompt = `以下是同一份行事曆的兩份不同 AI 解析結果（版本A 與 版本B）。
請仔細交叉比對這兩份結果。
1. 將所有出現過的事件合併在一起。
2. 若版本A有但版本B漏掉，請補上；若版本B有但版本A漏掉，也請補上。
3. 移除完全重複的事件。
4. 最終輸出的格式必須嚴格遵照原有的 Markdown 格式（以 ## 單位： 開頭，事件以 ### 開頭）。
絕對不可省略任何資訊。

【版本A】
${validResults[0]}

【版本B】
${validResults[1]}
`;
          const ai = getNextAIClient();
          const mergeRes = await ai.models.generateContent({
            model: modelName,
            contents: mergePrompt,
          });
          markdownContent = mergeRes.text ?? validResults[0];
          console.log(`[PDF 解析] 交叉比對合併完成！`);
        }
        
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('404');

        if (isRetryable) {
          console.warn(`[PDF 解析] 模型 ${modelName} 暫時不可用或超載，切換備用模型...`);
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
