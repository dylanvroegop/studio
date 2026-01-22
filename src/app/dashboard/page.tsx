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
  Circle,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
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

// ✅ Altijd naar overzicht (Financiële details / Edit flow)
function getOverzichtHref(quoteId: string) {
  return `/offertes/${quoteId}/overzicht`;
}

// ✅ Naar Project Details (Tekeningen / Technische info)
function getDetailHref(quoteId: string) {
  return `/offertes/${quoteId}`;
}

// Helper to check if a single job (klus) is complete
function jobIsComplete(job: any): boolean {
  const selections = job?.materialen?.selections;
  const hasSelections =
    selections &&
    typeof selections === 'object' &&
    Object.keys(selections).length > 0;

  const presetLabel = job?.werkwijze?.presetLabel;
  const hasWerkwijzePreset =
    !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';

  return hasSelections || hasWerkwijzePreset;
}

// Calculate work completion status for a quote
type WorkStatus =
  | { type: 'no_jobs' }
  | { type: 'in_progress'; complete: number; total: number }
  | { type: 'ready'; total: number }
  | { type: 'sent'; status: Status };

function getQuoteWorkStatus(quote: any): WorkStatus {
  const status = quote.status as Status;

  // If already sent/accepted/rejected, show that status
  if (status === 'verzonden' || status === 'geaccepteerd' || status === 'afgewezen' || status === 'verlopen') {
    return { type: 'sent', status };
  }

  // Extract jobs from the quote
  const klussen = quote.klussen;
  if (!klussen || typeof klussen !== 'object') {
    return { type: 'no_jobs' };
  }

  const jobIds = Object.keys(klussen);
  if (jobIds.length === 0) {
    return { type: 'no_jobs' };
  }

  const total = jobIds.length;
  const complete = jobIds.filter(id => jobIsComplete(klussen[id])).length;

  if (complete === total) {
    return { type: 'ready', total };
  }

  return { type: 'in_progress', complete, total };
}

