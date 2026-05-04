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

    // 建立頁面標題（使用日期）
    const pageTitle = title || `行事曆解析 - ${new Date().toLocaleDateString('zh-TW')}`;

    // 將 Markdown 轉換為 Notion Block 格式
    const blocks = markdownToNotionBlocks(markdown);

    // 在指定 Page 下建立子頁面
    const response = await notion.pages.create({
      parent: {
        type: 'page_id',
        page_id: process.env.NOTION_PAGE_ID,
      },
      properties: {
        title: {
          title: [
            {
              type: 'text',
              text: { content: pageTitle },
            },
          ],
        },
      },
      children: blocks,
    });

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

/**
 * 將 Markdown 文字轉換為 Notion Block 格式
 * 支援：標題（H1-H3）、粗體項目、一般段落、水平線
 */
function markdownToNotionBlocks(markdown: string) {
  const lines = markdown.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 跳過空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // H2 標題（事件標題）
    if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: line.replace('## ', '') } }],
        },
      });
      i++;
      continue;
    }

    // H3 標題
    if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: line.replace('### ', '') } }],
        },
      });
      i++;
      continue;
    }

    // H1 標題
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: line.replace('# ', '') } }],
        },
      });
      i++;
      continue;
    }

    // 水平線
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      i++;
      continue;
    }

    // 列表項目（- **key**：value 格式）
    if (line.startsWith('- ')) {
      const content = line.replace('- ', '');
      const richText = parseBoldMarkdown(content);
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: richText },
      });
      i++;
      continue;
    }

    // 一般段落
    if (line.trim()) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: parseBoldMarkdown(line),
        },
      });
    }

    i++;
  }

  // Notion 單次最多 100 個 block
  return blocks.slice(0, 100);
}

/**
 * 解析 Markdown 粗體（**text**）為 Notion rich_text 格式
 */
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
      richText.push({
        type: 'text',
        text: { content: part },
      });
    }
  });

  return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
}
