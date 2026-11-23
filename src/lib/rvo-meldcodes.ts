import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { isSubsidyGlazing, type SubsidyMeasure } from '@/lib/invoice-subsidy';

const catalogPage = 'https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten';
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true, processEntities: false });
const list = <T>(value?: T | T[]): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const normalize = (value: string): string => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export type CatalogKind = 'isolatie' | 'glas';

interface CatalogEntry {
  code: string;
  brand: string;
  model: string;
  category: string;
  thickness: number;
  insulationValue: number;
}

interface XmlText { '#text'?: string }
interface XmlString { t?: string | XmlText; r?: { t?: string | XmlText } | { t?: string | XmlText }[] }
interface XmlCell { '@_r': string; '@_t'?: string; v?: string; is?: XmlString }
interface XmlRow { c?: XmlCell | XmlCell[] }
function excelText(value?: XmlString): string {
  const plain = (item?: string | XmlText) => typeof item === 'string' ? item : item?.['#text'] || '';
  return plain(value?.t) || list(value?.r).map((item) => plain(item.t)).join('');
}

export function parseRvoCatalog(content: Uint8Array, kind: CatalogKind): CatalogEntry[] {
  const files = unzipSync(content, { filter: (entry) =>
    /^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(entry.name) && entry.originalSize <= 4_000_000,
  });
  const sharedStrings = files['xl/sharedStrings.xml'];
  const strings = list<XmlString>(sharedStrings ? parser.parse(strFromU8(sharedStrings)).sst?.si : undefined).map(excelText);

  for (const [name, file] of Object.entries(files)) {
    if (!name.startsWith('xl/worksheets/')) continue;
    const rows = list<XmlRow>(parser.parse(strFromU8(file)).worksheet?.sheetData?.row).map((row) => Object.fromEntries(
      list(row.c).map((cell) => [
        cell['@_r'].replace(/\d+$/, ''),
        cell['@_t'] === 's' ? strings[Number(cell.v)] || '' : cell['@_t'] === 'inlineStr' ? excelText(cell.is) : cell.v || '',
      ]),
    ));
    const header = rows[0];
    if (header?.A !== 'MELDCODE') continue;
    const glass = kind === 'glas';
    if (glass ? header.D !== 'Model' || header.E !== 'Ug waarde' : header.C !== 'Model' || header.F !== 'MIN_DIKTE_MM') continue;
    return rows.slice(1).filter((row) => /^KA\d{5}$/.test(row.A || '') && (glass ? row.J : row.K) === 'Alle woningen').map((row) => ({
      code: row.A,
      brand: normalize((glass ? row.C : row.B) || ''),
      model: normalize(glass ? row.D || '' : (row.C || '').replace(/\s*-\s*(?:gevel|dak|vloer|spouw|zolder|vliering|bodem).*$/i, '')),
      category: normalize((glass ? row.I : row.J) || ''),
      thickness: glass ? 0 : Number((row.F || '').replace(',', '.')),
      insulationValue: Number((row.E || '').replace(',', '.')),
    }));
  }
  return [];
}

type CacheEntry = { expires: number; promise: Promise<CatalogEntry[]> };
const cache = new Map<CatalogKind, CacheEntry>();

async function downloadCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const signal = AbortSignal.timeout(8000);
  const page = await fetch(catalogPage, { signal, redirect: 'error' });
  if (!page.ok) throw new Error('RVO-pagina niet beschikbaar');
  const fileName = kind === 'glas' ? 'Hoogrendementsglas' : 'Isolatiematerialen';
  const links = (await page.text()).matchAll(/href="(\/sites\/default\/files\/[^"]+\.xlsx)"/gi);
  const link = Array.from(links, (match) => match[1]).find((path) => new RegExp(`Meldcodelijst(?:%20|[-_ ])${fileName}`, 'i').test(path));
  if (!link) throw new Error('RVO-meldcodelijst niet gevonden');
  const file = await fetch(new URL(link, catalogPage), { signal, redirect: 'error' });
  if (!file.ok) throw new Error('RVO-meldcodelijst niet beschikbaar');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 1_000_000) throw new Error('RVO-meldcodelijst te groot');
  const entries = parseRvoCatalog(bytes, kind);
  if (!entries.length) throw new Error('RVO-meldcodelijst is gewijzigd');
  return entries;
}

export function loadRvoCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const cached = cache.get(kind);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = downloadCatalog(kind).catch((error) => {
    if (cache.get(kind)?.promise === promise) cache.delete(kind);
    throw error;
  });
  cache.set(kind, { expires: Date.now() + 24 * 60 * 60 * 1000, promise });
  return promise;
}

function categoryOf(label: string): string {
  const category = normalize(label);
  if (/^(?:binnen of buitengevel|gevel)(?:isolatie)?$/.test(category)) return 'binnen of buitengevelisolatie';
  if (/^(?:zolder vliering|zolder of vlieringvloer)$/.test(category)) return 'zolder of vlieringvloer';
  if (category === 'vloer') return 'vloerisolatie';
  return category;
}

export function canLookupRvoCode(measure: SubsidyMeasure): boolean {
  return !measure.code && !!measure.material && !!measure.application
    && (isSubsidyGlazing(measure) ? !!measure.insulationValue : !!measure.thickness);
}

export function matchRvoCode(measure: SubsidyMeasure, catalog: CatalogEntry[]): string {
  if (!canLookupRvoCode(measure)) return '';
  const glass = isSubsidyGlazing(measure);
  const product = ` ${normalize(measure.material)} `;
  const category = categoryOf(measure.application);
  const thickness = Number(measure.thickness.replace(',', '.'));
  const value = Number(measure.insulationValue.replace(',', '.'));
  // Bij meerdere matches blijft de code open. De grenswaarde is geen productwaarde.
  const codes = new Set(catalog.filter((entry) => entry.model.length >= 5 && entry.brand
    && product.includes(` ${entry.brand.split(' ')[0]} `) && product.includes(` ${entry.model} `)
    && (glass ? entry.insulationValue === value : entry.category === category && entry.thickness > 0
      && thickness >= entry.thickness && (!value || !entry.insulationValue || value >= entry.insulationValue)))
    .map((entry) => entry.code));
  return codes.size === 1 ? [...codes][0] : '';
}
