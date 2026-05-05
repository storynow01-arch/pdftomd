import { Client } from '@notionhq/client';
import { NextRequest, NextResponse } from 'next/server';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { markdown, title } = body;

    if (!markdown) {
      return NextResponse.json({ error: '缺少 markdown 內容' }, { status: 400 });
    }

    if (!process.env.NOTION_PAGE_ID) {
      return NextResponse.json({ error: '未設定 NOTION_PAGE_ID' }, { status: 500 });
    }

    const pageTitle = title || `行事曆解析 - ${new Date().toLocaleDateString('zh-TW')}`;

    // 解析 Markdown 成結構化資料：[{ unitName, events: [{ eventTitle, detailLines[] }] }]
    const unitSections = parseMarkdownToSections(markdown);

    // Step 1：建立空頁面（不含任何 children，避免超過 1000 block 限制）
    const response = await notion.pages.create({
      parent: { type: 'page_id', page_id: process.env.NOTION_PAGE_ID },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: pageTitle } }],
        },
      },
      children: [],
    });

    const pageId = response.id;

    // Step 2：為每個單位建立一個空的 Toggle Heading 2，取得其 block_id
    //         再逐一 append 事件到該 Toggle 的 children
    for (const unit of unitSections) {
      // 建立單位的 Toggle Heading 2（空的，先佔位）
      const unitToggleRes = await notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: `單位：${unit.unitName}` } }],
              is_toggleable: true,
            },
          } as Parameters<typeof notion.blocks.children.append>[0]['children'][0],
        ],
      });

      const unitToggleId = (unitToggleRes.results[0] as { id: string }).id;

      // 將該單位下所有事件的 Toggle Heading 3，分批 append（每批最多 100 個）
      const eventToggleBlocks = unit.events.map((event) => ({
        object: 'block' as const,
        type: 'heading_3' as const,
        heading_3: {
          rich_text: [{ type: 'text' as const, text: { content: event.eventTitle } }],
          is_toggleable: true,
          children: event.detailLines.map((line) => ({
            object: 'block' as const,
            type: 'bulleted_list_item' as const,
            bulleted_list_item: { rich_text: parseBoldMarkdown(line) },
          })),
        },
      }));

      // 每次最多 append 10 個 Toggle Heading 3（每個含最多 6 個子項，安全起見保守批次）
      for (let i = 0; i < eventToggleBlocks.length; i += 10) {
        const batch = eventToggleBlocks.slice(i, i + 10);
        await notion.blocks.children.append({
          block_id: unitToggleId,
          children: batch as Parameters<typeof notion.blocks.children.append>[0]['children'],
        });
      }
    }

    console.log(`[Notion] 完成寫入：${unitSections.length} 個單位，共 ${unitSections.reduce((acc, u) => acc + u.events.length, 0)} 個事件`);

    return NextResponse.json({
      success: true,
      pageId: response.id,
      pageUrl: `https://notion.so/${response.id.replace(/-/g, '')}`,
      title: pageTitle,
    });
  } catch (error: unknown) {
    console.error('Notion 寫入錯誤:', error);
    const message = error instanceof Error ? error.message : '寫入失敗';
    return NextResponse.json(
      { error: `Notion 寫入失敗：${message}` },
      { status: 500 }
    );
  }
}

/** 解析 Markdown 成結構化資料 */
function parseMarkdownToSections(markdown: string) {
  const result: {
    unitName: string;
    events: { eventTitle: string; detailLines: string[] }[];
  }[] = [];

  const unitSections = markdown.split(/(?=^## 單位：)/m).filter(s => s.trim());

  unitSections.forEach(section => {
    const unitMatch = section.match(/^## 單位：(.*?)$/m);
    const unitName = unitMatch ? unitMatch[1].trim() : '其他';

    const events: { eventTitle: string; detailLines: string[] }[] = [];
    const eventBlocks = section.split(/(?=^### )/m);

    eventBlocks.forEach(block => {
      if (!block.trim().startsWith('### ')) return;
      const lines = block.split('\n');
      const eventTitle = lines[0].replace(/^### /, '').trim();
      if (!eventTitle) return;

      const detailLines = lines
        .slice(1)
        .filter(l => l.startsWith('- '))
        .map(l => l.replace(/^- /, '').trim());

      events.push({ eventTitle, detailLines });
    });

    if (events.length > 0) {
      result.push({ unitName, events });
    }
  });

  return result;
}

/** 解析 Markdown 粗體（**text**）為 Notion rich_text 格式 */
function parseBoldMarkdown(text: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const richText: any[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/);

  parts.forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      richText.push({
        type: 'text',
        text: { content: part.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (part) {
      richText.push({ type: 'text', text: { content: part } });
    }
  });

  return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
}
