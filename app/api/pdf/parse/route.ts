import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';

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

// 模型優先順序：優先讀取環境變數，預設使用 gemini-3.5-flash
const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MODELS = Array.from(new Set([
  defaultModel,
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest'
]));

interface CalendarEvent {
  department: string;
  title: string;
  start_date: string;
  end_date: string;
  time: string;
  location: string;
  description: string;
}

const buildPrompt = (filename: string, pdfText: string) => `你是一個專業的行事曆解析助手。請分析我提供的 PDF 行事曆資料，找出所有行事曆相關資訊（活動、行程、時間、日期、地點等）。

為了確保最高辨識完整度，我們提供您兩種資料來源：
1. 【本地提取的 PDF 純文字內容】（最精確的文字與數字來源，請務必以此為主對照）
2. 【PDF 原始多模態文件】（視覺排版、表格格線與對齊關係，請用以確認表格欄位與跨格對應關係）

【本地提取的 PDF 純文字內容如下】
${pdfText || '（無法提取純文字，請完全依據 PDF 多模態影像進行辨識）'}

【重要：處室單位分類防呆與優化】
請依據負責處室進行歸類，並統一命名，例如：【教務處】、【學務處】、【總務處】、【實習處】、【輔導室】、【圖書館】等。
為了讓行程更有條理，請務必遵守以下分類防呆原則：
- 只要是「放假」、「補假」、「寒暑假開始/結束」、「國定節日（如元旦、春節、清明節、端午節、中秋節等）」等純假日或放假行程，一律歸類在【放假/節日】分類！
- 只有真正的全校性重要活動（如開學典禮、休業式、校慶等），且無法歸類於單一處室者，才歸類在【全校】分類中。
- 絕對不要把純假日或放假行程塞在【全校】或處室分類中。

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

【極度重要：絕對不可遺漏任何事件】
1. PDF 表格中可能包含密集的文字或跨行字元。請你仔細比對「純文字內容」與「多模態 PDF 視覺圖表」：
   - 確保純文字內容中出現的每一個日期、活動、備註都沒有被漏掉。
   - 同一個日期格中若有多個事件（例如用換行分隔的不同活動），必須「每一項都獨立列出」。
2. 即使一天內有多個單位的不同活動（例如 3/22 有重補修、停課、研習等），也必須「全部獨立列出」，絕對不能因為在同一格或同一天就省略或合併。
3. 任何出現「日期數字」的地方（如 22日、23-27日、3/22~3/26），請務必解析出來，寧可多列，不可少列。
4. 跨日範圍（例如「3/22~3/26」）應解析為一個事件，開始日期為起始日、結束日期為結束日。

【關於精確度評估】
請對您解析這份文檔的精確度與完整度進行自我評估：
1. 評分 (score)：給予一個 0-100 的信心分數。如果文檔字跡清晰、日期格式明確、沒有模糊的描述，應給予高分（90-100）。若有較多不確定性，請酌情扣分。
2. 等級 (level)：根據分數給予評等，如「極佳」、「良好」、「尚可」、「偏低」。
3. 原因 (reason)：簡短說明給予此精確度分數的原因。
4. 潛在問題 (issues)：列出所有可能的解析疑慮點，若完美無缺請回傳空陣列。`;

