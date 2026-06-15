import type { WorkDescriptionStructured } from '@/lib/quote-calculations';

const NOTE_STOP_WORDS = new Set([
  'aan', 'als', 'bij', 'dan', 'dat', 'de', 'een', 'en', 'eventueel', 'het', 'iets',
  'in', 'met', 'naar', 'of', 'om', 'op', 'te', 'ter', 'van', 'voor', 'wat',
]);

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

function getSignificantTokens(value: string): string[] {
  return normalizeForComparison(value)
    .split(/\s+/)
    .filter((token) => (
      /\d/.test(token)
      || (token.length >= 4 && !NOTE_STOP_WORDS.has(token))
    ));
}

function isHeading(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  if (/^#+\s+/.test(normalized)) return true;
  return !normalized || normalized === 'maatwerk' || normalized.startsWith('notitieblok');
}

function isMeasurementContinuation(line: string): boolean {
  const words = line.trim().split(/\s+/);
  if (words.length > 5 || !/\d/.test(line)) return false;
  return !/(aanbrengen|afwerken|aansluiten|controleren|demonteren|herstellen|leiden|maken|monteren|opnieuw|plaatsen|terugleggen|vernieuwen|vervangen|zetten)/i.test(line);
}

export function extractRequiredNoteRequirements(notesContext: unknown): string[] {
  if (typeof notesContext !== 'string' || !notesContext.trim()) return [];

  const requirements: string[] = [];
  for (const rawLine of notesContext.split(/\r?\n/)) {
    if (isHeading(rawLine)) continue;
    const line = rawLine.replace(/^[-*•]\s*/, '').replace(/^#+\s*/, '').trim();
    if (/^maatwerk:\s*$/i.test(line)) continue;

    if (isMeasurementContinuation(line) && requirements.length > 0) {
      requirements[requirements.length - 1] = `${requirements[requirements.length - 1]}; ${line}`;
    } else {
      requirements.push(line);
    }
  }

  return requirements.filter((line) => getSignificantTokens(line).length > 0);
}

export function isNoteRequirementCovered(requirement: string, generatedText: string): boolean {
  const generated = normalizeForComparison(generatedText);
  const tokens = getSignificantTokens(requirement);
  if (tokens.length === 0) return true;

  const numericTokens = tokens.filter((token) => /\d/.test(token));
  const wordTokens = tokens.filter((token) => !/\d/.test(token));
  const matchingNumbers = numericTokens.filter((token) => generated.includes(token));
  const matchingWords = wordTokens.filter((token) => generated.includes(token));

  if (numericTokens.length > 0 && matchingNumbers.length === 0) return false;
  if (wordTokens.length === 0) return matchingNumbers.length === numericTokens.length;

  return matchingWords.length / wordTokens.length >= 0.6;
}

function formatDimensions(value: string): string {
  return value
    .replace(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm\b/gi, '$1 x $2 cm')
    .replace(/(\d+(?:[.,]\d+)?)\s*m\b/gi, '$1 m')
    .replace(/(\d+(?:[.,]\d+)?)\s*cm\b/gi, '$1 cm');
}

function removeUncertainLanguage(value: string): string {
  return value
    .replace(/\s+of\s+eventueel\s+iets\s+anders\b/gi, '')
    .replace(/\s+of\s+een\s+alternatief\b/gi, '')
    .replace(/\b(eventueel|mogelijk|wellicht|indien nodig|in overleg)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function formatRequiredNoteStep(requirement: string): string {
  const cleaned = removeUncertainLanguage(
    formatDimensions(requirement.replace(/\s*;\s*/g, '; ').trim()),
  );

  const postMatch = cleaned.match(/^paal vervangen\s+(\d+(?:[.,]\d+)?)\s*m\s+lang\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*cm$/i);
  if (postMatch) {
    return `Vervangen van een paal van ${postMatch[1]} m lang met een doorsnede van ${postMatch[2]} x ${postMatch[3]} cm.`;
  }

  if (/^in\s+beton\s*poer\s+zetten/i.test(cleaned)) {
    return 'Plaatsen van de paal in een betonpoer.';
  }

  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function enforceRequiredNoteCoverage(
  generated: WorkDescriptionStructured,
  notesContext: unknown,
  shouldExclude: (value: string) => boolean = () => false,
): WorkDescriptionStructured {
  const requirements = extractRequiredNoteRequirements(notesContext)
    .filter((requirement) => !shouldExclude(requirement));
  if (requirements.length === 0) return generated;

  const generatedText = [
    generated.title,
    generated.summary,
    ...generated.work_scope,
    ...generated.materials,
    ...generated.dimensions,
    ...generated.included,
    ...generated.excluded,
    ...generated.jobs.flatMap((job) => [
      job.title,
      job.summary,
      ...job.work_scope,
      ...job.materials,
      ...job.dimensions,
      ...job.included,
      ...job.excluded,
    ]),
  ].join('\n');
  const missingSteps = requirements
    .filter((requirement) => !isNoteRequirementCovered(requirement, generatedText))
    .map(formatRequiredNoteStep);

  if (missingSteps.length === 0) return generated;

  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, generated.jobs.length - 1)));
  if (generated.jobs.length === 0) {
    return {
      ...generated,
      work_scope: [...generated.work_scope, ...missingSteps],
    };
  }

  const jobs = generated.jobs.map((job, index) => (
    index === activeIndex
      ? {
          ...job,
          work_scope: [...job.work_scope, ...missingSteps],
        }
      : job
  ));

  return {
    ...generated,
    jobs,
    activeJobIndex: activeIndex,
    work_scope: jobs[activeIndex].work_scope,
    legacyNotes: jobs[activeIndex].legacyNotes,
  };
}
