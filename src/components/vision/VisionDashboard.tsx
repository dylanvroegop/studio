'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Compass, Map, Wallet, Heart, Network, BookOpen } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { readKostenAccount } from '@/lib/kosten-list-client';
import { bankTotal, euro, noFinance, project, type Finances } from '@/lib/vision/projection';
import { today } from '@/lib/vision/model';
import { useVision, request, download, readKostenCash } from '@/components/vision/useVision';
import { Freedom, runwayLabel, Sprinter } from '@/components/vision/Freedom';
import { Metric, Panel, Text } from '@/components/vision/Fields';
import { NoteArchive } from '@/components/vision/Notes';
import { Roadmap } from '@/components/vision/Roadmap';
import { Insights } from '@/components/vision/Insights';
import { Backup } from '@/components/vision/Backup';

const tabs = [
  ['overview', 'Overview', Compass],
  ['freedom', 'Freedom Calculator', Wallet],
  ['roadmap', 'Roadmap', Map],
  ['relationships', 'Relationships', Heart],
  ['mastery', 'Mastery & Purpose', BookOpen],
  ['insights', 'Insights & AI', Network],
] as const;
type Tab = (typeof tabs)[number][0];
export function VisionDashboard({ user }: { user: User }) {
  const { w, change, flush, status, error, conflict, load } = useVision(user);
  const [tab, setTab] = useState<Tab>('overview'),
    [focus, setFocus] = useState(''),
    [f, setFinance] = useState(noFinance),
    [loading, setLoading] = useState(true);
  const requestId = useRef<symbol | null>(null);
  const refresh = useCallback(async () => {
    const i = Symbol();
    requestId.current = i;
    setLoading(true);
    try {
      const data = await request<Finances>(user, '/finance', {
        headers: { 'X-Knab-Kosten-Iban': readKostenAccount(user.uid) },
      });
      if (i === requestId.current) setFinance(data);
    } catch {
      if (i === requestId.current) setFinance({ ...noFinance(), errors: ['Financiële bronnen'] });
    } finally {
      if (i === requestId.current) setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, 300000);
    return () => {
      requestId.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  useEffect(() => {
    const read = () => {
      const target = location.hash.slice(1);
      setTab(tabs.find((t) => t[0] === target)?.[0] ?? 'overview');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
  };
  const p = w ? project(w, f) : null,
    phase = w?.goals.find((g) => g.phase && g.status === 'actief');
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Vision" />
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-4 px-3 pb-16 pt-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Vision</h1>
          <span className="text-xs text-muted-foreground" role="status">
            {status}
          </span>
        </div>
        <nav
          aria-label="Vision"
          className="grid grid-cols-2 gap-1 rounded-xl border bg-card p-1 sm:grid-cols-3 xl:grid-cols-6"
        >
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => go(id)}
              className={
                'flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium sm:text-sm ' +
                (tab === id
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        {error && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-500 p-3 text-sm">
            <p>{error}</p>
            {conflict && w ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      'vision-lokaal-' + today() + '.json',
                      JSON.stringify(w, null, 2),
                      'application/json',
                    )
                  }
                >
                  Lokale kopie downloaden
                </Button>
                <Button onClick={() => void load(true)}>Serverversie laden</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => (w ? void flush() : void load())}>
                Opnieuw proberen
              </Button>
            )}
          </div>
        )}
        {w && (
          <div className="space-y-4">
            {tab === 'overview' && (
              <>
                <Panel
                  title={phase?.title ?? 'Huidige levensfase'}
                  aside={
                    <Button size="sm" onClick={() => go('mastery')}>
                      Inzicht vastleggen
                    </Button>
                  }
                >
                  <p className="text-sm">{phase?.description ?? 'Kies een actieve fase op de roadmap.'}</p>
                  {phase?.next && (
                    <p className="text-sm text-muted-foreground">Volgende stap · {phase.next}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <Metric
                      name="Knab-saldo"
                      value={loading ? 'Laden…' : euro(bankTotal(f) ?? w.manual.bank)}
                      detail={bankTotal(f) !== null ? 'Werkelijk · Knab' : 'Handmatige invoer'}
                    />
                    <Metric name="Vrij bij vertrek" value={euro(p?.freeAtDeparture)} detail="Projectie" />
                    <Metric name="Reisrunway" value={runwayLabel(p)} detail="Projectie" />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => go('freedom')}>
                    Open Freedom Calculator
                  </Button>
                </Panel>
                <Roadmap w={w} change={change} phases />
                <Sprinter w={w} change={change} />
              </>
            )}
            {tab === 'freedom' && (
              <Freedom
                w={w}
                change={change}
                f={f}
                kostenCash={readKostenCash(user.uid)}
                refresh={() => void refresh()}
                loading={loading}
              />
            )}
            {tab === 'roadmap' && <Roadmap w={w} change={change} />}
            {tab === 'relationships' && (
              <>
                <Panel title="Verbinding en compatibiliteit">
                  {(
                    [
                      ['vision', 'De verbinding die ik zoek'],
                      ['values', 'Waarden en eigenschappen'],
                      ['boundaries', 'Mijn grenzen en afwegingen'],
                      ['places', 'Waar ik mensen kan ontmoeten'],
                    ] as const
                  ).map(([k, label]) => (
                    <Text
                      area
                      key={k}
                      label={label}
                      value={w.relationships[k]}
                      onChange={(v) =>
                        change((o) => ({ ...o, relationships: { ...o.relationships, [k]: v } }))
                      }
                    />
                  ))}
                </Panel>
                <NoteArchive w={w} change={change} relationship focus={focus} onFocus={setFocus} />
                <Insights user={user} w={w} change={change} flush={flush} relationship />
              </>
            )}
            {tab === 'mastery' && <NoteArchive w={w} change={change} focus={focus} onFocus={setFocus} />}
            {tab === 'insights' && <Insights user={user} w={w} change={change} flush={flush} />}
            <Backup w={w} change={change} />
          </div>
        )}
      </main>
    </div>
  );
}
