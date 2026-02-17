'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { CheckCircle2, Download, Loader2, Mail, ReceiptText, Settings } from 'lucide-react';
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
import { toast } from '@/hooks/use-toast';
import {
  invoiceImpliesAccepted,
  promoteInvoiceRelatedQuotesToAcceptedInTransaction,
} from '@/lib/quote-status';

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

function nextStatusAfterPayment(total: number, paidAmount: number, current: InvoiceStatus): InvoiceStatus {
  const openAmount = Math.max(0, total - paidAmount);
  if (openAmount === 0) return 'betaald';
  if (paidAmount > 0 && openAmount > 0) return 'gedeeltelijk_betaald';
  return current;
}

type InvoicePdfSettings = {
  issueDateISO: string;
  paymentTermDays: number;
  showLogo: boolean;
  showQuoteReference: boolean;
  showSpecification: boolean;
  showTotalsBreakdown: boolean;
  showBankDetails: boolean;
  customPaymentText: string;
};

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

  const [sendOpen, setSendOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Payment form
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<InvoicePayment['method']>('bank');
  const [payReference, setPayReference] = useState<string>('');
  const [payNote, setPayNote] = useState<string>('');
  const [paySaving, setPaySaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [activeTab, setActiveTab] = useState<'pdf' | 'overzicht' | 'betalingen'>('pdf');
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

  useEffect(() => {
    if (!invoice || pdfSettingsInitialized) return;

    const fallbackIssueDate = issueDate || new Date();
    const fallbackDueDate = dueDate
      || addDays(fallbackIssueDate, Math.max(1, settings?.standaardBetaaltermijnDagen || 14));
    const inferredTerm = clampPaymentTermDays(
      Math.max(1, differenceInDays(fallbackDueDate, fallbackIssueDate))
    );

    const stored = (invoice as any)?.pdfSettings || {};
    const initialSettings: InvoicePdfSettings = {
      issueDateISO: parseDateOnlyISO((stored?.issueDateISO || '').toString())
        ? (stored.issueDateISO as string)
        : toDateOnlyISO(fallbackIssueDate),
      paymentTermDays: clampPaymentTermDays(
        Number(
          stored?.paymentTermDays
          ?? stored?.betalingstermijnDagen
          ?? inferredTerm
        )
      ),
      showLogo: stored?.showLogo !== false,
      showQuoteReference: stored?.showQuoteReference !== false,
      showSpecification: stored?.showSpecification !== false,
      showTotalsBreakdown: stored?.showTotalsBreakdown !== false,
      showBankDetails: stored?.showBankDetails !== false,
      customPaymentText:
        typeof stored?.customPaymentText === 'string'
          ? stored.customPaymentText
          : (settings?.standaardFactuurTekst || ''),
    };

    setInvoicePdfSettings(initialSettings);
    lastSavedPdfSettingsRef.current = JSON.stringify(initialSettings);
    setPdfSettingsInitialized(true);
  }, [
    invoice,
    pdfSettingsInitialized,
    issueDate,
    dueDate,
    settings?.standaardBetaaltermijnDagen,
    settings?.standaardFactuurTekst,
  ]);

  const effectiveIssueDate = useMemo(() => {
    const parsed = parseDateOnlyISO(invoicePdfSettings?.issueDateISO || '');
    if (parsed) return parsed;
    return issueDate || new Date();
  }, [invoicePdfSettings?.issueDateISO, issueDate]);

  const effectivePaymentTermDays = useMemo(
    () => clampPaymentTermDays(Number(invoicePdfSettings?.paymentTermDays ?? settings?.standaardBetaaltermijnDagen ?? 14)),
    [invoicePdfSettings?.paymentTermDays, settings?.standaardBetaaltermijnDagen]
  );

  const effectiveDueDate = useMemo(
    () => addDays(effectiveIssueDate, effectivePaymentTermDays),
    [effectiveIssueDate, effectivePaymentTermDays]
  );

  useEffect(() => {
    if (!invoicePdfSettings || !pdfSettingsInitialized || !firestore || !invoiceId) return;

    const signature = JSON.stringify(invoicePdfSettings);
    if (signature === lastSavedPdfSettingsRef.current) return;

    setSavingPdfSettings(true);
    if (pdfSettingsSaveTimerRef.current) {
      clearTimeout(pdfSettingsSaveTimerRef.current);
    }

    pdfSettingsSaveTimerRef.current = setTimeout(async () => {
      try {
        const invRef = doc(firestore, 'invoices', invoiceId);
        await updateDoc(invRef, {
          pdfSettings: invoicePdfSettings,
          issueDate: Timestamp.fromDate(effectiveIssueDate),
          dueDate: Timestamp.fromDate(effectiveDueDate),
          updatedAt: serverTimestamp(),
        } as any);

        lastSavedPdfSettingsRef.current = signature;
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
    effectiveIssueDate,
    effectiveDueDate,
  ]);

  const pdfData: PDFInvoiceData | null = useMemo(() => {
    if (!invoice || !settings) return null;

    const bedrijfNaam = settings.bedrijfsnaam || businessData?.bedrijfsnaam || '';
    const klant = invoice.sourceQuote?.klantSnapshot;
    if (!bedrijfNaam || !klant) return null;

    const invoiceType = (invoice as any)?.invoiceType ?? 'eind';
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
      betreftOfferte: invoicePdfSettings?.showQuoteReference !== false
        ? (invoice.sourceQuote?.offerteNummer ? `Offerte #${invoice.sourceQuote.offerteNummer}` : undefined)
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
        naam: klant.naam || '',
        adres: klant.adres || '',
        postcode: klant.postcode || '',
        plaats: klant.plaats || '',
        telefoon: klant.telefoon || '',
        email: klant.email || '',
      },
      totals: {
        totaalExclBtw: invoicePdfSettings?.showTotalsBreakdown === false ? undefined : invoice.totalsSnapshot?.totaalExclBtw,
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
      standaardFactuurTekst: (invoicePdfSettings?.customPaymentText || settings.standaardFactuurTekst || '').trim(),
      calculationSnapshot: invoice.calculationSnapshot ?? null,
    };
  }, [invoice, settings, businessData, effectiveIssueDate, effectiveDueDate, invoicePdfSettings]);

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

        tx.update(invRef, {
          status: 'betaald',
          'paymentSummary.paidAmount': nextPaidAmount,
          'paymentSummary.openAmount': 0,
          'paymentSummary.lastPaymentAt': data?.paymentSummary?.lastPaymentAt ?? serverTimestamp(),
          paidAt: data?.paidAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await promoteInvoiceRelatedQuotesToAcceptedInTransaction(tx, firestore, data);
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

    const amount = Number(String(payAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
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
        tx.set(paymentRef, {
          amount,
          date: paymentDate,
          method: payMethod,
          reference: payReference || '',
          note: payNote || '',
          createdAt: serverTimestamp(),
        });

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

        tx.update(invRef, update);

        if (invoiceImpliesAccepted(newStatus)) {
          await promoteInvoiceRelatedQuotesToAcceptedInTransaction(tx, firestore, inv);
        }
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
  const invoiceType = (invoice as any)?.invoiceType ?? 'eind';
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
          onValueChange={(value) => setActiveTab(value as 'pdf' | 'overzicht' | 'betalingen')}
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
                        <Label>Betalingstermijn (dagen)</Label>
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
                      </div>
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
              <div><span className="text-muted-foreground">Vervaldatum:</span> {effectiveDueDate.toLocaleDateString('nl-NL')}</div>
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

              {invoiceType === 'eind' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Bedrag aanpassen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nieuw bedrag (incl. BTW)</Label>
                      <Input
                        value={overrideAmount}
                        onChange={(e) => setOverrideAmount(e.target.value)}
                        placeholder="bijv. 1250,00"
                      />
                      <div className="text-xs text-muted-foreground">
                        Laat leeg om niet te wijzigen. Dit overschrijft het eindfactuurbedrag.
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
                        const parsed = Number(String(overrideAmount).replace(',', '.'));
                        if (!overrideAmount.trim()) return;
                        if (!Number.isFinite(parsed) || parsed < 0) {
                          toast({ title: 'Ongeldig bedrag', description: 'Vul een geldig bedrag in.', variant: 'destructive' });
                          return;
                        }
                        setOverrideSaving(true);
                        try {
                          const invRef = doc(firestore!, 'invoices', invoiceId);
                          await updateDoc(invRef, {
                            'totalsSnapshot.totaalInclBtw': parsed,
                            'paymentSummary.openAmount': Math.max(0, parsed - (invoice.paymentSummary?.paidAmount ?? 0)),
                            'financialAdjustments.opmerking': overrideReason || '',
                            updatedAt: serverTimestamp(),
                          });
                          setOverrideAmount('');
                          setOverrideReason('');
                          toast({ title: 'Opgeslagen', description: 'Eindfactuurbedrag is aangepast.' });
                        } catch (e) {
                          console.error(e);
                          toast({ title: 'Fout', description: 'Kon bedrag niet opslaan.', variant: 'destructive' });
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
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Notities</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={invoice.notes || ''} readOnly className="min-h-[120px]" />
                  <div className="text-xs text-muted-foreground mt-2">
                    Notities zijn in v1 read-only (kan later editable gemaakt worden).
                  </div>
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
        vervaldatum={effectiveDueDate.toLocaleDateString('nl-NL')}
        totaalInclBtw={totaalIncl}
        bedrijfsnaam={settings?.bedrijfsnaam || businessData?.bedrijfsnaam || ''}
        iban={settings?.iban || undefined}
        onDownloadPDF={handleDownloadPdf}
      />
    </div>
  );
}
