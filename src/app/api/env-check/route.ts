import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const upsert = process.env.N8N_MATERIALEN_UPSERT_URL || '';
  const del = process.env.N8N_MATERIALEN_DELETE_URL || '';
  const base = process.env.N8N_WEBHOOK_URL || '';

  return NextResponse.json({
    N8N_WEBHOOK_URL: base,
    N8N_HEADER_SECRET: !!process.env.N8N_HEADER_SECRET,

    N8N_MATERIALEN_UPSERT_URL: upsert,
    N8N_MATERIALEN_DELETE_URL: del,

    hasUpsert: !!upsert,
    hasDelete: !!del,

    upsertContainsWebhookTest: upsert.includes('webhook-test'),
    deleteContainsWebhookTest: del.includes('webhook-test'),
    baseContainsWebhookTest: base.includes('webhook-test'),
  });
}
