import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function verifyUser(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSupplierKey(value: unknown): string {
  const key = safeString(value).toLowerCase();
  if (key === 'toolstation' || key === 'gamma' || key === 'custom') return key;
  return 'bouwmaat';
}

function normalizePriceMode(value: unknown): 'excl' | 'incl' {
  return safeString(value).toLowerCase() === 'incl' ? 'incl' : 'excl';
}

export async function GET(request: Request) {
  try {
    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierKey = normalizeSupplierKey(searchParams.get('supplierKey'));

    const { data, error } = await supabaseAdmin
      .from('supplier_import_preferences')
      .select('price_mode, ai_audit_enabled')
      .eq('gebruikerid', uid)
      .eq('supplier_key', supplierKey)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message || 'Kon voorkeuren niet laden.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      preference: {
        supplierKey,
        priceMode: normalizePriceMode((data as Record<string, unknown> | null)?.price_mode),
        aiAuditEnabled: typeof (data as Record<string, unknown> | null)?.ai_audit_enabled === 'boolean'
          ? Boolean((data as Record<string, unknown> | null)?.ai_audit_enabled)
          : false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon voorkeuren niet laden.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const supplierKey = normalizeSupplierKey(payload.supplierKey);
    const priceMode = normalizePriceMode(payload.priceMode);
    const aiAuditEnabled = typeof payload.aiAuditEnabled === 'boolean' ? payload.aiAuditEnabled : false;

    const { error } = await supabaseAdmin
      .from('supplier_import_preferences')
      .upsert(
        {
          gebruikerid: uid,
          supplier_key: supplierKey,
          price_mode: priceMode,
          ai_audit_enabled: aiAuditEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'gebruikerid,supplier_key' }
      );

    if (error) {
      return NextResponse.json({ ok: false, message: error.message || 'Kon voorkeuren niet opslaan.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      preference: {
        supplierKey,
        priceMode,
        aiAuditEnabled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon voorkeuren niet opslaan.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
