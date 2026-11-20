import { shiftMonth, type Workspace } from './model';

export interface Account {
  key: string;
  iban: string;
  name: string;
  amount: number | null;
  at: string;
  role: 'zakelijk' | 'privé' | 'onbekend';
}
export interface Receivable {
  id: string;
  label: string;
  due: string;
  amount: number | null;
}
export interface Finances {
  accounts: Account[];
  invoices: Receivable[] | null;
  bills: number | null;
  history: Record<string, number | null>;
  period: string;
  errors: string[];
  asOf: string;
}
export const noFinance = (): Finances => ({
  accounts: [],
  invoices: null,
  bills: null,
  history: {},
  period: '',
  errors: [],
  asOf: '',
});
export const euro = (v: number | null | undefined) =>
  v == null
    ? 'Onbekend'
    : v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function bankTotal(f: Finances): number | null {
  return f.accounts.length && f.accounts.every((a) => a.amount !== null)
    ? round(f.accounts.reduce((sum, a) => sum + a.amount!, 0))
    : null;
}
export function receiptCheck(w: Workspace, f: Finances, invoice: Receivable): string {
  return JSON.stringify([
    f.accounts.map((a) => [a.key, a.at, a.amount]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    bankTotal(f) ?? w.manual.bank,
    w.manual.cash,
    invoice.amount ?? w.manual.invoiceAmounts[invoice.id] ?? null,
  ]);
}
export function cashInputs(w: Workspace, f: Finances) {
  const m = w.manual,
    s = w.scenario,
    missing: string[] = [];
  const need = (n: number | null, label: string) => {
    if (n === null) missing.push(label);
    return n ?? 0;
  };
  const bank = need(bankTotal(f) ?? m.bank, 'Banksaldo'),
    cash = need(m.cash, 'Contant saldo');
  const owed =
    need(m.vat, 'Openstaande btw') +
    need(m.tax, 'Openstaande inkomstenbelasting') +
    need(m.debt, 'Schulden') +
    need(m.bills ?? f.bills, 'Zakelijke verplichtingen');
  const months = s.work ? s.months : 0,
    active = months > 0 || (s.repeat && s.annual > 0);
  if (active) {
    need(s.operating, 'Bedrijfskosten per werkmaand');
    need(s.workLiving, 'Leefkosten per werkmaand');
    need(s.taxRate, 'IB-reservering');
    need(s.vatRate, 'Btw op nieuwe omzet');
  }
  if (!s.buy || months > 0) need(s.lease, 'Lease per maand');
  if (s.buy) need(s.ownership, 'Eigen bus per maand');
  let receipts: { date: string; amount: number }[] = [];
  if (s.collect) {
    if (f.invoices === null) {
      const amount = need(m.invoices, 'Verwachte ontvangsten');
      if (amount > 0 && !m.invoiceDate) missing.push('Ontvangstdatum');
      if (m.invoiceDate) receipts = [{ date: m.invoiceDate, amount }];
    } else
      for (const invoice of f.invoices) {
        const date = m.confirmed[invoice.id];
        if (date) {
          if (m.receiptChecks[invoice.id] !== receiptCheck(w, f, invoice))
            missing.push('Bevestig ontvangst opnieuw · ' + invoice.label);
          receipts.push({
            date,
            amount: need(
              invoice.amount ?? m.invoiceAmounts[invoice.id] ?? null,
              'Restbedrag ' + invoice.label,
            ),
          });
        }
      }
  }
  return { bank, cash, owed, months, missing, receipts };
}
export interface Point {
  month: number;
  date: string;
  cash: number;
  free: number;
  income: number;
  out: number;
  reserved: number;
}
export function project(w: Workspace, f: Finances) {
  const s = w.scenario,
    input = cashInputs(w, f),
    { bank, cash, owed, months, receipts } = input;
  const asOf = f.asOf
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(f.asOf))
    : '';
  const start = asOf > s.start ? asOf : s.start;
  if (input.missing.length) return null;
  const factor =
    s.mode === 'realistisch' ? 1 : s.mode === 'conservatief' ? 1 - s.lower / 100 : 1 + s.upper / 100;
  const sales = round(s.revenue * factor),
    business = s.operating ?? 0;
  const vat = round((sales * (s.vatRate ?? 0)) / 100),
    ib = round((Math.max(0, sales - business) * (s.taxRate ?? 0)) / 100);
  const vehicle = (s.buy ? s.ownership : s.lease) ?? 0;
  const acquisition =
    (s.buy ? s.price : 0) + (s.invest ? s.extras + s.items.reduce((a, b) => a + b.amount, 0) : 0);
  let balance = round(bank + cash),
    outstanding = owed,
    accrued = 0,
    afterWork = balance,
    afterPurchase = balance;
  let freeAtDeparture = 0,
    runway: number | null = null,
    threshold = '';
  const departure = shiftMonth(start, months);
  const points: Point[] = [],
    pending = new Map<number, number>();
  const burn = s.travel + vehicle;
  // Saldo is geld op rekening/in kas. Vrije ruimte houdt ook nog te betalen bedragen apart.
  for (let i = 0; i <= 240; i++) {
    const date = shiftMonth(start, i),
      prev = shiftMonth(start, Math.max(0, i - 1));
    const journeyMonth = i - months,
      annualMonth = (journeyMonth - 1) % 12;
    const working = i > 0 && (i <= months || (s.repeat && annualMonth >= 12 - s.annual && journeyMonth > 0));
    const inflation = s.inflation ? Math.pow(1 + s.rate / 100, Math.max(0, i - 1) / 12) : 1;
    let income = 0,
      out = 0;
    if (i > 0) {
      if (working) {
        pending.set(i + s.lag, (pending.get(i + s.lag) ?? 0) + sales + vat);
        accrued += ib + vat;
        out += business + (s.workLiving ?? 0) * inflation;
      } else out += s.travel * inflation;
      out += (i <= months ? (s.lease ?? 0) : vehicle) * inflation;
      income += pending.get(i) ?? 0;
      // Vereenvoudigde kasplanning: nieuwe belastingreserves eens per drie planmaanden afdragen.
      if (i % 3 === 0) {
        out += accrued;
        accrued = 0;
      }
      income += receipts
        .filter((r) => r.date <= date && (i === 1 || r.date > prev))
        .reduce((n, r) => n + r.amount, 0);
    }
    if (i === s.billMonth) {
      out += outstanding;
      outstanding = 0;
    }
    balance = round(balance + income - out);
    if (i === months) {
      afterWork = balance;
      balance = round(balance - acquisition);
      out += acquisition;
      afterPurchase = balance;
    }
    const free = round(balance - outstanding - accrued - s.buffer);
    if (i === months) freeAtDeparture = free;
    const previous = points.at(-1);
    if (runway === null && i >= months && free <= 0) {
      const fraction =
        i === months || !previous ? 0 : Math.min(1, Math.max(0, previous.free / (previous.free - free || 1)));
      runway = i === months ? 0 : i - months - 1 + fraction;
      threshold =
        i === months
          ? date
          : new Date(Date.parse(prev) + (Date.parse(date) - Date.parse(prev)) * fraction)
              .toISOString()
              .slice(0, 10);
    }
    points.push({
      month: i,
      date,
      cash: balance,
      free,
      income: round(income),
      out: round(out),
      reserved: round(outstanding + accrued),
    });
  }
  const simple = !s.repeat && !s.inflation && !s.collect && (!months || !s.lag);
  if (simple && burn > 0) {
    runway = Math.max(0, freeAtDeparture / burn);
    const whole = Math.floor(runway);
    if (whole <= 1200) {
      const a = shiftMonth(departure, whole),
        b = shiftMonth(departure, whole + 1);
      threshold = new Date(Date.parse(a) + (Date.parse(b) - Date.parse(a)) * (runway - whole))
        .toISOString()
        .slice(0, 10);
    }
  }
  const annualGain = sales - business - ib - (s.workLiving ?? 0) + s.travel;
  const annualNeeded = [s.operating, s.taxRate, s.workLiving].some((x) => x === null)
    ? null
    : burn === 0
      ? 0
      : annualGain > 0
        ? (12 * burn) / annualGain
        : null;
  return {
    points,
    afterWork,
    afterPurchase,
    freeAtDeparture,
    runway,
    threshold,
    departure,
    annualNeeded,
    burn,
    simple,
  };
}
