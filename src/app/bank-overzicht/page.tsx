'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Landmark, Loader2, RefreshCcw } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { exportSpendingAnalysisPdf, type SpendingAnalysisReport } from '@/lib/export-spending-analysis-pdf';
import type { BankAccountView, BankConnectionView, BankOverviewSummary, BankTransactionView } from '@/lib/bank-overzicht';

type ApiSyncResponse = {
  ok: boolean;
  newCount?: number;
  accountsSynced?: number;
  error?: string;
};

type ClarificationAnswer = {
  transactionId: string;
  answer: string;
};

type SpendingAnalysisResponse = {
  ok: boolean;
  message?: string;
  analysis?: SpendingAnalysisReport & {
    unclearTransactions?: Array<{
      transactionId: string;
      question: string;
      guessedCategory: string;
      guessedType: 'business' | 'personal' | 'mixed';
    }>;
  };
};

const PAGE_SIZE = 10;
const OVERVIEW_TAB_ID = 'overview';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

function connectionLabel(connection: BankConnectionView | null): string {
  if (!connection) return 'Niet gesynchroniseerd';
  if (connection.status === 'connected') return 'Gekoppeld';
  if (connection.status === 'pending') return 'In behandeling';
  if (connection.status === 'revoked') return 'Ontkoppeld';
  return 'Onbekend';
}

