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
  ['dakisolatie', /\bdakisolatie\b|\bdak\s+isoleren\b|\bisoleren van (?:het )?dak\b|\bdak\s*(?:aan de )?(?:binnen|buiten)zijde\b|\b(?:binnenzijde|buitenzijde) (?:van )?(?:het )?dak\b|\bdak(?:zijden?|vlakken?)\b/i],
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

export function subsidyQuoteNotes(quote: Record<string, unknown>): string {
  return [quote.notities, quote.privateNotities].map((value) => text(value).split(/\r?\n/)
    .map((line) => line.replace(/https?:\/\/\S+/gi, '').trim()).filter(Boolean).join('\n'))
    .filter(Boolean).join('\n').slice(0, 6000);
}

export function subsidyApplicationLabel(application: MeldcodeApplication, evidence: string): string {
  const label = applicationLabel(application);
  if (application !== 'dakisolatie') return label;
  const sides = evidence.match(/\b(\d+|één|een|twee|drie|vier|beide)\s+dak(?:zijden?|vlakken?)\b/i)?.[1]?.toLowerCase();
  const inside = /\bdak\s*(?:aan de )?binnenzijde\b|\bbinnenzijde (?:van )?(?:het )?dak\b/i.test(evidence);
  const outside = /\bdak\s*(?:aan de )?buitenzijde\b|\bbuitenzijde (?:van )?(?:het )?dak\b/i.test(evidence);
  const details = [inside !== outside ? inside ? 'binnenzijde' : 'buitenzijde' : '', sides ? `${sides} dak${sides === '1' || sides === 'één' || sides === 'een' ? 'zijde' : 'zijden'}` : ''].filter(Boolean);
  return details.length ? `${label} – ${details.join(', ')}` : label;
}

const plateDimensions = /\b(\d+(?:[,.]\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:[,.]\d+)?)(?:\s*(mm|cm|m)\b)?(?:\s*[x×]\s*(\d+(?:[,.]\d+)?)(?:\s*(mm|cm|m)\b)?)?/gi;
const measurement = (raw: unknown): number => Number(String(raw ?? '').trim().replace(',', '.'));
const millimeters = (raw: string, unit: string): number => measurement(raw) * (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1);
const formatMeasure = (number: number): string => Number.isFinite(number) && number > 0
  ? String(Math.round(number * 1000) / 1000).replace('.', ',') : '';

export function productThickness(product: string): string {
  const specified = product.match(/\bdikte\s*[:=]?\s*(\d+(?:[,.]\d+)?)\s*mm\b/i)?.[1];
  if (specified) return formatMeasure(measurement(specified));
  const dimensions = [...product.matchAll(plateDimensions)];
  const separate = product.replace(plateDimensions, ' ');
  const candidates = new Set(Array.from(separate.matchAll(/(\d+(?:[,.]\d+)?)\s*mm\b/gi), (match) => measurement(match[1])));
  if (candidates.size === 1) return formatMeasure([...candidates][0]);
  if (candidates.size === 0 && dimensions.length === 1 && dimensions[0][5]) {
    const [, , lengthUnit, , widthUnit, thickness, thicknessUnit] = dimensions[0];
    return formatMeasure(millimeters(thickness, thicknessUnit || widthUnit || lengthUnit || 'mm'));
  }
  return '';
}

function listedMaterialArea(material: string, quantity: number, unit: string): number {
  if (!(quantity > 0)) return 0;
  const normalized = unit.toLowerCase().trim().replace(/²/g, '2').replace(/[.\s]/g, '');
  if (['m2', 'm^2', 'vierkantemeter'].includes(normalized)) return quantity;
  if (!/^(?:stuk(?:s|ken)?|st|stuks?plaat|plaat|platen|paneel|panelen)?$/.test(normalized)) return 0;
  const areas = [...new Set(Array.from(material.matchAll(/(\d+(?:[,.]\d+)?)\s*m(?:²|2|\^2)(?!\d|\s*k\s*\/|\s*\/)/gi), (match) => measurement(match[1])))];
  if (areas.length) return areas.length === 1 ? quantity * areas[0] : 0;
  const dimensions = [...material.matchAll(plateDimensions)];
  if (dimensions.length !== 1) return 0;
  const [, length, lengthUnit, width, widthUnit, , thicknessUnit] = dimensions[0];
  const unitFromProduct = widthUnit || lengthUnit || thicknessUnit;
  if (!unitFromProduct && (measurement(length) < 100 || measurement(width) < 100)) return 0;
  return quantity * millimeters(length, lengthUnit || unitFromProduct || 'mm')
    * millimeters(width, widthUnit || unitFromProduct || 'mm') / 1_000_000;
}

