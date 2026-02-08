'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { ArrowLeft, FileText, Loader2, Plus, Search } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';

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
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <DashboardHeader user={user} title="Nieuwe factuur" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
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
                <FileText className="h-5 w-5 text-emerald-400" />
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
                    return (
                      <div
                        key={q.id}
                        className="rounded-lg border border-border/60 bg-card/40 p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">
                            {typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">{getClientName(q)}</div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {(q.titel || q.title || '—').toString()}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Totaal: {formatCurrency(total)}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9"
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

