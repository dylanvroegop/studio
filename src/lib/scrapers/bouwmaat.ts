/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path';

export type BouwmaatCategoryInput = {
  url: string;
  categorie?: string;
  sub_categorie?: string;
};

export type BouwmaatScrapedMaterial = {
  materiaalnaam: string;
  eenheid: string;
  prijs_excl_btw: number | null;
  prijs_incl_btw: number | null;
  categorie: string;
  sub_categorie: string;
  leverancier: string;
  lengte: string;
  breedte: string;
  dikte: string;
  hoogte: string;
  source_url: string;
  source_product_id: string;
  unit_price_text: string;
  bulk_price_text: string;
  confidence: number;
  audit_status: 'valid' | 'review' | 'rejected';
  audit_reason: string;
  audit_confidence: number | null;
};

type RawProductCard = {
  text: string;
  linkText: string;
  href: string;
};

const VAT_RATE = 1.21;
const MAX_MATERIAL_NAME_LENGTH = 260;
const SUPPORTED_SUPPLIER_HOSTS = ['bouwmaat.nl', 'toolstation.nl', 'gamma.nl'] as const;

function normalizeHost(input: string): string {
  return input.trim().toLowerCase().replace(/^www\./, '');
}

export function isSupportedSupplierUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = normalizeHost(url.hostname);
    return SUPPORTED_SUPPLIER_HOSTS.some((allowed) => host === allowed);
  } catch {
    return false;
  }
}

function inferSupplierFromUrl(value: string): 'Bouwmaat' | 'Toolstation' | 'Gamma' {
  try {
    const host = normalizeHost(new URL(value).hostname);
    if (host === 'toolstation.nl') return 'Toolstation';
    if (host === 'gamma.nl') return 'Gamma';
  } catch {
    // Ignore parse failure and use default.
  }
  return 'Bouwmaat';
}

export function getBouwmaatBrowserProfilePath(): string {
  return path.join(process.cwd(), '.browser-profiles', 'supplier-import');
}

