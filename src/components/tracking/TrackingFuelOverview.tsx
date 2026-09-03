'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Fuel,
  Landmark,
  Route,
} from 'lucide-react';
import {
  endOfMonth,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfYear,
} from 'date-fns';
import { nl } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { normalizeProjectCostCategory } from '@/lib/project-costs';
import {
  DEFAULT_FUEL_SETTINGS,
  TRACKING_FUEL_SETTINGS_STORAGE_KEY,
  fuelSettingForDate,
  migrateFuelSettings,
  type FuelSetting,
} from '@/lib/tracking-fuel-settings';
import type { TrackingTimeEntry } from '@/components/tracking/TrackingPeriodOverview';

type Period = 'month' | 'year' | 'all';

interface TrackingPosition {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

interface FuelDay {
  date: string;
  distanceKm: number;
  error?: string;
}

interface FinanceFuelRow {
  date?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  amount_incl_btw?: number | string | null;
  amount?: number | string | null;
}

interface MonthlyFuelSummary {
  month: string;
  distanceKm: number;
  gpsCost: number;
  litres: number;
  financeCost: number;
}

interface TrackingFuelOverviewProps {
  history: TrackingTimeEntry[];
}

function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDayRange(dateValue: string): { from: string; to: string } {
  const [year, month, day] = dateValue.split('-').map(Number);
  const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const toDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function distanceBetweenKm(left: TrackingPosition, right: TrackingPosition): number {
  const earthRadiusKm = 6371;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(points: TrackingPosition[]): number {
  const sorted = [...points].sort((left, right) => left.recorded_at.localeCompare(right.recorded_at));
  return sorted.slice(1).reduce((total, point, index) => total + distanceBetweenKm(sorted[index], point), 0);
}

function periodRange(period: Period, referenceDate: string): { start: Date; end: Date } | null {
  const reference = parseISO(referenceDate);
  if (period === 'all') return null;
  if (period === 'year') return { start: startOfYear(reference), end: endOfYear(reference) };
  return { start: startOfMonth(reference), end: endOfMonth(reference) };
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime());
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits }).format(value);
}

function formatSignedCurrency(value: number): string {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
}

function financeFuelAmount(row: FinanceFuelRow): number {
  const value = Number(row.amount_incl_btw ?? row.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function financeFuelRows(rows: FinanceFuelRow[]): FinanceFuelRow[] {
  return rows.filter((row) => (
    normalizeProjectCostCategory(row.category) === 'brandstof'
    || String(row.categoryLabel || '').trim().toLowerCase() === 'benzine'
  ) && validDate(String(row.date || '').slice(0, 10)));
}

function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), 'LLLL yyyy', { locale: nl });
}

function matchLabel(gpsCost: number, financeCost: number): string {
  return Math.abs(gpsCost - financeCost) <= 0.01 ? 'Gelijk' : 'Verschil';
}

function fuelScheduleLabel(settings: FuelSetting[]): string {
  return settings
    .filter((setting) => setting.effectiveFrom !== '0000-01-01')
    .map((setting) => `1 op ${formatNumber(setting.kmPerLitre)} vanaf ${format(parseISO(setting.effectiveFrom), 'd MMM', { locale: nl })}`)
    .join(' · ');
}

