import { noteMeasurementIdentity, type NoteImportSource } from './note-measurement-import';
import type { MeasurementField } from '@/lib/job-registry';
import { formatNoteShape, noteShapeFields, type NoteMeasurement } from './note-surfaces';

export interface CalculationMeasurementAssignment {
  label: string;
  line: string;
  itemIndex?: number;
  source?: NoteImportSource;
}

const MAATWERK_TITLE_RE = /^#*\s*maatwerk\b/i;

export function getQuoteNoteJobTitles(rawNotes: string): string[] {
  return rawNotes
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.match(/^###\s+(.+)$/)?.[1]?.trim() || '')
    .filter((title) => title.length > 0 && !MAATWERK_TITLE_RE.test(title));
}

function displayValue(value: unknown, suffix = ''): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (!suffix || normalized.toLowerCase().endsWith(suffix.toLowerCase())) return normalized;
  return `${normalized} ${suffix}`;
}

function normalizeFieldName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findField(fields: MeasurementField[], keys: string[], labelPatterns: RegExp[] = []): MeasurementField | undefined {
  return fields.find((field) => {
    const key = normalizeFieldName(field.key);
    const label = normalizeFieldName(field.label || '');
    return keys.includes(key) || labelPatterns.some((pattern) => pattern.test(label));
  });
}

function getFieldValue(item: Record<string, unknown>, field?: MeasurementField): string {
  if (!field) return '';
  return displayValue(item[field.key], field.suffix || '');
}

function normalizeMeasurementLineIdentity(line: string): string {
  return line
    .replace(/^[-*•]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*\|\s*/g, '|')
    .replace(/[.]$/g, '')
    .trim()
    .toLowerCase();
}

function uniqueMeasurementLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const identity = normalizeMeasurementLineIdentity(trimmed);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(trimmed);
  }
  return result;
}

export function buildCalculationMeasurementAssignments(
  items: Record<string, unknown>[],
  fields: MeasurementField[],
  itemLabel: string,
  sourceJobLabel?: string,
): CalculationMeasurementAssignment[] {
  const lengthField = findField(fields, ['lengte', 'length'], [/\blengte\b/, /\blength\b/]);
  const widthField = findField(fields, ['breedte', 'width'], [/\bbreedte\b/, /\bwidth\b/]);
  const heightField = findField(fields, ['hoogte', 'height'], [/\bhoogte\b/, /\bheight\b/]);
  const thicknessField = findField(fields, ['dikte', 'thickness'], [/\bdikte\b/, /\bthickness\b/]);
  const primaryKeys = new Set(
    [lengthField?.key, widthField?.key, heightField?.key, thicknessField?.key].filter(Boolean),
  );

  return items.flatMap((item, index) => {
    const length = getFieldValue(item, lengthField);
    const width = getFieldValue(item, widthField);
    const height = item.shape === 'gable' ? displayValue(item.hoogte, 'mm') : getFieldValue(item, heightField);
    const thickness = getFieldValue(item, thicknessField);
    const extras = fields
      .filter((field) => field.type === 'number' && !primaryKeys.has(field.key))
      .map((field) => {
        const value = getFieldValue(item, field);
        return value ? `${field.label} ${value}` : '';
      })
      .filter(Boolean);

    if (!length && !width && !height && !thickness && extras.length === 0) return [];

    const source = item.noteImportSource as NoteImportSource | undefined;
    const itemTitle = `${itemLabel || 'Onderdeel'} ${index + 1}`;
    const baseLabel = source?.title || (sourceJobLabel ? `${sourceJobLabel} — ${itemTitle}` : itemTitle);
    // Een boeiboord heeft twee onafhankelijke vlakken, met elk een eigen lengte.
    // Exporteer die apart, zodat Notes geen lengte × hoogte óf breedte hoeft te raden.
    if (fields.some(field => field.key === 'lengte_onderzijde')) {
      const number = (value: unknown): number => {
        const parsed = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      };
      const frontLength = number(item.lengte);
      const frontHeight = number(item.hoogte);
      const bottomLength = number(item.lengte_onderzijde);
      const bottomWidth = number(item.breedte);
      const count = item.boeiboord_mirror ? 2 : 1;
      const result: CalculationMeasurementAssignment[] = [];
      for (let copy = 1; copy <= count; copy++) {
        const suffix = count > 1 ? ` ${copy}` : '';
        if (frontLength && frontHeight) {
          const label = `${baseLabel} — Voorzijde${suffix}`;
          const shape = item.shape === 'slope' || item.shape === 'gable'
            ? `Vorm: slope | Hoogte links: 0 mm | Hoogte rechts: ${frontHeight} mm`
            : `Vorm: rectangle | Hoogte: ${frontHeight} mm`;
          result.push({ label, line: `- ${label} = Lengte: ${frontLength} mm | ${shape}`, itemIndex: index, ...(source ? { source } : {}) });
        }
        if (bottomLength && bottomWidth) {
          const label = `${baseLabel} — Onderzijde${suffix}`;
          result.push({ label, line: `- ${label} = Vorm: rectangle | Lengte: ${bottomLength} mm | Breedte: ${bottomWidth} mm`, itemIndex: index, ...(source ? { source } : {}) });
        }
      }
      if (!result.length && source) throw new Error(`Vul voor "${source.title}" minimaal één volledige voorzijde of onderzijde in.`);
      return result;
    }
    const label = extras.length > 0 && !source ? `${baseLabel} (${extras.join('; ')})` : baseLabel;
    const dimensions = [
      formatNoteShape({ ...noteShapeFields(item), shape: String(item.shape || 'rectangle') }),
      length ? `Lengte: ${length}` : '',
      width ? `Breedte: ${width}` : '',
      height ? `Hoogte: ${height}` : '',
      thickness ? `Dikte: ${thickness}` : '',
    ].filter(Boolean);

    // Keep the established note format so the Notes editor and Werk & Levering
    // parser can both read calculation measurements without another data model.
    return [{
      label,
      line: `- ${label} = ${dimensions.join(' | ')}`,
      itemIndex: index,
      ...(source ? { source } : {}),
    }];
  });
}

