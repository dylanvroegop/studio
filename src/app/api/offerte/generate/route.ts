import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { removeEmptyFields } from '@/lib/utils';
import { calculateQuoteTotals, normalizeDataJson, QuoteSettings as QuoteCalculationSettings } from '@/lib/quote-calculations';

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

function mapSettingsForTotals(input: any): QuoteCalculationSettings {
  const normalized = normalizeDataJson(input);
  const rawInst = (normalized?.instellingen || {}) as any;
  const rawExtras = (normalized?.extras || {}) as any;

  return {
    btwTarief: rawInst?.btwTarief || 21,
    uurTariefExclBtw: rawInst?.uurTariefExclBtw || rawInst?.uurTarief || 50,
    schattingUren: rawInst?.schattingUren ?? false,
    extras: {
      transport: {
        prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm,
        vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten,
        tunnelkosten: rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten,
        mode: rawExtras?.transport?.mode ?? rawInst?.extras?.transport?.mode,
      },
      winstMarge: {
        percentage: rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
        fixedAmount: rawExtras?.winstMarge?.fixedAmount ?? 0,
        mode: rawExtras?.winstMarge?.mode ?? 'percentage',
        basis: rawExtras?.winstMarge?.basis ?? 'totaal',
      },
    },
  };
}

