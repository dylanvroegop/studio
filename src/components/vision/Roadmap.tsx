'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { dependents, newGoal, shiftMonth, type Goal, type Workspace } from '@/lib/vision/model';
import { Choice, Details, grid, NumberField, Panel, Text, Toggle } from './Fields';
import type { Change } from './useVision';

export function Roadmap({ w, change, phases = false }: { w: Workspace; change: Change; phases?: boolean }) {
  const [opened, setOpened] = useState(''),
    [error, setError] = useState('');
  const goals = w.goals.filter((g) => !phases || g.phase);
  const edit = (id: string, patch: Partial<Goal>) => {
    setError('');
    change((v) => ({ ...v, goals: v.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  };
  function shift(id: string, n: number) {
    const affected = dependents(w.goals, id);
    change((v) => ({
      ...v,
      goals: v.goals.map((g) =>
        affected.has(g.id) ? { ...g, start: shiftMonth(g.start, n), end: shiftMonth(g.end, n) } : g,
      ),
    }));
  }
  return (
    <Panel
      title={phases ? 'Mijn levensfasen' : 'Doelen en mijlpalen'}
      aside={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const g = { ...newGoal(), phase: phases };
            change((v) => ({ ...v, goals: [...v.goals, g] }));
            setOpened(g.id);
          }}
        >
          Toevoegen
        </Button>
      }
    >
      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground">Voeg je eerste {phases ? 'fase' : 'doel'} toe.</p>
      )}
      <ol className="ml-2 space-y-4 border-l border-border pl-4">
        {goals.map((g) => (
          <li key={g.id} className="relative min-w-0">
            <span
              className={
                'absolute -left-[21px] top-3 h-2 w-2 rounded-full ' +
                (g.status === 'actief' ? 'bg-emerald-400' : 'bg-muted-foreground')
              }
            />
            <button
              type="button"
              onClick={() => setOpened(opened === g.id ? '' : g.id)}
              aria-expanded={opened === g.id}
              className="w-full rounded-md p-1 text-left hover:bg-muted/40"
            >
              <span className="flex flex-wrap justify-between gap-x-2">
                <strong className="text-sm">{g.title || 'Naamloos doel'}</strong>
                <small>
                  {g.status} · {g.progress}%
                </small>
              </span>
              <span className="block text-xs text-muted-foreground">
                {[g.start, g.end].filter(Boolean).join(' – ') ||
                  g.dependencies
                    .map((id) => 'Na ' + (w.goals.find((x) => x.id === id)?.title ?? 'doel'))
                    .join(', ') ||
                  'Datum open'}
              </span>
              <progress
                aria-label={'Voortgang ' + g.title}
                value={g.progress}
                max={100}
                className="h-1 w-full accent-emerald-500"
              />
            </button>
            {opened === g.id && (
              <div className="mt-2 space-y-3 rounded-lg border p-3">
                <Text label="Naam" value={g.title} onChange={(title) => edit(g.id, { title })} />
                <Text
                  label="Beschrijving"
                  area
                  value={g.description}
                  onChange={(description) => edit(g.id, { description })}
                />
                <div className={grid}>
                  <Text
                    label="Categorie"
                    value={g.category}
                    onChange={(category) => edit(g.id, { category })}
                  />
                  <Choice
                    label="Prioriteit"
                    value={g.priority}
                    options={['laag', 'normaal', 'hoog']}
                    onChange={(v) => edit(g.id, { priority: v as Goal['priority'] })}
                  />
                  <Text
                    label="Startdatum"
                    type="date"
                    value={g.start}
                    onChange={(start) => {
                      if (g.end && start > g.end) {
                        setError('De start valt na de streefdatum. Pas eerst de streefdatum aan.');
                        return;
                      }
                      edit(g.id, { start });
                    }}
                  />
                  <Text
                    label="Streefdatum"
                    type="date"
                    value={g.end}
                    onChange={(end) => {
                      if (end && end < g.start) {
                        setError('Kies een streefdatum op of na de start.');
                        return;
                      }
                      edit(g.id, { end });
                    }}
                  />
                  <Choice
                    label="Status"
                    options={['gepland', 'actief', 'afgerond', 'gepauzeerd']}
                    value={g.status}
                    onChange={(v) =>
                      edit(g.id, {
                        status: v as Goal['status'],
                        ...(v === 'afgerond' ? { progress: 100 } : {}),
                      })
                    }
                  />
                  <NumberField
                    label="Voortgang (%)"
                    value={g.progress}
                    max={100}
                    slider={100}
                    step={1}
                    onChange={(v) => edit(g.id, { progress: v ?? 0 })}
                  />
                </div>
                <Text
                  label="Persoonlijke betekenis"
                  value={g.meaning}
                  area
                  onChange={(meaning) => edit(g.id, { meaning })}
                />
                <Text
                  label="Concrete volgende stap"
                  area
                  value={g.next}
                  onChange={(next) => edit(g.id, { next })}
                />
                <Details title="Afhankelijkheden, notities en financiële impact">
                  <Toggle
                    label="Toon als fase op Overview"
                    value={g.phase}
                    onChange={(phase) => edit(g.id, { phase })}
                  />
                  <Text label="Notities" area value={g.notes} onChange={(notes) => edit(g.id, { notes })} />
                  <NumberField
                    label="Optionele financiële impact (€)"
                    min={-1e9}
                    value={g.impact}
                    onChange={(impact) => edit(g.id, { impact })}
                  />
                  <p className="text-xs text-muted-foreground">Dit doel volgt op</p>
                  {w.goals
                    .filter((x) => !dependents(w.goals, g.id).has(x.id))
                    .map((x) => (
                      <Toggle
                        key={x.id}
                        label={x.title}
                        value={g.dependencies.includes(x.id)}
                        onChange={(b) =>
                          edit(g.id, {
                            dependencies: b
                              ? [...g.dependencies, x.id]
                              : g.dependencies.filter((id) => id !== x.id),
                          })
                        }
                      />
                    ))}
                </Details>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => shift(g.id, -1)}>
                    Plan −1 maand
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => shift(g.id, 1)}>
                    Plan +1 maand
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Verschuift de datums van dit doel en alle afhankelijke doelen.
                </p>
                {g.end && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const affected = dependents(w.goals, g.id);
                      change((v) => ({
                        ...v,
                        goals: v.goals.map((x) =>
                          x.id === g.id
                            ? { ...x, end: shiftMonth(x.end, 1) }
                            : affected.has(x.id)
                              ? { ...x, start: shiftMonth(x.start, 1), end: shiftMonth(x.end, 1) }
                              : x,
                        ),
                      }));
                    }}
                  >
                    Een maand verlengen en vervolg meeschuiven
                  </Button>
                )}
                {error && <p role="alert">{error}</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
