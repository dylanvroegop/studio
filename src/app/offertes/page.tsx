'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import {
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  List,
  Loader2,
  MoreHorizontal,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { addDays, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import { createEmptyQuote } from '@/lib/firestore-actions';
import { calculateQuoteTotals, normalizeDataJson, QuoteSettings as QuoteCalculationSettings } from '@/lib/quote-calculations';
import { getEffectiveQuoteStatus, invoiceImpliesAccepted } from '@/lib/quote-status';
import { buildGoogleMapsDirectionsUrl, resolveQuoteProjectAddress } from '@/lib/maps';
import { useQuoteWorkedHours } from '@/hooks/useQuoteWorkedHours';
import { formatHoursCompact, getQuoteDriveMinutes } from '@/lib/quote-time-summary';
import type { QuoteWithAddress } from '@/lib/tracking-analysis';
import type { InvoiceStatus, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';

type FilterMode = 'alle' | 'concept' | 'vandaag' | 'in_afwachting' | 'verzonden' | 'geaccepteerd' | 'werkbespreking' | 'archief';
const OFFERTES_FILTER_STORAGE_KEY = 'offertes:last-filter';
type DefaultFilterMode = 'concept' | 'geaccepteerd' | 'vandaag';
const OFFERTES_DEFAULT_FILTER_STORAGE_KEY = 'offertes:default-filter';
type TodayRangeMode = 'vandaag' | 'vandaag_en_morgen';
const OFFERTES_TODAY_RANGE_STORAGE_KEY = 'offertes:today-range';

const MOBILE_FILTER_ICONS: Record<FilterMode, LucideIcon> = {
  alle: List,
  concept: FileText,
  vandaag: CalendarDays,
  in_afwachting: Clock3,
  verzonden: Send,
  geaccepteerd: CheckCircle2,
  werkbespreking: CalendarDays,
  archief: Archive,
};

const MOBILE_FILTER_COLORS: Record<FilterMode, string> = {
  alle: 'text-slate-300 border-slate-400/35 bg-slate-400/10 hover:bg-slate-400/20',
  concept: 'text-blue-400 border-blue-400/40 bg-blue-400/10 hover:bg-blue-400/20',
  vandaag: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10 hover:bg-cyan-400/20',
  in_afwachting: 'text-amber-400 border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20',
  verzonden: 'text-violet-400 border-violet-400/40 bg-violet-400/10 hover:bg-violet-400/20',
  geaccepteerd: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20',
  werkbespreking: 'text-red-400 border-red-400/40 bg-red-400/10 hover:bg-red-400/20',
  archief: 'text-zinc-300 border-zinc-400/35 bg-zinc-400/10 hover:bg-zinc-400/20',
};

type QuoteRow = Quote & {
  id: string;
  createdAtDate: Date | null;
  updatedAtDate: Date | null;
  archived?: boolean;
  archivedAt?: Timestamp;
  archivedBy?: string;
  includeInDashboard?: boolean;
  amount?: number;
  totaalbedrag?: number;
  offerteNummer?: number;
  title?: string;
};

type QuoteRowWithDetails = QuoteRow & {
  data_json?: unknown;
  korteTitel?: unknown;
  klussen?: unknown;
  jobs?: unknown;
  werkbeschrijvingStructured?: unknown;
  werkbeschrijving_jobs?: unknown;
};

type InvoiceSyncRow = {
  id: string;
  quoteId?: string;
  status?: InvoiceStatus;
  archived?: boolean;
};

type Client = {
  id: string;
  userId?: string;
  voornaam?: string;
  achternaam?: string;
  bedrijfsnaam?: string;
  emailadres?: string;
  telefoonnummer?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  projectStraat?: string;
  projectHuisnummer?: string;
  projectPostcode?: string;
  projectPlaats?: string;
};

type PlanningListEntry = {
  id: string;
  quoteId?: string;
  planningType?: 'job' | 'werkbespreking';
  startDate: Date | null;
  endDate: Date | null;
  scheduledHours?: number;
  status?: string;
  isAllDay?: boolean;
  cache?: {
    clientName?: string;
    projectTitle?: string;
    projectAddress?: string;
  };
};

function isFilterMode(value: unknown): value is FilterMode {
  return (
    value === 'alle' ||
    value === 'concept' ||
    value === 'vandaag' ||
    value === 'in_afwachting' ||
    value === 'verzonden' ||
    value === 'geaccepteerd' ||
    value === 'werkbespreking' ||
    value === 'archief'
  );
}

function isDefaultFilterMode(value: unknown): value is DefaultFilterMode {
  return value === 'concept' || value === 'geaccepteerd' || value === 'vandaag';
}

function naarDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return null;
}

function formatCurrency(amount?: number): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDays(days: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(days);
}

function getKlantNaam(q: QuoteRow): string {
  const info = (q as any)?.klantinformatie;
  if (!info) return 'Onbekende klant';
  const bedrijfsnaam = (info?.bedrijfsnaam || '').trim();
  if (bedrijfsnaam) return bedrijfsnaam;
  const persoon = `${info?.voornaam || ''} ${info?.achternaam || ''}`.trim();
  return persoon || 'Onbekende klant';
}

function getTitel(q: QuoteRow): string {
  return (
    ((q as any)?.titel as string) ||
    ((q as any)?.title as string) ||
    ((q as any)?.werkomschrijving as string) ||
    '—'
  );
}

function getHoofdtitel(q: QuoteRow): string | null {
  const directeTitel = String((q as any)?.korteTitel || '').trim();
  if (directeTitel) return directeTitel;

  const rawDataJson = (q as any)?.data_json;
  if (rawDataJson && typeof rawDataJson === 'object') {
    const nested = String((rawDataJson as any)?.korteTitel || '').trim();
    if (nested) return nested;
  }

  if (typeof rawDataJson === 'string') {
    try {
      const parsed = JSON.parse(rawDataJson);
      const nested = String(parsed?.korteTitel || '').trim();
      if (nested) return nested;
    } catch {
      // ignore malformed json
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDataJsonValue(value: unknown): unknown {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cleanDisplayText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripPlanningPrefix(value: string): string {
  return value.replace(/^(werkbespreking|klus)\s*[·:-]\s*/i, '').trim();
}

function addUniqueText(target: string[], value: unknown): void {
  const text = stripPlanningPrefix(cleanDisplayText(value));
  if (!text || text === '—') return;
  if (!target.some((entry) => entry.toLowerCase() === text.toLowerCase())) {
    target.push(text);
  }
}

function addUniqueRawText(target: string[], value: unknown): void {
  const text = cleanDisplayText(value);
  if (!text || text === '—') return;
  if (!target.some((entry) => entry.toLowerCase() === text.toLowerCase())) {
    target.push(text);
  }
}

function collectStructuredJobTitles(source: unknown, target: string[]): void {
  if (!source) return;
  const value = parseDataJsonValue(source);
  if (!isPlainObject(value)) return;

  const jobSources = [
    value.jobs,
    value.werkbeschrijving_jobs,
    isPlainObject(value.werkbeschrijvingStructured) ? value.werkbeschrijvingStructured.jobs : null,
  ];

  jobSources.forEach((jobs) => {
    if (!Array.isArray(jobs)) return;
    jobs.forEach((job) => {
      if (!isPlainObject(job)) return;
      addUniqueText(target, job.title);
      addUniqueText(target, job.korteTitel);
      addUniqueText(target, job.summary);
      addUniqueText(target, job.context);
    });
  });
}

function getQuoteJobSummary(q: QuoteRow): string | null {
  const titles: string[] = [];
  const detailedQuote = q as QuoteRowWithDetails;
  const klussen = detailedQuote.klussen;

  if (isPlainObject(klussen)) {
    Object.values(klussen).forEach((job) => {
      if (!isPlainObject(job)) return;
      const info = isPlainObject(job.klusinformatie) ? job.klusinformatie : {};
      addUniqueText(titles, info.title);
      addUniqueText(titles, info.naam);
      addUniqueText(titles, info.label);
      addUniqueText(titles, info.type);
      addUniqueText(titles, job.title);
    });
  }

  const jobs = detailedQuote.jobs;
  if (Array.isArray(jobs)) {
    jobs.forEach((job) => {
      if (!isPlainObject(job)) return;
      const info = isPlainObject(job.klusinformatie) ? job.klusinformatie : {};
      addUniqueText(titles, job.title);
      addUniqueText(titles, info.title);
      addUniqueText(titles, info.type);
    });
  }

  collectStructuredJobTitles(detailedQuote.data_json, titles);
  collectStructuredJobTitles(detailedQuote.werkbeschrijvingStructured, titles);
  collectStructuredJobTitles({ jobs: detailedQuote.werkbeschrijving_jobs }, titles);

  if (titles.length === 0) return null;
  if (titles.length === 1) return titles[0];
  const visible = titles.slice(0, 2).join('; ');
  const extraCount = titles.length - 2;
  return extraCount > 0 ? `${visible}; +${extraCount} klus${extraCount === 1 ? '' : 'sen'}` : visible;
}

function formatPlanningDateRange(entry: PlanningListEntry): string {
  const start = entry.startDate;
  if (!start) return '';

  const dateLabel = format(start, 'd MMM yyyy', { locale: nl });
  if (entry.isAllDay) {
    const end = entry.endDate;
    const spansMultipleDays = end
      && (start.getFullYear() !== end.getFullYear()
        || start.getMonth() !== end.getMonth()
        || start.getDate() !== end.getDate());
    return spansMultipleDays
      ? `${dateLabel} - ${format(end, 'd MMM yyyy', { locale: nl })}, Hele dag`
      : `${dateLabel}, Hele dag`;
  }

  const startTime = format(start, 'HH:mm', { locale: nl });
  const endTime = entry.endDate ? format(entry.endDate, 'HH:mm', { locale: nl }) : '';

  if (entry.planningType === 'werkbespreking') {
    return endTime ? `${dateLabel}, ${startTime}-${endTime}` : `${dateLabel}, ${startTime}`;
  }

  const hours = typeof entry.scheduledHours === 'number' && Number.isFinite(entry.scheduledHours)
    ? `${entry.scheduledHours.toLocaleString('nl-NL')}u`
    : '';
  return [dateLabel, hours].filter(Boolean).join(' · ');
}

function isPlanningEntryOnDate(entry: PlanningListEntry, date: Date): boolean {
  if (entry.status === 'cancelled' || !entry.startDate) return false;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const start = entry.startDate.getTime();
  const end = (entry.endDate || entry.startDate).getTime();
  return start <= dayEnd.getTime() && end >= dayStart.getTime();
}

function getFirstPlanningEntryOnDate(entries: PlanningListEntry[] | undefined, date: Date): PlanningListEntry | null {
  return entries
    ?.filter((entry) => isPlanningEntryOnDate(entry, date))
    .sort((a, b) => (a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
}

function normalizePlanningClientName(value: string): string {
  return value
    .replace(/^\d{1,2}:\d{2}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function planningQuoteStatusPriority(status: Quote['status'] | undefined): number {
  switch (status) {
    case 'geaccepteerd': return 0;
    case 'in_afwachting': return 1;
    case 'verzonden': return 2;
    case 'concept': return 3;
    case 'in_behandeling': return 4;
    case 'werkbespreking': return 5;
    default: return 6;
  }
}

function selectPlanningQuoteMatch(quotes: QuoteRow[]): QuoteRow | null {
  return [...quotes].sort((a, b) => {
    const statusDifference = planningQuoteStatusPriority(a.status) - planningQuoteStatusPriority(b.status);
    if (statusDifference !== 0) return statusDifference;
    return (b.updatedAtDate?.getTime() ?? 0) - (a.updatedAtDate?.getTime() ?? 0);
  })[0] ?? null;
}

function findQuoteForUnlinkedPlanning(entry: PlanningListEntry, quotes: QuoteRow[]): QuoteRow | null {
  const planningName = normalizePlanningClientName(entry.cache?.clientName || entry.cache?.projectTitle || '');
  if (!planningName) return null;

  const activeQuotes = quotes.filter((quote) => !quote.archived);
  const exactMatches = activeQuotes.filter((quote) => normalizePlanningClientName(getKlantNaam(quote)) === planningName);
  if (exactMatches.length > 0) return selectPlanningQuoteMatch(exactMatches);

  const firstName = planningName.split(' ')[0];
  const firstNameMatches = activeQuotes.filter((quote) => {
    const quoteName = normalizePlanningClientName(getKlantNaam(quote));
    return quoteName.split(' ')[0] === firstName;
  });

  return selectPlanningQuoteMatch(firstNameMatches);
}

function isTodayRangeMode(value: unknown): value is TodayRangeMode {
  return value === 'vandaag' || value === 'vandaag_en_morgen';
}

function getFirstPlanningEntryInDateRange(
  entries: PlanningListEntry[] | undefined,
  dates: Date[],
): PlanningListEntry | null {
  return dates
    .map((date) => getFirstPlanningEntryOnDate(entries, date))
    .filter((entry): entry is PlanningListEntry => entry !== null)
    .sort((a, b) => (a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
}

function getPlanningSummary(entries: PlanningListEntry[] | undefined): string | null {
  if (!entries?.length) return null;

  const activeEntries = entries
    .filter((entry) => entry.status !== 'cancelled')
    .sort((a, b) => {
      const aTime = a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  if (!activeEntries.length) return null;

  const labels: string[] = [];
  activeEntries.forEach((entry) => {
    const typeLabel = entry.planningType === 'werkbespreking' ? 'Werkbespreking' : 'Klus';
    const title = stripPlanningPrefix(cleanDisplayText(entry.cache?.projectTitle));
    const dateRange = formatPlanningDateRange(entry);
    const detail = [title, dateRange].filter(Boolean).join(' · ');
    addUniqueRawText(labels, detail ? `${typeLabel}: ${detail}` : typeLabel);
  });

  if (!labels.length) return null;
  if (labels.length === 1) return labels[0];
  const visible = labels.slice(0, 2).join(' · ');
  const extraCount = labels.length - 2;
  return extraCount > 0 ? `${visible} · +${extraCount} planning${extraCount === 1 ? '' : 'en'}` : visible;
}

function getQuoteDetailSummary(q: QuoteRow, planningEntries?: PlanningListEntry[]): string | null {
  const jobSummary = getQuoteJobSummary(q);
  const planningSummary = getPlanningSummary(planningEntries);

  if (jobSummary && planningSummary) return `${jobSummary} · ${planningSummary}`;
  return jobSummary || planningSummary;
}

type OfferteStatusStyles = {
  label: string;
  badgeClass: string;
  sideBorderClass: string;
  rowTintClass: string;
};

function getOfferteStatusStyles(
  status: Quote['status'] | undefined,
  isCalculated: boolean,
  isArchived: boolean
): OfferteStatusStyles {
  if (isArchived) {
    return {
      label: 'Archief',
      badgeClass: 'bg-zinc-500/8 text-zinc-300/85 border-zinc-500/25',
      sideBorderClass: 'border-l-zinc-600/55',
      rowTintClass: 'bg-zinc-500/[0.04]',
    };
  }

  if (status === 'geaccepteerd') {
    return {
      label: 'Geaccepteerd',
      badgeClass: 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/25',
      sideBorderClass: 'border-l-emerald-400/70',
      rowTintClass: 'bg-emerald-500/[0.08]',
    };
  }

  if (status === 'afgewezen') {
    return {
      label: 'Afgewezen',
      badgeClass: 'bg-red-500/10 text-red-300/90 border-red-500/25',
      sideBorderClass: 'border-l-red-400/70',
      rowTintClass: 'bg-red-500/[0.07]',
    };
  }

  if (status === 'verzonden') {
    return {
      label: 'Verstuurd',
      badgeClass: 'bg-blue-500/10 text-blue-300/90 border-blue-500/25',
      sideBorderClass: 'border-l-blue-400/70',
      rowTintClass: 'bg-blue-500/[0.07]',
    };
  }

  if (status === 'in_afwachting') {
    return {
      label: 'In afwachting',
      badgeClass: 'bg-cyan-500/10 text-cyan-200/90 border-cyan-500/25',
      sideBorderClass: 'border-l-cyan-400/70',
      rowTintClass: 'bg-cyan-500/[0.07]',
    };
  }

  if (status === 'in_behandeling') {
    return isCalculated
      ? {
        label: 'Berekend',
        badgeClass: 'bg-violet-500/10 text-violet-200/90 border-violet-500/25',
        sideBorderClass: 'border-l-violet-400/70',
        rowTintClass: 'bg-violet-500/[0.08]',
      }
      : {
        label: 'Berekenen',
        badgeClass: 'bg-amber-500/10 text-amber-200/90 border-amber-500/25',
        sideBorderClass: 'border-l-amber-400/70',
        rowTintClass: 'bg-amber-500/[0.08]',
      };
  }

  if (status === 'werkbespreking') {
    return {
      label: 'Werkbespreking',
      badgeClass: 'bg-violet-500/10 text-violet-200/90 border-violet-500/25',
      sideBorderClass: 'border-l-violet-400/70',
      rowTintClass: 'bg-violet-500/[0.08]',
    };
  }

  return {
    label: 'Concept',
    badgeClass: 'bg-zinc-500/8 text-zinc-300/90 border-zinc-500/25',
    sideBorderClass: 'border-l-zinc-500/55',
    rowTintClass: 'bg-zinc-500/[0.05]',
  };
}

function hasCalculatedAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getStoredQuoteTotal(quote: QuoteRow): number {
  const raw = quote.totaalbedrag ?? quote.amount ?? 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function getQuoteReferenceDate(quote: QuoteRow): Date | null {
  return quote.updatedAtDate ?? quote.createdAtDate ?? null;
}

function getQuoteDisplayDate(quote: QuoteRow, planningEntries?: PlanningListEntry[]): Date | null {
  const plannedWerkbespreking = planningEntries
    ?.filter((entry) => entry.status !== 'cancelled' && entry.planningType === 'werkbespreking' && entry.startDate)
    .sort((a, b) => (a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];

  return plannedWerkbespreking?.startDate ?? getQuoteReferenceDate(quote);
}

function mapSettingsForTotals(input: unknown): QuoteCalculationSettings {
  const normalized = normalizeDataJson(input as any);
  const rawInst = (normalized?.instellingen || {}) as any;
  const rawExtras = (normalized?.extras || {}) as any;

  return {
    btwTarief: rawInst?.btwTarief || 21,
    uurTariefExclBtw: rawInst?.uurTariefExclBtw || rawInst?.uurTarief || 50,
    schattingUren: rawInst?.schattingUren ?? false,
    extras: {
      transport: {
        prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm,
        vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten,
        tunnelkosten: rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten,
        mode: rawExtras?.transport?.mode ?? rawInst?.extras?.transport?.mode,
      },
      winstMarge: {
        percentage: rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
        fixedAmount: rawExtras?.winstMarge?.fixedAmount ?? 0,
        mode: rawExtras?.winstMarge?.mode ?? 'percentage',
        basis: rawExtras?.winstMarge?.basis ?? 'totaal',
      },
    },
  };
}

function haalTotaalUitCalculatie(dataJson: unknown): number | null {
  if (!dataJson) return null;

  try {
    const settings = mapSettingsForTotals(dataJson);
    const totals = calculateQuoteTotals(dataJson as any, settings);
    const total = Number(totals?.totaalInclBtw || 0);
    if (Number.isFinite(total) && total > 0) return total;
  } catch (err) {
    console.warn('Kon totaal niet berekenen uit calculatie-data:', err);
  }

  const normalized = normalizeDataJson(dataJson as any) as any;
  const fallbackCandidates = [
    normalized?.totaalInclBtw,
    normalized?.totaal_incl_btw,
    normalized?.totals?.totaalInclBtw,
    normalized?.totals?.totaal_incl_btw,
    (dataJson as any)?.totaalInclBtw,
    (dataJson as any)?.totaal_incl_btw,
    (dataJson as any)?.totals?.totaalInclBtw,
    (dataJson as any)?.totals?.totaal_incl_btw,
  ];

  for (const candidate of fallbackCandidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function haalHoofdtitelUitCalculatie(dataJson: unknown): string | null {
  if (!dataJson) return null;

  const normalized = normalizeDataJson(dataJson as any) as any;
  const candidates = [
    normalized?.korteTitel,
    normalized?.korte_titel,
    (dataJson as any)?.korteTitel,
    (dataJson as any)?.korte_titel,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }

  return null;
}

function toQuoteKlantinformatie(client: Client): Record<string, unknown> {
  const projectStraat = (client.projectStraat || '').trim();
  const projectHuisnummer = (client.projectHuisnummer || '').trim();
  const projectPostcode = (client.projectPostcode || '').trim();
  const projectPlaats = (client.projectPlaats || '').trim();
  const hasProjectAddress = !!(projectStraat || projectHuisnummer || projectPostcode || projectPlaats);
  const emailadres = (client.emailadres || '').trim();

  return {
    klanttype: (client.bedrijfsnaam || '').trim() ? 'Zakelijk' : 'Particulier',
    voornaam: (client.voornaam || '').trim(),
    achternaam: (client.achternaam || '').trim(),
    bedrijfsnaam: (client.bedrijfsnaam || '').trim(),
    emailadres,
    'e-mailadres': emailadres,
    telefoonnummer: (client.telefoonnummer || '').trim(),
    straat: (client.straat || '').trim(),
    huisnummer: (client.huisnummer || '').trim(),
    postcode: (client.postcode || '').trim(),
    plaats: (client.plaats || '').trim(),
    factuuradres: {
      straat: (client.straat || '').trim(),
      huisnummer: (client.huisnummer || '').trim(),
      postcode: (client.postcode || '').trim(),
      plaats: (client.plaats || '').trim(),
    },
    afwijkendProjectadres: hasProjectAddress,
    projectStraat,
    projectHuisnummer,
    projectPostcode,
    projectPlaats,
    projectadres: {
      straat: projectStraat || null,
      huisnummer: projectHuisnummer || null,
      postcode: projectPostcode || null,
      plaats: projectPlaats || null,
    },
  };
}

export default function OffertesPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [hoofdtitelsByQuoteId, setHoofdtitelsByQuoteId] = useState<Record<string, string>>({});
  const [planningEntriesByQuoteId, setPlanningEntriesByQuoteId] = useState<Record<string, PlanningListEntry[]>>({});
  const [isInitialHoofdtitelSyncDone, setIsInitialHoofdtitelSyncDone] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceSyncRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('alle');
  const [defaultFilter, setDefaultFilter] = useState<DefaultFilterMode>('concept');
  const [filterPreferencesHydrated, setFilterPreferencesHydrated] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [todayRangeMode, setTodayRangeMode] = useState<TodayRangeMode>('vandaag');
  const [unlinkedPlanningEntries, setUnlinkedPlanningEntries] = useState<PlanningListEntry[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const creatingQuoteRef = useRef(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<QuoteRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [updatingAcceptanceQuoteId, setUpdatingAcceptanceQuoteId] = useState<string | null>(null);
  const [updatingDashboardQuoteId, setUpdatingDashboardQuoteId] = useState<string | null>(null);
  const [profitByQuoteId, setProfitByQuoteId] = useState<Record<string, number>>({});
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const workedHoursByQuoteId = useQuoteWorkedHours(quotes as QuoteWithAddress[]);
  const isSyncingTotalsRef = useRef(false);
  const isSyncingHoofdtitelsRef = useRef(false);
  const fetchedHoofdtitelIdsRef = useRef<Set<string>>(new Set());
  const didCompleteInitialHoofdtitelSyncRef = useRef(false);

  useEffect(() => {
    if (!firestore || !user) {
      setHoursPerDay(8);
      return;
    }

    return onSnapshot(doc(firestore, 'users', user.uid), (snapshot) => {
      const configuredHours = Number(snapshot.data()?.settings?.planningSettings?.defaultWorkdayHours);
      setHoursPerDay(Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 8);
    }, () => {
      setHoursPerDay(8);
    });
  }, [firestore, user]);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setFilterPreferencesHydrated(true);
      return;
    }

    const storedDefaultFilter = window.localStorage.getItem(OFFERTES_DEFAULT_FILTER_STORAGE_KEY);
    if (isDefaultFilterMode(storedDefaultFilter)) {
      setDefaultFilter(storedDefaultFilter);
      setFilter(storedDefaultFilter);
      setFilterPreferencesHydrated(true);
      return;
    }

    const storedFilter = window.localStorage.getItem(OFFERTES_FILTER_STORAGE_KEY);
    if (isFilterMode(storedFilter)) {
      setFilter(storedFilter);
    }

    setFilterPreferencesHydrated(true);
  }, []);

  useEffect(() => {
    if (!filterPreferencesHydrated) return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OFFERTES_FILTER_STORAGE_KEY, filter);
  }, [filter, filterPreferencesHydrated]);

  useEffect(() => {
    if (!filterPreferencesHydrated) return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OFFERTES_DEFAULT_FILTER_STORAGE_KEY, defaultFilter);
  }, [defaultFilter, filterPreferencesHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTodayRange = window.localStorage.getItem(OFFERTES_TODAY_RANGE_STORAGE_KEY);
    if (isTodayRangeMode(storedTodayRange)) {
      setTodayRangeMode(storedTodayRange);
    }
  }, []);

  useEffect(() => {
    if (!user || !firestore) return;

    setLoading(true);
    setError(null);

    const ref = collection(firestore, 'quotes');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((docSnap) => {
            const raw = docSnap.data() as any;
            return {
              ...(raw as QuoteRow),
              id: docSnap.id,
              createdAtDate: naarDate(raw?.createdAt),
              updatedAtDate: naarDate(raw?.updatedAt),
            } as QuoteRow;
          })
          .filter((quote) => (quote as any).isCalculationTest !== true);

        data.sort((a, b) => {
          const aNum = typeof a.offerteNummer === 'number' ? a.offerteNummer : 0;
          const bNum = typeof b.offerteNummer === 'number' ? b.offerteNummer : 0;
          return bNum - aNum;
        });

        setQuotes(data);
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij ophalen offertes:', err);
        setError(`${err.code ?? 'error'}: ${err.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [firestore, user]);

  useEffect(() => {
    if (!createOpen || !user || !firestore) return;

    (async () => {
      try {
        const ref = collection(firestore, 'clients');
        const q = query(ref, where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Client));
        arr.sort((a, b) => {
          const aName = `${a.voornaam || ''} ${a.achternaam || ''} ${a.bedrijfsnaam || ''}`.trim().toLowerCase();
          const bName = `${b.voornaam || ''} ${b.achternaam || ''} ${b.bedrijfsnaam || ''}`.trim().toLowerCase();
          return aName.localeCompare(bName);
        });
        setClients(arr);
      } catch (e) {
        console.error('Fout bij ophalen klanten:', e);
      }
    })();
  }, [createOpen, firestore, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    const ref = collection(firestore, 'invoices');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as any;
          return {
            id: docSnap.id,
            quoteId: raw?.quoteId,
            status: raw?.status,
            archived: !!raw?.archived,
          } as InvoiceSyncRow;
        });
        setInvoices(data);
      },
      (err: any) => {
        console.warn('Fout bij ophalen factuurstatus voor offertes:', err);
      }
    );

    return () => unsub();
  }, [firestore, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    const ref = collection(firestore, 'planning_entries');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const grouped: Record<string, PlanningListEntry[]> = {};
        const unlinked: PlanningListEntry[] = [];

        snapshot.docs.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const quoteId = cleanDisplayText(raw.quoteId);
          const cache = isPlainObject(raw.cache) ? raw.cache : null;

          const entry: PlanningListEntry = {
            id: docSnap.id,
            quoteId: quoteId || undefined,
            planningType: raw.planningType === 'werkbespreking' ? 'werkbespreking' : 'job',
            startDate: naarDate(raw.startDate),
            endDate: naarDate(raw.endDate),
            scheduledHours: Number(raw.scheduledHours),
            status: cleanDisplayText(raw.status),
            isAllDay: raw.isAllDay === true,
            cache: cache
              ? {
                clientName: cleanDisplayText(cache.clientName),
                projectTitle: cleanDisplayText(cache.projectTitle),
                projectAddress: cleanDisplayText(cache.projectAddress),
              }
              : undefined,
          };

          if (quoteId) {
            grouped[quoteId] = [...(grouped[quoteId] || []), entry];
          } else {
            unlinked.push(entry);
          }
        });

        setPlanningEntriesByQuoteId(grouped);
        setUnlinkedPlanningEntries(unlinked);
      },
      (err: unknown) => {
        console.warn('Fout bij ophalen planninginformatie voor offertes:', err);
      }
    );

    return () => unsub();
  }, [firestore, user]);

  const pendingQuoteIds = useMemo(
    () => {
      return quotes
        .filter((q) => {
          if (q.status !== 'in_behandeling' && q.status !== 'concept') return false;
          if (q.archived) return false;

          const storedTotal = getStoredQuoteTotal(q);
          const calculatedFromDoc = haalTotaalUitCalculatie((q as any)?.data_json);

          if (!hasCalculatedAmount(storedTotal) && hasCalculatedAmount(calculatedFromDoc)) {
            return true;
          }

          if (hasCalculatedAmount(storedTotal) && hasCalculatedAmount(calculatedFromDoc)) {
            return Math.abs(storedTotal - calculatedFromDoc) > 0.01;
          }

          return !hasCalculatedAmount(storedTotal);
        })
        .map((q) => q.id);
    },
    [quotes]
  );

  const acceptedQuoteIdsFromInvoices = useMemo(() => {
    const ids = new Set<string>();
    invoices.forEach((invoice) => {
      if (invoice.archived) return;
      if (!invoice.quoteId) return;
      if (!invoiceImpliesAccepted(invoice.status)) return;
      ids.add(invoice.quoteId);
    });
    return ids;
  }, [invoices]);

  useEffect(() => {
    if (!user || !firestore || pendingQuoteIds.length === 0) return;

    let cancelled = false;

    const syncPendingTotals = async () => {
      if (isSyncingTotalsRef.current || cancelled) return;

        const quoteIdsToCheck = pendingQuoteIds;
        if (!quoteIdsToCheck.length) return;

        // First pass: try to repair totals directly from quote.data_json (freshest local source).
        const unresolvedQuoteIds: string[] = [];
        for (const quoteId of quoteIdsToCheck) {
          const quote = quotes.find((entry) => entry.id === quoteId);
          if (!quote) {
            unresolvedQuoteIds.push(quoteId);
            continue;
          }

          const localCalculatedTotal = haalTotaalUitCalculatie((quote as any)?.data_json);
          if (!hasCalculatedAmount(localCalculatedTotal)) {
            unresolvedQuoteIds.push(quoteId);
            continue;
          }

          const storedTotal = getStoredQuoteTotal(quote);
          if (Math.abs(storedTotal - localCalculatedTotal) <= 0.01) {
            continue;
          }

          try {
            await updateDoc(doc(firestore, 'quotes', quoteId), {
              totaalbedrag: localCalculatedTotal,
              amount: localCalculatedTotal,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn(`Kon lokaal quote totaal niet syncen voor ${quoteId}:`, err);
            unresolvedQuoteIds.push(quoteId);
          }
        }

        if (unresolvedQuoteIds.length === 0 || cancelled) return;

        isSyncingTotalsRef.current = true;

        try {
          const token = await user.getIdToken();
        const response = await fetch('/api/quotes/get-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteIds: unresolvedQuoteIds }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) return;

        const data = Array.isArray(payload.rows)
          ? (payload.rows as Array<{ quoteid: string; data_json: unknown }>)
          : [];
        if (!data.length) return;

        const rowsByQuote = new Map<string, Array<{ data_json: unknown }>>();
        for (const row of data) {
          if (!row?.quoteid) continue;
          const existing = rowsByQuote.get(row.quoteid) || [];
          existing.push({ data_json: row.data_json });
          rowsByQuote.set(row.quoteid, existing);
        }

        for (const quoteId of unresolvedQuoteIds) {
          const rows = rowsByQuote.get(quoteId) || [];
          let totalFromCalculation: number | null = null;

          for (const row of rows) {
            totalFromCalculation = haalTotaalUitCalculatie(row.data_json);
            if (hasCalculatedAmount(totalFromCalculation)) break;
          }

          if (!hasCalculatedAmount(totalFromCalculation) || cancelled) continue;

          try {
            await updateDoc(doc(firestore, 'quotes', quoteId), {
              totaalbedrag: totalFromCalculation,
              amount: totalFromCalculation,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn(`Kon quote totaal niet syncen voor ${quoteId}:`, err);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Kon pending quote totalen niet ophalen:', err);
        }
      } finally {
        isSyncingTotalsRef.current = false;
      }
    };

    void syncPendingTotals();
    const intervalId = setInterval(() => {
      void syncPendingTotals();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [firestore, pendingQuoteIds, quotes, user]);

  const quoteTotalsById = useMemo(() => {
    const map: Record<string, number> = {};
    quotes.forEach((quote) => {
      const calculatedFromDoc = haalTotaalUitCalculatie((quote as any)?.data_json);
      const stored = getStoredQuoteTotal(quote);
      map[quote.id] = hasCalculatedAmount(calculatedFromDoc) ? calculatedFromDoc : stored;
    });
    return map;
  }, [quotes]);

  useEffect(() => {
    if (!user || quotes.length === 0) return;

    let cancelled = false;
    const loadQuoteProfits = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/winst/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            periodType: 'month',
            periodRange: 60,
            projectIds: quotes.map((quote) => quote.id),
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: {
            projectPerformances?: Array<{
              projectId: string;
              quotedRevenueIncl: number;
              actualCostExcl: number;
              hasActualData: boolean;
              hourlyWorkMaterialPassthrough?: boolean;
              costBreakdown?: Array<{ key: string; quotedExcl: number }>;
            }>;
          };
        } | null;
        if (!response.ok || !payload?.ok || !payload.data?.projectPerformances || cancelled) return;

        const nextProfits: Record<string, number> = {};
        payload.data.projectPerformances.forEach((project) => {
          if (!project.hasActualData) return;
          const materialPassthroughExcl = (project.costBreakdown || [])
            .filter((row) => row.key === 'materialenGroot' || row.key === 'materialenVerbruik')
            .reduce((sum, row) => sum + row.quotedExcl, 0);
          const adjustedRevenue = project.hourlyWorkMaterialPassthrough
            ? Math.max(0, project.quotedRevenueIncl - materialPassthroughExcl)
            : project.quotedRevenueIncl;
          const profit = adjustedRevenue - project.actualCostExcl;
          if (Number.isFinite(profit)) nextProfits[project.projectId] = profit;
        });
        setProfitByQuoteId(nextProfits);
      } catch (error) {
        console.warn('Kon winst per offerte niet laden:', error);
      }
    };

    void loadQuoteProfits();
    return () => {
      cancelled = true;
    };
  }, [quotes, user]);

  useEffect(() => {
    if (!firestore || acceptedQuoteIdsFromInvoices.size === 0 || quotes.length === 0) return;

    const quoteIdsToPromote = quotes
      .filter((quote) => acceptedQuoteIdsFromInvoices.has(quote.id) && quote.status !== 'geaccepteerd')
      .map((quote) => quote.id);

    if (quoteIdsToPromote.length === 0) return;

    let cancelled = false;

    const promoteQuotes = async () => {
      for (let i = 0; i < quoteIdsToPromote.length; i += 450) {
        if (cancelled) return;
        const chunk = quoteIdsToPromote.slice(i, i + 450);
        const batch = writeBatch(firestore);
        chunk.forEach((quoteId) => {
          batch.update(doc(firestore, 'quotes', quoteId), {
            status: 'geaccepteerd',
            updatedAt: serverTimestamp(),
          } as any);
        });
        await batch.commit();
      }
    };

    void promoteQuotes().catch((err) => {
      console.warn('Kon quote status niet automatisch op geaccepteerd zetten:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [acceptedQuoteIdsFromInvoices, firestore, quotes]);

  useEffect(() => {
    if (!user || quotes.length === 0) return;

    let cancelled = false;

    const quoteIdsToCheck = quotes
      .filter((q) => {
        if (getHoofdtitel(q)) return false;
        if (hoofdtitelsByQuoteId[q.id]) return false;
        if (fetchedHoofdtitelIdsRef.current.has(q.id)) return false;
        return true;
      })
      .map((q) => q.id);

    if (quoteIdsToCheck.length === 0) {
      if (!didCompleteInitialHoofdtitelSyncRef.current) {
        didCompleteInitialHoofdtitelSyncRef.current = true;
        setIsInitialHoofdtitelSyncDone(true);
      }
      return;
    }

    const syncHoofdtitels = async () => {
      if (isSyncingHoofdtitelsRef.current || cancelled) return;
      isSyncingHoofdtitelsRef.current = true;

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/quotes/get-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteIds: quoteIdsToCheck }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) return;

        const data = Array.isArray(payload.rows)
          ? (payload.rows as Array<{ quoteid: string; data_json: unknown }>)
          : [];

        if (cancelled) return;

        const nextTitles: Record<string, string> = {};
        for (const row of data) {
          if (!row?.quoteid) continue;
          const title = haalHoofdtitelUitCalculatie(row.data_json);
          if (title) nextTitles[row.quoteid] = title;
        }

        quoteIdsToCheck.forEach((id) => fetchedHoofdtitelIdsRef.current.add(id));

        if (Object.keys(nextTitles).length > 0) {
          setHoofdtitelsByQuoteId((prev) => ({ ...prev, ...nextTitles }));
        }

      } catch (err) {
        if (!cancelled) {
          console.warn('Kon hoofdtitels niet ophalen uit calculaties:', err);
        }
      } finally {
        isSyncingHoofdtitelsRef.current = false;
        if (!cancelled && !didCompleteInitialHoofdtitelSyncRef.current) {
          didCompleteInitialHoofdtitelSyncRef.current = true;
          setIsInitialHoofdtitelSyncDone(true);
        }
      }
    };

    void syncHoofdtitels();

    return () => {
      cancelled = true;
    };
  }, [quotes, user, hoofdtitelsByQuoteId]);

  useEffect(() => {
    if (loading) return;
    if (didCompleteInitialHoofdtitelSyncRef.current) return;
    if (!user || quotes.length === 0) {
      didCompleteInitialHoofdtitelSyncRef.current = true;
      setIsInitialHoofdtitelSyncDone(true);
    }
  }, [loading, quotes.length, user]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    quotes.forEach((quote) => {
      const date = getQuoteReferenceDate(quote);
      if (!date) return;
      years.add(date.getFullYear());
    });
    const sorted = Array.from(years).sort((a, b) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  }, [quotes]);

  useEffect(() => {
    if (yearOptions.length === 0) return;
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0]);
    }
  }, [selectedYear, yearOptions]);

  const quotesForSelectedYear = useMemo(() => {
    return quotes.filter((quote) => {
      const date = getQuoteReferenceDate(quote);
      if (!date) return false;
      return date.getFullYear() === selectedYear;
    });
  }, [quotes, selectedYear]);

  const todaysPlanningEntryByQuoteId = useMemo(() => {
    const today = new Date();
    const dates = todayRangeMode === 'vandaag_en_morgen' ? [today, addDays(today, 1)] : [today];
    const entriesByQuoteId: Record<string, PlanningListEntry> = {};

    quotes.forEach((quote) => {
      if (quote.archived) return;
      const entry = getFirstPlanningEntryInDateRange(planningEntriesByQuoteId[quote.id], dates);
      if (entry) entriesByQuoteId[quote.id] = entry;
    });

    unlinkedPlanningEntries
      .filter((entry) => dates.some((date) => isPlanningEntryOnDate(entry, date)))
      .sort((a, b) => (a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER))
      .forEach((entry) => {
        const quote = findQuoteForUnlinkedPlanning(entry, quotes);
        if (quote && !entriesByQuoteId[quote.id]) entriesByQuoteId[quote.id] = entry;
      });

    return entriesByQuoteId;
  }, [planningEntriesByQuoteId, quotes, todayRangeMode, unlinkedPlanningEntries]);

  const todaysQuotes = useMemo(() => {
    return quotes
      .filter((quote) => todaysPlanningEntryByQuoteId[quote.id])
      .sort((a, b) => {
        const aEntry = todaysPlanningEntryByQuoteId[a.id];
        const bEntry = todaysPlanningEntryByQuoteId[b.id];
        return (aEntry?.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (bEntry?.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
      });
  }, [quotes, todaysPlanningEntryByQuoteId]);

  const filterCountsByMode = useMemo(() => {
    const countFor = (mode: FilterMode): number => {
      if (mode === 'vandaag') return todaysQuotes.length;
      if (mode === 'archief') {
        return quotesForSelectedYear.filter((q) => !!q.archived).length;
      }

      const nonArchived = quotesForSelectedYear.filter((q) => !q.archived);
      if (mode === 'alle') return nonArchived.length;
      if (mode === 'concept') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'concept').length;
      }
      if (mode === 'in_afwachting') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'in_afwachting').length;
      }
      if (mode === 'verzonden') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'verzonden').length;
      }
      if (mode === 'geaccepteerd') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'geaccepteerd').length;
      }
      if (mode === 'werkbespreking') {
        return nonArchived.filter((q) => q.status === 'werkbespreking').length;
      }
      return 0;
    };

    return {
      alle: countFor('alle'),
      concept: countFor('concept'),
      vandaag: countFor('vandaag'),
      in_afwachting: countFor('in_afwachting'),
      verzonden: countFor('verzonden'),
      geaccepteerd: countFor('geaccepteerd'),
      werkbespreking: countFor('werkbespreking'),
      archief: countFor('archief'),
    } as Record<FilterMode, number>;
  }, [quotesForSelectedYear, acceptedQuoteIdsFromInvoices, todaysQuotes]);

  const filteredQuotes = useMemo(() => {
    const s = search.trim().toLowerCase();
    let result = filter === 'vandaag' ? [...todaysQuotes] : [...quotesForSelectedYear];

    if (filter === 'vandaag') {
      // Vandaag is gebaseerd op planning_entries en staat los van het gekozen offertejaar.
    } else if (filter === 'archief') {
      result = result.filter((q) => !!q.archived);
    } else {
      result = result.filter((q) => !q.archived);
      if (filter === 'concept') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'concept');
      if (filter === 'in_afwachting') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'in_afwachting');
      if (filter === 'verzonden') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'verzonden');
      if (filter === 'geaccepteerd') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'geaccepteerd');
      if (filter === 'werkbespreking') result = result.filter((q) => q.status === 'werkbespreking');
    }

    if (!s) return result;
    return result.filter((q) => {
      const klant = getKlantNaam(q).toLowerCase();
      const nr = typeof q.offerteNummer === 'number' ? String(q.offerteNummer) : '';
      const titel = (getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || getTitel(q)).toLowerCase();
      const detail = (getQuoteDetailSummary(q, planningEntriesByQuoteId[q.id]) || '').toLowerCase();
      return klant.includes(s) || nr.includes(s) || titel.includes(s) || detail.includes(s);
    });
  }, [filter, quotesForSelectedYear, todaysQuotes, search, acceptedQuoteIdsFromInvoices, hoofdtitelsByQuoteId, planningEntriesByQuoteId]);

  const filteredClients = useMemo(() => {
    const s = clientSearch.trim().toLowerCase();
    if (!s) return clients.slice(0, 40);
    return clients
      .filter((c) => {
        const name = `${c.voornaam || ''} ${c.achternaam || ''} ${c.bedrijfsnaam || ''}`.toLowerCase();
        const email = (c.emailadres || '').toLowerCase();
        const city = (c.plaats || '').toLowerCase();
        return name.includes(s) || email.includes(s) || city.includes(s);
      })
      .slice(0, 40);
  }, [clientSearch, clients]);

  async function ensureManualQuoteData(quoteId: string): Promise<void> {
    if (!user) return;

    const token = await user.getIdToken();
    const response = await fetch('/api/quotes/ensure-data-json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quoteId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.message || 'Kon lege offerte-data niet initialiseren.');
    }
  }

  async function handleCreateEmptyQuote(options?: { withSelectedClient?: boolean; selectedClientId?: string }): Promise<void> {
    if (!user || !firestore || creatingQuoteRef.current) return;
    const withSelectedClient = !!options?.withSelectedClient;
    const explicitSelectedClientId = options?.selectedClientId || null;
    creatingQuoteRef.current = true;
    setCreatingQuote(true);
    try {
      const quoteId = await createEmptyQuote(firestore, user.uid);

      if (withSelectedClient) {
        const clientIdToUse = explicitSelectedClientId || selectedClientId;
        const selectedClient = clientIdToUse
          ? clients.find((client) => client.id === clientIdToUse)
          : null;
        if (selectedClient) {
          await updateDoc(doc(firestore, 'quotes', quoteId), {
            klantinformatie: toQuoteKlantinformatie(selectedClient),
            updatedAt: serverTimestamp(),
          } as any);
        }
      }

      await ensureManualQuoteData(quoteId);

      setCreateOpen(false);
      setSelectedClientId(null);
      setClientSearch('');
      router.push(`/offertes/${quoteId}`);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon geen offerte aanmaken.'}`);
    } finally {
      creatingQuoteRef.current = false;
      setCreatingQuote(false);
    }
  }

  async function handleCreateQuoteWithNewClient(): Promise<void> {
    if (!user || !firestore || creatingQuoteRef.current) return;
    creatingQuoteRef.current = true;
    setCreatingQuote(true);
    try {
      const quoteId = await createEmptyQuote(firestore, user.uid);
      await ensureManualQuoteData(quoteId);

      setCreateOpen(false);
      setSelectedClientId(null);
      setClientSearch('');

      const successRedirect = encodeURIComponent(`/offertes/${quoteId}`);
      router.push(`/offertes/${quoteId}/klant?successRedirect=${successRedirect}`);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon geen offerte aanmaken.'}`);
    } finally {
      creatingQuoteRef.current = false;
      setCreatingQuote(false);
    }
  }

  async function setQuoteDecisionStatus(
    quote: QuoteRow,
    nextStatus: 'geaccepteerd' | 'afgewezen' | 'concept' | 'in_afwachting' | 'verzonden'
  ): Promise<void> {
    if (!firestore) return;
    setUpdatingAcceptanceQuoteId(quote.id);
    setError(null);
    try {
      await updateDoc(doc(firestore, 'quotes', quote.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      console.error('Kon offerte status niet wijzigen:', e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon status niet wijzigen.'}`);
    } finally {
      setUpdatingAcceptanceQuoteId(null);
    }
  }

  async function toggleQuoteDashboardSelection(quote: QuoteRow): Promise<void> {
    if (!firestore || updatingDashboardQuoteId) return;
    setUpdatingDashboardQuoteId(quote.id);
    setError(null);
    try {
      await updateDoc(doc(firestore, 'quotes', quote.id), {
        includeInDashboard: quote.includeInDashboard !== true,
        dashboardSelectionUpdatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      console.error('Kon dashboard selectie niet wijzigen:', e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon dashboard selectie niet wijzigen.'}`);
    } finally {
      setUpdatingDashboardQuoteId(null);
    }
  }

  const handleSelectExistingClient = (clientId: string): void => {
    if (creatingQuoteRef.current) return;
    setSelectedClientId(clientId);
    void handleCreateEmptyQuote({ withSelectedClient: true, selectedClientId: clientId });
  };

  function openArchiveDialog(quote: QuoteRow): void {
    setArchiveTarget(quote);
    setArchiveOpen(true);
  }

  async function restoreQuote(quote: QuoteRow): Promise<void> {
    if (!user || !firestore) return;
    try {
      const ref = doc(firestore, 'quotes', quote.id);
      await updateDoc(ref, {
        archived: false,
        archivedAt: deleteField(),
        archivedBy: deleteField(),
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon offerte niet herstellen.'}`);
    }
  }

  async function confirmArchive(): Promise<void> {
    if (!user || !firestore || !archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const planningSnapshot = await getDocs(
        query(
          collection(firestore, 'planning_entries'),
          where('userId', '==', user.uid),
          where('quoteId', '==', archiveTarget.id),
        ),
      );

      if (!planningSnapshot.empty) {
        for (let index = 0; index < planningSnapshot.docs.length; index += 400) {
          const batch = writeBatch(firestore);
          planningSnapshot.docs.slice(index, index + 400).forEach((planningDoc) => {
            batch.delete(planningDoc.ref);
          });
          await batch.commit();
        }
      }

      const ref = doc(firestore, 'quotes', archiveTarget.id);
      await updateDoc(ref, {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user.uid,
        updatedAt: serverTimestamp(),
      } as any);
      setArchiveOpen(false);
      setArchiveTarget(null);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon offerte niet archiveren.'}`);
    } finally {
      setArchiving(false);
    }
  }

  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const LoadingListPanel = () => (
    <div className="flex flex-col items-center justify-center py-14 gap-5">
      <div className="relative">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400/90" />
        <div className="absolute inset-0 blur-xl bg-amber-500/20 rounded-full animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-amber-300 font-medium tracking-wide">OFFERTES LADEN</div>
        <div className="text-muted-foreground text-sm animate-pulse">
          Even geduld afrubelen...
        </div>
      </div>
    </div>
  );

  const filterOptions: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: 'alle', label: 'Alle', count: filterCountsByMode.alle },
    { value: 'geaccepteerd', label: 'Geaccepteerd', count: filterCountsByMode.geaccepteerd },
    { value: 'concept', label: 'Concept', count: filterCountsByMode.concept },
    { value: 'vandaag', label: 'Vandaag', count: filterCountsByMode.vandaag },
    { value: 'in_afwachting', label: 'Afwachten', count: filterCountsByMode.in_afwachting },
    { value: 'verzonden', label: 'Verzonden', count: filterCountsByMode.verzonden },
    { value: 'werkbespreking', label: 'Werkbespreking', count: filterCountsByMode.werkbespreking },
  ];

  const mobileFilterOptions: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: 'werkbespreking', label: 'Werkbespreking', count: filterCountsByMode.werkbespreking },
    { value: 'concept', label: 'Concept', count: filterCountsByMode.concept },
    { value: 'vandaag', label: 'Vandaag', count: filterCountsByMode.vandaag },
    { value: 'geaccepteerd', label: 'Geaccepteerd', count: filterCountsByMode.geaccepteerd },
    { value: 'alle', label: 'Alle', count: filterCountsByMode.alle },
    { value: 'in_afwachting', label: 'Afwachten', count: filterCountsByMode.in_afwachting },
    { value: 'verzonden', label: 'Verzonden', count: filterCountsByMode.verzonden },
  ];

  const defaultFilterLabel = defaultFilter === 'geaccepteerd'
    ? 'Geaccepteerd'
    : defaultFilter === 'vandaag'
      ? 'Vandaag'
      : 'Concept';

  function handleDefaultFilterSelect(nextDefaultFilter: DefaultFilterMode): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(OFFERTES_DEFAULT_FILTER_STORAGE_KEY, nextDefaultFilter);
      window.localStorage.setItem(OFFERTES_FILTER_STORAGE_KEY, nextDefaultFilter);
    }
    setDefaultFilter(nextDefaultFilter);
    setFilter(nextDefaultFilter);
  }

  function handleTodayRangeModeSelect(nextTodayRangeMode: TodayRangeMode): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(OFFERTES_TODAY_RANGE_STORAGE_KEY, nextTodayRangeMode);
    }
    setTodayRangeMode(nextTodayRangeMode);
  }

  const TodayFilterSettings = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full border-border/70 bg-background/50"
          aria-label="Instellingen voor Vandaag-filter"
          title="Instellingen voor Vandaag-filter"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>
          Vandaag: {todayRangeMode === 'vandaag_en_morgen' ? 'vandaag + morgen' : 'alleen vandaag'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleTodayRangeModeSelect('vandaag')}>
          Alleen vandaag {todayRangeMode === 'vandaag' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTodayRangeModeSelect('vandaag_en_morgen')}>
          Vandaag + morgen {todayRangeMode === 'vandaag_en_morgen' ? '✓' : ''}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <div className="hidden sm:block">
        <DashboardHeader user={user} title="Offertes" />
      </div>

      <main className="flex flex-col items-center p-4 pb-24 md:px-6 md:pb-10 md:pt-6">
        <div className="w-full max-w-5xl space-y-5">
          <div className="sm:hidden space-y-2.5">
            <div className="flex items-center justify-between pl-12 pr-1 pt-1">
              <h1 className="text-xl font-semibold text-foreground">Offertes</h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-border/80 bg-card/70"
                    aria-label={`Standaardfilter: ${defaultFilterLabel}`}
                    title={`Standaardfilter: ${defaultFilterLabel}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Standaardfilter: {defaultFilterLabel}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDefaultFilterSelect('concept')}>
                    Concept {defaultFilter === 'concept' ? '(actief)' : ''}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDefaultFilterSelect('geaccepteerd')}>
                    Geaccepteerd {defaultFilter === 'geaccepteerd' ? '(actief)' : ''}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDefaultFilterSelect('vandaag')}>
                    Vandaag {defaultFilter === 'vandaag' ? '(actief)' : ''}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op klant, offertennummer of titel..."
                className="h-10 rounded-xl pl-10"
              />
            </div>

            <div className="-mx-4 overflow-x-auto pb-1">
              <div className="flex w-max items-center gap-2 px-4">
                {mobileFilterOptions.map((option) => (
                  <div key={`mobile-${option.value}`} className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFilter(option.value)}
                      aria-label={`${option.label}: ${option.count}`}
                      title={`${option.label}: ${option.count}`}
                      className={cn(
                        'relative h-9 w-9 shrink-0 rounded-full border p-0 transition-all duration-200 active:scale-[0.96]',
                        MOBILE_FILTER_COLORS[option.value],
                        filter === option.value ? 'shadow-[0_0_14px_currentColor] ring-1 ring-current' : 'opacity-65'
                      )}
                    >
                      {(() => {
                        const Icon = MOBILE_FILTER_ICONS[option.value];
                        return <Icon className="h-4 w-4" aria-hidden="true" />;
                      })()}
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-background px-1 text-[9px] font-bold leading-none text-foreground">
                        {option.count}
                      </span>
                    </Button>
                    {option.value === 'vandaag' ? <TodayFilterSettings /> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="hidden sm:block">
            <CardContent className="space-y-4 pt-5">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Zoek op klant, offertenummer of titel..."
                    className="pl-9"
                  />
                </div>

                <select
                  value={String(selectedYear)}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-10 rounded-md border border-border/70 bg-background/70 px-3 text-sm text-foreground"
                >
                  {yearOptions.map((year) => (
                    <option key={`desktop-year-${year}`} value={year}>
                      Jaar {year}
                    </option>
                  ))}
                </select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="h-10 shrink-0 border-border/70">
                      Standaard: {defaultFilterLabel}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Open offertes standaard op</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('concept')}>
                      Concept {defaultFilter === 'concept' ? '(actief)' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('geaccepteerd')}>
                      Geaccepteerd {defaultFilter === 'geaccepteerd' ? '(actief)' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('vandaag')}>
                      Vandaag {defaultFilter === 'vandaag' ? '(actief)' : ''}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" className="h-10 shrink-0 gap-2 px-4 hidden sm:inline-flex">
                      <Plus className="h-4 w-4" />
                      Nieuwe offerte
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Nieuwe offerte</DialogTitle>
                      <DialogDescription>
                        Kies een bestaande klant of voeg een nieuwe klant toe. De offerte zelf start leeg.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                      <Input
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Zoek klanten op naam, e-mail of plaats..."
                      />

                      <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                        {filteredClients.length === 0 ? (
                          <div className="text-sm text-muted-foreground p-3">Geen klanten gevonden.</div>
                        ) : (
                          filteredClients.map((c) => {
                            const name = `${c.voornaam || ''} ${c.achternaam || ''}`.trim() || c.bedrijfsnaam || 'Onbekende klant';
                            const isSelected = selectedClientId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectExistingClient(c.id)}
                                className={cn(
                                  'w-full rounded-lg border p-3 text-left transition-colors',
                                  isSelected
                                    ? 'border-cyan-500/50 bg-cyan-500/10'
                                    : 'border-border/50 bg-background/30 hover:bg-background/50'
                                )}
                              >
                                <div className="font-semibold text-sm">{name}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {[c.emailadres, c.telefoonnummer, c.plaats].filter(Boolean).join(' • ') || '—'}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="success"
                          className="h-10"
                          onClick={() => {
                            void handleCreateQuoteWithNewClient();
                          }}
                          disabled={creatingQuote}
                        >
                          {creatingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Nieuwe klant toevoegen
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  type="button"
                  size="icon"
                  variant={filter === 'archief' ? 'default' : 'outline'}
                  className={cn(
                    'h-10 w-10 shrink-0',
                    filter === 'archief' && 'bg-cyan-500/90 text-white hover:bg-cyan-400',
                  )}
                  onClick={() => setFilter('archief')}
                  aria-label="Archief"
                  title="Archief"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {filterOptions.map((option) => (
                  <div key={option.value} className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      variant={filter === option.value ? 'default' : 'ghost'}
                      onClick={() => setFilter(option.value)}
                      className={cn(
                        'h-9 rounded-full px-4 transition-all duration-200 active:scale-[0.98]',
                        filter === option.value
                          ? 'bg-cyan-500/90 text-white hover:bg-cyan-400'
                          : 'border border-border/70 bg-transparent text-muted-foreground/85 hover:border-cyan-500/25 hover:bg-cyan-500/8 hover:text-cyan-200'
                      )}
                    >
                      {option.value === 'vandaag' ? <CalendarDays className="mr-1 h-3.5 w-3.5" /> : null}
                      <span>{option.label}</span>
                      <span className={cn(
                        'ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                        filter === option.value ? 'bg-black/20 text-white' : 'bg-muted/50 text-foreground/80'
                      )}>
                        {option.count}
                      </span>
                    </Button>
                    {option.value === 'vandaag' ? <TodayFilterSettings /> : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {loading || !isInitialHoofdtitelSyncDone ? (
            <Card>
              <CardContent className="p-6">
                <LoadingListPanel />
              </CardContent>
            </Card>
          ) : filteredQuotes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">
                  {filter === 'archief'
                    ? 'Geen gearchiveerde offertes gevonden'
                    : filter === 'vandaag'
                      ? 'Geen afspraken voor vandaag'
                      : 'Geen offertes gevonden'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {filter === 'archief'
                    ? 'Archiveer een offerte om die hier te zien.'
                    : filter === 'vandaag'
                      ? 'Plan een klus of werkbespreking in om die hier automatisch te zien.'
                      : 'Maak een nieuwe lege offerte om te starten.'}
                </div>
                {filter !== 'archief' && filter !== 'vandaag' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-200"
                    onClick={() => setCreateOpen(true)}
                  >
                    Nieuwe offerte
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="space-y-3 sm:hidden">
              {filteredQuotes.map((q) => {
                const totaal = quoteTotalsById[q.id] ?? getStoredQuoteTotal(q);
                const hasCalculated = typeof totaal === 'number' && Number.isFinite(totaal) && totaal > 0;
                const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
                const todayEntry = filter === 'vandaag'
                  ? todaysPlanningEntryByQuoteId[q.id]
                  : null;
                const datum = todayEntry?.startDate ?? getQuoteDisplayDate(q, planningEntriesByQuoteId[q.id]);
                const nrLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                const klant = getKlantNaam(q);
                const hoofdTitel = getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || null;
                const fallbackTitel = getTitel(q);
                const detailSummary = getQuoteDetailSummary(q, planningEntriesByQuoteId[q.id]);
                const rowDescription = detailSummary || hoofdTitel || (fallbackTitel !== '—' ? fallbackTitel : null);
                const isArchived = !!q.archived;
                const acceptedByInvoice = acceptedQuoteIdsFromInvoices.has(q.id);
                const isUpdatingAcceptance = updatingAcceptanceQuoteId === q.id;
                const isIncludedInDashboard = q.includeInDashboard === true;
                const isDashboardEligible = !isArchived && effectiveStatus === 'geaccepteerd';
                const isUpdatingDashboard = updatingDashboardQuoteId === q.id;
                const statusStyles = getOfferteStatusStyles(effectiveStatus, hasCalculated, isArchived);
                const showUncalculatedPlaceholder = !hasCalculated && (effectiveStatus === 'in_behandeling' || effectiveStatus === 'concept');
                const amountLabel = showUncalculatedPlaceholder ? 'Nog niet berekend' : formatCurrency(totaal);
                const quoteProfit = profitByQuoteId[q.id];
                const hasQuoteProfit = typeof quoteProfit === 'number' && Number.isFinite(quoteProfit);
                const todaySummary = workedHoursByQuoteId[q.id];
                const todayWorkedHours = todaySummary?.workedHours || 0;
                const driveMinutes = getQuoteDriveMinutes((q as QuoteRowWithDetails).data_json, { laborHoursPerDay: hoursPerDay });
                const routeDestinationAddress = resolveQuoteProjectAddress(q);
                const routeMapsUrl = buildGoogleMapsDirectionsUrl(routeDestinationAddress);

                return (
                  <div
                    key={`mobile-${q.id}`}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border border-l-[3px] border-border/80 px-3 py-2.5 shadow-sm transition-all duration-150 active:scale-[0.995]',
                      statusStyles.sideBorderClass,
                      statusStyles.rowTintClass
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/offertes/${q.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/offertes/${q.id}`);
                      }
                    }}
                  >
                    <div className="relative z-10 space-y-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-[15px] font-bold text-foreground">{klant}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70">
                        <span className="truncate">{nrLabel}</span>
                        <span className="opacity-40">•</span>
                        <span>{datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                      </div>
                      {todayWorkedHours > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                          <Clock3 className="h-3.5 w-3.5" />
                          Vandaag: {formatHoursCompact(todayWorkedHours)} gewerkt
                          {driveMinutes > 0 ? ` + ${formatHoursCompact(driveMinutes / 60)} rijden` : ''}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5 tabular-nums">
                          <div className={cn('truncate text-lg font-bold', showUncalculatedPlaceholder ? 'text-blue-300' : 'text-blue-400')}>
                          {showUncalculatedPlaceholder ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                              {amountLabel}
                            </span>
                          ) : (
                            amountLabel
                          )}
                          </div>
                          {hasQuoteProfit ? (
                            <div className="truncate text-sm font-semibold text-emerald-400">
                              Winst {formatCurrency(quoteProfit)}
                            </div>
                          ) : null}
                        </div>
                        <div className="relative z-20 flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!routeMapsUrl}
                            className="h-8 gap-1.5 px-2"
                            aria-label={routeMapsUrl ? `Route naar ${routeDestinationAddress}` : 'Geen adres beschikbaar'}
                            title={routeMapsUrl ? `Route naar ${routeDestinationAddress}` : 'Geen adres beschikbaar'}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (routeMapsUrl) {
                                window.open(routeMapsUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            <Navigation className="h-4 w-4" />
                            Route
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 rounded-lg border border-border/70 bg-background/40 transition-all duration-150 hover:bg-muted/50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Meer acties</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuLabel>Offerte acties</DropdownMenuLabel>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'geaccepteerd');
                                }}
                              >
                                Status: Geaccepteerd
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'afgewezen');
                                }}
                              >
                                Status: Afgewezen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'verzonden');
                                }}
                              >
                                Status: Verstuurd
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'in_afwachting');
                                }}
                              >
                                Status: In afwachting
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'concept');
                                }}
                              >
                                Status: Concept
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!isDashboardEligible || isUpdatingDashboard}
                                onSelect={() => {
                                  if (!isDashboardEligible || isUpdatingDashboard) return;
                                  void toggleQuoteDashboardSelection(q);
                                }}
                              >
                                <BarChart3 className="mr-2 h-4 w-4" />
                                {isIncludedInDashboard ? 'Niet in dashboard' : 'Gebruik voor dashboard'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isArchived ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    void restoreQuote(q);
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Herstellen
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    openArchiveDialog(q);
                                  }}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archiveren
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden space-y-2 sm:block">
              {filteredQuotes.map((q) => {
                const totaal = quoteTotalsById[q.id] ?? getStoredQuoteTotal(q);
                const hasCalculated = typeof totaal === 'number' && Number.isFinite(totaal) && totaal > 0;
                const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
                const todayEntry = filter === 'vandaag'
                  ? todaysPlanningEntryByQuoteId[q.id]
                  : null;
                const datum = todayEntry?.startDate ?? getQuoteDisplayDate(q, planningEntriesByQuoteId[q.id]);
                const nrLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                const klant = getKlantNaam(q);
                const hoofdTitel = getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || null;
                const fallbackTitel = getTitel(q);
                const detailSummary = getQuoteDetailSummary(q, planningEntriesByQuoteId[q.id]);
                const rowDescription = detailSummary || hoofdTitel || (fallbackTitel !== '—' ? fallbackTitel : null);
                const isArchived = !!q.archived;
                const acceptedByInvoice = acceptedQuoteIdsFromInvoices.has(q.id);
                const isUpdatingAcceptance = updatingAcceptanceQuoteId === q.id;
                const isIncludedInDashboard = q.includeInDashboard === true;
                const isDashboardEligible = !isArchived && effectiveStatus === 'geaccepteerd';
                const isUpdatingDashboard = updatingDashboardQuoteId === q.id;
                const statusStyles = getOfferteStatusStyles(effectiveStatus, hasCalculated, isArchived);
                const showUncalculatedPlaceholder = !hasCalculated && (effectiveStatus === 'in_behandeling' || effectiveStatus === 'concept');
                const amountLabel = showUncalculatedPlaceholder ? 'Nog niet berekend' : formatCurrency(totaal);
                const quoteProfit = profitByQuoteId[q.id];
                const hasQuoteProfit = typeof quoteProfit === 'number' && Number.isFinite(quoteProfit);
                const todaySummary = workedHoursByQuoteId[q.id];
                const todayWorkedHours = todaySummary?.workedHours || 0;
                const driveMinutes = getQuoteDriveMinutes((q as QuoteRowWithDetails).data_json, { laborHoursPerDay: hoursPerDay });
                const amountClass = cn(
                  'text-2xl font-bold tabular-nums',
                  showUncalculatedPlaceholder ? 'text-blue-300' : 'text-blue-400'
                );
                const amountMobileClass = cn(
                  'mt-2 text-xl font-bold tabular-nums',
                  showUncalculatedPlaceholder ? 'text-blue-300' : 'text-blue-400'
                );

                return (
                  <div
                    key={`desktop-${q.id}`}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border border-l-[3px] border-border/80 px-4 py-3 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md active:scale-[0.997] sm:px-5',
                      statusStyles.sideBorderClass,
                      statusStyles.rowTintClass
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/offertes/${q.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/offertes/${q.id}`);
                      }
                    }}
                  >
                    <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 pointer-events-none">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-base font-bold text-foreground sm:text-lg">{klant}</div>
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', statusStyles.badgeClass)}>
                            {statusStyles.label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/70 sm:text-sm">
                          <span className="truncate">{nrLabel}</span>
                          <span className="opacity-40">•</span>
                          <span>{datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                        </div>
                        {rowDescription ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground/90">{rowDescription}</div>
                        ) : null}
                        {todayWorkedHours > 0 ? (
                          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                            <Clock3 className="h-3.5 w-3.5" />
                            Vandaag: {formatHoursCompact(todayWorkedHours)} gewerkt
                            {driveMinutes > 0 ? ` + ${formatHoursCompact(driveMinutes / 60)} rijden` : ''}
                          </div>
                        ) : null}
                        <div className={cn('sm:hidden', amountMobileClass)}>
                          {showUncalculatedPlaceholder ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                              {amountLabel}
                            </span>
                          ) : (
                            amountLabel
                          )}
                        </div>
                      </div>

                      <div className="relative z-20 flex items-center gap-1 sm:gap-4">
                        <div className="hidden min-w-[160px] text-right sm:block">
                          <div className={amountClass}>
                            {showUncalculatedPlaceholder ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                                {amountLabel}
                              </span>
                            ) : (
                              amountLabel
                            )}
                          </div>
                          {hasQuoteProfit ? (
                            <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400">
                              Winst {formatCurrency(quoteProfit)}
                            </div>
                          ) : null}
                        </div>

                        <Button
                          variant="default"
                          size="sm"
                          className="h-9 gap-2 border border-emerald-400/40 bg-emerald-500/25 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.22)] transition-all duration-150 hover:bg-emerald-500/35 hover:text-white active:scale-[0.98]"
                          aria-label="Open offerte"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            router.push(`/offertes/${q.id}`);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Bekijk offerte
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isDashboardEligible || isUpdatingDashboard}
                          className={cn(
                            'h-9 w-9 shrink-0 p-0 transition-all duration-150 active:scale-[0.98]',
                            isIncludedInDashboard
                              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-100'
                              : 'border-red-400/50 bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:text-red-100',
                          )}
                          aria-pressed={isIncludedInDashboard}
                          aria-label={isIncludedInDashboard ? 'Niet gebruiken voor dashboard' : 'Gebruik voor dashboard'}
                          title={isDashboardEligible ? undefined : 'Alleen geaccepteerde offertes tellen mee in dashboard'}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (!isDashboardEligible || isUpdatingDashboard) return;
                            void toggleQuoteDashboardSelection(q);
                          }}
                        >
                          {isUpdatingDashboard ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BarChart3 className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 rounded-lg border border-border/70 bg-background/40 transition-all duration-150 hover:bg-muted/50"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Meer acties</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuLabel>Offerte acties</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'geaccepteerd');
                              }}
                            >
                              Status: Geaccepteerd
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'afgewezen');
                              }}
                            >
                              Status: Afgewezen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'verzonden');
                              }}
                            >
                              Status: Verstuurd
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'in_afwachting');
                              }}
                            >
                              Status: In afwachting
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'concept');
                              }}
                            >
                              Status: Concept
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!isDashboardEligible || isUpdatingDashboard}
                              onSelect={() => {
                                if (!isDashboardEligible || isUpdatingDashboard) return;
                                void toggleQuoteDashboardSelection(q);
                              }}
                            >
                              <BarChart3 className="mr-2 h-4 w-4" />
                              {isIncludedInDashboard ? 'Niet in dashboard' : 'Gebruik voor dashboard'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isArchived ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  void restoreQuote(q);
                                }}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Herstellen
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => {
                                  openArchiveDialog(q);
                                }}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                Archiveren
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </main>

      <div className="fixed bottom-5 right-4 z-40 flex items-center gap-2 sm:hidden">
        <Button
          type="button"
          size="icon"
          variant={filter === 'archief' ? 'default' : 'outline'}
          className={cn(
            'h-12 w-12 rounded-full shadow-lg',
            filter === 'archief' && 'bg-cyan-500/90 text-white hover:bg-cyan-400',
          )}
          onClick={() => setFilter('archief')}
          aria-label="Archief"
          title="Archief"
        >
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          className="h-12 gap-2 rounded-full px-4 shadow-lg shadow-cyan-900/30"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Nieuwe offerte
        </Button>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Offerte archiveren?</AlertDialogTitle>
              <AlertDialogDescription>
                Deze offerte wordt verplaatst naar het archief. Je kunt dit later ongedaan maken via het archief.
                {archiveTarget ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">
                      {archiveTarget.offerteNummer ? `Offerte #${archiveTarget.offerteNummer}` : 'Offerte'}
                    </span>
                    <span className="opacity-30 mx-2">•</span>
                    <span>{getKlantNaam(archiveTarget)}</span>
                  </div>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel disabled={archiving} className="rounded-xl">
                Annuleren
              </AlertDialogCancel>
              <Button
                type="button"
                onClick={confirmArchive}
                disabled={archiving}
                variant="destructiveSoft"
              >
                {archiving ? 'Archiveren...' : 'Archiveren'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
