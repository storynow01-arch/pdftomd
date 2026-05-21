import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

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

const buildPrompt = (filename: string) => `你是一個專業的行事曆解析助手。請分析我提供的 PDF 行事曆文件，找出所有行事曆相關資訊（活動、行程、時間、日期、地點等）。

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

【極度重要：絕對不可遺漏 any 事件】
1. PDF 中可能包含密集的表格或跨行文字。請你採用「逐列、逐格」掃描策略：
   - 先從左到右讀完第一行每個欄位，再讀第二行，以此類推。
   - 同一個日期格中若有多個事件（例如用換行分隔的不同活動），必須「每一項都獨立列出」。
2. 即使一天內有多個單位的不同活動（例如 3/22 有重補修、停課、研習等），也必須「全部獨立列出」，絕對不能因為在同一格就省略或合併。
3. 任何出現「日期數字」的地方（如 22日、23-27日、3/22~3/26），請務必解析出來，寧可多列，不可少列。
4. 跨日範圍（例如「3/22~3/26」）應解析為一個事件，開始日期為起始日、結束日期為結束日。

【關於精確度評估】
請對您解析這份文檔的精確度與完整度進行自我評估：
1. 評分 (score)：給予一個 0-100 的信心分數。如果文檔字跡清晰、日期格式明確、沒有模糊的描述，應給予高分（90-100）。若有較多不確定性（如年份未註明、部分日期被遮擋、文字排版混亂），請酌情扣分。
2. 等級 (level)：根據分數給予評等，如「極佳」、「良好」、「尚可」、「偏低」。
3. 原因 (reason)：簡短說明給予此精確度分數的原因（例如：文檔結構非常清晰，所有活動均有明確對應的日期與處室，年份推算無誤）。
4. 潛在問題 (issues)：列出所有可能的解析疑慮點（例如：'部分跨日活動可能在跨頁處被截斷'，'有數個活動未標明具體日期，已判定為全天'），若完美無缺請回傳空陣列。

格式要求：
1. 最終行事曆內容請使用 Markdown 格式。
2. 請先「依據處室單位」（例如：【教】代表教務處、【總】代表總務處、【實】代表實習處等）進行分類。
3. 每個分類下再列出事件，並依日期排序。結構如下：

## 單位：[單位名稱或簡稱，例如：【教務處】]

### [事件標題]
- **開始日期**：YYYY-MM-DD（必須包含正確的西元年）
- **結束日期**：YYYY-MM-DD（若是同一天，請填寫與開始日期相同的日期；若是區間則填寫結束日）
- **時間**：HH:MM - HH:MM（若全天則寫「全天」）
- **地點**：（若有）
- **說明**：（若有）

4. 若文件不含行事曆資訊，請說明文件主要內容並嘗試提取 any 有時間性的資訊。
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

    // Step 1: 讀取 PDF file 二進位資料並轉為 Base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString('base64');
    console.log(`[PDF 解析] 讀取二進位資料成功，長度為：${buffer.length} bytes`);

    // Step 2: 呼叫 Gemini 多模態 API 分析
    const prompt = buildPrompt(file.name);
    
    // 獨立出單次解析函式
    const runParsingPass = async (modelName: string): Promise<{ accuracy: any, markdown: string }> => {
      const ai = getNextAIClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: pdfBase64,
              mimeType: 'application/pdf'
            }
          },
          prompt
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              accuracy: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER', description: '解析信心分數，0-100' },
                  level: { type: 'STRING', description: '精確度等級，例如：極佳, 良好, 尚可, 偏低' },
                  reason: { type: 'STRING', description: '評估精確度的原因說明' },
                  issues: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: '潛在可能不精確的點，若無則為空陣列'
                  }
                },
                required: ['score', 'level', 'reason', 'issues']
              },
              markdown: { type: 'STRING', description: '解析後的行事曆 Markdown 內容' }
            },
            required: ['accuracy', 'markdown']
          }
        }
      });
      
      const text = response.text ?? '';
      try {
        const parsed = JSON.parse(text);
        if (!parsed.accuracy || !parsed.markdown) {
          throw new Error('回傳的 JSON 缺少必要欄位');
        }
        return parsed;
      } catch (e) {
        console.error('[JSON 解析失敗] 原始文字：', text);
        throw new Error('AI 回傳格式不符合 JSON Schema，請重試');
      }
    };

    let markdownContent = '';
    let accuracyEvaluation: any = null;
    let lastError: Error | null = null;
    let isFallback = false;
    let usedModel = defaultModel;

    for (const modelName of MODELS) {
      try {
        console.log(`[PDF 解析] 嘗試模型：${modelName} (雙軌並行)`);
        
        // 雙軌並行發送
        const [resA, resB] = await Promise.allSettled([
          runParsingPass(modelName),
          runParsingPass(modelName)
        ]);

        const validResults: { accuracy: any, markdown: string }[] = [];
        if (resA.status === 'fulfilled' && resA.value) validResults.push(resA.value);
        if (resB.status === 'fulfilled' && resB.value) validResults.push(resB.value);

        if (validResults.length === 0) {
          // 如果兩個都失敗，提取第一個失敗的錯誤訊息來拋出
          const errReason = resA.status === 'rejected' ? resA.reason : (resB.status === 'rejected' ? resB.reason : '未知錯誤');
          throw errReason instanceof Error ? errReason : new Error(String(errReason));
        }

        usedModel = modelName;
        isFallback = modelName !== defaultModel;

        if (validResults.length === 1) {
          console.warn(`[PDF 解析] 雙軌解析其中一軌失敗，退回單軌結果`);
          markdownContent = validResults[0].markdown;
          accuracyEvaluation = validResults[0].accuracy;
        } else {
          console.log(`[PDF 解析] 雙軌解析皆成功，開始進行 AI 交叉比對合併...`);
          const mergePrompt = `以下是同一份行事曆的兩份不同 AI 解析結果（版本A 與 版本B）。
