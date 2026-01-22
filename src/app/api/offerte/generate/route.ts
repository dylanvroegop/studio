import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Firebase Admin via ADC (werkt op Firebase App Hosting)*/
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

    const quote = await haalQuoteOp(db, quoteId) as any;

    try {
      // 1. Collect all Material IDs to fetch
      const materialIdsToBeFetched = new Set<string>();
      if (quote.klussen) {
        Object.values(quote.klussen).forEach((job: any) => {
          if (job?.materialen?.selections) {
            Object.values(job.materialen.selections).forEach((sel: any) => {
              if (sel?.id) materialIdsToBeFetched.add(sel.id);
            });
          }
        });
      }

      // 2. Fetch full material details from Supabase (if we have IDs)
      let materialMap = new Map<string, any>();
      if (materialIdsToBeFetched.size > 0 && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        try {
          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          );

          const { data: materials, error } = await supabase
            .from('materialen')
            .select('*')
            .in('id', Array.from(materialIdsToBeFetched));

          if (!error && materials) {
            materials.forEach((m: any) => {
              // Ensure numeric price
              const pr = typeof m.prijs === 'number' ? m.prijs : Number(m.prijs);
              const prStuk = typeof m.prijs_per_stuk === 'number' ? m.prijs_per_stuk : Number(m.prijs_per_stuk);
              materialMap.set(m.id, { ...m, prijs: isNaN(pr) ? 0 : pr, prijs_per_stuk: isNaN(prStuk) ? 0 : prStuk });
            });
          }
        } catch (err) {
          console.error("Failed to enrich materials:", err);
        }
      }

      // 3. Process Jobs: Flatten, Enrich Materials, Convert Dimensions
      const jobArray = quote.klussen
        ? Object.values(quote.klussen)
          .map((job: any) => {
            const { uiState, ...rest } = job;
            const enrichedJob = { ...rest };

            // A. Enrich Materials
            if (enrichedJob.materialen?.selections) {
              const enrichedSelections: any = {};
              Object.entries(enrichedJob.materialen.selections).forEach(([key, val]: [string, any]) => {
                if (val?.id && materialMap.has(val.id)) {
                  // Inject full details (Name, Price, Unit)
                  enrichedSelections[key] = materialMap.get(val.id);
                } else {
                  // Fallback to existing
                  enrichedSelections[key] = val;
                }
              });
              enrichedJob.materialen.selections = enrichedSelections;
            }

            // B. Force Dimensions to Numbers
            if (enrichedJob.maatwerk && Array.isArray(enrichedJob.maatwerk)) {
              enrichedJob.maatwerk = enrichedJob.maatwerk.map((item: any) => {
                const newItem = { ...item };
                // List of keys known to be numeric dimensions
                const numericKeys = [
                  'lengte', 'hoogte', 'diepte', 'breedte',
                  'lengte1', 'lengte2', 'lengte3',
                  'hoogte1', 'hoogte2', 'hoogte3',
                  'hoogteLinks', 'hoogteRechts', 'hoogteNok',
                  'hoogteZijkant', 'balkafstand', 'latafstand'
                ];

                numericKeys.forEach(key => {
                  if (newItem[key] !== undefined && newItem[key] !== null && newItem[key] !== '') {
                    const parsed = Number(newItem[key]);
                    if (!isNaN(parsed)) newItem[key] = parsed;
                  }
                });

                // Also fix openings
                if (Array.isArray(newItem.openings)) {
                  newItem.openings = newItem.openings.map((op: any) => {
                    const newOp = { ...op };
                    ['width', 'height', 'fromLeft', 'fromBottom'].forEach(k => {
                      if (newOp[k] !== undefined) newOp[k] = Number(newOp[k]);
                    });
                    return newOp;
                  });
                }

                return newItem;
              });
            }

            return enrichedJob;
          })
          .sort((a: any, b: any) => (a.volgorde || 9999) - (b.volgorde || 9999))
        : [];

      quote.klussen = jobArray; // Assign processed array

    } catch (e) {
      console.warn("Error during N8N payload optimization:", e);
      // Fallback: If optimization crashes, sending raw (but flattened) list is better than failing
      // But 'klussen' logic above handles the flattening. This catch is for extra safety.
      if (quote.klussen && !Array.isArray(quote.klussen)) {
        quote.klussen = Object.values(quote.klussen).map((j: any) => { const { uiState, ...r } = j; return r; });
      }
    }

    const optimizedQuote = quote;

    const payload = {
      quoteId,
      uid,
      quote: optimizedQuote,
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
