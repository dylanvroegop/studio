import type { MeasurementField } from './job-registry';
import { NOTE_SHAPE_FIELDS, NOTE_SHAPES, parseNoteShape } from './note-surfaces';

export interface ImportDimension {
  key: string;
  label: string;
  value: string;
}

export interface NoteImportRow {
  id: string;
  title: string;
  source: string;
  dimensions: ImportDimension[];
  shape?: string;
  sectionTitle?: string;
}

export interface NoteImportChoice {
  target: string;
  fields: Record<string, string>;
}

export interface NoteImportSource {
  sectionTitle: string;
  title: string;
  lines: string[];
}

export interface NoteImportPatch {
  target: string;
  values: Record<string, string>;
  source?: NoteImportSource;
}

export const SKIP_NOTE_MEASUREMENT = '__skip__';
const dimensionLabels: Record<string, string> = {
  lengte: 'Lengte', breedte: 'Breedte', hoogte: 'Hoogte', dikte: 'Dikte',
  lengte_onderzijde: 'Lengte onderzijde', ...NOTE_SHAPE_FIELDS,
};
const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Lees per bronregel; gelijke lengtes en lege velden mogen de koppeling niet verschuiven. */
export function parseNoteImportRows(content: string, sectionTitle?: string): NoteImportRow[] {
  const labels = Object.values(dimensionLabels).sort((a, b) => b.length - a.length).join('|');
  const rows: NoteImportRow[] = [];
  let continuation: NoteImportRow | undefined;
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim()) { continuation = undefined; continue; }
    const matcher = new RegExp(`(?:^|[|;=]|[-*•]\\s*)\\s*(${labels})\\s*[:=]\\s*([^|;]*)`, 'gi');
    const dimensions: ImportDimension[] = [];
    let firstIndex = -1;
    for (const match of line.matchAll(matcher)) {
      if (firstIndex < 0) firstIndex = match.index ?? 0;
      const numeric = match[2].trim().match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/i);
      if (!numeric) continue;
      const factor = numeric[2]?.toLowerCase() === 'm' ? 1000 : numeric[2]?.toLowerCase() === 'cm' ? 10 : 1;
      const value = Number(numeric[1].replace(',', '.')) * factor;
      if (!Number.isFinite(value)) continue;
      const key = Object.keys(dimensionLabels).find(key => normalize(dimensionLabels[key]) === normalize(match[1]))!;
      dimensions.push({ key, label: dimensionLabels[key], value: String(Number(value.toFixed(6))) });
    }
    if (!dimensions.length) { continuation = undefined; continue; }
    const title = line.slice(0, Math.max(0, firstIndex)).replace(/^\s*[-*•]\s*/, '').split('=')[0].trim();
    const shape = parseNoteShape(line.slice(line.indexOf('=') + 1)).shape;
    const canContinue = !title && !/^\s*[-*•]/.test(line) && continuation
      && dimensions.every(value => !continuation!.dimensions.some(previous => previous.key === value.key));
    if (canContinue && continuation) {
      continuation.dimensions.push(...dimensions);
      continuation.source += `\n${line.trim()}`;
    } else {
      const row: NoteImportRow = {
        id: `row-${rows.length}`, title: title || `Maatregel ${rows.length + 1}`,
        source: line.trim(), dimensions,
        ...(sectionTitle !== undefined ? { sectionTitle } : {}),
        ...(shape && shape in NOTE_SHAPES ? { shape } : {}),
      };
      rows.push(row);
      continuation = row;
    }
  }
  return rows;
}

export function noteImportFields(fields: MeasurementField[]): MeasurementField[] {
  const targets = fields.filter(field => field.type === 'number' && (field.suffix === 'mm' || field.key in dimensionLabels));
  // De calculatie toont deze vormvelden dynamisch, buiten het register.
  if (fields.some(field => field.key === 'lengte') && fields.some(field => field.key === 'hoogte')) {
    for (const [key, label] of Object.entries(NOTE_SHAPE_FIELDS)) {
      if (!targets.some(field => field.key === key)) targets.push({ key, label, type: 'number', suffix: 'mm' });
    }
  }
  return targets;
}

export function initialNoteImportChoices(rows: NoteImportRow[], fields: MeasurementField[], items: Record<string, unknown>[] = []): Record<string, NoteImportChoice> {
  return Object.fromEntries(rows.map(row => [row.id, {
    target: (() => {
      const matches = items.flatMap((item, index) => {
        const source = item.noteImportSource as NoteImportSource | undefined;
        return source && source.sectionTitle === row.sectionTitle && source.lines.some(line => noteMeasurementIdentity(line) === noteMeasurementIdentity(row.source)) ? [index] : [];
      });
      return matches.length === 1 ? `existing:${matches[0]}` : `new:${row.id}`;
    })(),
    fields: Object.fromEntries(row.dimensions.map(value => {
      // Het zichtbare label bepaalt de betekenis: "breedte" is niet automatisch
      // "hoogte voorzijde" of "breedte onderzijde".
      const matches = fields.filter(field => normalize(field.label) === normalize(value.label));
      return [value.key, matches.length === 1 ? matches[0].key : ''];
    })),
  }]));
}