export default function BankOverzichtPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [connection, setConnection] = useState<BankConnectionView | null>(null);
  const [summary, setSummary] = useState<BankOverviewSummary>({ incomeThisMonth: 0, expensesThisMonth: 0 });
  const [accounts, setAccounts] = useState<BankAccountView[]>([]);
  const [transactions, setTransactions] = useState<BankTransactionView[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(OVERVIEW_TAB_ID);
  const [currentPage, setCurrentPage] = useState(1);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<(SpendingAnalysisReport & {
    unclearTransactions?: Array<{
      transactionId: string;
      question: string;
      guessedCategory: string;
      guessedType: 'business' | 'personal' | 'mixed';
    }>;
  }) | null>(null);
  const [clarificationDraft, setClarificationDraft] = useState<Record<string, string>>({});

  const hasSyncedOnMount = useRef(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const fetchFromSupabase = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/overview?profile=personal', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.data) {
        throw new Error(data?.message || 'Kon bankoverzicht niet laden.');
      }
      setConnection(data.data.connection);
      setSummary(data.data.summary);
      setAccounts(data.data.accounts);
      setTransactions(data.data.transactions);
      if (!silent) {
        setCurrentPage(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kon bankoverzicht niet laden.';
      setError(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  const handleSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/sync-bunq', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: 'personal' }),
      });
      const data = (await response.json().catch(() => null)) as ApiSyncResponse | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Synchronisatie mislukt.');
      setInfoMessage(`${data.newCount ?? 0} nieuwe transacties gesynchroniseerd.`);
      toast({
        title: 'Synchronisatie voltooid',
        description: `${data.newCount ?? 0} nieuwe transacties, ${data.accountsSynced ?? 0} rekeningen verwerkt.`,
      });
      await fetchFromSupabase(false);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Synchronisatie mislukt.';
      setError(message);
      toast({ title: 'Synchronisatie mislukt', description: message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [fetchFromSupabase, toast, user]);

  // Auto-sync once on page visit, then read fresh data from Supabase
  useEffect(() => {
    if (!user || hasSyncedOnMount.current) return;
    hasSyncedOnMount.current = true;
    void handleSync();
  }, [user, handleSync]);

  // Keep selected tab valid when account list changes.
  useEffect(() => {
    if (activeTabId === OVERVIEW_TAB_ID) return;
    if (!accounts.some((account) => account.id === activeTabId)) {
      setActiveTabId(OVERVIEW_TAB_ID);
      setCurrentPage(1);
    }
  }, [accounts, activeTabId]);

  const activeAccountId = activeTabId === OVERVIEW_TAB_ID ? null : activeTabId;
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;

  const accountTransactions = useMemo(
    () => transactions.filter((tx) => tx.accountName === activeAccount?.name),
    [transactions, activeAccount]
  );

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return accountTransactions.slice(start, start + PAGE_SIZE);
  }, [currentPage, accountTransactions]);

  const totalPages = Math.max(1, Math.ceil(accountTransactions.length / PAGE_SIZE));

  const totalBalance = accounts.reduce((sum, a) => sum + (a.latestBalanceAmount ?? 0), 0);
  const runSpendingAnalysis = useCallback(async (answers: ClarificationAnswer[] = []) => {
    if (!user) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/spending-analysis', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ period: 'this_month', profile: 'personal', answers }),
      });
      const data = (await response.json().catch(() => null)) as SpendingAnalysisResponse | null;
      if (!response.ok || !data?.ok || !data.analysis) {
        throw new Error(data?.message || 'Analyse kon niet worden uitgevoerd.');
      }
      setAnalysisReport(data.analysis);
      const nextDraft: Record<string, string> = {};
      (data.analysis.unclearTransactions || []).forEach((item) => {
        nextDraft[item.transactionId] = '';
      });
      setClarificationDraft(nextDraft);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analyse kon niet worden uitgevoerd.';
      setAnalysisError(message);
      toast({ title: 'Analyse mislukt', description: message, variant: 'destructive' });
    } finally {
      setAnalysisLoading(false);
    }
  }, [toast, user]);

  const handleClarificationSubmit = useCallback(async () => {
    const answers: ClarificationAnswer[] = Object.entries(clarificationDraft)
      .map(([transactionId, answer]) => ({ transactionId, answer: answer.trim() }))
      .filter((item) => item.answer.length > 0);
    if (answers.length === 0) {
      setAnalysisError('Vul minimaal 1 antwoord in voor een onzekere transactie.');
      return;
    }
    await runSpendingAnalysis(answers);
  }, [clarificationDraft, runSpendingAnalysis]);

  const handleDownloadSpendingPdf = useCallback(async () => {
    if (!analysisReport) return;
    await exportSpendingAnalysisPdf(`Uitgavenanalyse-${new Date().toISOString().slice(0, 10)}.pdf`, analysisReport);
  }, [analysisReport]);

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Bank Overzicht" />

      <main className="flex flex-col items-center p-4 pb-24 md:px-6 md:pb-10 md:pt-6">
        <div className="w-full max-w-6xl space-y-5">
          <Tabs
            value={activeTabId}
            onValueChange={(id) => {
              setActiveTabId(id);
              setCurrentPage(1);
            }}
          >
            <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl border border-border/60 bg-card/70 p-2">
              <TabsTrigger
                value={OVERVIEW_TAB_ID}
                className="h-auto min-w-[180px] rounded-xl px-5 py-3 text-left data-[state=active]:bg-background/80"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="text-base font-semibold">Overzicht</span>
                  <span className="text-xs text-muted-foreground">Sync, status en totalen</span>
                </div>
              </TabsTrigger>
              {accounts.map((account) => (
                <TabsTrigger
                  key={account.id}
                  value={account.id}
                  className="h-auto min-w-[160px] rounded-xl px-5 py-3 text-left data-[state=active]:bg-background/80"
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-base font-semibold">{account.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {account.latestBalanceAmount == null ? '-' : formatCurrency(account.latestBalanceAmount)}
                    </span>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={OVERVIEW_TAB_ID} className="mt-4 space-y-4">
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Landmark className="h-5 w-5 text-lime-400" />
                        Banktransacties
                      </CardTitle>
                      <div className="text-sm text-muted-foreground">bunq synchronisatie voor je interne dashboard.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{connectionLabel(connection)}</Badge>
                      <Button type="button" onClick={handleSync} disabled={syncing} className="gap-2">
                        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        {syncing ? 'Synchroniseren...' : 'Synchroniseer nu'}
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={() => void runSpendingAnalysis()} disabled={analysisLoading}>
                        {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {analysisLoading ? 'Analyse draait...' : 'AI analyse op uitgaven (alle rekeningen)'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Bank</div>
                      <div className="mt-1 text-sm font-medium">bunq personal</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Laatste synchronisatie</div>
                      <div className="mt-1 text-sm font-medium">{formatDate(connection?.lastSyncedAt)}</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Totaal saldo</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(totalBalance)}</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Uitgaven deze maand</div>
                      <div className="mt-1 text-lg font-semibold text-rose-300">{formatCurrency(summary.expensesThisMonth)}</div>
                    </div>
                  </div>

                  {accounts.length === 0 && (
                    <div className="rounded-lg border border-border/70 bg-card/55 p-3 text-sm text-muted-foreground">
                      Nog geen rekeningen gevonden. Klik op 'Synchroniseer nu' om bunq-data op te halen.
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
                  )}
                  {infoMessage && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{infoMessage}</div>
                  )}
                  {analysisError && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{analysisError}</div>
                  )}
                </CardHeader>
                {analysisReport && (
                  <CardContent className="space-y-4 pt-0">
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">Uitgavenanalyse</h3>
                        <Button type="button" variant="secondary" onClick={() => void handleDownloadSpendingPdf()}>
                          Open/download PDF
                        </Button>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">{analysisReport.periodSummary.shortConclusion}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                          <div className="text-xs text-muted-foreground">Totale uitgaven</div>
                          <div className="mt-1 text-lg font-semibold text-rose-300">{formatCurrency(analysisReport.periodSummary.totalOutgoing)}</div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                          <div className="text-xs text-muted-foreground">Business</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(analysisReport.businessPersonalSummary.businessAmount)}</div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                          <div className="text-xs text-muted-foreground">Personal</div>
                          <div className="mt-1 text-lg font-semibold text-amber-300">{formatCurrency(analysisReport.businessPersonalSummary.personalAmount)}</div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {analysisReport.categoryBreakdown.slice(0, 8).map((item) => (
                          <div key={item.category} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{item.category}</div>
                              <div className="text-rose-300">{formatCurrency(item.totalAmount)}</div>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{item.explanation}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(analysisReport.unclearTransactions || []).length > 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <h4 className="text-sm font-semibold">Nog onduidelijk: beantwoord deze vragen</h4>
                        <div className="mt-3 space-y-3">
                          {(analysisReport.unclearTransactions || []).map((item) => (
                            <div key={item.transactionId} className="rounded-lg border border-border/60 bg-background/40 p-3">
                              <div className="text-sm">{item.question}</div>
                              <input
                                value={clarificationDraft[item.transactionId] || ''}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setClarificationDraft((prev) => ({ ...prev, [item.transactionId]: next }));
                                }}
                                placeholder="Typ hier je uitleg over deze transactie..."
                                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <Button type="button" onClick={() => void handleClarificationSubmit()} disabled={analysisLoading} className="gap-2">
                            {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Heranalyseer met mijn antwoorden
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                        <div className="text-sm font-semibold">Wat was waarschijnlijk nodig?</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {analysisReport.neededVsAvoidable.likelyNeeded.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                        <div className="text-sm font-semibold">Wat had je mogelijk niet hoeven uitgeven?</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {analysisReport.neededVsAvoidable.possiblyAvoidable.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {accounts.map((account) => (
              <TabsContent key={account.id} value={account.id} className="mt-4 space-y-4">
                {/* Account detail card */}
                <Card>
                  <CardContent className="grid gap-4 p-6 md:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Rekening</div>
                      <div className="mt-1 text-sm font-medium">{account.name}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">IBAN</div>
                      <div className="mt-1 text-sm font-medium">{account.ibanMasked}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Valuta</div>
                      <div className="mt-1 text-sm font-medium">{account.currency || 'EUR'}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Saldo</div>
                      <div className="mt-1 text-2xl font-semibold text-emerald-300">
                        {account.latestBalanceAmount == null ? '-' : formatCurrency(account.latestBalanceAmount)}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Transactions for this account */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Transacties</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {accountTransactions.length === 0 ? (
                      <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                        Geen transacties gevonden voor deze rekening.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-hidden rounded-xl border border-border/70">
                          <div className="grid grid-cols-[110px_1.5fr_1fr_140px_120px_120px] gap-3 border-b border-border/70 bg-card/70 px-4 py-2 text-xs font-medium text-muted-foreground">
                            <div>Datum</div>
                            <div>Omschrijving</div>
                            <div>Tegenpartij</div>
                            <div className="text-right">Bedrag</div>
                            <div>Type</div>
                            <div>Status</div>
                          </div>
                          <div className="divide-y divide-border/70 bg-background/40">
                            {paginatedTransactions.map((tx) => (
                              <div key={tx.id} className="grid grid-cols-[110px_1.5fr_1fr_140px_120px_120px] items-center gap-3 px-4 py-3 text-sm">
                                <div>{formatDate(tx.bookingDate)}</div>
                                <div className="truncate font-medium">{tx.description}</div>
                                <div className="truncate text-muted-foreground">{tx.counterpartyName || '-'}</div>
                                <div className={`text-right font-medium ${tx.amount < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                  {formatCurrency(tx.amount)}
                                </div>
                                <div>
                                  <Badge variant="outline" className="text-[10px]">
                                    {tx.direction === 'outgoing'
                                      ? <span className="inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />Uitgaand</span>
                                      : <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Inkomend</span>}
                                  </Badge>
                                </div>
                                <div className="truncate text-muted-foreground">{tx.status || '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">Pagina {currentPage} van {totalPages}</div>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1}
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                              Vorige
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages}
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                              Volgende
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
