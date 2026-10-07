import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { calculateQuoteTotals, normalizeDataJson } from '@/lib/quote-calculations';
import { resolveQuoteCalculationSettings } from '@/lib/quote-pdf-data';
import { quotePaymentTotalCents } from '@/lib/payment-request';

// Dezelfde berekening als het zichtbare eindtotaal; geen historische prijsafspraak
// of vertraagde Firestore-kopie wanneer er een calculatie beschikbaar is.
export async function currentPaymentTotalCents(id: string, quote: Record<string, unknown>, firestore: Firestore): Promise<number> {
  const query = () => supabaseAdmin.from('quotes_collection').select('data_json,status')
    .eq('gebruikerid', String(quote.userId)).eq('quoteid', id).order('created_at', { ascending: false }).limit(1);
  let result = await query().maybeSingle();
  if (result.error) throw new Error('Calculatie ophalen mislukt.');
  if (result.data && result.data.data_json == null && result.data.status !== 'completed') {
    result = await query().eq('status', 'completed').maybeSingle();
    if (result.error) throw new Error('Calculatie ophalen mislukt.');
  }
  if (!result.data?.data_json) return quotePaymentTotalCents(quote);
  const normalized = normalizeDataJson(result.data.data_json);
  const settings = resolveQuoteCalculationSettings(normalized, quote);
  const profile = (await firestore.collection('users').doc(String(quote.userId)).get()).data();
  const totals = calculateQuoteTotals(normalized, settings, Number(profile?.settings?.planningSettings?.defaultWorkdayHours) || 8);
  return Math.round(totals.totaalInclBtw * 100);
}
