import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  if (!decoded) {
    return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
  }
  const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
  if (trialBlockedResponse) return trialBlockedResponse;

  const isAllowed = decoded.dev === true || decoded.admin === true;
  if (!isAllowed) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  }

  const upsert = process.env.N8N_MATERIALEN_UPSERT_URL || '';
  const del = process.env.N8N_MATERIALEN_DELETE_URL || '';
  const base = process.env.N8N_WEBHOOK_URL || '';
  const templateUid = process.env.DEFAULT_TEMPLATE_UID || process.env.TEMPLATE_UID || '';
  const presetPackVersion = process.env.DEFAULT_PRESET_PACK_VERSION || '';
  const materialPackVersion = process.env.DEFAULT_MATERIAL_PACK_VERSION || '';

  return NextResponse.json({
    ok: true,
    env: {
      hasN8nHeaderSecret: Boolean(process.env.N8N_HEADER_SECRET),
      hasUpsertUrl: Boolean(upsert),
      hasDeleteUrl: Boolean(del),
      hasBaseWebhookUrl: Boolean(base),
      upsertUsesWebhookTest: upsert.includes('webhook-test'),
      deleteUsesWebhookTest: del.includes('webhook-test'),
      baseUsesWebhookTest: base.includes('webhook-test'),
      hasDefaultTemplateUid: Boolean(templateUid),
      hasDefaultPresetPackVersion: Boolean(presetPackVersion),
      hasDefaultMaterialPackVersion: Boolean(materialPackVersion),
    },
  });
}
