'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  Timestamp,
} from 'firebase/firestore';

import { useFirestore, useUser, addDocumentNonBlocking } from '@/firebase';
import type { Quote } from '@/lib/types';

import { DashboardHeader } from '@/components/dashboard-header';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Plus,
  Pencil,
  ArrowUpRight,
  Copy,
  Settings,
  Boxes,
  Users,
} from 'lucide-react';

import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

type Status = Quote['status'];

type QuoteMetDatums = Quote & {
  id: string;
  createdAtDate?: Date | null;
  updatedAtDate?: Date | null;
  sentAtDate?: Date | null;
};

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
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function getTitel(q: any): string {
  return (q?.titel ?? q?.title ?? q?.naam ?? '—') as string;
}

function getKlantNaam(q: any): string {
  return (q?.klantNaam ?? q?.klantnaam ?? q?.clientName ?? q?.customerName ?? '—') as string;
}

function StatusBadge({ status }: { status: Status }) {
  const statusMap: Record<Status, { text: string; className: string }> = {
    concept: { text: 'Concept', className: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/25' },
    in_behandeling: { text: 'Bezig', className: 'bg-blue-500/15 text-blue-200 border-blue-500/25' },
    verzonden: { text: 'Verzonden', className: 'bg-orange-500/15 text-orange-200 border-orange-500/25' },
    geaccepteerd: { text: 'Geaccepteerd', className: 'bg-green-500/15 text-green-200 border-green-500/25' },
    afgewezen: { text: 'Afgewezen', className: 'bg-red-500/15 text-red-200 border-red-500/25' },
    verlopen: { text: 'Verlopen', className: 'bg-zinc-700 text-zinc-300 border-zinc-600' },
  };

  const { text, className } = statusMap[status] || statusMap.concept;

  return (
    <Badge variant="outline" className={className}>
      {text}
    </Badge>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={null} />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <svg className="h-6 w-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const begroeting = useMemo(() => {
    let naam =
      (user as any)?.displayName ||
      (user as any)?.name ||
      (user as any)?.email?.split('@')?.[0] ||
      '';
    if (naam) {
      naam = naam.charAt(0).toUpperCase() + naam.slice(1);
    }
    return naam ? `Welkom, ${naam}` : 'Welkom';
  }, [user]);

  const [laden, setLaden] = useState(true);
  const [offertes, setOffertes] = useState<QuoteMetDatums[]>([]);
  const [zoek, setZoek] = useState('');

  // Auth redirect
  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  // Live offertes
  useEffect(() => {
    if (!user || !firestore) return;

    setLaden(true);

    const ref = collection(firestore, 'quotes');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data: QuoteMetDatums[] = snapshot.docs.map((doc) => {
          const raw = doc.data() as any;
          return {
            ...(raw as Quote),
            id: doc.id,
            createdAtDate: naarDate(raw?.createdAt),
            updatedAtDate: naarDate(raw?.updatedAt),
            sentAtDate: naarDate(raw?.sentAt),
          };
        });

        setOffertes(data);
        setLaden(false);
      },
      (err) => {
        console.error('Fout bij ophalen klussen:', err);
        setLaden(false);
      }
    );

    return () => unsub();
  }, [user, firestore]);

  const dupliceerOfferte = async (offerte: QuoteMetDatums) => {
    if (!user || !firestore) return;

    const { id, createdAtDate, updatedAtDate, sentAtDate, ...rest } = offerte as any;

    try {
      const newDocRef = await addDocumentNonBlocking(collection(firestore, 'quotes'), {
        ...rest,
        userId: user.uid,
        status: 'concept',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        titel: `${getTitel(offerte)} (Kopie)`,
      });

      if (newDocRef) router.push(`/offertes/${newDocRef.id}`);
    } catch (e) {
      console.error('Fout bij dupliceren klus:', e);
    }
  };

  // Meest recente eerst
  const sortedByRecent = useMemo(() => {
    const arr = [...offertes];
    arr.sort((a, b) => {
      const aT = (a.updatedAtDate ?? a.createdAtDate)?.getTime() ?? 0;
      const bT = (b.updatedAtDate ?? b.createdAtDate)?.getTime() ?? 0;
      return bT - aT;
    });
    return arr;
  }, [offertes]);

  // Lopende klus = meest recente concept / in_behandeling
  const lopendeKlus = useMemo(() => {
    const drafts = sortedByRecent.filter((o) => o.status === 'concept' || o.status === 'in_behandeling');
    return drafts[0] ?? null;
  }, [sortedByRecent]);

  // Recente klussen
  const recenteKlussen = useMemo(() => {
    const s = zoek.trim().toLowerCase();
    let result = [...sortedByRecent];

    if (s) {
      result = result.filter((o) => {
        const titel = getTitel(o).toLowerCase();
        const klant = getKlantNaam(o).toLowerCase();
        return titel.includes(s) || klant.includes(s);
      });
    }

    return result.slice(0, 12);
  }, [sortedByRecent, zoek]);

  if (isUserLoading || !user) return <DashboardSkeleton />;

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <DashboardHeader user={user} />

        {/* pb-24 zodat de mobiele bottom bar niets overlapt */}
        <main className="flex flex-1 flex-col items-center p-4 md:p-6 pb-24">
          <div className="w-full max-w-3xl space-y-6">
            {/* Begroeting */}
            <div className="px-1">
              <div className="text-lg font-medium leading-tight">
                {begroeting}
              </div>
            </div>

            {/* STARTSCHERM: 1 primaire actie */}
            <Card className="bg-card/50">
              <CardContent className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-6">
  {/* LEFT: context */}
  <div className="min-w-0">
    <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
      Nieuwe klus
    </h1>
    <p className="mt-2 text-sm text-muted-foreground">
      Start met het uitwerken van een nieuwe klus.
    </p>
  </div>

  {/* RIGHT: primary action */}
  <div className="shrink-0">
    <Button asChild variant="success" className="gap-2 h-11 px-5">
      <Link href="/offertes/nieuw">
        <Plus className="h-4 w-4" />
        Nieuwe klus starten
      </Link>
    </Button>
  </div>