// Oude automatisch gekopieerde regels missen de vorm. Vul alleen aan bij een
// unieke bronregel met dezelfde titel en ongewijzigde, reeds ingevulde maten.
export function restoreCalculationNoteShapes<T extends NoteMeasurement>(rows: T[], jobs: unknown): T[] {
  if (!jobs || typeof jobs !== 'object') return rows;
  const sources = Object.values(jobs).flatMap((job: any, jobIndex) => {
    const title = job?.maatwerk?.meta?.title;
    if (!title || !Array.isArray(job?.maatwerk?.basis)) return [];
    return job.maatwerk.basis.map((item: Record<string, unknown>, itemIndex: number) => ({
      prefix: `${title} ${jobIndex + 1} — `, index: itemIndex + 1, item,
    }));
  });
  return rows.map(row => {
    if (row.shape) return row;
    const matches = sources.filter(({ prefix, index, item }) => {
      if (!row.title.startsWith(prefix)) return false;
      const itemTitle = row.title.slice(prefix.length).split(' (')[0];
      if (!itemTitle.endsWith(` ${index}`)) return false;
      return ([['length', 'lengte'], ['width', 'breedte'], ['height', 'hoogte'], ['thickness', 'dikte']] as const)
        .every(([noteKey, sourceKey]) => !row[noteKey].trim() || row[noteKey].trim() === String(item[sourceKey] ?? '').trim());
    });
    return matches.length === 1
      ? { ...row, ...noteShapeFields(matches[0].item), shape: String(matches[0].item.shape || 'rectangle') }
      : row;
  });
}

