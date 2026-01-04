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

import { DashboardHeader } from '@/components/dashboard-header';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

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

// ✅ Alleen de styling die jij gaf (zelfde look/feel als je andere delete-confirm)
const DESTRUCTIVE_BTN_SOFT =
  'border border-red-500/50 bg-red-500/15 text-red-100 ' +
  'hover:bg-red-500/25 hover:border-red-500/65 ' +
  'focus-visible:ring-red-500 focus-visible:ring-offset-0';

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
    concept: { text: 'Concept', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25' },
    in_behandeling: { text: 'Bezig', className: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
    verzonden: { text: 'Verzonden', className: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
    geaccepteerd: { text: 'Geaccepteerd', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
    afgewezen: { text: 'Afgewezen', className: 'bg-red-500/15 text-red-300 border-red-500/25' },
    verlopen: { text: 'Verlopen', className: 'bg-zinc-700 text-zinc-400 border-zinc-600' },
  };

  const safeStatus: Status = statusMap[status] ? status : 'concept';
  const { text, className } = statusMap[safeStatus];

  return (
    <Badge
      variant="outline"
      className={`font-medium px-2 py-0 text-[10px] uppercase tracking-wider ${className}`}
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
        <DashboardHeader user={user} />

        <main className="flex flex-1 flex-col items-center p-4 md:p-6 pb-24">
          <div className="w-full max-w-3xl space-y-6">
            <div className="px-1">
              <div className="text-lg font-medium leading-tight">{begroeting}</div>
            </div>

            <Card className="bg-card/50">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-semibold leading-tight">Nieuwe klus</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Start met het uitwerken van een nieuwe klus.
                    </p>
                  </div>
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

            {lopendeKlus && (
              <Card className="bg-card/50">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Lopende klus</div>
                      <div className="mt-1 text-sm text-muted-foreground truncate">
                        {getOfferteNummerLabel(lopendeKlus) ? (
                          <>
                            <span className="font-mono text-zinc-300">{getOfferteNummerLabel(lopendeKlus)}</span>
                            <span className="opacity-30 mx-2">•</span>
                          </>
                        ) : null}
                        {getKlantNaam(lopendeKlus)} — {getTitel(lopendeKlus)}
                      </div>
                    </div>

                    <Button asChild variant="secondary" className="shrink-0 gap-2">
                      <Link href={getOverzichtHref(lopendeKlus.id)}>
                        <Pencil className="h-4 w-4" />
                        Bewerken
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/50">
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-sm font-semibold">Recente klussen</div>
                    <div className="text-xs text-muted-foreground">Terugvinden en openen.</div>
                  </div>
                  <Input
                    placeholder="Zoek op klant, adres of #nummer..."
                    className="w-full md:w-[320px]"
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
                    <div className="space-y-2">
                      {recenteKlussen.map((o) => {
                        const datum = o.updatedAtDate ?? o.createdAtDate;
                        const nrLabel = getOfferteNummerLabel(o);

                        return (
                          <div
                            key={o.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800/50 bg-zinc-900/10 px-4 py-3 hover:bg-zinc-800/30 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <Link href={getOverzichtHref(o.id)} className="block">
                                <div className="flex items-center gap-3 mb-1 min-w-0">
                                  <span className="font-semibold text-zinc-200 truncate">{getKlantNaam(o)}</span>

                                  {nrLabel && (
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md border border-zinc-700/50 bg-zinc-900/20 text-zinc-300 shrink-0">
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
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                                  </span>
                                  <span className="opacity-20">•</span>
                                  <span className="font-semibold text-emerald-500/80">
                                    {formatCurrency((o as any).totaalbedrag || (o as any).amount)}
                                  </span>
                                </div>
                              </Link>
                            </div>

                            {/* ✅ Bewerken + 3-dots menu (zoals Klanten) */}
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="secondary" size="sm" className="gap-2">
                                    <Link href={getOverzichtHref(o.id)}>
                                      <Pencil className="h-4 w-4" />
                                      Bewerken
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Bewerk deze klus</TooltipContent>
                              </Tooltip>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-9 w-9">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Acties</span>
                                  </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuSeparator />
                                  {/* ✅ kleur in menu NIET aangepast — alleen rood label zoals jij wil */}
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      openDeleteDialog(o);
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Verwijderen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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

              {/* Let op: dit is bewust GEEN shadcn "destructive" variant.
                  Dit gebruikt jouw DESTRUCTIVE_BTN_SOFT classes zodat het exact matcht. */}
              <Button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className={`rounded-xl ${DESTRUCTIVE_BTN_SOFT}`}
              >
                {deleting ? 'Verwijderen...' : 'Verwijderen'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl px-3 py-2 flex items-center justify-around">
            <Link
              href="/klanten"
              className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Users className="h-5 w-5" /> Klanten
            </Link>
            <Link
              href="/materialen"
              className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Boxes className="h-5 w-5" /> Producten
            </Link>
            <Link
              href="/instellingen"
              className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-5 w-5" /> Instellingen
            </Link>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
