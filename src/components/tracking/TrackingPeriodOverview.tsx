'use client';

import { useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, Building2, CalendarDays, Car, Clock3, MapPin, Store } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface TrackingTimeEntry {
  id: string;
  date: string;
  totalHours: number;
  quoteId?: string;
  exactMinutes?: number;
  onsiteMinutes?: number;
  outboundTravelMinutes?: number;
  returnTravelMinutes?: number;
  clientTransferMinutes?: number;
  supplierTravelMinutes?: number;
  supplierStopMinutes?: number;
  unallocatedMinutes?: number;
}

interface TrackingQuote {
  id: string;
  offerteNummer?: number | string;
  titel?: string;
  title?: string;
  klantinformatie?: {
    voornaam?: string;
    achternaam?: string;
    bedrijfsnaam?: string;
    straat?: string;
    huisnummer?: string | number;
    plaats?: string;
  };
}

interface TrackingPeriodOverviewProps {
  history: TrackingTimeEntry[];
  quotes: TrackingQuote[];
  mode: 'period' | 'clients';
  loading?: boolean;
}

type Period = 'week' | 'month' | 'year' | 'all';

interface Totals {
  total: number;
  onsite: number;
  travel: number;
  supplier: number;
  unallocated: number;
}

function entryMinutes(entry: TrackingTimeEntry): Totals {
  const onsite = Number(entry.onsiteMinutes || 0);
  const travel = Number(entry.outboundTravelMinutes || 0)
    + Number(entry.returnTravelMinutes || 0)
    + Number(entry.clientTransferMinutes || 0);
  const supplier = Number(entry.supplierTravelMinutes || 0) + Number(entry.supplierStopMinutes || 0);
  const unallocated = Number(entry.unallocatedMinutes || 0);
  const exact = Number(entry.exactMinutes || 0);
  const recorded = exact > 0 ? exact : Math.round(Number(entry.totalHours || 0) * 60);
  return { total: recorded, onsite, travel, supplier, unallocated };
}

function addTotals(left: Totals, right: Totals): Totals {
  return {
    total: left.total + right.total,
    onsite: left.onsite + right.onsite,
    travel: left.travel + right.travel,
    supplier: left.supplier + right.supplier,
    unallocated: left.unallocated + right.unallocated,
  };
}

function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}u ${rest.toString().padStart(2, '0')}m` : `${rest}m`;
}

function clientName(quote?: TrackingQuote): string {
  const info = quote?.klantinformatie;
  return [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam || 'Onbekende klant';
}

function quoteLabel(quote?: TrackingQuote): string {
  if (!quote) return 'Offerte niet gevonden';
  const number = quote.offerteNummer ? `#${quote.offerteNummer}` : 'Zonder nummer';
  const title = quote.titel || quote.title;
  const info = quote.klantinformatie;
  const address = [info?.straat, info?.huisnummer, info?.plaats].filter(Boolean).join(' ');
  return [number, title || address].filter(Boolean).join(' · ');
}

