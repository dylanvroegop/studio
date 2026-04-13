'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, Landmark, Loader2, RefreshCcw } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { BankTransactionRow } from '@/lib/bank-overzicht';

type ApiListResponse = {
  ok: boolean;
  mode?: 'bank_transactions' | 'project_costs_fallback';
  data?: BankTransactionRow[];
  message?: string;
};

type ApiSyncResponse = ApiListResponse & {
  inserted_count?: number;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: string): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function sourceBadge(mode: ApiListResponse['mode']) {
  if (mode === 'bank_transactions') return 'Live bankfeed';
  return 'Testmodus (kosten fallback)';
}

export default function BankOverzichtPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ApiListResponse['mode']>('project_costs_fallback');
  const [transactions, setTransactions] = useState<BankTransactionRow[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setError(null);
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/transactions/list', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = (await response.json().catch(() => null)) as ApiListResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Kon banktransacties niet laden.');
      }

      setTransactions(Array.isArray(data.data) ? data.data : []);
      setMode(data.mode || 'project_costs_fallback');
      setLastSyncAt(new Date().toISOString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Kon banktransacties niet laden.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = (await response.json().catch(() => null)) as ApiSyncResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Kon banksync niet uitvoeren.');
      }

      setTransactions(Array.isArray(data.data) ? data.data : []);
      setMode(data.mode || 'project_costs_fallback');
      setLastSyncAt(new Date().toISOString());

      toast({
        title: 'Banksync voltooid',
        description:
          data.message
          || (data.mode === 'bank_transactions'
            ? 'Nieuwe banktransacties zijn toegevoegd.'
            : 'Testmodus: transacties geladen vanuit kostenfallback.'),
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Kon banksync niet uitvoeren.';
      setError(message);
      toast({
        title: 'Banksync mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const totalDebit = useMemo(
    () => transactions
      .filter((tx) => tx.direction === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  );

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
        <div className="w-full max-w-5xl space-y-5">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Landmark className="h-5 w-5 text-lime-400" />
                    Banktransacties
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Deze testtab toont automatische uitgaande kosten uit je bankstroom.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{sourceBadge(mode)}</Badge>
                  <Button type="button" onClick={handleSync} disabled={syncing} className="gap-2">
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    {syncing ? 'Synchroniseren...' : 'Synchroniseer nu'}
                  </Button>
                </div>
              </div>
              {lastSyncAt ? (
                <div className="text-xs text-muted-foreground">
                  Laatste sync: {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSyncAt))}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Aantal transacties</div>
                  <div className="mt-1 text-2xl font-semibold">{transactions.length}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Totale uitgaven</div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-300">{formatCurrency(totalDebit)}</div>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                  Geen transacties gevonden. Klik op <strong>Synchroniseer nu</strong> om nieuwe testdata op te halen.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <div className="grid grid-cols-[1.1fr_1fr_auto_auto] gap-3 border-b border-border/70 bg-card/70 px-4 py-2 text-xs font-medium text-muted-foreground">
                    <div>Omschrijving</div>
                    <div>Tegenpartij</div>
                    <div>Datum</div>
                    <div className="text-right">Bedrag</div>
                  </div>
                  <div className="divide-y divide-border/70 bg-background/40">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="grid grid-cols-[1.1fr_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{tx.description || 'Transactie'}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {tx.category}
                            </Badge>
                            {tx.linked_cost_id ? (
                              <Badge variant="secondary" className="text-[10px]">Gekoppeld aan kost</Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="truncate text-muted-foreground">{tx.counterparty_name || '-'}</div>
                        <div className="text-muted-foreground">{formatDate(tx.booked_at)}</div>
                        <div className="text-right font-medium text-emerald-300">
                          <span className="inline-flex items-center gap-1">
                            <ArrowDownRight className="h-3.5 w-3.5" />
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