export function assignCalculationMeasurementsToNoteJob(
  rawNotes: string,
  jobTitle: string,
  measurementLines: string[],
): string {
  const normalized = rawNotes.replace(/\r\n/g, '\n').trim();
  const cleanTitle = jobTitle.trim();
  const uniqueIncomingLines = uniqueMeasurementLines(measurementLines);
  if (!cleanTitle || uniqueIncomingLines.length === 0) return normalized;

  const lines = normalized ? normalized.split('\n') : [];
  const headingIndex = lines.findIndex((line) => {
    const title = line.match(/^###\s+(.+)$/)?.[1]?.trim();
    return title === cleanTitle;
  });

  if (headingIndex < 0) {
    const block = [`### ${cleanTitle}`, '', '#### Maatwerk', ...uniqueIncomingLines];
    return [...lines, ...(lines.length > 0 ? [''] : []), ...block].join('\n').trim();
  }

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^###\s+/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }

  let maatwerkIndex = -1;
  for (let index = headingIndex + 1; index < sectionEnd; index += 1) {
    if (/^####\s+maatwerk\b/i.test(lines[index])) {
      maatwerkIndex = index;
      break;
    }
  }

  const existingMeasurementIdentities = new Set<string>();
  if (maatwerkIndex >= 0) {
    for (let index = maatwerkIndex + 1; index < sectionEnd; index += 1) {
      if (/^####\s+/.test(lines[index])) break;
      const trimmed = lines[index].trim();
      if (!trimmed || !/^[-*•]\s*/.test(trimmed)) continue;
      // Verrijk dezelfde oude automatische regel in plaats van de vorm als
      // extra oppervlak toe te voegen. Gewijzigde maten blijven aparte regels.
      if (!/\bVorm:/.test(trimmed)) {
        const upgraded = uniqueIncomingLines.find(incoming => {
          const split = incoming.indexOf('=');
          const legacy = `${incoming.slice(0, split + 1)} ${incoming.slice(split + 1).split('|')
            .filter(part => !/^\s*(?:Vorm|Hoogte (?:links|rechts|top|[123])|Lengte [12]):/i.test(part))
            .map(part => part.trim()).join(' | ')}`;
          return normalizeMeasurementLineIdentity(legacy) === normalizeMeasurementLineIdentity(trimmed);
        });
        if (upgraded) lines[index] = upgraded;
      }
      existingMeasurementIdentities.add(normalizeMeasurementLineIdentity(lines[index]));
    }
  }

  const linesToInsert = uniqueIncomingLines.filter((line) => (
    !existingMeasurementIdentities.has(normalizeMeasurementLineIdentity(line))
  ));
  if (linesToInsert.length === 0) {
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (maatwerkIndex >= 0) {
    let insertionIndex = sectionEnd;
    for (let index = maatwerkIndex + 1; index < sectionEnd; index += 1) {
      if (/^####\s+/.test(lines[index])) {
        insertionIndex = index;
        break;
      }
    }
    lines.splice(insertionIndex, 0, ...linesToInsert);
  } else {
    const prefix = sectionEnd > headingIndex + 1 && lines[sectionEnd - 1]?.trim() ? [''] : [];
    lines.splice(sectionEnd, 0, ...prefix, '#### Maatwerk', ...linesToInsert);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** De herstelkopie blijft apart van de actieve notities en wordt nooit vernieuwd. */
export function importedQuoteNotesUpdate(notesBefore: string, notesAfter: string, privateNotes?: string): { notities: string; privateNotities: string } {
  return { notities: notesAfter, privateNotities: privateNotes ?? notesBefore };
}

/** Alleen expliciet uit het koppelscherm geïmporteerde regels worden vervangen. */
export function syncImportedCalculationMeasurements(
  rawNotes: string,
  assignments: CalculationMeasurementAssignment[],
): { notes: string; sources: Map<number, NoteImportSource> } {
  const sources = new Map<number, NoteImportSource>();
  let lines = rawNotes.replace(/\r\n/g, '\n').split('\n');
  const groups = new Map<number, CalculationMeasurementAssignment[]>();
  for (const assignment of assignments) {
    if (!assignment.source || assignment.itemIndex === undefined) continue;
    groups.set(assignment.itemIndex, [...(groups.get(assignment.itemIndex) || []), assignment]);
  }
  for (const [itemIndex, group] of groups) {
    const source = group[0].source!;
    const headings = lines.flatMap((line, index) => line.match(/^###(?!#)\s*(.*)$/)?.[1]?.trim() === source.sectionTitle ? [index] : []);
    if ((source.sectionTitle && headings.length !== 1) || (!source.sectionTitle && headings.length > 1)) {
      throw new Error(`Notitieblok "${source.sectionTitle}" is gewijzigd. Koppel de maten opnieuw via Maten naar calculatie zetten.`);
    }
    const start = headings[0] ?? -1;
    const nextHeading = lines.findIndex((line, index) => index > start && /^###\s/.test(line));
    const end = nextHeading < 0 ? lines.length : nextHeading;
    const indexes = new Set<number>();
    for (const original of source.lines) {
      const identity = noteMeasurementIdentity(original);
      const lineCount = original.split('\n').length;
      const matches = lines.flatMap((line, index) => index > start && index + lineCount <= end && line.trim()
        && noteMeasurementIdentity(lines.slice(index, index + lineCount).join('\n')) === identity ? [index] : []);
      if (matches.length !== 1 || Array.from({ length: lineCount }, (_, offset) => matches[0] + offset).some(index => indexes.has(index))) {
        throw new Error(`De bronmaat "${source.title}" is gewijzigd of komt dubbel voor. Koppel deze opnieuw via Maten naar calculatie zetten.`);
      }
      for (let offset = 0; offset < lineCount; offset++) indexes.add(matches[0] + offset);
    }
    const first = Math.min(...indexes);
    const replacement = group.map(assignment => assignment.line);
    lines = lines.flatMap((line, index) => index === first ? replacement : indexes.has(index) ? [] : [line]);
    sources.set(itemIndex, { ...source, lines: replacement });
  }
  return { notes: lines.join('\n'), sources };
}
