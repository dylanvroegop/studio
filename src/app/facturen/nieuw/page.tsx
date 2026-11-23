'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, ReceiptText, Share2 } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore, useUser } from '@/firebase';
import type { Quote } from '@/lib/types';
import type { DataJson } from '@/lib/quote-calculations';
import type { UserSettings } from '@/lib/types-settings';
import { toast } from '@/hooks/use-toast';
import { createInvoiceFromQuote } from '@/lib/invoice-actions';
import { parsePriceToNumber } from '@/lib/utils';
import { formatOfferteNummerLabel } from '@/lib/quote-number';
import { loadInvoicePreparation } from '@/lib/invoice-preparation';
import { summarizeInvoiceBilling, invoiceBillingSignature, type InvoiceBillingRow } from '@/lib/invoice-billing';
import { invoiceQuoteSignature } from '@/lib/invoice-quote-signature';
import { QuoteAdvancePayments, useQuoteAdvancePayments } from '@/components/invoice/QuoteAdvancePayments';
import { InvoiceBankPayments } from '@/components/invoice/InvoiceBankPayments';
import type { InvoiceBankView } from '@/lib/invoice-bank-matching';
import { QuoteAmountDifferenceDialog } from '@/components/invoice/QuoteAmountDifferenceDialog';
import { SharedQuoteAmountBar } from '@/components/quote/SharedQuoteAmountBar';
import { compareSharedQuoteAmount, isQuoteAmountConfirmed, type QuoteAmountComparison, type QuoteAmountConfirmation } from '@/lib/quote-shared-amount';
import { resolveInvoiceTotal } from '@/lib/invoice-total';
import { getSubsidyQuestions, invoiceSubsidySchema, suggestInvoiceSubsidy, type SubsidyMeasure } from '@/lib/invoice-subsidy';
import { InvoiceSubsidyFields } from '@/components/invoice/InvoiceSubsidyFields';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type InvoiceQuote = Quote & { title?: string; calculationSnapshot?: DataJson };