/** 將結構化事件陣列轉換為前端所預期的 Markdown 大字串（包含自動防錯） */
function convertEventsToMarkdown(events: CalendarEvent[]): string {
  if (!events || events.length === 0) {
    return '> ⚠️ 解析結果中無任何有效事件';
  }

  const normalizeDept = (dept: string) => {
    let clean = (dept || '其他').trim();
    // 移除前後可能存在的括號
    clean = clean.replace(/^[【\[\(](.*?)[】\]\)]$/, '$1');
    if (!clean) return '其他';
    return clean;
  };

  // 正則化日期格式 (例如將 2026/03/22 轉為 2026-03-22)
  const normalizeDateFormat = (dateStr: string) => {
    if (!dateStr) return '';
    let clean = dateStr.replace(/\//g, '-').trim();
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return clean;
  };

  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const dept = normalizeDept(ev.department);
    const deptKey = `【${dept}】`;
    if (!grouped[deptKey]) {
      grouped[deptKey] = [];
    }
    grouped[deptKey].push(ev);
  }

  let markdown = '';
  // 處室排序
  const departments = Object.keys(grouped).sort((a, b) => {
    const priority = (name: string) => {
      if (name.includes('放假') || name.includes('節日')) return 1;
      if (name.includes('教務')) return 2;
      if (name.includes('學務')) return 3;
      if (name.includes('總務')) return 4;
      if (name.includes('實習')) return 5;
      if (name.includes('輔導')) return 6;
      if (name.includes('圖書')) return 7;
      if (name.includes('人事')) return 8;
      if (name.includes('會計')) return 9;
      if (name.includes('全校')) return 10;
      return 100;
    };
    return priority(a) - priority(b) || a.localeCompare(b);
  });

  for (const dept of departments) {
    markdown += `## 單位：${dept}\n\n`;
    
    // 事件依日期排序
    const sortedEvents = grouped[dept].sort((a, b) => {
      const dateA = normalizeDateFormat(a.start_date);
      const dateB = normalizeDateFormat(b.start_date);
      return dateA.localeCompare(dateB) || a.title.localeCompare(b.title);
    });

    for (const ev of sortedEvents) {
      let startDate = normalizeDateFormat(ev.start_date);
      let endDate = normalizeDateFormat(ev.end_date);

      // 自動日期防錯：結束日期早於開始日期，自動拉齊
      if (startDate && endDate) {
        if (endDate.localeCompare(startDate) < 0) {
          endDate = startDate;
        }
      }

      markdown += `### ${ev.title.trim()}\n`;
      markdown += `- **開始日期**：${startDate}\n`;
      markdown += `- **結束日期**：${endDate}\n`;
      markdown += `- **時間**：${(ev.time || '全天').trim()}\n`;
      markdown += `- **地點**：${(ev.location || '').trim()}\n`;
      markdown += `- **說明**：${(ev.description || '').trim()}\n\n`;
    }
  }

  return markdown.trim();
}

