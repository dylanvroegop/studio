// src/app/api/offerte/generate/route.ts
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length) return;

  const json = process.env.FIREBASE_ADMIN_JSON;
  if (!json) throw new Error('FIREBASE_ADMIN_JSON ontbreekt');

  initializeApp({
    credential: cert(JSON.parse(json)),
  });
}

function leesBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function randomId(lengte = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < lengte; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    initAdmin();

    // 1) Input
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quoteId;

    if (!quoteId || typeof quoteId !== 'string') {
      return NextResponse.json({ error: 'quoteId ontbreekt' }, { status: 400 });
    }

    // 2) Auth (server-side)
    const token = leesBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    // 3) Server config
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const n8nSecret = process.env.N8N_HEADER_SECRET;

    if (!n8nUrl || !n8nSecret) {
      return NextResponse.json({ error: 'Server config ontbreekt' }, { status: 500 });
    }

    const db = getFirestore();

    // 4) Quote ophalen + ownership check
    const quoteRef = db.collection('quotes').doc(quoteId);
    const quoteSnap = await quoteRef.get();

    if (!quoteSnap.exists) {
      return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });
    }

    const quote = quoteSnap.data() as any;

    // Pas dit veld aan naar jouw schema (bijv. userId / ownerId)
    const eigenaarId = quote?.userId || quote?.ownerId;
    if (!eigenaarId || eigenaarId !== uid) {
      return NextResponse.json({ error: 'Geen toegang tot deze offerte' }, { status: 403 });
    }

    // 5) Credits + simpele limieten (MVP)
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const user = (userSnap.exists ? userSnap.data() : null) as any;

    const credits = Number(user?.credits ?? 0);
    const kostenCredits = 1; // MVP: 1 credit per generate

    if (credits < kostenCredits) {
      return NextResponse.json({ error: 'Onvoldoende credits' }, { status: 402 });
    }

    // 6) Lock tegen dubbel klikken / spam
    // We gebruiken een veld op de quote om "genereren bezig" vast te leggen.
    // Als het al bezig is, blokkeren we.
    const isBezig = Boolean(quote?.generateInProgress);
    const laatsteStart = quote?.generateStartedAt?.toMillis?.() ?? 0;
    const nu = Date.now();

    // Als er in de laatste 2 minuten al een run gestart is, blokkeren (aanpasbaar).
    if (isBezig && nu - laatsteStart < 2 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Genereren is al bezig. Wacht even.' },
        { status: 409 }
      );
    }

    // 7) Job aanmaken + state zetten (atomair via transaction)
    const jobId = `job_${randomId(24)}`;
    const jobRef = db.collection('quote_jobs').doc(jobId);

    await db.runTransaction(async (tx) => {
      const freshQuote = await tx.get(quoteRef);
      const q = freshQuote.data() as any;

      const bezig = Boolean(q?.generateInProgress);
      const gestart = q?.generateStartedAt?.toMillis?.() ?? 0;
      if (bezig && Date.now() - gestart < 2 * 60 * 1000) {
        throw new Error('AL_BEZIG');
      }

      // Credits reserveren / afboeken (MVP: direct afboeken)
      const freshUser = await tx.get(userRef);
      const u = (freshUser.exists ? freshUser.data() : null) as any;
      const c = Number(u?.credits ?? 0);

      if (c < kostenCredits) throw new Error('GEEN_CREDITS');

      tx.set(
        jobRef,
        {
          uid,
          quoteId,
          status: 'queued', // queued -> running -> success/fail
          createdAt: FieldValue.serverTimestamp(),
          kostenCredits,
        },
        { merge: true }
      );

      tx.update(quoteRef, {
        generateInProgress: true,
        generateStartedAt: FieldValue.serverTimestamp(),
        lastJobId: jobId,
      });

      tx.set(
        userRef,
        {
          credits: c - kostenCredits,
          lastGenerateAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }).catch((e) => {
      if (String(e?.message) === 'AL_BEZIG') {
        return Promise.reject({ code: 409, msg: 'Genereren is al bezig. Wacht even.' });
      }
      if (String(e?.message) === 'GEEN_CREDITS') {
        return Promise.reject({ code: 402, msg: 'Onvoldoende credits' });
      }
      return Promise.reject(e);
    });

    // 8) n8n aanroepen (server -> n8n)
    // Stuur MINIMAAL: jobId + quoteId + uid. (n8n hoeft je uid niet te vertrouwen,
    // maar het helpt voor logging/callback.)
    await jobRef.set(
      {
        status: 'running',
        startedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // let op: header key moet exact matchen met jouw n8n Header Auth credential
        'x-offertehulp-secret': n8nSecret,
      },
      body: JSON.stringify({
        jobId,
        quoteId,
        uid,
        // optioneel: stuur hier de data mee die n8n nodig heeft,
        // maar beter is: n8n haalt niets uit Firestore -> jij stuurt "approved payload".
      }),
    });

    if (!n8nRes.ok) {
      const txt = await n8nRes.text().catch(() => '');
      // Rollback gedrag MVP: markeer job fail + release lock.
      await jobRef.set(
        {
          status: 'fail',
          error: `n8n fout: ${n8nRes.status} ${txt}`.slice(0, 2000),
          finishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await quoteRef.set({ generateInProgress: false }, { merge: true });

      return NextResponse.json(
        { error: 'n8n call mislukt', status: n8nRes.status },
        { status: 502 }
      );
    }

    // 9) OK
    return NextResponse.json({ ok: true, jobId }, { status: 200 });
  } catch (err: any) {
    // Transaction custom errors
    if (err?.code === 409) return NextResponse.json({ error: err.msg }, { status: 409 });
    if (err?.code === 402) return NextResponse.json({ error: err.msg }, { status: 402 });

    const msg = typeof err?.message === 'string' ? err.message : 'Onbekende fout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
