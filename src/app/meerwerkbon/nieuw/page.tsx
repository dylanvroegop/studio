'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Timestamp, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, FileSignature, Loader2, Search } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import { toast } from '@/hooks/use-toast';
import { createMeerwerkbon } from '@/lib/meerwerkbon-actions';
import { clientSnapshotKey, deriveClientSnapshotFromQuote, formatCurrency } from '@/lib/meerwerkbon-utils';
import type { MeerwerkbonTemplatePreset } from '@/lib/types';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/lib/types-settings';

type QuoteRow = {
  id: string;
  offerteNummer?: number;
  titel?: string;
  title?: string;
  amount?: number;
  totaalbedrag?: number;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  archived?: boolean;
  klantinformatie?: any;
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

function quoteTotal(quote: QuoteRow): number {
  const amount = typeof quote.amount === 'number'
    ? quote.amount
    : typeof quote.totaalbedrag === 'number'
      ? quote.totaalbedrag
      : 0;
  return Number.isFinite(amount) ? amount : 0;
}

function quoteLabel(quote: QuoteRow): string {
  return typeof quote.offerteNummer === 'number'
    ? `Offerte #${quote.offerteNummer}`
    : `Offerte ${quote.id.slice(0, 8)}`;
}

export default function NieuweMeerwerkbonPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [search, setSearch] = useState('');
  const [primaryQuoteId, setPrimaryQuoteId] = useState('');
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);

  const [templatePreset, setTemplatePreset] = useState<MeerwerkbonTemplatePreset>('uitgebreid');
  const [introText, setIntroText] = useState('');
  const [voorwaardenText, setVoorwaardenText] = useState('');
  const [clientForm, setClientForm] = useState({
    naam: '',
    email: '',
    telefoon: '',
    adres: '',
    postcode: '',
    plaats: '',
  });

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const quoteQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
        const quoteSnap = await getDocs(quoteQuery);
        const rows = quoteSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as QuoteRow))
          .filter((q) => !q.archived);

        rows.sort((a, b) => {
          const aMs = parseDate(a.updatedAt)?.getTime() ?? parseDate(a.createdAt)?.getTime() ?? 0;
          const bMs = parseDate(b.updatedAt)?.getTime() ?? parseDate(b.createdAt)?.getTime() ?? 0;
          return bMs - aMs;
        });

        const userSettingsSnap = await getDoc(doc(firestore, 'users', user.uid));
        const nextSettings = userSettingsSnap.exists() ? (userSettingsSnap.data() as any)?.settings : {};

        if (!cancelled) {
          setQuotes(rows);
          const merged = { ...DEFAULT_USER_SETTINGS, ...nextSettings } as UserSettings;
          setSettings(merged);
          setTemplatePreset(merged.standaardMeerwerkbonTemplatePreset || 'uitgebreid');
          setIntroText(merged.standaardMeerwerkbonIntroTekst || '');
          setVoorwaardenText(merged.standaardMeerwerkbonVoorwaarden || '');
        }
      } catch (error) {
        console.error(error);
        toast({
          title: 'Fout',
          description: 'Kon offertes of instellingen niet laden.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, firestore]);

  const quoteMap = useMemo(() => {
    const entries = quotes.map((quote) => [quote.id, quote] as const);
    return Object.fromEntries(entries) as Record<string, QuoteRow>;
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quotes.slice(0, 50);
    return quotes
      .filter((quote) => {
        const client = deriveClientSnapshotFromQuote(quote);
        return (
          quoteLabel(quote).toLowerCase().includes(term) ||
          (quote.titel || quote.title || '').toLowerCase().includes(term) ||
          (client.naam || '').toLowerCase().includes(term)
        );
      })
      .slice(0, 50);
  }, [quotes, search]);

  const primaryClientKey = useMemo(() => {
    if (!primaryQuoteId || !quoteMap[primaryQuoteId]) return '';
    return clientSnapshotKey(deriveClientSnapshotFromQuote(quoteMap[primaryQuoteId]));
  }, [primaryQuoteId, quoteMap]);
  const clientLockedByLinkedQuotes = Boolean(primaryQuoteId || selectedQuoteIds.length > 0);

  useEffect(() => {
    if (!primaryQuoteId || !quoteMap[primaryQuoteId]) return;
    const nextClient = deriveClientSnapshotFromQuote(quoteMap[primaryQuoteId]);
    setClientForm(nextClient);
    setSelectedQuoteIds((prev) => prev.filter((id) => id !== primaryQuoteId));
  }, [primaryQuoteId, quoteMap]);

  const handleToggleLinkedQuote = (quoteId: string) => {
    if (!primaryQuoteId) {
      toast({
        title: 'Kies eerst een hoofd-offerte',
        description: 'Selecteer eerst de offerte waarop deze meerwerkbon gebaseerd is.',
        variant: 'destructive',
      });
      return;
    }
    if (quoteId === primaryQuoteId) return;

    const candidate = quoteMap[quoteId];
    if (!candidate) return;
    const candidateKey = clientSnapshotKey(deriveClientSnapshotFromQuote(candidate));
    if (primaryClientKey && candidateKey !== primaryClientKey) {
      toast({
        title: 'Klant mismatch',
        description: 'Alle gekoppelde offertes moeten dezelfde klant hebben.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedQuoteIds((prev) => (
      prev.includes(quoteId)
        ? prev.filter((id) => id !== quoteId)
        : [...prev, quoteId]
    ));
  };

  const handleCreate = async () => {
    if (!user || !firestore || creating) return;
    if (!primaryQuoteId) {
      toast({
        title: 'Hoofd-offerte ontbreekt',
        description: 'Kies een hoofd-offerte om door te gaan.',
        variant: 'destructive',
      });
      return;
    }

    const clientName = clientForm.naam.trim();
    if (!clientName) {
      toast({
        title: 'Klantnaam vereist',
        description: 'Vul minimaal de klantnaam in.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const id = await createMeerwerkbon(firestore, {
        userId: user.uid,
        primaryQuoteId,
        linkedQuoteIds: selectedQuoteIds,
        quoteMap,
        clientSnapshot: {
          naam: clientForm.naam.trim(),
          email: clientForm.email.trim(),
          telefoon: clientForm.telefoon.trim(),
          adres: clientForm.adres.trim(),
          postcode: clientForm.postcode.trim(),
          plaats: clientForm.plaats.trim(),
        },
        templatePreset,
        introText,
        voorwaardenText,
        userSettings: settings,
      });

      router.push(`/meerwerkbon/${id}`);
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Kon meerwerkbon niet maken',
        description: error?.message || 'Onbekende fout',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

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
      <DashboardHeader user={user} title="Nieuwe meerwerkbon" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/meerwerkbon">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
            <Button
              type="button"
              variant="success"
              className="gap-2"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
              Meerwerkbon aanmaken
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Offertes koppelen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Zoek op klant, titel of offertenummer..."
                  className="pl-9"
                />
              </div>

              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {filteredQuotes.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-3">Geen offertes gevonden.</div>
                ) : (
                  filteredQuotes.map((quote) => {
                    const isPrimary = primaryQuoteId === quote.id;
                    const isLinked = selectedQuoteIds.includes(quote.id);
                    const client = deriveClientSnapshotFromQuote(quote);
                    const label = quoteLabel(quote);
                    const total = quoteTotal(quote);
                    return (
                      <div key={quote.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{label}</div>
                            <div className="text-xs text-muted-foreground truncate">{client.naam || 'Onbekende klant'}</div>
                            <div className="text-xs text-muted-foreground mt-1 truncate">{(quote.titel || quote.title || '').toString() || '—'}</div>
                            <div className="text-xs text-muted-foreground mt-1">Totaal: {formatCurrency(total)}</div>
                          </div>
                          <div className="shrink-0 flex flex-col gap-2 items-end">
                            <Button
                              type="button"
                              variant={isPrimary ? 'success' : 'outline'}
                              className="h-8"
                              onClick={() => setPrimaryQuoteId(quote.id)}
                            >
                              {isPrimary ? 'Hoofd-offerte' : 'Maak hoofd'}
                            </Button>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                disabled={isPrimary}
                                checked={isLinked}
                                onChange={() => handleToggleLinkedQuote(quote.id)}
                              />
                              Extra koppeling
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Klant- en templategegevens</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 text-xs text-muted-foreground">
                {clientLockedByLinkedQuotes
                  ? 'Klant is vergrendeld op basis van de gekoppelde offerte(s).'
                  : 'Geen gekoppelde offertes: je kunt hier handmatig een klant invullen.'}
              </div>
              <div className="space-y-2">
                <Label>Naam</Label>
                <Input
                  value={clientForm.naam}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, naam: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  value={clientForm.email}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefoon</Label>
                <Input
                  value={clientForm.telefoon}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, telefoon: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input
                  value={clientForm.adres}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, adres: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input
                  value={clientForm.postcode}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, postcode: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Plaats</Label>
                <Input
                  value={clientForm.plaats}
                  disabled={clientLockedByLinkedQuotes}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, plaats: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Template preset</Label>
                <Select value={templatePreset} onValueChange={(value) => setTemplatePreset(value as MeerwerkbonTemplatePreset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="uitgebreid">Uitgebreid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Introductietekst</Label>
                <Textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={4} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Voorwaarden</Label>
                <Textarea value={voorwaardenText} onChange={(e) => setVoorwaardenText(e.target.value)} rows={5} />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
