'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  doc as fsDoc,
  deleteDoc,
} from 'firebase/firestore';

import { useFirestore, useUser } from '@/firebase';
import type { Quote } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/BottomNav';

import { DashboardHeader } from '@/components/DashboardHeader';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';



import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

import {
  Plus,
  Pencil,
  Settings,
  Boxes,
  Users,
  Calendar,
  Trash2,
  FilePlus,
  LayoutDashboard,
  Loader2,
} from 'lucide-react';

import { createEmptyQuote } from '@/lib/firestore-actions';

import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

type Status = Quote['status'];

type QuoteMetDatums = Quote & {
  id: string;
  createdAtDate?: Date | null;
  updatedAtDate?: Date | null;
  sentAtDate?: Date | null;
  offerteNummer?: number | null;
};



// --- Helpers ---

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
  if (amount === undefined || amount === null || amount === 0) return '€ 0,00';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function getTitel(q: any): string {
  if (q?.titel || q?.title) return q.titel || q.title;
  const info = q?.klantinformatie;
  if (info?.straat) return `${info.straat} ${info.huisnummer || ''}`.trim();
  return 'Naamloze klus';
}

function getKlantNaam(q: any): string {
  const info = q?.klantinformatie;
  if (!info) return 'Onbekende klant';
  const naam = [info.voornaam, info.achternaam].filter(Boolean).join(' ');
  return naam || 'Onbekende klant';
}

function getOfferteNummerLabel(q: any): string | null {
  const n = q?.offerteNummer;
  if (typeof n === 'number' && Number.isFinite(n)) return `Offerte #${n}`;
  return null;
}

// ✅ Altijd naar overzicht
function getOverzichtHref(quoteId: string) {
  return `/offertes/${quoteId}/overzicht`;
}

