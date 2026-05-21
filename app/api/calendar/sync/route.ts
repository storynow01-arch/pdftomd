import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { events, customGasUrl, customGasSecretKey } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: '請提供至少一個事件' }, { status: 400 });
    }

    const gasUrl = (customGasUrl && customGasUrl.trim()) || process.env.GAS_CALENDAR_URL;
    const secretKey = (customGasSecretKey && customGasSecretKey.trim()) || process.env.GAS_SECRET_KEY;

    if (!gasUrl) {
      return NextResponse.json(
        { error: '未設定 Google 日曆 GAS Web App URL，請先在首頁設定面板填寫，或完成環境變數部署。' },
        { status: 400 }
      );
    }

    // 呼叫 GAS Web App 批次新增事件
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addEvents',
        secretKey: secretKey,
        events: events,
      }),
    });

    if (!response.ok) {
      throw new Error(`GAS 回應錯誤：${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      added: result.added,
      errors: result.errors || [],
      results: result.results || [],
      message: `已成功加入 ${result.added} 個事件到 Google 行事曆`,
    });
  } catch (error: unknown) {
    console.error('Calendar 同步錯誤:', error);
    const message = error instanceof Error ? error.message : '同步失敗';
    return NextResponse.json(
      { error: `Google Calendar 同步失敗：${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customGasUrl = searchParams.get('customGasUrl');
    const customGasSecretKey = searchParams.get('customGasSecretKey');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const gasUrl = (customGasUrl && customGasUrl.trim()) || process.env.GAS_CALENDAR_URL;
    const secretKey = (customGasSecretKey && customGasSecretKey.trim()) || process.env.GAS_SECRET_KEY;

    if (!gasUrl) {
      return NextResponse.json({ error: '未設定 Google 日曆 GAS Web App URL，請先在首頁設定面板填寫，或完成環境變數部署。' }, { status: 400 });
    }

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'listEvents',
        secretKey: secretKey,
        startDate,
        endDate,
      }),
    });

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查詢失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
