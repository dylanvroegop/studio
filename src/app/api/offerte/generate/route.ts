import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Firebase Admin via ADC (werkt op Firebase App Hosting)
 */
function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function krijgFirestore() {
  const app = krijgFirebaseAdminApp();
  return admin.firestore(app);
}

async function leesBodyVeilig(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * UID bepalen
 */
async function bepaalUid(req: Request): Promise<string> {
  const devBypass = process.env.NODE_ENV !== 'production';
  if (devBypass) return 'dev-user';

  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) throw new Error('Geen Authorization: Bearer <idToken> header gevonden.');

  const idToken = match[1];
  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(idToken);

  return decoded.uid;
}

/**
 * Quote ophalen (alleen hoofddoc, geen subcollecties)
 */
async function haalQuoteOp(db: FirebaseFirestore.Firestore, quoteId: string) {
  const ref = db.collection('quotes').doc(quoteId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error('Quote niet gevonden');

  return { id: snap.id, ...snap.data() };
}

/**
 * POST
 */
export async function POST(req: Request) {
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Body is geen geldige JSON' }, { status: 400 });
    }

    const quoteId = body.quoteId;
    if (!quoteId || typeof quoteId !== 'string') {
      return NextResponse.json({ ok: false, message: 'quoteId ontbreekt' }, { status: 400 });
    }

    if (!process.env.N8N_WEBHOOK_URL) throw new Error('ENV ontbreekt: N8N_WEBHOOK_URL');
    if (!process.env.N8N_HEADER_SECRET) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

    const uid = await bepaalUid(req);
    const db = krijgFirestore();

    const quote = await haalQuoteOp(db, quoteId);

    const payload = {
      quoteId,
      uid,
      quote,
    };

    const res = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-offertehulp-secret': process.env.N8N_HEADER_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const tekst = await res.text();
    if (!res.ok) throw new Error(`n8n error ${res.status}: ${tekst}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || String(e) }, { status: 500 });
  }
}
