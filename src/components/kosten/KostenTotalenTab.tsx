'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { summarizeBankCostRows, type BankCostFilter } from '@/lib/bank-cost-summary';
import { PROJECT_COST_CATEGORIES, type ProjectCostCategory, type ProjectCostRow } from '@/lib/project-costs';
import { summarizeTimeEntries, type TimeTotals } from '@/lib/time-entry-totals';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { ReisbudgetBox } from './ReisbudgetBox';
import { KostenStartDate } from './KostenStartDate';
import { isReportDate, reportPeriodMonths, reportOverlapFraction, reportMonths, reportEarnings, reportElapsed } from '@/lib/kosten-report-period';
import { KostenAfstandRow } from './KostenAfstandRow';
import { Checkbox } from '@/components/ui/checkbox';
import type { BankAccountView } from '@/lib/bank-overzicht';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calculateBankCostScenario, parseScenarioAmount, remainingFixedCosts } from '@/lib/bank-cost-scenario';

interface Props {
  startDate: string;
  onStartDateChange: (value: string) => void;
  costs: ProjectCostRow[];
  privateCredits: ProjectCostRow[];
  categories: Array<{ value: BankCostFilter; label: string }>;
  loading: boolean;
  error: string | null;
}
interface HoursResponse { adjustments: Array<{ start_date: string; end_date: string; minutes: number; worked_days: number | null }>; gpsDates: string[]; dates: string[]; all: TimeTotals; months: Record<string, TimeTotals> }
const euro = (value: number): string => value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const hours = (minutes: number | null): string => minutes === null ? 'n.b.' : `${Math.floor(Math.round(minutes) / 60)} u ${Math.round(minutes) % 60} min`;