</div>

              </CardContent>
            </Card>

            {/* Recovery (secundair) */}
            {lopendeKlus ? (
              <Card className="bg-card/50">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Lopende klus</div>
                      <div className="mt-1 text-sm text-muted-foreground truncate">
                        {getKlantNaam(lopendeKlus)} — {getTitel(lopendeKlus)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Laatst bewerkt:{' '}
                        {(lopendeKlus.updatedAtDate ?? lopendeKlus.createdAtDate)
                          ? format((lopendeKlus.updatedAtDate ?? lopendeKlus.createdAtDate) as Date, 'd MMM yyyy', { locale: nl })
                          : '—'}
                      </div>
                    </div>

                    <Button asChild variant="secondary" className="shrink-0 gap-2">
                      <Link href={`/offertes/${lopendeKlus.id}`}>
                        <Pencil className="h-4 w-4" />
                        Verder
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Recente klussen (rustig) */}
            <Card className="bg-card/50">
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-sm font-semibold">Recente klussen</div>
                    <div className="text-xs text-muted-foreground">
                      Terugvinden, openen, of dupliceren.
                    </div>
                  </div>

                  <Input
                    placeholder="Zoek op klant of titel..."
                    className="w-full md:w-[320px]"
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                  />
                </div>

                <div className="mt-4">
                  {laden ? (
                    <div className="space-y-2">
                      {[...Array(7)].map((_, i) => (
                        <div key={i} className="h-12 animate-pulse rounded bg-muted/50" />
                      ))}
                    </div>
                  ) : recenteKlussen.length === 0 ? (
                    <div className="rounded-2xl border bg-background/20 p-6 text-center text-muted-foreground">
                      Nog geen klussen gevonden.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {recenteKlussen.map((o) => {
                        const datum = o.updatedAtDate ?? o.createdAtDate;

                        return (
                          <div
                            key={o.id}
                            className="group flex items-center justify-between gap-3 rounded-2xl border bg-background/15 px-3 py-2 hover:bg-muted/25 transition-colors"
                          >
                            <div className="min-w-0">
                              <Link href={`/offertes/${o.id}`} className="block min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="truncate font-medium">
                                    {getKlantNaam(o)} — {getTitel(o)}
                                  </div>
                                  <StatusBadge status={o.status} />
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                                  <span>{datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                                  <span className="opacity-60">•</span>
                                  <span>{formatCurrency(o.amount)}</span>
                                </div>
                              </Link>
                            </div>

                            {/* Acties op hover (desktop) */}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="ghost" size="icon">
                                    <Link href={`/offertes/${o.id}`} aria-label="Openen">
                                      <ArrowUpRight className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Openen</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => dupliceerOfferte(o)}
                                    aria-label="Dupliceren"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Dupliceren</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </main>
         {/* Mobiele utility bar (fixed onderin) */}
         <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-xl">
            <div className="mx-auto max-w-3xl px-3 py-2 flex items-center justify-around">
              
              {/* ✅ UPDATED: Now links to /klanten */}
              <Link
                href="/klanten"
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Users className="h-5 w-5" />
                Klanten
              </Link>

              <Link
                href="/materialen"
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Boxes className="h-5 w-5" />
                Materialen
              </Link>

              <Link
                href="/instellingen"
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
                Instellingen
              </Link>
            </div>
          </div>
      </div>
    </TooltipProvider>
  );
}