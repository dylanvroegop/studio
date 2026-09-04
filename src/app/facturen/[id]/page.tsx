'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getIdTokenResult } from 'firebase/auth';
import { CheckCircle2, Download, Euro, Loader2, Mail, MessageCircle, ReceiptText, Settings, StickyNote } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import type { Invoice, InvoicePayment, InvoiceStatus } from '@/lib/types';
import type { UserSettings } from '@/lib/types-settings';
import { InvoiceStatusBadge } from '@/components/invoice/InvoiceStatusBadge';
import { PDFPreviewInvoice } from '@/components/invoice/PDFPreviewInvoice';
import type { PDFInvoiceData } from '@/lib/generate-invoice-pdf';
import { generateInvoicePDF } from '@/lib/generate-invoice-pdf';
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal';
import { SendQuoteWhatsAppModal } from '@/components/quote/SendQuoteWhatsAppModal';
import { toast } from '@/hooks/use-toast';
import {
  invoiceImpliesAccepted,
  promoteInvoiceRelatedQuotesToAcceptedInTransaction,
} from '@/lib/quote-status';
import type { DataJson } from '@/lib/quote-calculations';
import { parsePriceToNumber } from '@/lib/utils';
import { formatOfferteNummerLabel } from '@/lib/quote-number';

function naarDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatCurrency(amount?: number) {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatAmountInput(amount?: number) {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parseOptionalAmountInput(value: string): number | null {
  if (!value.trim()) return 0;
  return parsePriceToNumber(value);
}

function isTruncatedText(value: string): boolean {
  return value.includes('...') || value.includes('…');
}

function addCleanCandidate(target: string[], value: unknown) {
  if (typeof value !== 'string') return;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned && !target.includes(cleaned)) target.push(cleaned);
}

function collectDescriptionCandidates(source: unknown, target: string[]) {
  if (!source || typeof source !== 'object') return;
  const record = source as Record<string, any>;
  addCleanCandidate(target, record.korteTitel);
  addCleanCandidate(target, record.korte_titel);
  addCleanCandidate(target, record.title);
  addCleanCandidate(target, record.titel);

  const structured = record.werkbeschrijving_structured || record.werkbeschrijvingStructured;
  if (structured && typeof structured === 'object') {
    addCleanCandidate(target, structured.title);
    if (Array.isArray(structured.jobs)) {
      structured.jobs.forEach((job: any) => addCleanCandidate(target, job?.title));
    }
  }

  const jobs = record.werkbeschrijving_jobs || record.werkbeschrijvingJobs;
  if (Array.isArray(jobs)) {
    jobs.forEach((job: any) => addCleanCandidate(target, job?.title || job?.korteTitel || job?.korte_titel));
  }
}

function resolveInvoiceDescriptionFallback(invoice: Invoice, snapshot: DataJson | null): string {
  const candidates: string[] = [];
  collectDescriptionCandidates(snapshot, candidates);
  collectDescriptionCandidates((invoice as any).calculationSnapshot, candidates);
  collectDescriptionCandidates(invoice.sourceQuote, candidates);
  addCleanCandidate(candidates, invoice.sourceQuote?.titel);

  return candidates.find((candidate) => !isTruncatedText(candidate)) || candidates[0] || '';
}

function mergeCalculationSnapshotWithQuote(snapshot: DataJson | null | undefined, quoteData: any): DataJson | null {
  if (!snapshot && !quoteData) return null;

  const base = ((snapshot || quoteData?.calculationSnapshot || quoteData?.data_json || {}) as Record<string, unknown>);
  const baseInst = (base.instellingen || {}) as Record<string, unknown>;
  const quoteSettings = quoteData?.instellingen && typeof quoteData.instellingen === 'object'
    ? quoteData.instellingen
    : undefined;
  const quoteExtras = quoteData?.extras && typeof quoteData.extras === 'object'
    ? quoteData.extras
    : undefined;
  const baseHourlyRate = parsePriceToNumber(String(baseInst.uurTariefExclBtw ?? baseInst.uurTarief ?? ''));
  const quoteHourlyRateSource = typeof quoteSettings?.uurTariefSource === 'string'
    ? quoteSettings.uurTariefSource
    : '';
  const quoteHourlyRateIsExplicit = quoteHourlyRateSource === 'custom';
  const effectiveHourlyRate = baseHourlyRate !== null && baseHourlyRate > 0 && !quoteHourlyRateIsExplicit
    ? baseHourlyRate
    : parsePriceToNumber(String(quoteSettings?.uurTariefExclBtw ?? quoteSettings?.uurTarief ?? '')) ?? baseHourlyRate;

  return {
    ...base,
    ...(quoteExtras ? { extras: quoteExtras } : {}),
    instellingen: {
      ...baseInst,
      ...(quoteSettings || {}),
      ...(effectiveHourlyRate !== null && effectiveHourlyRate > 0
        ? {
          uurTariefExclBtw: effectiveHourlyRate,
          uurTarief: effectiveHourlyRate,
        }
        : {}),
      extras: {
        ...((baseInst.extras || {}) as Record<string, unknown>),
        ...((quoteSettings?.extras || {}) as Record<string, unknown>),
        ...(quoteExtras || {}),
      },
    },
  } as DataJson;
}

function nextStatusAfterPayment(total: number, paidAmount: number, current: InvoiceStatus): InvoiceStatus {
  const openAmount = Math.max(0, total - paidAmount);
  if (openAmount === 0) return 'betaald';
  if (paidAmount > 0 && openAmount > 0) return 'gedeeltelijk_betaald';
  return current;
}

type InvoicePdfSettings = {
  issueDateISO: string;
  paymentTermDays: number;
  invoiceDescription: string;
  showLogo: boolean;
  showQuoteReference: boolean;
  showSpecification: boolean;
  showTotalsBreakdown: boolean;
  showMaterialLaborBreakdown: boolean;
  showTransportBreakdown: boolean;
  showHourlyRateOnInvoice: boolean;
  showBankDetails: boolean;
  customPaymentText: string;
};

type InvoicePdfDefaultSettings = Omit<InvoicePdfSettings, 'issueDateISO' | 'invoiceDescription'>;

function buildInvoicePdfDefaultSettings(settings: InvoicePdfSettings): InvoicePdfDefaultSettings {
  return {
    paymentTermDays: settings.paymentTermDays,
    showLogo: settings.showLogo,
    showQuoteReference: settings.showQuoteReference,
    showSpecification: settings.showSpecification,
    showTotalsBreakdown: settings.showTotalsBreakdown,
    showMaterialLaborBreakdown: settings.showMaterialLaborBreakdown,
    showTransportBreakdown: settings.showTransportBreakdown,
    showHourlyRateOnInvoice: settings.showHourlyRateOnInvoice,
    showBankDetails: settings.showBankDetails,
    customPaymentText: settings.customPaymentText,
  };
}

function clampPaymentTermDays(value: number): number {
  if (!Number.isFinite(value)) return 14;
  return Math.max(1, Math.min(365, Math.round(value)));
}

function toDateOnlyISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnlyISO(value: string): Date | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function differenceInDays(a: Date, b: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const aMidday = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12, 0, 0, 0);
  const bMidday = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12, 0, 0, 0);
  return Math.round((aMidday.getTime() - bMidday.getTime()) / oneDay);
}