export function fillSubsidyProductFields(measure: SubsidyMeasure): SubsidyMeasure {
  const glass = isSubsidyGlazing(measure);
  const value = measure.material.match(glass ? /\bUg\s*[:=]?\s*(\d+(?:[,.]\d+)?)/i : /\bRd\s*[:=]?\s*(\d+(?:[,.]\d+)?)/i)?.[1];
  return {
    ...measure,
    thickness: measure.thickness || (glass ? '' : productThickness(measure.material)),
    insulationValue: measure.insulationValue || (value ? formatMeasure(measurement(value)) : ''),
  };
}

export function suggestInvoiceSubsidy(quote: Record<string, unknown>, calculation: unknown): {
  context: string;
  measures: SubsidyMeasure[];
} {
  const source = calculation ?? quote.calculationSnapshot ?? quote.data_json ?? quote;
  const raw = unwrapRoot(source);
  const data = normalizeDataJson(source);
  const jobs = data.werkbeschrijving_structured?.jobs;
  const notes = subsidyQuoteNotes(quote);
  const context = [
    notes,
    clean(quote.titel || quote.title), clean(quote.werkomschrijving), clean(data?.korteTitel), clean(data?.korteBeschrijving),
    ...normalizeWerkbeschrijving(raw?.werkbeschrijving).map((line) => clean(line)),
    ...normalizeWerkbeschrijving(data.werkbeschrijving).map((line) => clean(line)),
    ...(Array.isArray(jobs) ? jobs.flatMap((job) => [
      clean(job?.title), clean(job?.summary),
      ...(Array.isArray(job?.work_scope) ? job.work_scope.map((line: unknown) => clean(line)) : []),
      ...(Array.isArray(job?.dimensions) ? job.dimensions.map((line: unknown) => clean(line)) : []),
    ]) : []),
  ].filter(Boolean).join('\n').slice(0, 10000);
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
  const computedAreas = new Map<string, number>();
  const mixedProperty = /\b(?:nieuwbouw|aanbouw|uitbouw|uitbreiding)\b/i.test(context);

  for (const row of materials) {
    const material = clean(row.product);
    const storedCode = text(row.meldcode).toUpperCase();
    const explicit = MELDCODE_APPLICATION_OPTIONS.find(({ value }) => value !== 'onbekend' && value === (row.meldcode_toepassing ?? row.meldcodeToepassing))?.value;
    const coded = isoCode.test(storedCode) || isoCode.test(material);
    if (!material || (!coded && !glazing.test(material) && (!thermalMaterial.test(material) || explicitlyAcoustic))) continue;
    const ownApplications = getApplications(material);
    const application = explicit ?? (ownApplications.length === 1 ? ownApplications[0] : ownApplications.length === 0 && applications.length === 1 ? applications[0] : undefined);
    const glass = glazing.test(material);
    const measure = fillSubsidyProductFields({
      ...emptySubsidyMeasure(), material,
      application: glass ? 'Glasisolatie' : application ? subsidyApplicationLabel(application, applications.length <= 1 ? context : material) : '',
      code: /^KA\d{5}$/.test(storedCode) && row.meldcode_status !== 'unresolved'
        ? storedCode : (material.match(isoCode)?.[0]?.toUpperCase() || ''),
      area: referencedArea(material, appliedArea),
      plannedArea: referencedArea(material, plannedArea),
    });
    const key = [material.toLowerCase(), measure.application, measure.code].join('|');
    const prior = rows.get(key);
    rows.set(key, prior ? { ...measure, area: prior.area || measure.area, plannedArea: prior.plannedArea || measure.plannedArea } : measure);
    if (!mixedProperty) {
      const area = listedMaterialArea(material, measurement(row.aantal), text(row.eenheid));
      computedAreas.set(key, (computedAreas.get(key) || 0) + area);
    }
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
  Array.from(rows.entries()).slice(0, 20).forEach(([key, measure]) => {
    const area = formatMeasure(computedAreas.get(key) || 0);
    measure.area ||= area;
    measure.plannedArea ||= area;
  });
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
    { field: 'purchaseDate', label: 'Aanschafdatum', question: '' },
    { field: 'installationDate', label: 'Installatiedatum', question: '' },
    { field: 'amount', label: 'Bedrag maatregel incl. btw (€)', question: '' },
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
