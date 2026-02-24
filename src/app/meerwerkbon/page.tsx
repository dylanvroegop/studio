'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Timestamp, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Calendar, FileSignature, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFirestore, useUser } from '@/firebase';
import type { Meerwerkbon, MeerwerkbonStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/meerwerkbon-utils';
import { MeerwerkbonStatusBadge } from '@/components/meerwerk/MeerwerkbonStatusBadge';
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

  return (
    <div className="app-shell min-h-screen bg-background pb-36 md:pb-28">
      <AppNavigation />
      <DashboardHeader user={user} title="Meerwerkbon" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-amber-400" />
                Overzicht
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Zoek op klant, bonnummer of offerte-id..."
                  className="pl-9"
                />
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
            <div className="space-y-3">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'group relative flex items-center justify-between gap-4 rounded-xl border border-l-4 border-border bg-card/60 px-5 py-4 hover:bg-card hover:border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
                    getMeerwerkbonSideBorderClass(item.status)
                  )}
                >
                  <Link href={`/meerwerkbon/${item.id}`} className="absolute inset-0 z-0" />

                  <div className="flex-1 min-w-0 z-10 pointer-events-none space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-foreground truncate text-base transition-colors">
                        {item.clientSnapshot?.naam || 'Onbekende klant'}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground shrink-0">
                        {item.numbering?.label || item.id.slice(0, 8)}
                      </span>
                      <MeerwerkbonStatusBadge status={item.status} />
                    </div>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="truncate max-w-[220px] text-muted-foreground font-medium">
                        {(item.linkedQuoteIds || []).length} gekoppelde offerte(s)
                      </span>
                      <span className="opacity-20">•</span>
                      <span className="flex items-center gap-1.5 transition-colors">
                        <Calendar className="h-3.5 w-3.5 opacity-70" />
                        {item.updatedAtDate ? format(item.updatedAtDate, 'd MMM yyyy', { locale: nl }) : '—'}
                      </span>
                      <span className="opacity-20">•</span>
                      <span className="font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.totals?.totaalInclBtw || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 z-20 opacity-100 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      asChild
                      variant="secondary"
                      size="sm"
                      className="gap-2 h-9 bg-muted/60 hover:bg-muted border border-border shadow-sm"
                    >
                      <Link href={`/meerwerkbon/${item.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Openen</span>
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-muted-foreground transition-all hover:bg-muted/70"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Meer acties</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            openArchiveDialog(item);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="overview-sticky-footer fixed bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 md:bottom-0">
        <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
          <div className="rounded-2xl border border-border/70 bg-card/95 p-2 shadow-xl backdrop-blur-md">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                asChild
                variant="default"
                className="h-10 col-span-2 gap-2 sm:col-span-1"
              >
                <Link href="/meerwerkbon/nieuw">
                  <Plus className="h-4 w-4" />
                  Nieuwe meerwerkbon
                </Link>
              </Button>
              <Button
                type="button"
                variant={filter === 'alle' ? 'outline' : 'ghost'}
                onClick={() => setFilter('alle')}
                className={cn('h-10', filter === 'alle' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}
              >
                Alle
              </Button>
              <Button
                type="button"
                variant={filter === 'concept' ? 'outline' : 'ghost'}
                onClick={() => setFilter('concept')}
                className={cn('h-10', filter === 'concept' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}
              >
                Concept
              </Button>
              <Button
                type="button"
                variant={filter === 'akkoord' ? 'outline' : 'ghost'}
                onClick={() => setFilter('akkoord')}
                className={cn('h-10', filter === 'akkoord' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}
              >
                Akkoord
              </Button>
              <Button
                type="button"
                variant={filter === 'verzonden' ? 'outline' : 'ghost'}
                onClick={() => setFilter('verzonden')}
                className={cn('h-10', filter === 'verzonden' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}
              >
                Verzonden
              </Button>
            </div>
          </div>
        </div>
      </div>

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