const formatCurrency = (value: number): string => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
function parseAmount(value: string): number | null {
  const parsed = parsePriceToNumber(value);
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

function NieuweFactuurPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams?.get('quoteId') || '';
  const requestedType = searchParams?.get('type');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [quote, setQuote] = useState<InvoiceQuote | null>(null);
  const [quoteSignature, setQuoteSignature] = useState('');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [invoices, setInvoices] = useState<InvoiceBillingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedType, setSelectedType] = useState<'voorschot' | 'eind'>('voorschot');
  const [advancePercentage, setAdvancePercentage] = useState(50);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [manualFinalAmount, setManualFinalAmount] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [subsidyEnabled, setSubsidyEnabled] = useState(false);
  const [subsidy, setSubsidy] = useState<SubsidyMeasure[]>([]);
  const [subsidyReviewing, setSubsidyReviewing] = useState(false);
  const [subsidyWarning, setSubsidyWarning] = useState<{ share: boolean; confirmation?: QuoteAmountConfirmation } | null>(null);
  const creatingRef = useRef(false);
  const finalAmountRef = useRef<HTMLInputElement>(null);
  const [amountWarning, setAmountWarning] = useState<{ comparison: QuoteAmountComparison; share: boolean } | null>(null);
  useEffect(() => { if (adjusting) finalAmountRef.current?.focus(); }, [adjusting]);
  const billing = useMemo(() => summarizeInvoiceBilling(invoices), [invoices]);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;
    if (!quoteId) { setLoading(false); return; }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const data = await loadInvoicePreparation(firestore, user, quoteId, controller.signal);
        if (cancelled) return;
        if (!data.quoteSnapshot.exists()) { setQuote(null); return; }
        const source = data.quoteSnapshot.data() as InvoiceQuote;
        const loadedSettings = data.userSnapshot.data()?.settings as UserSettings | undefined;
        const nextBilling = summarizeInvoiceBilling(data.invoices);
        const nextTotal = roundMoney(resolveInvoiceTotal(source, data.calculationSnapshot, Number(loadedSettings?.planningSettings?.defaultWorkdayHours) || 8));
        const rawPercentage = source.facturatie?.voorschotPercentage ?? loadedSettings?.standaardVoorschotPercentage ?? 50;
        const percentage = Math.max(0, Math.min(100, Number(rawPercentage) || 0));
        setQuote({ ...source, id: quoteId, calculationSnapshot: data.calculationSnapshot || source.calculationSnapshot });
        const subsidySuggestion = suggestInvoiceSubsidy(source, data.calculationSnapshot).measures;
        setSubsidy(subsidySuggestion);
        setSubsidyEnabled(subsidySuggestion.length > 0);
        setQuoteSignature(invoiceQuoteSignature(source));
        setSettings(loadedSettings || null);
        setInvoices(data.invoices);
        setTotal(nextTotal);
        setAdvancePercentage(percentage);
        setAdvanceAmount(roundMoney(nextTotal * percentage / 100).toFixed(2));
        setManualFinalAmount(null);
        setReason('');
        setSelectedType(requestedType === 'voorschot' || requestedType === 'eind'
          ? requestedType
          : nextBilling.existingFinalId || nextBilling.issuedAdvances.length > 0 || source.facturatie?.voorschotIngeschakeld === false
            ? 'eind' : 'voorschot');
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Factuurgegevens konden niet worden geladen.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [user, firestore, quoteId, requestedType, loadAttempt]);

  const existingId = selectedType === 'voorschot' ? billing.existingAdvanceId : billing.existingFinalId;
  const existingInvoice = invoices.find((invoice) => invoice.id === existingId);
  const reviewAdvance = selectedType === 'eind' && !existingId && !loading && quote?.id === quoteId;
  const advances = [...billing.issuedAdvances, ...billing.draftAdvances];
  const directAdvance = reviewAdvance && advances.length === 0;
  const bank = useQuoteAdvancePayments(user, directAdvance ? quoteId : null);
  const deduction = roundMoney(billing.billedAdvanceAmount + (directAdvance ? bank.amountCents / 100 : 0));
  const calculatedFinal = roundMoney(total - deduction);
  const updateAdvance = useCallback((id: string, view: InvoiceBankView) => {
    setInvoices((current) => current.map((row) => row.id !== id ? row : {
      ...row, status: view.status, paymentSummary: { paidAmount: view.paidCents / 100, openAmount: view.openCents / 100 },
    }));
  }, []);
  const newAmount = selectedType === 'voorschot' ? parseAmount(advanceAmount)
    : manualFinalAmount === null ? calculatedFinal : parseAmount(manualFinalAmount);
  const displayedAmount = existingInvoice?.totalsSnapshot?.totaalInclBtw ?? newAmount;
  const blockingMessage = billing.ambiguity
    || (!existingId && selectedType === 'voorschot' && billing.issuedAdvances.length > 1 ? 'Er zijn al meerdere voorschotfacturen. Open de facturen of kies Eindfactuur.' : null)
    || (!existingId && selectedType === 'voorschot' && billing.finalInvoices.length > 0 ? 'Deze offerte heeft al een eindfactuur.' : null)
    || (!existingId && selectedType === 'eind' && billing.draftAdvances.length > 0 ? 'Er staat nog een voorschotconcept. Open of annuleer dit eerst voordat je de eindfactuur maakt.' : null)
    || (!existingId && selectedType === 'eind' && deduction > 0 && calculatedFinal === 0 && manualFinalAmount === null ? 'Het volledige offertebedrag is al verrekend. Er is geen eindtermijn meer over.' : null)
    || (!existingId && deduction > total ? 'Het voorschot is hoger dan het offertebedrag. Controleer dit eerst.' : null);
  const validAmount = newAmount !== null && newAmount > 0 && newAmount <= total;
  const canCreate = !loading && !loadError && !!user && !!firestore && !!quote && quote.id === quoteId && !blockingMessage && (!directAdvance || bank.ready)
    && (!!existingId || (!!settings && total > 0 && validAmount && (selectedType !== 'eind' || manualFinalAmount === null || !!reason.trim())));
  const checkSubsidy = !existingId && subsidyEnabled;
  const subsidyValid = !checkSubsidy || invoiceSubsidySchema.safeParse(subsidy).success;
  const incompleteSubsidy = checkSubsidy && getSubsidyQuestions(subsidy, selectedType).length > 0;
  const readyToCreate = canCreate && subsidyValid && (!checkSubsidy || !subsidyReviewing);
  const customer = quote?.klantinformatie;
  const customerName = customer?.bedrijfsnaam || [customer?.voornaam, customer?.achternaam].filter(Boolean).join(' ') || 'Onbekende klant';

  async function handleCreate(share: boolean, confirmation?: QuoteAmountConfirmation, acceptIncompleteSubsidy = false): Promise<void> {
    if (!readyToCreate || creatingRef.current || !user || !firestore || !quote) return;
    const comparison = !existingId && selectedType === 'eind' && newAmount !== null
      ? compareSharedQuoteAmount(quote.whatsappQuoteSnapshot, newAmount, deduction) : null;
    if (comparison?.differenceCents && !isQuoteAmountConfirmed(comparison, confirmation)) {
      setAmountWarning({ comparison, share });
      return;
    }
    setAmountWarning(null);
    if (incompleteSubsidy && !acceptIncompleteSubsidy) {
      setSubsidyWarning({ share, confirmation });
      return;
    }
    setSubsidyWarning(null);
    creatingRef.current = true;
    setCreating(true);
    try {
      const invoiceId = existingId || await createInvoiceFromQuote(firestore, {
        userId: user.uid, quoteId, quote, settings: settings!, invoiceType: selectedType,
        calculationSnapshot: quote.calculationSnapshot,
        subsidy: checkSubsidy ? subsidy : undefined,
        originalTotalInclBtw: total, totalsInclBtw: newAmount!,
        voorschotPercentage: advancePercentage,
        voorschotAftrekInclBtw: selectedType === 'eind' ? deduction : 0,
        bankAdvanceSelection: directAdvance ? bank.selected.map(({ transactionId, amountCents }) => ({ transactionId, amountCents })) : undefined,
        handmatigEindbedrag: selectedType === 'eind' && manualFinalAmount !== null,
        opmerking: reason.trim(),
        sharedQuoteAmountConfirmation: confirmation,
        expectedQuoteSignature: quoteSignature,
        expectedBillingSignature: invoiceBillingSignature(invoices),
      });
      router.push(`/facturen/${invoiceId}${share ? '?share=1' : ''}`);
    } catch (error) {
      toast({ title: 'Factuur niet aangemaakt', description: error instanceof Error ? error.message : 'Probeer opnieuw.', variant: 'destructive' });
      setLoadError(error instanceof Error ? error.message : 'Factuurgegevens opnieuw laden.');
    } finally { creatingRef.current = false; setCreating(false); }
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <main className="mx-auto max-w-2xl space-y-4 p-4 pb-24 sm:p-6">
        <div className="flex items-center gap-3 pl-12 md:pl-0">
          <Button asChild size="icon" variant="ghost"><Link href="/facturen/start" aria-label="Terug naar factureren"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <h1 className="text-xl font-semibold">Factuur maken</h1>
        </div>
        {isUserLoading || loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Factuurgegevens laden…</div>
        ) : loadError ? (
          <div className="space-y-3 rounded-lg border p-4"><p className="text-sm">{loadError}</p><Button variant="outline" onClick={() => setLoadAttempt((value) => value + 1)}>Gegevens opnieuw laden</Button></div>
        ) : !quote ? (
          <p className="text-sm text-muted-foreground">Offerte niet gevonden. <Link className="underline" href="/facturen/start">Kies een offerte</Link></p>
        ) : (
          <>
            <section className="space-y-4 rounded-lg border p-4">
              <div>
                <h2 className="font-semibold">{customerName}</h2>
                <p className="text-sm text-muted-foreground">{quote.titel || quote.title || 'Offerte'}{typeof quote.offerteNummer === 'number' ? ` · #${formatOfferteNummerLabel(quote.offerteNummer, quote.offerteVersie)}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Factuurtype">
                <Button type="button" variant={selectedType === 'voorschot' ? 'secondary' : 'outline'} aria-pressed={selectedType === 'voorschot'} disabled={creating} onClick={() => setSelectedType('voorschot')}>Voorschotfactuur</Button>
                <Button type="button" variant={selectedType === 'eind' ? 'secondary' : 'outline'} aria-pressed={selectedType === 'eind'} disabled={creating} onClick={() => setSelectedType('eind')}>Eindfactuur</Button>
              </div>
              {directAdvance && <QuoteAdvancePayments bank={bank} disabled={creating} />}
              {reviewAdvance && advances.map((advance) => <InvoiceBankPayments key={advance.id} invoiceId={advance.id}
                advanceLabel={`Knab · Voorschotfactuur #${advance.invoiceNumberLabel || advance.id}`} onLoaded={updateAdvance} />)}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Factuur</dt><dd className="text-right">{selectedType === 'voorschot' ? 'Voorschot' : 'Eindfactuur'}{existingInvoice ? ` #${existingInvoice.invoiceNumberLabel || ''}` : selectedType === 'voorschot' ? ` ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(advancePercentage)}%` : ''}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Offerte incl. btw</dt><dd>{formatCurrency(total)}</dd></div>
                {directAdvance && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Voorschot in mindering</dt><dd>{bank.ready ? formatCurrency(deduction) : 'Nog te controleren'}</dd></div>}
                {billing.issuedAdvances.length > 0 && <>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Voorschot gefactureerd</dt><dd>{formatCurrency(billing.billedAdvanceAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Voorschot ontvangen</dt><dd>{formatCurrency(billing.receivedAdvanceAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Voorschot nog open</dt><dd>{formatCurrency(billing.openAdvanceAmount)}</dd></div>
                </>}
                <div className="flex justify-between gap-3 border-t pt-3 font-semibold"><dt>Deze factuur incl. btw</dt><dd>{directAdvance && !bank.ready ? 'Na bankcontrole' : displayedAmount !== null ? formatCurrency(displayedAmount) : 'Vul een bedrag in'}</dd></div>
              </dl>
              <SharedQuoteAmountBar snapshot={quote.whatsappQuoteSnapshot} currentAmount={total} />
              {existingInvoice && <p className="text-sm text-muted-foreground">{existingInvoice.status === 'concept' ? 'Het bestaande concept wordt geopend.' : 'Deze factuur bestaat al en wordt opnieuw geopend.'}</p>}
              {blockingMessage && <div className="space-y-2 text-sm text-amber-300"><p>{blockingMessage}</p><Link href={`/facturen?quoteId=${encodeURIComponent(quoteId)}`} className="underline">Open facturen</Link>{billing.draftAdvances.length === 1 && <Link href={`/facturen/${billing.draftAdvances[0].id}`} className="ml-3 underline">Open voorschotconcept</Link>}</div>}
              {!existingId && user && <InvoiceSubsidyFields user={user} quoteId={quoteId} type={selectedType}
                enabled={subsidyEnabled} setEnabled={setSubsidyEnabled} measures={subsidy} setMeasures={setSubsidy}
                setReviewing={setSubsidyReviewing} disabled={creating} />}
              <div className="flex flex-col gap-2">
                <Button variant="success" className="gap-2" disabled={!readyToCreate || creating} onClick={() => void handleCreate(true)}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}{existingId ? 'Open en deel' : 'Maak en deel'}</Button>
                <div className="flex gap-2"><Button className="flex-1" variant="outline" disabled={!readyToCreate || creating} onClick={() => void handleCreate(false)}>{existingId ? 'Open factuur' : 'Alleen aanmaken'}</Button><Button variant="ghost" onClick={() => setAdjusting((value) => !value)} aria-expanded={adjusting}>{adjusting ? 'Sluiten' : 'Aanpassen'}</Button></div>
              </div>
            </section>
            {adjusting && <section className="space-y-4 rounded-lg border p-4">
              {existingId ? <p className="text-sm text-muted-foreground">Open de bestaande factuur om deze te controleren.</p> : selectedType === 'voorschot' ? <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="advance-percentage">Voorschot (%)</Label><Input id="advance-percentage" type="number" min="0" max="100" value={advancePercentage} onChange={(event) => { const pct = Math.max(0, Math.min(100, Number(event.target.value) || 0)); setAdvancePercentage(pct); setAdvanceAmount(roundMoney(total * pct / 100).toFixed(2)); }} /></div>
                <div className="space-y-2"><Label htmlFor="advance-amount">Bedrag incl. btw</Label><Input id="advance-amount" inputMode="decimal" value={advanceAmount} onChange={(event) => { setAdvanceAmount(event.target.value); const value = parseAmount(event.target.value); if (value !== null && total > 0) setAdvancePercentage(value / total * 100); }} /></div>
              </div> : <>
                <div className="space-y-2"><Label htmlFor="final-amount">Eindbedrag incl. btw</Label><Input ref={finalAmountRef} id="final-amount" inputMode="decimal" value={manualFinalAmount ?? calculatedFinal.toFixed(2)} onChange={(event) => setManualFinalAmount(event.target.value)} /><p className="text-xs text-muted-foreground">Berekend: {formatCurrency(total)} − {formatCurrency(deduction)} voorschot = {formatCurrency(calculatedFinal)}.</p></div>
                {manualFinalAmount !== null && <><div className="space-y-2"><Label htmlFor="adjustment-reason">Reden aanpassing</Label><Input id="adjustment-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bijv. afgesproken korting" /></div><Button variant="ghost" onClick={() => { setManualFinalAmount(null); setReason(''); }}>Gebruik berekend bedrag</Button></>}
              </>}
            </section>}
          </>
        )}
      </main>
      <Dialog open={!!subsidyWarning} onOpenChange={(open) => { if (!open) setSubsidyWarning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ISDE-gegevens aanvullen</DialogTitle>
            <DialogDescription>Er ontbreken nog gegevens. Je kunt ze nu invullen of de factuur aanmaken met de gegevens die al bekend zijn.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubsidyWarning(null)}>Gegevens invullen</Button>
            <Button onClick={() => { if (subsidyWarning) void handleCreate(subsidyWarning.share, subsidyWarning.confirmation, true); }}>Aanmaken met bekende gegevens</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuoteAmountDifferenceDialog
        comparison={amountWarning?.comparison || null}
        onCancel={() => setAmountWarning(null)}
        onConfirm={() => { if (amountWarning) void handleCreate(amountWarning.share, amountWarning.comparison); }}
        onAdjust={() => {
          setAmountWarning(null);
          setAdjusting(true);
          requestAnimationFrame(() => { finalAmountRef.current?.focus(); finalAmountRef.current?.select(); });
        }}
      />
    </div>
  );
}

export default function NieuweFactuurPage() {
  return <Suspense fallback={<div className="flex items-center gap-2 p-4"><ReceiptText className="h-4 w-4" /> Factuur laden…</div>}><NieuweFactuurPageContent /></Suspense>;
}
