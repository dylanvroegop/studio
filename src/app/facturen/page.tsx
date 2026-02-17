'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Calendar, CheckCircle2, Loader2, Pencil, Plus, ReceiptText, Search, Trash2, FileText } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore, useUser } from '@/firebase';
import type { Invoice } from '@/lib/types';
import { InvoiceStatusBadge } from '@/components/invoice/InvoiceStatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { promoteInvoiceRelatedQuotesToAcceptedInTransaction } from '@/lib/quote-status';

type FilterMode = 'alle' | 'openstaand' | 'betaald';

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

function getInvoiceSideBorderClass(status: Invoice['status']): string {
  const map: Record<Invoice['status'], string> = {
    concept: 'border-l-zinc-500/70',
    verzonden: 'border-l-emerald-500',
    gedeeltelijk_betaald: 'border-l-amber-500',
    betaald: 'border-l-emerald-400',
    geannuleerd: 'border-l-red-500',
  };

  return map[status] || map.concept;
}

export default function FacturenPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Array<Invoice & { issueDateDate: Date | null }>>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('alle');
  const [createOpen, setCreateOpen] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quoteSearch, setQuoteSearch] = useState('');

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<(Invoice & { issueDateDate: Date | null }) | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;

    setLoading(true);
    setError(null);

    const ref = collection(firestore, 'invoices');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as any;
          return {
            ...(raw as Invoice),
            id: docSnap.id,
            issueDateDate: naarDate(raw?.issueDate),
          };
        }).filter((inv) => !inv.archived);

        data.sort((a, b) => {
          const aT = a.issueDateDate?.getTime() ?? 0;
          const bT = b.issueDateDate?.getTime() ?? 0;
          return bT - aT;
        });

        setInvoices(data);
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij ophalen facturen:', err);
        setError(`${err.code ?? 'error'}: ${err.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, firestore]);

  useEffect(() => {
    if (!createOpen || !user || !firestore) return;
    (async () => {
      try {
        const ref = collection(firestore, 'quotes');
        const q = query(ref, where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        arr.sort((a, b) => {
          const aT = naarDate(a.updatedAt)?.getTime() ?? naarDate(a.createdAt)?.getTime() ?? 0;
          const bT = naarDate(b.updatedAt)?.getTime() ?? naarDate(b.createdAt)?.getTime() ?? 0;
          return bT - aT;
        });
        setQuotes(arr);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [createOpen, user, firestore]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    let result = [...invoices];
    if (filter === 'openstaand') {
      result = result.filter((inv) => (inv.paymentSummary?.openAmount ?? inv.totalsSnapshot?.totaalInclBtw ?? 0) > 0);
    }
    if (filter === 'betaald') {
      result = result.filter((inv) => inv.status === 'betaald');
    }

    if (!s) return result;
    return result.filter((inv) => {
      const klant = inv.sourceQuote?.klantSnapshot?.naam?.toLowerCase?.() || '';
      const nr = inv.invoiceNumberLabel?.toLowerCase?.() || '';
      const offerte = inv.quoteId?.toLowerCase?.() || '';
      return klant.includes(s) || nr.includes(s) || offerte.includes(s);
    });
  }, [invoices, search, filter]);

  function openArchiveDialog(inv: Invoice & { issueDateDate: Date | null }) {
    setArchiveTarget(inv);
    setArchiveOpen(true);
  }

  async function confirmArchive() {
    if (!user || !firestore || !archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const ref = doc(firestore, 'invoices', archiveTarget.id);
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
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon factuur niet archiveren.'}`);
    } finally {
      setArchiving(false);
    }
  }

  async function markInvoiceAsPaid(inv: Invoice & { issueDateDate: Date | null }) {
    if (!user || !firestore || markingPaidId) return;
    setMarkingPaidId(inv.id);
    try {
      await runTransaction(firestore, async (tx) => {
        const invRef = doc(firestore, 'invoices', inv.id);
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
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Fout', description: e?.message ?? 'Kon factuur niet op betaald zetten.', variant: 'destructive' });
    } finally {
      setMarkingPaidId((current) => (current === inv.id ? null : current));
    }
  }

  const filteredQuotes = useMemo(() => {
    const s = quoteSearch.trim().toLowerCase();
    let arr = [...quotes];
    if (!s) return arr.slice(0, 30);
    arr = arr.filter((q) => {
      const titel = (q?.titel || q?.title || '').toString().toLowerCase();
      const klant = (q?.klantinformatie?.bedrijfsnaam || `${q?.klantinformatie?.voornaam || ''} ${q?.klantinformatie?.achternaam || ''}`.trim() || '')
        .toString()
        .toLowerCase();
      const nr = typeof q?.offerteNummer === 'number' ? String(q.offerteNummer) : '';
      return titel.includes(s) || klant.includes(s) || nr.includes(s);
    });
    return arr.slice(0, 30);
  }, [quotes, quoteSearch]);

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="app-shell min-h-screen bg-background pb-10">
        <AppNavigation />
        <DashboardHeader user={user} title="Facturen" />

        <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
          <div className="w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-emerald-400" />
                Overzicht
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Zoek op klant, factuurnummer of offerte-id..."
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 gap-2 border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
                      >
                        <Plus className="h-4 w-4" />
                        Nieuwe factuur
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Nieuwe factuur</DialogTitle>
                        <DialogDescription>Kies een offerte en maak een voorschot- of eindfactuur.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3">
                        <Input
                          value={quoteSearch}
                          onChange={(e) => setQuoteSearch(e.target.value)}
                          placeholder="Zoek offertes op klant, titel of nummer..."
                        />

                        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                          {filteredQuotes.length === 0 ? (
                            <div className="text-sm text-muted-foreground p-3">Geen offertes gevonden.</div>
                          ) : (
                            filteredQuotes.map((q) => {
                              const klant =
                                q?.klantinformatie?.bedrijfsnaam ||
                                `${q?.klantinformatie?.voornaam || ''} ${q?.klantinformatie?.achternaam || ''}`.trim() ||
                                'Onbekende klant';
                              const label = typeof q?.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                              const total = typeof q?.amount === 'number' ? q.amount : (typeof q?.totaalbedrag === 'number' ? q.totaalbedrag : 0);
                              const disabled = !total || total <= 0;
                              return (
                                <div key={q.id} className="rounded-lg border border-border/50 bg-background/30 p-3 flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                                      <div className="font-semibold text-sm truncate">{label}</div>
                                      <div className="text-xs text-muted-foreground truncate">• {klant}</div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 truncate">
                                      {(q?.titel || q?.title || '').toString() || '—'}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Totaal: {formatCurrency(total)}
                                    </div>
                                  </div>
                                  <div className="flex gap-2 shrink-0">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-9"
                                      disabled={disabled}
                                      onClick={() => {
                                        router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(q.id)}&type=voorschot`);
                                        setCreateOpen(false);
                                      }}
                                    >
                                      Voorschot
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="success"
                                      className="h-9"
                                      disabled={disabled}
                                      onClick={() => {
                                        router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(q.id)}&type=eind`);
                                        setCreateOpen(false);
                                      }}
                                    >
                                      Eindfactuur
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    type="button"
                    variant={filter === 'alle' ? 'outline' : 'ghost'}
                    onClick={() => setFilter('alle')}
                    className={cn('h-10', filter === 'alle' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200')}
                  >
                    Alle
                  </Button>
                  <Button
                    type="button"
                    variant={filter === 'openstaand' ? 'outline' : 'ghost'}
                    onClick={() => setFilter('openstaand')}
                    className={cn('h-10', filter === 'openstaand' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200')}
                  >
                    Openstaand
                  </Button>
                  <Button
                    type="button"
                    variant={filter === 'betaald' ? 'outline' : 'ghost'}
                    onClick={() => setFilter('betaald')}
                    className={cn('h-10', filter === 'betaald' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200')}
                  >
                    Betaald
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">Geen facturen gevonden</div>
                <div className="text-sm text-muted-foreground">
                  Facturen maak je aan vanuit een offerte.
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="mt-2 border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
                >
                  <Link href="/offertes">Ga naar offertes</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((inv) => {
                const open = inv.paymentSummary?.openAmount ?? inv.totalsSnapshot?.totaalInclBtw ?? 0;
                const totaal = inv.totalsSnapshot?.totaalInclBtw ?? 0;
                const amountToShow = inv.status === 'betaald' ? totaal : open;
                const klant = inv.sourceQuote?.klantSnapshot?.naam || 'Onbekende klant';
                const datum = inv.issueDateDate;
                const nrLabel = inv.invoiceNumberLabel ? `Factuur #${inv.invoiceNumberLabel}` : null;
                const titel =
                  inv.sourceQuote?.titel ||
                  inv.sourceQuote?.projectAdresSnapshot?.adres ||
                  inv.sourceQuote?.klantSnapshot?.adres ||
                  '—';
                const sideBorderClass = getInvoiceSideBorderClass(inv.status);

                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "group relative flex items-center justify-between gap-4 rounded-xl border border-l-4 border-white/5 bg-card/40 px-5 py-4 hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                      sideBorderClass
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
                        <span
                          className={cn(
                            "font-semibold tracking-wide",
                            inv.status === 'betaald' || amountToShow > 0 ? "text-emerald-400" : "text-zinc-600"
                          )}
                        >
                          {formatCurrency(amountToShow)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 z-20 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        size="sm"
                        variant={inv.status === 'betaald' ? 'secondary' : 'outline'}
                        className={cn(
                          'gap-2 h-9 shadow-sm',
                          inv.status === 'betaald'
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20'
                            : 'bg-zinc-900/70 hover:bg-zinc-800 border border-white/5'
                        )}
                        disabled={inv.status === 'betaald' || markingPaidId === inv.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          void markInvoiceAsPaid(inv);
                        }}
                      >
                        {markingPaidId === inv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        <span className="text-xs sm:text-sm">
                          {inv.status === 'betaald' ? 'Betaald' : 'Markeer als betaald'}
                        </span>
                      </Button>

                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>Open deze factuur</TooltipContent>
                      </Tooltip>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border hover:border-red-500/20 rounded-lg transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          openArchiveDialog(inv);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Archiveren</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </main>

        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Factuur archiveren?</AlertDialogTitle>
              <AlertDialogDescription>
                Deze factuur wordt verplaatst naar het archief. Je kunt dit later ongedaan maken via het archief.
                {archiveTarget ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-zinc-300">
                      {archiveTarget.invoiceNumberLabel ? `Factuur #${archiveTarget.invoiceNumberLabel}` : 'Factuur'}
                    </span>
                    <span className="opacity-30 mx-2">•</span>
                    <span>{archiveTarget.sourceQuote?.klantSnapshot?.naam || 'Onbekende klant'}</span>
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
    </TooltipProvider>
  );
}
