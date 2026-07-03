'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { Calculator, FileText, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';
import { cn } from '@/lib/utils';

type QuoteRow = {
  id: string;
  userId?: string;
  offerteNummer?: number;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  amount?: number;
  totaalbedrag?: number;
  titel?: string;
  title?: string;
  werkomschrijving?: string;
  archived?: boolean;
  isCalculationTest?: boolean;
  sourceQuoteId?: string;
  sourceQuoteNumber?: number;
  klantinformatie?: {
    bedrijfsnaam?: string;
    voornaam?: string;
    achternaam?: string;
    plaats?: string;
  };
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  return null;
}

function getClientName(quote: QuoteRow): string {
  const info = quote.klantinformatie;
  const company = String(info?.bedrijfsnaam || '').trim();
  if (company) return company;
  const name = `${info?.voornaam || ''} ${info?.achternaam || ''}`.trim();
  return name || 'Onbekende klant';
}

function getTitle(quote: QuoteRow): string {
  return quote.titel || quote.title || quote.werkomschrijving || 'Geen titel';
}

function formatCurrency(value: unknown): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function buildTestQuotePayload(sourceData: Record<string, unknown>, sourceQuoteId: string): Record<string, unknown> {
  const payload = { ...sourceData };

  delete payload.archived;
  delete payload.archivedAt;
  delete payload.archivedBy;
  delete payload.sentAt;
  delete payload.acceptedAt;
  delete payload.rejectedAt;
  delete payload.clientPortalToken;
  delete payload.publicToken;

  return {
    ...payload,
    status: 'concept',
    isCalculationTest: true,
    sourceQuoteId,
    sourceQuoteNumber: typeof sourceData.offerteNummer === 'number' ? sourceData.offerteNummer : null,
    calculationTestCreatedAt: serverTimestamp(),
    calculationTestUpdatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export default function CalculationTestPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [testQuotes, setTestQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    setLoading(true);
    setError(null);

    const quotesQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(
      quotesQuery,
      (snapshot) => {
        const normalRows: QuoteRow[] = [];
        const testRows: QuoteRow[] = [];

        snapshot.docs.forEach((docSnap) => {
          const row = { id: docSnap.id, ...(docSnap.data() as Omit<QuoteRow, 'id'>) };
          if (row.isCalculationTest === true) {
            testRows.push(row);
          } else {
            normalRows.push(row);
          }
        });

        const sortByNewest = (a: QuoteRow, b: QuoteRow) => {
          const aTime = toDate(a.updatedAt)?.getTime() ?? toDate(a.createdAt)?.getTime() ?? 0;
          const bTime = toDate(b.updatedAt)?.getTime() ?? toDate(b.createdAt)?.getTime() ?? 0;
          return bTime - aTime;
        };

        normalRows.sort(sortByNewest);
        testRows.sort(sortByNewest);
        setQuotes(normalRows);
        setTestQuotes(testRows);
        setLoading(false);
      },
      (err) => {
        console.error('Kon calculation test offertes niet laden:', err);
        setError('Kon offertes niet laden.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [firestore, user]);

  const latestTestBySourceId = useMemo(() => {
    const map = new Map<string, QuoteRow>();
    testQuotes.forEach((testQuote) => {
      if (!testQuote.sourceQuoteId) return;
      if (!map.has(testQuote.sourceQuoteId)) {
        map.set(testQuote.sourceQuoteId, testQuote);
      }
    });
    return map;
  }, [testQuotes]);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes
      .filter((quote) => !quote.archived)
      .filter((quote) => {
        if (!term) return true;
        const fields = [
          getClientName(quote),
          getTitle(quote),
          quote.offerteNummer ? String(quote.offerteNummer) : '',
          quote.klantinformatie?.plaats || '',
        ].join(' ').toLowerCase();
        return fields.includes(term);
      });
  }, [quotes, search]);

  async function copySubcollection(sourceQuoteId: string, targetQuoteId: string, subcollectionName: string): Promise<void> {
    if (!firestore) return;
    const sourceSnapshot = await getDocs(collection(firestore, 'quotes', sourceQuoteId, subcollectionName));
    if (sourceSnapshot.empty) return;

    for (let index = 0; index < sourceSnapshot.docs.length; index += 400) {
      const batch = writeBatch(firestore);
      sourceSnapshot.docs.slice(index, index + 400).forEach((sourceDoc) => {
        const targetRef = doc(firestore, 'quotes', targetQuoteId, subcollectionName, sourceDoc.id);
        batch.set(targetRef, {
          ...sourceDoc.data(),
          quoteId: targetQuoteId,
          sourceQuoteId,
          copiedForCalculationTest: true,
          copiedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  }

  async function createTestCopy(sourceQuote: QuoteRow): Promise<string> {
    if (!firestore || !user) throw new Error('Geen actieve sessie.');

    const sourceRef = doc(firestore, 'quotes', sourceQuote.id);
    const sourceSnap = await getDoc(sourceRef);
    if (!sourceSnap.exists()) throw new Error('Originele offerte bestaat niet meer.');

    const sourceData = sourceSnap.data() as Record<string, unknown>;
    if (sourceData.userId !== user.uid) throw new Error('Deze offerte hoort niet bij deze gebruiker.');
    if (sourceData.isCalculationTest === true) throw new Error('Dit is al een calculation test.');

    const targetRef = doc(collection(firestore, 'quotes'));
    const batch = writeBatch(firestore);
    batch.set(targetRef, buildTestQuotePayload(sourceData, sourceQuote.id));
    await batch.commit();

    await copySubcollection(sourceQuote.id, targetRef.id, 'quote_notes');
    await copySubcollection(sourceQuote.id, targetRef.id, 'jobs');

    return targetRef.id;
  }

  async function openCalculationTest(sourceQuote: QuoteRow): Promise<void> {
    if (activeQuoteId) return;
    setActiveQuoteId(sourceQuote.id);
    setError(null);

    try {
      const existingTest = latestTestBySourceId.get(sourceQuote.id);
      const testQuoteId = existingTest?.id || await createTestCopy(sourceQuote);
      router.push(`/offertes/${testQuoteId}/overzicht`);
    } catch (err) {
      console.error('Kon calculation test niet openen:', err);
      setError(err instanceof Error ? err.message : 'Kon calculation test niet openen.');
      setActiveQuoteId(null);
    }
  }

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNavigation />
        <div className="app-shell flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="calculation test" />

      <main className="app-shell px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="flex items-center gap-2 text-xl font-semibold">
                    <Calculator className="h-5 w-5 text-fuchsia-400" />
                    calculation test
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Maakt een losse testkopie. De originele offerte wordt alleen gelezen.
                  </p>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Zoek offerte..."
                    className="pl-9"
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-2.5">
            {filteredQuotes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Geen offertes gevonden.
                </CardContent>
              </Card>
            ) : (
              filteredQuotes.map((quote) => {
                const testQuote = latestTestBySourceId.get(quote.id);
                const date = toDate(quote.updatedAt) || toDate(quote.createdAt);
                const isOpening = activeQuoteId === quote.id;
                const total = quote.totaalbedrag ?? quote.amount ?? 0;

                return (
                  <div
                    key={quote.id}
                    className={cn(
                      'flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                      testQuote && 'border-fuchsia-500/25',
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold">{getClientName(quote)}</div>
                        {testQuote ? (
                          <span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">
                            test bestaat
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Offerte #{quote.offerteNummer || '-'}</span>
                        <span>·</span>
                        <span>{date ? format(date, 'd MMM yyyy', { locale: nl }) : '-'}</span>
                        <span>·</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{getTitle(quote)}</div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => void openCalculationTest(quote)}
                      disabled={isOpening}
                      className="w-full shrink-0 gap-2 bg-emerald-500 text-white hover:bg-emerald-400 sm:w-auto"
                    >
                      {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {testQuote ? 'Open test' : 'Maak test'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
