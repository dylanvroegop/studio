'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { ArrowLeft, FileText, Loader2, Plus, Search } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';
import { cn } from '@/lib/utils';

type QuoteRow = {
  id: string;
  titel?: string;
  title?: string;
  amount?: number;
  totaalbedrag?: number;
  offerteNummer?: number;
  archived?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  klantinformatie?: {
    voornaam?: string;
    achternaam?: string;
    bedrijfsnaam?: string;
  };
};

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatCurrency(amount?: number): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

function getClientName(q: QuoteRow): string {
  const bedrijfsnaam = (q.klantinformatie?.bedrijfsnaam || '').trim();
  if (bedrijfsnaam) return bedrijfsnaam;
  const persoon = `${q.klantinformatie?.voornaam || ''} ${q.klantinformatie?.achternaam || ''}`.trim();
  return persoon || 'Onbekende klant';
}

export default function StartFactuurPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const ref = collection(firestore, 'quotes');
        const q = query(ref, where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as QuoteRow))
          .filter((quote) => !quote.archived);

        list.sort((a, b) => {
          const aT = parseDate(a.updatedAt)?.getTime() ?? parseDate(a.createdAt)?.getTime() ?? 0;
          const bT = parseDate(b.updatedAt)?.getTime() ?? parseDate(b.createdAt)?.getTime() ?? 0;
          return bT - aT;
        });

        if (!cancelled) setQuotes(list);
      } catch (error) {
        console.error('Fout bij ophalen offertes voor factuur-start:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, user]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return quotes.slice(0, 40);
    return quotes
      .filter((q) => {
        const client = getClientName(q).toLowerCase();
        const nr = typeof q.offerteNummer === 'number' ? String(q.offerteNummer) : '';
        const title = (q.titel || q.title || '').toLowerCase();
        return client.includes(s) || nr.includes(s) || title.includes(s);
      })
      .slice(0, 40);
  }, [quotes, search]);

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
      <AppNavigation />
      <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">Nieuwe factuur</h1>
            <span className="text-xs text-muted-foreground border border-border rounded-md px-2 py-1">Facturen</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 pb-10 sm:p-6">
        <div className="w-full max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/facturen">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
              onClick={() => router.push('/offertes/nieuw')}
            >
              <Plus className="h-4 w-4" />
              Eerst nieuwe offerte starten
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                Kies een offerte voor facturatie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek op klant, offertenummer of titel..."
                  className="pl-9"
                />
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                  Geen offertes gevonden.
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {filtered.map((q) => {
                    const total =
                      typeof q.amount === 'number'
                        ? q.amount
                        : typeof q.totaalbedrag === 'number'
                          ? q.totaalbedrag
                          : 0;
                    const disabled = total <= 0;
                    const quoteLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                    return (
                      <div
                        key={q.id}
                        className={cn(
                          'group relative flex items-center justify-between gap-4 rounded-xl border border-l-4 border-l-cyan-500/70 border-white/5 bg-card/40 px-5 py-4',
                          'hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md'
                        )}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-zinc-100 truncate text-base group-hover:text-white transition-colors">
                              {getClientName(q)}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-400 shrink-0">
                              {quoteLabel}
                            </span>
                          </div>
                          <div className="text-sm text-zinc-500 truncate">
                            {(q.titel || q.title || '—').toString()}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Totaal:</span>
                            <span className="font-semibold text-emerald-300">{formatCurrency(total)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
                            disabled={disabled}
                            onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(q.id)}&type=voorschot`)}
                          >
                            Voorschot
                          </Button>
                          <Button
                            type="button"
                            variant="success"
                            className="h-9"
                            disabled={disabled}
                            onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(q.id)}&type=eind`)}
                          >
                            Eindfactuur
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
