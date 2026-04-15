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
import type { BankAccountView, BankConnectionView, BankOverviewSummary, BankTransactionView } from '@/lib/bank-overzicht';

type ApiSyncResponse = {
  ok: boolean;
  newCount?: number;
  accountsSynced?: number;
  error?: string;
};

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 20_000;

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
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        setActiveAccountId((prev) => prev ?? data.data.accounts[0]?.id ?? null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kon bankoverzicht niet laden.';
      setError(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchFromSupabase(false);
    pollTimerRef.current = setInterval(() => void fetchFromSupabase(true), POLL_INTERVAL_MS);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchFromSupabase, user]);

  // Set default active account once accounts load
  useEffect(() => {
    if (accounts.length > 0 && !activeAccountId) {
      setActiveAccountId(accounts[0].id);
    }
  }, [accounts, activeAccountId]);

  const handleSync = async () => {
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
  };

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

          {/* Header card */}
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

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
              )}
              {infoMessage && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{infoMessage}</div>
              )}
            </CardHeader>
          </Card>

          {/* Account tabs */}
          {accounts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nog geen rekeningen gevonden. Klik op 'Synchroniseer nu' om bunq-data op te halen.
              </CardContent>
            </Card>
          ) : (
            <Tabs value={activeAccountId ?? accounts[0]?.id} onValueChange={(id) => { setActiveAccountId(id); setCurrentPage(1); }}>
              <TabsList className="w-full justify-start">
                {accounts.map((account) => (
                  <TabsTrigger key={account.id} value={account.id} className="flex flex-col items-start gap-0.5 px-4 py-2 h-auto">
                    <span className="text-sm font-medium">{account.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {account.latestBalanceAmount == null ? '-' : formatCurrency(account.latestBalanceAmount)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

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
          )}
        </div>
      </main>
    </div>
  );
}
