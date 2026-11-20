import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const short = z.string().max(250);
const prose = z.string().max(24000);
const amount = z.number().finite().min(0).max(1e9);
const percent = z.number().min(0).max(100);
const month = z.number().int().min(0).max(12);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
const optionalDay = day.or(z.literal(''));
const time = z.string().datetime();
const preset = z.enum(['conservatief', 'realistisch', 'optimistisch']);
export const scenarioSchema = z.object({
  start: day,
  months: month,
  revenue: amount,
  price: amount,
  extras: amount,
  travel: amount,
  buffer: amount,
  annual: month,
  buy: z.boolean(),
  work: z.boolean(),
  invest: z.boolean(),
  repeat: z.boolean(),
  collect: z.boolean(),
  inflation: z.boolean(),
  rate: percent,
  mode: preset,
  lower: percent,
  upper: percent,
  lag: z.number().int().min(0).max(12),
  operating: amount.nullable(),
  workLiving: amount.nullable(),
  lease: amount.nullable(),
  ownership: amount.nullable(),
  taxRate: percent.nullable(),
  vatRate: percent.nullable(),
  billMonth: z.number().int().min(0).max(24),
  items: z.array(z.object({ id, name: short, amount })).max(200),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const manualSchema = z.object({
  bank: z.number().finite().min(-1e9).max(1e9).nullable(),
  cash: amount.nullable(),
  vat: amount.nullable(),
  tax: amount.nullable(),
  debt: amount.nullable(),
  bills: amount.nullable(),
  invoices: amount.nullable(),
  invoiceDate: optionalDay,
  roles: z.record(id, z.enum(['zakelijk', 'privé', 'onbekend'])),
  confirmed: z.record(id, day),
  receiptChecks: z.record(id, z.string().max(4000)).default({}),
  invoiceAmounts: z.record(id, amount).default({}),
  history: z.record(id, z.number().finite().min(-1e9).max(1e9)),
});
export const goalSchema = z.object({
  id,
  title: short,
  description: prose,
  category: short,
  priority: z.enum(['laag', 'normaal', 'hoog']),
  start: optionalDay,
  end: optionalDay,
  progress: percent,
  status: z.enum(['gepland', 'actief', 'afgerond', 'gepauzeerd']),
  dependencies: z.array(id).max(100),
  meaning: prose,
  next: prose,
  notes: prose,
  impact: z.number().finite().nullable(),
  phase: z.boolean(),
});
export type Goal = z.infer<typeof goalSchema>;
export const entrySchema = z.object({
  title: short,
  body: prose,
  category: short,
  tags: z.array(short).max(40),
  emotion: short,
  importance: z.enum(['laag', 'normaal', 'hoog']),
  links: z.array(id).max(150),
  reason: short,
});
export type Entry = z.infer<typeof entrySchema>;
const versionSchema = entrySchema.extend({ id, at: time });
export const noteSchema = z.object({
  id,
  created: time,
  ai: z.boolean(),
  versions: z.array(versionSchema).min(1),
});
export type Note = z.infer<typeof noteSchema>;
export const findingSchema = z.object({
  kind: z.enum(['Feit', 'Aanname', 'Interpretatie', 'Onzekerheid']),
  theme: short,
  text: z.string().min(1).max(5000),
  refs: z.array(id).max(30),
});
export const reportSchema = z.object({
  id,
  at: time,
  question: z.string().min(1).max(4000),
  mode: short,
  findings: z.array(findingSchema).max(50),
  sources: z.array(z.object({ key: id, note: id, version: id, date: time, title: short })),
  correction: prose,
  thread: short,
  scope: short,
  coverage: short,
});
export type Report = z.infer<typeof reportSchema>;
export const consentSchema = z.object({
  enabled: z.boolean(),
  notes: z.boolean(),
  goals: z.boolean(),
  finance: z.boolean(),
  relationships: z.boolean(),
});
export const workspaceSchema = z.object({
  format: z.literal(1),
  scenario: scenarioSchema,
  manual: manualSchema,
  alternatives: z
    .array(z.object({ id, name: short, scenario: scenarioSchema }))
    .max(20)
    .default([]),
  goals: z.array(goalSchema),
  relationships: z.object({ vision: prose, values: prose, boundaries: prose, places: prose }),
  themes: z.array(short).max(150),
  notes: z.array(noteSchema),
  reports: z.array(reportSchema),
  consent: consentSchema,
  draft: entrySchema.extend({ noteId: id.nullable(), ai: z.boolean() }),
  chatDraft: z.string().max(4000),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const uid = () => crypto.randomUUID();
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
export const blankEntry = (): Entry => ({
  title: '',
  body: '',
  category: 'Mastery',
  tags: [],
  emotion: '',
  importance: 'normaal',
  links: [],
  reason: '',
});
export function newGoal(): Goal {
  return {
    id: uid(),
    title: 'Nieuw doel',
    description: '',
    category: 'Persoonlijk',
    priority: 'normaal',
    start: '',
    end: '',
    progress: 0,
    status: 'gepland',
    dependencies: [],
    meaning: '',
    next: '',
    notes: '',
    impact: null,
    phase: false,
  };
}
export function emptyWorkspace(): Workspace {
  return {
    format: 1,
    alternatives: [],
    scenario: {
      start: today(),
      months: 2,
      revenue: 15000,
      price: 25000,
      extras: 1000,
      travel: 1000,
      buffer: 10000,
      annual: 3,
      buy: true,
      work: true,
      invest: true,
      repeat: false,
      collect: false,
      inflation: false,
      rate: 2,
      mode: 'realistisch',
      lower: 20,
      upper: 20,
      lag: 0,
      operating: null,
      workLiving: null,
      lease: null,
      ownership: null,
      taxRate: null,
      vatRate: null,
      billMonth: 1,
      items: [],
    },
    manual: {
      bank: null,
      cash: null,
      vat: null,
      tax: null,
      debt: null,
      bills: null,
      invoices: null,
      invoiceDate: '',
      roles: {},
      confirmed: {},
      receiptChecks: {},
      invoiceAmounts: {},
      history: {},
    },
    relationships: { vision: '', values: '', boundaries: '', places: '' },
    themes: [],
    goals: [],
    notes: [],
    reports: [],
    consent: { enabled: false, notes: false, goals: false, finance: false, relationships: false },
    draft: { ...blankEntry(), noteId: null, ai: false },
    chatDraft: '',
  };
}
export const latest = (n: Note) => n.versions[n.versions.length - 1];
export function shiftMonth(date: string, months: number): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last), 12)).toISOString().slice(0, 10);
}
export function dependents(goals: Goal[], root: string): Set<string> {
  const found = new Set([root]);
  for (let i = 0; i < goals.length; i++) {
    const before = found.size;
    goals.forEach((g) => {
      if (g.dependencies.some((d) => found.has(d))) found.add(g.id);
    });
    if (before === found.size) break;
  }
  return found;
}
export function validWorkspace(w: Workspace): boolean {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  const goals = new Set(w.goals.map((g) => g.id)),
    notes = new Set(w.notes.map((n) => n.id));
  return (
    unique(w.goals.map((g) => g.id)) &&
    unique(w.notes.map((n) => n.id)) &&
    unique(w.reports.map((r) => r.id)) &&
    w.goals.every(
      (g) =>
        (!g.end || !g.start || g.end >= g.start) &&
        g.dependencies.every((d) => goals.has(d) && !dependents(w.goals, g.id).has(d)),
    ) &&
    w.notes.every(
      (n) =>
        unique(n.versions.map((v) => v.id)) &&
        n.versions.every((v) => v.links.every((k) => notes.has(k) && k !== n.id)),
    )
  );
}
export function retainsHistory(before: Workspace, after: Workspace): boolean {
  const notes = new Map(after.notes.map((n) => [n.id, n]));
  return before.notes.every((old) => {
    const n = notes.get(old.id);
    return (
      n &&
      n.created === old.created &&
      old.versions.every((v, i) => JSON.stringify(v) === JSON.stringify(n.versions[i]))
    );
  });
}
export function toMarkdown(w: Workspace): string {
  const sections = [
    '# Vision',
    '## Roadmap',
    ...w.goals.map(
      (g) =>
        '### ' +
        g.title +
        '\n' +
        Object.entries(g)
          .filter(([k]) => !['id', 'title'].includes(k))
          .map(([k, v]) => k + ' · ' + v)
          .join('\n'),
    ),
    '## Relationships',
    ...Object.values(w.relationships),
    '## Thema’s',
    w.themes.join(', '),
    '## Inzichten',
    ...w.notes.map((n) =>
      n.versions
        .map(
          (v, i) =>
            '### ' +
            v.title +
            ' · v' +
            (i + 1) +
            '\n' +
            v.at +
            ' · ' +
            v.category +
            ' · ' +
            v.tags.join(', ') +
            '\n' +
            v.body +
            '\n' +
            v.reason +
            '\nVerbindingen · ' +
            v.links.join(', '),
        )
        .join('\n\n'),
    ),
    '## Analyses en gesprekken',
    ...w.reports.map(
      (r) =>
        '### ' +
        r.question +
        '\n' +
        r.at +
        '\n' +
        r.findings.map((f) => f.kind + ' · ' + f.text + ' ' + f.refs.join(', ')).join('\n') +
        '\n' +
        r.sources.map((s) => s.key + ' · ' + s.title + ' · ' + s.date).join('\n') +
        '\n' +
        r.correction,
    ),
    '## Scenario en invoer',
    '```json',
    JSON.stringify({ scenario: w.scenario, alternatives: w.alternatives, manual: w.manual }, null, 2),
    '```',
  ];
  return sections.join('\n\n');
}
