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

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  PlusCircle,
  FilePen,
  Send,
  Clock,
  CircleDollarSign,
  AlertTriangle,
} from 'lucide-react';

import { format, subDays, isBefore } from 'date-fns';
import { nl } from 'date-fns/locale';

type Status = Quote['status'];
type SortOption = 'createdAt_desc' | 'createdAt_asc' | 'amount_desc' | 'amount_asc';

type QuoteMetDatums = Quote & {
  createdAtDate?: Date | null;
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

function StatusBadge({ status }: { status: Status }) {
  const statusMap: Record<Status, { text: string; className: string }> = {
    concept: { text: 'Concept', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
    in_behandeling: { text: 'In behandeling', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    verzonden: { text: 'Verzonden', className: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    geaccepteerd: { text: 'Geaccepteerd', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
    afgewezen: { text: 'Afgewezen', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
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
    <div className="flex flex-col min-h-screen">
      <DashboardHeader user={null} />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl flex items-center gap-3">
          <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Dashboard laden...
        </div>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtext,
  icon,
  valueClassName = '',
}: {
  title: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName}`}>{value}</div>
        <p className="text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteMetDatums[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('createdAt_desc');

  // Auth redirect
  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  // Live quotes
  useEffect(() => {
    if (!user || !firestore) return;

    setLoading(true);

    const quotesRef = collection(firestore, 'quotes');
    const q = query(quotesRef, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data: QuoteMetDatums[] = snapshot.docs.map((doc) => {
          const raw = doc.data() as Quote;

          return {
            ...raw,
            createdAtDate: naarDate((raw as any).createdAt),
            sentAtDate: naarDate((raw as any).sentAt),
            id: doc.id,
          };
        });

        setQuotes(data);
        setLoading(false);
      },
      (err) => {
        console.error('Fout bij ophalen offertes:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, firestore]);

  // Filtering + sorting (derived)
  const filteredQuotes = useMemo(() => {
    let result = [...quotes];

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter((q) => {
        const t = (q.titel || '').toLowerCase();
        const k = ((q as any).clientName || '').toLowerCase();
        return t.includes(s) || k.includes(s);
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter((q) => q.status === statusFilter);
    }

    result.sort((a, b) => {
      const aDate = a.createdAtDate ? a.createdAtDate.getTime() : 0;
      const bDate = b.createdAtDate ? b.createdAtDate.getTime() : 0;
      const aAmt = a.amount || 0;
      const bAmt = b.amount || 0;

      switch (sortOption) {
        case 'createdAt_asc':
          return aDate - bDate;
        case 'amount_desc':
          return bAmt - aAmt;
        case 'amount_asc':
          return aAmt - bAmt;
        case 'createdAt_desc':
        default:
          return bDate - aDate;
      }
    });

    return result;
  }, [quotes, search, statusFilter, sortOption]);

  const handleDuplicate = async (quote: QuoteMetDatums) => {
    if (!user || !firestore) return;

    const { id, createdAtDate, sentAtDate, createdAt, sentAt, status, ...rest } = quote;

    try {
      const newDocRef = await addDocumentNonBlocking(collection(firestore, 'quotes'), {
        ...rest,
        userId: user.uid,
        status: 'concept',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: `${quote.titel} (Kopie)`,
      });

      if (newDocRef) router.push(`/offertes/${newDocRef.id}`);
    } catch (e) {
      console.error('Fout bij dupliceren offerte:', e);
    }
  };

  // Stats
  const thirtyDaysAgo = subDays(new Date(), 30);
  const openStandCount = quotes.filter((q) => q.status === 'concept' || q.status === 'in_behandeling').length;
  const verzondenCount = quotes.filter((q) => q.status === 'verzonden').length;

  const geaccepteerd30dSum = quotes
    .filter((q) => q.status === 'geaccepteerd' && (q.createdAtDate ? q.createdAtDate >= thirtyDaysAgo : false))
    .reduce((sum, q) => sum + (q.amount || 0), 0);

  const fiveDaysAgo = subDays(new Date(), 5);
  const followUps = quotes.filter((q) => {
    if (q.status !== 'verzonden') return false;
    if (!q.sentAtDate) return false;
    return isBefore(q.sentAtDate, fiveDaysAgo);
  });

  if (isUserLoading || !user) return <DashboardSkeleton />;

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen">
        <DashboardHeader user={user} />

        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="icon">
                <Link href="/landing" aria-label="Terug">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="font-semibold text-2xl md:text-3xl">Dashboard</h1>
                <p className="text-sm text-muted-foreground">Overzicht van je offertes en opvolging.</p>
              </div>
            </div>

            <Button asChild className="gap-2">
              <Link href="/offertes/nieuw">
                <PlusCircle className="h-4 w-4" />
                Nieuwe offerte
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Openstaand"
              value={openStandCount}
              subtext="Concept + in behandeling"
              icon={<FilePen className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Verzonden"
              value={verzondenCount}
              subtext="Wacht op reactie"
              icon={<Send className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Geaccepteerd (30d)"
              value={formatCurrency(geaccepteerd30dSum)}
              subtext="Totaalbedrag laatste 30 dagen"
              icon={<CircleDollarSign className="h-4 w-4 text-muted-foreground" />}
              valueClassName="text-green-400"
            />
            <StatCard
              title="Opvolgen"
              value={followUps.length}
              subtext="Verzonden > 5 dagen geleden"
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              valueClassName={followUps.length > 0 ? 'text-orange-400' : ''}
            />
          </div>

          {/* Follow-up */}
          {followUps.length > 0 && (
            <Card className="border-orange-500/20 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  Vandaag opvolgen
                </CardTitle>
                <CardDescription>Deze offertes zijn verzonden en al een tijd stil.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {followUps.slice(0, 6).map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`/offertes/${q.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 p-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                          {(q as any).klantnaam || '–'} – {q.titel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Verzonden:{' '}
                            {q.sentAtDate ? format(q.sentAtDate, 'd MMM yyyy', { locale: nl }) : '—'}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground shrink-0">{formatCurrency(q.amount)}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Quotes table */}
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle>Recente offertes</CardTitle>
              <CardDescription>Zoek, filter en sorteer je offertes.</CardDescription>

              <div className="mt-4 flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Zoek op titel of klant..."
                  className="max-w-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Alle statussen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      <SelectItem value="concept">Concept</SelectItem>
                      <SelectItem value="in_behandeling">In behandeling</SelectItem>
                      <SelectItem value="verzonden">Verzonden</SelectItem>
                      <SelectItem value="geaccepteerd">Geaccepteerd</SelectItem>
                      <SelectItem value="afgewezen">Afgewezen</SelectItem>
                      <SelectItem value="verlopen">Verlopen</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Sorteren op" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="createdAt_desc">Datum (nieuwste)</SelectItem>
                      <SelectItem value="createdAt_asc">Datum (oudste)</SelectItem>
                      <SelectItem value="amount_desc">Bedrag (hoogste)</SelectItem>
                      <SelectItem value="amount_asc">Bedrag (laagste)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Klant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead className="text-center">Acties</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredQuotes.length > 0 ? (
                      filteredQuotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium">{q.titel}</TableCell>
                          <TableCell>{(q as any).klantNaam ?? (q as any).clientName ?? '-'}</TableCell>
                          <TableCell>
                            <StatusBadge status={q.status} />
                          </TableCell>
                          <TableCell>
                            {q.createdAtDate ? format(q.createdAtDate, 'd MMM yyyy', { locale: nl }) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(q.amount)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="ghost" size="icon">
                                    <Link href={`/offertes/${q.id}`} aria-label="Openen">
                                      <ArrowUpRight className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Openen</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleDuplicate(q)} aria-label="Dupliceren">
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Dupliceren</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-28 text-muted-foreground">
                          Geen offertes gevonden. Maak je eerste offerte via <span className="font-medium">“Nieuwe offerte”</span>.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </TooltipProvider>
  );
}
