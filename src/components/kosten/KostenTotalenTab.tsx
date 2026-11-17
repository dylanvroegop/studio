'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { summarizeBankCostRows, type BankCostFilter } from '@/lib/bank-cost-summary';
import { PROJECT_COST_CATEGORIES, type ProjectCostCategory, type ProjectCostRow } from '@/lib/project-costs';
import { summarizeTimeEntries, type TimeTotals } from '@/lib/time-entry-totals';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { ReisbudgetBox } from './ReisbudgetBox';
import { KostenStartDate } from './KostenStartDate';
import { isReportDate, reportDayCounts, reportPeriodMonths, reportOverlapFraction, reportMonths, reportEarnings, reportElapsed } from '@/lib/kosten-report-period';
import { KostenAfstandRow } from './KostenAfstandRow';
import { Checkbox } from '@/components/ui/checkbox';
import type { BankAccountView } from '@/lib/bank-overzicht';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { KnabRequestError, requestKnab } from '@/lib/knab-refresh-client';
import { Input } from '@/components/ui/input';
import { calculateBankCostScenario, parseScenarioAmount, remainingFixedCosts } from '@/lib/bank-cost-scenario';

interface Props {
  onBankSynced: () => Promise<void>;
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

export function KostenTotalenTab({ costs, privateCredits, categories, loading, error, startDate, onStartDateChange, onBankSynced }: Props) {
  const { user } = useUser();
  const [month, setMonth] = useState('all');
  const [reductions, setReductions] = useState<Partial<Record<ProjectCostCategory, string>>>({});
  const [cash, setCash] = useState('');
  const [potentialHoursInput, setPotentialHoursInput] = useState('');
  const [potentialMonthlyHoursInput, setPotentialMonthlyHoursInput] = useState('');
  const [potentialHoursMode, setPotentialHoursMode] = useState<'total' | 'monthly'>('total');
  const [extraMonthlyFixed, setExtraMonthlyFixed] = useState('');
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSyncedAt, setBankSyncedAt] = useState<string | null>(null);
  const [bankReconnectRequired, setBankReconnectRequired] = useState(false);
  const [bankConnecting, setBankConnecting] = useState(false);
  const [bankNotice, setBankNotice] = useState<string | null>(null);
  const bankRequestRef = useRef<AbortController | null>(null);
  const onBankSyncedRef = useRef(onBankSynced);
  onBankSyncedRef.current = onBankSynced;
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
    setPotentialMonthlyHoursInput('');
    setPotentialHoursMode('total');
    setStorageError(false);
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.potentialHoursMode === 'monthly') setPotentialHoursMode('monthly');
        if (typeof saved.potentialMonthlyHoursInput === 'string') setPotentialMonthlyHoursInput(saved.potentialMonthlyHoursInput);
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
      localStorage.setItem(storageKey, JSON.stringify({ month, reductions, cash, extraMonthlyFixed, potentialHoursInput, potentialMonthlyHoursInput, potentialHoursMode }));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [storageKey, restoredKey, month, reductions, cash, extraMonthlyFixed, potentialHoursInput, potentialMonthlyHoursInput, potentialHoursMode]);

  const loadBankBalance = useCallback(async (sync = false) => {
    if (!user || bankRequestRef.current) return;
    const controller = new AbortController();
    bankRequestRef.current = controller;
    const signal = controller.signal;
    setBankLoading(true);
    setBankError(null);
    setBankNotice(null);
    let syncError: unknown = null;
    let overviewError: unknown = null;
    try {
      if (sync) {
        try {
          await requestKnab(user, '/api/bank/sync-enablebanking', { method: 'POST', signal });
          if (signal.aborted) return;
          setBankReconnectRequired(false);
        } catch (error) { syncError = error; }
      }
      // Ook bij een bankstoring het laatst opgeslagen saldo blijven tonen.
      try {
        const payload = await requestKnab<{ ok: boolean; data?: { accounts?: BankAccountView[]; connection?: { lastSyncedAt?: string; status?: string } } }>(
          user, '/api/bank/overview?provider=enablebanking&profile=personal', { signal }, 30_000,
        );
        const accounts = payload.data?.accounts;
        if (!Array.isArray(accounts) || !accounts.length || accounts.some((account) => account.currency !== 'EUR' || typeof account.latestBalanceAmount !== 'number' || !Number.isFinite(account.latestBalanceAmount))) {
          throw new Error('Geen volledig Knab-saldo beschikbaar.');
        }
        if (signal.aborted) return;
        setBankBalance(accounts.reduce((sum, account) => sum + Math.round(account.latestBalanceAmount! * 100), 0) / 100);
        setBankSyncedAt(payload.data?.connection?.lastSyncedAt || null);
        setBankReconnectRequired(Boolean(payload.data?.connection && payload.data.connection.status !== 'connected'));
      } catch (error) { overviewError = error; }
      if (signal.aborted) return;
      if (sync && !syncError) {
        try { await onBankSyncedRef.current(); }
        catch { throw new Error('Knab is bijgewerkt, maar de kostentotalen konden niet worden geladen. Probeer het opnieuw.'); }
      }
      if (syncError) throw syncError;
      if (overviewError) throw overviewError;
      if (sync && !signal.aborted) setBankNotice('Knab-saldo en kosten zijn bijgewerkt.');
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof KnabRequestError && error.reconnectRequired) setBankReconnectRequired(true);
      setBankError(error instanceof Error ? error.message : 'Knab kon niet worden bijgewerkt.');
    } finally {
      if (bankRequestRef.current === controller) bankRequestRef.current = null;
      if (!signal.aborted) setBankLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setBankBalance(null);
    setBankSyncedAt(null);
    setBankReconnectRequired(false);
    setBankConnecting(false);
    if (!user) { setBankLoading(false); return; }
    void loadBankBalance();
    return () => {
      bankRequestRef.current?.abort();
      bankRequestRef.current = null;
    };
  }, [loadBankBalance, user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('bank');
    if (result === 'connected') setBankNotice('Knab is gekoppeld. De nieuwste gegevens worden geladen.');
    if (result === 'error') {
      setBankError(url.searchParams.get('message') || 'Knab koppelen is niet voltooid. Probeer het opnieuw.');
      setBankReconnectRequired(true);
    }
    if (result) {
      url.searchParams.delete('bank');
      url.searchParams.delete('message');
      window.history.replaceState(window.history.state, '', url);
    }
  }, []);

  const connectKnab = async () => {
    if (!user || bankConnecting || bankRequestRef.current) return;
    const controller = new AbortController();
    bankRequestRef.current = controller;
    setBankConnecting(true);
    setBankError(null);
    setBankNotice(null);
    try {
      const data = await requestKnab(user, '/api/bank/enablebanking/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId: 'Knab', returnTo: '/kosten?tab=totalen' }),
        signal: controller.signal,
      }, 30_000);
      if (controller.signal.aborted) return;
      if (!data.link || new URL(data.link).protocol !== 'https:') throw new Error('Knab gaf geen geldige koppellink terug.');
      window.location.assign(data.link);
    } catch (error) {
      if (controller.signal.aborted) return;
      setBankError(error instanceof Error ? error.message : 'Knab koppelen is mislukt.');
      setBankConnecting(false);
    } finally {
      if (bankRequestRef.current === controller) bankRequestRef.current = null;
    }
  };

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
  const availableBalance = bankBalance === null || invalidCash ? null
    : (Math.round(bankBalance * 100) + Math.round(cashAmount! * 100)) / 100;
  const scenario = calculateBankCostScenario(summary.totals, requestedReductions, availableBalance, extraFixedCosts);
  const duration = time ? (month === 'all' ? time.all : time.months[month] || summarizeTimeEntries([])) : null;
  const workedDates = time ? time.dates.filter((date) => isReportDate(date, month, today, startDate)) : null;
  const adjustments = time?.adjustments?.filter((row) => row.start_date <= periodEnd && row.end_date >= periodStart) ?? [];
  const partialAdjustment = adjustments.some((row) => row.start_date < periodStart || row.end_date > periodEnd);
  const workedDayCount = !workedDates || adjustments.some((row) => row.worked_days === null) ? null
    : workedDates.filter((date) => !adjustments.some((row) => date >= row.start_date && date <= row.end_date)).length
      + adjustments.reduce((sum, row) => sum + (row.worked_days ?? 0) * reportOverlapFraction(row.start_date, row.end_date, periodStart, periodEnd), 0);
  const dayCounts = reportDayCounts(periodStart, periodEnd, workedDayCount);
  const addedMinutes = adjustments.reduce((sum, row) => sum + row.minutes * reportOverlapFraction(row.start_date, row.end_date, periodStart, periodEnd), 0);
  const totalMinutes = duration ? duration.workMinutes + (duration.supplierMinutes ?? 0) + (duration.driveMinutes ?? 0) + duration.unsplitMinutes + addedMinutes : null;
  const fixedCosts = remainingFixedCosts(summary.totals, requestedReductions) + extraFixedCosts;
  const activePotentialHoursInput = potentialHoursMode === 'monthly' ? potentialMonthlyHoursInput : potentialHoursInput;
  const enteredPotentialHours = activePotentialHoursInput.trim() ? parseScenarioAmount(activePotentialHoursInput) : undefined;
  const potentialHoursValue = typeof enteredPotentialHours === 'number' && potentialHoursMode === 'monthly'
    ? enteredPotentialHours * monthCount : enteredPotentialHours;
  const invalidPotentialHours = potentialHoursValue === null || (potentialHoursValue !== undefined && potentialHoursValue < 0);
  const earnings = reportEarnings(loading || error || invalidScenario ? null : scenario.balanceWithoutCosts, timeError ? null : totalMinutes, monthCount, fixedCosts, invalidPotentialHours ? null : potentialHoursValue);
  const potentialThreeMonths = earnings.potentialMonthly === null ? null : earnings.potentialMonthly * 3;
  const money = (value: number | null) => value === null ? 'n.b.' : euro(value);
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  if (!storageKey || restoredKey !== storageKey) return <p className="text-sm text-muted-foreground">Totalen laden…</p>;
  return <div className="min-w-0 max-w-full space-y-4">
    {storageError ? <p role="alert" className="text-sm text-destructive">Je keuzes konden niet op dit apparaat worden opgeslagen.</p> : null}
    <div className="flex flex-wrap items-center gap-3">
      <div className="space-y-1"><KostenStartDate value={startDate} onChange={onStartDateChange} /><span className="block text-xs text-muted-foreground">{elapsed.days} dagen · {elapsed.months} maanden en {elapsed.remainingDays} dagen verstreken</span></div>
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-9 w-48" aria-label="Periode totalen"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle maanden ({months.length})</SelectItem>{months.map((value) => <SelectItem key={value} value={value}>{new Date(`${value}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="space-y-2" aria-busy={bankLoading || bankConnecting}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={bankLoading || bankConnecting} onClick={() => void loadBankBalance(true)}>
          {bankLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {bankLoading ? 'Knab bijwerken…' : 'Knab bijwerken'}
        </Button>
        {bankReconnectRequired || bankError ? <Button type="button" variant={bankReconnectRequired ? 'default' : 'ghost'} className="min-h-11" disabled={bankLoading || bankConnecting} onClick={() => void connectKnab()}>{bankConnecting ? 'Knab openen…' : 'Knab opnieuw koppelen'}</Button> : null}
      </div>
      {bankSyncedAt ? <p className="text-xs text-muted-foreground">Laatst bijgewerkt: {new Date(bankSyncedAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' })}</p> : null}
      {bankReconnectRequired ? <p className="text-sm">Bevestig de Knab-koppeling opnieuw om actuele gegevens op te halen.</p> : null}
      {bankError ? <p role="alert" className="break-words text-sm text-red-400">{bankError}{bankBalance !== null ? ' Het laatst opgehaalde saldo blijft zichtbaar.' : ''}</p> : null}
      {bankNotice ? <p role="status" className="text-sm text-emerald-500">{bankNotice}</p> : null}
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 lg:row-span-4">
        <h2 className="mb-2 text-sm font-semibold">Kosten</h2>
        {loading ? <p className="text-sm text-muted-foreground">Kosten laden…</p> : error ? <p role="alert" className="text-sm text-destructive">Kosten konden niet worden geladen.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-muted-foreground"><tr><th className="px-2 py-2 text-center text-xs font-normal">Hele bedrag</th><th className="px-3 py-2 text-left font-normal">Categorie</th><th className={`${cell} font-normal`}>Bedrag</th><th className={`${cell} font-normal`}>Aantal</th><th className={`${cell} font-normal`}>Minder (€)</th></tr></thead>
            <tbody>{categories.map(({ value, label }) => {
              const totalCents = Math.round(summary.totals[value] * 100);
              const reductionCents = value === 'alle' ? 0 : Math.round((requestedReductions[value] || 0) * 100);
              const costColor = value === 'alle' || totalCents <= 0 ? ''
                : reductionCents === totalCents ? 'text-emerald-400' : 'text-red-400';
              return <tr key={value} className={`border-b border-border/50 ${value === 'alle' ? 'font-semibold' : costColor}`}><td className="px-2 py-2 text-center">{value !== 'alle' ? <Checkbox aria-label={`${label} helemaal weglaten`} className={costColor === 'text-red-400' ? 'border-red-400' : undefined} disabled={summary.totals[value] <= 0} checked={reductions[value] === 'all'} onCheckedChange={(checked) => setReductions((current) => ({ ...current, [value]: checked === true ? 'all' : '' }))} /> : null}</td><td className="px-3 py-2">{value === 'alle' ? 'Totaal uitgaven' : value === 'eigen_verbruik' ? 'Privé-opnames (netto)' : label}</td><td className={cell}>{euro(summary.totals[value])}</td><td className={cell}>{summary.counts[value]}</td><td className="px-2 py-2">{value !== 'alle' ? <Input type="text" inputMode="decimal" aria-label={`${label} minder in euro`} placeholder="0,00" value={reductions[value] === 'all' ? Math.max(0, summary.totals[value]).toFixed(2).replace('.', ',') : reductions[value] || ''} onChange={(event) => setReductions((current) => ({ ...current, [value]: event.target.value }))} className={`h-8 w-28 text-right tabular-nums ${costColor}`} /> : null}</td></tr>;
            })}</tbody>
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
            <span className="text-sm tabular-nums">{bankBalance !== null ? euro(bankBalance) : bankLoading ? 'Laden…' : 'n.b.'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3">
            <label htmlFor="kosten-cash" className="text-sm">Cash</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">€</span>
              <Input id="kosten-cash" type="text" inputMode="decimal" placeholder="0,00" value={cash} onChange={(event) => setCash(event.target.value)} aria-invalid={invalidCash} aria-describedby={invalidCash ? 'kosten-cash-error' : undefined} className="h-8 w-28 text-right tabular-nums" />
            </div>
          </div>
          {invalidCash ? <p id="kosten-cash-error" role="alert" className="text-xs text-destructive">Vul een cashbedrag van € 0,00 of hoger in.</p> : null}
          <table className="w-full table-fixed text-sm [&_td:first-child]:w-[62%] [&_td]:break-words [&_td]:whitespace-normal"><tbody>
            <tr className="border-b border-border/50"><td className="px-3 py-2">Extra overgehouden</td><td className={cell}>{loading ? 'Laden…' : error || invalidScenario ? 'n.b.' : euro(scenario.saved)}</td></tr>
            <tr className="border-b border-border/50 font-semibold"><td className="px-3 py-2">Saldo met besparing</td><td className={`${cell} text-emerald-400`}>{loading ? 'Laden…' : error || invalidScenario || scenario.balanceWithoutCosts === null ? 'n.b.' : euro(scenario.balanceWithoutCosts)}</td></tr>
            <tr className="border-b border-border/50"><td className="px-3 py-2">Saldo met besparing excl. 21% btw</td><td className={cell}>{loading ? 'Laden…' : error || invalidScenario || scenario.balanceWithoutCosts === null ? 'n.b.' : euro(scenario.balanceWithoutCosts / 1.21)}</td></tr>
          </tbody></table>
          <table className="w-full table-fixed text-sm [&_td:first-child]:w-[62%] [&_td]:break-words [&_td]:whitespace-normal"><tbody>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select value={potentialHoursMode} onValueChange={(value) => setPotentialHoursMode(value === 'monthly' ? 'monthly' : 'total')}>
              <SelectTrigger aria-label="Uren invullen voor" className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Totaal uren</SelectItem>
                <SelectItem value="monthly">Uren per maand</SelectItem>
              </SelectContent>
            </Select>
            <Input id="potential-hours" aria-label={potentialHoursMode === 'monthly' ? 'Potentieel uren per maand' : 'Potentieel totaal uren'} type="text" inputMode="decimal" value={activePotentialHoursInput} placeholder={(potentialHoursMode === 'monthly' ? 240 : 240 * monthCount).toLocaleString('nl-NL', { maximumFractionDigits: 1, useGrouping: false })} onChange={(event) => potentialHoursMode === 'monthly' ? setPotentialMonthlyHoursInput(event.target.value) : setPotentialHoursInput(event.target.value)} aria-invalid={invalidPotentialHours} className="h-8 w-28 text-right tabular-nums" />
          </div>
          {invalidPotentialHours ? <p role="alert" className="text-xs text-destructive">Vul een geldig aantal uren van 0 of meer in.</p> : null}
          <table className="w-full table-fixed text-sm [&_td:first-child]:w-[62%] [&_td]:break-words [&_td]:whitespace-normal"><tbody>
            {[
              ['Vaste lasten per maand · na besparing', money(loading || error || invalidScenario ? null : fixedCosts / monthCount)],
              [`Potentieel per maand · ${invalidPotentialHours ? '—' : (earnings.potentialHours / monthCount).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`, money(earnings.potentialMonthly)],
              ['Potentieel per maand excl. 21% btw', money(earnings.potentialMonthly === null ? null : earnings.potentialMonthly / 1.21)],
              [`Potentieel per 3 maanden · ${invalidPotentialHours ? '—' : (earnings.potentialHours / monthCount * 3).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`, money(potentialThreeMonths)],
              ['Potentieel per 3 maanden excl. 21% btw', money(potentialThreeMonths === null ? null : potentialThreeMonths / 1.21)],
              [`Potentieel totaal · ${invalidPotentialHours ? '—' : earnings.potentialHours.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`, money(earnings.potentialTotal)],
              ['Potentieel totaal excl. 21% btw', money(earnings.potentialTotal === null ? null : earnings.potentialTotal / 1.21)],
              ['Potentieel per uur', money(earnings.potentialHourly)],
            ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className={cell}>{value}</td></tr>)}
          </tbody></table>
        </div>
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Tijd</h2>
        <table className="w-full table-fixed text-sm [&_td:first-child]:w-[62%] [&_td]:break-words [&_td]:whitespace-normal"><tbody>
          <tr className="border-b border-border/50"><td className="px-3 py-2">Dagen verstreken</td><td className={cell}>{dayCounts.days.toLocaleString('nl-NL')}</td></tr>
          {[
            ['Dagen gewerkt', workedDayCount === null ? 'n.b.' : `${partialAdjustment ? '≈ ' : ''}${workedDayCount.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}`],
            ['Dagen niet gewerkt', dayCounts.daysOff === null ? 'n.b.' : `${partialAdjustment ? '≈ ' : ''}${dayCounts.daysOff.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}`],
            ['Gewerkt op locatie', duration?.entries ? hours(duration.workMinutes || (duration.unsplitMinutes > 0 ? null : 0)) : 'n.b.'],
            ['Gemiddeld gewerkt per dag', hours(totalMinutes !== null && workedDayCount ? totalMinutes / workedDayCount : null)],
            ...(duration?.unsplitMinutes || addedMinutes ? [['Uren zonder GPS', `${partialAdjustment ? '≈ ' : ''}${hours((duration?.unsplitMinutes ?? 0) + addedMinutes)}`]] : []),
            ['Bij leveranciers', duration?.entries ? hours(duration.supplierMinutes) : 'n.b.'],
            ['Gereden', duration?.entries ? hours(duration.driveMinutes) : 'n.b.'],
          ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : value}</td></tr>)}
          <tr className="border-b border-border/50 font-semibold"><td className="px-3 py-2">Totaal geregistreerd</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : hours(totalMinutes)}</td></tr>
          <tr className="border-b border-border/50"><td className="px-3 py-2">Gemiddeld per maand ({monthLabel} maanden)</td><td className={cell}>{timeError ? 'n.b.' : !duration ? 'Laden…' : hours(totalMinutes !== null && monthCount > 0 ? totalMinutes / monthCount : null)}</td></tr>
        </tbody></table>
        <p className="mt-2 text-xs text-muted-foreground">Dagen inclusief begin- en einddatum en weekenden. Niet gewerkt = dagen zonder geregistreerd werk.</p>
        {partialAdjustment ? <p className="mt-2 text-xs text-muted-foreground">Uren en werkdagen zonder GPS zijn naar verhouding geschat.</p> : null}
        {timeError ? <p role="alert" className="mt-2 text-xs text-destructive">Uren konden niet worden geladen.</p> : null}
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Brandstof</h2>
        <table className="w-full table-fixed text-sm [&_td:first-child]:w-[62%] [&_td]:break-words [&_td]:whitespace-normal"><tbody>
          {!timeError ? <KostenAfstandRow dates={time ? time.gpsDates.filter((date) => isReportDate(date, month, today, startDate)) : null} cell={cell} fuelCost={loading || error ? null : summary.totals.brandstof} /> : null}
          <tr className="border-b border-border/50"><td className="px-3 py-2">Brandstof (afgeschreven)</td><td className={cell}>{loading ? 'Laden…' : error ? 'n.b.' : euro(summary.totals.brandstof)}</td></tr>
        </tbody></table>
        {timeError ? <p role="alert" className="mt-2 text-xs text-destructive">GPS-werkdagen konden niet worden geladen.</p> : null}
      </section>
      <ReisbudgetBox scenarioMonthly={earnings.monthly === null ? null : earnings.monthly / 1.21} potentialMonthly={earnings.potentialMonthly === null ? null : earnings.potentialMonthly / 1.21} userId={user!.uid} balance={availableBalance} scenarioBalance={loading || error || invalidScenario || scenario.balanceWithoutCosts === null ? null : scenario.balanceWithoutCosts / 1.21} potentialBalance={earnings.potentialTotal === null ? null : earnings.potentialTotal / 1.21} />
    </div>
  </div>;
}
