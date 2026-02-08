'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { ArrowLeft, Download, Loader2, Mail, ReceiptText } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import type { Invoice, InvoicePayment, InvoiceStatus } from '@/lib/types';
import type { UserSettings } from '@/lib/types-settings';
import { InvoiceStatusBadge } from '@/components/invoice/InvoiceStatusBadge';
import { PDFPreviewInvoice } from '@/components/invoice/PDFPreviewInvoice';
import type { PDFInvoiceData } from '@/lib/generate-invoice-pdf';
import { generateInvoicePDF } from '@/lib/generate-invoice-pdf';
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal';
import { toast } from '@/hooks/use-toast';

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

  const issueDate = useMemo(() => naarDate(invoice?.issueDate), [invoice?.issueDate]);
  const dueDate = useMemo(() => naarDate(invoice?.dueDate), [invoice?.dueDate]);

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
      issueDate: issueDate ? issueDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '-',
      dueDate: dueDate ? dueDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '-',
      betreftOfferte: invoice.sourceQuote?.offerteNummer ? `Offerte #${invoice.sourceQuote.offerteNummer}` : undefined,
      logoUrl: settings.logoUrl || undefined,
      logoScale: settings.logoScale || 1.0,
      bedrijf: {
        naam: bedrijfNaam,
        adres: settings.adres || '',
        postcode: settings.postcode || '',
        plaats: settings.plaats || '',
        telefoon: settings.telefoon || businessData?.telefoon || '',
        email: settings.email || businessData?.email || '',
        kvk: settings.kvkNummer || businessData?.kvkNummer || '',
        btw: settings.btwNummer || businessData?.btwNummer || '',
        iban: settings.iban || undefined,
        bankNaam: settings.bankNaam || undefined,
        bic: settings.bic || undefined,
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
        totaalExclBtw: invoice.totalsSnapshot?.totaalExclBtw,
        btw: invoice.totalsSnapshot?.btw,
        totaalInclBtw: invoice.totalsSnapshot?.totaalInclBtw ?? 0,
      },
      financialAdjustments: invoiceType === 'eind'
        ? {
          originalTotalInclBtw: Number.isFinite(originalTotalInclBtw) ? originalTotalInclBtw : 0,
          voorschotAftrekInclBtw: Number.isFinite(voorschotAftrekInclBtw) ? voorschotAftrekInclBtw : 0,
          voorschotFactuurPaidAmount,
        }
        : undefined,
      standaardFactuurTekst: settings.standaardFactuurTekst || '',
      calculationSnapshot: invoice.calculationSnapshot ?? null,
    };
  }, [invoice, settings, businessData, issueDate, dueDate]);

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="app-shell min-h-screen bg-background pb-10">
        <AppNavigation />
        <DashboardHeader user={user} title="Factuur" />
        <main className="flex flex-col items-center p-6">
          <Card className="w-full max-w-2xl border-white/5 bg-zinc-900/60">
            <CardContent className="p-8 text-center space-y-3">
              <div className="text-zinc-200 font-semibold">Factuur niet gevonden</div>
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
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <DashboardHeader user={user} title="Factuur" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/facturen">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              {invoiceType === 'voorschot' && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(invoice.quoteId)}&type=eind`)}
                >
                  Maak eindfactuur
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setSendOpen(true)}
                disabled={!pdfData}
              >
                <Mail className="h-4 w-4" />
                Versturen
              </Button>
              <Button
                type="button"
                variant="success"
                className="gap-2"
                onClick={handleDownloadPdf}
                disabled={!pdfData || isDownloading}
              >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <Card className="border-white/5 bg-zinc-900/60">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ReceiptText className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div className="truncate">
                    {typeLabel} #{invoice.invoiceNumberLabel}
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-zinc-500">Openstaand</div>
                  <div className="text-sm font-semibold text-zinc-100">{formatCurrency(open)}</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-300 space-y-2">
              <div><span className="text-zinc-500">Klant:</span> {klantNaam}</div>
              <div><span className="text-zinc-500">Factuurdatum:</span> {issueDate ? issueDate.toLocaleDateString('nl-NL') : '-'}</div>
              <div><span className="text-zinc-500">Vervaldatum:</span> {dueDate ? dueDate.toLocaleDateString('nl-NL') : '-'}</div>
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
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="pdf" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 h-auto p-1">
              <TabsTrigger value="pdf" className="py-2.5">PDF</TabsTrigger>
              <TabsTrigger value="overzicht" className="py-2.5">Overzicht</TabsTrigger>
              <TabsTrigger value="betalingen" className="py-2.5">Betalingen</TabsTrigger>
            </TabsList>

            <TabsContent value="pdf" className="space-y-4">
              <PDFPreviewInvoice pdfData={pdfData} />
            </TabsContent>

            <TabsContent value="overzicht" className="space-y-4">
              <Card className="border-white/5 bg-zinc-900/60">
                <CardHeader>
                  <CardTitle>Bedragen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Totaal (incl. BTW)</span>
                    <span className="font-semibold text-zinc-100">{formatCurrency(totaalIncl)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Betaald</span>
                    <span className="font-semibold text-zinc-100">{formatCurrency(paid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Openstaand</span>
                    <span className="font-semibold text-zinc-100">{formatCurrency(open)}</span>
                  </div>
                </CardContent>
              </Card>

              {invoiceType === 'eind' && (
                <Card className="border-white/5 bg-zinc-900/60">
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
                        className="bg-zinc-950/40 border-white/10"
                      />
                      <div className="text-xs text-zinc-500">
                        Laat leeg om niet te wijzigen. Dit overschrijft het eindfactuurbedrag.
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Reden / notitie (optioneel)</Label>
                      <Textarea
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="bijv. voorschot is mondeling afgesproken"
                        className="bg-zinc-950/40 border-white/10 min-h-[90px]"
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

              <Card className="border-white/5 bg-zinc-900/60">
                <CardHeader>
                  <CardTitle>Notities</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={invoice.notes || ''} readOnly className="bg-zinc-950/40 border-white/10 min-h-[120px]" />
                  <div className="text-xs text-zinc-500 mt-2">
                    Notities zijn in v1 read-only (kan later editable gemaakt worden).
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="betalingen" className="space-y-4">
              <Card className="border-white/5 bg-zinc-900/60">
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
                      className="bg-zinc-950/40 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Datum</Label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="bg-zinc-950/40 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Methode</Label>
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                      <SelectTrigger className="bg-zinc-950/40 border-white/10">
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
                      className="bg-zinc-950/40 border-white/10"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notitie</Label>
                    <Textarea
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Optioneel"
                      className="bg-zinc-950/40 border-white/10 min-h-[90px]"
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

              <Card className="border-white/5 bg-zinc-900/60">
                <CardHeader>
                  <CardTitle>Betalingen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payments.length === 0 ? (
                    <div className="text-sm text-zinc-400">Nog geen betalingen.</div>
                  ) : (
                    <div className="space-y-2">
                      {payments.map((p) => {
                        const d = naarDate(p.date);
                        return (
                          <div key={p.id} className="flex items-start justify-between gap-4 rounded-lg border border-white/5 bg-zinc-950/30 p-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-100">{formatCurrency(p.amount)}</div>
                              <div className="text-xs text-zinc-500">
                                {d ? d.toLocaleDateString('nl-NL') : '-'} • {p.method}
                              </div>
                              {(p.reference || p.note) && (
                                <div className="text-xs text-zinc-400 mt-1 break-words">
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
          </Tabs>
        </div>
      </main>

      <SendInvoiceModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        klantEmail={invoice.sourceQuote?.klantSnapshot?.email || ''}
        klantAanhef={invoice.sourceQuote?.klantSnapshot?.naam || ''}
        factuurNummer={invoice.invoiceNumberLabel}
        vervaldatum={dueDate ? dueDate.toLocaleDateString('nl-NL') : '-'}
        totaalInclBtw={totaalIncl}
        bedrijfsnaam={settings?.bedrijfsnaam || businessData?.bedrijfsnaam || ''}
        iban={settings?.iban || undefined}
        onDownloadPDF={handleDownloadPdf}
      />
    </div>
  );
}
