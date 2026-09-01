import { sessionTimeEntryId } from '@/lib/gps-work-session-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface ConfirmGpsWorkSessionOptions {
  includeOutbound: boolean;
  includeReturn: boolean;
  includeSupplier: boolean;
  automatic?: boolean;
}

export function gpsCandidateIds(session: Record<string, unknown>): string[] {
  return (Array.isArray(session.candidate_quotes) ? session.candidate_quotes : [])
    .map((candidate) => candidate && typeof candidate === 'object' ? String((candidate as Record<string, unknown>).id || '') : '')
    .filter(Boolean);
}

export async function confirmGpsWorkSession(
  uid: string,
  session: Record<string, unknown>,
  quoteId: string,
  options: ConfirmGpsWorkSessionOptions,
) {
  const onsite = Number(session.onsite_minutes) || 0;
  const outbound = options.includeOutbound ? Number(session.outbound_travel_minutes) || 0 : 0;
  const returnTravel = options.includeReturn ? Number(session.return_travel_minutes) || 0 : 0;
  const clientTransfer = Number(session.client_transfer_minutes) || 0;
  const supplierTravel = options.includeSupplier ? Number(session.supplier_travel_minutes) || 0 : 0;
  const supplierStop = options.includeSupplier ? Number(session.supplier_stop_minutes) || 0 : 0;
  const unallocated = Number(session.unallocated_minutes) || 0;
  const includedMinutes = onsite + outbound + returnTravel + clientTransfer + supplierTravel + supplierStop;
  if (includedMinutes <= 0 || includedMinutes > 24 * 60) throw new Error('De berekende werktijd is ongeldig.');

  const sessionId = String(session.id || '');
  const timeEntryId = sessionTimeEntryId(uid, sessionId);
  const supplierVisits = Array.isArray(session.supplier_visits) ? session.supplier_visits : [];
  const supplierNames = supplierVisits
    .map((visit) => visit && typeof visit === 'object' ? String((visit as Record<string, unknown>).name || '') : '')
    .filter(Boolean);
  const note = supplierNames.length > 0
    ? `GPS-werkdag · materiaal via ${Array.from(new Set(supplierNames)).join(', ')}`
    : options.automatic ? 'GPS-werkdag automatisch gekoppeld' : 'GPS-werkdag gecontroleerd';

  const quoteIds = gpsCandidateIds(session);
  if (quoteIds.length > 0) {
    const { error: oldAutoError } = await supabaseAdmin
      .from('time_entries')
      .delete()
      .eq('user_id', uid)
      .eq('work_date', String(session.work_date))
      .eq('source', 'gps_tracking_auto')
      .in('quote_id', quoteIds);
    if (oldAutoError) throw new Error(oldAutoError.message);
  }

  const timeEntry = {
    id: timeEntryId,
    user_id: uid,
    quote_id: quoteId,
    work_date: String(session.work_date),
    worked_hours: Number((includedMinutes / 60).toFixed(2)),
    worked_days: Number((includedMinutes / 480).toFixed(2)),
    source: 'gps_tracking_confirm',
    note,
    start_time: new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(String(session.start_at))),
    end_time: new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(String(session.end_at))),
    exact_minutes: includedMinutes,
    rounding_rule: options.automatic
      ? 'GPS-werkdag automatisch: locatie, tussen-klantenreis en leveranciersbezoek afzonderlijk gemeten'
      : 'GPS-werkdag: locatie, tussen-klantenreis en leveranciersbezoek afzonderlijk gemeten',
    onsite_minutes: onsite,
    outbound_travel_minutes: outbound,
    return_travel_minutes: returnTravel,
    client_transfer_minutes: clientTransfer,
    supplier_travel_minutes: supplierTravel,
    supplier_stop_minutes: supplierStop,
    unallocated_minutes: unallocated,
    supplier_visits: supplierVisits,
    gps_work_session_id: sessionId,
    updated_at: new Date().toISOString(),
  };
  const { error: entryError } = await supabaseAdmin.from('time_entries').upsert(timeEntry, { onConflict: 'id' });
  if (entryError) throw new Error(entryError.message);
  const { error: updateError } = await supabaseAdmin.from('gps_work_sessions')
    .update({
      quote_id: quoteId,
      status: 'confirmed',
      included_minutes: includedMinutes,
      time_entry_id: timeEntryId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', uid);
  if (updateError) throw new Error(updateError.message);
  return timeEntry;
}

export async function autoConfirmUnambiguousGpsSessions(uid: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('gps_work_sessions')
    .select('*')
    .eq('user_id', uid)
    .eq('status', 'pending')
    .order('work_date', { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  let confirmed = 0;
  for (const session of data || []) {
    const quoteIds = gpsCandidateIds(session as Record<string, unknown>);
    if (quoteIds.length !== 1) continue;
    await confirmGpsWorkSession(uid, session as Record<string, unknown>, quoteIds[0], {
      includeOutbound: true,
      includeReturn: true,
      includeSupplier: true,
      automatic: true,
    });
    confirmed += 1;
  }
  return confirmed;
}
