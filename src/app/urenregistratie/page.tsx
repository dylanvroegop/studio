'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Clock3 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { TrackingDayIntelligence } from '@/components/tracking/TrackingDayIntelligence';
import { TrackingPeriodOverview, type TrackingTimeEntry } from '@/components/tracking/TrackingPeriodOverview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { TimeEntrySource } from '@/lib/time-entries';

interface TimeEntry extends TrackingTimeEntry {
  source: TimeEntrySource;
  createdAt: number | string;
}

interface QuoteLike {
  id: string;
  offerteNummer?: number | string;
  titel?: string;
  title?: string;
  isCalculationTest?: boolean;
  updatedAt?: { toMillis?: () => number };
  klantinformatie?: {
    voornaam?: string;
    achternaam?: string;
    bedrijfsnaam?: string;
    straat?: string;
    huisnummer?: string | number;
    postcode?: string;
    plaats?: string;
  };
}

type PageTab = 'day' | 'hours' | 'overview';

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function mapEntry(row: Record<string, unknown>): TimeEntry {
  const source = String(row.source || 'gps_tracking_auto') as TimeEntrySource;
  const exactMinutes = numberValue(row.exact_minutes ?? row.exactMinutes);
  const rawOnsiteMinutes = numberValue(row.onsite_minutes ?? row.onsiteMinutes);
  const outboundTravelMinutes = numberValue(row.outbound_travel_minutes ?? row.outboundTravelMinutes);
  const returnTravelMinutes = numberValue(row.return_travel_minutes ?? row.returnTravelMinutes);
  const clientTransferMinutes = numberValue(row.client_transfer_minutes ?? row.clientTransferMinutes);
  const supplierTravelMinutes = numberValue(row.supplier_travel_minutes ?? row.supplierTravelMinutes);
  const supplierStopMinutes = numberValue(row.supplier_stop_minutes ?? row.supplierStopMinutes);
  const unallocatedMinutes = numberValue(row.unallocated_minutes ?? row.unallocatedMinutes);
  const hasBreakdown = Number(rawOnsiteMinutes || 0)
    + Number(outboundTravelMinutes || 0)
    + Number(returnTravelMinutes || 0)
    + Number(clientTransferMinutes || 0)
    + Number(supplierTravelMinutes || 0)
    + Number(supplierStopMinutes || 0) > 0;
  return {
    id: String(row.id || crypto.randomUUID()),
    date: String(row.work_date || row.date || ''),
    totalHours: Number(row.worked_hours ?? row.totalHours ?? row.hours ?? 0),
    quoteId: String(row.quote_id ?? row.quoteId ?? '').trim() || undefined,
    source,
    exactMinutes,
    onsiteMinutes: !hasBreakdown && source.startsWith('gps_tracking_') ? exactMinutes : rawOnsiteMinutes,
    outboundTravelMinutes,
    returnTravelMinutes,
    clientTransferMinutes,
    supplierTravelMinutes,
    supplierStopMinutes,
    unallocatedMinutes,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
  };
}

function isGpsEntry(entry: TimeEntry): boolean {
  const measuredMinutes = Number(entry.onsiteMinutes || 0)
    + Number(entry.outboundTravelMinutes || 0)
    + Number(entry.returnTravelMinutes || 0)
    + Number(entry.clientTransferMinutes || 0)
    + Number(entry.supplierTravelMinutes || 0)
    + Number(entry.supplierStopMinutes || 0);
  const recordedMinutes = Number(entry.exactMinutes || 0) > 0
    ? Number(entry.exactMinutes)
    : Math.round(Number(entry.totalHours || 0) * 60);
  return measuredMinutes > 0
    || (entry.source.startsWith('gps_tracking_') && recordedMinutes > 0);
}

function UrenregistratieContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<PageTab>(
    requestedTab === 'hours' || requestedTab === 'overview'
      ? requestedTab
      : requestedTab === 'history'
        ? 'overview'
        : 'day',
  );
  const [quotes, setQuotes] = useState<QuoteLike[]>([]);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/uren/entries?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: Record<string, unknown>[]; message?: string } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.message || 'Uren konden niet worden geladen.');
      }
      setHistory(payload.data
        .map(mapEntry)
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && isGpsEntry(entry)));
    } catch (error) {
      toast({
        title: 'Uren laden mislukt',
        description: error instanceof Error ? error.message : 'Onbekende fout',
        variant: 'destructive',
      });
    }
  }, [toast, user]);

  useEffect(() => {
    if (!isUserLoading && !user) setLoading(false);
  }, [isUserLoading, user]);

  useEffect(() => {
    if (!user || !firestore) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const quotesQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
        const [quotesSnapshot] = await Promise.all([getDocs(quotesQuery), loadHistory()]);
        if (!active) return;
        const loadedQuotes = quotesSnapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as QuoteLike))
          .filter((quote) => quote.isCalculationTest !== true)
          .sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0));
        setQuotes(loadedQuotes);
      } catch (error) {
        if (active) toast({ title: 'Offertes laden mislukt', description: error instanceof Error ? error.message : 'Onbekende fout', variant: 'destructive' });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refresh = () => void loadHistory();
    window.addEventListener('gps-work-hours:updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('gps-work-hours:updated', refresh);
    };
  }, [firestore, loadHistory, toast, user]);

  return (
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <header className="border-b border-border/70 px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Clock3 className="h-5 w-5 text-emerald-500" />Urenregistratie</h1>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PageTab)}>
          <nav aria-label="Urenregistratie tabbladen" className="border-b border-border/70 pb-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-border/60 bg-card p-2">
              <TabsTrigger value="day" className="h-auto min-w-[130px] rounded-lg px-4 py-2.5 text-base font-semibold data-[state=active]:bg-background">Dagoverzicht</TabsTrigger>
              <TabsTrigger value="hours" className="h-auto min-w-[140px] rounded-lg px-4 py-2.5 text-base font-semibold data-[state=active]:bg-background">Uren gewerkt</TabsTrigger>
              <TabsTrigger value="overview" className="h-auto min-w-[120px] rounded-lg px-4 py-2.5 text-base font-semibold data-[state=active]:bg-background">Overzicht</TabsTrigger>
            </TabsList>
          </nav>

          <TabsContent value="day" className="mt-0">
            <TrackingDayIntelligence quotes={quotes} history={history} />
          </TabsContent>
          <TabsContent value="hours" className="mt-5">
            <TrackingPeriodOverview history={history} quotes={quotes} mode="period" loading={loading} />
          </TabsContent>
          <TabsContent value="overview" className="mt-5">
            <TrackingPeriodOverview history={history} quotes={quotes} mode="clients" loading={loading} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default function UrenregistratiePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Clock3 className="h-6 w-6 animate-pulse text-muted-foreground" /></div>}>
      <UrenregistratieContent />
    </Suspense>
  );
}