/** 雙軌事件高精度去重與合併 */
function mergeDoublePassEvents(eventsA: CalendarEvent[], eventsB: CalendarEvent[]): CalendarEvent[] {
  const merged: CalendarEvent[] = [...eventsA];
  const normalizeString = (str: string) => (str || '').trim().toLowerCase().replace(/\s+/g, '');

  for (const evB of eventsB) {
    const normTitleB = normalizeString(evB.title);
    const normDeptB = normalizeString(evB.department);

    const existing = merged.find(evA => {
      if (evA.start_date !== evB.start_date) return false;

      const normDeptA = normalizeString(evA.department);
      const isDeptSimilar = normDeptA.includes(normDeptB) || normDeptB.includes(normDeptA);
      if (!isDeptSimilar) return false;

      const normTitleA = normalizeString(evA.title);
      const isTitleSimilar = normTitleA.includes(normTitleB) || normTitleB.includes(normTitleA);
      
      return isTitleSimilar;
    });

    if (existing) {
      if (!existing.location && evB.location) {
        existing.location = evB.location;
      }
      if (evB.description && evB.description.length > (existing.description || '').length) {
        existing.description = evB.description;
      }
      if ((!existing.time || existing.time === '全天') && evB.time && evB.time !== '全天') {
        existing.time = evB.time;
      }
    } else {
      merged.push(evB);
    }
  }

  return merged;
}

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

    // Step 1.5: 使用 pdf-parse 進行本地文字提取
    let pdfText = '';
    try {
      console.log('[PDF 解析] 開始使用 pdf-parse 進行本地文字提取...');
      const parsedPdf = await pdf(buffer);
      pdfText = parsedPdf.text || '';
      console.log(`[PDF 解析] 本地文字提取成功，字數：${pdfText.length} 字`);
    } catch (pdfErr) {
      console.error('[PDF 解析] 本地文字提取失敗(使用 Fallback 空字串繼續)：', pdfErr);
    }

    // Step 2: 呼叫 Gemini 多模態 API 分析
    const prompt = buildPrompt(file.name, pdfText);
    
    // 獨立出單次解析函式
    const runParsingPass = async (modelName: string): Promise<{ accuracy: any, events: CalendarEvent[] }> => {
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
          temperature: 0.0,
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
              events: {
                type: 'ARRAY',
                description: '解析出來的所有行事曆事件列表，必須完全無遺漏地包含所有日期與單位的事件',
                items: {
                  type: 'OBJECT',
                  properties: {
                    department: { type: 'STRING', description: '負責處室或分類單位，如：教務處、學務處、總務處、實習處等。若不明確，請填【全校】' },
                    title: { type: 'STRING', description: '事件或活動名稱，必須簡潔明確描述內容' },
                    start_date: { type: 'STRING', description: '開始西元日期，格式必須為 YYYY-MM-DD' },
                    end_date: { type: 'STRING', description: '結束西元日期，格式必須為 YYYY-MM-DD。若為單日事件，請與開始日期相同' },
                    time: { type: 'STRING', description: '時間區間，若全天則寫「全天」，其他如 08:00 - 10:00' },
                    location: { type: 'STRING', description: '活動地點，若無則填空字串' },
                    description: { type: 'STRING', description: '活動說明或備註，若無則填空字串' }
                  },
                  required: ['department', 'title', 'start_date', 'end_date', 'time']
                }
              }
            },
            required: ['accuracy', 'events']
          }
        }
      });
      
      const text = response.text ?? '';
      try {
        const parsed = JSON.parse(text);
        if (!parsed.accuracy || !parsed.events) {
          throw new Error('回傳的 JSON 缺少必要欄位');
        }
        return parsed;
      } catch (e) {
        console.error('[JSON 解析失敗] 原始文字：', text);
        throw new Error('AI 回傳格式不符合 JSON Schema，請重試');
      }
    };

    let mergedEvents: CalendarEvent[] = [];
    let accuracyEvaluation: any = null;
    let lastError: Error | null = null;
    let isFallback = false;
    let usedModel = defaultModel;

    for (const modelName of MODELS) {
      try {
        console.log(`[PDF 解析] 嘗試模型：${modelName} (優先採用高效率單軌模式)`);
        
        // 1. 執行第一軌單軌解析
        const resA = await runParsingPass(modelName);
        console.log(`[PDF 解析] 軌道 A 解析成功，信心分數：${resA.accuracy?.score}`);

        usedModel = modelName;
        isFallback = modelName !== defaultModel;

        // 2. 判斷是否需要智慧雙軌 (信心分數大於等於 85 即跳過以加速)
        if (resA.accuracy?.score >= 85) {
          console.log(`[PDF 解析] 軌道 A 信心分數極高 (${resA.accuracy?.score} >= 85)，直接採用，免除雙軌以大幅提速！`);
          mergedEvents = resA.events;
          accuracyEvaluation = resA.accuracy;
        } else {
          console.log(`[PDF 解析] 軌道 A 分數偏低 (${resA.accuracy?.score} < 85)，自動啟動第二軌並行校對...`);
          try {
            const resB = await runParsingPass(modelName);
            console.log(`[PDF 解析] 軌道 B 解析成功，信心分數：${resB.accuracy?.score}，開始後端去重合併...`);
            
            mergedEvents = mergeDoublePassEvents(resA.events, resB.events);
            
            const scoreA = resA.accuracy?.score ?? 80;
            const scoreB = resB.accuracy?.score ?? 80;
            const avgScore = Math.round((scoreA + scoreB) / 2);
            
            let mergedLevel = '良好';
            if (avgScore >= 90) mergedLevel = '極佳';
            else if (avgScore >= 80) mergedLevel = '良好';
            else if (avgScore >= 70) mergedLevel = '尚可';
            else mergedLevel = '偏低';

            const issuesSet = new Set<string>();
            (resA.accuracy?.issues || []).forEach((i: string) => issuesSet.add(i));
            (resB.accuracy?.issues || []).forEach((i: string) => issuesSet.add(i));

            accuracyEvaluation = {
              score: avgScore,
              level: mergedLevel,
              reason: `經雙軌並行解析比對（後端 JS 智慧合併）。A軌信心度 ${scoreA}，B軌信心度 ${scoreB}。` + 
                      `評估理由：A軌 - ${resA.accuracy?.reason || '無'}；B軌 - ${resB.accuracy?.reason || '無'}`,
              issues: Array.from(issuesSet)
            };
            console.log(`[PDF 解析] 雙軌合併完成，事件總數：${mergedEvents.length}`);
          } catch (errB) {
            console.warn(`[PDF 解析] 軌道 B 執行失敗，退回單軌 A 結果：`, errB);
            mergedEvents = resA.events;
            accuracyEvaluation = resA.accuracy;
          }
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

    if (mergedEvents.length === 0) {
      throw lastError || new Error('所有模型均無法回應，請稍後再試');
    }

    // 將結構化事件轉換為前端相容的 Markdown
    console.log(`[PDF 解析] 合併後事件總數為 ${mergedEvents.length}，開始轉換成相容前端的 Markdown 格式...`);
    const markdownContent = convertEventsToMarkdown(mergedEvents);
    console.log(`[PDF 解析] Markdown 轉換完成，字數：${markdownContent.length} 字`);

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
