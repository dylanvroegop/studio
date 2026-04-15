'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Landmark, Loader2, RefreshCcw } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { BankAccountView, BankConnectionView, BankOverviewSummary, BankTransactionView } from '@/lib/bank-overzicht';

type ApiOverviewResponse = {
  ok: boolean;
  data?: {
    connection: BankConnectionView | null;
    summary: BankOverviewSummary;
    accounts: BankAccountView[];
    transactions: BankTransactionView[];
  };
  message?: string;
};

type ApiSyncResponse = {
  ok: boolean;
  newCount?: number;
  accountsSynced?: number;
  profile?: 'personal' | 'business';
  error?: string;
};

const PAGE_SIZE = 10;
type BankProfile = 'personal' | 'business';

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
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
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
  const [activeProfile, setActiveProfile] = useState<BankProfile>('personal');
  const [summary, setSummary] = useState<BankOverviewSummary>({
    incomeThisMonth: 0,
    expensesThisMonth: 0,
  });
  const [accounts, setAccounts] = useState<BankAccountView[]>([]);
  const [transactions, setTransactions] = useState<BankTransactionView[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const loadOverview = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/bank/overview?profile=${activeProfile}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ApiOverviewResponse | null;
      if (!response.ok || !data?.ok || !data.data) {
        throw new Error(data?.message || 'Kon bankoverzicht niet laden.');
      }
      setConnection(data.data.connection);
      setSummary(data.data.summary);
      setAccounts(data.data.accounts);
      setTransactions(data.data.transactions);
      setCurrentPage(1);
    } catch (overviewError) {
      const message = overviewError instanceof Error ? overviewError.message : 'Kon bankoverzicht niet laden.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, user]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/sync-bunq', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile: activeProfile }),
      });
      const data = (await response.json().catch(() => null)) as ApiSyncResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Synchronisatie mislukt.');
      }
      setInfoMessage(`${data.newCount ?? 0} nieuwe transacties gesynchroniseerd (${activeProfile}).`);
      toast({
        title: 'Synchronisatie voltooid',
        description: `${data.newCount ?? 0} nieuwe transacties, ${data.accountsSynced ?? 0} rekeningen verwerkt (${activeProfile}).`,
      });
      await loadOverview();
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Synchronisatie mislukt.';
      setError(message);
      toast({
        title: 'Synchronisatie mislukt',
        description: 'Er ging iets mis tijdens het ophalen van bunq-transacties.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [currentPage, transactions]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));

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
          <Tabs value={activeProfile} onValueChange={(value) => setActiveProfile(value as BankProfile)}>
            <TabsList>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="business">Business</TabsTrigger>
            </TabsList>
          </Tabs>
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Landmark className="h-5 w-5 text-lime-400" />
                    Banktransacties
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    bunq synchronisatie voor je interne dashboard.
                  </div>
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
                  <div className="mt-1 text-sm font-medium">
                    {connection ? (activeProfile === 'business' ? 'bunq business' : 'bunq personal') : 'Niet gekoppeld'}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Laatste synchronisatie</div>
                  <div className="mt-1 text-sm font-medium">{formatDate(connection?.lastSyncedAt)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Gekoppelde rekeningen</div>
                  <div className="mt-1 text-2xl font-semibold">{accounts.length}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Saldo uitgaven deze maand</div>
                  <div className="mt-1 text-lg font-semibold text-rose-300">{formatCurrency(summary.expensesThisMonth)}</div>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Inkomsten deze maand</div>
                <div className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(summary.incomeThisMonth)}</div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
              {infoMessage ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {infoMessage}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gekoppelde rekeningen</CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                  Nog geen rekeningen gevonden. Klik op ‘Synchroniseer nu’ om bunq-data op te halen.
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div key={account.id} className="grid gap-2 rounded-xl border border-border/70 bg-card/55 p-4 md:grid-cols-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Naam</div>
                        <div className="text-sm font-medium">{account.name}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">IBAN</div>
                        <div className="text-sm font-medium">{account.ibanMasked}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Valuta</div>
                        <div className="text-sm font-medium">{account.currency || 'EUR'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Laatste saldo</div>
                        <div className="text-sm font-medium">
                          {account.latestBalanceAmount == null
                            ? '-'
                            : formatCurrency(account.latestBalanceAmount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transacties</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                  Geen transacties gevonden.
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-border/70">
                    <div className="grid grid-cols-[110px_1.2fr_1fr_140px_120px_1fr_120px] gap-3 border-b border-border/70 bg-card/70 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <div>Datum</div>
                      <div>Omschrijving</div>
                      <div>Tegenpartij</div>
                      <div className="text-right">Bedrag</div>
                      <div>Type</div>
                      <div>Rekening</div>
                      <div>Status</div>
                    </div>
                    <div className="divide-y divide-border/70 bg-background/40">
                      {paginatedTransactions.map((tx) => (
                        <div key={tx.id} className="grid grid-cols-[110px_1.2fr_1fr_140px_120px_1fr_120px] items-center gap-3 px-4 py-3 text-sm">
                          <div>{formatDate(tx.bookingDate)}</div>
                          <div className="truncate font-medium">{tx.description}</div>
                          <div className="truncate text-muted-foreground">{tx.counterpartyName || '-'}</div>
                          <div className={`text-right font-medium ${tx.amount < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                            {formatCurrency(tx.amount)}
                          </div>
                          <div>
                            <Badge variant="outline" className="text-[10px]">
                              {tx.direction === 'outgoing' ? (
                                <span className="inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />Uitgaand</span>
                              ) : (
                                <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Inkomend</span>
                              )}
                            </Badge>
                          </div>
                          <div className="truncate text-muted-foreground">{tx.accountName}</div>
                          <div className="truncate text-muted-foreground">{tx.status || '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Pagina {currentPage} van {totalPages}</div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      >
                        Vorige
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      >
                        Volgende
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
