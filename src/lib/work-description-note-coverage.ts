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
    .replace(/\bweg\s+halen\b/g, 'verwijderen')
    .replace(/\bweghalen\b/g, 'verwijderen')
    .replace(/\bverwijderd?\b/g, 'verwijderen')
    .replace(/\bbestaande\b/g, 'oude')
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
  const requirementNormalized = normalizeForComparison(requirement);
  const generated = normalizeForComparison(generatedText);
  const generatedTokens = new Set(generated.split(/\s+/).filter(Boolean));

  if (
    /golfplaten/.test(requirementNormalized)
    && /(?:verwijderen|oude|golfplaten)/.test(requirementNormalized)
    && generatedTokens.has('golfplaten')
    && (generatedTokens.has('verwijderen') || generatedTokens.has('oude'))
  ) {
    return true;
  }

  if (
    /underlayment/.test(requirementNormalized)
    && /platen?/.test(requirementNormalized)
    && generatedTokens.has('underlayment')
    && (generatedTokens.has('plaat') || generatedTokens.has('platen'))
  ) {
    return true;
  }

  if (
    /\bepdm\b/.test(requirementNormalized)
    && generatedTokens.has('epdm')
    && (/underlayment/.test(requirementNormalized) ? generatedTokens.has('underlayment') : true)
  ) {
    return true;
  }

  if (
    /dakrand/.test(requirementNormalized)
    && /opstaande/.test(requirementNormalized)
    && generatedTokens.has('dakrand')
    && generatedTokens.has('opstaande')
  ) {
    const requiredNumbers = getSignificantTokens(requirement)
      .filter((token) => /\d/.test(token))
      .map((token) => token.replace(/[^0-9.]/g, ''))
      .filter(Boolean);
    return requiredNumbers.every((token) => generated.includes(token));
  }

  if (
    /boeiboorden?/.test(requirementNormalized)
    && generatedTokens.has('boeiboorden')
    && (generated.includes('7016') || generated.includes('antraciet') || generated.includes('anthracite'))
  ) {
    return true;
  }

  const tokens = getSignificantTokens(requirement);
  if (tokens.length === 0) return true;

  const numericTokens = tokens.filter((token) => /\d/.test(token));
  const wordTokens = tokens.filter((token) => !/\d/.test(token));
  const matchingNumbers = numericTokens.filter((token) => generated.includes(token));
  const matchingWords = wordTokens.filter((token) => generatedTokens.has(token));

  if (numericTokens.length > 0 && matchingNumbers.length !== numericTokens.length) return false;
  if (wordTokens.length === 0) return matchingNumbers.length === numericTokens.length;

  return matchingWords.length / wordTokens.length >= 0.6;
}

function extractExplicitTotalFacts(notesContext: unknown): string[] {
  if (typeof notesContext !== 'string' || !notesContext.trim()) return [];

  const facts: string[] = [];
  const pattern = /\b(?:in\s+)?totaal\s*:?[ \t]*(\d+(?:[.,]\d+)?)[ \t]+([^.,;\n]{1,80})/gi;
  for (const match of notesContext.matchAll(pattern)) {
    const amount = match[1]?.trim();
    const subject = match[2]?.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
    if (!amount || !subject) continue;
    facts.push(`In totaal betreft het ${amount} ${subject}.`);
  }

  return Array.from(new Set(facts));
}

function appendTotalFactsToSummary(summary: string, totalFacts: string[]): string {
  if (totalFacts.length === 0) return summary;
  const firstSentence = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)[0] || '';
  return [firstSentence, totalFacts.join(' ')].filter(Boolean).join(' ');
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

function formatMetric(value: string, unit: string): string {
  return `${value.replace('.', ',')} ${unit}`;
}

