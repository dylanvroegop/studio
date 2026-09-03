'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Camera,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  Receipt,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Timestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { KostenPdfTab } from '@/components/kosten/KostenPdfTab';
import { BankOverzichtContent } from '@/components/finance/BankOverzichtContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  PROJECT_COST_CATEGORY_LABELS,
  normalizeProjectCostCategory,
  roundEuro,
  type ProjectCostCategory,
  type ProjectCostLineItem,
  type ProjectCostReceiptFile,
  type ProjectCostRow,
} from '@/lib/project-costs';
import { invoiceImpliesAccepted } from '@/lib/quote-status';
import type { InvoiceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type CostFilterMode = 'alle' | ProjectCostCategory;
type EntryMode = 'manual' | 'upload';
type KostenViewMode =
  | 'kosten'
  | 'pdfs'
  | 'overview'
  | 'finance-costs'
  | 'invoices'
  | 'quotes'
  | 'projects'
  | 'analysis'
  | 'bouwmaat'
  | 'knab-account'
  | 'bunq-personal';

const KOSTEN_PAGE_TABS: Array<{ value: KostenViewMode; label: string; financeTab?: string }> = [
  { value: 'kosten', label: 'Kosten' },
  { value: 'pdfs', label: 'PDF-bestanden' },
  { value: 'overview', label: 'Overzicht', financeTab: 'overview' },
  { value: 'finance-costs', label: 'Kosten', financeTab: 'costs' },
  { value: 'invoices', label: 'Facturen', financeTab: 'invoices' },
  { value: 'quotes', label: 'Offertes', financeTab: 'quotes' },
  { value: 'projects', label: 'Projecten', financeTab: 'projects' },
  { value: 'analysis', label: 'Analyse', financeTab: 'analysis' },
  { value: 'bouwmaat', label: 'Bouwmaat', financeTab: 'bouwmaat' },
  { value: 'knab-account', label: 'Vroegop Timmerwerken', financeTab: 'knab-account' },
  { value: 'bunq-personal', label: 'bunq personal', financeTab: 'bunq-personal' },
];

function isKostenViewMode(value: string | null): value is KostenViewMode {
  return KOSTEN_PAGE_TABS.some((tab) => tab.value === value);
}

type QuoteOption = {
  id: string;
  offerteNummer: number | null;
  totalInclBtw: number | null;
  clientName: string;
  title: string;
  label: string;
  searchable: string;
};

type KostenFormState = {
  category: ProjectCostCategory;
  supplierName: string;
  description: string;
  offerteId: string;
  date: string;
  btwPercentage: number;
  amountExcl: number;
  manualOverride: boolean;
  receiptUrl: string;
  receiptFiles: ProjectCostReceiptFile[];
};

type ExtractedCostData = {
  supplier_name?: string;
  description?: string;
  line_items?: ProjectCostLineItem[];
  amount_excl_btw?: number;
  btw_percentage?: number;
  btw_amount?: number;
  amount_incl_btw?: number;
  manual_amount_override?: boolean;
  date?: string;
  offerte_reference?: string | null;
  offerte_id?: string | null;
  suggested_category?: ProjectCostCategory;
  receipt_url?: string;
  receipt_files?: ProjectCostReceiptFile[];
  extraction_warning?: string;
};

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchText(value: unknown): string {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getCostAmountSearchText(cost: ProjectCostRow): string {
  return [cost.amount_excl_btw, cost.btw_amount, cost.amount_incl_btw]
    .flatMap((amount) => {
      const value = safeNumber(amount);
      return [
        formatCurrency(value),
        value.toFixed(2),
        value.toFixed(2).replace('.', ','),
        String(value),
      ];
    })
    .join(' ');
}

function isBankTransactionCost(cost: ProjectCostRow): boolean {
  return cost.status === 'bank_transaction'
    || cost.status === 'internal_profit_transfer'
    || cost.id.startsWith('bank-bunq-topup-');
}

function isPrivateBankTransactionCost(cost: ProjectCostRow): boolean {
  return isBankTransactionCost(cost) && cost.payment_type === 'private';
}

function isInternalProfitTransferCost(cost: ProjectCostRow): boolean {
  return cost.status === 'internal_profit_transfer' || cost.category === 'profit';
}

function isHistoricalSourceCost(cost: ProjectCostRow): boolean {
  return cost.status === 'historical_source_cost';
}

function formatDateLabel(value: string): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

async function optimizeReceiptImageForUpload(file: File): Promise<File> {
  const mime = safeString(file.type).toLowerCase();
  if (!mime.startsWith('image/')) return file;

  const shouldConvert = mime === 'image/heic' || mime === 'image/heif' || file.size > 4 * 1024 * 1024;
  if (!shouldConvert || typeof window === 'undefined') return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Kon foto niet verwerken.'));
      img.src = objectUrl;
    });

    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });
    if (!blob) return file;

    const originalName = safeString(file.name) || `receipt-${Date.now()}`;
    const baseName = originalName.replace(/\.[^.]+$/, '') || `receipt-${Date.now()}`;
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return null;
}

function getClientName(rawQuote: Record<string, unknown>): string {
  const klantInfo = (rawQuote.klantinformatie || {}) as Record<string, unknown>;
  const companyName = safeString(klantInfo.bedrijfsnaam);
  if (companyName) return companyName;
  const firstName = safeString(klantInfo.voornaam);
  const lastName = safeString(klantInfo.achternaam);
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Onbekende klant';
}

function getQuoteTitle(rawQuote: Record<string, unknown>): string {
  return (
    safeString(rawQuote.titel)
    || safeString(rawQuote.title)
    || safeString(rawQuote.werkomschrijving)
    || 'Project'
  );
}

function getQuoteTotalInclBtw(rawQuote: Record<string, unknown>): number | null {
  const candidates = [
    rawQuote.totaalbedrag,
    rawQuote.amount,
    rawQuote.totaalInclBtw,
    (rawQuote.totals as Record<string, unknown> | undefined)?.totaalInclBtw,
  ];

  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100;
  }

  return null;
}

function getQuoteSearchable(rawQuote: Record<string, unknown>, docId: string, label: string, clientName: string, title: string, offerteNummer: number | null): string {
  const klantInfo = (rawQuote.klantinformatie || {}) as Record<string, unknown>;
  const candidateParts = [
    label,
    clientName,
    title,
    docId,
    typeof offerteNummer === 'number' ? String(offerteNummer) : '',
    safeString(rawQuote.offerteNummer),
    safeString(rawQuote.title),
    safeString(rawQuote.titel),
    safeString(rawQuote.werkomschrijving),
    safeString(rawQuote.projectNaam),
    safeString(rawQuote.klantNaam),
    safeString(rawQuote.klantnaam),
    safeString(rawQuote.klant),
    safeString(rawQuote.clientName),
    safeString(klantInfo.bedrijfsnaam),
    safeString(klantInfo.voornaam),
    safeString(klantInfo.achternaam),
    safeString(klantInfo.naam),
  ].filter(Boolean);

  return normalizeSearchText(candidateParts.join(' '));
}

function createDefaultFormState(): KostenFormState {
  return {
    category: 'materiaal',
    supplierName: '',
    description: '',
    offerteId: '',
    date: new Date().toISOString().slice(0, 10),
    btwPercentage: 21,
    amountExcl: 0,
    manualOverride: false,
    receiptUrl: '',
    receiptFiles: [],
  };
}

function createEmptyLineItem(): ProjectCostLineItem {
  return {
    description: '',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
    total_price: 0,
    category: 'materiaal',
    offerte_id: null,
  };
}

function normalizeLineItem(item: ProjectCostLineItem): ProjectCostLineItem {
  const quantity = safeNumber(item.quantity);
  const unitPrice = safeNumber(item.unit_price);
  const explicitTotal = roundEuro(safeNumber(item.total_price));
  const explicitTotalIncl = roundEuro(safeNumber(item.total_incl_btw));
  const hasExplicitBtwPercentage = item.btw_percentage !== undefined && Number.isFinite(safeNumber(item.btw_percentage));
  const category = normalizeProjectCostCategory(item.category || 'materiaal');
  const offerteId = safeString(item.offerte_id) || null;
  return {
    description: safeString(item.description),
    quantity,
    unit: safeString(item.unit) || 'st',
    unit_price: roundEuro(unitPrice),
    total_price: explicitTotal !== 0 ? explicitTotal : roundEuro(quantity * unitPrice),
    ...(explicitTotalIncl !== 0 ? { total_incl_btw: explicitTotalIncl } : {}),
    ...(hasExplicitBtwPercentage ? { btw_percentage: roundEuro(safeNumber(item.btw_percentage)) } : {}),
    category,
    offerte_id: offerteId,
  };
}

function hasLineItemContent(item: ProjectCostLineItem): boolean {
  const normalized = normalizeLineItem(item);
  return Boolean(
    normalized.description
    || normalized.quantity !== 1
    || normalized.unit !== 'st'
    || normalized.unit_price !== 0
    || normalized.total_price !== 0
    || normalized.total_incl_btw !== undefined
  );
}