export function buildNoteImportPatches(
  rows: NoteImportRow[], choices: Record<string, NoteImportChoice>, fields: MeasurementField[], existingCount: number,
): { patches: NoteImportPatch[]; error: string } {
  const patches = new Map<string, NoteImportPatch>();
  const allowed = new Set(fields.map(field => field.key));
  const newTargets = new Set(rows.map(row => `new:${row.id}`));
  for (const row of rows) {
    const choice = choices[row.id];
    if (choice?.target === SKIP_NOTE_MEASUREMENT) continue;
    if (!choice || (!newTargets.has(choice.target) && !Array.from({ length: existingCount }, (_, i) => `existing:${i}`).includes(choice.target))) {
      return { patches: [], error: `Kies een onderdeel voor ${row.title}.` };
    }
    const patch = patches.get(choice.target) || { target: choice.target, values: {} };
    let usedDimensions = 0;
    let mapsFront = false;
    for (const dimension of row.dimensions) {
      const field = choice.fields[dimension.key];
      if (field === SKIP_NOTE_MEASUREMENT) continue;
      if (!field || !allowed.has(field)) return { patches: [], error: `Kies waar ${dimension.label.toLowerCase()} van ${row.title} hoort, of kies Niet gebruiken.` };
      if (patch.values[field] !== undefined) return { patches: [], error: `Meerdere maten zijn gekoppeld aan ${fields.find(candidate => candidate.key === field)?.label}. Kies een ander veld of onderdeel.` };
      patch.values[field] = dimension.value;
      usedDimensions++;
      if (field === 'lengte' || field === 'hoogte') mapsFront = true;
    }
    if (usedDimensions > 0) {
      const shape = fields.some(field => field.key === 'lengte_onderzijde') && !mapsFront ? undefined : row.shape;
      if (shape && patch.values.shape && patch.values.shape !== shape) return { patches: [], error: 'Verschillende vormen horen niet bij hetzelfde onderdeel.' };
      if (shape) patch.values.shape = shape;
      if (row.sectionTitle !== undefined) {
        if (patch.source && patch.source.sectionTitle !== row.sectionTitle) return { patches: [], error: 'Koppel maten uit verschillende notitieblokken aan aparte onderdelen.' };
        patch.source = {
          sectionTitle: row.sectionTitle,
          title: patch.source?.title || row.title,
          lines: [...(patch.source?.lines || []), row.source],
        };
      }
      patches.set(choice.target, patch);
    }
  }
  return { patches: [...patches.values()], error: patches.size ? '' : 'Kies minimaal één maat om over te nemen.' };
}

export function applyNoteImportPatches<T extends Record<string, unknown>>(
  items: T[], patches: NoteImportPatch[], createEmptyItem: () => T, currentRows?: NoteImportRow[],
): T[] {
  const next = [...items];
  for (const patch of patches) {
    let source = patch.source;
    const targetIndex = patch.target.startsWith('existing:') ? Number(patch.target.split(':')[1]) : -1;
    if (source) {
      const previous = items[targetIndex]?.noteImportSource as NoteImportSource | undefined;
      if (previous && previous.sectionTitle !== source.sectionTitle) throw new Error('Dit onderdeel is al aan een ander notitieblok gekoppeld. Kies een apart onderdeel.');
      if (previous) {
        const retainedLines = previous.lines.filter(line => !currentRows || currentRows.some(row => row.sectionTitle === previous.sectionTitle && noteMeasurementIdentity(row.source) === noteMeasurementIdentity(line)));
        source = { ...source, title: previous.title, lines: [...new Map([...retainedLines, ...source.lines].map(line => [noteMeasurementIdentity(line), line])).values()] };
      }
      const identities = new Set(source.lines.map(noteMeasurementIdentity));
      const otherOwner = next.some((item, index) => {
        const other = item.noteImportSource as NoteImportSource | undefined;
        return index !== targetIndex && other?.sectionTitle === source!.sectionTitle && other.lines.some(line => identities.has(noteMeasurementIdentity(line)));
      });
      if (otherOwner) throw new Error('Deze notitiemaat is al gekoppeld. Kies het bestaande onderdeel om de maten bij te werken.');
    }
    if (patch.target.startsWith('existing:')) {
      const index = Number(patch.target.split(':')[1]);
      if (!next[index]) throw new Error('Het gekozen onderdeel bestaat niet meer.');
      next[index] = { ...next[index], ...patch.values, ...(source ? { noteImportSource: source } : {}) };
    } else {
      next.push({ ...createEmptyItem(), ...patch.values, ...(source ? { noteImportSource: source } : {}) });
    }
  }
  return next;
}

/** Vergelijk betekenisvolle maten, ook na de normale opslagopmaak van Notes. */
export function noteMeasurementIdentity(line: string): string {
  const row = parseNoteImportRows(line)[0];
  if (!row) return line.replace(/\s+/g, ' ').trim().toLowerCase();
  return JSON.stringify({
    title: normalize(row.title), shape: row.shape || 'rectangle',
    dimensions: row.dimensions.map(value => [value.key, value.value]).sort(([a], [b]) => a.localeCompare(b)),
  });
}
