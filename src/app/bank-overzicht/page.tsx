'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownRight, Landmark, Link as LinkIcon, Loader2, RefreshCcw } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { BankTransactionRow } from '@/lib/bank-overzicht';

type BankInstitution = {
  id: string;
  name: string;
  bic?: string | null;
  logo?: string | null;
};

type BankConnection = {
  id: string;
  status: 'pending' | 'linked' | 'connected' | 'error' | 'revoked' | string;
  institution_id: string;
  institution_name: string | null;
  requisition_id?: string;
  last_error?: string | null;
  last_synced_at?: string | null;
  accounts?: unknown;
  created_at?: string;
  updated_at?: string;
};

type ApiListResponse = {
  ok: boolean;
  mode?: 'bank_transactions' | 'project_costs_fallback';
  data?: BankTransactionRow[];
  connection?: BankConnection | null;
  message?: string;
};

type ApiSyncResponse = ApiListResponse & {
  inserted_count?: number;
};

type ApiInstitutionsResponse = {
  ok: boolean;
  data?: BankInstitution[];
  message?: string;
};

type ApiLinkStartResponse = {
  ok: boolean;
  data?: {
    link: string;
    requisition_id: string;
    ref: string;
    connection_id: string;
  };
  message?: string;
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
  return 'Bankfeed';
}

function connectionBadge(connection: BankConnection | null): string {
  if (!connection) return 'Niet gekoppeld';
  if (connection.status === 'connected') return 'Gekoppeld';
  if (connection.status === 'linked') return 'In behandeling';
  if (connection.status === 'pending') return 'Wachten op bank bevestiging';
  if (connection.status === 'error') return 'Fout in koppeling';
  return 'Status onbekend';
}

export default function BankOverzichtPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ApiListResponse['mode']>('bank_transactions');
  const [transactions, setTransactions] = useState<BankTransactionRow[]>([]);
  const [connection, setConnection] = useState<BankConnection | null>(null);
  const [institutions, setInstitutions] = useState<BankInstitution[]>([]);
  const [institutionsInfo, setInstitutionsInfo] = useState<string | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
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
      setConnection(data.connection || null);
      setMode(data.mode || 'bank_transactions');
      if (data.message) setError(data.message);
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

  useEffect(() => {
    const bankLinkState = searchParams.get('bank_link');
    const bankMessage = searchParams.get('bank_message');
    if (!bankLinkState) return;

    if (bankLinkState === 'success') {
      toast({
        title: 'Bank gekoppeld',
        description: bankMessage || 'Je bankrekening is gekoppeld en klaar voor synchronisatie.',
      });
      void loadTransactions();
    } else if (bankLinkState === 'pending') {
      toast({
        title: 'Bankkoppeling in behandeling',
        description: bankMessage || 'De koppeling staat klaar, maar accountgegevens zijn nog niet compleet.',
      });
    } else if (bankLinkState === 'error') {
      toast({
        title: 'Bankkoppeling mislukt',
        description: bankMessage || 'Er ging iets mis tijdens het koppelen.',
        variant: 'destructive',
      });
    }

    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete('bank_link');
    cleaned.searchParams.delete('bank_message');
    window.history.replaceState({}, '', cleaned.toString());
  }, [loadTransactions, searchParams, toast]);

  const loadInstitutions = useCallback(async () => {
    if (!user) return;
    setInstitutionsLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/institutions?country=NL', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ApiInstitutionsResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Kon bankenlijst niet laden.');
      }
      const rows = Array.isArray(data.data) ? data.data : [];
      setInstitutionsInfo(data.message || null);
      setInstitutions(rows);
      if (!selectedInstitutionId && rows.length > 0) {
        setSelectedInstitutionId(rows[0].id);
      }
      if (rows.length === 0) {
        setSelectedInstitutionId('');
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Kon bankenlijst niet laden.';
      toast({
        title: 'Banken laden mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setInstitutionsLoading(false);
    }
  }, [selectedInstitutionId, toast, user]);

  const openConnectDialog = useCallback(() => {
    setConnectDialogOpen(true);
    if (institutions.length === 0 && !institutionsLoading) {
      void loadInstitutions();
    }
  }, [institutions.length, institutionsLoading, loadInstitutions]);

  const handleStartLink = async () => {
    if (!user || !selectedInstitutionId) return;
    setLinking(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const selectedBank = institutions.find((item) => item.id === selectedInstitutionId);
      const response = await fetch('/api/bank/link/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          institution_id: selectedInstitutionId,
          institution_name: selectedBank?.name || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as ApiLinkStartResponse | null;
      if (!response.ok || !data?.ok || !data.data?.link) {
        throw new Error(data?.message || 'Kon bankkoppeling niet starten.');
      }

      window.location.assign(data.data.link);
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : 'Kon bankkoppeling niet starten.';
      setError(message);
      toast({
        title: 'Bankkoppeling mislukt',
        description: message,
        variant: 'destructive',
      });
      setLinking(false);
    }
  };

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
      setConnection(data.connection || connection);
      setMode(data.mode || 'bank_transactions');
      setLastSyncAt(new Date().toISOString());

      toast({
        title: 'Banksync voltooid',
        description:
          data.message
          || 'Nieuwe banktransacties zijn toegevoegd.',
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
                    Koppel je zakelijke bankrekening en synchroniseer uitgaven automatisch.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{sourceBadge(mode)}</Badge>
                  <Badge variant="outline">{connectionBadge(connection)}</Badge>
                  <Button type="button" variant="outline" onClick={openConnectDialog} className="gap-2">
                    <LinkIcon className="h-4 w-4" />
                    {connection ? 'Koppeling wijzigen' : 'Bank koppelen'}
                  </Button>
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
              {connection?.last_error ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Laatste koppelfout: {connection.last_error}
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
                  Geen transacties gevonden. Koppel eerst je bank en klik daarna op <strong>Synchroniseer nu</strong>.
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

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bankrekening koppelen</DialogTitle>
            <DialogDescription>
              Kies je bank. Je wordt daarna doorgestuurd naar de beveiligde bankomgeving om toegang te geven.
            </DialogDescription>
          </DialogHeader>

              <div className="space-y-2">
            <div className="text-sm font-medium">Bank</div>
            <Select
              value={selectedInstitutionId}
              onValueChange={setSelectedInstitutionId}
              disabled={institutionsLoading || linking}
            >
              <SelectTrigger>
                <SelectValue placeholder={institutionsLoading ? 'Banken laden...' : 'Selecteer een bank'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {institutionsInfo ? (
              <div className="text-xs text-muted-foreground">
                {institutionsInfo}
              </div>
            ) : null}
            {!institutionsLoading && institutions.length === 0 && !institutionsInfo ? (
              <div className="text-xs text-muted-foreground">
                Geen banken beschikbaar. Controleer de bankprovider configuratie.
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleStartLink}
              disabled={linking || institutionsLoading || !selectedInstitutionId || institutions.length === 0}
              className="gap-2"
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              {linking ? 'Verbinding starten...' : 'Doorgaan naar bank'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