function euroToCents(value: number): number {
  return Math.round(roundEuro(value) * 100);
}

function centsToEuro(value: number): number {
  return roundEuro(value / 100);
}

function rebalanceLineItemsToAmount(lineItems: ProjectCostLineItem[], targetAmountExcl: number): ProjectCostLineItem[] {
  if (lineItems.length === 0) return lineItems;
  const targetCents = euroToCents(targetAmountExcl);
  if (targetCents === 0) return lineItems;

  const working = lineItems.map((rawItem) => {
    const item = normalizeLineItem(rawItem);
    const quantity = safeNumber(item.quantity);
    const unitCents = Math.round(roundEuro(item.unit_price) * 100);
    const totalCents = euroToCents(roundEuro((unitCents / 100) * quantity));
    return {
      item,
      quantity,
      unitCents,
      totalCents,
    };
  });

  const sumCents = (): number => working.reduce((sum, line) => sum + line.totalCents, 0);
  let diff = targetCents - sumCents();
  if (diff === 0) {
    return working.map((line) =>
      normalizeLineItem({
        ...line.item,
        unit_price: centsToEuro(line.unitCents),
        total_price: centsToEuro(line.totalCents),
      })
    );
  }

  const maxIterations = 2000;
  let iteration = 0;

  while (diff !== 0 && iteration < maxIterations) {
    iteration += 1;
    const direction = diff > 0 ? 1 : -1;
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let index = 0; index < working.length; index += 1) {
      const line = working[index];
      const nextUnitCents = line.unitCents + direction;
      if (nextUnitCents < 0) continue;

      const nextTotalCents = euroToCents(roundEuro((nextUnitCents / 100) * line.quantity));
      const delta = nextTotalCents - line.totalCents;
      if (delta === 0) continue;
      if (Math.sign(delta) !== Math.sign(diff)) continue;
      if (Math.abs(delta) > Math.abs(diff)) continue;

      const absDelta = Math.abs(delta);
      if (absDelta < bestDelta) {
        bestDelta = absDelta;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;

    const selected = working[bestIndex];
    const nextUnitCents = selected.unitCents + direction;
    const nextTotalCents = euroToCents(roundEuro((nextUnitCents / 100) * selected.quantity));
    const delta = nextTotalCents - selected.totalCents;
    if (delta === 0) break;

    selected.unitCents = nextUnitCents;
    selected.totalCents = nextTotalCents;
    diff -= delta;
  }

  return working.map((line) =>
    normalizeLineItem({
      ...line.item,
      unit_price: centsToEuro(line.unitCents),
      total_price: centsToEuro(line.totalCents),
    })
  );
}

function categoryBadgeClass(category: ProjectCostCategory): string {
  if (category === 'materiaal') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200';
  if (category === 'autokosten') return 'border-lime-500/30 bg-lime-500/15 text-lime-200';
  if (category === 'boetes') return 'border-red-500/30 bg-red-500/15 text-red-200';
  if (category === 'schulden') return 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-200';
  if (category === 'afval') return 'border-stone-500/30 bg-stone-500/15 text-stone-200';
  if (category === 'brandstof') return 'border-amber-500/30 bg-amber-500/15 text-amber-200';
  if (category === 'gereedschap') return 'border-blue-500/30 bg-blue-500/15 text-blue-200';
  if (category === 'eigen_verbruik') return 'border-violet-500/30 bg-violet-500/15 text-violet-200';
  if (category === 'hotel') return 'border-rose-500/30 bg-rose-500/15 text-rose-200';
  if (category === 'telefoon') return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200';
  if (category === 'leadkosten') return 'border-orange-500/30 bg-orange-500/15 text-orange-200';
  return 'border-zinc-500/30 bg-zinc-500/15 text-zinc-200';
}

function parseOfferteReferenceToQuoteId(reference: string | null, quotes: QuoteOption[]): string {
  if (!reference) return '';
  const normalized = safeString(reference).toLowerCase();
  if (!normalized) return '';

  const exactById = quotes.find((quote) => quote.id.toLowerCase() === normalized);
  if (exactById) return exactById.id;

  const extractedNumber = normalized.match(/\d{2,}/)?.[0] || '';
  if (extractedNumber) {
    const number = Number(extractedNumber);
    if (Number.isFinite(number)) {
      const matchByNumber = quotes.find((quote) => quote.offerteNummer === number);
      if (matchByNumber) return matchByNumber.id;
    }
  }

  const fuzzy = quotes.find((quote) => quote.searchable.includes(normalized));
  return fuzzy?.id || '';
}

function KostenPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const pageReceiptDragDepthRef = useRef(0);
  const pendingHydratedRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costReloadVersion, setCostReloadVersion] = useState(0);
  const [costs, setCosts] = useState<ProjectCostRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CostFilterMode>('alle');
  const [viewMode, setViewMode] = useState<KostenViewMode>(() => {
    const requestedTab = searchParams?.get('tab') || null;
    return isKostenViewMode(requestedTab) ? requestedTab : 'kosten';
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('upload');
  const [saving, setSaving] = useState(false);
  const [deletingCostId, setDeletingCostId] = useState<string | null>(null);
  const [dismissingPendingImport, setDismissingPendingImport] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pageReceiptDragActive, setPageReceiptDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteSearchOpen, setQuoteSearchOpen] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [selectedBankCost, setSelectedBankCost] = useState<ProjectCostRow | null>(null);
  const [bankCategoryDraft, setBankCategoryDraft] = useState<ProjectCostCategory>('overig');
  const [savingBankCategory, setSavingBankCategory] = useState(false);
  const [bankOfferteDraft, setBankOfferteDraft] = useState('');
  const [savingBankOfferte, setSavingBankOfferte] = useState(false);
  const [costPendingDelete, setCostPendingDelete] = useState<ProjectCostRow | null>(null);
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);
  const pendingDismissInFlightRef = useRef<string | null>(null);
  const skipNextPendingDismissRef = useRef(false);

  const [form, setForm] = useState<KostenFormState>(createDefaultFormState());
  const [lineItems, setLineItems] = useState<ProjectCostLineItem[]>([]);
  const initialOfferteIdFromUrl = safeString(searchParams?.get('offerteId'));
  const initialPendingImportId = safeString(searchParams?.get('pendingId'));
  const shouldOpenCreateFromUrl = safeString(searchParams?.get('open')) === '1';
  const activeFinanceTab = KOSTEN_PAGE_TABS.find((tab) => tab.value === viewMode)?.financeTab || null;

  useEffect(() => {
    const requestedTab = searchParams?.get('tab') || null;
    if (isKostenViewMode(requestedTab)) setViewMode(requestedTab);
  }, [searchParams]);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!initialOfferteIdFromUrl && !shouldOpenCreateFromUrl) return;
    if (quotes.length === 0) return;

    if (shouldOpenCreateFromUrl) {
      setCreateOpen(true);
      setEntryMode('manual');
    }

    if (initialOfferteIdFromUrl && quotes.some((quote) => quote.id === initialOfferteIdFromUrl)) {
      applyMainOfferteToLines(initialOfferteIdFromUrl);
      setQuoteSearch('');
    }
  }, [initialOfferteIdFromUrl, shouldOpenCreateFromUrl, quotes]);

  const loadQuotes = useCallback(async (): Promise<QuoteOption[]> => {
    if (!user || !firestore) return [];
    const [snapshot, invoicesSnapshot] = await Promise.all([
      getDocs(query(collection(firestore, 'quotes'), where('userId', '==', user.uid))),
      getDocs(query(collection(firestore, 'invoices'), where('userId', '==', user.uid))),
    ]);

    const acceptedQuoteIdsFromInvoices = new Set<string>();
    invoicesSnapshot.docs.forEach((invoiceSnap) => {
      const invoice = invoiceSnap.data() as {
        quoteId?: unknown;
        status?: InvoiceStatus | string;
        archived?: boolean;
      };
      const quoteId = safeString(invoice.quoteId);
      if (!quoteId || invoice.archived || !invoiceImpliesAccepted(invoice.status)) return;
      acceptedQuoteIdsFromInvoices.add(quoteId);
    });

    const data = snapshot.docs
      .map((docSnap) => {
        const raw = docSnap.data() as Record<string, unknown>;
        if (raw.isCalculationTest === true) return null;
        if (raw.archived === true) return null;
        if (raw.status !== 'geaccepteerd' && !acceptedQuoteIdsFromInvoices.has(docSnap.id)) return null;
        const title = getQuoteTitle(raw);
        const clientName = getClientName(raw);
        const offerteNummer = Number.isFinite(Number(raw.offerteNummer))
          ? Number(raw.offerteNummer)
          : null;
        const totalInclBtw = getQuoteTotalInclBtw(raw);
      const totalLabel = totalInclBtw !== null ? formatCurrency(totalInclBtw) : 'bedrag onbekend';
      const label = offerteNummer
        ? `#${offerteNummer} • ${totalLabel} • ${clientName} • ${title}`
        : `${totalLabel} • ${clientName} • ${title}`;

        return {
          id: docSnap.id,
          offerteNummer,
          totalInclBtw,
          clientName,
          title,
          label,
          searchable: getQuoteSearchable(raw, docSnap.id, label, clientName, title, offerteNummer),
          updatedAtDate: toDate(raw.updatedAt) || toDate(raw.createdAt),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const left = a.updatedAtDate?.getTime() || 0;
        const right = b.updatedAtDate?.getTime() || 0;
        return right - left;
      })
      .map((item) => ({
        id: item.id,
        offerteNummer: item.offerteNummer,
        totalInclBtw: item.totalInclBtw,
        clientName: item.clientName,
        title: item.title,
        label: item.label,
        searchable: item.searchable,
      }));

    return data;
  }, [firestore, user]);

  const loadCosts = useCallback(async (): Promise<ProjectCostRow[]> => {
    if (!user) return [];
    const token = await user.getIdToken();
    const response = await fetch('/api/kosten/list', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      data?: ProjectCostRow[];
    } | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    return payload.data
      .map((item) => ({
        ...item,
        category: normalizeProjectCostCategory(item.category),
      }))
      .sort((a, b) => {
        const left = new Date(a.date || a.created_at).getTime();
        const right = new Date(b.date || b.created_at).getTime();
          return right - left;
        });
  }, [user]);

  useEffect(() => {
    if (!user || !firestore) return;
    const needsCostWorkspace = viewMode === 'kosten' || shouldOpenCreateFromUrl || Boolean(initialPendingImportId);
    if (!needsCostWorkspace) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [quotesData, costsData] = await Promise.all([loadQuotes(), loadCosts()]);
        if (cancelled) return;
        setQuotes(quotesData);
        setCosts(costsData);
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Kon kosten niet laden.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [costReloadVersion, initialPendingImportId, loadCosts, loadQuotes, shouldOpenCreateFromUrl, user, firestore, viewMode]);

  useEffect(() => {
    if (!user || !initialPendingImportId || pendingHydratedRef.current === initialPendingImportId) return;
    let cancelled = false;

    const loadPendingImport = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/kosten/pending', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          data?: Array<ExtractedCostData & { id?: string }>;
        } | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          throw new Error('Openstaande factuur kon niet worden geladen.');
        }

        const pending = payload.data.find((item) => safeString(item.id) === initialPendingImportId);
        if (!pending || cancelled) return;
        pendingHydratedRef.current = initialPendingImportId;

        const matchedOfferteId = (
          safeString(pending.offerte_id)
          && quotes.some((quote) => quote.id === safeString(pending.offerte_id))
        )
          ? safeString(pending.offerte_id)
          : parseOfferteReferenceToQuoteId(pending.offerte_reference || null, quotes);
        const extractedLineItems = Array.isArray(pending.line_items) && pending.line_items.length > 0
          ? pending.line_items
            .map((item) =>
              normalizeLineItem({
                ...item,
                category: item.category || pending.suggested_category || 'materiaal',
                offerte_id: safeString(item.offerte_id) || matchedOfferteId || null,
              })
            )
            .filter(hasLineItemContent)
          : [];
        const extractedAmountExcl = roundEuro(safeNumber(pending.amount_excl_btw));
        const extractedLineItemsTotal = roundEuro(
          extractedLineItems.reduce((sum, item) => sum + roundEuro(item.total_price), 0)
        );
        const extractedLineItemsRebalanced = (
          extractedAmountExcl !== 0
          && extractedLineItemsTotal !== 0
          && Math.abs(extractedAmountExcl - extractedLineItemsTotal) > 0.01
        )
          ? rebalanceLineItemsToAmount(extractedLineItems, extractedAmountExcl)
          : extractedLineItems;
        const extractedLineItemsTotalAfterRebalance = roundEuro(
          extractedLineItemsRebalanced.reduce((sum, item) => sum + roundEuro(item.total_price), 0)
        );
        const shouldEnableManualOverride =
          pending.manual_amount_override === true
          || (
            extractedAmountExcl !== 0
            && extractedLineItemsTotalAfterRebalance !== 0
            && Math.abs(extractedAmountExcl - extractedLineItemsTotalAfterRebalance) > 0.05
          );

        setPendingImportId(initialPendingImportId);
        setEditingCostId(null);
        setLineItems(extractedLineItemsRebalanced);
        setForm((previous) => ({
          ...previous,
          category: normalizeProjectCostCategory(pending.suggested_category || previous.category),
          supplierName: safeString(pending.supplier_name),
          description: safeString(pending.description),
          offerteId: matchedOfferteId,
          date: safeString(pending.date) || previous.date,
          btwPercentage: safeNumber(pending.btw_percentage) || previous.btwPercentage,
          amountExcl: extractedAmountExcl,
          manualOverride: shouldEnableManualOverride,
          receiptUrl: safeString(pending.receipt_url),
          receiptFiles: Array.isArray(pending.receipt_files) ? pending.receipt_files : [],
        }));
        setEntryMode('upload');
        setCreateOpen(true);
        toast({
          title: 'Openstaande factuur geopend',
          description: 'Kies de juiste offerte en sla de kost daarna op.',
        });
      } catch (pendingError) {
        if (!cancelled) {
          toast({
            title: 'Factuur kon niet worden geopend',
            description: pendingError instanceof Error ? pendingError.message : 'Onbekende fout.',
            variant: 'destructive',
          });
        }
      }
    };

    void loadPendingImport();
    return () => {
      cancelled = true;
    };
  }, [initialPendingImportId, quotes, toast, user]);

  const quoteById = useMemo(() => {
    return new Map(quotes.map((quote) => [quote.id, quote]));
  }, [quotes]);

  const filterOptions: Array<{ value: CostFilterMode; label: string }> = [
    { value: 'alle', label: 'Alle' },
    { value: 'materiaal', label: 'Materiaal' },
    { value: 'autokosten', label: 'Autokosten' },
    { value: 'boetes', label: 'Boetes' },
    { value: 'schulden', label: 'Schulden' },
    { value: 'afval', label: 'Afval' },
    { value: 'brandstof', label: 'Benzine' },
    { value: 'gereedschap', label: 'Gereedschap' },
    { value: 'eigen_verbruik', label: 'Privé-opnames' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'telefoon', label: 'Telefoon' },
    { value: 'leadkosten', label: 'Leadkosten' },
    { value: 'profit', label: 'Profit' },
    { value: 'overig', label: 'Overig' },
  ];

  const filteredCosts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return costs
      .filter((cost) => (filter === 'alle'
        ? !isPrivateBankTransactionCost(cost) && !isInternalProfitTransferCost(cost)
        : cost.category === filter))
      .filter((cost) => {
        if (!term) return true;
        const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
        const offerteNummer = quote?.offerteNummer ? String(quote.offerteNummer) : '';
        const receiptFilenames = (Array.isArray(cost.receipt_files) ? cost.receipt_files : [])
          .map((file) => file.filename)
          .join(' ');
        const target = `${cost.supplier_name} ${cost.description} ${cost.supplier_invoice_number || ''} ${cost.source_filename || ''} ${receiptFilenames} ${offerteNummer} ${quote?.label || ''} ${getCostAmountSearchText(cost)}`.toLowerCase();
        return target.includes(term);
      })
      .sort((a, b) => {
        const left = new Date(a.date || a.created_at).getTime();
        const right = new Date(b.date || b.created_at).getTime();
        return right - left;
      });
  }, [costs, filter, quoteById, search]);

  const tabTotals = useMemo(() => {
    const term = search.trim().toLowerCase();
    const costsMatchingSearch = costs.filter((cost) => {
      if (!term) return true;
      const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
      const offerteNummer = quote?.offerteNummer ? String(quote.offerteNummer) : '';
      const target = `${cost.supplier_name} ${cost.description} ${offerteNummer} ${quote?.label || ''} ${getCostAmountSearchText(cost)}`.toLowerCase();
      return target.includes(term);
    });

    const totals = {
      alle: 0,
      materiaal: 0,
      autokosten: 0,
      boetes: 0,
      schulden: 0,
      afval: 0,
      brandstof: 0,
      gereedschap: 0,
      eigen_verbruik: 0,
      hotel: 0,
      telefoon: 0,
      leadkosten: 0,
      profit: 0,
      overig: 0,
    } satisfies Record<CostFilterMode, number>;

    for (const cost of costsMatchingSearch) {
      const amountIncl = roundEuro(safeNumber(cost.amount_incl_btw));
      if (!isPrivateBankTransactionCost(cost) && !isInternalProfitTransferCost(cost)) totals.alle += amountIncl;
      totals[cost.category] += amountIncl;
    }

    return {
      alle: roundEuro(totals.alle),
      materiaal: roundEuro(totals.materiaal),
      autokosten: roundEuro(totals.autokosten),
      boetes: roundEuro(totals.boetes),
      schulden: roundEuro(totals.schulden),
      afval: roundEuro(totals.afval),
      brandstof: roundEuro(totals.brandstof),
      gereedschap: roundEuro(totals.gereedschap),
      eigen_verbruik: roundEuro(totals.eigen_verbruik),
      hotel: roundEuro(totals.hotel),
      telefoon: roundEuro(totals.telefoon),
      leadkosten: roundEuro(totals.leadkosten),
      profit: roundEuro(totals.profit),
      overig: roundEuro(totals.overig),
    } satisfies Record<CostFilterMode, number>;
  }, [costs, quoteById, search]);

  const tabLineCounts = useMemo(() => {
    const counts = Object.fromEntries(
      filterOptions.map((option) => [option.value, 0])
    ) as Record<CostFilterMode, number>;

    for (const cost of costs) {
      const lineCount = Array.isArray(cost.line_items) ? cost.line_items.length : 0;
      counts[cost.category] += lineCount;
      if (!isPrivateBankTransactionCost(cost) && !isInternalProfitTransferCost(cost)) counts.alle += lineCount;
    }
    return counts;
  }, [costs]);

  const filteredQuotesForPicker = useMemo(() => {
    const term = normalizeSearchText(quoteSearch);
    if (!term) return quotes.slice(0, 40);
    return quotes.filter((quote) => quote.searchable.includes(term)).slice(0, 40);
  }, [quoteSearch, quotes]);

  const normalizedLineItems = useMemo(
    () => lineItems.map((item) => normalizeLineItem(item)),
    [lineItems]
  );

  const lineItemsTotal = useMemo(
    () => roundEuro(normalizedLineItems.reduce((sum, item) => sum + item.total_price, 0)),
    [normalizedLineItems]
  );

  const hasManualLineInclBtw = normalizedLineItems.some((item) => item.total_incl_btw !== undefined);
  const lineItemsTotalIncl = useMemo(
    () => roundEuro(normalizedLineItems.reduce((sum, item) => {
      const lineBtwPercentage = item.btw_percentage ?? form.btwPercentage;
      const calculatedIncl = roundEuro(item.total_price * (1 + lineBtwPercentage / 100));
      return sum + (item.total_incl_btw ?? calculatedIncl);
    }, 0)),
    [form.btwPercentage, normalizedLineItems]
  );

  const hasLineSpecificBtw = normalizedLineItems.some((item) => item.btw_percentage !== undefined);

  const amountExcl = form.manualOverride ? roundEuro(form.amountExcl) : lineItemsTotal;
  const amountIncl = form.manualOverride || (!hasManualLineInclBtw && !hasLineSpecificBtw)
    ? roundEuro(amountExcl * (1 + form.btwPercentage / 100))
    : lineItemsTotalIncl;
  const btwAmount = roundEuro(amountIncl - amountExcl);
  const isEditingCost = Boolean(editingCostId);

  const resetForm = () => {
    setEditingCostId(null);
    setPendingImportId(null);
    setForm(createDefaultFormState());
    setLineItems([]);
    setQuoteSearch('');
    setSelectedFile(null);
    setEntryMode('upload');
    setDragActive(false);
  };

  const closeCreateDialog = async (): Promise<void> => {
    const pendingIdToDismiss = pendingImportId;
    setCreateOpen(false);
    resetForm();

    if (skipNextPendingDismissRef.current) {
      skipNextPendingDismissRef.current = false;
      return;
    }

    if (!pendingIdToDismiss || !user || pendingDismissInFlightRef.current === pendingIdToDismiss) return;

    pendingDismissInFlightRef.current = pendingIdToDismiss;
    setDismissingPendingImport(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/pending', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: pendingIdToDismiss }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
    } catch (dismissError) {
      toast({
        title: 'Openstaande factuur niet verborgen',
        description: dismissError instanceof Error ? dismissError.message : 'Probeer het opnieuw.',
        variant: 'destructive',
      });
    } finally {
      pendingDismissInFlightRef.current = null;
      setDismissingPendingImport(false);
    }
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateOpen(true);
  };

  const updateLineItem = (
    index: number,
    patch: Partial<ProjectCostLineItem>
  ) => {
    const shouldRecalculateTotal =
      Object.prototype.hasOwnProperty.call(patch, 'quantity')
      || Object.prototype.hasOwnProperty.call(patch, 'unit_price');

    setLineItems((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) return item;

        const merged: ProjectCostLineItem = {
          ...item,
          ...patch,
        };

        if (shouldRecalculateTotal) {
          const quantity = safeNumber(merged.quantity);
          const unitPrice = safeNumber(merged.unit_price);
          merged.total_price = roundEuro(quantity * unitPrice);
          delete merged.total_incl_btw;
        }

        return merged;
      })
    );
  };

  const updateLineItemFromInclBtw = (index: number, amountInclBtw: number) => {
    setLineItems((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) return item;

        const quantity = safeNumber(item.quantity);
        const lineBtwPercentage = item.btw_percentage ?? form.btwPercentage;
        const factor = 1 + Math.max(0, safeNumber(lineBtwPercentage)) / 100;
        const amountExclBtw = roundEuro(amountInclBtw / factor);
        return {
          ...item,
          unit_price: quantity !== 0 ? roundEuro(amountExclBtw / quantity) : 0,
          total_price: amountExclBtw,
          total_incl_btw: roundEuro(amountInclBtw),
        };
      })
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      normalizeLineItem({
        ...createEmptyLineItem(),
        category: form.category,
        offerte_id: form.offerteId || null,
      }),
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next;
    });
  };

  const applyMainOfferteToLines = (nextOfferteIdRaw: string) => {
    const nextOfferteId = safeString(nextOfferteIdRaw);
    const previousMainOfferteId = safeString(form.offerteId);

    setLineItems((prev) =>
      prev.map((rawLine) => {
        const line = normalizeLineItem(rawLine);
        const currentLineOfferteId = safeString(line.offerte_id);
        const followsMain =
          !currentLineOfferteId
          || currentLineOfferteId === previousMainOfferteId;

        if (!followsMain) return line;
        return {
          ...line,
          offerte_id: nextOfferteId || null,
        };
      })
    );

    setForm((prev) => ({
      ...prev,
      offerteId: nextOfferteId,
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!safeString(form.supplierName)) {
      toast({
        title: 'Leverancier ontbreekt',
        description: 'Vul een leverancier in voordat je opslaat.',
        variant: 'destructive',
      });
      return;
    }

    const payloadLineItems = normalizedLineItems.filter(
      (item) => item.description || item.total_price !== 0
    );
    const normalizedReceiptUrl = safeString(form.receiptUrl) || null;
    const payloadReceiptFiles = Array.isArray(form.receiptFiles) && form.receiptFiles.length > 0
      ? form.receiptFiles
      : (normalizedReceiptUrl
        ? [{
          url: normalizedReceiptUrl,
          path: null,
          filename: normalizedReceiptUrl.split('/').pop() || 'bon',
          content_type: '',
          size_bytes: 0,
          uploaded_at: new Date().toISOString(),
        }]
        : []);

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(isEditingCost ? '/api/kosten/update' : '/api/kosten/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingCostId,
          pending_import_id: pendingImportId || undefined,
          offerte_id: form.offerteId || null,
          category: form.category,
          supplier_name: form.supplierName,
          description: form.description || form.supplierName,
          line_items: payloadLineItems,
          amount_excl_btw: amountExcl,
          amount_incl_btw: amountIncl,
          btw_amount: btwAmount,
          manual_amount_override: form.manualOverride,
          btw_percentage: form.btwPercentage,
          date: form.date,
          receipt_url: normalizedReceiptUrl,
          receipt_files: payloadReceiptFiles,
          status: 'confirmed',
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: ProjectCostRow;
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const refreshedCosts = await loadCosts();
      setCosts(refreshedCosts);

      toast({
        title: isEditingCost ? 'Kost bijgewerkt' : 'Kost opgeslagen',
        description: isEditingCost
          ? `${safeString(form.supplierName)} is bijgewerkt.`
          : `${safeString(form.supplierName)} is toegevoegd.`,
      });

      if (pendingImportId) skipNextPendingDismissRef.current = true;
      setCreateOpen(false);
      resetForm();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Kon kost niet opslaan.';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async (fileOverride?: File | null) => {
    const fileToExtract = fileOverride ?? selectedFile;
    if (!user || !fileToExtract || extracting) return;
    setExtracting(true);

    try {
      const preparedFile = await optimizeReceiptImageForUpload(fileToExtract);
      if (preparedFile !== fileToExtract) {
        setSelectedFile(preparedFile);
      }

      const token = await user.getIdToken();
      const body = new FormData();
      body.append('file', preparedFile);

      const response = await fetch('/api/kosten/extract', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: {
          supplier_name?: string;
          description?: string;
          line_items?: ProjectCostLineItem[];
          amount_excl_btw?: number;
          btw_percentage?: number;
          btw_amount?: number;
          amount_incl_btw?: number;
          manual_amount_override?: boolean;
          date?: string;
          offerte_reference?: string | null;
          offerte_id?: string | null;
          suggested_category?: ProjectCostCategory;
          receipt_url?: string;
          receipt_files?: ProjectCostReceiptFile[];
          extraction_warning?: string;
        };
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const extracted = payload.data;
      const matchedOfferteId = (
        safeString(extracted.offerte_id)
        && quotes.some((quote) => quote.id === safeString(extracted.offerte_id))
      )
        ? safeString(extracted.offerte_id)
        : parseOfferteReferenceToQuoteId(extracted.offerte_reference || null, quotes);
      const extractedLineItems = Array.isArray(extracted.line_items) && extracted.line_items.length > 0
        ? extracted.line_items
          .map((item) =>
            normalizeLineItem({
              ...item,
              category: item.category || extracted.suggested_category || 'materiaal',
              offerte_id:
                safeString(item.offerte_id) || matchedOfferteId || null,
            })
          )
          .filter(hasLineItemContent)
        : [];
      const extractedAmountExcl = roundEuro(safeNumber(extracted.amount_excl_btw));
      const extractedLineItemsTotal = roundEuro(
        extractedLineItems.reduce((sum, item) => sum + roundEuro(item.total_price), 0)
      );
      const extractedLineItemsRebalanced = (
        extractedAmountExcl !== 0
        && extractedLineItemsTotal !== 0
        && Math.abs(extractedAmountExcl - extractedLineItemsTotal) > 0.01
      )
        ? rebalanceLineItemsToAmount(extractedLineItems, extractedAmountExcl)
        : extractedLineItems;
      const extractedLineItemsTotalAfterRebalance = roundEuro(
        extractedLineItemsRebalanced.reduce((sum, item) => sum + roundEuro(item.total_price), 0)
      );
      const shouldEnableManualOverride =
        extracted.manual_amount_override === true
        || (
          extractedAmountExcl !== 0
          && extractedLineItemsTotalAfterRebalance !== 0
          && Math.abs(extractedAmountExcl - extractedLineItemsTotalAfterRebalance) > 0.05
        );
      setLineItems(extractedLineItemsRebalanced);
      setForm((prev) => ({
        ...prev,
        category: normalizeProjectCostCategory(extracted.suggested_category || prev.category),
        supplierName: safeString(extracted.supplier_name) || prev.supplierName,
        description: safeString(extracted.description) || prev.description,
        offerteId: matchedOfferteId || prev.offerteId,
        date: safeString(extracted.date) || prev.date,
        btwPercentage: safeNumber(extracted.btw_percentage) || prev.btwPercentage,
        amountExcl: extractedAmountExcl,
        manualOverride: shouldEnableManualOverride,
        receiptUrl: safeString(extracted.receipt_url) || prev.receiptUrl,
        receiptFiles: Array.isArray(extracted.receipt_files) ? extracted.receipt_files : prev.receiptFiles,
      }));
      setEntryMode('manual');

      toast(extracted.extraction_warning
        ? {
          title: 'Bon opgeslagen',
          description: 'De foto is veilig bewaard. Vul de gegevens handmatig in en sla de kost daarna op.',
        }
        : {
          title: preparedFile.type.startsWith('image/') ? 'Foto opgeslagen en herkend' : 'Bestand opgeslagen en herkend',
          description: 'Het origineel is veilig bewaard. Controleer de gegevens en sla daarna de kost op.',
        });
    } catch (extractError) {
      const message = extractError instanceof Error ? extractError.message : 'Kon bon niet uitlezen.';
      toast({
        title: 'Extractie mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  };

  const openReceiptFromPage = (file: File) => {
    const isSupportedReceipt = file.type.startsWith('image/')
      || file.type === 'application/pdf'
      || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);

    if (!isSupportedReceipt) {
      toast({
        title: 'Geen bon of factuur gevonden',
        description: 'Gebruik een PDF, JPG, PNG, WEBP of HEIC bestand.',
        variant: 'destructive',
      });
      return;
    }

    resetForm();
    setEntryMode('upload');
    setSelectedFile(file);
    setCreateOpen(true);
    void handleExtract(file);
  };

  const handleQuickPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.currentTarget.value = '';
    if (file) openReceiptFromPage(file);
  };

  const handleOpenCost = (cost: ProjectCostRow) => {
    if (isBankTransactionCost(cost)) {
      setBankCategoryDraft(cost.category);
      setBankOfferteDraft(safeString(cost.offerte_id));
      setSelectedBankCost(cost);
      return;
    }
    const rowCategory = normalizeProjectCostCategory(cost.category);
    const rowOfferteId = safeString(cost.offerte_id) || null;
    const initialLineItems = Array.isArray(cost.line_items) && cost.line_items.length > 0
      ? cost.line_items
        .map((item) =>
          normalizeLineItem({
            ...item,
            category: item.category || rowCategory,
            offerte_id: safeString(item.offerte_id) || rowOfferteId,
          })
        )
        .filter(hasLineItemContent)
      : [];
    const amountExclForCost = roundEuro(safeNumber(cost.amount_excl_btw));
    const normalizedOpenLineItems = (
      initialLineItems.length > 0
      && amountExclForCost !== 0
      && Math.abs(
        roundEuro(initialLineItems.reduce((sum, item) => sum + roundEuro(item.total_price), 0))
        - amountExclForCost
      ) > 0.01
    )
      ? rebalanceLineItemsToAmount(initialLineItems, amountExclForCost)
      : initialLineItems;
    const lineItemsTotalForCost = roundEuro(
      normalizedOpenLineItems.reduce((sum, item) => sum + roundEuro(item.total_price), 0)
    );
    const useManualOverride =
      lineItemsTotalForCost === 0
      || Math.abs(amountExclForCost - lineItemsTotalForCost) > 0.05;

    setLineItems(normalizedOpenLineItems);
    setForm({
      category: normalizeProjectCostCategory(cost.category),
      supplierName: safeString(cost.supplier_name),
      description: safeString(cost.description),
      offerteId: safeString(cost.offerte_id),
      date: safeString(cost.date) || new Date().toISOString().slice(0, 10),
      btwPercentage: safeNumber(cost.btw_percentage) || 21,
      amountExcl: amountExclForCost,
      manualOverride: useManualOverride,
      receiptUrl: safeString(cost.receipt_url),
      receiptFiles: Array.isArray(cost.receipt_files) ? cost.receipt_files : [],
    });
    setQuoteSearch('');
    setSelectedFile(null);
    setDragActive(false);
    setEntryMode('manual');
    setEditingCostId(cost.id);
    setCreateOpen(true);
  };

  const handleSaveBankCategory = async (): Promise<void> => {
    if (!user || !selectedBankCost?.paid_bank_transaction_id || savingBankCategory) return;

    setSavingBankCategory(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/bank-category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bank_transaction_id: selectedBankCost.paid_bank_transaction_id,
          category: bankCategoryDraft,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const refreshedCosts = await loadCosts();
      setCosts(refreshedCosts);
      setSelectedBankCost(null);
      toast({
        title: 'Categorie opgeslagen',
        description: `Deze Knab-afschrijving staat nu onder ${PROJECT_COST_CATEGORY_LABELS[bankCategoryDraft]}.`,
      });
    } catch (saveError) {
      toast({
        title: 'Categorie niet opgeslagen',
        description: saveError instanceof Error ? saveError.message : 'Probeer het opnieuw.',
        variant: 'destructive',
      });
    } finally {
      setSavingBankCategory(false);
    }
  };

  const handleSaveBankOfferte = async (): Promise<void> => {
    if (!user || !selectedBankCost?.paid_bank_transaction_id || savingBankOfferte) return;

    setSavingBankOfferte(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/bank-link-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bank_transaction_id: selectedBankCost.paid_bank_transaction_id,
          offerte_id: bankOfferteDraft || null,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; data?: { created_source_cost?: boolean } } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const refreshedCosts = await loadCosts();
      setCosts(refreshedCosts);
      setSelectedBankCost(null);
      toast({
        title: bankOfferteDraft ? 'Klant gekoppeld' : 'Klantkoppeling verwijderd',
        description: payload.data?.created_source_cost
          ? 'De bankafschrijving is als kostregel opgeslagen en aan de offerte gekoppeld.'
          : bankOfferteDraft
            ? 'De bijbehorende kostenregels tellen nu mee bij deze offerte.'
            : 'De kostenregels tellen niet meer mee bij een offerte.',
      });
    } catch (saveError) {
      toast({
        title: 'Klant niet gekoppeld',
        description: saveError instanceof Error ? saveError.message : 'Probeer het opnieuw.',
        variant: 'destructive',
      });
    } finally {
      setSavingBankOfferte(false);
    }
  };

  const requestDeleteCost = (cost: ProjectCostRow) => {
    if (deletingCostId) return;
    setCostPendingDelete(cost);
  };

  const handleDeleteCost = async (costArg?: ProjectCostRow | null) => {
    const cost = costArg || costPendingDelete;
    if (!cost) return;
    if (!user || deletingCostId) return;

    setDeletingCostId(cost.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: cost.id }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const refreshedCosts = await loadCosts();
      setCosts(refreshedCosts);
      setCostPendingDelete((prev) => (prev?.id === cost.id ? null : prev));
      if (editingCostId === cost.id) {
        setCreateOpen(false);
        resetForm();
      }

      toast({
        title: 'Kost verwijderd',
        description: `${safeString(cost.supplier_name) || 'De kost'} is verwijderd.`,
      });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Kon kost niet verwijderen.';
      toast({
        title: 'Verwijderen mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeletingCostId(null);
      setCostPendingDelete(null);
    }
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div
      className="app-shell min-h-screen bg-background"
      onDragEnter={(event) => {
        if (createOpen) return;
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        pageReceiptDragDepthRef.current += 1;
        setPageReceiptDragActive(true);
      }}
      onDragOver={(event) => {
        if (createOpen) return;
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!pageReceiptDragActive) setPageReceiptDragActive(true);
      }}
      onDragLeave={(event) => {
        if (createOpen) return;
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        pageReceiptDragDepthRef.current = Math.max(0, pageReceiptDragDepthRef.current - 1);
        if (pageReceiptDragDepthRef.current === 0) setPageReceiptDragActive(false);
      }}
      onDrop={(event) => {
        if (createOpen) return;
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        pageReceiptDragDepthRef.current = 0;
        setPageReceiptDragActive(false);
        const receiptFile = Array.from(event.dataTransfer.files).find((file) => (
          file.type.startsWith('image/')
          || file.type === 'application/pdf'
          || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name)
        ));
        if (receiptFile) openReceiptFromPage(receiptFile);
      }}
      onPaste={(event) => {
        if (createOpen) return;
        const receiptFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
        if (!receiptFile) return;
        event.preventDefault();
        openReceiptFromPage(receiptFile);
      }}
    >
      {pageReceiptDragActive ? (
        <div className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-emerald-500 bg-card px-8 py-10 text-center shadow-2xl">
            <UploadCloud className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
            <div className="text-lg font-semibold text-foreground">Laat screenshot los om een kost toe te voegen</div>
            <p className="mt-1 text-sm text-muted-foreground">De AI leest de bon of factuur uit en opent daarna het controleformulier.</p>
          </div>
        </div>
      ) : null}
      <AppNavigation />
      <DashboardHeader user={user} title="Kosten" />

      <main className="flex flex-col items-center p-4 pb-24 md:px-6 md:pb-10 md:pt-6">
        <div className="w-full max-w-7xl space-y-5">
          <div className="flex overflow-x-auto border-b border-border" role="tablist" aria-label="Kosten en financiën">
            {KOSTEN_PAGE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={viewMode === tab.value}
                onClick={() => setViewMode(tab.value)}
                className={cn(
                  'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                  viewMode === tab.value
                    ? 'border-emerald-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {viewMode === 'kosten' && error ? (
            <Card className="border-red-500/30">
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <CircleAlert className="h-8 w-8 text-red-300" />
                <div>
                  <div className="font-semibold">Kosten konden niet worden geladen</div>
                  <p className="mt-1 text-sm text-muted-foreground">Oude of lege cijfers worden bewust niet getoond. {error}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setCostReloadVersion((value) => value + 1)}>
                  Opnieuw proberen
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className={cn((viewMode !== 'kosten' || Boolean(error)) && 'hidden')}>
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Zoek op leverancier, omschrijving, offertennummer of bedrag..."
                    className="pl-9"
                  />
                </div>

                <input
                  ref={quickPhotoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleQuickPhotoChange}
                />

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 gap-2 border-emerald-500/40 px-4 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                  onClick={() => quickPhotoInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                  Foto maken
                </Button>

                <Dialog
                  open={createOpen}
                  onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) void closeCreateDialog();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      className="h-10 shrink-0 gap-2 px-4 hidden sm:inline-flex"
                      onClick={openCreateDialog}
                    >
                      <Plus className="h-4 w-4" />
                      Nieuwe kost
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0">
                    <div className="flex max-h-[90vh] flex-col">
                      <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle>{isEditingCost ? 'Kost bewerken' : 'Nieuwe kost'}</DialogTitle>
                        <DialogDescription>
                          {isEditingCost
                            ? 'Pas de kost aan en sla de wijzigingen op.'
                            : 'Voeg handmatig kosten toe of upload een bon/factuur om automatisch in te vullen.'}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 overflow-y-auto px-6 pb-6">
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant={entryMode === 'upload' ? 'default' : 'outline'}
                              className="h-9 rounded-full px-4"
                              onClick={() => setEntryMode('upload')}
                            >
                              Upload + AI
                            </Button>
                            <Button
                              type="button"
                              variant={entryMode === 'manual' ? 'default' : 'outline'}
                              className="h-9 rounded-full px-4"
                              onClick={() => setEntryMode('manual')}
                            >
                              Handmatig
                            </Button>
                          </div>

                          {entryMode === 'upload' ? (
                            <Card className="border-border/70 bg-card/50">
                              <CardContent className="space-y-4 pt-5">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                                    dragActive
                                      ? 'border-emerald-400 bg-emerald-500/10'
                                      : 'border-border/70 bg-background/40 hover:border-emerald-500/40 hover:bg-emerald-500/5'
                                  )}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragActive(true);
                                  }}
                                  onDragLeave={() => setDragActive(false)}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    setDragActive(false);
                                    const file = event.dataTransfer.files?.[0];
                                    if (file) {
                                      setSelectedFile(file);
                                      void handleExtract(file);
                                    }
                                  }}
                                  onClick={() => fileInputRef.current?.click()}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      fileInputRef.current?.click();
                                    }
                                  }}
                                >
                                  <UploadCloud className="mx-auto h-8 w-8 text-emerald-400" />
                                  <p className="mt-3 text-sm font-medium">Sleep je bon/factuur hierheen</p>
                                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, WEBP</p>
                                </div>

                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  className="hidden"
                                  accept="application/pdf,image/*"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] || null;
                                    setSelectedFile(file);
                                    if (file) {
                                      void handleExtract(file);
                                    }
                                    event.currentTarget.value = '';
                                  }}
                                />

                                {selectedFile ? (
                                  <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                                    <div className="font-medium text-foreground">{selectedFile.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                  </div>
                                ) : null}

                                <Button
                                  type="button"
                                  className="h-10 gap-2"
                                  disabled={!selectedFile || extracting}
                                  onClick={() => void handleExtract()}
                                >
                                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                  {extracting ? 'Bezig met uitlezen...' : 'Upload en herken gegevens'}
                                </Button>
                              </CardContent>
                            </Card>
                          ) : null}

                          <Card className="border-border/70 bg-card/55">
                            <CardContent className="space-y-5 pt-5">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Categorie</Label>
                                  <Select
                                    value={form.category}
                                    onValueChange={(value) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        category: normalizeProjectCostCategory(value),
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Kies categorie" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="materiaal">Materiaal</SelectItem>
                                      <SelectItem value="autokosten">Autokosten</SelectItem>
                                      <SelectItem value="boetes">Boetes</SelectItem>
                                      <SelectItem value="schulden">Schulden</SelectItem>
                                      <SelectItem value="afval">Afval</SelectItem>
                                      <SelectItem value="brandstof">Benzine</SelectItem>
                                      <SelectItem value="gereedschap">Gereedschap</SelectItem>
                                      <SelectItem value="eigen_verbruik">Eigen verbruik</SelectItem>
                                      <SelectItem value="hotel">Hotel</SelectItem>
                                      <SelectItem value="telefoon">Telefoon</SelectItem>
                                      <SelectItem value="leadkosten">Leadkosten</SelectItem>
                                      <SelectItem value="overig">Overig</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Datum</Label>
                                  <Input
                                    type="date"
                                    value={form.date}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        date: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Leverancier</Label>
                                <Input
                                  value={form.supplierName}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      supplierName: event.target.value,
                                    }))
                                  }
                                  placeholder="Bijv. PontMeyer, Shell, Toolstation..."
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Omschrijving</Label>
                                <Textarea
                                  value={form.description}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      description: event.target.value,
                                    }))
                                  }
                                  placeholder="Korte toelichting op deze kost..."
                                  className="min-h-[70px]"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Koppel aan offerte</Label>
                                <div className="relative">
                                  <Input
                                    value={quoteSearch}
                                    onChange={(event) => {
                                      setQuoteSearch(event.target.value);
                                      setQuoteSearchOpen(true);
                                    }}
                                    onFocus={() => setQuoteSearchOpen(true)}
                                    onBlur={() => setQuoteSearchOpen(false)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') setQuoteSearchOpen(false);
                                    }}
                                    placeholder="Zoek offerte op klant, titel of nummer..."
                                    role="combobox"
                                    aria-expanded={quoteSearchOpen}
                                    aria-controls="kosten-offerte-zoekresultaten"
                                    aria-autocomplete="list"
                                  />
                                  {quoteSearchOpen ? (
                                    <div
                                      id="kosten-offerte-zoekresultaten"
                                      role="listbox"
                                      className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                                    >
                                      {filteredQuotesForPicker.length > 0 ? (
                                        filteredQuotesForPicker.map((quote) => (
                                          <button
                                            key={quote.id}
                                            type="button"
                                            role="option"
                                            aria-selected={form.offerteId === quote.id}
                                            className={cn(
                                              'flex w-full items-start rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                                              form.offerteId === quote.id && 'bg-accent text-accent-foreground'
                                            )}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => {
                                              applyMainOfferteToLines(quote.id);
                                              setQuoteSearch('');
                                              setQuoteSearchOpen(false);
                                            }}
                                          >
                                            {quote.label}
                                          </button>
                                        ))
                                      ) : (
                                        <p className="px-2 py-3 text-sm text-muted-foreground">
                                          Geen offertes gevonden voor “{quoteSearch.trim()}”.
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <Select
                                  value={form.offerteId || 'none'}
                                  onValueChange={(value) => applyMainOfferteToLines(value === 'none' ? '' : value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Niet gekoppeld" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Niet gekoppeld</SelectItem>
                                    {filteredQuotesForPicker.map((quote) => (
                                      <SelectItem key={quote.id} value={quote.id}>
                                        {quote.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Hoofdlink vult automatisch alle regels in. Regels met een eigen afwijkende koppeling blijven ongewijzigd.
                                </p>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label>Regels</Label>
                                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="h-4 w-4" />
                                    Regel toevoegen
                                  </Button>
                                </div>

                                <div className="space-y-3">
                                  {lineItems.map((item, index) => {
                                    const normalizedLine = normalizeLineItem(item);
                                    const lineExcl = normalizedLine.total_price;
                                    const lineBtwPercentage = normalizedLine.btw_percentage ?? form.btwPercentage;
                                    const calculatedLineIncl = roundEuro(lineExcl * (1 + lineBtwPercentage / 100));
                                    const lineIncl = normalizedLine.total_incl_btw ?? calculatedLineIncl;
                                    const lineBtw = roundEuro(lineIncl - lineExcl);

                                    return (
                                      <div
                                        key={`line-item-${index}`}
                                        className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3"
                                      >
                                      <Input
                                        value={item.description}
                                        onChange={(event) =>
                                          updateLineItem(index, { description: event.target.value })
                                        }
                                        placeholder="Omschrijving"
                                      />

                                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">Type regel</Label>
                                          <Select
                                            value={normalizeProjectCostCategory(item.category || form.category)}
                                            onValueChange={(value) => {
                                              const nextCategory = normalizeProjectCostCategory(value);
                                              updateLineItem(index, {
                                                category: nextCategory,
                                                offerte_id: safeString(item.offerte_id) || form.offerteId || null,
                                              });
                                            }}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="materiaal">Materiaal</SelectItem>
                                              <SelectItem value="gereedschap">Gereedschap</SelectItem>
                                              <SelectItem value="autokosten">Autokosten</SelectItem>
                                              <SelectItem value="boetes">Boetes</SelectItem>
                                              <SelectItem value="schulden">Schulden</SelectItem>
                                              <SelectItem value="afval">Afval</SelectItem>
                                              <SelectItem value="brandstof">Benzine</SelectItem>
                                              <SelectItem value="eigen_verbruik">Eigen verbruik</SelectItem>
                                              <SelectItem value="hotel">Hotel</SelectItem>
                                              <SelectItem value="telefoon">Telefoon</SelectItem>
                                              <SelectItem value="leadkosten">Leadkosten</SelectItem>
                                              <SelectItem value="overig">Overig</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">Offerte (per regel)</Label>
                                          <Select
                                            value={safeString(item.offerte_id) || 'none'}
                                            onValueChange={(value) =>
                                              updateLineItem(index, {
                                                offerte_id: value === 'none' ? null : value,
                                              })
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Niet gekoppeld" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="none">Niet gekoppeld</SelectItem>
                                              {quotes.map((quote) => (
                                                <SelectItem key={`${index}-${quote.id}`} value={quote.id}>
                                                  {quote.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Aantal</p>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={item.quantity}
                                            onChange={(event) =>
                                              updateLineItem(index, {
                                                quantity: safeNumber(event.target.value),
                                              })
                                            }
                                            placeholder="Aantal"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Eenheid</p>
                                          <Input
                                            value={item.unit}
                                            onChange={(event) =>
                                              updateLineItem(index, { unit: event.target.value })
                                            }
                                            placeholder="Eenheid"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Prijs/stuk (excl.)</p>
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price}
                                            onChange={(event) =>
                                              updateLineItem(index, {
                                                unit_price: safeNumber(event.target.value),
                                              })
                                            }
                                            placeholder="Prijs/stuk"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Excl.</p>
                                          <Input value={formatCurrency(lineExcl)} disabled />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">BTW</p>
                                          <Input value={formatCurrency(lineBtw)} disabled />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Incl.</p>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={lineIncl}
                                            onChange={(event) =>
                                              updateLineItemFromInclBtw(index, safeNumber(event.target.value))
                                            }
                                            placeholder="Incl. BTW"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-muted-foreground">Actie</p>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 w-full"
                                            onClick={() => removeLineItem(index)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>BTW %</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={form.btwPercentage}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        btwPercentage: safeNumber(event.target.value),
                                      }))
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Ontvangen bon (URL)</Label>
                                  <Input
                                    value={form.receiptUrl}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        receiptUrl: event.target.value,
                                      }))
                                    }
                                    placeholder="https://..."
                                  />
                                </div>
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.manualOverride}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setForm((prev) => ({
                                      ...prev,
                                      manualOverride: checked,
                                      amountExcl: checked ? lineItemsTotal : prev.amountExcl,
                                    }));
                                  }}
                                />
                                Bedrag excl. BTW handmatig overschrijven
                              </label>

                              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 bg-background/40 p-4 md:grid-cols-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Excl. BTW</p>
                                  {form.manualOverride ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={form.amountExcl}
                                      onChange={(event) =>
                                        setForm((prev) => ({
                                          ...prev,
                                          amountExcl: safeNumber(event.target.value),
                                        }))
                                      }
                                    />
                                  ) : (
                                    <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(lineItemsTotal)}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">BTW</p>
                                  <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(btwAmount)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Incl. BTW</p>
                                  <p className="mt-1 text-sm font-semibold text-emerald-300">{formatCurrency(amountIncl)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Regels</p>
                                  <p className="mt-1 text-sm font-semibold text-foreground">{normalizedLineItems.length}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>

                      <DialogFooter className="border-t border-border/70 px-6 py-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCreateOpen(false)}
                          disabled={saving || dismissingPendingImport}
                        >
                          Annuleren
                        </Button>
                        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {saving ? 'Opslaan...' : (isEditingCost ? 'Wijzigingen opslaan' : 'Opslaan')}
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {filterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={filter === option.value ? 'default' : 'ghost'}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-9 rounded-full px-4 transition-all duration-200',
                      filter === option.value
                        ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                        : 'border border-border/70 bg-transparent text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200'
                    )}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>{option.label}</span>
                      <span
                        className={cn(
                          'mt-0.5 text-[10px] font-medium tabular-nums',
                          filter === option.value ? 'text-white/85' : 'text-muted-foreground'
                        )}
                      >
                        {formatCurrency(tabTotals[option.value])}
                        {tabLineCounts[option.value] > 0 ? ` · ${tabLineCounts[option.value]} regels` : ''}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {activeFinanceTab ? (
            <BankOverzichtContent embedded requestedTabId={activeFinanceTab} />
          ) : viewMode === 'pdfs' ? (
            <KostenPdfTab costs={costs} quoteById={quoteById} onOpenCost={handleOpenCost} />
          ) : error ? null : filteredCosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">Geen kosten gevonden</div>
                <div className="text-sm text-muted-foreground">
                  Voeg je eerste leverancierkost toe om winst per project te volgen.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200 dark:hover:text-emerald-100"
                  onClick={openCreateDialog}
                >
                  Nieuwe kost
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border border-border bg-card/40 sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] border-collapse text-sm">
                    <thead className="border-b border-border bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-[110px] px-3 py-2.5">Datum</th>
                        <th className="min-w-[180px] px-3 py-2.5">Leverancier</th>
                        <th className="w-[120px] px-3 py-2.5">Categorie</th>
                        <th className="min-w-[220px] px-3 py-2.5">Offerte / klant</th>
                        <th className="w-[70px] px-3 py-2.5 text-center">Bon</th>
                        <th className="w-[120px] px-3 py-2.5 text-right">Excl. BTW</th>
                        <th className="w-[105px] px-3 py-2.5 text-right">BTW</th>
                        <th className="w-[150px] px-3 py-2.5 text-right">Incl. BTW</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {filteredCosts.map((cost) => {
                        const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
                        const linkedLabel = quote
                          ? (quote.offerteNummer ? `#${quote.offerteNummer}` : quote.label)
                          : 'Niet gekoppeld';
                        const hasReceipt = (Array.isArray(cost.receipt_files) && cost.receipt_files.length > 0) || Boolean(cost.receipt_url);

                        return (
                          <tr
                            key={`table-${cost.id}`}
                            className={cn(
                              'cursor-pointer bg-background/10 transition-colors hover:bg-muted/30'
                            )}
                            onClick={() => handleOpenCost(cost)}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDateLabel(cost.date)}</td>
                            <td className="max-w-[260px] px-3 py-2.5">
                              <div className="truncate font-medium text-foreground">{cost.supplier_name || 'Onbekende leverancier'}</div>
                              {cost.description ? (
                                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={cost.description}>
                                  {cost.description}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className="rounded px-1.5 py-0 text-[11px] font-medium">
                                {PROJECT_COST_CATEGORY_LABELS[cost.category]}
                              </Badge>
                            </td>
                            <td className="max-w-[280px] px-3 py-2.5">
                              <div className="truncate text-foreground">{linkedLabel}</div>
                              {quote?.clientName ? <div className="truncate text-xs text-muted-foreground">{quote.clientName}</div> : null}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {hasReceipt ? <Receipt className="mx-auto h-4 w-4 text-emerald-400" aria-label="Bon gekoppeld" /> : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrency(cost.amount_excl_btw || 0)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(cost.btw_amount || 0)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{formatCurrency(cost.amount_incl_btw || 0)}</span>
                                {isHistoricalSourceCost(cost) ? (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Bron vóór Knab</Badge>
                                ) : !isBankTransactionCost(cost) ? <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    requestDeleteCost(cost);
                                  }}
                                  disabled={deletingCostId === cost.id}
                                  title="Verwijder kost"
                                  aria-label={`Verwijder kost van ${cost.supplier_name || 'leverancier'}`}
                                >
                                  {deletingCostId === cost.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Bank</Badge>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <span>{filteredCosts.length} {filteredCosts.length === 1 ? 'kost' : 'kosten'}</span>
                  <span className="font-semibold tabular-nums text-foreground">Totaal incl. BTW: {formatCurrency(filteredCosts.reduce((sum, cost) => sum + safeNumber(cost.amount_incl_btw), 0))}</span>
                </div>
              </div>

            <div className="space-y-2 sm:hidden">
              {filteredCosts.map((cost) => {
                const quote = cost.offerte_id ? quoteById.get(cost.offerte_id) : null;
                const linkedLabel = quote
                  ? (quote.offerteNummer ? `Offerte #${quote.offerteNummer}` : quote.label)
                  : 'Niet gekoppeld';
                const linkedClientName = quote ? quote.clientName : '';

                return (
                  <div
                    key={cost.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group cursor-pointer rounded-xl border border-l-4 border-border/80 border-l-emerald-500/70 bg-card/75 px-4 py-3 shadow-sm transition-all duration-200 hover:bg-card hover:border-border hover:shadow-md sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70'
                    )}
                    onClick={() => handleOpenCost(cost)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpenCost(cost);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-foreground sm:text-lg">
                          {cost.supplier_name || 'Onbekende leverancier'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline" className={categoryBadgeClass(cost.category)}>
                            {PROJECT_COST_CATEGORY_LABELS[cost.category]}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Link2 className="h-3.5 w-3.5" />
                            {linkedLabel}
                          </span>
                          {linkedClientName ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              Klant: {linkedClientName}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDateLabel(cost.date)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            Geplaatst: {formatDateLabel(cost.created_at)}
                          </span>
                          {(Array.isArray(cost.receipt_files) && cost.receipt_files.length > 0) || cost.receipt_url ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <Receipt className="h-3.5 w-3.5" />
                              Bon gekoppeld
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Incl. BTW</div>
                          <div className="text-2xl font-bold tabular-nums text-emerald-300">
                            {formatCurrency(cost.amount_incl_btw || 0)}
                          </div>
                        </div>
                        {!isBankTransactionCost(cost) ? <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenCost(cost);
                            }}
                            title="Bewerk kost"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-red-300"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDeleteCost(cost);
                            }}
                            disabled={deletingCostId === cost.id}
                            title="Verwijder kost"
                          >
                            {deletingCostId === cost.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div> : <Badge variant="outline" className="text-xs text-muted-foreground">Banktransactie</Badge>}
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

      <Dialog open={Boolean(selectedBankCost)} onOpenChange={(open) => !open && setSelectedBankCost(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          {selectedBankCost ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedBankCost.supplier_name || 'Knab-transactie'}</DialogTitle>
                <DialogDescription>
                  Knab-afschrijving van {formatDateLabel(selectedBankCost.date)}. De banktransactie bepaalt het bedrag; documenten leveren de onderbouwing en btw.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Incl. btw</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(selectedBankCost.amount_incl_btw)}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <Label htmlFor="bank-cost-category" className="text-xs font-normal text-muted-foreground">Categorie</Label>
                  <Select
                    value={bankCategoryDraft}
                    onValueChange={(value) => setBankCategoryDraft(normalizeProjectCostCategory(value))}
                    disabled={savingBankCategory}
                  >
                    <SelectTrigger id="bank-cost-category" className="mt-1 h-9 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROJECT_COST_CATEGORY_LABELS).filter(([value]) => value !== 'profit').map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Excl. btw</div>
                  <div className="mt-1 font-medium tabular-nums">{formatCurrency(selectedBankCost.amount_excl_btw)}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Btw</div>
                  <div className="mt-1 font-medium tabular-nums">{formatCurrency(selectedBankCost.btw_amount)}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3 sm:col-span-2">
                  <Label htmlFor="bank-cost-offerte" className="text-xs font-normal text-muted-foreground">Klant / offerte</Label>
                  <Select
                    value={bankOfferteDraft || 'none'}
                    onValueChange={(value) => setBankOfferteDraft(value === 'none' ? '' : value)}
                    disabled={savingBankCategory || savingBankOfferte}
                  >
                    <SelectTrigger id="bank-cost-offerte" className="mt-1 bg-background">
                      <SelectValue placeholder="Niet gekoppeld" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Niet gekoppeld</SelectItem>
                      {quotes.map((quote) => (
                        <SelectItem key={quote.id} value={quote.id}>{quote.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">De gekozen klant komt uit de gekoppelde offerte. De bankafschrijving blijft één keer meetellen.</p>
                </div>
              </div>

              <div className="space-y-1 rounded-md border border-border p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bankomschrijving</div>
                <div className="break-words text-sm">{selectedBankCost.description || 'Geen omschrijving'}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Facturen en bonnen</div>
                {selectedBankCost.receipt_files.length > 0 ? (
                  <div className="space-y-2">
                    {selectedBankCost.receipt_files.map((file, index) => (
                      <a
                        key={file.path || file.url || `${file.filename}-${index}`}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Receipt className="h-4 w-4 shrink-0 text-emerald-400" />
                          <span className="truncate">{file.filename || `Document ${index + 1}`}</span>
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                ) : selectedBankCost.receipt_url ? (
                  <a
                    href={selectedBankCost.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-emerald-400" />Bekijk document</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    Nog geen factuur of bon aan deze banktransactie gekoppeld.
                  </div>
                )}
              </div>

              {selectedBankCost.line_items.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Inhoud document</div>
                  <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                    {selectedBankCost.line_items.map((item, index) => (
                      <div key={`${item.description}-${index}`} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                        <span className="min-w-0 break-words">{item.description || 'Kostenregel'}</span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(item.total_incl_btw ?? item.total_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedBankCost(null)}>Sluiten</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSaveBankOfferte()}
                  disabled={savingBankOfferte || bankOfferteDraft === safeString(selectedBankCost.offerte_id)}
                >
                  {savingBankOfferte ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Klant opslaan
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveBankCategory()}
                  disabled={savingBankCategory || bankCategoryDraft === selectedBankCost.category}
                >
                  {savingBankCategory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Categorie opslaan
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(costPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingCostId) setCostPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kost verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze kost van “{costPendingDelete?.supplier_name || 'de leverancier'}” wilt verwijderen?
              Deze actie kan je niet ongedaan maken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" disabled={Boolean(deletingCostId)}>
                Annuleren
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild onClick={() => void handleDeleteCost(costPendingDelete)}>
              <Button type="button" variant="destructive" disabled={Boolean(deletingCostId)}>
                {deletingCostId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {deletingCostId ? 'Verwijderen...' : 'Verwijderen'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={cn('fixed bottom-5 right-4 z-40 gap-2 sm:hidden', viewMode === 'kosten' ? 'flex' : 'hidden')}>
        <Button
          type="button"
          variant="outline"
          className="h-12 gap-2 rounded-full border-emerald-500/50 bg-card px-4 text-emerald-200 shadow-lg shadow-emerald-900/20 hover:bg-emerald-500/10 hover:text-emerald-100"
          onClick={() => quickPhotoInputRef.current?.click()}
        >
          <Camera className="h-4 w-4" />
          Foto
        </Button>
        <Button
          type="button"
          className="h-12 gap-2 rounded-full px-4 shadow-lg shadow-emerald-900/30"
          onClick={openCreateDialog}
        >
          <Plus className="h-4 w-4" />
          Nieuwe kost
        </Button>
      </div>
    </div>
  );
}

export default function KostenPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <KostenPageContent />
    </Suspense>
  );
}
