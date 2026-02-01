import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { removeEmptyFields } from '@/lib/utils';

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

    // Set status to in_behandeling while n8n is processing
    await db.collection('quotes').doc(quoteId).update({
      status: 'in_behandeling',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // ─── 1. Collect ALL Material IDs from every source ───
      const materialIdsToBeFetched = new Set<string>();
      if (quote.klussen) {
        Object.values(quote.klussen).forEach((job: any) => {
          // From legacy selections
          if (job?.materialen?.selections) {
            Object.values(job.materialen.selections).forEach((sel: any) => {
              if (sel?.id) materialIdsToBeFetched.add(sel.id);
            });
          }
          // From new materialen_lijst
          if (job?.materialen?.materialen_lijst) {
            Object.values(job.materialen.materialen_lijst).forEach((entry: any) => {
              if (entry?.material?.id) materialIdsToBeFetched.add(entry.material.id);
            });
          }
          // Component materials are already included in materialen_lijst with comp_ prefix keys
        });
      }

      // ─── 2. Fetch full material details from Supabase ───
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
            .in('row_id', Array.from(materialIdsToBeFetched));

          if (!error && materials) {
            materials.forEach((m: any) => {
              const pr = typeof m.prijs === 'number' ? m.prijs : Number(m.prijs);
              const prStuk = typeof m.prijs_per_stuk === 'number' ? m.prijs_per_stuk : Number(m.prijs_per_stuk);
              materialMap.set(m.row_id, {
                ...m,
                prijs: isNaN(pr) ? 0 : pr,
                prijs_per_stuk: isNaN(prStuk) ? 0 : prStuk
              });
            });
          }
        } catch (err) {
          console.error("Failed to enrich materials:", err);
        }
      }

      // ─── Helper: Convert dimension values to numbers ───
      const NUMERIC_DIMENSION_KEYS = [
        'lengte', 'hoogte', 'diepte', 'breedte',
        'lengte1', 'lengte2', 'lengte3',
        'hoogte1', 'hoogte2', 'hoogte3',
        'hoogteLinks', 'hoogteRechts', 'hoogteNok',
        'hoogteZijkant', 'balkafstand', 'latafstand'
      ];

      const convertDimensions = (items: any[]) => {
        if (!Array.isArray(items)) return [];
        return items.map((item: any) => {
          const newItem = { ...item };
          NUMERIC_DIMENSION_KEYS.forEach(key => {
            if (newItem[key] !== undefined && newItem[key] !== null && newItem[key] !== '') {
              const parsed = Number(newItem[key]);
              if (!isNaN(parsed)) newItem[key] = parsed;
            }
          });
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
      };

      // ─── Helper: Enrich a single material entry with Supabase data ───
      const enrichMaterial = (entry: any) => {
        const mat = entry?.material;
        if (mat?.id && materialMap.has(mat.id)) {
          const full = materialMap.get(mat.id);
          return {
            ...entry,
            material: {
              id: full.row_id,
              materiaalnaam: full.materiaalnaam,
              categorie: full.categorie,
              eenheid: full.eenheid,
              leverancier: full.leverancier,
              prijs: full.prijs,
              prijs_per_stuk: full.prijs_per_stuk,
              dikte: full.dikte ?? null,
              breedte: full.breedte ?? null,
            }
          };
        }
        return entry;
      };

      // ─── 3. Process Jobs: Build clean Geometry + Inventory per job ───
      const jobArray = quote.klussen
        ? Object.values(quote.klussen)
          .map((job: any) => {
            const { uiState, ...rest } = job;
            const enrichedJob = { ...rest };

            const maatwerkObj = enrichedJob.maatwerk;
            const jobTitle = enrichedJob.meta?.title || "Basis klus";

            // ═══════════════════════════════════════════
            // A. GEOMETRY MAP (maatwerk) — Pure dimensions
            // ═══════════════════════════════════════════

            // A1. Basis items (main segments)
            const basisItems = maatwerkObj?.basis
              || maatwerkObj?.items
              || ((maatwerkObj && typeof maatwerkObj === 'object' && !Array.isArray(maatwerkObj))
                ? (maatwerkObj as any).items : null)
              || (Array.isArray(maatwerkObj) ? maatwerkObj : []);

            const convertedBasis = convertDimensions(basisItems);

            // A2. Toevoegingen (components → pure geometry with semantic keys)
            const rawComponents = (maatwerkObj as any)?.toevoegingen || [];

            const cleanToevoegingen = Array.isArray(rawComponents) ? rawComponents.map((c: any) => {
              const cleanAfmetingen: any = {};
              const source = c.measurements || c.afmetingen || {};

              Object.keys(source).forEach(k => {
                if (k === 'subtitle' || k === '_variantMode') return;
                let val = source[k];
                if (typeof val === 'string') {
                  const n = parseFloat(val.replace(',', '.'));
                  if (!isNaN(n)) val = n;
                }
                // Semantic key prefixing: 'leidingkoof_hoogte' instead of 'hoogte'
                const semanticKey = (k.startsWith(c.type) || k.includes('_')) ? k : `${c.type}_${k}`;
                cleanAfmetingen[semanticKey] = val;
              });

              return {
                type: c.type,
                label: c.label || c.type,
                afmetingen: cleanAfmetingen
              };
            }) : [];

            enrichedJob.maatwerk = {
              basis: {
                omschrijving: `Hoofdberekening voor ${jobTitle}`,
                items: convertedBasis
              },
              toevoegingen: cleanToevoegingen,
              notities: (maatwerkObj && typeof maatwerkObj === 'object' && !Array.isArray(maatwerkObj))
                ? (maatwerkObj as any).notities
                : (enrichedJob.material_notities || ""),
              meta: (maatwerkObj as any)?.meta || undefined,
            };

            // ═══════════════════════════════════════════
            // B. INVENTORY LIST (materialen) — Unified, enriched, labeled
            // ═══════════════════════════════════════════

            const unifiedList: any[] = [];

            // B1. Materials from materialen_lijst (primary source)
            const materialenLijst = enrichedJob.materialen?.materialen_lijst || {};
            Object.entries(materialenLijst).forEach(([slotKey, entry]: [string, any]) => {
              if (!entry?.material) return;
              const enriched = enrichMaterial(entry);
              unifiedList.push({
                slotKey,
                material: enriched.material,
                quantity: enriched.quantity ?? null,
                context: enriched.context || `Basis: ${jobTitle}`,
              });
            });

            // B2. Fallback: legacy selections (if materialen_lijst is empty)
            if (unifiedList.length === 0 && enrichedJob.materialen?.selections) {
              Object.entries(enrichedJob.materialen.selections).forEach(([slotKey, sel]: [string, any]) => {
                if (!sel?.id) return;
                const full = materialMap.get(sel.id);
                if (full) {
                  unifiedList.push({
                    slotKey,
                    material: {
                      id: full.row_id,
                      materiaalnaam: full.materiaalnaam,
                      categorie: full.categorie,
                      eenheid: full.eenheid,
                      leverancier: full.leverancier,
                      prijs: full.prijs,
                      prijs_per_stuk: full.prijs_per_stuk,
                      dikte: full.dikte ?? null,
                      breedte: full.breedte ?? null,
                    },
                    quantity: null,
                    context: `Basis: ${jobTitle}`,
                  });
                } else {
                  // Keep whatever we have
                  unifiedList.push({
                    slotKey,
                    material: sel,
                    quantity: null,
                    context: `Basis: ${jobTitle}`,
                  });
                }
              });
            }

            // B3. Component materials are already in materialen_lijst with comp_ keys (picked up by B1)

            // B4. Overwrite materialen with the unified, labeled list
            enrichedJob.materialen = {
              lijst: unifiedList,
              kleinMateriaal: enrichedJob.kleinMateriaal || null,
            };

            // ═══════════════════════════════════════════
            // C. CLEANUP — Remove all redundant/legacy keys
            // ═══════════════════════════════════════════
            delete enrichedJob.components;
            delete enrichedJob.material_notities;
            delete enrichedJob.maatwerk_notities;
            delete enrichedJob.measurements;
            delete enrichedJob.kleinMateriaal; // Already inside materialen

            // Remove any legacy {slug}_maatwerk keys
            const slug = enrichedJob.meta?.slug;
            if (slug) delete enrichedJob[`${slug}_maatwerk`];
            const jobKey = enrichedJob.materialen?.jobKey;
            if (jobKey) delete enrichedJob[`${jobKey}_maatwerk`];

            // Remove deprecated top-level dimension fields
            delete enrichedJob.lengteMm;
            delete enrichedJob.hoogteMm;
            delete enrichedJob.diepteMm;

            return enrichedJob;
          })
          .sort((a: any, b: any) => (a.volgorde || 9999) - (b.volgorde || 9999))
        : [];

      quote.klussen = jobArray;

      // 4. Fetch quote_notes subcollection
      try {
        const notesRef = db.collection('quotes').doc(quoteId).collection('quote_notes');
        const notesSnap = await notesRef.get();
        const notes = notesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Attach to the quote object
        quote.quote_notes = notes;
      } catch (err) {
        console.warn("Failed to fetch quote_notes:", err);
        // Continue without notes if this fails, rather than blocking the whole generate process
        quote.quote_notes = [];
      }

    } catch (e) {
      console.warn("Error during N8N payload optimization:", e);
      // Fallback: If optimization crashes, sending raw (but flattened) list is better than failing
      // But 'klussen' logic above handles the flattening. This catch is for extra safety.
      if (quote.klussen && !Array.isArray(quote.klussen)) {
        quote.klussen = Object.values(quote.klussen).map((j: any) => { const { uiState, ...r } = j; return r; });
      }
    }

    // Clean the entire quote object to remove empty arrays, objects, strings, nulls
    const optimizedQuote = removeEmptyFields(quote);

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