export function KostenTotalenTab({ costs, privateCredits, categories, loading, error, startDate, onStartDateChange }: Props) {
  const { user } = useUser();
  const [month, setMonth] = useState('all');
  const [reductions, setReductions] = useState<Partial<Record<ProjectCostCategory, string>>>({});
  const [cash, setCash] = useState('');
  const [potentialHoursInput, setPotentialHoursInput] = useState('');
  const [extraMonthlyFixed, setExtraMonthlyFixed] = useState('');
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSyncedAt, setBankSyncedAt] = useState<string | null>(null);
  const storageKey = user?.uid ? `kosten-totalen-scenario-v1:${user.uid}` : null;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setRestoredKey(null);
    setMonth('all');
    setReductions({});
    setCash('');
    setExtraMonthlyFixed('');
    setPotentialHoursInput('');
    setStorageError(false);
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        if (typeof saved.potentialHoursInput === 'string') setPotentialHoursInput(saved.potentialHoursInput);
        if (typeof saved.extraMonthlyFixed === 'string') setExtraMonthlyFixed(saved.extraMonthlyFixed);
        if (typeof saved.cash === 'string') setCash(saved.cash);
        if (typeof saved.month === 'string' && /^(all|\d{4}-(0[1-9]|1[0-2]))$/.test(saved.month) && (saved.month === 'all' || saved.month >= startDate.slice(0, 7))) setMonth(saved.month);
        if (saved.reductions && typeof saved.reductions === 'object') {
          setReductions(Object.fromEntries(PROJECT_COST_CATEGORIES
            .filter((category) => typeof saved.reductions[category] === 'string')
            .map((category) => [category, saved.reductions[category]])));
        }
      }
    } catch {
      setStorageError(true);
    }
    setRestoredKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    // Eerst herstellen: standaardwaarden mogen een opgeslagen scenario niet overschrijven.
    if (!storageKey || restoredKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ month, reductions, cash, extraMonthlyFixed, potentialHoursInput }));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [storageKey, restoredKey, month, reductions, cash, extraMonthlyFixed, potentialHoursInput]);

  const loadBankBalance = useCallback(async (sync = false, signal?: AbortSignal) => {
    if (!user) return;
    setBankLoading(true);
    setBankError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (sync) {
        const response = await fetch('/api/bank/sync-enablebanking', { method: 'POST', headers, cache: 'no-store', signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok || (payload.status && payload.status !== 'connected')) throw new Error('Knab bijwerken is niet gelukt.');
      }
      const response = await fetch('/api/bank/overview?provider=enablebanking&profile=personal', { headers, cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.data?.accounts)) throw new Error('Knab-saldo kon niet worden geladen.');
      const accounts = payload.data.accounts as BankAccountView[];
      if (!accounts.length || accounts.some((account) => account.currency !== 'EUR' || typeof account.latestBalanceAmount !== 'number' || !Number.isFinite(account.latestBalanceAmount))) throw new Error('Geen volledig Knab-saldo beschikbaar.');
      if (signal?.aborted) return;
      setBankBalance(accounts.reduce((sum, account) => sum + Math.round(account.latestBalanceAmount! * 100), 0) / 100);
      setBankSyncedAt(payload.data.connection?.lastSyncedAt || null);
    } catch (error) {
      if (signal?.aborted) return;
      setBankBalance(null);
      setBankSyncedAt(null);
      setBankError(error instanceof Error ? error.message : 'Knab-saldo kon niet worden geladen.');
    } finally {
      if (!signal?.aborted) setBankLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    setBankBalance(null);
    setBankSyncedAt(null);
    void loadBankBalance(false, controller.signal);
    return () => controller.abort();
  }, [loadBankBalance]);

  const [time, setTime] = useState<HoursResponse | null>(null);
  const [timeError, setTimeError] = useState(false);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setTime(null);
    setTimeError(false);
    let inFlight = false;
    const load = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/uren/totals?startDate=${encodeURIComponent(startDate)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error();
        if (!cancelled) { setTime(payload); setTimeError(false); }
      } catch { if (!cancelled) setTimeError(true); }
      finally { inFlight = false; }
    };
    void load();
    const interval = window.setInterval(() => void load(), 300000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [user, startDate]);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
  const months = reportMonths(today, startDate).reverse();
  const elapsed = reportElapsed(today, startDate);
  useEffect(() => {
    if (month !== 'all' && (month < startDate.slice(0, 7) || month > today.slice(0, 7))) setMonth('all');
  }, [startDate, today, month]);
  const periodStart = month === 'all' ? startDate : [startDate, `${month}-01`].sort().at(-1)!;
  const monthEnd = month === 'all' ? today : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const periodEnd = [today, monthEnd].sort()[0];
  const monthCount = reportPeriodMonths(periodStart, periodEnd);
  const monthLabel = monthCount.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
  const bankSummary = useMemo(() => summarizeBankCostRows(
    costs.filter((row) => isReportDate(row.date, month, today, startDate)),
    privateCredits.filter((row) => isReportDate(row.date, month, today, startDate)),
  ), [costs, privateCredits, month, today, startDate]);
  const summary = bankSummary;
  const requestedReductions = Object.fromEntries(Object.entries(reductions).map(([category, raw]) => [category,
    raw === 'all' ? Math.max(0, summary.totals[category as ProjectCostCategory]) : parseScenarioAmount(raw || '') ?? 0,
  ]));
  const extraMonthlyAmount = extraMonthlyFixed.trim() ? parseScenarioAmount(extraMonthlyFixed) : 0;
  const invalidExtraFixed = extraMonthlyAmount === null || extraMonthlyAmount < 0;
  const extraFixedCosts = invalidExtraFixed ? 0 : Math.round(extraMonthlyAmount * 100) * monthCount / 100;
  const invalidReduction = Object.entries(reductions).some(([category, raw]) => {
    if (!raw?.trim() || raw === 'all') return false;
    const amount = parseScenarioAmount(raw);
    return amount === null || amount < 0 || amount > Math.max(0, summary.totals[category as ProjectCostCategory]);
  });
  const invalidScenario = invalidReduction || invalidExtraFixed;
  const cashAmount = cash.trim() ? parseScenarioAmount(cash) : 0;
  const invalidCash = cashAmount === null || cashAmount < 0;
  const availableBalance = bankLoading || bankBalance === null || invalidCash ? null
    : (Math.round(bankBalance * 100) + Math.round(cashAmount! * 100)) / 100;
  const scenario = calculateBankCostScenario(summary.totals, requestedReductions, availableBalance, extraFixedCosts);
  const duration = time ? (month === 'all' ? time.all : time.months[month] || summarizeTimeEntries([])) : null;
  const workedDates = time ? time.dates.filter((date) => isReportDate(date, month, today, startDate)) : null;
  const adjustments = time?.adjustments?.filter((row) => row.start_date <= periodEnd && row.end_date >= periodStart) ?? [];
  const partialAdjustment = adjustments.some((row) => row.start_date < periodStart || row.end_date > periodEnd);
  const workedDayCount = !workedDates || adjustments.some((row) => row.worked_days === null) ? null
    : workedDates.filter((date) => !adjustments.some((row) => date >= row.start_date && date <= row.end_date)).length
      + adjustments.reduce((sum, row) => sum + (row.worked_days ?? 0) * reportOverlapFraction(row.start_date, row.end_date, periodStart, periodEnd), 0);
  const addedMinutes = adjustments.reduce((sum, row) => sum + row.minutes * reportOverlapFraction(row.start_date, row.end_date, periodStart, periodEnd), 0);
  const totalMinutes = duration ? duration.workMinutes + (duration.supplierMinutes ?? 0) + (duration.driveMinutes ?? 0) + duration.unsplitMinutes + addedMinutes : null;
  const fixedCosts = remainingFixedCosts(summary.totals, requestedReductions) + extraFixedCosts;
  const potentialHoursValue = potentialHoursInput.trim() ? parseScenarioAmount(potentialHoursInput) : undefined;
  const invalidPotentialHours = potentialHoursValue === null || (potentialHoursValue !== undefined && potentialHoursValue < 0);
  const earnings = reportEarnings(loading || error || invalidScenario ? null : scenario.balanceWithoutCosts, timeError ? null : totalMinutes, monthCount, fixedCosts, invalidPotentialHours ? null : potentialHoursValue);
  const money = (value: number | null) => value === null ? 'n.b.' : euro(value);
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  if (!storageKey || restoredKey !== storageKey) return <p className="text-sm text-muted-foreground">Totalen laden…</p>;
  return <div className="space-y-4">
    {storageError ? <p role="alert" className="text-sm text-destructive">Je keuzes konden niet op dit apparaat worden opgeslagen.</p> : null}
    <div className="flex flex-wrap items-center gap-3">
      <div className="space-y-1"><KostenStartDate value={startDate} onChange={onStartDateChange} /><span className="block text-xs text-muted-foreground">{elapsed.days} dagen · {elapsed.months} maanden en {elapsed.remainingDays} dagen verstreken</span></div>
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-9 w-48" aria-label="Periode totalen"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle maanden ({months.length})</SelectItem>{months.map((value) => <SelectItem key={value} value={value}>{new Date(`${value}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</SelectItem>)}</SelectContent>
      </Select>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{bankSyncedAt ? `Bijgewerkt: ${new Date(bankSyncedAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
            <Button type="button" variant="ghost" size="sm" disabled={bankLoading} onClick={() => void loadBankBalance(true)}>Knab bijwerken</Button>
          </div>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 lg:row-span-4">
        <h2 className="mb-2 text-sm font-semibold">Kosten</h2>
        {loading ? <p className="text-sm text-muted-foreground">Kosten laden…</p> : error ? <p role="alert" className="text-sm text-destructive">Kosten konden niet worden geladen.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-muted-foreground"><tr><th className="px-2 py-2 text-center text-xs font-normal">Hele bedrag</th><th className="px-3 py-2 text-left font-normal">Categorie</th><th className={`${cell} font-normal`}>Bedrag</th><th className={`${cell} font-normal`}>Aantal</th><th className={`${cell} font-normal`}>Minder (€)</th></tr></thead>
            <tbody>{categories.map(({ value, label }) => <tr key={value} className={`border-b border-border/50 ${value === 'alle' ? 'font-semibold' : reductions[value] === 'all' ? 'text-red-400' : ''}`}><td className="px-2 py-2 text-center">{value !== 'alle' ? <Checkbox aria-label={`${label} helemaal weglaten`} disabled={summary.totals[value] <= 0} checked={reductions[value] === 'all'} onCheckedChange={(checked) => setReductions((current) => ({ ...current, [value]: checked === true ? 'all' : '' }))} /> : null}</td><td className="px-3 py-2">{value === 'alle' ? 'Totaal uitgaven' : value === 'eigen_verbruik' ? 'Privé-opnames (netto)' : label}</td><td className={cell}>{euro(summary.totals[value])}</td><td className={cell}>{summary.counts[value]}</td><td className="px-2 py-2">{value !== 'alle' ? <Input type="text" inputMode="decimal" aria-label={`${label} minder in euro`} placeholder="0,00" value={reductions[value] === 'all' ? Math.max(0, summary.totals[value]).toFixed(2).replace('.', ',') : reductions[value] || ''} onChange={(event) => setReductions((current) => ({ ...current, [value]: event.target.value }))} className={`h-8 w-28 text-right tabular-nums ${reductions[value] === 'all' ? 'text-red-400' : ''}`} /> : null}</td></tr>)}</tbody>
          </table></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <label htmlFor="extra-monthly-fixed" className="text-sm">Extra vaste lasten per maand</label>
            <div className="flex items-center gap-2"><Input id="extra-monthly-fixed" type="text" inputMode="decimal" placeholder="0,00" value={extraMonthlyFixed} onChange={(event) => setExtraMonthlyFixed(event.target.value)} aria-invalid={invalidExtraFixed} aria-describedby={invalidExtraFixed ? "extra-fixed-error" : undefined} className="h-8 w-28 text-right tabular-nums" /></div>
          </div>
          {invalidExtraFixed ? <p id="extra-fixed-error" role="alert" className="mt-1 text-xs text-destructive">Vul een maandbedrag van € 0,00 of hoger in.</p> : null}
        </>}
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Met lagere uitgaven</h2>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3">
            <span className="text-sm">Banksaldo Knab</span>
            <span className="text-sm tabular-nums">{bankLoading ? 'Laden…' : bankBalance === null ? 'n.b.' : euro(bankBalance)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3">
            <label htmlFor="kosten-cash" className="text-sm">Cash</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">€</span>
              <Input id="kosten-cash" type="text" inputMode="decimal" placeholder="0,00" value={cash} onChange={(event) => setCash(event.target.value)} aria-invalid={invalidCash} aria-describedby={invalidCash ? 'kosten-cash-error' : undefined} className="h-8 w-28 text-right tabular-nums" />
            </div>
          </div>
          {invalidCash ? <p id="kosten-cash-error" role="alert" className="text-xs text-destructive">Vul een cashbedrag van € 0,00 of hoger in.</p> : null}
          {bankError ? <p role="alert" className="text-xs text-destructive">{bankError}</p> : null}
          <table className="w-full text-sm"><tbody>
            <tr className="border-b border-border/50"><td className="px-3 py-2">Extra overgehouden</td><td className={cell}>{loading ? 'Laden…' : error || invalidScenario ? 'n.b.' : euro(scenario.saved)}</td></tr>
            <tr className="border-b border-border/50 font-semibold"><td className="px-3 py-2">Saldo met besparing</td><td className={`${cell} text-emerald-400`}>{loading ? 'Laden…' : error || invalidScenario || scenario.balanceWithoutCosts === null ? 'n.b.' : euro(scenario.balanceWithoutCosts)}</td></tr>
            <tr className="border-b border-border/50"><td className="px-3 py-2">Saldo met besparing excl. 21% btw</td><td className={cell}>{loading ? 'Laden…' : error || invalidScenario || scenario.balanceWithoutCosts === null ? 'n.b.' : euro(scenario.balanceWithoutCosts / 1.21)}</td></tr>
          </tbody></table>
          <table className="w-full text-sm"><tbody>
            {[
              ['Per geregistreerd uur', money(earnings.hourly)],
              [`Gemiddeld per maand (${monthLabel} maanden)`, money(earnings.monthly)],
              ['Gemiddeld per maand excl. 21% btw', money(earnings.monthly === null ? null : earnings.monthly / 1.21)],
            ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className={cell}>{value}</td></tr>)}
          </tbody></table>
          {invalidReduction ? <p role="alert" className="text-xs text-destructive">Vul per categorie een bedrag in tussen € 0,00 en het categorietotaal. Kies bij een netto tegoed € 0,00.</p> : null}
        </div>
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Potentieel</h2>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="potential-hours" className="text-sm">Potentieel totaal uren</label>
            <Input id="potential-hours" type="text" inputMode="decimal" value={potentialHoursInput} placeholder={(240 * monthCount).toLocaleString('nl-NL', { maximumFractionDigits: 1, useGrouping: false })} onChange={(event) => setPotentialHoursInput(event.target.value)} aria-invalid={invalidPotentialHours} className="h-8 w-28 text-right tabular-nums" />
          </div>
          {invalidPotentialHours ? <p role="alert" className="text-xs text-destructive">Vul een geldig aantal uren van 0 of meer in.</p> : null}
          <table className="w-full text-sm"><tbody>
            {[
              ['Vaste lasten per maand · na besparing', money(loading || error || invalidScenario ? null : fixedCosts / monthCount)],
              [`Potentieel per maand · ${invalidPotentialHours ? '—' : (earnings.potentialHours / monthCount).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`, money(earnings.potentialMonthly)],
              ['Potentieel per maand excl. 21% btw', money(earnings.potentialMonthly === null ? null : earnings.potentialMonthly / 1.21)],
              [`Potentieel totaal · ${invalidPotentialHours ? '—' : earnings.potentialHours.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`, money(earnings.potentialTotal)],
              ['Potentieel totaal excl. 21% btw', money(earnings.potentialTotal === null ? null : earnings.potentialTotal / 1.21)],
              ['Potentieel per uur', money(earnings.potentialHourly)],
            ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className={cell}>{value}</td></tr>)}
          </tbody></table>
        </div>
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Tijd</h2>
        <table className="w-full text-sm"><tbody>
          {[
            ['Dagen gewerkt', workedDayCount === null ? 'n.b.' : `${partialAdjustment ? '≈ ' : ''}${workedDayCount.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}`],
            ['Gewerkt op locatie', duration?.entries ? hours(duration.workMinutes || (duration.unsplitMinutes > 0 ? null : 0)) : 'n.b.'],
            ['Gemiddeld gewerkt per dag', hours(totalMinutes !== null && workedDayCount ? totalMinutes / workedDayCount : null)],
            ...(duration?.unsplitMinutes || addedMinutes ? [['Uren zonder GPS', `${partialAdjustment ? '≈ ' : ''}${hours((duration?.unsplitMinutes ?? 0) + addedMinutes)}`]] : []),
            ['Bij leveranciers', duration?.entries ? hours(duration.supplierMinutes) : 'n.b.'],
            ['Gereden', duration?.entries ? hours(duration.driveMinutes) : 'n.b.'],
          ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : value}</td></tr>)}
          <tr className="border-b border-border/50 font-semibold"><td className="px-3 py-2">Totaal geregistreerd</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : hours(totalMinutes)}</td></tr>
          <tr className="border-b border-border/50"><td className="px-3 py-2">Gemiddeld per maand ({monthLabel} maanden)</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : hours(totalMinutes !== null && monthCount > 0 ? totalMinutes / monthCount : null)}</td></tr>
        </tbody></table>
        {partialAdjustment ? <p className="mt-2 text-xs text-muted-foreground">Uren en werkdagen zonder GPS zijn naar verhouding geschat.</p> : null}
        {timeError ? <p role="alert" className="mt-2 text-xs text-destructive">Uren konden niet worden geladen.</p> : null}
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Brandstof</h2>
        <table className="w-full text-sm"><tbody>
          {!timeError ? <KostenAfstandRow dates={time ? time.gpsDates.filter((date) => isReportDate(date, month, today, startDate)) : null} cell={cell} fuelCost={loading || error ? null : summary.totals.brandstof} /> : null}
          <tr className="border-b border-border/50"><td className="px-3 py-2">Brandstof (afgeschreven)</td><td className={cell}>{loading ? 'Laden…' : error ? 'n.b.' : euro(summary.totals.brandstof)}</td></tr>
        </tbody></table>
        {timeError ? <p role="alert" className="mt-2 text-xs text-destructive">GPS-werkdagen konden niet worden geladen.</p> : null}
      </section>
      <ReisbudgetBox scenarioMonthly={earnings.monthly === null ? null : earnings.monthly / 1.21} potentialMonthly={earnings.potentialMonthly === null ? null : earnings.potentialMonthly / 1.21} userId={user!.uid} balance={availableBalance} scenarioBalance={loading || error || invalidScenario || scenario.balanceWithoutCosts === null ? null : scenario.balanceWithoutCosts / 1.21} potentialBalance={earnings.potentialTotal === null ? null : earnings.potentialTotal / 1.21} />
    </div>
  </div>;
}
