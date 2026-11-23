import { z } from 'zod';
import { MELDCODE_APPLICATION_OPTIONS, type MeldcodeApplication } from '@/lib/meldcode-context';
import { normalizeDataJson, normalizeWerkbeschrijving, unwrapRoot } from '@/lib/quote-calculations';
import type { InvoiceType } from '@/lib/types';
import type { UserSettings } from '@/lib/types-settings';

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const clean = (value: unknown, limit = 240): string => text(value).replace(/\s+/g, ' ').slice(0, limit);
const decimal = /^\d+(?:[,.]\d{1,3})?$/;
const positive = (value: string): boolean => decimal.test(value) && Number(value.replace(',', '.')) > 0;
const measureNumber = z.string().trim().max(16).refine((value) => !value || positive(value));
const invoiceDate = z.string().trim().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});

export const subsidyMeasureSchema = z.object({
  material: z.string().trim().max(240),
  application: z.string().trim().max(120),
  code: z.string().trim().toUpperCase().refine((value) => !value || /^KA\d{5}$/.test(value)),
  area: measureNumber,
  plannedArea: measureNumber,
  thickness: measureNumber,
  insulationValue: measureNumber,
  purchaseDate: invoiceDate,
  installationDate: invoiceDate,
  amount: z.string().trim().max(16).refine((value) => !value || (/^\d+(?:[,.]\d{1,2})?$/.test(value) && positive(value))),
  excludedWork: z.string().trim().max(240),
});

export const invoiceSubsidySchema = z.array(subsidyMeasureSchema).min(1).max(20);
export type SubsidyMeasure = z.infer<typeof subsidyMeasureSchema>;
const applicationPatterns: [MeldcodeApplication, RegExp][] = [
  ['dakisolatie', /\bdakisolatie\b|\bdak\s+isoleren\b|\bisoleren van (?:het )?dak\b/i],
  ['zolder-vliering', /\b(?:zolder|vliering)(?:vloer)?isolatie\b|\b(?:zolder|vliering)vloer\s+isoleren\b/i],
  ['vloerisolatie', /\bvloerisolatie\b|\bvloer\s+isoleren\b/i],
  ['gevelisolatie', /\bgevelisolatie\b|\bgevel\s+isoleren\b/i],
  ['spouwmuurisolatie', /\bspouw(?:muur)?isolatie\b|\bspouw(?:muur)?\s+isoleren\b/i],
];
const glazing = /\b(?:hr\+{1,3}(?!\+)|triple[ -]?glas|vacu[uü]mglas|warmtewerend glas|glasisolatie)/i;
const thermalMaterial = /\b(?:pir|eps|xps|glaswol|steenwol|rockwool|enertherm|kooltherm|isovlas|isobooster|unidek|isolatieplaat\w*|isolatiedeken\w*|isolatiepakket\w*)\b/i;
const isoCode = /\bKA\d{5}\b/i;
const applicationLabel = (value: MeldcodeApplication | undefined): string =>
  value === 'vloerisolatie' ? 'Vloerisolatie' : MELDCODE_APPLICATION_OPTIONS.find((option) => option.value === value)?.label || '';

export function emptySubsidyMeasure(): SubsidyMeasure {
  return {
    material: '', application: '', code: '', area: '', plannedArea: '', thickness: '', insulationValue: '',
    purchaseDate: '', installationDate: '', amount: '', excludedWork: '',
  };
}

function getApplications(context: string): MeldcodeApplication[] {
  return applicationPatterns.filter(([, pattern]) => pattern.test(context)).map(([value]) => value);
}

export function isSubsidyGlazing(measure: Pick<SubsidyMeasure, 'application' | 'material'>): boolean {
  return glazing.test(measure.application) || glazing.test(measure.material) || /^glas$/i.test(measure.application);
}