export function isLocalRequest(request: Request): boolean {
  const host = request.headers.get('host') || '';
  const forwardedHost = request.headers.get('x-forwarded-host') || '';
  const candidates = [host, forwardedHost].filter(Boolean);
  return candidates.some((value) =>
    value.startsWith('localhost:')
    || value.startsWith('127.0.0.1:')
    || value.startsWith('[::1]:')
  );
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function parseDutchMoney(value: string): number | null {
  const clean = value
    .replace(/\u20ac/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') && clean.includes('.')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

function parseFirstPrice(text: string): number | null {
  const match = text.match(/€\s*\d+(?:[.,]\d{1,2})?/);
  return match ? parseDutchMoney(match[0]) : null;
}

function looksLikeCategoryTile(name: string): boolean {
  return /\(\s*\d+\s*\)\s*$/.test(name.trim());
}

function looksLikeUiLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  const exact = [
    'populariteit',
    'sorteren op',
    'prijs',
    'prijs laag-hoog',
    'prijs hoog-laag',
    'laag-hoog',
    'hoog-laag',
    'assortiment',
    'meer-minder',
    'duurzaam',
    'kies een vestiging',
  ];
  if (exact.includes(normalized)) return true;
  if (/\b(prijs|sorteer|sorteren|populariteit)\b/.test(normalized) && normalized.length <= 28) return true;
  return false;
}

function parseUnitPriceText(text: string): string {
  const match = text.match(/€\s*\d+(?:[.,]\d{1,2})?\s*\/\s*(m2|m²|m1|m|stuk|st|doos|set|pak)/i);
  return match?.[0]?.trim() || '';
}

function parseUnitPriceValue(text: string): number | null {
  const unitText = parseUnitPriceText(text);
  if (!unitText) return null;
  const moneyMatch = unitText.match(/€\s*\d+(?:[.,]\d{1,2})?/);
  return moneyMatch ? parseDutchMoney(moneyMatch[0]) : null;
}

function parseBulkPriceText(text: string): string {
  const match = text.match(/€\s*\d+(?:[.,]\d{1,2})?\s*v\.?a\.?\s*\d+\s*(?:stuks?|st|x|p(?:ak)?)/i);
  return match?.[0]?.trim() || '';
}

function normalizeUnit(rawText: string, materialName: string): string {
  const unitText = parseUnitPriceText(rawText).toLowerCase();
  if (unitText.includes('/ m2') || unitText.includes('/m2') || unitText.includes('/ m²') || unitText.includes('/m²')) {
    return 'p/m2';
  }
  if (unitText.includes('/ m1') || unitText.includes('/m1') || /\b\/\s*m\b/i.test(unitText)) {
    return 'p/m1';
  }
  const lowerName = materialName.toLowerCase();
  if (/\b(doos|box)\b/.test(lowerName)) return 'doos';
  if (/\b(set)\b/.test(lowerName)) return 'set';
  if (/\b(pak|st\/pak)\b/.test(lowerName)) return 'pak';
  if (/\b(m2|m²)\b/.test(rawText.toLowerCase())) return 'p/m2';
  if (/\b(m1)\b/.test(rawText.toLowerCase())) return 'p/m1';
  return 'stuk';
}

function extractArticleNumber(text: string, href: string): string {
  const hrefMatch = href.match(/(?:^|[/-])(\d{5,9})(?:$|[/?#-])/);
  if (hrefMatch?.[1]) return hrefMatch[1];

  const lineMatch = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /^\d{5,9}$/.test(line));
  if (lineMatch) return lineMatch;

  const loose = text.match(/\b\d{5,9}\b/);
  return loose?.[0] || '';
}

function extractDimensions(materialName: string): {
  lengte: string;
  breedte: string;
  dikte: string;
  hoogte: string;
} {
  const normalized = materialName.replace(/×/g, 'x');
  const match = normalized.match(/(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)\s*(mm|cm|m)?/i);
  if (!match) {
    return { lengte: '', breedte: '', dikte: '', hoogte: '' };
  }

  const unit = (match[4] || 'mm').toLowerCase();
  const first = match[1].replace(',', '.');
  const second = match[2].replace(',', '.');
  const third = match[3].replace(',', '.');

  if (unit === 'mm') {
    const firstNumber = Number.parseFloat(first);
    const secondNumber = Number.parseFloat(second);
    const firstLooksCm = Number.isFinite(firstNumber) && firstNumber > 50 && firstNumber < 1000;
    const secondLooksCm = Number.isFinite(secondNumber) && secondNumber > 20 && secondNumber < 200;

    return {
      lengte: `${firstLooksCm ? Math.round(firstNumber * 10) : first} mm`,
      breedte: `${secondLooksCm ? Math.round(secondNumber * 10) : second} mm`,
      dikte: `${third} mm`,
      hoogte: '',
    };
  }

  return {
    lengte: `${first} ${unit}`,
    breedte: `${second} ${unit}`,
    dikte: `${third} ${unit}`,
    hoogte: '',
  };
}

function pickProductName(raw: RawProductCard): string {
  const linkText = safeText(raw.linkText);
  if (
    linkText
    && !/^€/.test(linkText)
    && linkText.length >= 5
    && linkText.length <= 140
    && !looksLikeUiLabel(linkText)
  ) {
    return linkText;
  }

  const lines = raw.text
    .split(/\n+/)
    .map((line) => safeText(line))
    .filter(Boolean)
    .filter((line) => !/^€/.test(line))
    .filter((line) => !/^(meer|minder|duurzaam|bezorgvoorraad|bouwmaat|excl|incl)$/i.test(line))
    .filter((line) => !/^\d{5,9}$/.test(line));
  return lines.find((line) =>
    /[a-z]/i.test(line)
    && line.length >= 8
    && line.length <= 140
    && !looksLikeUiLabel(line)
  ) || '';
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) || []).length;
}

function looksLikeMergedProductCard(rawText: string, materialName: string): boolean {
  const lowerText = rawText.toLowerCase();
  const lowerName = materialName.toLowerCase();

  if (materialName.length > MAX_MATERIAL_NAME_LENGTH && !/\b\d{2,4}x\d{2,4}(x\d{1,4})?\s*(mm|cm|m)?\b/i.test(materialName)) {
    return true;
  }
  if (/(shopping-cart|favorite button|product image|kies een vestiging)/i.test(lowerName)) return true;

  const articleCount = countMatches(rawText, /\b\d{5,9}\b/g);
  const exclBtwCount = countMatches(lowerText, /excl\s*btw/g);
  const stockCount = countMatches(lowerText, /bezorgvoorraad/g);
  const unitPriceCount = countMatches(rawText, /\/\s*(m2|m²|m1|m|stuk|st|doos|set|pak)\b/gi);

  if (articleCount >= 2 && (exclBtwCount >= 2 || stockCount >= 2 || unitPriceCount >= 2)) {
    return true;
  }

  return false;
}

export function normalizeBouwmaatProduct(
  raw: RawProductCard,
  category: BouwmaatCategoryInput
): BouwmaatScrapedMaterial | null {
  const materiaalnaam = pickProductName(raw);
  if (!materiaalnaam) return null;
  if (looksLikeMergedProductCard(raw.text, materiaalnaam)) return null;
  if (looksLikeCategoryTile(materiaalnaam)) return null;
  if (looksLikeUiLabel(materiaalnaam)) return null;
  if (/^\s*prijs\s+(laag|hoog)\s*-\s*(laag|hoog)\s*$/i.test(materiaalnaam)) return null;
  if (/^\s*(sorteren op|populariteit)\s*$/i.test(materiaalnaam)) return null;

  const inferredUnit = normalizeUnit(raw.text, materiaalnaam);
  const firstVisiblePrice = parseFirstPrice(raw.text);
  const unitPriceValue = parseUnitPriceValue(raw.text);
  const prijsExcl = (
    inferredUnit === 'p/m2'
    || inferredUnit === 'p/m1'
    || inferredUnit === 'stuk'
    || inferredUnit === 'doos'
    || inferredUnit === 'set'
    || inferredUnit === 'pak'
  )
    ? (unitPriceValue ?? firstVisiblePrice)
    : firstVisiblePrice;
  if (prijsExcl == null) return null;
  const dimensions = extractDimensions(materiaalnaam);
  const sourceProductId = extractArticleNumber(raw.text, raw.href);
  const unitPriceText = parseUnitPriceText(raw.text);
  const bulkPriceText = parseBulkPriceText(raw.text);
  const sourceUrl = raw.href || category.url;
  const leverancier = inferSupplierFromUrl(sourceUrl);

  return {
    materiaalnaam,
    eenheid: inferredUnit,
    prijs_excl_btw: prijsExcl,
    prijs_incl_btw: prijsExcl == null ? null : Number((prijsExcl * VAT_RATE).toFixed(2)),
    categorie: safeText(category.categorie),
    sub_categorie: safeText(category.sub_categorie),
    leverancier,
    lengte: dimensions.lengte,
    breedte: dimensions.breedte,
    dikte: dimensions.dikte,
    hoogte: dimensions.hoogte,
    source_url: sourceUrl,
    source_product_id: sourceProductId,
    unit_price_text: unitPriceText,
    bulk_price_text: bulkPriceText,
    confidence: prijsExcl == null ? 0.65 : 0.86,
    audit_status: 'valid',
    audit_reason: '',
    audit_confidence: null,
  };
}

export async function extractBouwmaatProductsFromPage(page: any): Promise<RawProductCard[]> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
    const CARD_SELECTOR = [
      'article',
      'li[data-product-id]',
      '[data-product-id]',
      '[data-testid*="product"]',
      '[class*="product-card"]',
      '[class*="producttile"]',
    ].join(',');
    const looksLikeUiLabelLocal = (value: string) => {
      const normalized = value.trim().toLowerCase();
      return [
        'populariteit',
        'sorteren op',
        'prijs',
        'assortiment',
        'meer-minder',
        'duurzaam',
        'kies een vestiging',
      ].includes(normalized);
    };
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const productAnchors = anchors.filter((anchor) => {
      const href = anchor.href || '';
      const text = normalize(anchor.textContent);
      return (
        text.length > 5
        && !text.startsWith('€')
        && (
          /\/\d{5,9}(?:$|[/?#-])/.test(href)
          || /bouwmaat\.nl\/.*\/p\//i.test(href)
          || /toolstation\.nl\/.+\/p\d+/i.test(href)
          || /gamma\.nl\/.+\/p\//i.test(href)
          || /\/p\//i.test(href)
          || /\/product\//i.test(href)
          || anchor.closest('[data-product-id], [data-testid*="product"], article, li')
        )
      );
    });

    const results: Array<{ text: string; linkText: string; href: string }> = [];
    const seen = new Set<string>();
    const isSingleCardLike = (text: string) => {
      if (!text || !text.includes('€')) return false;
      if (text.length > 1400) return false;
      const articleCount = (text.match(/\b\d{5,9}\b/g) || []).length;
      const priceCount = (text.match(/€\s*\d+(?:[.,]\d{1,2})?/g) || []).length;
      if (articleCount > 3) return false;
      if (priceCount > 5) return false;
      return true;
    };

    for (const anchor of productAnchors) {
      const closestCard = anchor.closest(CARD_SELECTOR);
      const candidates: Element[] = [];
      if (closestCard) {
        const closestText = normalize(closestCard.textContent);
        if (isSingleCardLike(closestText)) candidates.push(closestCard);
      }

      let container: Element | null = anchor;
      for (let depth = 0; depth < 7 && container?.parentElement; depth += 1) {
        container = container.parentElement;
        if (!container) break;
        const text = normalize(container.textContent);
        if (isSingleCardLike(text)) {
          candidates.push(container);
        }
      }

      let best: Element | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const text = normalize(candidate.textContent);
        if (!text.includes('€')) continue;
        const articleCount = (text.match(/\b\d{5,9}\b/g) || []).length;
        const priceCount = (text.match(/€\s*\d+(?:[.,]\d{1,2})?/g) || []).length;
        // Prefer compact candidates that look like one product card.
        const score = text.length + (Math.max(0, articleCount - 1) * 600) + (Math.max(0, priceCount - 3) * 400);
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }

      const text = normalize(best?.textContent || '');
      const linkText = normalize(anchor.textContent);
      const key = anchor.href || linkText;
      if (!text.includes('€') || seen.has(key)) continue;
      if (/^\D+\(\s*\d+\s*\)$/.test(linkText) && !/€\s*\d/.test(linkText)) continue;
      if (looksLikeUiLabelLocal(linkText)) continue;
      seen.add(key);
      results.push({ text, linkText, href: anchor.href });
    }

    if (results.length === 0) {
      const cardCandidates = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
      for (const card of cardCandidates) {
        const text = normalize(card.textContent);
        if (!text.includes('€')) continue;
        if (text.length > 2200) continue;

        const anchor = card.querySelector<HTMLAnchorElement>('a[href]');
        if (!anchor?.href) continue;
        const href = anchor.href;
        const linkText = normalize(anchor.textContent);
        if (!linkText || looksLikeUiLabelLocal(linkText)) continue;

        const key = href || linkText;
        if (seen.has(key)) continue;

        const articleCount = (text.match(/\b\d{5,9}\b/g) || []).length;
        const priceCount = (text.match(/€\s*\d+(?:[.,]\d{1,2})?/g) || []).length;
        if (articleCount > 4 || priceCount > 8) continue;

        seen.add(key);
        results.push({ text, linkText, href });
      }
    }

    return results;
  });
}
