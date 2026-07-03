'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { WinstCostCategoryKey, WinstMetricsResponse } from '@/lib/winst-types';
import { cn } from '@/lib/utils';

type PeriodType = 'month' | 'week';
type KPIItemTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'unknown';
type ProjectRowData = WinstMetricsResponse['projectPerformances'][number] & {
  actualProjectProfit: number | null;
  actualProjectMargin: number | null;
  realizedProfitPerDay: number | null;
  expectedProfitPerDay: number | null;
};

type TimeEntryRow = {
  id: string;
  date: string;
  workedHours: number;
};

function mapTimeEntryRow(row: Record<string, unknown>): TimeEntryRow | null {
  const date = String(row.work_date || row.date || '');
  if (!date) return null;
  return {
    id: String(row.id || crypto.randomUUID()),
    date,
    workedHours: Number(row.worked_hours ?? row.workedHours ?? row.hours ?? 0),
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatPercent(value: number): string {
  return `${(Number.isFinite(value) ? value * 100 : 0).toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  const numeric = Number.isFinite(value) ? value * 100 : 0;
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatProjectDate(value: string | null): string {
  if (!value) return 'Onbekende datum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function kpiValueClass(tone: KPIItemTone): string {
  if (tone === 'positive') return 'text-emerald-300';
  if (tone === 'negative') return 'text-red-300';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'unknown') return 'text-muted-foreground';
  return 'text-foreground';
}

function FilterPopover(props: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { title, options, selected, onChange } = props;
  const selectedCount = selected.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between gap-2 border-border/60 bg-background/40">
          <span>{title}</span>
          <span className="text-xs text-muted-foreground">{selectedCount > 0 ? `${selectedCount} geselecteerd` : 'Alle'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{title}</div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
            Reset
          </Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-auto pr-1">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen opties beschikbaar.</p>
          ) : (
            options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                <Checkbox
                  checked={selected.includes(option.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange(Array.from(new Set([...selected, option.id])));
                      return;
                    }
                    onChange(selected.filter((item) => item !== option.id));
                  }}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function KPIItem(props: {
  label: string;
  value: string;
  tone?: KPIItemTone;
  className?: string;
}) {
  const { label, value, tone = 'neutral', className } = props;
  return (
    <div className={cn('flex-1 px-5 py-4 sm:px-6 sm:py-5', className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">{label}</p>
      <p className={cn('mt-2 text-3xl font-semibold leading-none drop-shadow-[0_0_16px_rgba(16,185,129,0.08)]', kpiValueClass(tone))}>{value}</p>
    </div>
  );
}

function ProjectRow(props: {
  project: ProjectRowData;
  onNavigate: (path: string) => void;
  onEditHours: (project: ProjectRowData) => void;
}) {
  const { project, onNavigate, onEditHours } = props;
  const projectLabel = project.offerteNummer ? `#${project.offerteNummer}` : project.title;
  const encodedProjectId = encodeURIComponent(project.projectId);
  const openHoursEditor = () => onEditHours(project);
  const openCostEditor = () => onNavigate(`/kosten?offerteId=${encodedProjectId}&open=1`);
  const openQuoteEditor = () => onNavigate(`/offertes/${encodedProjectId}`);

  const status = !project.hasActualData
    ? {
      label: 'Geen nacalculatie',
      badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      cardClassName: 'border-amber-500/20 bg-gradient-to-r from-amber-500/[0.10] via-card/55 to-card/40',
      barClassName: 'bg-amber-400/90',
    }
    : (project.actualProjectProfit ?? 0) < 0
      ? {
        label: 'Verlies',
        badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-200',
        cardClassName: 'border-red-500/20 bg-gradient-to-r from-red-500/[0.10] via-card/55 to-card/40',
        barClassName: 'bg-red-400/90',
      }
      : {
        label: 'Winstgevend',
        badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
        cardClassName: 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.14] via-card/55 to-card/40',
        barClassName: 'bg-emerald-400/90',
      };

  const winstText =
    project.actualProjectProfit === null
      ? 'Onbekend'
      : formatCurrency(project.actualProjectProfit);

  const winstTextClass =
    project.actualProjectProfit === null
      ? 'text-muted-foreground'
      : project.actualProjectProfit < 0
        ? 'text-red-300'
        : 'text-emerald-300';
  const margeText =
    project.actualProjectMargin === null
      ? 'Onbekend'
      : formatPercent(project.actualProjectMargin);
  const margeTextClass =
    project.actualProjectMargin === null
      ? 'text-muted-foreground'
      : project.actualProjectMargin < 0
        ? 'text-red-300'
        : 'text-emerald-300';
  const realizedDayText = project.realizedProfitPerDay !== null ? formatCurrency(project.realizedProfitPerDay) : 'Onbekend';
  const dayTextClass =
    project.realizedProfitPerDay === null
      ? 'text-muted-foreground'
      : project.expectedProfitPerDay !== null && project.realizedProfitPerDay < project.expectedProfitPerDay
        ? 'text-red-300'
        : 'text-emerald-300';

  const goalDayTextClass =
    project.expectedProfitPerDay === null
      ? 'text-muted-foreground'
      : 'text-foreground';

  const goalDayValue = project.expectedProfitPerDay === null
    ? 'Onbekend'
    : formatCurrency(project.expectedProfitPerDay);

  return (
    <div className={cn('relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-200 hover:shadow-[0_14px_30px_-24px_rgba(16,185,129,0.45)]', status.cardClassName)}>
      <div className={cn('absolute bottom-0 left-0 top-0 w-1.5', status.barClassName)} />
      <div className="space-y-3 pl-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-foreground">{projectLabel}</p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {project.clientName} • {formatProjectDate(project.createdAt)}
            </p>
          </div>
          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium', status.badgeClassName)}>
            {status.label}
          </span>
        </div>

        <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Winst</p>
          <p className={cn('mt-1 text-2xl font-semibold leading-none', winstTextClass)}>{winstText}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Basis: omzet incl. btw - kosten incl. btw</p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openQuoteEditor}
              title="Omzet bewerken in offerte"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Omzet incl. btw</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{formatCurrency(project.quotedRevenueIncl)}</p>
          </div>
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openCostEditor}
              title="Kosten bewerken"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Kosten incl. btw</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{project.hasActualData ? formatCurrency(project.actualCostExcl) : '—'}</p>
          </div>
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openCostEditor}
              title="Marge bijwerken via kosten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Marge</p>
            <p className={cn('mt-0.5 text-sm font-semibold', margeTextClass)}>{margeText}</p>
          </div>
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openHoursEditor}
              title="Dagtarief bijwerken via uren"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">€/dag</p>
            <p className={cn('mt-0.5 text-sm font-semibold', dayTextClass)}>{realizedDayText}</p>
          </div>
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openHoursEditor}
              title="Dagen bewerken via uren"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Dagen</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{project.actualDays.toFixed(1)} / {project.quotedDays.toFixed(1)}</p>
          </div>
          <div className="relative rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={openQuoteEditor}
              title="Doel bewerken in offerte"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Doel €/dag</p>
            <p className={cn('mt-0.5 text-sm font-semibold', goalDayTextClass)}>{goalDayValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={null} title="Dashboard" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function WinstPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodRange, setPeriodRange] = useState<number>(6);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<WinstMetricsResponse | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [hoursEditorProject, setHoursEditorProject] = useState<ProjectRowData | null>(null);
  const [hoursEditorDate, setHoursEditorDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [hoursEditorValue, setHoursEditorValue] = useState<string>('');
  const [hoursSaving, setHoursSaving] = useState<boolean>(false);
  const [hoursHistory, setHoursHistory] = useState<TimeEntryRow[]>([]);
  const [hoursHistoryLoading, setHoursHistoryLoading] = useState<boolean>(false);
  const [hoursEditingEntryId, setHoursEditingEntryId] = useState<string | null>(null);
  const [hoursEntryToDelete, setHoursEntryToDelete] = useState<TimeEntryRow | null>(null);
  const [hoursDeleting, setHoursDeleting] = useState<boolean>(false);
  const [metricsRefreshTick, setMetricsRefreshTick] = useState<number>(0);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    setPeriodRange(periodType === 'month' ? 6 : 8);
  }, [periodType]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    const loadMetrics = async () => {
      setLoadingMetrics(true);
      setMetricsError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/winst/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            periodType,
            periodRange,
            dashboardSelectionOnly: true,
            jobTypes: selectedJobTypes,
            clientIds: selectedClientIds,
            projectIds: selectedProjectIds,
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          message?: string;
          data?: WinstMetricsResponse;
        } | null;

        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }

        if (!cancelled) setMetrics(payload.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout';
        if (!cancelled) {
          setMetricsError(message);
          setMetrics(null);
          toast({
            title: 'Winstmetrics laden mislukt',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingMetrics(false);
      }
    };

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [firestore, metricsRefreshTick, periodRange, periodType, selectedClientIds, selectedJobTypes, selectedProjectIds, toast, user]);

  useEffect(() => {
    if (!user || !hoursEditorProject) return;
    let cancelled = false;

    const loadProjectHours = async () => {
      setHoursHistoryLoading(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/uren/entries?limit=500', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: Array<Record<string, unknown>>; message?: string } | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }

        const filtered = payload.data
          .filter((row) => String(row.quote_id || row.quoteId || '') === hoursEditorProject.projectId)
          .map((row) => mapTimeEntryRow(row))
          .filter((row): row is TimeEntryRow => Boolean(row))
          .sort((a, b) => b.date.localeCompare(a.date));

        if (!cancelled) setHoursHistory(filtered);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout';
        if (!cancelled) {
          setHoursHistory([]);
          toast({
            title: 'Urenhistorie laden mislukt',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setHoursHistoryLoading(false);
      }
    };

    void loadProjectHours();

    return () => {
      cancelled = true;
    };
  }, [hoursEditorProject, toast, user]);

  const handleOpenHoursEditor = (project: ProjectRowData) => {
    setHoursEditorProject(project);
    setHoursEditorDate(format(new Date(), 'yyyy-MM-dd'));
    setHoursEditorValue('');
    setHoursHistory([]);
    setHoursEditingEntryId(null);
    setHoursEntryToDelete(null);
  };

  const handleSaveProjectHours = async () => {
    if (!user || !hoursEditorProject) return;

    const hours = Number(hoursEditorValue.replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      toast({
        title: 'Ongeldig aantal uren',
        description: 'Vul een waarde tussen 0 en 24 in.',
        variant: 'destructive',
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoursEditorDate)) {
      toast({
        title: 'Ongeldige datum',
        description: 'Kies een geldige datum.',
        variant: 'destructive',
      });
      return;
    }

    setHoursSaving(true);
    try {
      const token = await user.getIdToken();
      const editingEntryId = hoursEditingEntryId;
      const response = await fetch('/api/uren/entries', {
        method: editingEntryId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingEntryId || undefined,
          quoteId: hoursEditorProject.projectId,
          workDate: hoursEditorDate,
          workedHours: hours,
          source: 'manual',
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: Record<string, unknown>; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      const savedRow = mapTimeEntryRow(payload.data);
      if (!savedRow) throw new Error('Ongeldige API respons');

      if (editingEntryId) {
        setHoursHistory((prev) =>
          prev
            .map((entry) => (entry.id === editingEntryId ? savedRow : entry))
            .sort((a, b) => b.date.localeCompare(a.date))
        );
      } else {
        setHoursHistory((prev) =>
          [savedRow, ...prev]
            .sort((a, b) => b.date.localeCompare(a.date))
        );
      }

      toast({
        title: editingEntryId ? 'Uren bijgewerkt' : 'Uren opgeslagen',
        description: `${hours.toFixed(2)} uur ${editingEntryId ? 'bijgewerkt' : 'toegevoegd'} op ${hoursEditorDate}.`,
      });
      setHoursEditingEntryId(null);
      setHoursEditorValue('');
      setMetricsRefreshTick((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setHoursSaving(false);
    }
  };

  const handleStartEditHoursEntry = (entry: TimeEntryRow) => {
    setHoursEditingEntryId(entry.id);
    setHoursEditorDate(entry.date);
    setHoursEditorValue(entry.workedHours.toString());
  };

  const handleDeleteHoursEntry = async () => {
    if (!user || !hoursEntryToDelete) return;

    setHoursDeleting(true);
    try {
      const token = await user.getIdToken();
      const entryToDelete = hoursEntryToDelete;
      const response = await fetch('/api/uren/entries', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: entryToDelete.id }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      setHoursHistory((prev) => prev.filter((entry) => entry.id !== entryToDelete.id));
      if (hoursEditingEntryId === entryToDelete.id) {
        setHoursEditingEntryId(null);
        setHoursEditorDate(format(new Date(), 'yyyy-MM-dd'));
        setHoursEditorValue('');
      }
      setHoursEntryToDelete(null);
      setMetricsRefreshTick((prev) => prev + 1);
      toast({
        title: 'Uren verwijderd',
        description: `${entryToDelete.workedHours.toFixed(2)} uur op ${entryToDelete.date} is verwijderd.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Verwijderen mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setHoursDeleting(false);
    }
  };

  const derived = useMemo(() => {
    const projects = metrics?.projectPerformances ?? [];
    const withActual = projects.filter((project) => project.hasActualData);
    const sumQuotedRevenue = projects.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const sumQuotedCost = projects.reduce(
      (sum, project) => sum + project.costBreakdown.reduce((rowSum, row) => rowSum + row.quotedExcl, 0),
      0
    );
    const estimatedProfit = sumQuotedRevenue - sumQuotedCost;
    const projectedProfitInclBtw = projects.reduce((sum, project) => sum + project.projectedProfitInclBtw, 0);
    const projectedProfitAfterLaborMarginVat = projects.reduce((sum, project) => sum + project.projectedProfitAfterLaborMarginVat, 0);

    const sumActualCostKnown = withActual.reduce((sum, project) => sum + project.actualCostExcl, 0);
    const sumActualRevenueScope = withActual.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const actualProfitKnown = withActual.length > 0 ? sumActualRevenueScope - sumActualCostKnown : null;
    const actualMarginKnown =
      withActual.length > 0 && sumActualRevenueScope > 0 && actualProfitKnown !== null
        ? actualProfitKnown / sumActualRevenueScope
        : null;

    const bucketDefs = [
      {
        id: 'arbeid',
        label: 'Arbeid',
        keys: new Set<WinstCostCategoryKey>(['arbeid']),
      },
      {
        id: 'materiaal',
        label: 'Materiaal',
        keys: new Set<WinstCostCategoryKey>(['materialenGroot', 'materialenVerbruik']),
      },
      {
        id: 'transport',
        label: 'Transport',
        keys: new Set<WinstCostCategoryKey>(['transport']),
      },
      {
        id: 'overhead',
        label: 'Overhead',
        keys: new Set<WinstCostCategoryKey>(['overhead', 'materieel']),
      },
    ];

    const deviations = bucketDefs
      .map((bucket) => {
        const quoted = withActual.reduce(
          (sum, project) =>
            sum +
            project.costBreakdown
              .filter((row) => bucket.keys.has(row.key))
              .reduce((rowSum, row) => rowSum + row.quotedExcl, 0),
          0
        );
        const actual = withActual.reduce(
          (sum, project) =>
            sum +
            project.costBreakdown
              .filter((row) => bucket.keys.has(row.key))
              .reduce((rowSum, row) => rowSum + row.actualExcl, 0),
          0
        );
        const diff = actual - quoted;
        const diffPct = quoted > 0 ? diff / quoted : null;
        return {
          id: bucket.id,
          label: bucket.label,
          quoted,
          actual,
          diff,
          diffPct,
        };
      })
      .filter((row) => row.quoted > 0 || row.actual > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const totalQuotedHours = withActual.reduce((sum, project) => sum + project.quotedHours, 0);
    const totalActualHours = withActual.reduce((sum, project) => sum + project.actualHours, 0);
    const hoursDiffPct = totalQuotedHours > 0 ? (totalActualHours - totalQuotedHours) / totalQuotedHours : null;
    const totalQuotedDays = withActual.reduce((sum, project) => sum + project.quotedDays, 0);
    const totalActualDays = withActual.reduce((sum, project) => sum + project.actualDays, 0);
    const daysDiffPct = totalQuotedDays > 0 ? (totalActualDays - totalQuotedDays) / totalQuotedDays : null;

    const recommendationItems: string[] = [];
    if (withActual.length >= 2) {
      const arbeid = deviations.find((item) => item.id === 'arbeid');
      const materiaal = deviations.find((item) => item.id === 'materiaal');
      const transport = deviations.find((item) => item.id === 'transport');

      if (arbeid && arbeid.diffPct !== null && arbeid.diffPct > 0.1) {
        recommendationItems.push(
          `Arbeid ligt gemiddeld ${formatSignedPercent(arbeid.diffPct)} boven offerte.`
        );
      }

      if (materiaal && materiaal.diffPct !== null && materiaal.diffPct > 0.1) {
        recommendationItems.push(
          `Materiaalkosten lopen gemiddeld ${formatSignedPercent(materiaal.diffPct)} op.`
        );
      }

      if (transport && transport.diffPct !== null && transport.diffPct > 0.1) {
        recommendationItems.push(
          `Transport wordt gemiddeld ${formatSignedPercent(transport.diffPct)} onderschat.`
        );
      }

      if (hoursDiffPct !== null && hoursDiffPct > 0.1) {
        recommendationItems.push(
          `Werkelijke uren liggen ${formatSignedPercent(hoursDiffPct)} boven planning.`
        );
      }

      if (daysDiffPct !== null && daysDiffPct > 0.1) {
        recommendationItems.push(
          `Werkelijke dagen liggen ${formatSignedPercent(daysDiffPct)} boven offerte-inschatting.`
        );
      }
    }

    const projectRows: ProjectRowData[] = projects.map((project) => {
      const actualProjectProfit = project.hasActualData ? project.quotedRevenueIncl - project.actualCostExcl : null;
      const actualProjectMargin =
        actualProjectProfit !== null && project.quotedRevenueIncl > 0
          ? actualProjectProfit / project.quotedRevenueIncl
          : null;
      const quotedCostExcl = project.costBreakdown.reduce((sum, row) => sum + row.quotedExcl, 0);
      const expectedProjectProfit = project.quotedRevenueIncl - quotedCostExcl;
      const realizedProfitPerDay =
        actualProjectProfit !== null && project.actualDays > 0
          ? actualProjectProfit / project.actualDays
          : null;
      const expectedProfitPerDay =
        project.quotedDays > 0
          ? expectedProjectProfit / project.quotedDays
          : null;
      return {
        ...project,
        actualProjectProfit,
        actualProjectMargin,
        realizedProfitPerDay,
        expectedProfitPerDay,
      };
    });

    const totalActualDaysAllProjects = projects.reduce((sum, project) => sum + project.actualDays, 0);
    const realizedProfitPerDayOverall =
      actualProfitKnown !== null && totalActualDaysAllProjects > 0
        ? actualProfitKnown / totalActualDaysAllProjects
        : null;

    return {
      projects,
      withActual,
      sumQuotedRevenue,
      estimatedProfit,
      projectedProfitInclBtw,
      projectedProfitAfterLaborMarginVat,
      sumActualCostKnown,
      actualProfitKnown,
      actualMarginKnown,
      deviations,
      recommendationItems,
      projectRows,
      realizedProfitPerDayOverall,
    };
  }, [metrics]);

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    if (!term) return derived.projectRows;
    return derived.projectRows.filter((project) => {
      const target = `${project.title} ${project.clientName} ${project.offerteNummer || ''}`.toLowerCase();
      return target.includes(term);
    });
  }, [derived.projectRows, projectSearch]);

  const projectTotals = useMemo(() => {
    const totalOmzet = filteredProjects.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const totalQuotedCosts = filteredProjects.reduce(
      (sum, project) => sum + project.costBreakdown.reduce((rowSum, row) => rowSum + row.quotedExcl, 0),
      0
    );
    const projectsWithActual = filteredProjects.filter((project) => project.hasActualData);
    const actualRevenueScope = projectsWithActual.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const totalKosten = projectsWithActual.reduce((sum, project) => sum + project.actualCostExcl, 0);
    const marge = actualRevenueScope > 0 ? (actualRevenueScope - totalKosten) / actualRevenueScope : null;
    const totalActualDays = filteredProjects.reduce((sum, project) => sum + project.actualDays, 0);
    const totalQuotedDays = filteredProjects.reduce((sum, project) => sum + project.quotedDays, 0);
    const euroPerDay = totalActualDays > 0 && actualRevenueScope > 0
      ? (actualRevenueScope - totalKosten) / totalActualDays
      : null;
    const doelPerDay = totalQuotedDays > 0 ? (totalOmzet - totalQuotedCosts) / totalQuotedDays : null;

    return {
      totalOmzet,
      totalKosten,
      marge,
      euroPerDay,
      totalActualDays,
      totalQuotedDays,
      doelPerDay,
      hasActualCostData: projectsWithActual.length > 0,
    };
  }, [filteredProjects]);

  if (isUserLoading || !user || loadingMetrics || !metrics) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Dashboard" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-12">
          <section className="rounded-2xl bg-card/30 p-4 md:p-5">
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tabs value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
                <TabsList>
                  <TabsTrigger value="month">Per maand</TabsTrigger>
                  <TabsTrigger value="week">Per week</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={String(periodRange)} onValueChange={(value) => setPeriodRange(Number(value))}>
                <SelectTrigger className="w-[140px] border-border/60 bg-background/40">
                  <SelectValue placeholder="Periode" />
                </SelectTrigger>
                <SelectContent>
                  {periodType === 'month' ? (
                    <>
                      <SelectItem value="3">3 maanden</SelectItem>
                      <SelectItem value="6">6 maanden</SelectItem>
                      <SelectItem value="12">12 maanden</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="4">4 weken</SelectItem>
                      <SelectItem value="8">8 weken</SelectItem>
                      <SelectItem value="12">12 weken</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <FilterPopover
                title="Type klus"
                options={metrics.filterOptions.jobTypes}
                selected={selectedJobTypes}
                onChange={setSelectedJobTypes}
              />
              <FilterPopover
                title="Klant"
                options={metrics.filterOptions.clients}
                selected={selectedClientIds}
                onChange={setSelectedClientIds}
              />
              <FilterPopover
                title="Project"
                options={metrics.filterOptions.projects}
                selected={selectedProjectIds}
                onChange={setSelectedProjectIds}
              />
            </div>
          </section>

          {metricsError ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              Metrics fout: {metricsError}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500/[0.10] via-background/95 to-cyan-500/[0.06]">
            <div className="flex flex-wrap">
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Geoffreerde omzet"
                  value={formatCurrency(derived.sumQuotedRevenue)}
                  tone="warning"
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Winst na btw arbeid + marge"
                  value={formatCurrency(derived.projectedProfitAfterLaborMarginVat)}
                  tone={derived.projectedProfitAfterLaborMarginVat >= 0 ? 'positive' : 'negative'}
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Winst met arbeid + marge incl. btw"
                  value={formatCurrency(derived.projectedProfitInclBtw)}
                  tone={derived.projectedProfitInclBtw >= 0 ? 'positive' : 'negative'}
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Werkelijke winst"
                  value={derived.actualProfitKnown === null ? 'Onbekend' : formatCurrency(derived.actualProfitKnown)}
                  tone={
                    derived.actualProfitKnown === null
                      ? 'unknown'
                      : derived.actualProfitKnown >= 0
                        ? 'positive'
                        : 'negative'
                  }
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Ontvangen cash"
                  value={formatCurrency(metrics.totals.receivedCashIncl)}
                  tone="positive"
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label={`Omzetbelasting (${metrics.vatSummary.periodLabel})`}
                  value={formatCurrency(metrics.vatSummary.netVatPayable)}
                  tone={metrics.vatSummary.netVatPayable >= 0 ? 'warning' : 'positive'}
                />
                <KPIItem
                  className="basis-full border-b border-white/10 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/6 2xl:border-b-0"
                  label="Verdiensten per dag"
                  value={derived.realizedProfitPerDayOverall === null ? 'Onbekend' : formatCurrency(derived.realizedProfitPerDayOverall)}
                  tone={derived.realizedProfitPerDayOverall === null ? 'unknown' : 'neutral'}
                />
            </div>
            <div className="border-t border-white/10 px-5 py-3 sm:px-6">
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Werkelijke kosten</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{formatCurrency(derived.sumActualCostKnown)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Marge</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {derived.actualMarginKnown === null ? 'Onbekend' : formatPercent(derived.actualMarginKnown)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Ingevulde projecten</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{derived.withActual.length}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Werkelijke dagen</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{metrics.timeTracking.actualDays.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/[0.14] via-card/55 to-card/40 px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Offerte status (huidige selectie)</p>
                <span className="text-xs text-muted-foreground">{metrics.quoteStatusSummary.total} offertes</span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                {[
                  { key: 'concept', label: 'Concept', value: metrics.quoteStatusSummary.concept, valueClassName: 'text-muted-foreground' },
                  { key: 'in_behandeling', label: 'In behandeling', value: metrics.quoteStatusSummary.inBehandeling, valueClassName: 'text-blue-300' },
                  { key: 'verzonden', label: 'Verzonden', value: metrics.quoteStatusSummary.verzonden, valueClassName: 'text-cyan-300' },
                  { key: 'geaccepteerd', label: 'Geaccepteerd', value: metrics.quoteStatusSummary.geaccepteerd, valueClassName: 'text-emerald-300' },
                  { key: 'afgewezen', label: 'Afgewezen', value: metrics.quoteStatusSummary.afgewezen, valueClassName: 'text-red-300' },
                  { key: 'verlopen', label: 'Verlopen', value: metrics.quoteStatusSummary.verlopen, valueClassName: 'text-amber-300' },
                  { key: 'onbekend', label: 'Onbekend', value: metrics.quoteStatusSummary.onbekend, valueClassName: 'text-muted-foreground' },
                ].map((item) => (
                  <div key={item.key} className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                    <p className={cn('mt-0.5 text-sm font-semibold', item.valueClassName)}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Project prestaties</h2>
              <Input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Zoek project of klant"
                className="sm:w-72 border-border/60 bg-background/40"
              />
            </div>

            <div className="space-y-4">
              {filteredProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen projecten in deze selectie.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/[0.14] via-card/55 to-card/40 px-4 py-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Totaal (zichtbare projecten)</p>
                      <span className="text-xs text-muted-foreground">{filteredProjects.length} projecten</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Omzet incl. btw</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{formatCurrency(projectTotals.totalOmzet)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Kosten incl. btw</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {projectTotals.hasActualCostData ? formatCurrency(projectTotals.totalKosten) : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Marge</p>
                        <p
                          className={cn(
                            'mt-0.5 text-sm font-semibold',
                            projectTotals.marge === null
                              ? 'text-muted-foreground'
                              : projectTotals.marge < 0
                                ? 'text-red-300'
                                : 'text-emerald-300'
                          )}
                        >
                          {projectTotals.marge === null ? 'Onbekend' : formatPercent(projectTotals.marge)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">€/dag</p>
                        <p
                          className={cn(
                            'mt-0.5 text-sm font-semibold',
                            projectTotals.euroPerDay === null
                              ? 'text-muted-foreground'
                              : projectTotals.doelPerDay !== null && projectTotals.euroPerDay < projectTotals.doelPerDay
                                ? 'text-red-300'
                                : 'text-emerald-300'
                          )}
                        >
                          {projectTotals.euroPerDay === null ? 'Onbekend' : formatCurrency(projectTotals.euroPerDay)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Dagen</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {projectTotals.totalActualDays.toFixed(1)} / {projectTotals.totalQuotedDays.toFixed(1)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-background/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Doel €/dag</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {projectTotals.doelPerDay === null ? 'Onbekend' : formatCurrency(projectTotals.doelPerDay)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {filteredProjects.map((project) => (
                    <ProjectRow
                      key={project.projectId}
                      project={project}
                      onNavigate={router.push}
                      onEditHours={handleOpenHoursEditor}
                    />
                  ))}
                </>
              )}
            </div>
          </section>

        </div>
      </main>

      <Dialog
        open={Boolean(hoursEditorProject)}
        onOpenChange={(open) => {
          if (open || hoursSaving || hoursDeleting) return;
          setHoursEditorProject(null);
          setHoursEditingEntryId(null);
          setHoursEntryToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Uren bijwerken</DialogTitle>
            <DialogDescription>
              {hoursEditorProject
                ? `${hoursEditorProject.offerteNummer ? `#${hoursEditorProject.offerteNummer} • ` : ''}${hoursEditorProject.clientName}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {hoursEditingEntryId ? (
              <div className="flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs">
                <p className="text-cyan-100">Je bewerkt een bestaande urenregel.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-cyan-100 hover:text-cyan-50"
                  onClick={() => {
                    setHoursEditingEntryId(null);
                    setHoursEditorDate(format(new Date(), 'yyyy-MM-dd'));
                    setHoursEditorValue('');
                  }}
                  disabled={hoursSaving}
                >
                  Nieuwe invoer
                </Button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Datum</p>
                <Input
                  type="date"
                  value={hoursEditorDate}
                  onChange={(event) => setHoursEditorDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Uren</p>
                <Input
                  inputMode="decimal"
                  placeholder="Bijv. 7.5"
                  value={hoursEditorValue}
                  onChange={(event) => setHoursEditorValue(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Uren voor dit project</p>
              <p className="mt-1 text-xs text-muted-foreground">Gebruik het potlood om te bewerken en de prullenbak om te verwijderen.</p>
              {hoursHistoryLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">Laden...</p>
              ) : hoursHistory.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nog geen uren gevonden voor dit project.</p>
              ) : (
                <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {hoursHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={cn(
                        'flex items-center justify-between rounded-md border border-border/50 px-2.5 py-1.5 text-sm',
                        hoursEditingEntryId === entry.id && 'border-cyan-500/50 bg-cyan-500/10'
                      )}
                    >
                      <div>
                        <p className="text-muted-foreground">
                          {format(new Date(entry.date), 'd MMM yyyy', { locale: nl })}
                        </p>
                        {hoursEditingEntryId === entry.id ? (
                          <p className="text-[11px] font-medium text-cyan-200">Wordt nu bewerkt</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="min-w-16 text-right font-medium text-foreground">{entry.workedHours.toFixed(2)}u</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleStartEditHoursEntry(entry)}
                          disabled={hoursSaving || hoursDeleting}
                          title="Urenregel bewerken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-400"
                          onClick={() => setHoursEntryToDelete(entry)}
                          disabled={hoursSaving || hoursDeleting}
                          title="Urenregel verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setHoursEditorProject(null);
                setHoursEditingEntryId(null);
                setHoursEntryToDelete(null);
              }}
              disabled={hoursSaving || hoursDeleting}
            >
              Sluiten
            </Button>
            <Button type="button" onClick={() => void handleSaveProjectHours()} disabled={hoursSaving || hoursDeleting}>
              {hoursSaving ? 'Opslaan...' : hoursEditingEntryId ? 'Wijziging opslaan' : 'Uren opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(hoursEntryToDelete)}
        onOpenChange={(open) => {
          if (!open && !hoursDeleting) setHoursEntryToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Urenregel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {hoursEntryToDelete
                ? `${hoursEntryToDelete.workedHours.toFixed(2)} uur op ${formatProjectDate(hoursEntryToDelete.date)} wordt verwijderd.`
                : 'Deze urenregel wordt verwijderd.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="ghost" onClick={() => setHoursEntryToDelete(null)} disabled={hoursDeleting}>
              Annuleren
            </Button>
            <Button type="button" variant="destructiveSoft" onClick={() => void handleDeleteHoursEntry()} disabled={hoursDeleting}>
              {hoursDeleting ? 'Verwijderen...' : 'Verwijderen'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
