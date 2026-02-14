'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, deleteField, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Archive, Calendar, Loader2, Pencil, ReceiptText, Undo2, FileText } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import type { Invoice, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InvoiceStatusBadge } from '@/components/invoice/InvoiceStatusBadge';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

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

type InvoiceRow = Invoice & {
  issueDateDate: Date | null;
  archivedAtDate: Date | null;
};

type QuoteRow = Quote & {
  createdAtDate: Date | null;
  updatedAtDate: Date | null;
  archivedAtDate: Date | null;
};

function ArchiefPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams?.get('tab') === 'offertes' || searchParams?.get('tab') === 'facturen')
    ? (searchParams.get('tab') as 'offertes' | 'facturen')
    : 'facturen';

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;
    setLoading(true);

    const invRef = collection(firestore, 'invoices');
    const invQ = query(invRef, where('userId', '==', user.uid));
    const unsubInv = onSnapshot(invQ, (snapshot) => {
      const data = snapshot.docs
        .map((d) => {
          const raw = d.data() as any;
          return {
            ...(raw as Invoice),
            id: d.id,
            issueDateDate: naarDate(raw?.issueDate),
            archivedAtDate: naarDate(raw?.archivedAt),
          } as InvoiceRow;
        })
        .filter((inv) => !!inv.archived);

      data.sort((a, b) => {
        const aT = a.archivedAtDate?.getTime() ?? a.issueDateDate?.getTime() ?? 0;
        const bT = b.archivedAtDate?.getTime() ?? b.issueDateDate?.getTime() ?? 0;
        return bT - aT;
      });

      setInvoices(data);
      setLoading(false);
    });

    const quoteRef = collection(firestore, 'quotes');
    const quoteQ = query(quoteRef, where('userId', '==', user.uid));
    const unsubQuotes = onSnapshot(quoteQ, (snapshot) => {
      const data = snapshot.docs
        .map((d) => {
          const raw = d.data() as any;
          return {
            ...(raw as Quote),
            id: d.id,
            createdAtDate: naarDate(raw?.createdAt),
            updatedAtDate: naarDate(raw?.updatedAt),
            archivedAtDate: naarDate(raw?.archivedAt),
          } as QuoteRow;
        })
        .filter((q) => !!(q as any)?.archived);

      data.sort((a, b) => {
        const aT = a.archivedAtDate?.getTime() ?? a.updatedAtDate?.getTime() ?? a.createdAtDate?.getTime() ?? 0;
        const bT = b.archivedAtDate?.getTime() ?? b.updatedAtDate?.getTime() ?? b.createdAtDate?.getTime() ?? 0;
        return bT - aT;
      });

      setQuotes(data);
      setLoading(false);
    });

    return () => {
      unsubInv();
      unsubQuotes();
    };
  }, [user, firestore]);

  const invoiceItems = useMemo(() => invoices, [invoices]);
  const quoteItems = useMemo(() => quotes, [quotes]);

  async function restoreInvoice(inv: InvoiceRow) {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'invoices', inv.id);
    await updateDoc(ref, {
      archived: false,
      archivedAt: deleteField(),
      archivedBy: deleteField(),
      updatedAt: serverTimestamp(),
    } as any);
  }

  async function restoreQuote(q: QuoteRow) {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'quotes', q.id);
    await updateDoc(ref, {
      archived: false,
      archivedAt: deleteField(),
      archivedBy: deleteField(),
      updatedAt: serverTimestamp(),
    } as any);
  }

  async function deleteAllArchived(): Promise<void> {
    if (!user || !firestore || deletingAll) return;

    const targetItems = tab === 'facturen' ? invoiceItems : quoteItems;
    if (!targetItems.length) return;

    setDeletingAll(true);
    setError(null);
    try {
      for (let i = 0; i < targetItems.length; i += 450) {
        const chunk = targetItems.slice(i, i + 450);
        const batch = writeBatch(firestore);
        chunk.forEach((item) => {
          const collectionName = tab === 'facturen' ? 'invoices' : 'quotes';
          batch.delete(doc(firestore, collectionName, item.id));
        });
        await batch.commit();
      }
      setBulkDeleteOpen(false);
    } catch (e: any) {
      console.error('Fout bij bulk verwijderen archief:', e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon gearchiveerde items niet verwijderen.'}`);
    } finally {
      setDeletingAll(false);
    }
  }

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <DashboardHeader user={user} title="Archief" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-emerald-400" />
                Gearchiveerde items
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Items in het archief zijn niet zichtbaar in het dashboard of in facturen/offertes.
            </CardContent>
          </Card>

          {error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={(v) => router.replace(`/archief?tab=${v}`)}
            className="space-y-4"
          >
            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructiveSoft"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={
                  deletingAll ||
                  (tab === 'facturen' ? invoiceItems.length === 0 : quoteItems.length === 0)
                }
              >
                {deletingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Verwijder alles
              </Button>
            </div>
            <TabsList className="grid w-full grid-cols-2 h-auto p-1">
              <TabsTrigger value="facturen" className="py-2.5 flex items-center gap-2">
                <ReceiptText className="h-4 w-4" />
                Facturen
              </TabsTrigger>
              <TabsTrigger value="offertes" className="py-2.5 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Offertes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="facturen" className="space-y-3">
              {invoiceItems.length === 0 ? (
                <div className="rounded-2xl border bg-background/20 p-6 text-center text-muted-foreground">
                  Geen gearchiveerde facturen.
                </div>
              ) : (
                invoiceItems.map((inv, index) => {
                  const open = inv.paymentSummary?.openAmount ?? inv.totalsSnapshot?.totaalInclBtw ?? 0;
                  const klant = inv.sourceQuote?.klantSnapshot?.naam || 'Onbekende klant';
                  const datum = inv.issueDateDate;
                  const nrLabel = inv.invoiceNumberLabel ? `Factuur #${inv.invoiceNumberLabel}` : null;
                  const titel =
                    inv.sourceQuote?.titel ||
                    inv.sourceQuote?.projectAdresSnapshot?.adres ||
                    inv.sourceQuote?.klantSnapshot?.adres ||
                    '—';

                  return (
                    <div
                      key={inv.id}
                      style={{ animationDelay: `${index * 50}ms` }}
                      className={cn(
                        "group relative flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-card/40 px-5 py-4 hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                      )}
                    >
                      <Link href={`/facturen/${inv.id}`} className="absolute inset-0 z-0" />

                      <div className="flex-1 min-w-0 z-10 pointer-events-none space-y-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-bold text-zinc-100 truncate text-base group-hover:text-white transition-colors">
                            {klant}
                          </span>

                          {nrLabel && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-400 shrink-0">
                              {nrLabel}
                            </span>
                          )}

                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 shrink-0">
                            Gearchiveerd
                          </span>

                          <InvoiceStatusBadge status={inv.status} />
                        </div>

                        <div className="flex items-center gap-3 text-sm text-zinc-500">
                          <span className="truncate max-w-[200px] text-zinc-400 font-medium">
                            {titel.toString()}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className="flex items-center gap-1.5 group-hover:text-zinc-300 transition-colors">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className={cn("font-semibold tracking-wide", open > 0 ? "text-emerald-400" : "text-zinc-600")}>
                            {formatCurrency(open)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 z-20 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button
                          asChild
                          variant="secondary"
                          size="sm"
                          className="gap-2 h-9 bg-zinc-800/80 hover:bg-zinc-700 border border-white/5 shadow-sm"
                        >
                          <Link href={`/facturen/${inv.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Openen</span>
                          </Link>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border hover:border-emerald-500/20 rounded-lg transition-all"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            restoreInvoice(inv);
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                          <span className="sr-only">Herstellen</span>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="offertes" className="space-y-3">
              {quoteItems.length === 0 ? (
                <div className="rounded-2xl border bg-background/20 p-6 text-center text-muted-foreground">
                  Geen gearchiveerde offertes.
                </div>
              ) : (
                quoteItems.map((q, index) => {
                  const datum = q.updatedAtDate ?? q.createdAtDate;
                  const nrLabel = (q as any)?.offerteNummer ? `Offerte #${(q as any).offerteNummer}` : null;
                  const klant =
                    (q as any)?.klantinformatie?.bedrijfsnaam ||
                    `${(q as any)?.klantinformatie?.voornaam || ''} ${(q as any)?.klantinformatie?.achternaam || ''}`.trim() ||
                    'Onbekende klant';
                  const titel = (q as any)?.titel || (q as any)?.werkomschrijving || '—';
                  const totaal = (q as any)?.totaalbedrag || (q as any)?.amount || 0;

                  return (
                    <div
                      key={q.id}
                      style={{ animationDelay: `${index * 50}ms` }}
                      className={cn(
                        "group relative flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-card/40 px-5 py-4 hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                      )}
                    >
                      <Link href={`/offertes/${q.id}`} className="absolute inset-0 z-0" />

                      <div className="flex-1 min-w-0 z-10 pointer-events-none space-y-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-bold text-zinc-100 truncate text-base group-hover:text-white transition-colors">
                            {klant}
                          </span>

                          {nrLabel && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-400 shrink-0">
                              {nrLabel}
                            </span>
                          )}

                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 shrink-0">
                            Gearchiveerd
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-zinc-500">
                          <span className="truncate max-w-[200px] text-zinc-400 font-medium">
                            {titel.toString()}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className="flex items-center gap-1.5 group-hover:text-zinc-300 transition-colors">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className={cn("font-semibold tracking-wide", totaal > 0 ? "text-emerald-400" : "text-zinc-600")}>
                            {formatCurrency(totaal)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 z-20 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button
                          asChild
                          variant="secondary"
                          size="sm"
                          className="gap-2 h-9 bg-zinc-800/80 hover:bg-zinc-700 border border-white/5 shadow-sm"
                        >
                          <Link href={`/offertes/${q.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Openen</span>
                          </Link>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border hover:border-emerald-500/20 rounded-lg transition-all"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            restoreQuote(q);
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                          <span className="sr-only">Herstellen</span>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Alles in archief verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {tab === 'facturen'
                ? `Je verwijdert ${invoiceItems.length} gearchiveerde facturen definitief. Dit kan niet ongedaan worden gemaakt.`
                : `Je verwijdert ${quoteItems.length} gearchiveerde offertes definitief. Dit kan niet ongedaan worden gemaakt.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={deletingAll} className="rounded-xl">
              Annuleren
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={deleteAllArchived}
              disabled={deletingAll}
              variant="destructiveSoft"
            >
              {deletingAll ? 'Verwijderen...' : 'Definitief verwijderen'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ArchiefPageFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
    </div>
  );
}

export default function ArchiefPage() {
  return (
    <Suspense fallback={<ArchiefPageFallback />}>
      <ArchiefPageContent />
    </Suspense>
  );
}
