'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { Loader2, ReceiptText, Search, Plus, FileText } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore, useUser } from '@/firebase';
import type { Invoice } from '@/lib/types';
import { InvoiceStatusBadge } from '@/components/invoice/InvoiceStatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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
        });

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <DashboardHeader user={user} title="Facturen" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-3xl space-y-6">
          <Card className="border-white/5 bg-zinc-900/60">
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
                  <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Zoek op klant, factuurnummer of offerte-id..."
                    className="pl-9 bg-zinc-950/40 border-white/10"
                  />
                </div>
                <div className="flex gap-2">
                  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="success" className="h-10 gap-2">
                        <Plus className="h-4 w-4" />
                        Nieuwe factuur
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-800 text-white">
                      <DialogHeader>
                        <DialogTitle>Nieuwe factuur</DialogTitle>
                        <DialogDescription>Kies een offerte en maak een voorschot- of eindfactuur.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3">
                        <Input
                          value={quoteSearch}
                          onChange={(e) => setQuoteSearch(e.target.value)}
                          placeholder="Zoek offertes op klant, titel of nummer..."
                          className="bg-zinc-800 border-zinc-700"
                        />

                        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                          {filteredQuotes.length === 0 ? (
                            <div className="text-sm text-zinc-400 p-3">Geen offertes gevonden.</div>
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
                                <div key={q.id} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                                      <div className="font-semibold text-sm truncate">{label}</div>
                                      <div className="text-xs text-zinc-500 truncate">• {klant}</div>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1 truncate">
                                      {(q?.titel || q?.title || '').toString() || '—'}
                                    </div>
                                    <div className="text-xs text-zinc-400 mt-1">
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
                    variant={filter === 'alle' ? 'success' : 'outline'}
                    onClick={() => setFilter('alle')}
                    className="h-10"
                  >
                    Alle
                  </Button>
                  <Button
                    type="button"
                    variant={filter === 'openstaand' ? 'success' : 'outline'}
                    onClick={() => setFilter('openstaand')}
                    className="h-10"
                  >
                    Openstaand
                  </Button>
                  <Button
                    type="button"
                    variant={filter === 'betaald' ? 'success' : 'outline'}
                    onClick={() => setFilter('betaald')}
                    className="h-10"
                  >
                    Betaald
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Card className="border-white/5 bg-zinc-900/60">
              <CardContent className="p-8 text-center space-y-3">
                <div className="text-zinc-200 font-semibold">Geen facturen gevonden</div>
                <div className="text-sm text-zinc-400">
                  Facturen maak je aan vanuit een offerte.
                </div>
                <Button asChild variant="success" className="mt-2">
                  <Link href="/offertes">Ga naar offertes</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((inv) => {
                const open = inv.paymentSummary?.openAmount ?? inv.totalsSnapshot?.totaalInclBtw ?? 0;
                const klant = inv.sourceQuote?.klantSnapshot?.naam || 'Onbekende klant';
                const datum = inv.issueDateDate
                  ? inv.issueDateDate.toLocaleDateString('nl-NL')
                  : '-';

                return (
                  <Link
                    key={inv.id}
                    href={`/facturen/${inv.id}`}
                    className="block rounded-xl border border-white/5 bg-zinc-900/60 hover:bg-zinc-900/80 transition-colors"
                  >
                    <div className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-zinc-100 truncate">
                            Factuur #{inv.invoiceNumberLabel}
                          </div>
                          <InvoiceStatusBadge status={inv.status} />
                        </div>
                        <div className="text-sm text-zinc-400 truncate">{klant}</div>
                        <div className="text-xs text-zinc-500 mt-1">Datum: {datum}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs text-zinc-500">Openstaand</div>
                        <div className="text-sm font-semibold text-zinc-100">{formatCurrency(open)}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
