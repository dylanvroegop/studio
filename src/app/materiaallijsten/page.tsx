'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Timestamp, collection, onSnapshot, query, where } from 'firebase/firestore';
import { ClipboardList, FileText, Loader2, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import {
  createMaterialList,
  MATERIAL_LIST_STATUS_LABELS,
  type MaterialList,
  type MaterialListStatus,
  type QuoteLinkSnapshot,
} from '@/lib/material-lists';

type FilterMode = 'all' | MaterialListStatus;

interface QuoteOption extends QuoteLinkSnapshot {
  title: string;
  search: string;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  const record = getRecord(value);
  if (typeof record.seconds === 'number') return new Date(record.seconds * 1000);
  return null;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getClientName(data: Record<string, unknown>): string {
  const info = getRecord(data.klantinformatie);
  const fullName = `${getString(info.voornaam)} ${getString(info.achternaam)}`.trim();
  return getString(info.bedrijfsnaam) || getString(info.contactpersoon) || fullName || 'Onbekende klant';
}

function statusClass(status: MaterialListStatus): string {
  const map: Record<MaterialListStatus, string> = {
    draft: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-200',
    active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    completed: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
    archived: 'border-zinc-700/60 bg-zinc-700/20 text-zinc-400',
  };
  return map[status];
}

function MateriaallijstenPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [lists, setLists] = useState<Array<MaterialList & { itemCount: number; createdDate: Date | null }>>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('none');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    const quoteId = searchParams.get('quoteId');
    if (quoteId) {
      setSelectedQuoteId(quoteId);
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || !firestore) return;
    setLoading(true);
    const unsubLists = onSnapshot(
      query(collection(firestore, 'material_lists'), where('userId', '==', user.uid)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            ...(data as unknown as MaterialList),
            id: docSnap.id,
            itemCount: Number(data.item_count || 0),
            createdDate: toDate(data.created_at),
          };
        });
        rows.sort((a, b) => (toDate(b.updated_at)?.getTime() || 0) - (toDate(a.updated_at)?.getTime() || 0));
        setLists(rows);
        setLoading(false);
      },
      (err: unknown) => {
        const firebaseError = err as { code?: string; message?: string };
        setError(`${firebaseError.code ?? 'error'}: ${firebaseError.message ?? 'Materiaallijsten konden niet geladen worden.'}`);
        setLoading(false);
      }
    );

    const unsubQuotes = onSnapshot(
      query(collection(firestore, 'quotes'), where('userId', '==', user.uid)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const clientName = getClientName(data);
          const quoteNumber = typeof data.offerteNummer === 'number' || typeof data.offerteNummer === 'string' ? data.offerteNummer : null;
          const title = getString(data.titel) || getString(data.werkomschrijving) || `Offerte ${quoteNumber || docSnap.id}`;
          return {
            id: docSnap.id,
            quote_number: quoteNumber,
            quote_client_name: clientName,
            title,
            search: `${quoteNumber || ''} ${clientName} ${title}`.toLowerCase(),
          };
        });
        rows.sort((a, b) => String(b.quote_number || '').localeCompare(String(a.quote_number || '')));
        setQuotes(rows);
      }
    );

    return () => {
      unsubLists();
      unsubQuotes();
    };
  }, [firestore, user]);

  const selectedQuote = useMemo(() => quotes.find((quote) => quote.id === selectedQuoteId) ?? null, [quotes, selectedQuoteId]);

  useEffect(() => {
    if (!selectedQuote || createTitle.trim()) return;
    setCreateTitle(selectedQuote.quote_client_name ? `Materiaallijst ${selectedQuote.quote_client_name}` : 'Nieuwe materiaallijst');
  }, [createTitle, selectedQuote]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lists.filter((list) => {
      if (filter !== 'all' && list.status !== filter) return false;
      if (!term) return true;
      return [
        list.title,
        list.notes,
        list.quote_number,
        list.quote_client_name,
      ].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [filter, lists, search]);

  async function handleCreate(): Promise<void> {
    if (!user || !firestore || creating || !createTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createMaterialList(firestore, {
        userId: user.uid,
        title: createTitle,
        notes: createNotes,
        quote: selectedQuoteId === 'none' ? null : selectedQuote,
        status: 'draft',
      });
      setCreateOpen(false);
      setCreateTitle('');
      setCreateNotes('');
      setSelectedQuoteId('none');
      router.push(`/materiaallijsten/${id}`);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      setError(`${firebaseError.code ?? 'error'}: ${firebaseError.message ?? 'Materiaallijst kon niet aangemaakt worden.'}`);
    } finally {
      setCreating(false);
    }
  }

  if (isUserLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const filterOptions: Array<{ value: FilterMode; label: string }> = [
    { value: 'all', label: 'Alle' },
    { value: 'draft', label: 'Concept' },
    { value: 'active', label: 'Actief' },
    { value: 'completed', label: 'Compleet' },
    { value: 'archived', label: 'Archief' },
  ];

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Materiaallijsten" />
      <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-12 md:px-6">
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-5">
              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek op titel, offerte of klant..." />
                </div>
                <Select value={filter} onValueChange={(value) => setFilter(value as FilterMode)}>
                  <SelectTrigger className="h-11 w-full lg:w-[190px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="h-11 gap-2" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nieuwe materiaallijst
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <ClipboardList className="h-9 w-9 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Geen materiaallijsten gevonden</p>
                    <p className="text-sm text-muted-foreground">Maak een losse lijst of koppel een lijst aan een offerte.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filtered.map((list) => (
                <Card key={list.id} className="border-l-4 border-l-emerald-500/70 transition-colors hover:bg-muted/35">
                  <Link href={`/materiaallijsten/${list.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-semibold">{list.title}</h2>
                          <Badge variant="outline" className={cn('h-6', statusClass(list.status))}>{MATERIAL_LIST_STATUS_LABELS[list.status]}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{list.itemCount} regels</span>
                          <span>{list.createdDate ? format(list.createdDate, 'd MMM yyyy', { locale: nl }) : 'Datum onbekend'}</span>
                          {list.quote_id && (
                            <span className="inline-flex items-center gap-1 text-cyan-300">
                              <FileText className="h-3.5 w-3.5" />
                              Offerte {list.quote_number ? `#${list.quote_number}` : ''} {list.quote_client_name ? `- ${list.quote_client_name}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex h-11 items-center justify-center rounded-md border border-border bg-background/30 px-4 text-sm font-semibold md:w-[160px]">
                        Open lijst
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Materiaallijst maken</DialogTitle>
            <DialogDescription>Maak een losse inkooplijst of koppel hem direct aan een bestaande offerte.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Vlonder familie Jansen" />
            </div>
            <div className="space-y-2">
              <Label>Offerte koppelen</Label>
              <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Geen offerte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen offerte</SelectItem>
                  {quotes.slice(0, 80).map((quote) => (
                    <SelectItem key={quote.id} value={quote.id}>
                      {quote.quote_number ? `#${quote.quote_number} - ` : ''}{quote.quote_client_name} - {quote.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notities</Label>
              <Textarea value={createNotes} onChange={(event) => setCreateNotes(event.target.value)} placeholder="Bijvoorbeeld: eerst afhalen bij BMN, rest bestellen." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuleren</Button>
            <Button onClick={handleCreate} disabled={creating || !createTitle.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Maken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MateriaallijstenPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    >
      <MateriaallijstenPageContent />
    </Suspense>
  );
}
