import 'server-only';
import { createHash } from 'node:crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { POST as getActuals } from '@/app/api/financieen/actuals/route';
import { deriveBankUserId } from '@/lib/bank-user-id';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { GET as getCosts } from '@/app/api/kosten/list/route';
import { GET as getHours } from '@/app/api/uren/totals/route';
import { summarizeBankCostRows } from '@/lib/bank-cost-summary';
import { isPrivateCashPurchase } from '@/lib/kosten-cash';
import type { ProjectCostRow } from '@/lib/project-costs';
import { KOSTEN_REPORT_START, reportOverlapFraction } from '@/lib/kosten-report-period';
import { today, type Workspace } from './model';
import { noFinance, round, type Account, type Finances, type Receivable } from './projection';

async function accounts(uid: string): Promise<Account[]> {
  const c = await supabaseAdmin
    .from('bank_connections')
    .select('id,last_synced_at')
    .eq('provider', 'enablebanking')
    .eq('user_id', deriveBankUserId(uid))
    .eq('status', 'connected')
    .order('last_synced_at', { ascending: false, nullsFirst: false });
  if (c.error) throw c.error;
  if (!c.data.length) return [];
  const a = await supabaseAdmin
    .from('bank_accounts')
    .select('id,iban,name,product,owner_name,currency,connection_id')
    .in(
      'connection_id',
      c.data.map((x) => x.id),
    )
    .eq('status', 'active');
  if (a.error) throw a.error;
  const unique = new Map<string, (typeof a.data)[number]>();
  for (const connection of c.data)
    for (const row of a.data.filter((x) => x.connection_id === connection.id)) {
      const iban = String(row.iban ?? '')
        .replace(/\s/g, '')
        .toUpperCase();
      if (/^NL\d{2}KNAB\d{10}$/.test(iban) && !unique.has(iban)) unique.set(iban, row);
    }
  return Promise.all(
    [...unique].map(async ([iban, row]) => {
      const result = await supabaseAdmin
        .from('bank_balances')
        .select('amount,currency,reference_date,created_at,balance_type')
        .eq('bank_account_id', String(row.id))
        .order('created_at', { ascending: false })
        .limit(30);
      if (result.error) throw result.error;
      const b = ['ITAV', 'CLAV', 'ITBD', 'CLBD']
        .map((t) => result.data.find((x) => x.balance_type === t))
        .find(Boolean);
      const business = /zakelijk|business|timmerwerken/i.test(
        [row.product, row.owner_name, row.name].join(' '),
      );
      const personal = /priv[ée]|personal/i.test([row.product, row.name].join(' '));
      return {
        key: createHash('sha256').update(iban).digest('hex').slice(0, 24),
        iban,
        name: String(row.name || 'Knab'),
        at: String(b?.reference_date || b?.created_at || ''),
        role: business ? 'zakelijk' : personal ? 'privé' : 'onbekend',
        amount:
          b?.amount != null && b.amount !== '' && b.currency === 'EUR' && Number.isFinite(Number(b.amount))
            ? Number(b.amount)
            : null,
      };
    }),
  );
}
function dateOnly(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(value.toDate());
  return '';
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
async function invoices(uid: string) {
  const snap = await initFirebaseAdmin()
    .firestore.collection('invoices')
    .where('userId', '==', uid)
    .select('status', 'issueDate', 'dueDate', 'totalsSnapshot', 'paymentSummary', 'invoiceNumberLabel')
    .get();
  const open: Receivable[] = [];
  let revenue: number | null = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!['verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(d.status)) continue;
    const issue = dateOnly(d.issueDate);
    if (!issue) revenue = null;
    if (issue >= KOSTEN_REPORT_START && issue <= today() && revenue !== null) {
      const net = num(d.totalsSnapshot?.totaalExclBtw);
      revenue = net === null ? null : round(revenue + net);
    }
    if (d.status === 'betaald') continue;
    const gross = num(d.totalsSnapshot?.totaalInclBtw),
      paid = num(d.paymentSummary?.paidAmount);
    const balance =
      num(d.paymentSummary?.openAmount) ??
      (gross !== null && (paid !== null || d.status === 'verzonden') ? round(gross - (paid ?? 0)) : null);
    if (balance === null || balance > 0)
      open.push({
        id: doc.id,
        label: String(d.invoiceNumberLabel || 'Factuur'),
        due: dateOnly(d.dueDate),
        amount: balance,
      });
  }
  return { open, revenue };
}
export async function readFinances(
  req: Request,
  uid: string,
  w: Workspace,
  preferred = '',
): Promise<Finances> {
  const f = noFinance();
  f.asOf = new Date().toISOString();
  f.period = KOSTEN_REPORT_START + ' – ' + today();
  const headers = new Headers({ Authorization: req.headers.get('authorization') || '' });
  const sections = async (name: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch {
      f.errors.push(name);
    }
  };
  await Promise.all([
    sections('Knab-saldi of afschriften', async () => {
      f.accounts = await accounts(uid);
      const business = f.accounts.filter((a) => (w.manual.roles[a.key] ?? a.role) === 'zakelijk');
      const chosen = business.length === 1 ? business[0].iban : preferred;
      const scoped = new Headers(headers);
      if (chosen) scoped.set('X-Knab-Kosten-Iban', chosen);
      const r = await getCosts(new Request(new URL('/api/kosten/list', req.url), { headers: scoped }));
      if (!r.ok) throw Error();
      const data = await r.json();
      type Row = ProjectCostRow & { is_internal_transfer?: boolean; vat_known?: boolean };
      const rows: Row[] = data.data.filter(
        (x: Row) => x.date >= KOSTEN_REPORT_START && x.date <= today() && !x.is_internal_transfer,
      );
      const summary = summarizeBankCostRows(
        rows,
        data.privateCredits.filter((x: Row) => x.date >= KOSTEN_REPORT_START && x.date <= today()),
      );
      f.history.withdrawals = summary.privateSummary.withdrawalTotal;
      f.history.bankDeposits = summary.privateSummary.depositTotal;
      f.history.privatePurchases = round(
        rows.filter(isPrivateCashPurchase).reduce((n, r) => n + r.amount_incl_btw, 0),
      );
      f.history.investments = summary.totals.gereedschap;
      f.history.costs = round(
        summary.totals.alle - summary.privateSummary.withdrawalTotal - summary.totals.profit,
      );
      const operating = rows.filter((r) => !['profit', 'eigen_verbruik', 'gereedschap'].includes(r.category));
      if (operating.every((r) => r.vat_known === true && !r.category_allocations?.length))
        f.history.netCosts = round(operating.reduce((n, r) => n + r.amount_excl_btw, 0));
      const matched = new Set(
        (data.data as Array<{ source_cost_ids?: string[] }>).flatMap((r) => r.source_cost_ids ?? []),
      );
      const outstanding: Row[] = data.sourceCosts.filter(
        (r: Row) => r.payment_status === 'openstaand' && !r.paid_bank_transaction_id && !matched.has(r.id),
      );
      f.bills = outstanding.length ? round(outstanding.reduce((n, r) => n + r.amount_incl_btw, 0)) : null;
    }),
    sections('Ontvangsten lopende maand', async () => {
      const r = await getActuals(
        new Request(new URL('/api/financieen/actuals', req.url), {
          method: 'POST',
          headers,
          body: JSON.stringify({ timeline: 'month' }),
        }),
      );
      if (!r.ok) throw Error();
      const { data } = await r.json();
      if (data.firstTransactionDate) f.history.monthReceipts = data.operatingIncomingTotal;
    }),
    sections('Facturen', async () => {
      const r = await invoices(uid);
      f.invoices = r.open;
      f.history.revenue = r.revenue;
    }),
    sections('Contante inleg', async () => {
      const rows = await initFirebaseAdmin()
        .firestore.collection('users')
        .doc(uid)
        .collection('cash_deposits')
        .select('date', 'amountCents')
        .get();
      f.history.cashDeposits = round(
        rows.docs
          .filter((x) => x.get('date') >= KOSTEN_REPORT_START && x.get('date') <= today())
          .reduce((n, x) => n + x.get('amountCents'), 0) / 100,
      );
    }),
    sections('Urenregistratie', async () => {
      const r = await getHours(new Request(new URL('/api/uren/totals', req.url), { headers }));
      if (!r.ok) throw Error();
      const h = await r.json(),
        t = h.all;
      f.history.hours = round(
        (t.workMinutes +
          (t.supplierMinutes ?? 0) +
          (t.driveMinutes ?? 0) +
          t.unsplitMinutes +
          h.adjustments.reduce(
            (n: number, x: { minutes: number; start_date: string; end_date: string }) =>
              n + x.minutes * reportOverlapFraction(x.start_date, x.end_date, KOSTEN_REPORT_START, today()),
            0,
          )) /
          60,
      );
    }),
  ]);
  if (f.history.revenue && f.history.netCosts != null)
    f.history.margin = round((100 * (f.history.revenue - f.history.netCosts)) / f.history.revenue);
  return f;
}
