import { matchDeliveryAddress, type DeliveryAddress } from '@/lib/purchase-delivery-address';
import { initFirebaseAdmin } from '@/firebase/admin';
import { loadGpsPurchaseContext } from '@/lib/gps-work-session-server';
import { applyGpsPurchaseLink, canGpsLinkPurchase, matchGpsPurchase, purchaseDate, type GpsPurchaseContext, type GpsPurchaseEvidence } from '@/lib/gps-purchase-link';
import { supabaseAdmin } from '@/lib/supabase-admin';

const generatedEvidence = new WeakMap<Record<string, unknown>, GpsPurchaseEvidence>();
export function purchaseGpsEvidence(input: Record<string, unknown>): GpsPurchaseEvidence | undefined {
  return generatedEvidence.get(input);
}
function isOwner(uid: string): boolean {
  return Boolean(process.env.CALVORA_USER_ID?.trim()) && uid === process.env.CALVORA_USER_ID!.trim();
}
/** Alleen het ingestelde Traccar-account mag als bewijs voor deze gebruiker dienen. */
export async function enrichPurchaseFromGps(uid: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (generatedEvidence.has(input)) return input;
  // GPS-bewijs wordt uitsluitend door de server gemaakt, nooit uit een import vertrouwd.
  input = { ...input, line_items: Array.isArray(input.line_items) ? input.line_items.map(line => {
    if (!line || typeof line !== 'object') return line;
    const { gps_link_evidence: ignored, ...rest } = line;
    return rest;
  }) : input.line_items };
  if (!isOwner(uid)) return input;
  const address = input.delivery_address as DeliveryAddress | undefined;
  const lines = Array.isArray(input.line_items) ? input.line_items : [];
  if (address && !input.offerte_reference && input.payment_type !== 'private' && input.payment_status !== 'private') {
    const { firestore } = initFirebaseAdmin();
    const snapshot = await firestore.collection('quotes').where('userId', '==', uid).get();
    const quote = matchDeliveryAddress(address, snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    if (quote && ((input.offerte_id && input.offerte_id !== quote.id) || lines.some(line => line?.offerte_id && line.offerte_id !== quote.id))) return input;
    if (!quote) return input; // Expliciet afleveradres heeft voorrang op GPS, ook bij twijfel.
    const evidence: GpsPurchaseEvidence = { method: 'delivery_address', quoteId: quote.id,
      workDate: typeof input.date === 'string' ? input.date : '', clientAddress: [address.street, address.house_number, address.postcode, address.city].filter(Boolean).join(' '),
      clientStartAt: '', clientEndAt: '', supplierName: String(input.supplier_name || ''), supplierAddress: '', supplierStartAt: '', supplierEndAt: '' };
    const enriched = applyGpsPurchaseLink(input, evidence);
    generatedEvidence.set(enriched, evidence);
    return enriched;
  }
  if (!canGpsLinkPurchase(input)) return input;
  try {
    const { firestore } = initFirebaseAdmin();
    const context = await loadGpsPurchaseContext(firestore, uid, purchaseDate(input)!);
    const evidence = matchGpsPurchase(input, context);
    if (!evidence) return input;
    const enriched = applyGpsPurchaseLink(input, evidence);
    generatedEvidence.set(enriched, evidence);
    return enriched;
  } catch {
    // Een GPS-storing mag geen normale bonimport verhinderen of een koppeling verzinnen.
    return input;
  }
}

/** Herhaalde uitvoering is veilig: alleen ongewijzigde, nog ongekoppelde materiaalbonnen. */
export async function linkStoredGpsPurchases(uid: string, from: string, to: string, dryRun = true) {
  const result: { dryRun: boolean; linked: number; matches: Array<{ costId: string; evidence: GpsPurchaseEvidence }>; unavailableDates: string[] } = {
    dryRun, linked: 0, matches: [], unavailableDates: [],
  };
  if (!isOwner(uid)) return result;
  const { firestore } = initFirebaseAdmin();
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from('project_costs').select('*')
      .eq('user_id', uid).is('offerte_id', null).eq('category', 'materiaal').eq('status', 'confirmed')
      .gte('date', from).lte('date', to).order('id').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  const contexts = new Map<string, GpsPurchaseContext | null>();
  for (const row of rows) {
    if (!canGpsLinkPurchase(row) || !row.updated_at) continue;
    const day = purchaseDate(row)!;
    if (!contexts.has(day)) {
      try { contexts.set(day, await loadGpsPurchaseContext(firestore, uid, day)); }
      catch { contexts.set(day, null); result.unavailableDates.push(day); }
    }
    const context = contexts.get(day);
    if (!context) continue;
    const evidence = matchGpsPurchase(row, context);
    if (!evidence) continue;
    // Gemengde historische rijen moeten via de bestaande categorie-splitsing worden verwerkt.
    if (row.line_items.some((line: Record<string, unknown>) => line.category !== 'materiaal')) continue;
    result.matches.push({ costId: row.id, evidence });
    if (dryRun) continue;
    const { data, error } = await supabaseAdmin.from('project_costs').update({
      offerte_id: evidence.quoteId,
      line_items: applyGpsPurchaseLink(row, evidence).line_items,
      updated_at: new Date().toISOString(),
    }).eq('user_id', uid).eq('id', row.id).is('offerte_id', null).eq('updated_at', row.updated_at).select('id');
    if (error) throw new Error(error.message);
    result.linked += data?.length || 0;
  }
  return result;
}