async function syncQuoteTotalsFromSupabase(db: FirebaseFirestore.Firestore, quoteId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    // n8n and Supabase writes can lag briefly; retry a few times.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from('quotes_collection')
        .select('data_json, created_at')
        .eq('quoteid', quoteId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.data_json) {
        const quoteSettings = mapSettingsForTotals(data.data_json);
        const totals = calculateQuoteTotals(data.data_json, quoteSettings);
        const totaalInclBtw = Number(totals?.totaalInclBtw || 0);

        if (Number.isFinite(totaalInclBtw)) {
          await db.collection('quotes').doc(quoteId).update({
            totaalbedrag: totaalInclBtw,
            amount: totaalInclBtw,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return true;
        }
      }

      // Wait before retrying, except after the final attempt.
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (err) {
    console.warn('Kon totaalbedrag niet direct syncen vanuit Supabase:', err);
  }

  return false;
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

async function haalBedrijfsgegevensOp(db: FirebaseFirestore.Firestore, quote: any) {
  const splitAddress = (value: string): { straat: string; huisnummer: string } => {
    const raw = (value || '').trim();
    const match = raw.match(/^(.*?)(?:\s+(\d+\S*))$/);
    if (!match) return { straat: raw, huisnummer: '' };
    return {
      straat: (match[1] || '').trim(),
      huisnummer: (match[2] || '').trim(),
    };
  };

  const ownerUid = quote?.userId;
  if (!ownerUid) {
    const split = splitAddress(quote?.bedrijfsgegevens?.adress || '');
    return {
      naam: quote?.bedrijfsgegevens?.naam || quote?.bedrijfsnaam || '',
      straat: quote?.bedrijfsgegevens?.straat || split.straat,
      huisnummer: quote?.bedrijfsgegevens?.huisnummer || split.huisnummer,
      postcode: quote?.bedrijfsgegevens?.postcode || '',
      plaats: quote?.bedrijfsgegevens?.plaats || '',
      email: quote?.bedrijfsgegevens?.email || '',
      telefoon: quote?.bedrijfsgegevens?.telefoon || '',
    };
  }

  const bedrijf = {
    naam: quote?.bedrijfsgegevens?.naam || quote?.bedrijfsnaam || '',
    straat: quote?.bedrijfsgegevens?.straat || '',
    huisnummer: quote?.bedrijfsgegevens?.huisnummer || '',
    postcode: quote?.bedrijfsgegevens?.postcode || '',
    plaats: quote?.bedrijfsgegevens?.plaats || '',
    email: quote?.bedrijfsgegevens?.email || '',
    telefoon: quote?.bedrijfsgegevens?.telefoon || '',
  };

  const [userSnap, businessSnap] = await Promise.all([
    db.collection('users').doc(ownerUid).get(),
    db.collection('businesses').doc(ownerUid).get(),
  ]);

  if (userSnap.exists) {
    const u = userSnap.data() || {};
    const splitFromUserAdress = splitAddress(u.bedrijfsgegevens?.adress || '');
    bedrijf.naam = bedrijf.naam || u.settings?.bedrijfsnaam || u.bedrijfsnaam || '';
    bedrijf.straat = bedrijf.straat || u.bedrijfsgegevens?.straat || u.settings?.adres || splitFromUserAdress.straat || '';
    bedrijf.huisnummer = bedrijf.huisnummer || u.bedrijfsgegevens?.huisnummer || u.settings?.huisnummer || splitFromUserAdress.huisnummer || '';
    bedrijf.postcode = bedrijf.postcode || u.bedrijfsgegevens?.postcode || u.settings?.postcode || u.postcode || '';
    bedrijf.plaats = bedrijf.plaats || u.bedrijfsgegevens?.plaats || u.settings?.plaats || u.plaats || u.city || '';
    bedrijf.email = bedrijf.email || u.settings?.email || u.email || '';
    bedrijf.telefoon = bedrijf.telefoon || u.settings?.telefoon || u.telefoon || '';
  }

  if (businessSnap.exists) {
    const b = businessSnap.data() || {};
    const splitFromBusinessAdress = splitAddress(b.bedrijfsgegevens?.adress || b.adres || '');
    bedrijf.naam = bedrijf.naam || b.bedrijfsnaam || b.contactNaam || '';
    bedrijf.straat = bedrijf.straat || b.bedrijfsgegevens?.straat || splitFromBusinessAdress.straat || '';
    bedrijf.huisnummer = bedrijf.huisnummer || b.bedrijfsgegevens?.huisnummer || splitFromBusinessAdress.huisnummer || '';
    bedrijf.postcode = bedrijf.postcode || b.bedrijfsgegevens?.postcode || b.postcode || '';
    bedrijf.plaats = bedrijf.plaats || b.bedrijfsgegevens?.plaats || b.plaats || '';
    bedrijf.email = bedrijf.email || b.email || '';
    bedrijf.telefoon = bedrijf.telefoon || b.telefoon || '';
  }

  return bedrijf;
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
            .from('main_material_list')
            .select('*')
            .in('row_id', Array.from(materialIdsToBeFetched));

          if (!error && materials) {
            materials.forEach((m: any) => {
              const rawPrijs = m.prijs ?? m.prijs_incl_btw;
              const pr = typeof rawPrijs === 'number' ? rawPrijs : Number(rawPrijs);
              const prStuk = typeof m.prijs_per_stuk === 'number' ? m.prijs_per_stuk : Number(m.prijs_per_stuk);
              materialMap.set(m.row_id, {
                ...m,
                subsectie: m.subsectie ?? m.categorie ?? null,
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
        'hoogteZijkant', 'balkafstand', 'latafstand',
        'vanLinks', 'vanOnder', 'aantalZijden'
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
          if (Array.isArray(newItem.koven)) {
            newItem.koven = newItem.koven.map((k: any) => {
              const newK = { ...k };
              ['lengte', 'hoogte', 'diepte', 'vanLinks', 'vanOnder', 'aantalZijden'].forEach(key => {
                if (newK[key] !== undefined && newK[key] !== null && newK[key] !== '') {
                  const num = Number(newK[key]);
                  if (!isNaN(num)) newK[key] = num;
                }
              });
              return newK;
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
                // Semantic key prefixing: 'koof_hoogte' instead of 'hoogte'
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
            const normalizedMaterialenLijst: Record<string, any> = {};

            // B1. Materials from materialen_lijst (primary source)
            const materialenLijst = enrichedJob.materialen?.materialen_lijst || {};
            Object.entries(materialenLijst).forEach(([slotKey, entry]: [string, any]) => {
              const enriched = enrichMaterial(entry);
              normalizedMaterialenLijst[slotKey] = enriched;
              if (!enriched?.material) return;
              unifiedList.push({
                slotKey,
                ...enriched,
                quantity: enriched.quantity ?? enriched.aantal ?? null,
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
              ...enrichedJob.materialen,
              materialen_lijst: normalizedMaterialenLijst,
              lijst: unifiedList,
              kleinMateriaal: enrichedJob.kleinMateriaal || enrichedJob.materialen?.kleinMateriaal || null,
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

    const klantinformatie = optimizedQuote?.klantinformatie || {};
    const { klantinformatie: _skipKlantinformatie, ...quoteZonderKlantinformatie } = optimizedQuote || {};
    const bedrijf = await haalBedrijfsgegevensOp(db, optimizedQuote);
    const payload = {
      quoteId,
      uid,
      quote: quoteZonderKlantinformatie,
      klantinformatie,
      bedrijf,
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

    // Best effort: sync totaal direct to Firestore so quotes list stays up-to-date.
    await syncQuoteTotalsFromSupabase(db, quoteId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || String(e) }, { status: 500 });
  }
}
