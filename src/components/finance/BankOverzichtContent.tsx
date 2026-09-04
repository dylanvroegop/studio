'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  Euro,
  Landmark,
  Loader2,
  RefreshCcw,
  Receipt,
  Search,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { exportSpendingAnalysisPdf, type SpendingAnalysisReport } from '@/lib/export-spending-analysis-pdf';
import type { BankAccountView, BankConnectionView, BankOverviewSummary, BankTransactionView } from '@/lib/bank-overzicht';
import type { BouwmaatReconciliationResult } from '@/lib/bouwmaat-reconciliation';
import {
  PROJECT_COST_CATEGORY_LABELS,
  normalizeProjectCostCategory,
  type ProjectCostCategory,
  type ProjectCostRow,
} from '@/lib/project-costs';
import type { WinstMetricsResponse } from '@/lib/winst-types';
import { formatOfferteNummerLabel } from '@/lib/quote-number';

type ApiSyncResponse = {
  ok: boolean;
  newCount?: number;
  accountsSynced?: number;
  error?: string;
};

type KnabSyncResult = ApiSyncResponse & {
  hasConnection: boolean;
};

type BankInstitution = {
  id: string;
  name: string;
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

type CostTimeline = 'month' | 'since-bank-start';

type TransactionPageSize = 10 | 20 | 40 | 'all';

type FinanceActualsPeriod = {
  timeline: CostTimeline;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  transactionCount: number;
  incomingCount: number;
  outgoingCount: number;
  businessExpenseCount: number;
  privateExpenseCount: number;
  incomingTotal: number;
  externalIncomingTotal: number;
  operatingIncomingTotal: number;
  nonOperatingIncomingTotal: number;
  outgoingTotal: number;
  businessExpenses: number;
  privateExpenses: number;
  cashProfit: number;
  categoryTotals: Array<{ category: ProjectCostCategory; label: string; amount: number }>;
  matchedBankCount: number;
  unmatchedBankCount: number;
  unmatchedBankAmount: number;
  matchedSourceCount: number;
  unmatchedSourceCount: number;
  unmatchedSourceAmount: number;
  unmatchedBankTransactions: Array<{
    id: string;
    date: string | null;
    name: string;
    description: string;
    amount: number;
    category: ProjectCostCategory;
    categoryLabel: string;
    status: string;
    sourceCostIds: string[];
    sourceAmount: number;
    sourceDelta: number;
    notes: string | null;
  }>;
  unmatchedSourceCosts: Array<{ id: string; date: string; name: string; amount: number; category: ProjectCostCategory; categoryLabel: string }>;
  privateTransactions: Array<{
    id: string;
    date: string | null;
    name: string;
    description: string;
    amount: number;
    category: ProjectCostCategory;
    categoryLabel: string;
    status: string;
    sourceCostIds: string[];
    sourceAmount: number;
    sourceDelta: number;
    notes: string | null;
  }>;
  reconciliationNote: string;
};

type FinanceActualsResponse = {
  selected: FinanceActualsPeriod;
  periods: { month: FinanceActualsPeriod; sinceBankStart: FinanceActualsPeriod };
};

const OVERVIEW_TAB_ID = 'overview';
const COSTS_TAB_ID = 'costs';
const INVOICES_TAB_ID = 'invoices';
const QUOTES_TAB_ID = 'quotes';
const PROJECTS_TAB_ID = 'projects';
const BANK_TAB_ID = 'bank';
const ANALYSIS_TAB_ID = 'analysis';
const BOUWMAAT_TAB_ID = 'bouwmaat';
const BUNQ_TAB_ID = 'bunq-personal';

let metricsRequestCache: {
  userId: string;
  startedAt: number;
  promise: Promise<WinstMetricsResponse>;
} | null = null;

let knabSyncRequestCache: {
  userId: string;
  startedAt: number;
  promise: Promise<KnabSyncResult>;
} | null = null;

const KNAB_SYNC_DEDUPLICATION_MS = 10_000;

function requestKnabSync(userId: string, token: string, force = false): Promise<KnabSyncResult> {
  const now = Date.now();
  if (
    !force
    && knabSyncRequestCache
    && knabSyncRequestCache.userId === userId
    && now - knabSyncRequestCache.startedAt < KNAB_SYNC_DEDUPLICATION_MS
  ) {
    return knabSyncRequestCache.promise;
  }

  const promise = fetch('/api/bank/sync-enablebanking', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  }).then(async (response) => {
    const payload = await response.json().catch(() => null) as ApiSyncResponse | null;
    if (response.status === 400 && payload?.error === 'Koppel eerst je Knab-rekening.') {
      return { ...payload, ok: false, hasConnection: false };
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Synchroniseren met Knab is mislukt.');
    }
    return { ...payload, hasConnection: true };
  });

  knabSyncRequestCache = { userId, startedAt: now, promise };
  return promise;
}

function requestFinanceMetrics(userId: string, token: string): Promise<WinstMetricsResponse> {
  const now = Date.now();
  if (metricsRequestCache && metricsRequestCache.userId === userId && now - metricsRequestCache.startedAt < 30_000) {
    return metricsRequestCache.promise;
  }

  const promise = fetch('/api/winst/metrics', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ periodType: 'month', periodRange: 24, jobTypes: [], clientIds: [], projectIds: [] }),
    cache: 'no-store',
  }).then(async (response) => {
    const payload = await response.json().catch(() => null) as { ok?: boolean; data?: WinstMetricsResponse; message?: string } | null;
    if (!response.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.message || 'Financiële cijfers konden niet worden geladen.');
    }
    return payload.data;
  });

  metricsRequestCache = { userId, startedAt: now, promise };
  return promise;
}

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

interface BankOverzichtContentProps {
  embedded?: boolean;
  requestedTabId?: string;
}