function StatusBadge({ status }: { status: Status }) {
  const statusMap: Record<Status, { text: string; className: string }> = {
    concept: { text: 'Concept', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    in_behandeling: { text: 'Bezig', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    verzonden: { text: 'Verzonden', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    geaccepteerd: { text: 'Geaccepteerd', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    afgewezen: { text: 'Afgewezen', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    verlopen: { text: 'Verlopen', className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  };

  const safeStatus: Status = statusMap[status] ? status : 'concept';
  const { text, className } = statusMap[safeStatus];

  return (
    <Badge
      variant="outline"
      className={`font-semibold px-2.5 py-0.5 text-[10px] uppercase tracking-wider shadow-sm ${className}`}
    >
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
    if (naam) naam = naam.charAt(0).toUpperCase() + naam.slice(1);
    return naam ? `Welkom, ${naam}` : 'Welkom';
  }, [user]);

  const [laden, setLaden] = useState(true);
  const [offertes, setOffertes] = useState<QuoteMetDatums[]>([]);
  const [zoek, setZoek] = useState('');
  const [fout, setFout] = useState<string | null>(null);

  // ✅ delete flow
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuoteMetDatums | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ creating flow
  const [isCreating, setIsCreating] = useState(false);

  async function handleNewQuote() {
    if (!user || !firestore) return;
    setIsCreating(true);
    try {
      const id = await createEmptyQuote(firestore, user.uid);
      router.push(`/offertes/${id}/klant`);
    } catch (e: any) {
      console.error(e);
      setFout(e.message || 'Kon nieuwe klus niet aanmaken.');
      setIsCreating(false);
    }
  }

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;

    setLaden(true);
    setFout(null);

    const ref = collection(firestore, 'quotes');
    const q = query(ref, where('klantinformatie.userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data: QuoteMetDatums[] = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as any;
          return {
            ...raw,
            id: docSnap.id,
            createdAtDate: naarDate(raw?.createdAt),
            updatedAtDate: naarDate(raw?.updatedAt),
            sentAtDate: naarDate(raw?.sentAt),
            offerteNummer: typeof raw?.offerteNummer === 'number' ? raw.offerteNummer : null,
          };
        });
        setOffertes(data);
        setLaden(false);
      },
      (err: any) => {
        console.error('Fout bij ophalen klussen:', err);
        setFout(`${err.code}: ${err.message}`);
        setLaden(false);
      }
    );

    return () => unsub();
  }, [user, firestore]);

  const sortedByRecent = useMemo(() => {
    const arr = [...offertes];
    arr.sort((a, b) => {
      const aT = (a.updatedAtDate ?? a.createdAtDate)?.getTime() ?? 0;
      const bT = (b.updatedAtDate ?? b.createdAtDate)?.getTime() ?? 0;
      return bT - aT;
    });
    return arr;
  }, [offertes]);

  const lopendeKlus = useMemo(() => {
    const drafts = sortedByRecent.filter((o) => o.status === 'concept' || o.status === 'in_behandeling');
    return drafts[0] ?? null;
  }, [sortedByRecent]);

  const recenteKlussen = useMemo(() => {
    const s = zoek.trim().toLowerCase();
    let result = [...sortedByRecent];
    if (s) {
      result = result.filter((o) => {
        const nr = getOfferteNummerLabel(o)?.toLowerCase() || '';
        return (
          getTitel(o).toLowerCase().includes(s) ||
          getKlantNaam(o).toLowerCase().includes(s) ||
          nr.includes(s)
        );
      });
    }
    return result.slice(0, 12);
  }, [sortedByRecent, zoek]);

  function openDeleteDialog(offerte: QuoteMetDatums) {
    setDeleteTarget(offerte);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!firestore || !deleteTarget) return;
    setDeleting(true);

    try {
      await deleteDoc(fsDoc(firestore, 'quotes', deleteTarget.id));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      console.error('Fout bij verwijderen offerte:', e);
      // bewust geen toast hier: jij gebruikt dat niet op deze pagina nu
    } finally {
      setDeleting(false);
    }
  }

  if (isUserLoading || !user) return <DashboardSkeleton />;

  const dialogNr = deleteTarget ? getOfferteNummerLabel(deleteTarget) : null;
  const dialogKlant = deleteTarget ? getKlantNaam(deleteTarget) : '';

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <DashboardHeader user={user} title="Dashboard" />

        <main className="flex flex-1 flex-col items-center p-4 md:p-6 pb-24">
          <div className="w-full max-w-3xl space-y-10">
            <div className="px-1">
              <div className="text-3xl font-light tracking-tight">{begroeting}</div>
            </div>

            <Card className="relative overflow-hidden border-zinc-800/50 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/30">
              <div className="absolute -right-6 -top-6 text-zinc-800/20 rotate-12">
                <FilePlus className="h-48 w-48" />
              </div>

              <CardContent className="relative p-6 md:p-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 max-w-lg relative z-10">
                    <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight text-white">Nieuwe klus</h1>
                    <p className="mt-2 text-base text-zinc-400">
                      Start met het uitwerken van een nieuwe klus. <br />
                      <span className="text-sm opacity-70">Kies een werkwijze en voeg direct materialen toe.</span>
                    </p>
                  </div>
                  <div className="shrink-0 relative z-10 pt-1">
                    <Button
                      variant="success"
                      className="gap-2 h-12 px-6 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 hover:shadow-emerald-500/30"
                      onClick={handleNewQuote}
                      disabled={isCreating}
                    >
                      {isCreating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Plus className="h-5 w-5" />
                      )}
                      {isCreating ? 'Bezig...' : 'Nieuwe klus starten'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {lopendeKlus && (
              <Card className="border-zinc-800/60 bg-zinc-900/20 backdrop-blur-xl">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-400 mb-1">Lopende klus</div>
                      <div className="text-base font-medium text-zinc-200 truncate">
                        {getKlantNaam(lopendeKlus)} — {getTitel(lopendeKlus)}
                      </div>
                      {getOfferteNummerLabel(lopendeKlus) && (
                        <div className="mt-1 font-mono text-xs text-zinc-500">{getOfferteNummerLabel(lopendeKlus)}</div>
                      )}
                    </div>

                    <Button asChild variant="secondary" className="shrink-0 gap-2 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50">
                      <Link href={getOverzichtHref(lopendeKlus.id)}>
                        <Pencil className="h-4 w-4" />
                        Bewerken
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-none bg-transparent shadow-none">
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6 px-1">
                  <div>
                    <div className="text-lg font-semibold tracking-tight text-white">Recente klussen</div>
                    <div className="text-sm text-zinc-400">Terugvinden en openen.</div>
                  </div>
                  <Input
                    placeholder="Zoek op klus..."
                    className="w-full md:w-[280px] bg-zinc-900/50 border-zinc-800 focus:bg-zinc-900 transition-colors"
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                  />
                </div>

                <div className="mt-4">
                  {fout ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                      Firestore fout: <span className="font-mono">{fout}</span>
                    </div>
                  ) : laden ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
                      ))}
                    </div>
                  ) : recenteKlussen.length === 0 ? (
                    <div className="rounded-2xl border bg-background/20 p-6 text-center text-muted-foreground">
                      Nog geen klussen gevonden.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recenteKlussen.map((o) => {
                        const datum = o.updatedAtDate ?? o.createdAtDate;
                        const nrLabel = getOfferteNummerLabel(o);
                        const totaal = (o as any).totaalbedrag || (o as any).amount || 0;


                        return (
                          <div
                            key={o.id}
                            className="group relative flex items-center justify-between gap-4 rounded-xl border border-zinc-800/40 bg-zinc-900/40 px-4 py-3.5 hover:bg-zinc-800/60 hover:border-zinc-700/50 hover:shadow-md transition-all duration-200 backdrop-blur-sm"
                          >
                            {/* Full row click target */}
                            <Link href={getOverzichtHref(o.id)} className="absolute inset-0 z-0" />

                            <div className="flex-1 min-w-0 z-10 pointer-events-none">
                              <div className="flex items-center gap-3 mb-1 min-w-0">
                                <span className="font-bold text-zinc-100 truncate text-base">{getKlantNaam(o)}</span>

                                {nrLabel && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 text-zinc-500 shrink-0">
                                    {nrLabel}
                                  </span>
                                )}

                                <StatusBadge status={o.status as Status} />
                              </div>

                              <div className="flex items-center gap-3 text-xs text-zinc-500">
                                <span className="truncate max-w-[200px] font-medium text-zinc-400">
                                  {getTitel(o)}
                                </span>
                                <span className="opacity-20">•</span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3 opacity-70" />
                                  {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                                </span>
                                <span className="opacity-20">•</span>
                                <span className={cn(
                                  "font-semibold",
                                  totaal > 0 ? "text-emerald-400" : "text-zinc-600"
                                )}>
                                  {formatCurrency(totaal)}
                                </span>
                              </div>
                            </div>

                            {/* Actions - visible always */}
                            <div className="flex items-center gap-2 z-20">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="secondary" size="sm" className="gap-2 h-8 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50">
                                    <Link href={getOverzichtHref(o.id)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                      <span className="hidden sm:inline">Bewerken</span>
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Bewerk deze klus</TooltipContent>
                              </Tooltip>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  openDeleteDialog(o);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Verwijderen</span>
                              </Button>
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

        {/* ✅ Confirm dialog met exact jouw delete-button look (soft destructive) */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Offerte verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je deze offerte definitief wilt verwijderen? Dit kan niet ongedaan gemaakt worden.
                {deleteTarget ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-zinc-300">
                      {dialogNr ?? 'Offerte'}
                    </span>
                    <span className="opacity-30 mx-2">•</span>
                    <span>{dialogKlant}</span>
                  </div>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel disabled={deleting} className="rounded-xl">
                Annuleren
              </AlertDialogCancel>

              <Button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                variant="destructiveSoft"
              >
                {deleting ? 'Verwijderen...' : 'Verwijderen'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <BottomNav />
      </div >
    </TooltipProvider >
  );
}
