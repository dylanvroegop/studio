'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Timestamp, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Archive, FileSignature, Loader2, MoreHorizontal, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import type { Meerwerkbon, MeerwerkbonStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/meerwerkbon-utils';
import { MeerwerkbonStatusBadge } from '@/components/meerwerk/MeerwerkbonStatusBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type FilterMode = 'alle' | MeerwerkbonStatus;

function naarDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function getMeerwerkbonSideBorderClass(status: MeerwerkbonStatus): string {
  const map: Record<MeerwerkbonStatus, string> = {
    concept: 'border-l-zinc-500/70',
    verzonden: 'border-l-blue-500',
    akkoord: 'border-l-emerald-500',
    afgekeurd: 'border-l-red-500',
    gefactureerd: 'border-l-emerald-400',
    geannuleerd: 'border-l-zinc-700',
  };
  return map[status] || map.concept;
}

export default function MeerwerkbonPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('alle');
  const [items, setItems] = useState<Array<Meerwerkbon & { updatedAtDate: Date | null }>>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<(Meerwerkbon & { updatedAtDate: Date | null }) | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;
    setLoading(true);
    setError(null);

    const ref = collection(firestore, 'meerwerkbonnen');
    const q = query(ref, where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              ...(data as Meerwerkbon),
              id: docSnap.id,
              updatedAtDate: naarDate(data?.updatedAt || data?.createdAt),
            };
          })
          .filter((row) => !row.archived);

        rows.sort((a, b) => (b.updatedAtDate?.getTime() || 0) - (a.updatedAtDate?.getTime() || 0));
        setItems(rows);
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij laden meerwerkbonnen:', err);
        setError(`${err?.code ?? 'error'}: ${err?.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, firestore]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'alle' && item.status !== filter) return false;
      if (!term) return true;

      const label = (item.numbering?.label || '').toLowerCase();
      const klant = (item.clientSnapshot?.naam || '').toLowerCase();
      const linkedQuotes = (item.linkedQuoteIds || []).join(' ').toLowerCase();
      return label.includes(term) || klant.includes(term) || linkedQuotes.includes(term);
    });
  }, [items, search, filter]);

  function openArchiveDialog(item: Meerwerkbon & { updatedAtDate: Date | null }): void {
    setArchiveTarget(item);
    setArchiveOpen(true);
  }

  async function confirmArchive(): Promise<void> {
    if (!user || !firestore || !archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const ref = doc(firestore, 'meerwerkbonnen', archiveTarget.id);
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
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon meerwerkbon niet archiveren.'}`);
    } finally {
      setArchiving(false);
    }
  }

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const filterOptions: Array<{ value: FilterMode; label: string }> = [
    { value: 'alle', label: 'Alle' },
    { value: 'concept', label: 'Concept' },
    { value: 'akkoord', label: 'Akkoord' },
    { value: 'verzonden', label: 'Verzonden' },
  ];

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Meerwerkbon" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-5xl space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-5">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Zoek op klant, bonnummer of offerte-id..."
                    className="pl-9"
                  />
                </div>
                <Button asChild type="button" className="h-10 shrink-0 gap-2 px-4">
                  <Link href="/meerwerkbon/nieuw">
                    <Plus className="h-4 w-4" />
                    Nieuwe meerwerkbon
                  </Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {filterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={filter === option.value ? 'default' : 'ghost'}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-9 rounded-full px-4 transition-all duration-200',
                      filter === option.value
                        ? 'bg-amber-500 text-black hover:bg-amber-400'
                        : 'border border-border/70 bg-transparent text-muted-foreground hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-200'
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center space-y-3">
                <div className="font-semibold">Geen meerwerkbonnen gevonden</div>
                <div className="text-sm text-muted-foreground">Maak een nieuwe meerwerkbon vanuit een offerte.</div>
                <Button
                  asChild
                  variant="outline"
                  className="mt-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200 dark:hover:text-emerald-100"
                >
                  <Link href="/meerwerkbon/nieuw">Nieuwe meerwerkbon</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'group relative cursor-pointer rounded-xl border border-l-4 border-border/80 bg-card/75 px-4 py-3 shadow-sm transition-all duration-200 hover:bg-card hover:border-border hover:shadow-md active:scale-[0.998] sm:px-5',
                    getMeerwerkbonSideBorderClass(item.status)
                  )}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/meerwerkbon/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/meerwerkbon/${item.id}`);
                    }
                  }}
                >
                  <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 pointer-events-none">
                      <div className="truncate text-base font-semibold text-foreground sm:text-lg">
                        {item.clientSnapshot?.naam || 'Onbekende klant'}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
                        <span className="truncate">{item.numbering?.label || item.id.slice(0, 8)}</span>
                        <span className="opacity-40">•</span>
                        <span>{item.updatedAtDate ? format(item.updatedAtDate, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                        <span>
                          <MeerwerkbonStatusBadge status={item.status} className="h-6 px-2.5 text-[11px]" />
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground/90">
                        {(item.linkedQuoteIds || []).length} gekoppelde offerte(s)
                      </div>
                      <div className="mt-2 text-xl font-bold tabular-nums text-emerald-400 sm:hidden">
                        {formatCurrency(item.totals?.totaalInclBtw || 0)}
                      </div>
                    </div>

                    <div className="relative z-20 flex items-center gap-1.5 sm:gap-2">
                      <div className="hidden min-w-[140px] text-right sm:block">
                        <div className="text-2xl font-bold tabular-nums text-emerald-400">
                          {formatCurrency(item.totals?.totaalInclBtw || 0)}
                        </div>
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        className="h-9 gap-2 border border-amber-400/40 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          router.push(`/meerwerkbon/${item.id}`);
                        }}
                      >
                        <FileSignature className="h-3.5 w-3.5" />
                        Bekijk bon
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg border border-border/70 bg-background/40 hover:bg-muted/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Meer acties</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuLabel>Meerwerkbon acties</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              openArchiveDialog(item);
                            }}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archiveren
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Meerwerkbon archiveren?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze meerwerkbon wordt verplaatst naar het archief. Je kunt dit later ongedaan maken via het archief.
              {archiveTarget ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">
                    {archiveTarget.numbering?.label || archiveTarget.id.slice(0, 8)}
                  </span>
                  <span className="opacity-30 mx-2">•</span>
                  <span>{archiveTarget.clientSnapshot?.naam || 'Onbekende klant'}</span>
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={archiving} className="rounded-xl">
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                onClick={confirmArchive}
                disabled={archiving}
                variant="destructiveSoft"
              >
                {archiving ? 'Archiveren...' : 'Archiveren'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