export function suggestInvoiceSubsidy(quote: Record<string, unknown>, calculation: unknown): {
  context: string;
  measures: SubsidyMeasure[];
} {
  const source = calculation ?? quote.calculationSnapshot ?? quote.data_json ?? quote;
  const raw = unwrapRoot(source);
  const data = normalizeDataJson(source);
  const jobs = data.werkbeschrijving_structured?.jobs;
  const context = [
    clean(quote.titel || quote.title), clean(quote.werkomschrijving), clean(data?.korteTitel), clean(data?.korteBeschrijving),
    ...normalizeWerkbeschrijving(raw?.werkbeschrijving).map((line) => clean(line)),
    ...normalizeWerkbeschrijving(data.werkbeschrijving).map((line) => clean(line)),
    ...(Array.isArray(jobs) ? jobs.flatMap((job) => [
      clean(job?.title), clean(job?.summary),
      ...(Array.isArray(job?.work_scope) ? job.work_scope.map((line: unknown) => clean(line)) : []),
      ...(Array.isArray(job?.dimensions) ? job.dimensions.map((line: unknown) => clean(line)) : []),
    ]) : []),
  ].filter(Boolean).join('\n').slice(0, 4000);
  const applications = getApplications(context);
  const measureCaption = applications.length === 1 ? applicationLabel(applications[0]) : glazing.test(context) ? 'Glasisolatie' : '';
  const appliedArea = /(?:werkelijk aangebracht|aangebracht in bestaande woning)\s*[:=]?\s*(\d+(?:[,.]\d{1,3})?)\s*m(?:²|2)(?!\d)/i;
  const plannedArea = /(?:gepland in bestaande woning|te isoleren oppervlak)\s*[:=]?\s*(\d+(?:[,.]\d{1,3})?)\s*m(?:²|2)(?!\d)/i;
  const referencedArea = (value: string, label: RegExp): string => {
    const matches = [...new Set(Array.from(value.matchAll(new RegExp(label.source, 'gi')), (match) => match[1].replace('.', ',')))];
    return matches.length === 1 && positive(matches[0]) ? matches[0] : '';
  };
  const explicitlyAcoustic = !measureCaption && !/\bISDE\b/i.test(context)
    && /geluidsisolatie|akoestische isolatie|akoestiek/i.test(context);
  const materials = [...(data?.grootmaterialen ?? []), ...(data?.verbruiksartikelen ?? [])];
  const rows = new Map<string, SubsidyMeasure>();

  for (const row of materials) {
    const material = clean(row.product);
    const storedCode = text(row.meldcode).toUpperCase();
    const explicit = MELDCODE_APPLICATION_OPTIONS.find(({ value }) => value !== 'onbekend' && value === (row.meldcode_toepassing ?? row.meldcodeToepassing))?.value;
    const coded = isoCode.test(storedCode) || isoCode.test(material);
    if (!material || (!coded && !glazing.test(material) && (!thermalMaterial.test(material) || explicitlyAcoustic))) continue;
    const ownApplications = getApplications(material);
    const application = explicit ?? (ownApplications.length === 1 ? ownApplications[0] : ownApplications.length === 0 && applications.length === 1 ? applications[0] : undefined);
    const thicknesses = [...material.matchAll(/(\d+(?:[,.]\d+)?)\s*mm\b/gi)];
    // Bij plaatmaten is een losse mm-waarde alleen bruikbaar als de dimensies geen dikteambiguïteit geven.
    const thickness = thicknesses.length === 1 && !/\d\s*[x×]\s*\d/i.test(material) ? thicknesses[0][1] : '';
    const glass = glazing.test(material);
    const insulationValue = material.match(glass ? /\bUg\s*[:=]?\s*(\d+(?:[,.]\d+)?)/i : /\bRd\s*[:=]?\s*(\d+(?:[,.]\d+)?)/i)?.[1] || '';
    const measure = {
      ...emptySubsidyMeasure(), material, application: glass ? 'Glasisolatie' : applicationLabel(application),
      code: /^KA\d{5}$/.test(storedCode) && row.meldcode_status !== 'unresolved'
        ? storedCode : (material.match(isoCode)?.[0]?.toUpperCase() || ''),
      thickness: glass ? '' : thickness,
      insulationValue,
      area: referencedArea(material, appliedArea),
      plannedArea: referencedArea(material, plannedArea),
    };
    const key = [material.toLowerCase(), measure.application, measure.code].join('|');
    rows.set(key, measure);
  }

  if (rows.size === 0 && (measureCaption || applications.length || /\bISDE\b/i.test(context))) {
    rows.set('', { ...emptySubsidyMeasure(), application: measureCaption });
  }
  const measures = [...rows.values()].slice(0, 20);
  if (measures.length === 1 && applications.length <= 1) {
    const measure = measures[0];
    measure.area ||= referencedArea(context, appliedArea);
    measure.plannedArea ||= referencedArea(context, plannedArea);
  }
  return { context, measures };
}