export function TrackingFuelOverview({ history }: TrackingFuelOverviewProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [referenceDate, setReferenceDate] = useState(localDateInputValue());
  const [fuelSettings, setFuelSettings] = useState<FuelSetting[]>(DEFAULT_FUEL_SETTINGS);
  const [fuelDays, setFuelDays] = useState<FuelDay[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceFuelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TRACKING_FUEL_SETTINGS_STORAGE_KEY);
    if (!saved) return;
    try {
      setFuelSettings(migrateFuelSettings(JSON.parse(saved)));
    } catch {
      // Ongeldige lokale instellingen negeren.
    }
  }, []);

  const range = useMemo(() => periodRange(period, referenceDate), [period, referenceDate]);
  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    history.forEach((entry) => {
      if (!validDate(entry.date)) return;
      const date = parseISO(entry.date);
      if (!range || isWithinInterval(date, range)) dateSet.add(entry.date);
    });

    const today = localDateInputValue();
    if (!range || isWithinInterval(parseISO(today), range)) dateSet.add(today);
    if (!range || isWithinInterval(parseISO(referenceDate), range)) dateSet.add(referenceDate);
    return Array.from(dateSet).sort();
  }, [history, range, referenceDate]);

  const loadFinanceRows = useCallback(async () => {
    if (!user) return;
    setFinanceLoading(true);
    setFinanceError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/list', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: FinanceFuelRow[]; message?: string } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.message || 'Finance-benzine kon niet worden geladen.');
      }
      setFinanceRows(financeFuelRows(payload.data));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Finance-benzine kon niet worden geladen.';
      setFinanceError(message);
    } finally {
      setFinanceLoading(false);
    }
  }, [user]);

  const loadFuelDays = useCallback(async () => {
    if (!user || dates.length === 0) {
      setFuelDays([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const results = await Promise.all(dates.map(async (date): Promise<FuelDay> => {
        try {
          const rangeForDay = getLocalDayRange(date);
          const response = await fetch(`/api/tracking/traccar?${new URLSearchParams(rangeForDay).toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const payload = await response.json().catch(() => null) as { ok?: boolean; data?: TrackingPosition[]; message?: string } | null;
          if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
            throw new Error(payload?.message || 'GPS-data kon niet worden geladen.');
          }
          return { date, distanceKm: totalDistanceKm(payload.data) };
        } catch (dayError) {
          return {
            date,
            distanceKm: 0,
            error: dayError instanceof Error ? dayError.message : 'GPS-data kon niet worden geladen.',
          };
        }
      }));
      setFuelDays(results);
      if (results.some((result) => result.error)) {
        setError('Niet voor alle dagen kon GPS-data worden geladen. De beschikbare dagen zijn wel opgenomen.');
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'GPS-brandstof kon niet worden berekend.';
      setError(message);
      toast({ title: 'Brandstof niet volledig geladen', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [dates, toast, user]);

  useEffect(() => {
    if (!user) return;
    void loadFuelDays();
  }, [loadFuelDays, user]);

  useEffect(() => {
    if (!user) return;
    void loadFinanceRows();
  }, [loadFinanceRows, user]);

  const summaries = useMemo(() => {
    const grouped = new Map<string, MonthlyFuelSummary>();
    fuelDays.forEach((day) => {
      const setting = fuelSettingForDate(fuelSettings, day.date);
      const month = day.date.slice(0, 7);
      const current = grouped.get(month) || { month, distanceKm: 0, gpsCost: 0, litres: 0, financeCost: 0 };
      current.distanceKm += day.distanceKm;
      current.litres += day.distanceKm / Math.max(0.1, setting.kmPerLitre);
      current.gpsCost += (day.distanceKm / Math.max(0.1, setting.kmPerLitre)) * setting.fuelPrice;
      grouped.set(month, current);
    });

    financeFuelRows(financeRows).forEach((row) => {
      const month = String(row.date).slice(0, 7);
      const rowDate = parseISO(String(row.date).slice(0, 10));
      if (range && !isWithinInterval(rowDate, range)) return;
      const current = grouped.get(month) || { month, distanceKm: 0, gpsCost: 0, litres: 0, financeCost: 0 };
      current.financeCost += financeFuelAmount(row);
      grouped.set(month, current);
    });

    return Array.from(grouped.values())
      .map((summary) => ({
        ...summary,
        distanceKm: Number(summary.distanceKm.toFixed(1)),
        gpsCost: Number(summary.gpsCost.toFixed(2)),
        litres: Number(summary.litres.toFixed(1)),
        financeCost: Number(summary.financeCost.toFixed(2)),
      }))
      .sort((left, right) => right.month.localeCompare(left.month));
  }, [financeRows, fuelDays, fuelSettings, range]);

  const totals = useMemo(() => summaries.reduce((sum, summary) => ({
    distanceKm: sum.distanceKm + summary.distanceKm,
    gpsCost: sum.gpsCost + summary.gpsCost,
    litres: sum.litres + summary.litres,
    financeCost: sum.financeCost + summary.financeCost,
  }), { distanceKm: 0, gpsCost: 0, litres: 0, financeCost: 0 }), [summaries]);

  const rangeLabel = range
    ? `${format(range.start, 'd MMM yyyy', { locale: nl })} – ${format(range.end, 'd MMM yyyy', { locale: nl })}`
    : 'Alle beschikbare brandstofgegevens';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">Brandstof</div>
          <div className="text-sm text-muted-foreground">{rangeLabel}</div>
          <div className="text-xs text-muted-foreground">Verbruik: 1 op {formatNumber(fuelSettingForDate(fuelSettings, '0000-01-01').kmPerLitre)} tot de volgende voertuigwaarde{fuelScheduleLabel(fuelSettings) ? ` · ${fuelScheduleLabel(fuelSettings)}` : ''}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <TabsList className="grid h-10 grid-cols-3">
              <TabsTrigger value="month">Maand</TabsTrigger>
              <TabsTrigger value="year">Jaar</TabsTrigger>
              <TabsTrigger value="all">Alles</TabsTrigger>
            </TabsList>
          </Tabs>
          {period !== 'all' ? (
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Peildatum brandstof" type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} className="pl-9 sm:w-[175px]" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Fuel className="h-4 w-4" />GPS-brandstofindicatie</div><div className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(totals.gpsCost)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4" />Finance · Benzine</div><div className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(totals.financeCost)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" />Verschil Finance − GPS</div><div className="mt-2 text-2xl font-semibold tabular-nums">{formatSignedCurrency(totals.financeCost - totals.gpsCost)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Route className="h-4 w-4" />Gereden afstand</div><div className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(totals.distanceKm)} km</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Fuel className="h-4 w-4" />Literindicatie</div><div className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(totals.litres)} l</div></CardContent></Card>
      </div>

      {error ? <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
      {financeError ? <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{financeError}</div> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Fuel className="h-5 w-5 text-amber-300" />GPS tegenover Finance</CardTitle>
          <CardDescription>GPS is een indicatie op basis van gereden kilometers en je voertuigverbruik. Finance · Benzine is wat in Finance als benzine is geboekt.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || financeLoading ? <div className="p-5 text-center text-sm text-muted-foreground">Brandstofgegevens laden...</div> : summaries.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Geen brandstofgegevens in deze periode.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Maand</th><th className="px-4 py-3 text-right font-medium">GPS km</th><th className="px-4 py-3 text-right font-medium">GPS indicatie</th><th className="px-4 py-3 text-right font-medium">Finance · Benzine</th><th className="px-4 py-3 text-right font-medium">Verschil</th><th className="px-4 py-3 text-right font-medium">Status</th></tr></thead>
                <tbody>{summaries.map((summary) => {
                  const difference = summary.financeCost - summary.gpsCost;
                  const isMatch = matchLabel(summary.gpsCost, summary.financeCost) === 'Gelijk';
                  return <tr key={summary.month} className="border-b border-border/50 last:border-0"><td className="px-4 py-3 font-medium capitalize">{monthLabel(summary.month)}</td><td className="px-4 py-3 text-right tabular-nums">{formatNumber(summary.distanceKm)} km</td><td className="px-4 py-3 text-right tabular-nums">{formatCurrency(summary.gpsCost)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(summary.financeCost)}</td><td className="px-4 py-3 text-right tabular-nums">{formatSignedCurrency(difference)}</td><td className="px-4 py-3 text-right"><Badge variant="outline" className={isMatch ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}>{isMatch ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}{matchLabel(summary.gpsCost, summary.financeCost)}</Badge></td></tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
