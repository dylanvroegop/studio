import { shiftMonth, type Workspace, type Report } from './model';
export const questions: Record<string, string> = {
  week: 'Analyseer deze week',
  month: 'Analyseer deze maand',
  quarter: 'Vergelijk de afgelopen drie maanden',
  themes: 'Welke thema’s keren steeds terug?',
  change: 'Welke overtuigingen zijn veranderd?',
  single: 'Welke ideeën heb ik slechts één keer genoemd?',
  tensions: 'Welke tegenstrijdigheden zitten in mijn gedachten?',
  stable: 'Welke inzichten lijken stabiel over langere tijd?',
  relationship: 'Welke partnervoorkeuren zijn waarden en welke kunnen beperkende aannames zijn?',
};
export function evidence(w: Workspace, mode: string, day: string) {
  const start = new Date(day + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const since =
    mode === 'week'
      ? start.toISOString().slice(0, 10)
      : mode === 'month'
        ? day.slice(0, 7) + '-01'
        : mode === 'quarter'
          ? shiftMonth(day, -3)
          : '';
  const all =
    w.consent.enabled && w.consent.notes
      ? w.notes
          .filter((n) => n.ai)
          .flatMap((n) =>
            n.versions.flatMap((v) => {
              const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(
                new Date(v.at),
              );
              if (date < since || date > day || (mode === 'relationship' && v.category !== 'Relaties'))
                return [];
              return [
                {
                  note: n.id,
                  version: v.id,
                  date: v.at,
                  title: v.title,
                  body: v.body,
                  tags: v.tags,
                  emotion: v.emotion,
                  reason: v.reason,
                },
              ];
            }),
          )
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
  const byTag = new Map<string, { notes: Set<string>; first: string; last: string }>();
  for (const v of all)
    for (const tag of new Set(v.tags)) {
      const row = byTag.get(tag) ?? { notes: new Set<string>(), first: v.date, last: v.date };
      row.notes.add(v.note);
      row.last = v.date;
      byTag.set(tag, row);
    }
  const tagCounts = [...byTag]
    .map(([tag, r]) => ({ tag, notities: r.notes.size, eerste: r.first, laatste: r.last }))
    .sort((a, b) => b.notities - a.notities)
    .slice(0, 100);
  const count = Math.min(80, all.length);
  const sample = Array.from(
    { length: count },
    (_, i) => all[count === 1 ? 0 : Math.round((i * (all.length - 1)) / (count - 1))],
  );
  const sources: Report['sources'] = sample.map((v, i) => ({
    key: 'N' + (i + 1),
    note: v.note,
    version: v.version,
    date: v.date,
    title: v.title,
  }));
  return {
    sources,
    tagCounts,
    passages: sample.map((v, i) => ({
      key: sources[i].key,
      date: v.date,
      title: v.title,
      text: v.body.slice(0, 2400),
      tags: v.tags,
      context: v.emotion,
      reason: v.reason,
    })),
    coverage:
      count +
      ' van ' +
      all.length +
      ' toegestane notitieversies' +
      (since ? ' vanaf ' + since : '') +
      ' · maximaal 2.400 tekens per versie',
  };
}