export function formatRequiredNoteStep(requirement: string): string {
  const cleaned = removeUncertainLanguage(
    formatDimensions(requirement.replace(/\s*;\s*/g, '; ').trim()),
  );

  const fenceMatch = cleaned.match(/^beton\s+schutting\s+plaatsen\s+(\d+(?:[.,]\d+)?)\s*m\s+(\d+(?:[.,]\d+)?)\s*cm\s+hoog\s+met\s+onderband/i);
  if (fenceMatch) {
    return `Plaatsen van een betonnen schutting met een lengte van ${formatMetric(fenceMatch[1], 'm')} en een hoogte van ${formatMetric(fenceMatch[2], 'cm')}, inclusief onderband.`;
  }

  if (/^ombouw\s+airco\s+maken\s+met\s+trespa/i.test(cleaned)) {
    return 'Maken en monteren van een demontabele airco-ombouw van Trespa.';
  }

  if (/compriband/i.test(cleaned) && /dagkant/i.test(cleaned)) {
    return 'Verwijderen en terugplaatsen van de Trespa dagkanten rondom de ramen, inclusief het aanbrengen van nieuw compriband voor een gesloten aansluiting tussen de Keralit gevelbekleding en de dagkanten.';
  }

  if (/schoonmaken|reinigen/i.test(cleaned) && /keralit/i.test(cleaned) && /tape|lijm/i.test(cleaned)) {
    return 'Reinigen van de Keralit gevelbekleding en verwijderen van aanwezige tape- en lijmresten, voor zover dit mogelijk is zonder de gevelbekleding te beschadigen.';
  }

  const pergolaMatch = cleaned.match(/^pergola\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);
  if (pergolaMatch) {
    return `Maken en plaatsen van een Douglas pergola van circa ${formatMetric(pergolaMatch[1], 'm')} x ${formatMetric(pergolaMatch[2], 'm')}, uitgevoerd volgens de opgegeven materiaal- en maatvoeringsspecificaties.`;
  }

  const postMatch = cleaned.match(/^paal vervangen\s+(\d+(?:[.,]\d+)?)\s*m\s+lang\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*cm$/i);
  if (postMatch) {
    return `Vervangen van een paal van ${postMatch[1]} m lang met een doorsnede van ${postMatch[2]} x ${postMatch[3]} cm.`;
  }

  if (/^in\s+beton\s*poer\s+zetten/i.test(cleaned)) {
    return 'Plaatsen van de paal in een betonpoer.';
  }

  if (/golfplaten?/i.test(cleaned) && /(weg\s+halen|verwijderen|oude)/i.test(cleaned)) {
    return 'Verwijderen van oude golfplaten.';
  }

  if (/\bepdm\b/i.test(cleaned) && /(leggen|aanbrengen)/i.test(cleaned)) {
    return /underlayment/i.test(cleaned)
      ? 'Aanbrengen van EPDM op de underlayment.'
      : 'Aanbrengen van EPDM dakbedekking.';
  }

  if (/underlayment/i.test(cleaned) && /(platen?\s+leggen|leggen|aanbrengen)/i.test(cleaned)) {
    return /bestaande\s+platen/i.test(cleaned)
      ? 'Aanbrengen van underlayment platen op de bestaande platen.'
      : 'Aanbrengen van underlayment platen.';
  }

  if (/dakrand/i.test(cleaned) && /opstaande\s+rand/i.test(cleaned)) {
    const heightMatch = cleaned.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
    return `Maken van een dakrand met opstaande rand${heightMatch ? ` van ${heightMatch[1]} mm` : ''}.`;
  }

  if (/boeiboorden?/i.test(cleaned) && /7016|antraciet|anthracite/i.test(cleaned)) {
    return 'Plaatsen van antracietkleurige boeiboorden in RAL 7016.';
  }

  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function repairCopiedNoteBlobs(
  generated: WorkDescriptionStructured,
  notesContext: unknown,
  shouldExclude: (value: string) => boolean = () => false,
): WorkDescriptionStructured {
  void notesContext;
  void shouldExclude;
  // Generated scope is authoritative. Reconstructing it from note fragments caused
  // professional rows to be replaced by raw measurements and shorthand notes.
  return generated;
}

export function enforceRequiredNoteCoverage(
  generated: WorkDescriptionStructured,
  notesContext: unknown,
  shouldExclude: (value: string) => boolean = () => false,
): WorkDescriptionStructured {
  const totalFacts = extractExplicitTotalFacts(notesContext)
    .filter((fact) => !shouldExclude(fact));
  if (totalFacts.length === 0) return generated;

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

  const missingTotalFacts = totalFacts.filter((fact) => !isNoteRequirementCovered(fact, generatedText));
  if (missingTotalFacts.length === 0) return generated;

  const nextSummary = appendTotalFactsToSummary(generated.summary, missingTotalFacts);

  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, generated.jobs.length - 1)));
  if (generated.jobs.length === 0) {
    return {
      ...generated,
      context: nextSummary,
      summary: nextSummary,
    };
  }

  const jobs = generated.jobs.map((job, index) => (
    index === activeIndex
      ? {
          ...job,
          context: appendTotalFactsToSummary(job.summary, missingTotalFacts),
          summary: appendTotalFactsToSummary(job.summary, missingTotalFacts),
        }
      : job
  ));

  return {
    ...generated,
    context: jobs[activeIndex].summary,
    summary: jobs[activeIndex].summary,
    jobs,
    activeJobIndex: activeIndex,
    work_scope: jobs[activeIndex].work_scope,
    legacyNotes: jobs[activeIndex].legacyNotes,
  };
}