function periodRange(period: Period, referenceDate: string): { start: Date; end: Date } | null {
  const reference = parseISO(referenceDate);
  if (period === 'all') return null;
  if (period === 'week') {
    return {
      start: startOfWeek(reference, { weekStartsOn: 1 }),
      end: endOfWeek(reference, { weekStartsOn: 1 }),
    };
  }
  if (period === 'month') return { start: startOfMonth(reference), end: endOfMonth(reference) };
  return { start: startOfYear(reference), end: endOfYear(reference) };
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function TrackingPeriodOverview({ history, quotes, mode, loading = false }: TrackingPeriodOverviewProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [referenceDate, setReferenceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const range = useMemo(() => periodRange(period, referenceDate), [period, referenceDate]);
  const filtered = useMemo(() => history.filter((entry) => {
    if (!range) return true;
    const date = parseISO(entry.date);
    return isWithinInterval(date, range);
  }), [history, range]);
  const totals = useMemo(() => filtered.reduce((sum, entry) => addTotals(sum, entryMinutes(entry)), { total: 0, onsite: 0, travel: 0, supplier: 0, unallocated: 0 }), [filtered]);

  const days = useMemo(() => {
    const grouped = new Map<string, Totals>();
    filtered.forEach((entry) => grouped.set(entry.date, addTotals(grouped.get(entry.date) || { total: 0, onsite: 0, travel: 0, supplier: 0, unallocated: 0 }, entryMinutes(entry))));
    return Array.from(grouped.entries()).sort(([left], [right]) => right.localeCompare(left));
  }, [filtered]);

  const clients = useMemo(() => {
    const grouped = new Map<string, { quote?: TrackingQuote; totals: Totals; dates: Set<string> }>();
    filtered.forEach((entry) => {
      const key = entry.quoteId || 'unassigned';
      const current = grouped.get(key) || {
        quote: quotes.find((quote) => quote.id === entry.quoteId),
        totals: { total: 0, onsite: 0, travel: 0, supplier: 0, unallocated: 0 },
        dates: new Set<string>(),
      };
      current.totals = addTotals(current.totals, entryMinutes(entry));
      current.dates.add(entry.date);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((left, right) => right.totals.total - left.totals.total);
  }, [filtered, quotes]);

  const rangeLabel = range
    ? `${format(range.start, 'd MMM yyyy', { locale: nl })} – ${format(range.end, 'd MMM yyyy', { locale: nl })}`
    : 'Alle geregistreerde gegevens';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">{mode === 'period' ? 'Uren gewerkt' : 'Overzicht per klant'}</div>
          <div className="text-sm text-muted-foreground">{rangeLabel}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <TabsList className="grid h-10 grid-cols-4">
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Maand</TabsTrigger>
              <TabsTrigger value="year">Jaar</TabsTrigger>
              <TabsTrigger value="all">Alles</TabsTrigger>
            </TabsList>
          </Tabs>
          {period !== 'all' ? (
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Peildatum" type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} className="pl-9 sm:w-[175px]" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Totaal gewerkt" value={formatMinutes(totals.total)} icon={<Clock3 className="h-4 w-4" />} />
        <Metric label="Op locatie" value={formatMinutes(totals.onsite)} icon={<MapPin className="h-4 w-4" />} />
        <Metric label="Reistijd" value={formatMinutes(totals.travel)} icon={<Car className="h-4 w-4" />} />
        <Metric label="Leverancier" value={formatMinutes(totals.supplier)} icon={<Store className="h-4 w-4" />} />
        <Metric label="Niet ingedeeld" value={formatMinutes(totals.unallocated)} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Gegevens laden...</div> : null}
        {!loading && mode === 'period' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[790px] text-sm">
              <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Datum</th><th className="px-4 py-3 text-right font-medium">Totaal</th><th className="px-4 py-3 text-right font-medium">Locatie</th><th className="px-4 py-3 text-right font-medium">Reis</th><th className="px-4 py-3 text-right font-medium">Leverancier</th><th className="px-4 py-3 text-right font-medium">Niet ingedeeld</th></tr></thead>
              <tbody>{days.map(([date, day]) => <tr key={date} className="border-b border-border/50 last:border-0"><td className="px-4 py-3 font-medium">{format(parseISO(date), 'EEEE d MMMM', { locale: nl })}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMinutes(day.total)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(day.onsite)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(day.travel)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(day.supplier)}</td><td className="px-4 py-3 text-right tabular-nums text-amber-300">{formatMinutes(day.unallocated)}</td></tr>)}</tbody>
            </table>
            {days.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Geen geregistreerde uren in deze periode.</div> : null}
          </div>
        ) : null}

        {!loading && mode === 'clients' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[930px] text-sm">
              <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Klant</th><th className="px-4 py-3 font-medium">Offerte</th><th className="px-4 py-3 text-right font-medium">Dagen</th><th className="px-4 py-3 text-right font-medium">Totaal</th><th className="px-4 py-3 text-right font-medium">Locatie</th><th className="px-4 py-3 text-right font-medium">Reis</th><th className="px-4 py-3 text-right font-medium">Leverancier</th><th className="px-4 py-3 text-right font-medium">Niet ingedeeld</th></tr></thead>
              <tbody>{clients.map((client, index) => <tr key={client.quote?.id || `unassigned-${index}`} className="border-b border-border/50 last:border-0"><td className="px-4 py-3"><div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-muted-foreground" />{clientName(client.quote)}</div></td><td className="px-4 py-3 text-muted-foreground">{quoteLabel(client.quote)}</td><td className="px-4 py-3 text-right tabular-nums">{client.dates.size}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMinutes(client.totals.total)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(client.totals.onsite)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(client.totals.travel)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMinutes(client.totals.supplier)}</td><td className="px-4 py-3 text-right tabular-nums text-amber-300">{formatMinutes(client.totals.unallocated)}</td></tr>)}</tbody>
            </table>
            {clients.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Geen klanturen in deze periode.</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