export function BankOverzichtContent({ embedded = false, requestedTabId }: BankOverzichtContentProps) {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bankRefreshPending, setBankRefreshPending] = useState(true);
  const [bankRefreshError, setBankRefreshError] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<'bunq' | 'enablebanking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [knabConnection, setKnabConnection] = useState<BankConnectionView | null>(null);
  const [bunqConnection, setBunqConnection] = useState<BankConnectionView | null>(null);
  const [summary, setSummary] = useState<BankOverviewSummary>({ incomeThisMonth: 0, expensesThisMonth: 0, privateWithdrawalsThisMonth: 0, privateWithdrawalsTotal: 0, firstTransactionDate: null });
  const [accounts, setAccounts] = useState<BankAccountView[]>([]);
  const [transactions, setTransactions] = useState<BankTransactionView[]>([]);
  const [costs] = useState<ProjectCostRow[]>([]);
  const [financeMetrics, setFinanceMetrics] = useState<WinstMetricsResponse | null>(null);
  const [bouwmaat, setBouwmaat] = useState<BouwmaatReconciliationResult | null>(null);
  const [financeActuals, setFinanceActuals] = useState<FinanceActualsResponse | null>(null);
  const [financeDataLoading, setFinanceDataLoading] = useState(true);
  const [financeDataError, setFinanceDataError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>(OVERVIEW_TAB_ID);
  const [activeBunqAccountId, setActiveBunqAccountId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionPageSize, setTransactionPageSize] = useState<TransactionPageSize>(10);
  const [statementPeriod, setStatementPeriod] = useState('all');
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
  const [knabInstitution, setKnabInstitution] = useState<BankInstitution | null>(null);
  const [connectingKnab, setConnectingKnab] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [costTimeline, setCostTimeline] = useState<CostTimeline>('month');
  const bankRefreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const fetchFromSupabase = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const requestOverview = async (provider: 'bunq' | 'enablebanking') => {
        const response = await fetch(`/api/bank/overview?provider=${provider}&profile=personal`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data.data) throw new Error(data?.message || `Kon ${provider === 'bunq' ? 'bunq' : 'Knab'} niet laden.`);
        return data.data as { connection: BankConnectionView | null; summary: BankOverviewSummary; accounts: BankAccountView[]; transactions: BankTransactionView[] };
      };
      const [knab, bunq] = await Promise.all([requestOverview('enablebanking'), requestOverview('bunq')]);
      const combinedAccounts = [...knab.accounts, ...bunq.accounts];
      const combinedTransactions = [...knab.transactions, ...bunq.transactions].sort((left, right) => right.bookingDate.localeCompare(left.bookingDate));
      const firstDates = [knab.summary.firstTransactionDate, bunq.summary.firstTransactionDate].filter((date): date is string => Boolean(date)).sort();
      setKnabConnection(knab.connection);
      setBunqConnection(bunq.connection);
      setSummary({
        incomeThisMonth: knab.summary.incomeThisMonth + bunq.summary.incomeThisMonth,
        expensesThisMonth: knab.summary.expensesThisMonth + bunq.summary.expensesThisMonth,
        privateWithdrawalsThisMonth: knab.summary.privateWithdrawalsThisMonth + bunq.summary.privateWithdrawalsThisMonth,
        privateWithdrawalsTotal: knab.summary.privateWithdrawalsTotal + bunq.summary.privateWithdrawalsTotal,
        firstTransactionDate: firstDates[0] || null,
      });
      setAccounts(combinedAccounts);
      setTransactions(combinedTransactions);
      if (!silent) {
        setCurrentPage(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kon bankoverzicht niet laden.';
      setError(message);
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  const fetchFinanceData = useCallback(async () => {
    if (!user) return;
    setFinanceDataLoading(true);
    setFinanceDataError(null);
    try {
      const token = await user.getIdToken();
      const actualsResponse = await fetch('/api/financieen/actuals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeline: 'since-bank-start' }),
        cache: 'no-store',
      });
      const actualsPayload = await actualsResponse.json().catch(() => null) as { ok?: boolean; data?: FinanceActualsPeriod; periods?: FinanceActualsResponse['periods']; message?: string } | null;

      if (!actualsResponse.ok || !actualsPayload?.ok || !actualsPayload.data || !actualsPayload.periods) {
        throw new Error(actualsPayload?.message || 'Knab-kasboek kon niet worden geladen.');
      }

      setFinanceActuals({ selected: actualsPayload.data, periods: actualsPayload.periods });

      // Quote/invoice metrics are secondary and may involve expensive
      // Firestore calculations. Load them after the bank figures are visible,
      // and deduplicate React development remounts for a short period.
      void requestFinanceMetrics(user.uid, token)
        .then(setFinanceMetrics)
        .catch((metricsError) => {
          setFinanceDataError(metricsError instanceof Error ? metricsError.message : 'Financiële cijfers konden niet worden geladen.');
        });
    } catch (financeError) {
      const message = financeError instanceof Error ? financeError.message : 'Financiële cijfers konden niet worden geladen.';
      setFinanceDataError(message);
      throw financeError;
    } finally {
      setFinanceDataLoading(false);
    }
  }, [user]);

  const fetchBouwmaatData = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/financieen/bouwmaat', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: BouwmaatReconciliationResult; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message || 'Bouwmaat-reconciliatie kon niet worden geladen.');
      }
      setBouwmaat(payload.data);
    } catch (bouwmaatError) {
      setFinanceDataError(bouwmaatError instanceof Error ? bouwmaatError.message : 'Bouwmaat-reconciliatie kon niet worden geladen.');
    }
  }, [user]);

  const refreshKnabData = useCallback(async (force = false) => {
    if (!user) return;
    if (bankRefreshInFlightRef.current) return bankRefreshInFlightRef.current;

    const refreshPromise = (async () => {
      setBankRefreshPending(true);
      setBankRefreshError(null);
      setError(null);

      try {
        const token = await user.getIdToken();
        await requestKnabSync(user.uid, token, force);
        await Promise.all([
          fetchFromSupabase(false),
          fetchFinanceData(),
        ]);
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : 'Knab kon niet worden bijgewerkt.';
        setBankRefreshError(message);
        setLoading(false);
        setFinanceDataLoading(false);
      } finally {
        setBankRefreshPending(false);
      }
    })();

    bankRefreshInFlightRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      bankRefreshInFlightRef.current = null;
    }
  }, [fetchFinanceData, fetchFromSupabase, user]);

  useEffect(() => {
    if (!user) return;
    void refreshKnabData(false);
  }, [refreshKnabData, user]);

  useEffect(() => {
    if (activeTabId !== BOUWMAAT_TAB_ID || bouwmaat) return;
    void fetchBouwmaatData();
  }, [activeTabId, bouwmaat, fetchBouwmaatData]);

  useEffect(() => {
    if (!user) return;

    const refreshVisibleData = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshKnabData(false);
    };

    const handleVisibilityChange = () => refreshVisibleData();
    window.addEventListener('focus', refreshVisibleData);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const refreshInterval = window.setInterval(refreshVisibleData, 5 * 60_000);

    return () => {
      window.removeEventListener('focus', refreshVisibleData);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(refreshInterval);
    };
  }, [refreshKnabData, user]);

  const handleSync = useCallback(async (provider: 'bunq' | 'enablebanking') => {
    if (!user) return;
    setSyncingProvider(provider);
    setError(null);
    try {
      const token = await user.getIdToken();
      let data: ApiSyncResponse;
      if (provider === 'enablebanking') {
        data = await requestKnabSync(user.uid, token, true);
      } else {
        const response = await fetch('/api/bank/sync-bunq', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: 'personal' }),
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as ApiSyncResponse | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Synchronisatie mislukt.');
        data = payload;
      }
      if (!data.ok) throw new Error(data.error || 'Synchronisatie mislukt.');
      const bankName = provider === 'bunq' ? 'bunq personal' : 'Knab zakelijk';
      setInfoMessage(`${bankName}: ${data.newCount ?? 0} nieuwe transacties gesynchroniseerd.`);
      toast({
        title: 'Synchronisatie voltooid',
        description: `${bankName}: ${data.newCount ?? 0} nieuwe transacties, ${data.accountsSynced ?? 0} rekeningen verwerkt.`,
      });
      await Promise.all([fetchFromSupabase(false), fetchFinanceData()]);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Synchronisatie mislukt.';
      setError(message);
      toast({ title: 'Synchronisatie mislukt', description: message, variant: 'destructive' });
    } finally {
      setSyncingProvider(null);
    }
  }, [fetchFinanceData, fetchFromSupabase, toast, user]);

  const handleConnectKnab = useCallback(async () => {
    if (!user || !knabInstitution) return;
    setConnectingKnab(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bank/enablebanking/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId: knabInstitution.id }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; link?: string; message?: string } | null;
      if (!response.ok || !data?.ok || !data.link) throw new Error(data?.message || 'Knab koppelen is mislukt.');
      window.location.assign(data.link);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Knab koppelen is mislukt.';
      setError(message);
      toast({ title: 'Knab koppelen mislukt', description: message, variant: 'destructive' });
      setConnectingKnab(false);
    }
  }, [knabInstitution, toast, user]);

  useEffect(() => {
    // Institution discovery is only needed for the connect flow. Do not let
    // it compete with the normal dashboard requests for an existing link.
    if (!user || loading || knabConnection) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/bank/enablebanking/institutions?country=nl', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null) as { ok?: boolean; institutions?: BankInstitution[]; message?: string } | null;
        if (!response.ok || !data?.ok) throw new Error(data?.message || 'Enable Banking is nog niet ingesteld.');
        const institution = (data.institutions || []).find((item) => /knab/i.test(item.name));
        setKnabInstitution(institution || null);
        if (!institution) setSetupMessage('Knab staat niet in de Enable Banking Sandbox. Voor echte Knab-transacties is een Production-app nodig; gebruik Mock ASPSP of Rabobank om de sandboxflow te testen.');
      } catch (institutionError) {
        setSetupMessage(institutionError instanceof Error ? institutionError.message : 'Enable Banking is nog niet ingesteld.');
      }
    })();
  }, [knabConnection, loading, user]);

  // Keep selected tab valid when account list changes.
  useEffect(() => {
    if ([OVERVIEW_TAB_ID, COSTS_TAB_ID, INVOICES_TAB_ID, QUOTES_TAB_ID, PROJECTS_TAB_ID, BANK_TAB_ID, ANALYSIS_TAB_ID, BOUWMAAT_TAB_ID, BUNQ_TAB_ID].includes(activeTabId)) return;
    if (!accounts.some((account) => account.id === activeTabId)) {
      setActiveTabId(OVERVIEW_TAB_ID);
      setCurrentPage(1);
    }
  }, [accounts, activeTabId]);

  const bunqAccounts = accounts.filter((account) => account.externalAccountId.startsWith('bunq:'));
  const nonBunqAccounts = accounts.filter((account) => !account.externalAccountId.startsWith('bunq:'));
  const primaryKnabAccountId = nonBunqAccounts[0]?.id || '';

  useEffect(() => {
    if (!requestedTabId) return;
    if (requestedTabId === 'knab-account') {
      if (primaryKnabAccountId) setActiveTabId(primaryKnabAccountId);
      return;
    }
    setActiveTabId(requestedTabId);
  }, [requestedTabId, primaryKnabAccountId]);

  const selectedBunqAccountId = bunqAccounts.some((account) => account.id === activeBunqAccountId) ? activeBunqAccountId : bunqAccounts[0]?.id || '';
  const activeAccountId = activeTabId === BUNQ_TAB_ID
    ? selectedBunqAccountId
    : accounts.some((account) => account.id === activeTabId) ? activeTabId : null;
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;
  const selectedBunqAccount = bunqAccounts.find((account) => account.id === selectedBunqAccountId) ?? bunqAccounts[0] ?? null;
  const accountTabViews = [
    ...nonBunqAccounts.map((account) => ({ tabId: account.id, account })),
    ...(selectedBunqAccount ? [{ tabId: BUNQ_TAB_ID, account: selectedBunqAccount }] : []),
  ];

  const accountTransactions = useMemo(
    () => transactions.filter((tx) => tx.accountName === activeAccount?.name),
    [transactions, activeAccount]
  );

  const statementMonths = useMemo(() => {
    const monthKeys = new Set(
      accountTransactions
        .map((tx) => tx.bookingDate.slice(0, 7))
        .filter((value) => /^\d{4}-\d{2}$/.test(value))
    );
    return Array.from(monthKeys).sort((left, right) => right.localeCompare(left));
  }, [accountTransactions]);

  const activeStatementPeriod = statementPeriod === 'all' || statementMonths.includes(statementPeriod)
    ? statementPeriod
    : 'all';

  const totalStatements = useMemo(() => accountTransactions.reduce((total, tx) => {
    if (tx.direction !== 'outgoing') return total;
    if (tx.category === 'private' || tx.category === 'internal') return total;
    if (activeStatementPeriod !== 'all' && !tx.bookingDate.startsWith(activeStatementPeriod)) return total;
    return total + Math.abs(tx.amount);
  }, 0), [accountTransactions, activeStatementPeriod]);

  const displayedStatementTotal = activeStatementPeriod === 'all'
    ? activeAccount?.businessExpensesTotal ?? totalStatements
    : totalStatements;

  const filteredAccountTransactions = useMemo(() => {
    const term = transactionSearch.trim().toLocaleLowerCase('nl-NL');
    if (!term) return accountTransactions;

    return accountTransactions.filter((tx) => {
      const type = tx.category === 'private'
        ? 'privé prive'
        : tx.category === 'internal' ? 'interne overboeking winst rekening'
        : tx.direction === 'outgoing' ? 'uitgaand' : 'inkomend';
      const amount = Number.isFinite(tx.amount) ? tx.amount : 0;
      const searchable = [
        tx.bookingDate,
        formatDate(tx.bookingDate),
        tx.description,
        tx.counterpartyName,
        formatCurrency(amount),
        amount.toFixed(2),
        amount.toFixed(2).replace('.', ','),
        type,
        tx.status,
      ].join(' ').toLocaleLowerCase('nl-NL');
      return searchable.includes(term);
    });
  }, [accountTransactions, transactionSearch]);

  const paginatedTransactions = useMemo(() => {
    if (transactionPageSize === 'all') return filteredAccountTransactions;
    const start = (currentPage - 1) * transactionPageSize;
    return filteredAccountTransactions.slice(start, start + transactionPageSize);
  }, [currentPage, filteredAccountTransactions, transactionPageSize]);

  const totalPages = transactionPageSize === 'all'
    ? 1
    : Math.max(1, Math.ceil(filteredAccountTransactions.length / transactionPageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [transactionSearch, transactionPageSize, activeAccountId]);

  useEffect(() => {
    setStatementPeriod('all');
  }, [activeAccountId]);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.latestBalanceAmount ?? 0), 0);
  const knabBalance = accounts
    .filter((account) => !account.externalAccountId.startsWith('bunq:'))
    .reduce((sum, account) => sum + (account.latestBalanceAmount ?? 0), 0);
  const activeCostActuals = financeActuals
    ? costTimeline === 'month' ? financeActuals.periods.month : financeActuals.periods.sinceBankStart
    : null;
  const costPeriod = useMemo(() => {
    const now = new Date();
    if (costTimeline === 'since-bank-start') {
      const firstKnabDate = financeActuals?.periods.sinceBankStart.firstTransactionDate || summary.firstTransactionDate;
      const start = firstKnabDate ? new Date(`${firstKnabDate.slice(0, 10)}T00:00:00`) : now;
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return {
        start,
        end,
        label: firstKnabDate ? `${formatDate(start.toISOString())} → vandaag` : 'Wacht op eerste Knab-transactie',
      };
    }

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start,
      end,
      label: `${formatDate(start.toISOString())} → ${formatDate(end.toISOString())}`,
    };
  }, [costTimeline, financeActuals, summary.firstTransactionDate]);

  const costsInPeriod = useMemo(() => costs.filter((cost) => {
    const date = new Date(`${cost.date.slice(0, 10)}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date >= costPeriod.start && date < costPeriod.end;
  }), [costPeriod.end, costPeriod.start, costs]);

  const costSummary = useMemo(() => {
    if (activeCostActuals) {
      return {
        totalIncl: activeCostActuals.businessExpenses,
        totalExcl: activeCostActuals.businessExpenses,
        unlinked: activeCostActuals.unmatchedBankCount,
        byCategory: activeCostActuals.categoryTotals,
      };
    }
    const byCategory = new Map<ProjectCostCategory, number>();
    let totalIncl = 0;
    let totalExcl = 0;
    let unlinked = 0;

    costsInPeriod.forEach((cost) => {
      const amountIncl = Number(cost.amount_incl_btw) || 0;
      const amountExcl = Number(cost.amount_excl_btw) || 0;
      totalIncl += amountIncl;
      totalExcl += amountExcl;
      if (!cost.offerte_id) unlinked += 1;
      const category = normalizeProjectCostCategory(cost.category);
      byCategory.set(category, (byCategory.get(category) || 0) + amountIncl);
    });

    return {
      totalIncl,
      totalExcl,
      unlinked,
      byCategory: Array.from(byCategory.entries())
        .map(([category, amount]) => ({ category, label: PROJECT_COST_CATEGORY_LABELS[category], amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [activeCostActuals, costsInPeriod]);
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
        body: JSON.stringify({ period: 'this_month', provider: 'all', profile: 'personal', answers }),
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

  if (isUserLoading || loading || bankRefreshPending) {
    return (
      <div className={embedded ? 'flex min-h-[320px] items-center justify-center' : 'min-h-screen bg-background flex items-center justify-center'}>
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium">Knab wordt bijgewerkt</p>
          <p className="text-sm text-muted-foreground">Saldo, transacties en kostentotalen verschijnen zodra de actuele bankgegevens volledig zijn geladen.</p>
        </div>
      </div>
    );
  }

  if (bankRefreshError) {
    return (
      <div className={embedded ? 'flex min-h-[320px] items-center justify-center' : 'min-h-screen bg-background flex items-center justify-center'}>
        <div className="mx-4 max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 text-center shadow-lg">
          <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
          <h2 className="mt-3 text-lg font-semibold">Actuele Knab-gegevens konden niet worden geladen</h2>
          <p className="mt-2 text-sm text-muted-foreground">Oude cijfers worden bewust niet getoond. {bankRefreshError}</p>
          <Button type="button" className="mt-5 gap-2" onClick={() => void refreshKnabData(true)}>
            <RefreshCcw className="h-4 w-4" />
            Opnieuw proberen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'w-full' : 'app-shell min-h-screen bg-background'}>
      {!embedded ? <AppNavigation /> : null}
      {!embedded ? <DashboardHeader user={user} title="Financiën" /> : null}

      <main className={embedded ? 'w-full' : 'flex flex-col items-center p-4 md:px-6 md:pt-6'}>
        <div className="w-full max-w-7xl space-y-5">
          <Tabs
            value={activeTabId}
            onValueChange={(id) => {
              setActiveTabId(id);
              setCurrentPage(1);
            }}
          >
            <nav aria-label="Financiële tabbladen" className={embedded ? 'hidden' : 'border-b border-border/70 pb-4'}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/60 bg-card/90 p-2 shadow-lg">
                <TabsTrigger value={OVERVIEW_TAB_ID} className="h-auto min-w-[120px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Overzicht</TabsTrigger>
                <TabsTrigger value={COSTS_TAB_ID} className="h-auto min-w-[110px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Kosten</TabsTrigger>
                <TabsTrigger value={INVOICES_TAB_ID} className="h-auto min-w-[120px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Facturen</TabsTrigger>
                <TabsTrigger value={QUOTES_TAB_ID} className="h-auto min-w-[115px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Offertes</TabsTrigger>
                <TabsTrigger value={PROJECTS_TAB_ID} className="h-auto min-w-[120px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Projecten</TabsTrigger>
                <TabsTrigger value={ANALYSIS_TAB_ID} className="h-auto min-w-[105px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Analyse</TabsTrigger>
                <TabsTrigger value={BOUWMAAT_TAB_ID} className="h-auto min-w-[125px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">Bouwmaat</TabsTrigger>
                {nonBunqAccounts.map((account) => (
                  <TabsTrigger
                    key={account.id}
                    value={account.id}
                    className="h-auto min-w-[155px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80"
                  >
                    {account.name}
                  </TabsTrigger>
                ))}
                {bunqAccounts.length > 0 ? (
                  <TabsTrigger value={BUNQ_TAB_ID} className="h-auto min-w-[155px] rounded-xl px-4 py-3 text-left text-base font-semibold data-[state=active]:bg-background/80">
                    bunq personal
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </nav>

            <TabsContent value={OVERVIEW_TAB_ID} className="mt-4 space-y-4">
              <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.12] via-card/55 to-cyan-500/[0.08] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                      <WalletCards className="h-4 w-4" />
                      Financiële cockpit
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Alles op één plek</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Bank, facturen, geregistreerde kosten en cashflow voor je bedrijf. De bankcijfers worden automatisch bijgewerkt na synchronisatie.
                    </p>
                  </div>
                  {financeDataLoading ? <Loader2 className="h-5 w-5 animate-spin text-emerald-300" /> : null}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Knab saldo', value: formatCurrency(knabBalance), icon: WalletCards, tone: 'text-emerald-300' },
                    { label: 'Operationele inkomsten deze maand', value: financeActuals ? formatCurrency(financeActuals.periods.month.operatingIncomingTotal) : '-', icon: TrendingUp, tone: 'text-cyan-300' },
                    { label: 'Zakelijke uitgaven deze maand', value: financeActuals ? formatCurrency(financeActuals.periods.month.businessExpenses) : '-', icon: Receipt, tone: 'text-rose-300' },
                    { label: 'Privé-opnames deze maand', value: financeActuals ? formatCurrency(financeActuals.periods.month.privateExpenses) : '-', icon: WalletCards, tone: 'text-violet-300' },
                    { label: 'Operationele inkomsten sinds start Knab', value: financeActuals ? formatCurrency(financeActuals.periods.sinceBankStart.operatingIncomingTotal) : '-', icon: TrendingUp, tone: 'text-cyan-300' },
                    { label: 'Borg/terugbetaling uitgesloten', value: financeActuals ? formatCurrency(financeActuals.periods.sinceBankStart.nonOperatingIncomingTotal) : '-', icon: CircleAlert, tone: 'text-slate-300' },
                    { label: 'Zakelijke uitgaven sinds start Knab', value: financeActuals ? formatCurrency(financeActuals.periods.sinceBankStart.businessExpenses) : '-', icon: Euro, tone: 'text-amber-300' },
                    { label: 'Nog te ontvangen', value: formatCurrency(financeMetrics?.totals.openAmount || 0), icon: CircleAlert, tone: 'text-amber-300' },
                    { label: 'Te late betalingen', value: financeMetrics ? `${financeMetrics.totals.overdueCount} (${formatCurrency(financeMetrics.totals.overdueAmount)})` : '-', icon: CircleAlert, tone: 'text-rose-300' },
                    { label: 'Kaswinst sinds start Knab', value: financeActuals ? formatCurrency(financeActuals.periods.sinceBankStart.cashProfit) : '-', icon: TrendingUp, tone: financeActuals && financeActuals.periods.sinceBankStart.cashProfit >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                    { label: 'Knab-uitgaven zonder bronkoppeling', value: financeActuals ? `${financeActuals.periods.sinceBankStart.unmatchedBankCount} (${formatCurrency(financeActuals.periods.sinceBankStart.unmatchedBankAmount)})` : '-', icon: Receipt, tone: 'text-violet-300' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                          {item.label}
                        </div>
                        <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                      </div>
                    );
                  })}
                </div>

                {financeDataError ? (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Sommige financiële cijfers konden niet worden geladen: {financeDataError}
                  </div>
                ) : null}
                {financeActuals ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Knab is leidend voor deze cijfers. Operationele inkomsten zijn externe bijschrijvingen; interne transfers en borg/terugbetaling zijn uitgesloten. Kaswinst = operationele inkomsten minus zakelijke Knab-afschrijvingen. Periode: {formatDate(financeActuals.periods.sinceBankStart.periodStart)} t/m {formatDate(financeActuals.periods.sinceBankStart.periodEnd)}.
                  </p>
                ) : null}
              </section>
            </TabsContent>

            <TabsContent value={COSTS_TAB_ID} className="mt-4 space-y-4">
              <section>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Zakelijke uitgaven uit Knab</CardTitle>
                        <p className="text-sm text-muted-foreground">Knab is de bron van waarheid. Elke zakelijke afschrijving telt precies één keer; facturen en bonnen zijn alleen de onderbouwing.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Tijdlijn</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={costTimeline === 'month' ? 'default' : 'outline'}
                          onClick={() => setCostTimeline('month')}
                        >
                          Deze maand
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={costTimeline === 'since-bank-start' ? 'default' : 'outline'}
                          onClick={() => setCostTimeline('since-bank-start')}
                          disabled={!summary.firstTransactionDate}
                        >
                          Sinds start Knab
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">Periode: {activeCostActuals ? `${formatDate(activeCostActuals.periodStart)} → ${formatDate(activeCostActuals.periodEnd)}` : costPeriod.label} · {activeCostActuals?.businessExpenseCount ?? costsInPeriod.length} zakelijke Knab-afschrijvingen</div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {costSummary.byCategory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nog geen kosten geregistreerd.</p>
                    ) : (
                      costSummary.byCategory.map((item) => (
                        <div key={item.category} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
                          <span className="text-sm">{item.label}</span>
                          <span className="font-medium text-amber-200">{formatCurrency(item.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
                      <span className="text-sm">Privé-opnames (Knab, uitgesloten)</span>
                      <span className="font-medium text-violet-300">{formatCurrency(activeCostActuals?.privateExpenses ?? Math.abs(summary.privateWithdrawalsTotal))}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/70 pt-3 text-sm font-semibold">
                      <span>Totaal zakelijke uitgaven via Knab</span>
                      <span className="text-amber-200">{formatCurrency(costSummary.totalIncl)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Kasbasis voor winstberekening (incl. btw)</span>
                      <span>{formatCurrency(costSummary.totalIncl)}</span>
                    </div>
                    {activeCostActuals ? (
                      <>
                        <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <div className="text-xs text-muted-foreground">Zakelijke Knab-afschrijvingen</div>
                            <div className="mt-1 font-semibold text-emerald-200">{formatCurrency(activeCostActuals.businessExpenses)}</div>
                          </div>
                          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                            <div className="text-xs text-muted-foreground">Bronregels gekoppeld</div>
                            <div className="mt-1 font-semibold text-cyan-200">{activeCostActuals.matchedSourceCount}</div>
                          </div>
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                            <div className="text-xs text-muted-foreground">Bronregels nog zonder Knab-match</div>
                            <div className="mt-1 font-semibold text-amber-200">{activeCostActuals.unmatchedSourceCount} ({formatCurrency(activeCostActuals.unmatchedSourceAmount)})</div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm">
                          <div className="font-medium text-rose-100">Knab-uitgaven zonder factuur- of bonkoppeling</div>
                          <div className="mt-1 text-xs text-muted-foreground">Deze bedragen zijn wél meegenomen in het totaal. Alleen de onderbouwing ontbreekt nog: {activeCostActuals.unmatchedBankCount} uitgaven voor {formatCurrency(activeCostActuals.unmatchedBankAmount)}.</div>
                          {activeCostActuals.unmatchedBankTransactions.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {activeCostActuals.unmatchedBankTransactions.slice(0, 12).map((transaction) => (
                                <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/30 px-3 py-2 text-xs">
                                  <span>{formatDate(transaction.date)} · {transaction.name} · {transaction.description}</span>
                                  <span className="font-medium text-rose-200">{formatCurrency(transaction.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>

              </section>
            </TabsContent>

            <TabsContent value={BOUWMAAT_TAB_ID} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Landmark className="h-5 w-5 text-blue-300" />
                        Bouwmaat: bonnen & facturen
                      </CardTitle>
                      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Een bon is direct betaald. Een factuur staat meteen als kosten geregistreerd, maar blijft openstaand totdat de exacte incasso op Knab verschijnt. Gesplitste kosten blijven onder één factuurgroep zichtbaar.
                      </p>
                    </div>
                    {financeDataLoading ? <Loader2 className="h-5 w-5 animate-spin text-blue-300" /> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!bouwmaat ? (
                    <div className="rounded-xl border border-border/70 bg-card/55 p-5 text-sm text-muted-foreground">
                      Bouwmaat-reconciliatie wordt geladen.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          ['Nog te betalen aan Bouwmaat', bouwmaat.summary.openAmount + bouwmaat.summary.partialAmount, 'text-amber-200'],
                          ['Betaald via Knab', bouwmaat.summary.paidBankAmount, 'text-emerald-300'],
                          ['Facturen', `${bouwmaat.summary.invoiceCount} (${formatCurrency(bouwmaat.summary.registeredInvoiceAmount)})`, 'text-cyan-200'],
                          ['Bonnen direct betaald', `${bouwmaat.summary.receiptCount} (${formatCurrency(bouwmaat.summary.registeredReceiptAmount)})`, 'text-violet-200'],
                        ].map(([label, value, tone]) => (
                          <div key={String(label)} className="rounded-xl border border-border/70 bg-background/30 p-4">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                            <div className={`mt-2 text-xl font-semibold ${tone}`}>{typeof value === 'number' ? formatCurrency(value) : value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Opgesplitste facturen</div>
                          <div className="mt-1 text-lg font-semibold">{bouwmaat.summary.splitInvoiceCount}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Meerdere kostenregels, één betaalmoment.</div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Geregistreerd als kosten</div>
                          <div className="mt-1 text-lg font-semibold text-amber-200">{formatCurrency(bouwmaat.summary.registeredAmount)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Inclusief bonnen en facturen.</div>
                        </div>
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Ongekoppelde Knab-afschrijvingen</div>
                          <div className="mt-1 text-lg font-semibold text-rose-200">{formatCurrency(bouwmaat.summary.unmatchedBankAmount)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Controleer deze tegen facturen of bundelbetalingen.</div>
                        </div>
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Nog te classificeren</div>
                          <div className="mt-1 text-lg font-semibold text-violet-200">{formatCurrency(bouwmaat.summary.unknownAmount)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{bouwmaat.summary.unknownGroupCount} oude regel(s) zonder bon/factuurmetadata.</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-border/70">
                        <div className="min-w-[900px]">
                          <div className="grid grid-cols-[110px_150px_125px_140px_140px_130px_110px] gap-3 border-b border-border/70 bg-card/70 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <div>Datum</div>
                            <div>Factuur</div>
                            <div>Type</div>
                            <div className="text-right">Kosten</div>
                            <div className="text-right">Knab betaald</div>
                            <div className="text-right">Openstaand</div>
                            <div>Status</div>
                          </div>
                          <div className="divide-y divide-border/70 bg-background/40">
                            {bouwmaat.groups.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">Nog geen Bouwmaat-kosten geregistreerd.</div>
                            ) : bouwmaat.groups.map((group) => (
                              <div key={group.id} className="grid grid-cols-[110px_150px_125px_140px_140px_130px_110px] items-center gap-3 px-4 py-3 text-sm">
                                <div>{formatDate(group.date)}</div>
                                <div className="truncate font-medium" title={group.supplierInvoiceNumber || group.id}>{group.supplierInvoiceNumber || 'Zonder nummer'}</div>
                                <div className="capitalize text-muted-foreground">{group.paymentType === 'bon' ? 'Bon' : group.paymentType === 'factuur' ? 'Factuur' : 'Onbekend'}</div>
                                <div className="text-right">{formatCurrency(group.costAmount)}</div>
                                <div className="text-right text-emerald-300">{formatCurrency(group.bankAmount)}</div>
                                <div className={`text-right ${group.outstandingAmount > 0 ? 'text-amber-200' : 'text-muted-foreground'}`}>{formatCurrency(group.outstandingAmount)}</div>
                                <div>
                                  <Badge variant="outline" className={group.status === 'betaald' ? 'border-emerald-500/30 text-emerald-200' : group.status === 'openstaand' ? 'border-amber-500/30 text-amber-200' : group.status === 'gedeeltelijk' ? 'border-orange-500/30 text-orange-200' : 'text-muted-foreground'}>
                                    {group.status}
                                  </Badge>
                                </div>
                                {group.splitRowCount > 1 ? (
                                  <div className="col-span-7 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
                                    Opgesplitst in {group.splitRowCount} kostenregels: {group.costRows.map((row) => `${row.category} ${formatCurrency(row.amount)}`).join(' · ')}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {bouwmaat.unmatchedBankTransactions.length > 0 ? (
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                          <h3 className="text-sm font-semibold text-rose-100">Knab-afschrijvingen zonder gekoppelde factuur</h3>
                          <div className="mt-3 space-y-2 text-sm">
                            {bouwmaat.unmatchedBankTransactions.map((transaction) => (
                              <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2">
                                <span>{formatDate(transaction.booking_date)} · {transaction.description || transaction.counterparty_name || 'Bouwmaat'}</span>
                                <span className="font-medium text-rose-200">{formatCurrency(transaction.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value={INVOICES_TAB_ID} className="mt-4 space-y-4">
              <section>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Facturen & cashflow</CardTitle>
                    <p className="text-sm text-muted-foreground">Wat is al binnen en wat moet nog worden opgevolgd?</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Ontvangen volgens facturen</div>
                      <div className="mt-1 text-2xl font-semibold text-emerald-300">{formatCurrency(financeMetrics?.totals.receivedCashIncl || 0)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="text-xs text-muted-foreground">Openstaand</div>
                        <div className="mt-1 font-semibold text-amber-200">{formatCurrency(financeMetrics?.totals.openAmount || 0)}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="text-xs text-muted-foreground">Te laat</div>
                        <div className="mt-1 font-semibold text-rose-200">{financeMetrics?.totals.overdueCount || 0}</div>
                      </div>
                    </div>
                    <button type="button" className="w-full rounded-lg border border-border/70 px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-background/40 hover:text-foreground" onClick={() => router.push('/facturen')}>
                      Open facturen en volg betalingen op →
                    </button>
                  </CardContent>
                </Card>
              </section>
            </TabsContent>

            <TabsContent value={QUOTES_TAB_ID} className="mt-4 space-y-4">
              <section>
                {financeMetrics ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Offertes & belasting</CardTitle>
                      <p className="text-sm text-muted-foreground">De cijfers die eerder op het dashboard stonden.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['Geoffreerde omzet', formatCurrency(financeMetrics.totals.quotedRevenueIncl)],
                          ['Werkelijke kosten', formatCurrency(financeMetrics.totals.actualCostExcl)],
                          ['Marge', `${(financeMetrics.totals.marginPct * 100).toFixed(1)}%`],
                          ['Btw te betalen', formatCurrency(financeMetrics.vatSummary.netVatPayable)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-border/60 bg-background/30 p-3">
                            <div className="text-xs text-muted-foreground">{label}</div>
                            <div className="mt-1 font-semibold">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border/70 pt-3">
                        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Offertestatus</div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          {[
                            ['Concept', financeMetrics.quoteStatusSummary.concept],
                            ['Verzonden', financeMetrics.quoteStatusSummary.verzonden],
                            ['Geaccepteerd', financeMetrics.quoteStatusSummary.geaccepteerd],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-border/60 bg-background/30 p-2">
                              <div className="text-muted-foreground">{label}</div>
                              <div className="mt-1 text-base font-semibold">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </section>
            </TabsContent>

            <TabsContent value={PROJECTS_TAB_ID} className="mt-4 space-y-4">
              <section>
                {financeMetrics ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Projectresultaten</CardTitle>
                      <p className="text-sm text-muted-foreground">Snelle controle op omzet, kosten en cash per project.</p>
                    </CardHeader>
                    <CardContent>
                      {financeMetrics.projectPerformances.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nog geen projectcijfers beschikbaar.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <div className="min-w-[560px] divide-y divide-border/60">
                            <div className="grid grid-cols-[1.2fr_1fr_130px_130px] gap-3 px-2 pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                              <div>Project</div>
                              <div>Klant</div>
                              <div className="text-right">Omzet</div>
                              <div className="text-right">Cash</div>
                            </div>
                            {financeMetrics.projectPerformances.slice(0, 8).map((project) => (
                              <div key={project.projectId} className="grid grid-cols-[1.2fr_1fr_130px_130px] gap-3 px-2 py-2 text-sm">
                                <div className="truncate font-medium">{project.offerteNummer ? `#${formatOfferteNummerLabel(project.offerteNummer, project.offerteVersie)}` : project.title}</div>
                                <div className="truncate text-muted-foreground">{project.clientName}</div>
                                <div className="text-right">{formatCurrency(project.quotedRevenueIncl)}</div>
                                <div className={project.receivedCashIncl > 0 ? 'text-right text-emerald-300' : 'text-right text-muted-foreground'}>{formatCurrency(project.receivedCashIncl)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </section>
            </TabsContent>

            <TabsContent value={BANK_TAB_ID} className="mt-4 space-y-4">
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Landmark className="h-5 w-5 text-lime-400" />
                        Banktransacties
                      </CardTitle>
                        <div className="text-sm text-muted-foreground">Knab zakelijk en bunq personal in één overzicht.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {knabConnection?.status === 'connected' ? (
                        <Button type="button" onClick={() => void handleSync('enablebanking')} disabled={syncingProvider !== null} className="gap-2">
                          {syncingProvider === 'enablebanking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                          {syncingProvider === 'enablebanking' ? 'Knab synchroniseren...' : 'Synchroniseer Knab'}
                      </Button>
                      ) : (
                        <Button type="button" onClick={() => void handleConnectKnab()} disabled={connectingKnab || !knabInstitution} className="gap-2">
                          {connectingKnab ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                          {connectingKnab ? 'Knab openen...' : 'Koppel Knab'}
                        </Button>
                      )}
                      {bunqConnection?.status === 'connected' ? (
                        <Button type="button" variant="secondary" onClick={() => void handleSync('bunq')} disabled={syncingProvider !== null} className="gap-2">
                          {syncingProvider === 'bunq' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                          {syncingProvider === 'bunq' ? 'bunq synchroniseren...' : 'Synchroniseer bunq personal'}
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" className="gap-2" onClick={() => { setActiveTabId(ANALYSIS_TAB_ID); void runSpendingAnalysis(); }} disabled={analysisLoading}>
                        {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {analysisLoading ? 'Analyse draait...' : 'AI analyse op uitgaven (alle rekeningen)'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="flex items-center justify-between gap-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Knab zakelijk</div><Badge variant="secondary">{connectionLabel(knabConnection)}</Badge></div>
                      <div className="mt-2 text-xs text-muted-foreground">Laatste sync: {formatDate(knabConnection?.lastSyncedAt)}</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="flex items-center justify-between gap-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">bunq personal</div><Badge variant="secondary">{connectionLabel(bunqConnection)}</Badge></div>
                      <div className="mt-2 text-xs text-muted-foreground">Laatste sync: {formatDate(bunqConnection?.lastSyncedAt)}</div>
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
                      Nog geen bankrekening geladen. Koppel Knab of synchroniseer bunq personal.
                    </div>
                  )}

                  {setupMessage && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">{setupMessage}</div>
                  )}

                  {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
                  )}
                  {infoMessage && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{infoMessage}</div>
                  )}
                </CardHeader>
              </Card>
            </TabsContent>

            <TabsContent value={ANALYSIS_TAB_ID} className="mt-4 space-y-4">
              <Card>
                <CardHeader className="space-y-3">
                  <div>
                    <CardTitle className="text-base">Uitgavenanalyse</CardTitle>
                    <p className="text-sm text-muted-foreground">Laat de banktransacties indelen in zakelijke, persoonlijke en gemengde uitgaven.</p>
                  </div>
                  <Button type="button" variant="outline" className="w-fit gap-2" onClick={() => void runSpendingAnalysis()} disabled={analysisLoading}>
                    {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {analysisLoading ? 'Analyse draait...' : 'Analyseer uitgaven opnieuw'}
                  </Button>
                  {analysisError && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{analysisError}</div>}
                </CardHeader>
                {analysisReport ? (
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">Resultaat</h3>
                        <Button type="button" variant="secondary" onClick={() => void handleDownloadSpendingPdf()}>Open/download PDF</Button>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">{analysisReport.periodSummary.shortConclusion}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm"><div className="text-xs text-muted-foreground">Totale uitgaven</div><div className="mt-1 text-lg font-semibold text-rose-300">{formatCurrency(analysisReport.periodSummary.totalOutgoing)}</div></div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm"><div className="text-xs text-muted-foreground">Zakelijk</div><div className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(analysisReport.businessPersonalSummary.businessAmount)}</div></div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm"><div className="text-xs text-muted-foreground">Persoonlijk</div><div className="mt-1 text-lg font-semibold text-amber-300">{formatCurrency(analysisReport.businessPersonalSummary.personalAmount)}</div></div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {analysisReport.categoryBreakdown.slice(0, 8).map((item) => (
                          <div key={item.category} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm"><div className="flex items-center justify-between gap-2"><div className="font-medium">{item.category}</div><div className="text-rose-300">{formatCurrency(item.totalAmount)}</div></div><div className="mt-1 text-xs text-muted-foreground">{item.explanation}</div></div>
                        ))}
                      </div>
                    </div>
                    {(analysisReport.unclearTransactions || []).length > 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <h4 className="text-sm font-semibold">Nog onduidelijk: beantwoord deze vragen</h4>
                        <div className="mt-3 space-y-3">
                          {(analysisReport.unclearTransactions || []).map((item) => (
                            <div key={item.transactionId} className="rounded-lg border border-border/60 bg-background/40 p-3"><div className="text-sm">{item.question}</div><input value={clarificationDraft[item.transactionId] || ''} onChange={(event) => setClarificationDraft((prev) => ({ ...prev, [item.transactionId]: event.target.value }))} placeholder="Typ hier je uitleg over deze transactie..." className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
                          ))}
                        </div>
                        <div className="mt-3"><Button type="button" onClick={() => void handleClarificationSubmit()} disabled={analysisLoading} className="gap-2">{analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Heranalyseer met mijn antwoorden</Button></div>
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-card/55 p-4"><div className="text-sm font-semibold">Wat was waarschijnlijk nodig?</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{analysisReport.neededVsAvoidable.likelyNeeded.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
                      <div className="rounded-xl border border-border/70 bg-card/55 p-4"><div className="text-sm font-semibold">Wat had je mogelijk niet hoeven uitgeven?</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{analysisReport.neededVsAvoidable.possiblyAvoidable.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            </TabsContent>

            {accountTabViews.map(({ tabId, account }) => (
              <TabsContent key={tabId} value={tabId} className="mt-4 space-y-4">
                {tabId === BUNQ_TAB_ID && bunqAccounts.length > 1 ? (
                  <Tabs value={selectedBunqAccountId} onValueChange={(value) => { setActiveBunqAccountId(value); setCurrentPage(1); }}>
                    <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-border/60 bg-card/70 p-2">
                      {bunqAccounts.map((bunqAccount) => (
                        <TabsTrigger key={bunqAccount.id} value={bunqAccount.id} className="rounded-lg px-4 py-2 data-[state=active]:bg-background/80">
                          {bunqAccount.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : null}
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
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Transacties</CardTitle>
                        <div className="mt-2 text-sm text-muted-foreground">Totale zakelijke afschriften</div>
                        <div className="mt-1 text-2xl font-semibold text-rose-300">{formatCurrency(displayedStatementTotal)}</div>
                      </div>
                      <Select value={activeStatementPeriod} onValueChange={setStatementPeriod}>
                        <SelectTrigger className="w-[190px]" aria-label="Periode totale afschriften">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Vanaf het begin</SelectItem>
                          {statementMonths.map((month) => {
                            const [year, monthNumber] = month.split('-').map(Number);
                            const label = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' })
                              .format(new Date(year, monthNumber - 1, 1));
                            return <SelectItem key={month} value={month}>{label}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        value={transactionSearch}
                        onChange={(event) => setTransactionSearch(event.target.value)}
                        placeholder="Zoek op omschrijving, tegenpartij, datum, bedrag, type of status..."
                        className="pl-9"
                        aria-label="Zoek in Knab-transacties"
                      />
                    </div>
                    {accountTransactions.length === 0 ? (
                      <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                        Geen transacties gevonden voor deze rekening.
                      </div>
                    ) : filteredAccountTransactions.length === 0 ? (
                      <div className="rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
                        Geen transacties gevonden voor “{transactionSearch.trim()}”.
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
                                    {tx.category === 'private' ? (
                                      <span className="inline-flex items-center gap-1 text-violet-200">Privé</span>
                                    ) : tx.category === 'internal' ? (
                                      <span className="inline-flex items-center gap-1 text-cyan-200">Interne overboeking</span>
                                    ) : tx.direction === 'outgoing'
                                      ? <span className="inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />Uitgaand</span>
                                      : <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Inkomend</span>}
                                  </Badge>
                                </div>
                                <div className="truncate text-muted-foreground">{tx.status || '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>
                              {filteredAccountTransactions.length} {filteredAccountTransactions.length === 1 ? 'transactie' : 'transacties'} · Pagina {currentPage} van {totalPages}
                            </span>
                            <Select
                              value={String(transactionPageSize)}
                              onValueChange={(value) => {
                                setTransactionPageSize(value === 'all' ? 'all' : Number(value) as 10 | 20 | 40);
                              }}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Transacties per pagina">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10 per pagina</SelectItem>
                                <SelectItem value="20">20 per pagina</SelectItem>
                                <SelectItem value="40">40 per pagina</SelectItem>
                                <SelectItem value="all">Alle transacties</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
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

export default function BankOverzichtPage() {
  return <BankOverzichtContent />;
}