請仔細交叉比對這兩份結果。
1. 將所有出現過的事件合併在一起。
2. 若版本A有但版本B漏掉，請補上；若版本B有但版本A漏掉，也請補上。
3. 移除完全重複的事件。
4. 最終輸出的格式必須嚴格遵照原有的 Markdown 格式（以 ## 單位： 開頭，事件以 ### 開頭）。
絕對不可省略 any 資訊。

【版本A】
${validResults[0].markdown}

【版本B】
${validResults[1].markdown}
`;
          const ai = getNextAIClient();
          const mergeRes = await ai.models.generateContent({
            model: modelName,
            contents: mergePrompt,
          });
          markdownContent = mergeRes.text ?? validResults[0].markdown;
          
          // 合併評估數據
          const scoreA = validResults[0].accuracy?.score ?? 80;
          const scoreB = validResults[1].accuracy?.score ?? 80;
          const avgScore = Math.round((scoreA + scoreB) / 2);
          
          let mergedLevel = '良好';
          if (avgScore >= 90) mergedLevel = '極佳';
          else if (avgScore >= 80) mergedLevel = '良好';
          else if (avgScore >= 70) mergedLevel = '尚可';
          else mergedLevel = '偏低';

          const issuesSet = new Set<string>();
          (validResults[0].accuracy?.issues || []).forEach((i: string) => issuesSet.add(i));
          (validResults[1].accuracy?.issues || []).forEach((i: string) => issuesSet.add(i));

          accuracyEvaluation = {
            score: avgScore,
            level: mergedLevel,
            reason: `經雙軌並行解析交叉比對合併。軌道 A 信心度 ${scoreA}，軌道 B 信心度 ${scoreB}。` + 
                    `評估理由：A軌 - ${validResults[0].accuracy?.reason || '無'}；B軌 - ${validResults[1].accuracy?.reason || '無'}`,
            issues: Array.from(issuesSet)
          };
          console.log(`[PDF 解析] 交叉比對合併完成！`);
        }
        
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('404') || msg.includes('quota');

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
      accuracy: accuracyEvaluation,
      filename: file.name,
      fileSize: file.size,
      isFallback,
      usedModel
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
