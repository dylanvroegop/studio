import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { parsePriceToNumber, removeEmptyFields } from '@/lib/utils';
import { calculateQuoteTotals, normalizeDataJson, QuoteSettings as QuoteCalculationSettings } from '@/lib/quote-calculations';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { getMaterialRule } from '@/lib/klus-regels-static';

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

async function syncQuoteTotalsFromSupabase(
  db: FirebaseFirestore.Firestore,
  quoteId: string,
  uid: string
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    // n8n and Supabase writes can lag briefly; retry a few times.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from('quotes_collection')
        .select('data_json, created_at')
        .eq('quoteid', quoteId)
        .eq('gebruikerid', uid)
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
  const devBypassUid = process.env.OFFERTE_GENERATE_DEV_BYPASS_UID?.trim();
  if (process.env.NODE_ENV !== 'production' && devBypassUid) return devBypassUid;

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

function getAllowedMaterialSectionKeys(jobKey: string | undefined): Set<string> {
  if (!jobKey) return new Set<string>();

  for (const category of Object.values(JOB_REGISTRY)) {
    const match = category.items.find((item) => item.slug === jobKey);
    if (match?.materialSections?.length) {
      return new Set(match.materialSections.map((section) => section.key));
    }
  }

  return new Set<string>();
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

function bepaalTestWebhookUrl(productieUrl: string): string | null {
  const clean = (productieUrl || '').trim();
  if (!clean) return null;

  if (clean.includes('/webhook-test/')) return clean;
  if (clean.includes('/webhook/')) return clean.replace('/webhook/', '/webhook-test/');

  return null;
}

function isTestWebhookNietActief(status: number, body: string): boolean {
  if (status === 404 || status === 410) return true;

  const txt = (body || '').toLowerCase();
  if (!txt) return false;

  const heeftWebhook = txt.includes('webhook');
  const nietGeregistreerd = txt.includes('not registered') || txt.includes('is not registered');
  const nietGevonden = txt.includes('not found');

  return heeftWebhook && (nietGeregistreerd || nietGevonden);
}

async function postN8nMetTestFallback(payload: unknown, secret: string): Promise<void> {
  const productieUrl = process.env.N8N_WEBHOOK_URL?.trim();
  if (!productieUrl) throw new Error('ENV ontbreekt: N8N_WEBHOOK_URL');

  // Never send production traffic to webhook-test endpoints.
  const allowTestFallback =
    process.env.NODE_ENV !== 'production'
    && process.env.N8N_WEBHOOK_ALLOW_TEST_FALLBACK !== 'false';
  const explicieteTestUrl = allowTestFallback ? process.env.N8N_WEBHOOK_TEST_URL?.trim() : null;
  const testUrl = allowTestFallback
    ? (explicieteTestUrl || bepaalTestWebhookUrl(productieUrl))
    : null;

  const headers = {
    'content-type': 'application/json',
    'x-offertehulp-secret': secret.trim(),
  };

  const body = JSON.stringify(payload);

  const post = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  };

  if (testUrl && testUrl !== productieUrl) {
    let testResult: { ok: boolean; status: number; text: string } | null = null;

    try {
      testResult = await post(testUrl);
    } catch (err) {
      console.warn('n8n test webhook request faalde, fallback naar productie.', err);
    }

    if (testResult?.ok) return;

    if (testResult && !isTestWebhookNietActief(testResult.status, testResult.text)) {
      throw new Error(`n8n test error ${testResult.status}: ${testResult.text}`);
    }

    if (testResult) {
      console.warn(`n8n test webhook niet actief (status ${testResult.status}), fallback naar productie.`);
    }
  }

  const productieResult = await post(productieUrl);
  if (!productieResult.ok) {
    throw new Error(`n8n productie error ${productieResult.status}: ${productieResult.text}`);
  }
}

/**
 * POST
 */
export async function POST(req: Request) {
  let db: FirebaseFirestore.Firestore | null = null;
  let quoteIdForError: string | null = null;
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Body is geen geldige JSON' }, { status: 400 });
    }

    const quoteId = body.quoteId;
    if (!quoteId || typeof quoteId !== 'string') {
      return NextResponse.json({ ok: false, message: 'quoteId ontbreekt' }, { status: 400 });
    }
    quoteIdForError = quoteId;

    if (!process.env.N8N_WEBHOOK_URL) throw new Error('ENV ontbreekt: N8N_WEBHOOK_URL');
    if (!process.env.N8N_HEADER_SECRET) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

    const uid = await bepaalUid(req);
    db = krijgFirestore();

    const quote = await haalQuoteOp(db, quoteId) as any;
    if (!quote?.userId || quote.userId !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte' }, { status: 403 });
    }

    // Set status to in_behandeling while n8n is processing
    await db.collection('quotes').doc(quoteId).update({
      status: 'in_behandeling',
      calculationStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // ─── 1. Collect ALL Material IDs from every source ───
      const materialIdsToBeFetched = new Set<string>();
      const getMaterialLookupId = (material: any): string | null => {
        const id = material?.id ?? material?.row_id ?? material?.material_ref_id;
        if (id === undefined || id === null || id === '') return null;
        return String(id);
      };
      if (quote.klussen) {
        Object.values(quote.klussen).forEach((job: any) => {
          // From legacy selections
          if (job?.materialen?.selections) {
            Object.values(job.materialen.selections).forEach((sel: any) => {
              const selectionId = getMaterialLookupId(sel);
              if (selectionId) materialIdsToBeFetched.add(selectionId);
            });
          }
          // From new materialen_lijst
          if (job?.materialen?.materialen_lijst) {
            Object.values(job.materialen.materialen_lijst).forEach((entry: any) => {
              const materialId = getMaterialLookupId(entry?.material);
              if (materialId) materialIdsToBeFetched.add(materialId);
            });
          }
          // Component materials are already included in materialen_lijst with comp_ prefix keys
        });
      }

      // ─── 2. Fetch full material details from Supabase ───
      let materialMap = new Map<string, any>();
      if (materialIdsToBeFetched.size > 0) {
        try {
          const { supabaseAdmin } = await import('@/lib/supabase-admin');

          const { data: materials, error } = await supabaseAdmin
            .from('main_material_list')
            .select('*')
            .in('row_id', Array.from(materialIdsToBeFetched))
            .or(`gebruikerid.eq.${uid},gebruikerid.is.null`);

          if (!error && materials) {
            materials.forEach((m: any) => {
              const incl = parsePriceToNumber(m.prijs_incl_btw ?? m.prijs);
              const excl = parsePriceToNumber(m.prijs_excl_btw) ?? (incl != null ? Number((incl / 1.21).toFixed(2)) : 0);
              materialMap.set(String(m.row_id), {
                ...m,
                subsectie: m.subsectie ?? m.categorie ?? null,
                prijs_excl_btw: excl,
                prijs_incl_btw: incl ?? Number((excl * 1.21).toFixed(2)),
                // Backwards compatibility for n8n flow: these are used as unit price in calculations.
                prijs: excl,
                prijs_per_stuk: excl,
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
        'vanLinks', 'vanOnder', 'aantalZijden',
        'tussenmuur_vanaf_links_maat'
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

      const toPositiveNumber = (value: any): number | null => {
        const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
      };

      const buildGolfplaatGordingLengte = (sourceItem: Record<string, any>): string | null => {
        const lengteMm = toPositiveNumber(sourceItem.lengte);
        const breedteMm = toPositiveNumber(sourceItem.breedte ?? sourceItem.hoogte);
        const balkafstandMm = toPositiveNumber(sourceItem.balkafstand);
        if (!lengteMm || !breedteMm || !balkafstandMm) return null;

        const includeTopBottom = Boolean(sourceItem.includeTopBottomGording);
        const interiorRows = Math.max(0, Math.ceil(lengteMm / balkafstandMm) - 1);
        const rows = interiorRows + (includeTopBottom ? 2 : 0);
        if (rows <= 0) return null;

        const tussenmuurMm = toPositiveNumber(sourceItem.tussenmuur_vanaf_links_maat ?? sourceItem.tussenmuur);
        if (tussenmuurMm && tussenmuurMm > 0 && tussenmuurMm < breedteMm) {
          const leftLen = Math.round(tussenmuurMm);
          const rightLen = Math.round(breedteMm - tussenmuurMm);
          if (leftLen > 0 && rightLen > 0) {
            if (leftLen === rightLen) {
              return `${rows * 2}x ${leftLen}mm`;
            }
            return `${rows}x ${leftLen}mm + ${rows}x ${rightLen}mm`;
          }
        }

        return `${rows}x ${Math.round(breedteMm)}mm`;
      };

      const normalizeGolfplaatBasisItems = (items: any[]): any[] => {
        if (!Array.isArray(items)) return [];

        return items.map((rawItem) => {
          if (!rawItem || typeof rawItem !== 'object') return rawItem;

          const item = { ...rawItem };
          const { tussenmuur, ...withoutTussenmuur } = item;
          const normalized = { ...withoutTussenmuur } as Record<string, any>;

          // Golfplaat UI stores horizontal span under `hoogte` for backward compatibility.
          // For n8n payload clarity we expose this as `breedte`.
          if (
            (normalized.breedte === undefined || normalized.breedte === null || normalized.breedte === '')
            && normalized.hoogte !== undefined
            && normalized.hoogte !== null
            && normalized.hoogte !== ''
          ) {
            normalized.breedte = normalized.hoogte;
          }
          delete normalized.hoogte;
          delete normalized.aantal_daken;
          if (normalized.gording_in_breedte === undefined || normalized.gording_in_breedte === null || normalized.gording_in_breedte === '') {
            normalized.gording_in_breedte = 'horizontaal';
          }
          if (
            (normalized.tussenmuur_vanaf_links_maat === undefined
              || normalized.tussenmuur_vanaf_links_maat === null
              || normalized.tussenmuur_vanaf_links_maat === '')
            && tussenmuur !== undefined
            && tussenmuur !== null
            && tussenmuur !== ''
          ) {
            normalized.tussenmuur_vanaf_links_maat = tussenmuur;
          }
          const gordingLengte = buildGolfplaatGordingLengte({
            ...normalized,
          });
          if (gordingLengte) normalized.gording_lengte = gordingLengte;
          else delete normalized.gording_lengte;

          return normalized;
        });
      };

      const enrichEpdmBasisItems = (items: any[]): any[] => {
        if (!Array.isArray(items)) return [];
        const allSides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
        const sideDirection: Record<'top' | 'right' | 'bottom' | 'left', string> = {
          top: 'noord',
          right: 'oost',
          bottom: 'zuid',
          left: 'west',
        };
        const sideLabel: Record<'top' | 'right' | 'bottom' | 'left', string> = {
          top: 'boven',
          right: 'rechts',
          bottom: 'onder',
          left: 'links',
        };
        const parseMm = (value: any): number => {
          const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        };
        const normalizeEdge = (value: any, fallback: 'free' | 'wall'): 'free' | 'wall' => {
          const normalized = String(value ?? '').trim().toLowerCase();
          if (normalized === 'free') return 'free';
          if (normalized === 'wall') return 'wall';
          return fallback;
        };

        return items.map((rawItem) => {
          if (!rawItem || typeof rawItem !== 'object') return rawItem;
          const item = { ...rawItem } as Record<string, any>;
          const lengteMm = parseMm(item.lengte);
          const hoogteMm = parseMm(item.hoogte);
          const edgeBySide: Record<'top' | 'right' | 'bottom' | 'left', 'free' | 'wall'> = {
            top: normalizeEdge(item.edge_top, 'wall'),
            right: normalizeEdge(item.edge_right, 'free'),
            bottom: normalizeEdge(item.edge_bottom, 'free'),
            left: normalizeEdge(item.edge_left, 'free'),
          };
          const sideLengthMm: Record<'top' | 'right' | 'bottom' | 'left', number> = {
            top: lengteMm,
            right: hoogteMm,
            bottom: lengteMm,
            left: hoogteMm,
          };

          const randen = allSides.map((side) => ({
            side,
            richting: sideDirection[side],
            positie: sideLabel[side],
            type: edgeBySide[side],
            lengte_mm: sideLengthMm[side],
            lengte_m1: Number((sideLengthMm[side] / 1000).toFixed(3)),
            lood: Boolean(item[`lood_${side}`]),
            daktrim: Boolean(item[`daktrim_${side}`]),
            dakgoot: Boolean(item[`dakgoot_${side}`]),
          }));
          const vrijeRanden = randen.filter((row) => row.type === 'free');
          const gevelRanden = randen.filter((row) => row.type === 'wall');
          const daktrimRanden = randen.filter((row) => row.daktrim);
          const loodRanden = randen.filter((row) => row.lood);
          const dakgootRanden = randen.filter((row) => row.dakgoot);
          const daktrimHoekenAuto =
            (Boolean(item.daktrim_top) && Boolean(item.daktrim_right) ? 1 : 0)
            + (Boolean(item.daktrim_right) && Boolean(item.daktrim_bottom) ? 1 : 0)
            + (Boolean(item.daktrim_bottom) && Boolean(item.daktrim_left) ? 1 : 0)
            + (Boolean(item.daktrim_left) && Boolean(item.daktrim_top) ? 1 : 0);

          item.epdm_randen = randen;
          item.epdm_randen_summary = {
            vrije_randen_m1: Number(vrijeRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
            gevel_randen_m1: Number(gevelRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
            daktrim_randen_m1: Number(daktrimRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
            lood_randen_m1: Number(loodRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
            dakgoot_randen_m1: Number(dakgootRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
            daktrim_hoeken_auto: daktrimHoekenAuto,
            vrije_randen_detail: vrijeRanden.map((row) => `${row.richting}:${row.lengte_m1}m`),
            gevel_randen_detail: gevelRanden.map((row) => `${row.richting}:${row.lengte_m1}m`),
          };

          return item;
        });
      };

      // Strip waste multipliers and premature final ceil() from embedded rule formulas
      // so all calculations follow: basis (decimaal) -> afval -> 1x afronden op eindresultaat.
      const stripWasteFromFormula = (formula: string): string => (
        formula
          .replace(/\s*\*\s*\(1\s*\+\s*waste\/100\)/g, '')
          .replace(/\(1\s*\+\s*waste\/100\)\s*\*\s*/g, '')
          .replace(/\s*\*\s*\(1\s*\+\s*\(user_input_wastePercentage\s*\/\s*100\)\)/g, '')
          .replace(/\(1\s*\+\s*\(user_input_wastePercentage\s*\/\s*100\)\)\s*\*\s*/g, '')
          .replace(/\s*\*\s*wastePercentage\b/g, '')
          .replace(/\bwastePercentage\s*\*\s*/g, '')
          .replace(/\s*\*\s*waste_multiplier\b/g, '')
          .replace(/\bwaste_multiplier\s*\*\s*/g, '')
          // Prevent early rounding of final material quantities.
          .replace(/\baantal\s*=\s*ceil\(\s*([^;]+?)\s*\)/gi, 'aantal = ($1)')
          .replace(/\bstuks\s*=\s*ceil\(\s*([^;]+?)\s*\)/gi, 'stuks = ($1)')
          .replace(/\btotaal\s*=\s*ceil\(\s*([^;]+?)\s*\)/gi, 'totaal = ($1)')
      );

      const sanitizeRuleObject = (rule: any): any => {
        if (Array.isArray(rule)) {
          return rule.map((item) => sanitizeRuleObject(item));
        }
        if (!rule || typeof rule !== 'object') return rule;

        const next: Record<string, any> = {};
        Object.entries(rule).forEach(([key, value]) => {
          if ((key === 'formula' || key === 'primary_formula' || key === 'fallback_formula') && typeof value === 'string') {
            next[key] = stripWasteFromFormula(value);
          } else if (value && typeof value === 'object') {
            next[key] = sanitizeRuleObject(value);
          } else {
            next[key] = value;
          }
        });
        return next;
      };

      const appendWasteRoundingPolicy = (rule: any): any => {
        if (!rule || typeof rule !== 'object') return rule;
        return {
          ...rule,
          waste_rounding_policy: {
            order: 'bereken_basis_zonder_tussentijds_afronden -> pas_afval_toe -> rond_eenmalig_naar_boven',
            final_rounding: 'ceil',
            no_intermediate_rounding: true,
            notes: [
              'Rond nooit aantal/stuks/totaal af voordat afval is toegepast.',
              'Voorbeeld correct: 120.1 * 1.1 = 132.11 -> ceil = 133.',
              'Voorbeeld incorrect: ceil(120.1)=121; 121 * 1.1 = 133.1 -> ceil = 134.'
            ],
          },
        };
      };

      const sanitizeEntryRule = (entry: any) => {
        if (!entry || typeof entry !== 'object' || !entry.rule || typeof entry.rule !== 'object') return entry;
        const sanitizedRule = sanitizeRuleObject(entry.rule);
        return {
          ...entry,
          rule: appendWasteRoundingPolicy(sanitizedRule),
        };
      };

      const GOLFPLAAT_OVERLAP_LOGIC =
        'plaatlengte volgt daklengte; dakbreedte wordt gevuld met werkende breedte (plaatbreedte - 50mm overlap)';
      const GOLFPLAAT_OVERLAP_FORMULA =
        'dak_breedte_mm = (maatwerk_item.breedte ?? maatwerk_item.hoogte); if material.breedte_m exists then werkende_breedte_mm = max(1, (material.breedte_m * 1000) - 50); else if material.werkende_breedte_mm exists then werkende_breedte_mm = material.werkende_breedte_mm; else werkende_breedte_mm = null; if werkende_breedte_mm exists then rows = ceil(dak_lengte_mm / material.lengte_mm); cols = ceil(dak_breedte_mm / werkende_breedte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(dak_netto_m2 / plaat_m2); aantal = ceil(stuks)';

      const normalizeGolfplaatRuleEntry = (
        entry: Record<string, any>,
        jobSlug: string,
        sectionKey: string | null,
      ): Record<string, any> => {
        if (!entry || typeof entry !== 'object') return entry;
        if (!jobSlug.includes('golfplaat-dak')) return entry;
        if (sectionKey !== 'golfplaten') return entry;

        const next = { ...entry };
        const rule = next.rule && typeof next.rule === 'object'
          ? { ...next.rule }
          : {};

        next.rule = {
          ...rule,
          logic: GOLFPLAAT_OVERLAP_LOGIC,
          formula: GOLFPLAAT_OVERLAP_FORMULA,
        };
        return next;
      };

      const normalizeEpdmDaktrimSectionKey = (
        jobSlug: string,
        sectionKey: string | null,
        material: any
      ): string | null => {
        if (String(jobSlug || '').toLowerCase() !== 'epdm-dakbedekking') return sectionKey;
        const materialName = String(material?.materiaalnaam || '').toLowerCase();
        if (!materialName.includes('daktrim')) return sectionKey;

        const hasCornerHint =
          materialName.includes('hoekstuk')
          || materialName.includes('hoekstukken')
          || /\bhoek\b/.test(materialName)
          || /\bhoeken\b/.test(materialName);

        if (sectionKey === 'daktrim' && hasCornerHint) return 'daktrim_hoeken';
        if (sectionKey === 'daktrim_hoeken' && !hasCornerHint) return 'daktrim';
        if (!sectionKey) return hasCornerHint ? 'daktrim_hoeken' : 'daktrim';
        return sectionKey;
      };

      const refreshStaticRuleForSection = (
        entry: Record<string, any>,
        jobSlug: string,
        sectionKey: string | null
      ): Record<string, any> => {
        if (!entry || typeof entry !== 'object' || !sectionKey) return entry;
        const attachment = getMaterialRule(jobSlug, sectionKey);
        if (!attachment) return entry;
        const strippedRule = attachment.rule && typeof attachment.rule === 'object'
          ? (() => {
            const { required_inputs, missing_input_behavior, ...rest } = attachment.rule as Record<string, any>;
            return rest;
          })()
          : null;
        return {
          ...entry,
          rule: strippedRule,
          rule_meta: attachment.rule_meta,
        };
      };

      // ─── Helper: Enrich a single material entry with Supabase data ───
      const enrichMaterial = (entry: any) => {
        const mat = entry?.material;
        const materialLookupId = getMaterialLookupId(mat);
        if (materialLookupId && materialMap.has(materialLookupId)) {
          const full = materialMap.get(materialLookupId);
          // Keep entry-level metadata (rule, rule_meta, context, wastePercentage, etc.) intact.
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
            const jobSlug = String(
              enrichedJob?.meta?.slug
              || (maatwerkObj as any)?.meta?.slug
              || enrichedJob?.materialen?.jobKey
              || ''
            ).toLowerCase();
            const normalizedBasis = jobSlug.includes('golfplaat-dak')
              ? normalizeGolfplaatBasisItems(convertedBasis)
              : (jobSlug.includes('epdm-dakbedekking')
                ? enrichEpdmBasisItems(convertedBasis)
                : convertedBasis);

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
                items: normalizedBasis
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

            const normalizedMaterialenLijst: Record<string, any> = {};
            const allowedSectionKeys = getAllowedMaterialSectionKeys(enrichedJob.materialen?.jobKey);

            // B1. Materials from materialen_lijst (primary source)
            const materialenLijst = enrichedJob.materialen?.materialen_lijst || {};
            Object.entries(materialenLijst).forEach(([slotKey, entry]: [string, any]) => {
              let enriched = enrichMaterial(entry);
              if (!enriched?.material) return;
              const isComponentEntry = slotKey.startsWith('comp_') || enriched.type === 'component_material';
              const rawSectionKey = typeof enriched.sectionKey === 'string' ? enriched.sectionKey : null;
              const fallbackSectionKey = typeof entry?.sectionKey === 'string' ? entry.sectionKey : null;
              let normalizedSectionKey = rawSectionKey || fallbackSectionKey;
              normalizedSectionKey = normalizeEpdmDaktrimSectionKey(jobSlug, normalizedSectionKey, enriched.material);

              // Filter invalid base section keys for this job (prevents polluted keys from old presets/data).
              if (!isComponentEntry && normalizedSectionKey && allowedSectionKeys.size > 0 && !allowedSectionKeys.has(normalizedSectionKey)) {
                return;
              }

              // Legacy component data can carry generic keys that collide with base wall sections.
              // Remap koof component keys to explicit koof_* keys for downstream calculators.
              if (isComponentEntry && normalizedSectionKey && /koof/i.test(String(enriched.context || ''))) {
                if (normalizedSectionKey === 'regelwerk') normalizedSectionKey = 'koof_regelwerk';
                if (normalizedSectionKey === 'constructieplaat') normalizedSectionKey = 'koof_constructieplaat';
                if (normalizedSectionKey === 'afwerkplaat') normalizedSectionKey = 'koof_afwerkplaat';
                if (normalizedSectionKey === 'isolatie') normalizedSectionKey = 'koof_isolatie';
              }

              const finalSectionKey = normalizedSectionKey || slotKey;
              enriched = normalizeGolfplaatRuleEntry(enriched, jobSlug, finalSectionKey);
              enriched = refreshStaticRuleForSection(enriched, jobSlug, finalSectionKey);
              enriched = sanitizeEntryRule(enriched);
              const normalizedSlotKey =
                jobSlug === 'epdm-dakbedekking'
                && (slotKey === 'daktrim' || slotKey === 'daktrim_hoeken')
                && typeof finalSectionKey === 'string'
                  ? finalSectionKey
                  : slotKey;

              const qty = enriched.quantity ?? enriched.aantal ?? null;
              normalizedMaterialenLijst[normalizedSlotKey] = {
                ...enriched,
                sectionKey: finalSectionKey,
                quantity: qty,
                aantal: qty,
                context: enriched.context || `Basis: ${jobTitle}`,
              };
            });

            // B2. Fallback: legacy selections (if materialen_lijst is empty)
            if (Object.keys(normalizedMaterialenLijst).length === 0 && enrichedJob.materialen?.selections) {
              Object.entries(enrichedJob.materialen.selections).forEach(([slotKey, sel]: [string, any]) => {
                const selectionId = getMaterialLookupId(sel);
                if (!selectionId) return;
                const full = materialMap.get(selectionId);
                if (full) {
                  normalizedMaterialenLijst[slotKey] = {
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
                    aantal: null,
                    context: `Basis: ${jobTitle}`,
                  };
                } else {
                  normalizedMaterialenLijst[slotKey] = {
                    material: sel,
                    quantity: null,
                    aantal: null,
                    context: `Basis: ${jobTitle}`,
                  };
                }
              });
            }

            // B3. Component materials are already in materialen_lijst with comp_ keys (picked up by B1)

            // B4. Overwrite materialen with the unified, labeled map
            enrichedJob.materialen = {
              ...enrichedJob.materialen,
              materialen_lijst: normalizedMaterialenLijst,
              // lijst: removed to prevent double-counting
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

    await postN8nMetTestFallback(payload, process.env.N8N_HEADER_SECRET);

    // Best effort: sync totaal direct to Firestore so quotes list stays up-to-date.
    await syncQuoteTotalsFromSupabase(db, quoteId, uid);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (db && quoteIdForError) {
      try {
        await db.collection('quotes').doc(quoteIdForError).update({
          status: 'fout',
          calculationError: String(e?.message || e).slice(0, 1000),
          calculationFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (statusErr) {
        console.error('Kon foutstatus niet opslaan op quote:', statusErr);
      }
    }
    return NextResponse.json({ ok: false, message: e?.message || String(e) }, { status: 500 });
  }
}
