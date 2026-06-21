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

function findField(fields: MeasurementField[], keys: string[]): MeasurementField | undefined {
  return fields.find((field) => keys.includes(field.key.toLowerCase()));
}

function getFieldValue(item: Record<string, unknown>, field?: MeasurementField): string {
  if (!field) return '';
  return displayValue(item[field.key], field.suffix || '');
}

export function buildCalculationMeasurementAssignments(
  items: Record<string, unknown>[],
  fields: MeasurementField[],
  itemLabel: string,
): CalculationMeasurementAssignment[] {
  const lengthField = findField(fields, ['lengte', 'length']);
  const widthField = findField(fields, ['breedte', 'width']);
  const thicknessField = findField(fields, ['dikte', 'thickness']);
  const primaryKeys = new Set(
    [lengthField?.key, widthField?.key, thicknessField?.key].filter(Boolean),
  );

  return items.flatMap((item, index) => {
    const length = getFieldValue(item, lengthField);
    const width = getFieldValue(item, widthField);
    const thickness = getFieldValue(item, thicknessField);
    const extras = fields
      .filter((field) => field.type === 'number' && !primaryKeys.has(field.key))
      .map((field) => {
        const value = getFieldValue(item, field);
        return value ? `${field.label} ${value}` : '';
      })
      .filter(Boolean);

    if (!length && !width && !thickness && extras.length === 0) return [];

    const baseLabel = `${itemLabel || 'Onderdeel'} ${index + 1}`;
    const label = extras.length > 0 ? `${baseLabel} (${extras.join('; ')})` : baseLabel;
    const dimensions = [
      length ? `Lengte: ${length}` : '',
      width ? `Breedte: ${width}` : '',
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
  if (!cleanTitle || measurementLines.length === 0) return normalized;

  const lines = normalized ? normalized.split('\n') : [];
  const headingIndex = lines.findIndex((line) => {
    const title = line.match(/^###\s+(.+)$/)?.[1]?.trim();
    return title === cleanTitle;
  });

  if (headingIndex < 0) {
    const block = [`### ${cleanTitle}`, '', '#### Maatwerk', ...measurementLines];
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

  if (maatwerkIndex >= 0) {
    let insertionIndex = sectionEnd;
    for (let index = maatwerkIndex + 1; index < sectionEnd; index += 1) {
      if (/^####\s+/.test(lines[index])) {
        insertionIndex = index;
        break;
      }
    }
    lines.splice(insertionIndex, 0, ...measurementLines);
  } else {
    const prefix = sectionEnd > headingIndex + 1 && lines[sectionEnd - 1]?.trim() ? [''] : [];
    lines.splice(sectionEnd, 0, ...prefix, '#### Maatwerk', ...measurementLines);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
