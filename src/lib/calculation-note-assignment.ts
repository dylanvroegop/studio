import type { MeasurementField } from '@/lib/job-registry';

export interface CalculationMeasurementAssignment {
  label: string;
  line: string;
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
    const height = getFieldValue(item, heightField);
    const thickness = getFieldValue(item, thicknessField);
    const extras = fields
      .filter((field) => field.type === 'number' && !primaryKeys.has(field.key))
      .map((field) => {
        const value = getFieldValue(item, field);
        return value ? `${field.label} ${value}` : '';
      })
      .filter(Boolean);

    if (!length && !width && !height && !thickness && extras.length === 0) return [];

    const baseLabel = `${itemLabel || 'Onderdeel'} ${index + 1}`;
    const label = extras.length > 0 ? `${baseLabel} (${extras.join('; ')})` : baseLabel;
    const dimensions = [
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
    }];
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
      existingMeasurementIdentities.add(normalizeMeasurementLineIdentity(trimmed));
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