function WorkStatusBadge({ quote }: { quote: any }) {
  const workStatus = getQuoteWorkStatus(quote);

  if (workStatus.type === 'no_jobs') {
    return (
      <Badge
        variant="outline"
        className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
      >
        <Circle className="h-3 w-3" />
        Geen klussen
      </Badge>
    );
  }

  if (workStatus.type === 'in_progress') {
    return (
      <Badge
        variant="outline"
        className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20"
      >
        <Clock className="h-3 w-3" />
        {workStatus.complete}/{workStatus.total} klaar
      </Badge>
    );
  }

  if (workStatus.type === 'ready') {
    return (
      <Badge
        variant="outline"
        className="font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="h-3 w-3" />
        Klaar voor offerte
      </Badge>
    );
  }

  // workStatus.type === 'sent'
  const sentStatusMap: Record<Status, { text: string; className: string; icon: React.ReactNode }> = {
    concept: { text: 'Concept', className: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/30', icon: <Circle className="h-3 w-3" /> },
    in_behandeling: { text: 'In bewerking', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock className="h-3 w-3" /> },
    verzonden: { text: 'Verzonden', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: <Send className="h-3 w-3" /> },
    geaccepteerd: { text: 'Geaccepteerd', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="h-3 w-3" /> },
    afgewezen: { text: 'Afgewezen', className: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="h-3 w-3" /> },
    verlopen: { text: 'Verlopen', className: 'bg-zinc-800 text-zinc-500 border-zinc-700', icon: <AlertCircle className="h-3 w-3" /> },
  };

  const { text, className, icon } = sentStatusMap[workStatus.status] || sentStatusMap.concept;

  return (
    <Badge
      variant="outline"
      className={`font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5 ${className}`}
    >
      {icon}
      {text}
    </Badge>
  );
}

// Helper to check if a quote is still being worked on (not sent/completed)
function isLopendeKlus(quote: any): boolean {
  const workStatus = getQuoteWorkStatus(quote);
  return workStatus.type === 'no_jobs' || workStatus.type === 'in_progress' || workStatus.type === 'ready';
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
      <div className="min-h-screen">
        <DashboardHeader user={user} title="Dashboard" />

        <main className="flex flex-col items-center p-4 md:px-6 md:pt-6 pb-32">
          <div className="w-full max-w-3xl space-y-14">
            <div className="px-1">
              <div className="text-3xl font-light tracking-tight">{begroeting}</div>
            </div>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-zinc-900/90 via-zinc-900/80 to-emerald-900/20 shadow-2xl shadow-black/50 ring-1 ring-white/10 group">
              <div className="absolute -right-6 -top-6 text-emerald-500/5 rotate-12 transition-transform duration-700 group-hover:rotate-6 group-hover:scale-110">
                <FilePlus className="h-64 w-64" />
              </div>

              <CardContent className="relative p-8 md:p-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                  <div className="min-w-0 max-w-lg relative z-10 space-y-2">
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/20 bg-emerald-500/10 mb-2">
                      Aanbevolen
                    </Badge>
                    <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-sm">Nieuwe klus starten</h1>
                    <p className="text-lg text-zinc-400 max-w-md">
                      Maak direct een nieuwe calculatie. Kies een werkwijze en voeg materialen toe in enkele seconden.
                    </p>
                  </div>
                  <div className="shrink-0 relative z-10">
                    <Button
                      variant="success"
                      size="lg"
                      className="gap-3 h-14 px-8 text-base shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 hover:shadow-emerald-500/40 font-semibold"
                      onClick={handleNewQuote}
                      disabled={isCreating}
                    >
                      {isCreating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Plus className="h-5 w-5" />
                      )}
                      {isCreating ? 'Mee bezig...' : 'Nieuwe offerte'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>



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
                      {recenteKlussen.map((o, index) => {
                        const datum = o.updatedAtDate ?? o.createdAtDate;
                        const nrLabel = getOfferteNummerLabel(o);
                        const totaal = (o as any).totaalbedrag || (o as any).amount || 0;
                        const lopend = isLopendeKlus(o);

                        return (
                          <div
                            key={o.id}
                            style={{ animationDelay: `${index * 50}ms` }}
                            className={cn(
                              "group relative flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-card/40 px-5 py-4 hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                              lopend
                                ? "border-l-4 border-l-emerald-500" // Accent for active jobs
                                : ""
                            )}
                          >
                            {/* Full row click target */}
                            <Link href={getDetailHref(o.id)} className="absolute inset-0 z-0" />

                            <div className="flex-1 min-w-0 z-10 pointer-events-none space-y-1">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-bold text-zinc-100 truncate text-base group-hover:text-white transition-colors">
                                  {getKlantNaam(o)}
                                </span>

                                {nrLabel && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-400 shrink-0">
                                    {nrLabel}
                                  </span>
                                )}

                                <WorkStatusBadge quote={o} />
                              </div>

                              <div className="flex items-center gap-3 text-sm text-zinc-500">
                                <span className="truncate max-w-[200px] text-zinc-400 font-medium">
                                  {getTitel(o)}
                                </span>
                                <span className="opacity-20">•</span>
                                <span className="flex items-center gap-1.5 group-hover:text-zinc-300 transition-colors">
                                  <Calendar className="h-3.5 w-3.5 opacity-70" />
                                  {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                                </span>
                                <span className="opacity-20">•</span>
                                <span className={cn(
                                  "font-semibold tracking-wide",
                                  totaal > 0 ? "text-emerald-400" : "text-zinc-600"
                                )}>
                                  {formatCurrency(totaal)}
                                </span>
                              </div>
                            </div>

                            {/* Actions - visible always but subtler */}
                            <div className="flex items-center gap-2 z-20 opacity-70 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="secondary" size="sm" className="gap-2 h-9 bg-zinc-800/80 hover:bg-zinc-700 border border-white/5 shadow-sm">
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
                                className="h-9 w-9 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border hover:border-red-500/20 rounded-lg transition-all"
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
