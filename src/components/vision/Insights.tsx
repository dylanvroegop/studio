'use client';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { questions } from '@/lib/vision/evidence';
import { uid, type Report, type Workspace } from '@/lib/vision/model';
import { dateLabel } from './Notes';
import { Details, Field, grid, inputClass, Panel, Text, Toggle } from './Fields';
import { request, type Change } from './useVision';

export function Insights({
  user,
  w,
  change,
  flush,
  relationship = false,
}: {
  user: User;
  w: Workspace;
  change: Change;
  flush: () => Promise<boolean>;
  relationship?: boolean;
}) {
  const [waiting, setWaiting] = useState(false),
    [error, setError] = useState(''),
    [open, setOpen] = useState(''),
    [theme, setTheme] = useState('');
  const [thread, setThread] = useState(
    () => w.reports.filter((r) => r.mode === 'chat').at(-1)?.thread || uid(),
  );
  const c = w.consent;
  const run = async (mode: string) => {
    if (waiting) return;
    setError('');
    setWaiting(true);
    try {
      if (!(await flush())) throw Error('Sla je bronkeuzes eerst op.');
      const question = mode === 'chat' ? w.chatDraft.trim() : questions[mode];
      const { report } = await request<{ report: Report }>(user, '/ai', {
        method: 'POST',
        body: JSON.stringify({ mode, question, thread: mode === 'chat' ? thread : '' }),
      });
      change((v) => ({
        ...v,
        reports: [...v.reports, report],
        chatDraft: mode === 'chat' && v.chatDraft === question ? '' : v.chatDraft,
      }));
      setOpen(report.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWaiting(false);
    }
  };
  const entries = w.notes
    .flatMap((n) => n.versions.map((v) => ({ note: n.id, ...v })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const themes = [...new Set(entries.flatMap((e) => [e.category, ...e.tags]).filter(Boolean))];
  const reports = w.reports
    .filter((r) => (relationship ? r.mode === 'relationship' : true))
    .slice()
    .reverse();
  function renderReport(r: Report) {
    return (
      <article key={r.id} className="space-y-2 rounded-lg border p-3">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setOpen(open === r.id ? '' : r.id)}
          aria-expanded={open === r.id}
        >
          <small className="block text-muted-foreground">{dateLabel(r.at)}</small>
          <strong className="text-sm">{r.question}</strong>
        </button>
        {(open === r.id || (r.mode === 'chat' && r.thread === thread)) && (
          <>
            <small className="text-muted-foreground">{r.coverage}</small>
            {r.findings.map((f, i) => (
              <section key={i} className="border-l-2 border-emerald-500/50 pl-3">
                <span className="text-xs text-muted-foreground">
                  {f.kind} · {f.theme}
                </span>
                <p className="whitespace-pre-wrap break-words text-sm">{f.text}</p>
                {f.refs.map((key) => {
                  const source = r.sources.find((s) => s.key === key),
                    version = w.notes
                      .find((n) => n.id === source?.note)
                      ?.versions.find((v) => v.id === source?.version);
                  return (
                    source && (
                      <details key={key} className="my-1 text-xs">
                        <summary className="cursor-pointer text-emerald-500">
                          {source.title} · {dateLabel(source.date)}
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap rounded-md border p-2">
                          {version?.body ?? 'Bronversie ontbreekt in deze back-up.'}
                        </p>
                      </details>
                    )
                  );
                })}
              </section>
            ))}
            <Text
              label="Mijn correctie op deze interpretatie"
              area
              value={r.correction}
              onChange={(correction) =>
                change((v) => ({
                  ...v,
                  reports: v.reports.map((x) => (x.id === r.id ? { ...x, correction } : x)),
                }))
              }
            />
          </>
        )}
      </article>
    );
  }
  return (
    <div className="space-y-4">
      <Panel title="Toestemming voor AI">
        <Toggle
          label="AI toestaan binnen Vision"
          value={c.enabled}
          onChange={(enabled) => change((v) => ({ ...v, consent: { ...v.consent, enabled } }))}
        />
        {c.enabled && (
          <>
            <p className="text-xs text-muted-foreground">
              Alleen bij het starten van een analyse of bericht gaan de geselecteerde bronnen naar de
              AI-dienst. Notities hebben ook afzonderlijke toestemming nodig.
            </p>
            <div className={grid}>
              {(
                [
                  ['notes', 'Vrijgegeven notities en versies'],
                  ['goals', 'Roadmap en doelen'],
                  ['finance', 'Financiën en scenario'],
                  ['relationships', 'Relatieprofiel'],
                ] as const
              ).map(([k, label]) => (
                <Toggle
                  key={k}
                  label={label}
                  value={c[k]}
                  onChange={(b) => change((v) => ({ ...v, consent: { ...v.consent, [k]: b } }))}
                />
              ))}
            </div>
          </>
        )}
      </Panel>
      <Panel title={relationship ? 'Mijn verwachtingen onderzoeken' : 'Analyses en samenvattingen'}>
        <div className={grid}>
          {Object.entries(questions)
            .filter(([k]) => (relationship ? k === 'relationship' : k !== 'relationship'))
            .map(([k, label]) => (
              <Button
                className="h-auto min-h-10 whitespace-normal text-left"
                key={k}
                variant="outline"
                disabled={!c.enabled || waiting || (relationship ? !c.relationships : !c.notes)}
                onClick={() => void run(k)}
              >
                {label}
              </Button>
            ))}
        </div>
        {waiting && <p role="status">Analyse loopt…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </Panel>
      {!relationship && (
        <>
          <Panel title="Evolutie van een thema">
            <Field label="Thema op de tijdlijn">
              <select value={theme} className={inputClass} onChange={(e) => setTheme(e.target.value)}>
                <option value="">Alle thema’s</option>
                {themes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div className="max-h-80 space-y-2 overflow-auto border-l-2 pl-3">
              {entries
                .filter((v) => !theme || v.category === theme || v.tags.includes(theme))
                .map((v) => (
                  <details key={v.id} className="text-sm">
                    <summary className="cursor-pointer">
                      {dateLabel(v.at)} · {v.title}
                    </summary>
                    <p className="whitespace-pre-wrap">{v.body}</p>
                    {v.reason && <small>{v.reason}</small>}
                  </details>
                ))}
              {!entries.length && <p className="text-xs">De tijdlijn begint bij je eerste inzicht.</p>}
            </div>
          </Panel>
          <Panel
            title="Gesprekspartner"
            aside={
              <Button size="sm" variant="outline" onClick={() => setThread(uid())}>
                Nieuw gesprek
              </Button>
            }
          >
            {w.reports.filter((r) => r.mode === 'chat' && r.thread === thread).map(renderReport)}
            <Text
              label="Je vraag"
              area
              max={4000}
              value={w.chatDraft}
              onChange={(chatDraft) => change((v) => ({ ...v, chatDraft }))}
            />
            <Button disabled={waiting || !c.enabled || !w.chatDraft.trim()} onClick={() => void run('chat')}>
              Versturen
            </Button>
          </Panel>
        </>
      )}
      <Details title={'Opgeslagen analyses en gesprekken · ' + reports.length}>
        {reports.map((r) => (
          <div className="space-y-1" key={r.id}>
            {renderReport(r)}
            {r.mode === 'chat' && r.thread !== thread && (
              <Button variant="link" size="sm" onClick={() => setThread(r.thread)}>
                Dit gesprek hervatten
              </Button>
            )}
          </div>
        ))}
      </Details>
    </div>
  );
}
