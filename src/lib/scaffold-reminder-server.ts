import { createHash, randomUUID } from 'crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toStructuredWorkDescription } from '@/lib/quote-calculations';
import { scaffoldReminders, type ScaffoldReminder } from '@/lib/scaffold-reminder';

function date(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

export function scaffoldDeliveryId(quoteId: string, startDay: string): string {
  return createHash('sha256').update(JSON.stringify([quoteId, startDay])).digest('hex');
}

export async function loadScaffoldReminders(uid: string, quoteId?: string): Promise<ScaffoldReminder[]> {
  const { firestore } = initFirebaseAdmin();
  const [quotes, planning] = await Promise.all([
    quoteId ? firestore.collection('quotes').doc(quoteId).get().then(doc => ({ docs: doc.exists ? [doc] : [] }))
      : firestore.collection('quotes').where('userId', '==', uid).get(),
    firestore.collection('planning_entries').where('userId', '==', uid).get(),
  ]);
  const entries = planning.docs.map(doc => {
    const data = doc.data()!;
    return { id: doc.id, quoteId: data.quoteId, planningType: data.planningType, status: data.status, startDate: date(data.startDate) };
  });
  // Eerst op planning filteren; haal alleen calculaties op die nu een melding kunnen opleveren.
  const candidates = quotes.docs.filter(doc => doc.data()?.userId === uid).map(doc => {
    const data = doc.data()!;
    const info = data.klantinformatie || {};
    return { id: doc.id, enabled: true, archived: data.archived === true, status: String(data.status || ''),
      client: String(info.bedrijfsnaam || [info.voornaam, info.achternaam].filter(Boolean).join(' ')),
      title: String(data.titel || data.werkomschrijving || ''), number: String(data.offerteNummer || '') };
  });
  const due = scaffoldReminders(candidates, entries);
  const result: ScaffoldReminder[] = [];
  for (const reminder of due) {
    // Dezelfde nieuwste calculatie/fallback als de offerte-editor. Geen oude true-waarde terughalen bij expliciet false.
    const query = () => supabaseAdmin.from('quotes_collection').select('status,data_json')
      .eq('gebruikerid', uid).eq('quoteid', reminder.quoteId).order('created_at', { ascending: false }).limit(1);
    const latest = await query().maybeSingle();
    let data = latest.data;
    const error = latest.error;
    if (error) throw error;
    if (data && data.status !== 'completed' && data.data_json == null) {
      const fallback = await query().eq('status', 'completed').maybeSingle();
      if (fallback.error) throw fallback.error;
      data = fallback.data;
    }
    const root = Array.isArray(data?.data_json) ? data.data_json[0] : data?.data_json;
    if (root && toStructuredWorkDescription(root).steigerInbegrepen === true) result.push(reminder);
  }
  return result;
}

export async function claimScaffoldReminder(uid: string, quoteId: string, startDay: string): Promise<Record<string, unknown>> {
  // Herlees schakelaar en planning vlak voor verzending; een oude n8n-uitvoering mag geen oude melding verzenden.
  const current = (await loadScaffoldReminders(uid, quoteId)).find(item => item.startDay === startDay);
  if (!current) return { claimed: false };
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('users').doc(uid).collection('scaffoldReminders').doc(scaffoldDeliveryId(quoteId, startDay));
  return firestore.runTransaction(async transaction => {
    const previous = await transaction.get(ref);
    if (previous.exists) return { claimed: false, state: previous.data()?.state };
    const token = randomUUID();
    transaction.create(ref, { ...current, token, state: 'sending', reservedAt: new Date().toISOString() });
    return { claimed: true, ...current, token };
  });
}

export async function acknowledgeScaffoldReminder(uid: string, quoteId: string, startDay: string, token: string, messageId: number): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('users').doc(uid).collection('scaffoldReminders').doc(scaffoldDeliveryId(quoteId, startDay));
  await firestore.runTransaction(async transaction => {
    const delivery = await transaction.get(ref);
    if (!delivery.exists || delivery.data()?.token !== token) throw new Error('Ongeldige reservering');
    if (delivery.data()?.state === 'sent') return;
    transaction.update(ref, { state: 'sent', messageId, sentAt: new Date().toISOString() });
  });
}