export default function FactuurDetailPage() {
  const params = useParams();
  const invoiceId = params?.id as string;
  const router = useRouter();

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [businessData, setBusinessData] = useState<any>(null);
  const [quoteClientNumbers, setQuoteClientNumbers] = useState<{ kvk: string; btw: string }>({ kvk: '', btw: '' });
  const [quoteOfferteNummer, setQuoteOfferteNummer] = useState<number | null>(null);
  const [quoteFullDescription, setQuoteFullDescription] = useState<string>('');
  const [quoteCalculationSnapshot, setQuoteCalculationSnapshot] = useState<DataJson | null>(null);
  const [quoteDocData, setQuoteDocData] = useState<any | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [hasDeveloperWhatsAppAccess, setHasDeveloperWhatsAppAccess] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [specOriginalTotal, setSpecOriginalTotal] = useState<string>('');
  const [specVoorschotAftrek, setSpecVoorschotAftrek] = useState<string>('');
  const [specVoorschotPaidInfo, setSpecVoorschotPaidInfo] = useState<string>('');
  const [specFinalTotal, setSpecFinalTotal] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Payment form
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<InvoicePayment['method']>('bank');
  const [payReference, setPayReference] = useState<string>('');
  const [payNote, setPayNote] = useState<string>('');
  const [paySaving, setPaySaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [activeTab, setActiveTab] = useState<'pdf' | 'overzicht' | 'bedrag' | 'notities' | 'betalingen'>('pdf');
  const [pdfSettingsOpen, setPdfSettingsOpen] = useState(false);
  const [pdfSettingsInitialized, setPdfSettingsInitialized] = useState(false);
  const [invoicePdfSettings, setInvoicePdfSettings] = useState<InvoicePdfSettings | null>(null);
  const [savingPdfSettings, setSavingPdfSettings] = useState(false);
  const [pdfSettingsSavedAt, setPdfSettingsSavedAt] = useState<number | null>(null);

  const pdfSettingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPdfSettingsRef = useRef<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore || !invoiceId) return;

    setLoading(true);
    setError(null);

    const invRef = doc(firestore, 'invoices', invoiceId);
    const unsubInvoice = onSnapshot(
      invRef,
      (snap) => {
        if (!snap.exists()) {
          setInvoice(null);
          setLoading(false);
          return;
        }
        setInvoice({ ...(snap.data() as any), id: snap.id } as Invoice);
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij laden factuur:', err);
        setError(`${err.code ?? 'error'}: ${err.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    const paymentsRef = collection(firestore, 'invoices', invoiceId, 'payments');
    const unsubPayments = onSnapshot(
      paymentsRef,
      (snapshot) => {
        const arr = snapshot.docs.map((d) => ({ ...(d.data() as any), id: d.id, invoiceId } as InvoicePayment));
        arr.sort((a, b) => {
          const aT = naarDate(a.date)?.getTime() ?? 0;
          const bT = naarDate(b.date)?.getTime() ?? 0;
          return bT - aT;
        });
        setPayments(arr);
      },
      (err: any) => {
        console.error('Fout bij laden betalingen:', err);
      }
    );

    return () => {
      unsubInvoice();
      unsubPayments();
    };
  }, [user, firestore, invoiceId]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setHasDeveloperWhatsAppAccess(false);
      setWhatsAppOpen(false);
      return;
    }

    const resolveDeveloperAccess = async () => {
      try {
        const token = await getIdTokenResult(user, false);
        const allowed = token.claims.dev === true || token.claims.admin === true;
        if (cancelled) return;
        setHasDeveloperWhatsAppAccess(allowed);
        if (!allowed) setWhatsAppOpen(false);
      } catch {
        if (cancelled) return;
        setHasDeveloperWhatsAppAccess(false);
        setWhatsAppOpen(false);
      }
    };

    void resolveDeveloperAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!firestore || !invoice?.quoteId) {
      setQuoteClientNumbers({ kvk: '', btw: '' });
      setQuoteOfferteNummer(null);
      setQuoteFullDescription('');
      setQuoteDocData(null);
      return;
    }

    let cancelled = false;
    const fetchQuoteClientNumbers = async () => {
      try {
        const quoteSnap = await getDoc(doc(firestore, 'quotes', invoice.quoteId));
        const quoteData = quoteSnap.exists() ? (quoteSnap.data() as any) : {};
        const quoteNumber = Number(quoteData?.offerteNummer);
        const quoteDescriptionCandidates: string[] = [];
        collectDescriptionCandidates(quoteData?.calculationSnapshot || quoteData?.data_json, quoteDescriptionCandidates);
        collectDescriptionCandidates(quoteData, quoteDescriptionCandidates);
        addCleanCandidate(quoteDescriptionCandidates, quoteData?.werkomschrijving);
        const fullDescription = quoteDescriptionCandidates.find((candidate) => !isTruncatedText(candidate))
          || quoteDescriptionCandidates[0]
          || '';
        const klantInfo = quoteData?.klantinformatie || {};
        let kvk = getString(klantInfo.kvkNummer || klantInfo.kvk);
        let btw = getString(klantInfo.btwNummer || klantInfo.btw).toUpperCase();

        if (!kvk && !btw) {
          const clientId = getString(klantInfo.clientId);
          if (clientId) {
            const clientSnap = await getDoc(doc(firestore, 'clients', clientId));
            const client = clientSnap.exists() ? (clientSnap.data() as any) : {};
            kvk = getString(client.kvkNummer || client.kvk);
            btw = getString(client.btwNummer || client.btw).toUpperCase();
          }
        }

        if (!kvk && !btw && user) {
          const email = getString(klantInfo.emailadres || klantInfo['e-mailadres'] || klantInfo.email).toLowerCase();
          if (email) {
            const clientQuery = query(
              collection(firestore, 'clients'),
              where('userId', '==', user.uid),
              where('emailadres', '==', email)
            );
            const clientSnap = await getDocs(clientQuery);
            const client = clientSnap.docs[0]?.data() as any;
            kvk = getString(client?.kvkNummer || client?.kvk);
            btw = getString(client?.btwNummer || client?.btw).toUpperCase();
          }
        }

        if (!cancelled) {
          setQuoteClientNumbers({ kvk, btw });
          setQuoteOfferteNummer(Number.isFinite(quoteNumber) ? quoteNumber : null);
          setQuoteFullDescription(fullDescription);
          setQuoteDocData(quoteData);
        }
      } catch {
        if (!cancelled) {
          setQuoteClientNumbers({ kvk: '', btw: '' });
          setQuoteOfferteNummer(null);
          setQuoteFullDescription('');
          setQuoteDocData(null);
        }
      }
    };

    void fetchQuoteClientNumbers();
    return () => {
      cancelled = true;
    };
  }, [firestore, invoice?.quoteId, user]);

  useEffect(() => {
    if (!user || !invoice?.quoteId) {
      setQuoteCalculationSnapshot(null);
      return;
    }

    let cancelled = false;
    const fetchCalculationSnapshot = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/quotes/get-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteIds: [invoice.quoteId] }),
        });

        if (!response.ok) throw new Error('Kon calculatiegegevens niet ophalen');
        const payload = await response.json();
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        const row = rows.find((item: any) => item?.quoteid === invoice.quoteId) || rows[0];
        const snapshot = row?.data_json || null;
        if (!cancelled) setQuoteCalculationSnapshot(snapshot as DataJson | null);
      } catch (err) {
        console.error('Fout bij laden calculatiegegevens factuur:', err);
        if (!cancelled) setQuoteCalculationSnapshot(null);
      }
    };

    void fetchCalculationSnapshot();
    return () => {
      cancelled = true;
    };
  }, [invoice?.quoteId, user]);

  useEffect(() => {
    if (!user || !firestore) return;
    const fetchSettings = async () => {
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const s = userSnap.exists() ? (userSnap.data() as any)?.settings : null;
        if (s) setSettings(s as UserSettings);

        const businessRef = doc(firestore, 'businesses', user.uid);
        const businessSnap = await getDoc(businessRef);
        if (businessSnap.exists()) setBusinessData(businessSnap.data());
      } catch (e) {
        console.error('Fout bij laden instellingen/bedrijf:', e);
      }
    };
    fetchSettings();
  }, [user, firestore]);

  useEffect(() => {
    setPdfSettingsInitialized(false);
    setInvoicePdfSettings(null);
    setPdfSettingsSavedAt(null);
    lastSavedPdfSettingsRef.current = '';
  }, [invoiceId]);

  const issueDate = useMemo(() => naarDate(invoice?.issueDate), [invoice?.issueDate]);
  const dueDate = useMemo(() => naarDate(invoice?.dueDate), [invoice?.dueDate]);
  const invoiceType: 'voorschot' | 'eind' = invoice?.invoiceType === 'voorschot' ? 'voorschot' : 'eind';
  const isVoorschotInvoice = invoiceType === 'voorschot';

  useEffect(() => {
    if (!invoice) return;
    const originalTotal = Number(invoice.financialAdjustments?.originalTotalInclBtw ?? invoice.totalsSnapshot?.totaalInclBtw ?? 0);
    const voorschotAftrek = Number(invoice.financialAdjustments?.voorschotAftrekInclBtw ?? 0);
    const voorschotPaid = Number(invoice.financialAdjustments?.voorschotFactuur?.paidAmount ?? 0);
    const finalTotal = Number(invoice.totalsSnapshot?.totaalInclBtw ?? 0);

    setSpecOriginalTotal(formatAmountInput(originalTotal));
    setSpecVoorschotAftrek(formatAmountInput(voorschotAftrek));
    setSpecVoorschotPaidInfo(formatAmountInput(voorschotPaid));
    setSpecFinalTotal(formatAmountInput(finalTotal));
    setOverrideReason(getString(invoice.financialAdjustments?.opmerking));
    setInvoiceNotes(typeof invoice.notes === 'string' ? invoice.notes : '');
  }, [invoice?.id]);

  useEffect(() => {
    if (!invoice || pdfSettingsInitialized) return;

    const fallbackIssueDate = issueDate || new Date();
    const fallbackDueDate = isVoorschotInvoice
      ? fallbackIssueDate
      : (
        dueDate
        || addDays(fallbackIssueDate, Math.max(1, settings?.standaardBetaaltermijnDagen || 14))
      );
    const inferredTerm = clampPaymentTermDays(
      Math.max(1, differenceInDays(fallbackDueDate, fallbackIssueDate))
    );

    const stored = (invoice as any)?.pdfSettings || {};
    const userPdfDefaults = settings?.factuurPdfDefaults || {};
    const storedHasDescription = Object.prototype.hasOwnProperty.call(stored, 'invoiceDescription');
    const defaultDescription = quoteFullDescription || resolveInvoiceDescriptionFallback(invoice, quoteCalculationSnapshot);
    const storedDescription = getString(stored.invoiceDescription);
    const initialSettings: InvoicePdfSettings = {
      issueDateISO: parseDateOnlyISO((stored?.issueDateISO || '').toString())
        ? (stored.issueDateISO as string)
        : toDateOnlyISO(fallbackIssueDate),
      paymentTermDays: clampPaymentTermDays(
        Number(
          stored?.paymentTermDays
          ?? stored?.betalingstermijnDagen
          ?? userPdfDefaults.paymentTermDays
          ?? inferredTerm
        )
      ),
      invoiceDescription: storedHasDescription && (!isTruncatedText(storedDescription) || !defaultDescription)
        ? storedDescription
        : defaultDescription,
      showLogo: stored?.showLogo ?? userPdfDefaults.showLogo ?? true,
      showQuoteReference: stored?.showQuoteReference ?? userPdfDefaults.showQuoteReference ?? true,
      showSpecification: stored?.showSpecification ?? userPdfDefaults.showSpecification ?? true,
      showTotalsBreakdown: stored?.showTotalsBreakdown ?? userPdfDefaults.showTotalsBreakdown ?? true,
      showMaterialLaborBreakdown: stored?.showMaterialLaborBreakdown ?? userPdfDefaults.showMaterialLaborBreakdown ?? false,
      showTransportBreakdown: stored?.showTransportBreakdown ?? userPdfDefaults.showTransportBreakdown ?? false,
      showHourlyRateOnInvoice: stored?.showHourlyRateOnInvoice ?? stored?.showHoursBreakdown ?? userPdfDefaults.showHourlyRateOnInvoice ?? false,
      showBankDetails: stored?.showBankDetails ?? userPdfDefaults.showBankDetails ?? true,
      customPaymentText:
        typeof stored?.customPaymentText === 'string'
          ? stored.customPaymentText
          : (typeof userPdfDefaults.customPaymentText === 'string'
            ? userPdfDefaults.customPaymentText
            : (settings?.standaardFactuurTekst || '')),
    };

    setInvoicePdfSettings(initialSettings);
    lastSavedPdfSettingsRef.current = JSON.stringify(initialSettings);
    setPdfSettingsInitialized(true);
  }, [
    invoice,
    pdfSettingsInitialized,
    issueDate,
    dueDate,
    isVoorschotInvoice,
    settings?.standaardBetaaltermijnDagen,
    settings?.standaardFactuurTekst,
    settings?.factuurPdfDefaults,
    quoteFullDescription,
    quoteCalculationSnapshot,
  ]);

  useEffect(() => {
    if (!invoice || !invoicePdfSettings) return;
    const currentDescription = getString(invoicePdfSettings.invoiceDescription);
    const replacement = quoteFullDescription || resolveInvoiceDescriptionFallback(invoice, quoteCalculationSnapshot);
    if (!replacement || replacement === currentDescription || !isTruncatedText(currentDescription)) return;
    setInvoicePdfSettings((prev) => prev ? ({ ...prev, invoiceDescription: replacement }) : prev);
  }, [invoice, invoicePdfSettings, quoteFullDescription, quoteCalculationSnapshot]);

  const effectiveIssueDate = useMemo(() => {
    const parsed = parseDateOnlyISO(invoicePdfSettings?.issueDateISO || '');
    if (parsed) return parsed;
    return issueDate || new Date();
  }, [invoicePdfSettings?.issueDateISO, issueDate]);

  const effectivePaymentTermDays = useMemo(() => {
    if (isVoorschotInvoice) return 0;
    return clampPaymentTermDays(Number(invoicePdfSettings?.paymentTermDays ?? settings?.standaardBetaaltermijnDagen ?? 14));
  }, [isVoorschotInvoice, invoicePdfSettings?.paymentTermDays, settings?.standaardBetaaltermijnDagen]);

  const effectiveDueDate = useMemo(() => {
    if (isVoorschotInvoice) return effectiveIssueDate;
    return addDays(effectiveIssueDate, effectivePaymentTermDays);
  }, [isVoorschotInvoice, effectiveIssueDate, effectivePaymentTermDays]);

  useEffect(() => {
    if (!invoicePdfSettings || !pdfSettingsInitialized || !firestore || !invoiceId || !user) return;

    const signature = JSON.stringify(invoicePdfSettings);
    if (signature === lastSavedPdfSettingsRef.current) return;

    setSavingPdfSettings(true);
    if (pdfSettingsSaveTimerRef.current) {
      clearTimeout(pdfSettingsSaveTimerRef.current);
    }

    pdfSettingsSaveTimerRef.current = setTimeout(async () => {
      try {
        const invRef = doc(firestore, 'invoices', invoiceId);
        const userRef = doc(firestore, 'users', user.uid);
        const defaultPdfSettings = buildInvoicePdfDefaultSettings(invoicePdfSettings);
        await updateDoc(invRef, {
          pdfSettings: invoicePdfSettings,
          issueDate: Timestamp.fromDate(effectiveIssueDate),
          dueDate: Timestamp.fromDate(effectiveDueDate),
          updatedAt: serverTimestamp(),
        } as any);
        await updateDoc(userRef, {
          'settings.factuurPdfDefaults': defaultPdfSettings,
          'settings.standaardBetaaltermijnDagen': defaultPdfSettings.paymentTermDays,
          'settings.standaardFactuurTekst': defaultPdfSettings.customPaymentText,
        } as any);

        lastSavedPdfSettingsRef.current = signature;
        setSettings((prev) => prev
          ? ({
            ...prev,
            factuurPdfDefaults: defaultPdfSettings,
            standaardBetaaltermijnDagen: defaultPdfSettings.paymentTermDays,
            standaardFactuurTekst: defaultPdfSettings.customPaymentText,
          })
          : prev);
        setPdfSettingsSavedAt(Date.now());
      } catch (err) {
        console.error('Kon factuur PDF instellingen niet opslaan:', err);
      } finally {
        setSavingPdfSettings(false);
      }
    }, 650);

    return () => {
      if (pdfSettingsSaveTimerRef.current) {
        clearTimeout(pdfSettingsSaveTimerRef.current);
      }
    };
  }, [
    invoicePdfSettings,
    pdfSettingsInitialized,
    firestore,
    invoiceId,
    user,
    effectiveIssueDate,
    effectiveDueDate,
  ]);

  const pdfData: PDFInvoiceData | null = useMemo(() => {
    if (!invoice || !settings) return null;

    const bedrijfNaam = settings.bedrijfsnaam || businessData?.bedrijfsnaam || '';
    const klant = invoice.sourceQuote?.klantSnapshot;
    if (!bedrijfNaam || !klant) return null;
    const effectiveCalculationSnapshot = mergeCalculationSnapshotWithQuote(
      quoteCalculationSnapshot ?? invoice.calculationSnapshot,
      quoteDocData,
    );
    const snapshotKvk = getString((klant as any).kvkNummer || (klant as any).kvk);
    const snapshotBtw = getString((klant as any).btwNummer || (klant as any).btw).toUpperCase();
    const calculationKlantInfo = (effectiveCalculationSnapshot as any)?.klantinformatie || {};
    const klanttype = getString((klant as any).klanttype || calculationKlantInfo.klanttype);
    const isZakelijkeKlant = klanttype.toLowerCase() === 'zakelijk';
    const klantKvk = isZakelijkeKlant
      ? snapshotKvk || getString(calculationKlantInfo.kvkNummer || calculationKlantInfo.kvk) || quoteClientNumbers.kvk
      : '';
    const klantBtw = isZakelijkeKlant
      ? snapshotBtw || getString(calculationKlantInfo.btwNummer || calculationKlantInfo.btw).toUpperCase() || quoteClientNumbers.btw
      : '';
    const snapshotOfferteNummer = Number(invoice.sourceQuote?.offerteNummer);
    const offerteVersie = Number.isFinite(Number(invoice.sourceQuote?.offerteVersie))
      ? Number(invoice.sourceQuote?.offerteVersie)
      : Number(quoteDocData?.offerteVersie);
    const offerteNummer = Number.isFinite(snapshotOfferteNummer)
      ? formatOfferteNummerLabel(snapshotOfferteNummer, offerteVersie)
      : formatOfferteNummerLabel(quoteOfferteNummer, offerteVersie);

    const originalTotalInclBtw = Number(invoice.financialAdjustments?.originalTotalInclBtw ?? invoice.totalsSnapshot?.totaalInclBtw ?? 0);
    const voorschotAftrekInclBtw = Number(invoice.financialAdjustments?.voorschotAftrekInclBtw ?? 0);
    const voorschotFactuurPaidAmount = typeof invoice.financialAdjustments?.voorschotFactuur?.paidAmount === 'number'
      ? invoice.financialAdjustments.voorschotFactuur.paidAmount
      : undefined;
    return {
      invoiceType,
      invoiceNumberLabel: invoice.invoiceNumberLabel,
      issueDate: effectiveIssueDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
      dueDate: effectiveDueDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
      paymentTermDays: isVoorschotInvoice ? 0 : effectivePaymentTermDays,
      invoiceDescription: invoicePdfSettings?.invoiceDescription?.trim() || undefined,
      betreftOfferte: invoicePdfSettings?.showQuoteReference !== false
        ? (offerteNummer ? `Offerte #${offerteNummer}` : undefined)
        : undefined,
      logoUrl: invoicePdfSettings?.showLogo === false ? undefined : (settings.logoUrl || undefined),
      logoScale: settings.logoScale || 1.0,
      bedrijf: {
        naam: bedrijfNaam,
        adres: `${settings.adres || ''} ${settings.huisnummer || ''}`.trim(),
        postcode: settings.postcode || '',
        plaats: settings.plaats || '',
        telefoon: settings.telefoon || businessData?.telefoon || '',
        email: settings.email || businessData?.email || '',
        kvk: settings.kvkNummer || businessData?.kvkNummer || '',
        btw: settings.btwNummer || businessData?.btwNummer || '',
        iban: invoicePdfSettings?.showBankDetails === false ? undefined : (settings.iban || undefined),
        bankNaam: invoicePdfSettings?.showBankDetails === false ? undefined : (settings.bankNaam || undefined),
        bic: invoicePdfSettings?.showBankDetails === false ? undefined : (settings.bic || undefined),
      },
      klant: {
        klanttype,
        naam: klant.naam || '',
        adres: klant.adres || '',
        postcode: klant.postcode || '',
        plaats: klant.plaats || '',
        telefoon: klant.telefoon || '',
        email: klant.email || '',
        kvk: klantKvk,
        btw: klantBtw,
      },
      totals: {
        totaalExclBtw: invoice.totalsSnapshot?.totaalExclBtw,
        btw: invoicePdfSettings?.showTotalsBreakdown === false ? undefined : invoice.totalsSnapshot?.btw,
        totaalInclBtw: invoice.totalsSnapshot?.totaalInclBtw ?? 0,
      },
      financialAdjustments: invoiceType === 'eind' && invoicePdfSettings?.showSpecification !== false
        ? {
          originalTotalInclBtw: Number.isFinite(originalTotalInclBtw) ? originalTotalInclBtw : 0,
          voorschotAftrekInclBtw: Number.isFinite(voorschotAftrekInclBtw) ? voorschotAftrekInclBtw : 0,
          voorschotFactuurPaidAmount,
        }
        : undefined,
      showMaterialLaborBreakdown: invoicePdfSettings?.showMaterialLaborBreakdown === true,
      showTransportBreakdown: invoicePdfSettings?.showTransportBreakdown === true,
      showHourlyRateOnInvoice: invoicePdfSettings?.showHourlyRateOnInvoice === true,
      invoiceNotes: typeof invoice.notes === 'string' ? invoice.notes : '',
      standaardFactuurTekst: (invoicePdfSettings?.customPaymentText || settings.standaardFactuurTekst || '').trim(),
      laborHoursPerDay: settings.planningSettings?.defaultWorkdayHours,
      calculationSnapshot: effectiveCalculationSnapshot ?? null,
    };
  }, [invoice, settings, businessData, invoiceType, isVoorschotInvoice, effectiveIssueDate, effectiveDueDate, effectivePaymentTermDays, invoicePdfSettings, quoteClientNumbers, quoteOfferteNummer, quoteCalculationSnapshot, quoteDocData]);

  const handleDownloadPdf = async () => {
    if (!pdfData) return;
    setIsDownloading(true);
    try {
      const blob = await generateInvoicePDF(pdfData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Factuur-${pdfData.invoiceNumberLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleMarkSent = async () => {
    if (!firestore || !invoiceId) return;
    try {
      await runTransaction(firestore, async (tx) => {
        const invRef = doc(firestore, 'invoices', invoiceId);
        const snap = await tx.get(invRef);
        if (!snap.exists()) throw new Error('Factuur niet gevonden');

        const data = snap.data() as any;
        const current: InvoiceStatus = data.status;
        const next: InvoiceStatus = current === 'concept' ? 'verzonden' : current;

        tx.update(invRef, {
          status: next,
          sentAt: data.sentAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      toast({ title: 'Bijgewerkt', description: 'Factuur is gemarkeerd als verzonden.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Fout', description: 'Kon status niet bijwerken.', variant: 'destructive' });
    }
  };

  const handleMarkPaid = async () => {
    if (!firestore || !invoiceId || markingPaid) return;
    setMarkingPaid(true);
    try {
      await runTransaction(firestore, async (tx) => {
        const invRef = doc(firestore, 'invoices', invoiceId);
        const snap = await tx.get(invRef);
        if (!snap.exists()) throw new Error('Factuur niet gevonden');

        const data = snap.data() as any;
        const total = Number(data?.totalsSnapshot?.totaalInclBtw ?? 0) || 0;
        const paidNow = Number(data?.paymentSummary?.paidAmount ?? 0) || 0;
        const nextPaidAmount = Math.max(total, paidNow);

        await promoteInvoiceRelatedQuotesToAcceptedInTransaction(tx, firestore, data);

        tx.update(invRef, {
          status: 'betaald',
          'paymentSummary.paidAmount': nextPaidAmount,
          'paymentSummary.openAmount': 0,
          'paymentSummary.lastPaymentAt': data?.paymentSummary?.lastPaymentAt ?? serverTimestamp(),
          paidAt: data?.paidAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      toast({ title: 'Bijgewerkt', description: 'Factuur is gemarkeerd als betaald.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Fout', description: 'Kon status niet bijwerken.', variant: 'destructive' });
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleAddPayment = async () => {
    if (!firestore || !invoice || !invoiceId) return;

    const amount = parsePriceToNumber(payAmount);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Ongeldig bedrag', description: 'Vul een geldig bedrag in.', variant: 'destructive' });
      return;
    }

    const date = payDate ? new Date(`${payDate}T12:00:00`) : new Date();
    const paymentDate = Timestamp.fromDate(date);

    setPaySaving(true);
    try {
      await runTransaction(firestore, async (tx) => {
        const invRef = doc(firestore, 'invoices', invoiceId);
        const snap = await tx.get(invRef);
        if (!snap.exists()) throw new Error('Factuur niet gevonden');

        const inv = snap.data() as any;
        const total = Number(inv?.totalsSnapshot?.totaalInclBtw ?? 0) || 0;
        const paidNow = Number(inv?.paymentSummary?.paidAmount ?? 0) || 0;
        const newPaid = paidNow + amount;
        const newOpen = Math.max(0, total - newPaid);

        const currentStatus: InvoiceStatus = inv?.status ?? 'concept';
        const newStatus = nextStatusAfterPayment(total, newPaid, currentStatus);

        const paymentRef = doc(collection(firestore, 'invoices', invoiceId, 'payments'));

        const update: any = {
          'paymentSummary.paidAmount': newPaid,
          'paymentSummary.openAmount': newOpen,
          'paymentSummary.lastPaymentAt': paymentDate,
          status: newStatus,
          updatedAt: serverTimestamp(),
        };

        if (newStatus === 'betaald') {
          update.paidAt = inv?.paidAt ?? serverTimestamp();
        }

        if (invoiceImpliesAccepted(newStatus)) {
          await promoteInvoiceRelatedQuotesToAcceptedInTransaction(tx, firestore, inv);
        }

        tx.set(paymentRef, {
          amount,
          date: paymentDate,
          method: payMethod,
          reference: payReference || '',
          note: payNote || '',
          createdAt: serverTimestamp(),
        });

        tx.update(invRef, update);
      });

      setPayAmount('');
      setPayReference('');
      setPayNote('');
      toast({ title: 'Opgeslagen', description: 'Betaling toegevoegd.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Fout', description: 'Kon betaling niet opslaan.', variant: 'destructive' });
    } finally {
      setPaySaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!firestore || !invoiceId || notesSaving) return;
    setNotesSaving(true);
    try {
      const invRef = doc(firestore, 'invoices', invoiceId);
      await updateDoc(invRef, {
        notes: invoiceNotes,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Opgeslagen', description: 'Notities zijn opgeslagen en verschijnen op de factuur.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Fout', description: 'Kon notities niet opslaan.', variant: 'destructive' });
    } finally {
      setNotesSaving(false);
    }
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
        <AppNavigation />
        <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-foreground">Factuur</h1>
            </div>
            <Link href="/facturen" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Facturen
            </Link>
          </div>
        </header>
        <main className="flex flex-col items-center p-6">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-8 text-center space-y-3">
              <div className="font-semibold">Factuur niet gevonden</div>
              <Button asChild variant="outline">
                <Link href="/facturen">Terug naar facturen</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const totaalIncl = invoice.totalsSnapshot?.totaalInclBtw ?? 0;
  const paid = invoice.paymentSummary?.paidAmount ?? 0;
  const open = invoice.paymentSummary?.openAmount ?? Math.max(0, totaalIncl - paid);
  const klantNaam = invoice.sourceQuote?.klantSnapshot?.naam || 'Onbekende klant';
  const typeLabel = invoiceType === 'voorschot' ? 'Voorschotfactuur' : 'Eindfactuur';

  return (
    <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
      <AppNavigation />
      <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <ReceiptText className="h-5 w-5 text-emerald-400" />
                <h1 className="text-xl font-bold text-foreground">
                  {typeLabel} #{invoice.invoiceNumberLabel}
                </h1>
                <Link href="/facturen" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Facturen
                </Link>
              </div>
              <p className="text-muted-foreground text-sm">{klantNaam}</p>
            </div>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            {invoiceType === 'voorschot' && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none gap-2"
                onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(invoice.quoteId)}&type=eind`)}
              >
                Maak eindfactuur
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none gap-2"
              onClick={() => setSendOpen(true)}
              disabled={!pdfData}
            >
              <Mail className="h-4 w-4" />
              Versturen
            </Button>
            {hasDeveloperWhatsAppAccess && (
              <Button
                type="button"
                variant="success"
                className="flex h-10 w-10 shrink-0 items-center justify-center p-0"
                onClick={() => setWhatsAppOpen(true)}
                disabled={!pdfData}
                aria-label="WhatsApp"
                title="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="success"
              className="flex-1 sm:flex-none gap-2"
              onClick={handleDownloadPdf}
              disabled={!pdfData || isDownloading}
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 pb-10 sm:p-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'pdf' | 'overzicht' | 'bedrag' | 'notities' | 'betalingen')}
          className="space-y-6"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-1 rounded-lg w-full">
            <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap justify-start w-full sm:w-auto">
              <TabsTrigger value="pdf" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <Download className="h-4 w-4" /> PDF
              </TabsTrigger>
              <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <ReceiptText className="h-4 w-4" /> Overzicht
              </TabsTrigger>
              {invoiceType === 'eind' ? (
                <TabsTrigger value="bedrag" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                  <Euro className="h-4 w-4" /> Bedrag
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="notities" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <StickyNote className="h-4 w-4" /> Notities
              </TabsTrigger>
              <TabsTrigger value="betalingen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" /> Betalingen
              </TabsTrigger>
            </TabsList>

            {activeTab === 'pdf' && invoicePdfSettings ? (
              <Dialog open={pdfSettingsOpen} onOpenChange={setPdfSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground mr-1">
                    <Settings className="h-4 w-4 mr-2" />
                    PDF instellingen
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
                  <DialogHeader className="px-6 pt-6">
                    <DialogTitle>PDF instellingen</DialogTitle>
                    <DialogDescription>
                      Bepaal hoe de factuur-PDF wordt opgebouwd.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="px-6 pb-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Factuurdatum</Label>
                        <Input
                          type="date"
                          value={invoicePdfSettings.issueDateISO}
                          onChange={(event) =>
                            setInvoicePdfSettings((prev) => prev ? ({ ...prev, issueDateISO: event.target.value }) : prev)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Betalingstermijn</Label>
                        {isVoorschotInvoice ? (
                          <Input type="text" value="Direct" disabled readOnly />
                        ) : (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Dagen</Label>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              value={invoicePdfSettings.paymentTermDays}
                              onChange={(event) =>
                                setInvoicePdfSettings((prev) => prev
                                  ? ({ ...prev, paymentTermDays: clampPaymentTermDays(Number(event.target.value)) })
                                  : prev)
                              }
                            />
                            <div className="text-xs text-muted-foreground">
                              Vervaldatum: {effectiveDueDate.toLocaleDateString('nl-NL')}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Omschrijving factuur</Label>
                      <Input
                        value={invoicePdfSettings.invoiceDescription}
                        onChange={(event) =>
                          setInvoicePdfSettings((prev) => prev ? ({ ...prev, invoiceDescription: event.target.value }) : prev)
                        }
                        placeholder="Bijv. wandpaneel plaatsen"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showLogo}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showLogo: event.target.checked }) : prev)}
                        />
                        <span>Logo tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showQuoteReference}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showQuoteReference: event.target.checked }) : prev)}
                        />
                        <span>Offerte-referentie tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showSpecification}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showSpecification: event.target.checked }) : prev)}
                        />
                        <span>Specificatieblok tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showTotalsBreakdown}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showTotalsBreakdown: event.target.checked }) : prev)}
                        />
                        <span>Subtotaal + BTW tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm md:col-span-2">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showMaterialLaborBreakdown}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showMaterialLaborBreakdown: event.target.checked }) : prev)}
                        />
                        <span>Specificatie kosten tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showHourlyRateOnInvoice}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showHourlyRateOnInvoice: event.target.checked }) : prev)}
                        />
                        <span>Toon uurtarief op factuur/offerte</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showTransportBreakdown}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showTransportBreakdown: event.target.checked }) : prev)}
                        />
                        <span>Transportkosten tonen</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm md:col-span-2">
                        <input
                          type="checkbox"
                          checked={invoicePdfSettings.showBankDetails}
                          onChange={(event) => setInvoicePdfSettings((prev) => prev ? ({ ...prev, showBankDetails: event.target.checked }) : prev)}
                        />
                        <span>Bankgegevens tonen in betalingsinformatie</span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <Label>Betaaltekst</Label>
                      <Textarea
                        rows={5}
                        value={invoicePdfSettings.customPaymentText}
                        onChange={(event) =>
                          setInvoicePdfSettings((prev) => prev ? ({ ...prev, customPaymentText: event.target.value }) : prev)
                        }
                        placeholder="Bijv. Gelieve binnen de betalingstermijn te voldoen o.v.v. factuurnummer."
                      />
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {savingPdfSettings
                        ? 'PDF instellingen worden automatisch opgeslagen...'
                        : pdfSettingsSavedAt
                          ? `Automatisch opgeslagen om ${new Date(pdfSettingsSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Wijzigingen worden automatisch opgeslagen.'}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div className="space-y-6">
          {invoice.archived ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Deze factuur is gearchiveerd. Je vindt ’m terug in het <Link href="/archief?tab=facturen" className="underline underline-offset-4">archief</Link>.
            </div>
          ) : null}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ReceiptText className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-base font-semibold">Status</span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">Openstaand</div>
                  <div className="text-sm font-semibold">{formatCurrency(open)}</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div><span className="text-muted-foreground">Factuurdatum:</span> {effectiveIssueDate.toLocaleDateString('nl-NL')}</div>
              <div><span className="text-muted-foreground">Vervaldatum:</span> {isVoorschotInvoice ? 'Direct' : effectiveDueDate.toLocaleDateString('nl-NL')}</div>
              {Array.isArray((invoice as any)?.combinedContext?.quoteIds) && (invoice as any).combinedContext.quoteIds.length > 1 ? (
                <div>
                  <span className="text-muted-foreground">Gecombineerde offertes:</span>{' '}
                  {(invoice as any).combinedContext.quoteIds.length}
                </div>
              ) : null}
              {Array.isArray((invoice as any)?.linkedMeerwerkbonIds) && (invoice as any).linkedMeerwerkbonIds.length > 0 ? (
                <div>
                  <span className="text-muted-foreground">Bron meerwerkbon:</span>{' '}
                  {(invoice as any).linkedMeerwerkbonIds.join(', ')}
                </div>
              ) : null}
              <div className="pt-2 flex gap-2">
                <Button asChild variant="outline" className="h-9">
                  <Link href={`/offertes/${invoice.quoteId}`}>Open offerte</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={handleMarkSent}
                  disabled={invoice.status !== 'concept'}
                >
                  Markeer als verzonden
                </Button>
                <Button
                  type="button"
                  variant={invoice.status === 'betaald' ? 'secondary' : 'success'}
                  className="h-9 gap-2"
                  onClick={handleMarkPaid}
                  disabled={invoice.status === 'betaald' || markingPaid}
                >
                  {markingPaid ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {invoice.status === 'betaald' ? 'Betaald' : 'Markeer als betaald'}
                </Button>
              </div>
            </CardContent>
          </Card>

            <TabsContent value="pdf" className="space-y-4">
              <PDFPreviewInvoice pdfData={pdfData} />
            </TabsContent>

            <TabsContent value="overzicht" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Bedragen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Totaal (incl. BTW)</span>
                    <span className="font-semibold">{formatCurrency(totaalIncl)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Betaald</span>
                    <span className="font-semibold">{formatCurrency(paid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Openstaand</span>
                    <span className="font-semibold">{formatCurrency(open)}</span>
                  </div>
                </CardContent>
              </Card>

            </TabsContent>

            {invoiceType === 'eind' ? (
              <TabsContent value="bedrag" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Bedrag aanpassen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Origineel totaal (incl. BTW)</Label>
                        <Input
                          value={specOriginalTotal}
                          onChange={(e) => setSpecOriginalTotal(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Voorschot in mindering</Label>
                        <Input
                          value={specVoorschotAftrek}
                          onChange={(e) => setSpecVoorschotAftrek(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Reeds betaald op voorschot (info)</Label>
                        <Input
                          value={specVoorschotPaidInfo}
                          onChange={(e) => setSpecVoorschotPaidInfo(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Totaal (incl. BTW)</Label>
                        <Input
                          value={specFinalTotal}
                          onChange={(e) => setSpecFinalTotal(e.target.value)}
                          placeholder="bijv. 1.301,90"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Reden / notitie (optioneel)</Label>
                      <Textarea
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="bijv. voorschot is mondeling afgesproken"
                        className="min-h-[90px]"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="success"
                      disabled={overrideSaving}
                      onClick={async () => {
                        const originalTotal = parseOptionalAmountInput(specOriginalTotal);
                        const voorschotAftrek = parseOptionalAmountInput(specVoorschotAftrek);
                        const voorschotPaidInfo = parseOptionalAmountInput(specVoorschotPaidInfo);
                        const finalTotal = parseOptionalAmountInput(specFinalTotal);
                        if (
                          originalTotal === null
                          || voorschotAftrek === null
                          || voorschotPaidInfo === null
                          || finalTotal === null
                          || originalTotal < 0
                          || voorschotAftrek < 0
                          || voorschotPaidInfo < 0
                          || finalTotal < 0
                        ) {
                          toast({ title: 'Ongeldig bedrag', description: 'Gebruik Nederlandse bedragen zoals 1.301,90.', variant: 'destructive' });
                          return;
                        }

                        setOverrideSaving(true);
                        try {
                          const invRef = doc(firestore!, 'invoices', invoiceId);
                          const existingVoorschot = invoice.financialAdjustments?.voorschotFactuur ?? null;
                          await updateDoc(invRef, {
                            totalsSnapshot: {
                              ...invoice.totalsSnapshot,
                              totaalInclBtw: finalTotal,
                            },
                            paymentSummary: {
                              ...(invoice.paymentSummary || {}),
                              openAmount: Math.max(0, finalTotal - (invoice.paymentSummary?.paidAmount ?? 0)),
                            },
                            financialAdjustments: {
                              ...(invoice.financialAdjustments || {}),
                              originalTotalInclBtw: originalTotal,
                              voorschotAftrekInclBtw: voorschotAftrek,
                              voorschotFactuur: existingVoorschot
                                ? { ...existingVoorschot, paidAmount: voorschotPaidInfo }
                                : { invoiceId: '', invoiceNumberLabel: '', totaalInclBtw: voorschotAftrek, paidAmount: voorschotPaidInfo },
                              handmatigEindbedrag: false,
                              opmerking: overrideReason || '',
                            },
                            updatedAt: serverTimestamp(),
                          });
                          toast({ title: 'Opgeslagen', description: 'Factuurbedragen zijn aangepast.' });
                        } catch (e) {
                          console.error(e);
                          toast({ title: 'Fout', description: 'Kon bedragen niet opslaan.', variant: 'destructive' });
                        } finally {
                          setOverrideSaving(false);
                        }
                      }}
                      className="w-full"
                    >
                      {overrideSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Opslaan
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            <TabsContent value="notities" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Notities op factuur</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Notities</Label>
                    <Textarea
                      value={invoiceNotes}
                      onChange={(event) => setInvoiceNotes(event.target.value)}
                      placeholder={'Bijv.\n* Knauf Insulation Naturroll 037 Glaswol 140 mm (Rd 3,75 m²K/W) - €122,16\n* Dampremmende klimaatfolie - €139,15\n\nISDE Meldcode: KA18226'}
                      className="min-h-[220px]"
                    />
                    <div className="text-xs text-muted-foreground">
                      Deze tekst wordt als aparte notitiesectie op de factuur-PDF geplaatst.
                    </div>
                  </div>
                  <Button type="button" variant="success" onClick={handleSaveNotes} disabled={notesSaving} className="w-full">
                    {notesSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Notities opslaan
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="betalingen" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Betaling toevoegen</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Bedrag</Label>
                    <Input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="bijv. 150,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Datum</Label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Methode</Label>
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="pin">Pin</SelectItem>
                        <SelectItem value="contant">Contant</SelectItem>
                        <SelectItem value="overig">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Referentie</Label>
                    <Input
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="bijv. omschrijving / transactie-id"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notitie</Label>
                    <Textarea
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Optioneel"
                      className="min-h-[90px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      variant="success"
                      onClick={handleAddPayment}
                      disabled={paySaving}
                      className="w-full"
                    >
                      {paySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Betaling opslaan
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Betalingen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nog geen betalingen.</div>
                  ) : (
                    <div className="space-y-2">
                      {payments.map((p) => {
                        const d = naarDate(p.date);
                        return (
                          <div key={p.id} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card/50 p-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{formatCurrency(p.amount)}</div>
                              <div className="text-xs text-muted-foreground">
                                {d ? d.toLocaleDateString('nl-NL') : '-'} • {p.method}
                              </div>
                              {(p.reference || p.note) && (
                                <div className="text-xs text-muted-foreground mt-1 break-words">
                                  {[p.reference, p.note].filter(Boolean).join(' — ')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
        </div>
        </Tabs>
      </main>

      <SendInvoiceModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        klantEmail={invoice.sourceQuote?.klantSnapshot?.email || ''}
        klantAanhef={invoice.sourceQuote?.klantSnapshot?.naam || ''}
        factuurNummer={invoice.invoiceNumberLabel}
        vervaldatum={isVoorschotInvoice ? 'Direct' : effectiveDueDate.toLocaleDateString('nl-NL')}
        invoiceType={invoiceType}
        totaalInclBtw={totaalIncl}
        bedrijfsnaam={settings?.bedrijfsnaam || businessData?.bedrijfsnaam || ''}
        iban={settings?.iban || undefined}
        onDownloadPDF={handleDownloadPdf}
      />

      <SendQuoteWhatsAppModal
        isOpen={whatsAppOpen}
        onClose={() => setWhatsAppOpen(false)}
        klantInfo={{
          voornaam: invoice.sourceQuote?.klantSnapshot?.naam?.split(/\s+/)[0] || '',
          achternaam: '',
          telefoonnummer: invoice.sourceQuote?.klantSnapshot?.telefoon || '',
        } as any}
        clientName={invoice.sourceQuote?.klantSnapshot?.naam || 'klant'}
        quoteId=""
        quotePdfUrl=""
        requireDocumentUrl={false}
        documentLabel="factuur"
        documentLinkToken="{{factuur_link}}"
        storageKey="whatsapp_invoice_message_preset_v1"
        missingLinkTitle="Geen factuurlink beschikbaar"
        missingLinkDescription="De factuur-PDF wordt gedownload. Voeg deze handmatig toe in WhatsApp."
        successDescription="De factuur-PDF is gedownload. Voeg deze handmatig toe in WhatsApp en verstuur."
        onDownloadOfficialPdf={handleDownloadPdf}
        onMarkAsSent={handleMarkSent}
      />
    </div>
  );
}
