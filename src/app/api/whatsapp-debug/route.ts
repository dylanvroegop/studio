import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';

  if (!accessToken || !phoneNumberId) {
    const data = {
      error: 'Missing WhatsApp configuration',
      hasAccessToken: Boolean(accessToken),
      hasPhoneNumberId: Boolean(phoneNumberId),
    };
    console.log('[whatsapp-debug] config error:', data);
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        data,
      },
      { status: 500 }
    );
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: '31657540176',
    type: 'text',
    text: {
      body: 'Calvora debug message',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    console.log('[whatsapp-debug] response:', {
      status: response.status,
      ok: response.ok,
      data,
    });

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    const data = {
      error: error instanceof Error ? error.message : 'Unknown fetch error',
    };
    console.log('[whatsapp-debug] exception:', data);
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        data,
      },
      { status: 500 }
    );
  }
}