export type SubsidyField = keyof SubsidyMeasure;
export interface SubsidyQuestion { index: number; field: SubsidyField; label: string; question: string }

export function subsidyFields(measure: SubsidyMeasure, type: InvoiceType): Omit<SubsidyQuestion, 'index'>[] {
  const glass = isSubsidyGlazing(measure);
  const fields: Omit<SubsidyQuestion, 'index'>[] = [
    { field: 'application', label: 'Maatregel', question: 'Waar is dit materiaal toegepast, bijvoorbeeld op het dak, in de gevel of als glasisolatie?' },
    { field: 'material', label: 'Merk en producttype', question: 'Welk merk en exact producttype staan op de verpakking of materiaalbon?' },
    { field: 'code', label: 'RVO-meldcode', question: 'Welke RVO-meldcode hoort bij dit product en deze toepassing?' },
    { field: type === 'eind' ? 'area' : 'plannedArea', label: type === 'eind' ? 'Aangebracht in bestaande woning (m²)' : 'Gepland voor bestaande woning (m²)', question: type === 'eind'
      ? 'Hoeveel vierkante meter is daadwerkelijk in de bestaande woning aangebracht, exclusief eventuele uitbreiding?'
      : 'Hoeveel vierkante meter staat gepland in de bestaande woning, exclusief eventuele uitbreiding?' },
    { field: 'insulationValue', label: glass ? 'Ug-waarde (W/m²K)' : 'Rd-waarde (m²K/W)', question: glass
      ? 'Wat is de Ug-waarde van het glas volgens de glasstaat of leverancier?' : 'Wat is de Rd-waarde bij de gebruikte dikte volgens het productblad?' },
  ];
  if (!glass) fields.splice(4, 0, { field: 'thickness', label: 'Dikte (mm)', question: 'Welke materiaaldikte in millimeters is voor deze maatregel gebruikt?' });
  if (type === 'eind') fields.push(
    { field: 'purchaseDate', label: 'Aanschafdatum', question: 'Op welke datum is dit product aangeschaft?' },
    { field: 'installationDate', label: 'Installatiedatum', question: 'Op welke datum is deze maatregel uitgevoerd?' },
    { field: 'amount', label: 'Bedrag maatregel incl. btw (€)', question: 'Welk bedrag inclusief btw hoort op de factuur specifiek bij deze maatregel?' },
  );
  fields.push({ field: 'excludedWork', label: 'Uitbreiding of overige werkzaamheden (indien van toepassing)', question: '' });
  return fields;
}

export function getSubsidyQuestions(measures: SubsidyMeasure[], type: InvoiceType): SubsidyQuestion[] {
  return measures.flatMap((measure, index) => subsidyFields(measure, type)
    .filter(({ field, question }) => question && (!measure[field] || !subsidyMeasureSchema.shape[field].safeParse(measure[field]).success))
    .map((field) => ({ index, ...field })));
}

export function formatInvoiceSubsidy(measures: SubsidyMeasure[], type: InvoiceType, settings: UserSettings): string {
  const visibleFields = (measure: SubsidyMeasure) => subsidyFields(measure, type).filter(({ field }) => measure[field]);
  const date = (value: string) => value.split('-').reverse().join('-');
  const currency = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const formatValue = (field: SubsidyField, value: string): string => {
    if (field === 'purchaseDate' || field === 'installationDate') return date(value);
    if (field === 'amount') return currency.format(Number(value.replace(',', '.')));
    return value;
  };
  const blocks = measures.map((measure) => visibleFields(measure).map(({ field, label }) =>
    `${label.replace(/ \(€\)$/, '')}: ${formatValue(field, measure[field])}`).join('\n')).filter(Boolean);
  if (!blocks.length) return '';
  const contact = [clean(settings.contactNaam), clean(settings.telefoon)].filter(Boolean).join(' · ');
  return [
    type === 'voorschot' ? 'ISDE – geplande werkzaamheden' : 'ISDE – uitgevoerde werkzaamheden',
    ...blocks,
    ...(contact ? [`Contact uitvoerend bedrijf: ${contact}`] : []),
  ].join('\n\n');
}
