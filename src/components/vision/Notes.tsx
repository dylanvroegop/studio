'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { blankEntry, latest, uid, type Entry, type Workspace, type Note } from '@/lib/vision/model';
import { Choice, Details, grid, Panel, Text, Toggle } from './Fields';
import type { Change } from './useVision';
export const dateLabel = (at: string) =>
  new Date(at).toLocaleString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export function NoteArchive({
  w,
  change,
  relationship = false,
  focus,
  onFocus,
}: {
  w: Workspace;
  change: Change;
  relationship?: boolean;
  focus: string;
  onFocus: (id: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [tag, setTag] = useState(''),
    [message, setMessage] = useState('');
  const d = w.draft,
    editing = w.notes.find((n) => n.id === d.noteId);
  const set = (patch: Partial<typeof d>) => change((v) => ({ ...v, draft: { ...v.draft, ...patch } }));
  const notes = w.notes
    .filter((n) => !relationship || latest(n).category === 'Relaties')
    .slice()
    .reverse();
  const filtered = notes.filter((n) => {
    const v = latest(n);
    return (
      (!tag || v.tags.includes(tag)) &&
      [v.title, v.body, ...v.tags].join(' ').toLowerCase().includes(search.toLowerCase())
    );
  });
  const open = (id: string) => {
    onFocus(id);
    setTimeout(() => document.getElementById('vision-note-' + id)?.scrollIntoView({ block: 'nearest' }), 40);
  };
  const edit = (n: Note, follow: boolean) => {
    if (d.body.trim() || d.title.trim()) {
      setMessage('Rond eerst je huidige concept af of maak het leeg.');
      return;
    }
    const v = latest(n);
    set(
      follow
        ? { ...blankEntry(), category: v.category, links: [n.id], noteId: null, ai: false }
        : { ...v, reason: '', noteId: n.id, ai: n.ai },
    );
    document.getElementById('vision-capture')?.scrollIntoView({ block: 'start' });
    setMessage('');
  };
  const save = () => {
    if (!d.body.trim()) return;
    const at = new Date().toISOString(),
      noteId = d.noteId ?? uid();
    const v = {
      ...blankEntry(),
      title: d.title.trim() || d.body.trim().split('\n')[0].slice(0, 80),
      body: d.body.trim(),
      category: relationship && !editing ? 'Relaties' : d.category,
      tags: [...new Set(d.tags.map((x) => x.trim()).filter(Boolean))],
      links: d.links,
      emotion: d.emotion,
      importance: d.importance,
      reason: d.reason,
      id: uid(),
      at,
    };
    change((o) => ({
      ...o,
      notes: editing
        ? o.notes.map((n) => (n.id === noteId ? { ...n, ai: d.ai, versions: [...n.versions, v] } : n))
        : [...o.notes, { id: noteId, created: at, ai: d.ai, versions: [v] }],
      draft: { ...blankEntry(), noteId: null, ai: false },
    }));
    setMessage(editing ? 'Nieuwe versie toegevoegd.' : 'Inzicht toegevoegd.');
    onFocus(noteId);
  };
  return (
    <div className="space-y-4">
      <div id="vision-capture">
        <Panel
          title={
            editing
              ? 'Vervolgversie schrijven'
              : relationship
                ? 'Ontmoeting of relatie-inzicht'
                : 'Snel een inzicht vastleggen'
          }
        >
          <Text label="Wat viel je op?" area value={d.body} onChange={(body) => set({ body })} />
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!d.body.trim()} onClick={save}>
              {editing ? 'Versie vastleggen' : 'Inzicht vastleggen'}
            </Button>
            <small className="text-muted-foreground">Concept wordt automatisch bewaard.</small>
          </div>
          <Details title="Titel, context en verbindingen">
            <Text
              label="Titel (anders de eerste regel)"
              value={d.title}
              onChange={(title) => set({ title })}
            />
            <div className={grid}>
              <Text
                label="Categorie"
                value={relationship && !editing ? 'Relaties' : d.category}
                onChange={(category) => set({ category })}
              />
              <Text
                label="Tags, gescheiden door komma’s"
                value={d.tags.join(',')}
                onChange={(v) => set({ tags: v.split(',').slice(0, 40) })}
              />
              <Text label="Emotionele context" value={d.emotion} onChange={(emotion) => set({ emotion })} />
              <Choice
                label="Belangrijkheid"
                value={d.importance}
                options={['laag', 'normaal', 'hoog']}
                onChange={(v) => set({ importance: v as Entry['importance'] })}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {w.themes.map(
                (t, i) =>
                  t.trim() && (
                    <button
                      type="button"
                      aria-pressed={d.tags.includes(t.trim())}
                      key={i}
                      className={
                        'rounded border px-2 py-1 text-xs ' +
                        (d.tags.includes(t.trim()) ? 'bg-emerald-500/20' : '')
                      }
                      onClick={() =>
                        set({
                          tags: d.tags.includes(t.trim())
                            ? d.tags.filter((x) => x !== t.trim())
                            : [...d.tags, t.trim()],
                        })
                      }
                    >
                      {t.trim()}
                    </button>
                  ),
              )}
            </div>
            {editing && (
              <Text
                label="Waarom veranderde je inzicht?"
                value={d.reason}
                onChange={(reason) => set({ reason })}
              />
            )}
            <Toggle
              label="Deze notitie en haar versies vrijgeven voor AI"
              value={d.ai}
              onChange={(ai) => set({ ai })}
            />
            {w.notes
              .filter((n) => n.id !== d.noteId)
              .map((n) => (
                <Toggle
                  key={n.id}
                  label={'Koppelen aan ' + latest(n).title}
                  value={d.links.includes(n.id)}
                  onChange={(b) =>
                    set({ links: b ? [...d.links, n.id] : d.links.filter((id) => id !== n.id) })
                  }
                />
              ))}
            {(d.body || d.title || d.noteId) && (
              <Button
                variant="outline"
                onClick={() => change((v) => ({ ...v, draft: { ...blankEntry(), noteId: null, ai: false } }))}
              >
                Concept leegmaken
              </Button>
            )}
          </Details>
          {message && (
            <p className="text-xs" role="status">
              {message}
            </p>
          )}
        </Panel>
      </div>
      {!relationship && (
        <ThemeMap
          w={w}
          change={change}
          select={setTag}
          open={(id) => {
            setTag('');
            setSearch('');
            open(id);
          }}
        />
      )}
      <Panel title={relationship ? 'Ervaringen en wat ik leer' : 'Inzichtenarchief'}>
        <Text label="Zoeken in inzichten" value={search} onChange={setSearch} />
        {tag && (
          <Button size="sm" variant="outline" onClick={() => setTag('')}>
            Themafilter wissen · {tag}
          </Button>
        )}
        {!filtered.length && (
          <p className="text-sm text-muted-foreground">
            {w.notes.length ? 'Geen inzichten voor dit filter.' : 'Je eerste inzicht verschijnt hier.'}
          </p>
        )}
        {filtered.map((n) => {
          const v = latest(n);
          return (
            <article id={'vision-note-' + n.id} key={n.id} className="rounded-lg border p-3">
              <button
                className="w-full text-left"
                onClick={() => onFocus(focus === n.id ? '' : n.id)}
                aria-expanded={focus === n.id}
              >
                <strong className="text-sm">{v.title}</strong>
                <span className="block text-xs text-muted-foreground">
                  {dateLabel(n.created)} · {v.category} · {n.versions.length}{' '}
                  {n.versions.length === 1 ? 'versie' : 'versies'}
                </span>
              </button>
              {focus === n.id && (
                <div className="mt-3 space-y-3">
                  <p className="whitespace-pre-wrap break-words text-sm">{v.body}</p>
                  <small>{[...v.tags, v.emotion, v.importance].filter(Boolean).join(' · ')}</small>
                  <div className="flex flex-wrap gap-2">
                    {v.links.map((id) => (
                      <Button
                        key={id}
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setTag('');
                          setSearch('');
                          open(id);
                        }}
                      >
                        {w.notes.find((n) => n.id === id)?.versions.at(-1)?.title}
                      </Button>
                    ))}
                  </div>
                  <Toggle
                    label="Beschikbaar voor AI"
                    value={n.ai}
                    onChange={(ai) =>
                      change((o) => ({ ...o, notes: o.notes.map((x) => (x.id === n.id ? { ...x, ai } : x)) }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => edit(n, false)}>
                      Nieuwe versie
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => edit(n, true)}>
                      Vervolgnotitie
                    </Button>
                  </div>
                  <Details title="Oorspronkelijke versie en wijzigingen">
                    {n.versions.map((ver, i) => (
                      <div key={ver.id} id={'vision-version-' + ver.id} className="border-l-2 pl-3 text-sm">
                        <small>
                          {i === 0 ? 'Oorspronkelijk' : 'Versie ' + (i + 1)} · {dateLabel(ver.at)}
                        </small>
                        <h4 className="font-medium">{ver.title}</h4>
                        <p className="whitespace-pre-wrap">{ver.body}</p>
                        <small>
                          {[ver.category, ver.emotion, ver.importance, ...ver.tags]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {ver.reason && <p>Reden · {ver.reason}</p>}
                      </div>
                    ))}
                  </Details>
                </div>
              )}
            </article>
          );
        })}
      </Panel>
    </div>
  );
}
function ThemeMap({
  w,
  change,
  select,
  open,
}: {
  w: Workspace;
  change: Change;
  select: (s: string) => void;
  open: (id: string) => void;
}) {
  const counts = new Map<string, number>();
  w.notes.forEach((n) => new Set(latest(n).tags).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const edges = w.notes.flatMap((n) =>
    latest(n).links.map((id) => ({ n, target: w.notes.find((x) => x.id === id) })),
  );
  const linked = [...new Set(edges.flatMap((e) => (e.target ? [e.n, e.target] : [])))].slice(-12);
  const points = new Map(
    linked.map((n, i) => {
      const angle = (i / linked.length) * 2 * Math.PI - Math.PI / 2;
      return [n.id, { x: 160 + 108 * Math.cos(angle), y: 100 + 70 * Math.sin(angle) }];
    }),
  );
  return (
    <Details title={'Thema’s en verbindingen · ' + counts.size + ' tags'}>
      <div className="flex flex-wrap gap-2">
        {[...counts]
          .sort((a, b) => b[1] - a[1])
          .map(([t, count]) => (
            <Button key={t} variant="outline" size="sm" onClick={() => select(t)}>
              {t} · {count}
            </Button>
          ))}
      </div>
      <Text
        label="Mijn onderzoeksthema’s, gescheiden door komma’s"
        value={w.themes.join(',')}
        max={3000}
        onChange={(v) => change((o) => ({ ...o, themes: v.split(',').slice(0, 150) }))}
      />
      {linked.length > 0 && (
        <svg
          className="mx-auto max-h-64 w-full"
          viewBox="0 0 320 200"
          aria-label="Netwerk van maximaal twaalf verbonden inzichten"
          role="group"
        >
          {edges.map((e) => {
            const a = points.get(e.n.id),
              b = e.target && points.get(e.target.id);
            return (
              a &&
              b && (
                <line
                  key={e.n.id + e.target!.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  opacity=".35"
                />
              )
            );
          })}
          {linked.map((n) => {
            const pt = points.get(n.id)!;
            return (
              <g
                key={n.id}
                transform={'translate(' + pt.x + ' ' + pt.y + ')'}
                role="button"
                tabIndex={0}
                aria-label={latest(n).title}
                onClick={() => open(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open(n.id);
                  }
                }}
                className="cursor-pointer"
              >
                <title>{latest(n).title}</title>
                <circle r="13" fill="transparent" />
                <circle r="6" fill="#34d399" />
                <text y="16" textAnchor="middle" fontSize="8" fill="currentColor">
                  {latest(n).title.slice(0, 17)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {edges.length > 0 ? (
        <ul className="space-y-1">
          {edges.map(
            ({ n, target }) =>
              target && (
                <li
                  key={n.id + target.id}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border p-2 text-xs"
                >
                  <button onClick={() => open(n.id)}>{latest(n).title}</button>
                  <span>⟶</span>
                  <button onClick={() => open(target.id)}>{latest(target).title}</button>
                </li>
              ),
          )}
        </ul>
      ) : (
        <p className="text-xs">Koppelingen verschijnen zodra je inzichten verbindt.</p>
      )}
    </Details>
  );
}
