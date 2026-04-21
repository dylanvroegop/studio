import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

import { initFirebaseAdmin } from '@/firebase/admin';
import {
  type BouwmaatCategoryInput,
  type BouwmaatScrapedMaterial,
  extractBouwmaatProductsFromPage,
  getBouwmaatBrowserProfilePath,
  isSupportedSupplierUrl,
  isLocalRequest,
  normalizeBouwmaatProduct,
} from '@/lib/scrapers/bouwmaat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var __bouwmaatPlaywrightContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  // eslint-disable-next-line no-var
  var __bouwmaatScrapeCancelRequested: boolean | undefined;
}

type Body = {
  urls?: unknown;
  maxPagesPerUrl?: unknown;
  pageDelaySeconds?: unknown;
  aiAudit?: unknown;
  priceMode?: unknown;
};

const OPENAI_AUDIT_MODEL = 'gpt-5.1';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function verifyUser(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAiAudit(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
  return true;
}

function parseDutchMoney(value: string): number | null {
  const match = value.match(/€\s*\d+(?:[.,]\d{1,2})?/i);
  if (!match) return null;
  const clean = match[0].replace(/\u20ac/g, '').replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(clean);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

function isSuspiciousUiLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^\s*prijs\s+(laag|hoog)\s*-\s*(laag|hoog)\s*$/i.test(normalized)) return true;
  if (/^(populariteit|sorteren op|prijs|assortiment|meer-minder|duurzaam|kies een vestiging)$/.test(normalized)) return true;
  if (/\b(sorteren|populariteit)\b/.test(normalized) && normalized.length <= 32) return true;
  return false;
}

function deterministicAudit(
  material: BouwmaatScrapedMaterial,
  priceMode: 'excl' | 'incl'
): BouwmaatScrapedMaterial {
  const next = { ...material };
  if (!next.materiaalnaam || isSuspiciousUiLabel(next.materiaalnaam)) {
    next.audit_status = 'rejected';
    next.audit_reason = 'UI label i.p.v. product';
    next.audit_confidence = 0.98;
    return next;
  }
  if (next.prijs_excl_btw == null) {
    next.audit_status = 'rejected';
    next.audit_reason = 'Geen geldige prijs';
    next.audit_confidence = 0.99;
    return next;
  }

  const unitPrice = parseDutchMoney(next.unit_price_text || '');
  if (
    priceMode === 'excl'
    && unitPrice != null
    && Math.abs(unitPrice - next.prijs_excl_btw) >= 0.01
  ) {
    const original = next.prijs_excl_btw;
    next.prijs_excl_btw = unitPrice;
    next.prijs_incl_btw = Number((unitPrice * 1.21).toFixed(2));
    next.audit_status = 'review';
    next.audit_reason = `Prijs gecorrigeerd van € ${original.toFixed(2)} naar unit-prijs € ${unitPrice.toFixed(2)}`;
    next.audit_confidence = 0.9;
    return next;
  }

  next.audit_status = 'valid';
  if (!next.audit_reason) next.audit_reason = '';
  if (next.audit_confidence == null) next.audit_confidence = 0.9;
  return next;
}

function isUncertainForAi(material: BouwmaatScrapedMaterial): boolean {
  if (material.audit_status !== 'valid') return true;
  if (!material.source_product_id) return true;
  if (!material.unit_price_text) return true;
  if (material.confidence < 0.82) return true;
  return false;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const outputText = root.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();
  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];
  output.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const content = Array.isArray((entry as Record<string, unknown>).content)
      ? (entry as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    content.forEach((part) => {
      const text = part?.text;
      if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
    });
  });
  return chunks.join('\n').trim();
}

function parseJsonLoose<T>(text: string): T | null {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

type AiAuditDecision = {
  status?: 'valid' | 'review' | 'rejected';
  reason?: string;
  corrected_price_excl_btw?: number | null;
  corrected_eenheid?: string;
  confidence?: number;
};

function buildAuditKey(row: BouwmaatScrapedMaterial): string {
  return row.source_product_id
    || `${row.materiaalnaam}|${row.eenheid}|${row.prijs_excl_btw ?? 'null'}|${row.source_url || ''}`;
}

async function runAiAudit(
  materials: BouwmaatScrapedMaterial[]
): Promise<Map<string, AiAuditDecision>> {
  const apiKey = safeString(process.env.OPENAI_API_KEY);
  if (!apiKey || materials.length === 0) return new Map();

  const compactRows = materials.map((row, index) => ({
    key: buildAuditKey(row),
    materiaalnaam: row.materiaalnaam,
    prijs_excl_btw: row.prijs_excl_btw,
    eenheid: row.eenheid,
    unit_price_text: row.unit_price_text,
    bulk_price_text: row.bulk_price_text,
    source_product_id: row.source_product_id || `no-id-${index}`,
  }));

  const prompt = [
    'Controleer deze Bouwmaat producten.',
    'Doel: verwijder UI/ruis-rows en markeer prijs/eenheid inconsistenties.',
    'Regels:',
    '1. status=rejected voor UI labels (zoals sortering/filterteksten) of geen bruikbare materiaalregel.',
    '2. status=review als prijs of eenheid niet logisch is.',
    '3. status=valid als regel goed is.',
    '4. Als unit_price_text een duidelijke prijs per m2/m1/stuk bevat en prijs_excl_btw afwijkt: zet corrected_price_excl_btw op de unit-prijs.',
    '5. Geef alleen JSON terug in dit formaat: {"decisions":[{"key":"...","status":"valid|review|rejected","reason":"...","corrected_price_excl_btw":number|null,"corrected_eenheid":"...|null","confidence":0-1}]}',
    `Rows: ${JSON.stringify(compactRows)}`,
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_AUDIT_MODEL,
      temperature: 0,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return new Map();
  const text = extractResponseText(payload);
  if (!text) return new Map();
  const parsed = parseJsonLoose<{ decisions?: Array<AiAuditDecision & { key?: string }> }>(text);
  if (!parsed) return new Map();
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const map = new Map<string, AiAuditDecision>();
  decisions.forEach((entry) => {
    const key = safeString(entry.key);
    if (!key) return;
    map.set(key, entry);
  });
  return map;
}

function normalizeUrls(raw: unknown): BouwmaatCategoryInput[] {
  if (!Array.isArray(raw)) return [];
  const rows: BouwmaatCategoryInput[] = [];
  raw.slice(0, 25).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const url = safeString(row.url);
      if (!url || !isSupportedSupplierUrl(url)) return null;
      rows.push({
        url,
        categorie: safeString(row.categorie),
        sub_categorie: safeString(row.sub_categorie),
      });
      return null;
    });
  return rows;
}

async function getContext() {
  if (globalThis.__bouwmaatPlaywrightContext) {
    return globalThis.__bouwmaatPlaywrightContext;
  }

  const context = await chromium.launchPersistentContext(getBouwmaatBrowserProfilePath(), {
    headless: false,
    viewport: { width: 1440, height: 1000 },
  });
  globalThis.__bouwmaatPlaywrightContext = context;
  return context;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function isCancelRequested(): boolean {
  return globalThis.__bouwmaatScrapeCancelRequested === true;
}

async function sleepCancellable(ms: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    if (isCancelRequested()) throw new Error('Bouwmaat scrape gestopt.');
    await new Promise((resolve) => setTimeout(resolve, Math.min(500, ms - (Date.now() - startedAt))));
  }
}

async function loadAllVisibleProducts(page: any): Promise<void> {
  const scrolls = randomInt(5, 9);
  for (let i = 0; i < scrolls; i += 1) {
    if (isCancelRequested()) throw new Error('Bouwmaat scrape gestopt.');
    await page.mouse.wheel(0, randomInt(1000, 2100));
    await page.waitForTimeout(randomInt(700, 1700));
  }
  if (isCancelRequested()) throw new Error('Bouwmaat scrape gestopt.');
  await page.mouse.wheel(0, randomInt(-500, -150));
  await page.waitForTimeout(randomInt(500, 1200));
}

async function findNextPageUrl(page: any): Promise<string | null> {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const current = new URL(window.location.href);
    const readPageParam = (url: URL): number | null => {
      const candidates = ['page', 'Page', 'PAGE', 'p', 'P'];
      for (const key of candidates) {
        const raw = url.searchParams.get(key);
        if (!raw) continue;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return null;
    };
    const normalizeUrl = (input: URL): string => {
      const normalized = new URL(input.toString());
      normalized.hash = '';
      const pageValue = readPageParam(normalized);
      normalized.search = '';
      if (pageValue != null) normalized.searchParams.set('Page', String(pageValue));
      return normalized.toString();
    };

    const samePathname = (a: URL, b: URL) => a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '');
    const isListingLikePath = (pathname: string) => /\/[cp]\d+(?:\/)?$/i.test(pathname);
    const currentHasListingPath = isListingLikePath(current.pathname);

    const byRel = anchors
      .map((anchor) => {
        if (!anchor.rel?.toLowerCase().split(/\s+/).includes('next')) return null;
        try {
          return new URL(anchor.href);
        } catch {
          return null;
        }
      })
      .filter((url): url is URL => Boolean(url))
      .find((url) => {
        if (url.origin !== current.origin) return false;
        // Keep pagination on the same listing path whenever possible.
        if (samePathname(url, current)) return true;
        // Some shops keep listing slug but add/remove trailing slash.
        if (url.pathname.startsWith(current.pathname) || current.pathname.startsWith(url.pathname)) return true;
        return false;
      });
    if (byRel?.href) return byRel.href;

    const currentPageNumber = readPageParam(current) || 1;
    const currentNormalized = normalizeUrl(current);
    const candidates = anchors
      .map((anchor) => {
        const label = (anchor.textContent || anchor.getAttribute('aria-label') || anchor.title || '').trim().toLowerCase();
        const href = anchor.href;
        if (!href) return null;
        let url: URL;
        try {
          url = new URL(href);
        } catch {
          return null;
        }
        if (url.origin !== current.origin) return null;
        const normalizedHref = normalizeUrl(url);
        if (normalizedHref === currentNormalized) return null;
        const samePath = samePathname(url, current);
        const samePathPrefix = url.pathname.startsWith(current.pathname) || current.pathname.startsWith(url.pathname);
        const listingCompatible = samePath || samePathPrefix || (!currentHasListingPath && samePathPrefix);

        if (!listingCompatible) {
          // Never jump to unrelated pages (e.g. /branches) just because they have a "next" arrow.
          return null;
        }

        const pageParam = readPageParam(url);
        const numericLabel = Number.parseInt(label, 10);
        const isExplicitNext =
          /\b(volgende|next)\b/.test(label)
          || label === '›'
          || label === '>'
          || label.includes('next page')
          || label.includes('volgende pagina');

        return {
          href,
          normalizedHref,
          isExplicitNext,
          pageNumber: Number.isFinite(pageParam) ? pageParam : (Number.isFinite(numericLabel) ? numericLabel : null),
          samePath,
        };
      })
      .filter((item): item is { href: string; normalizedHref: string; isExplicitNext: boolean; pageNumber: number | null; samePath: boolean } => Boolean(item));

    // Strong preference: same-path numbered pagination (typical listing pages).
    const samePathNumbered = candidates
      .filter((item) => item.samePath && typeof item.pageNumber === 'number' && item.pageNumber > currentPageNumber)
      .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0))[0];
    if (samePathNumbered) return samePathNumbered.href;

    const explicit = candidates.find((item) => item.isExplicitNext);
    if (explicit) return explicit.href;

    const numbered = candidates
      .filter((item) => typeof item.pageNumber === 'number' && item.pageNumber > currentPageNumber)
      .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0))[0];

    if (numbered?.href) return numbered.href;

    // Fallback for suppliers where pagination controls are buttons/spans without href.
    // We only synthesize a next URL when we can observe numeric pagination in the UI.
    const paginationRoots = Array.from(document.querySelectorAll<HTMLElement>('nav, [role="navigation"], [class*="pagination"], [data-testid*="pagination"]'));
    const numericPages = new Set<number>();
    const collectNumbers = (root: ParentNode) => {
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('a,button,span,li,div'));
      nodes.forEach((node) => {
        const text = (node.textContent || '').trim();
        if (!/^\d{1,4}$/.test(text)) return;
        const value = Number.parseInt(text, 10);
        if (Number.isFinite(value) && value > 0) numericPages.add(value);
      });
    };
    paginationRoots.forEach((root) => collectNumbers(root));
    if (numericPages.size === 0) {
      // Last resort: scan document for compact numeric pagination patterns.
      collectNumbers(document);
    }

    const nextNumeric = Array.from(numericPages)
      .filter((value) => value > currentPageNumber)
      .sort((a, b) => a - b)[0];

    if (Number.isFinite(nextNumeric)) {
      const nextUrl = new URL(current.toString());
      const knownKey = ['page', 'Page', 'PAGE', 'p', 'P'].find((key) => nextUrl.searchParams.has(key));
      const pageKey = knownKey || 'page';
      nextUrl.searchParams.set(pageKey, String(nextNumeric));
      return nextUrl.toString();
    }

    return null;
  });
}

function normalizeMaxPages(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.min(150, Math.floor(raw)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(150, parsed));
  }
  return 1;
}

function normalizePageDelaySeconds(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(6, Math.min(60, Math.floor(raw)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return Math.max(6, Math.min(60, parsed));
  }
  return 6;
}

function normalizePriceMode(raw: unknown): 'excl' | 'incl' {
  const value = safeString(raw).toLowerCase();
  return value === 'incl' ? 'incl' : 'excl';
}

async function waitBetweenPages(baseSeconds: number): Promise<void> {
  const baseMs = baseSeconds * 1000;
  const jitterMs = randomInt(1000, 5000);
  await sleepCancellable(baseMs + jitterMs);
}

export async function POST(request: Request) {
  try {
    if (!isLocalRequest(request)) {
      return NextResponse.json(
        { ok: false, message: 'Supplier import is alleen lokaal beschikbaar.' },
        { status: 403 }
      );
    }

    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    globalThis.__bouwmaatScrapeCancelRequested = false;
    const urls = normalizeUrls(body.urls);
    const maxPagesPerUrl = normalizeMaxPages(body.maxPagesPerUrl);
    const pageDelaySeconds = normalizePageDelaySeconds(body.pageDelaySeconds);
    const aiAudit = normalizeAiAudit(body.aiAudit);
    const priceMode = normalizePriceMode(body.priceMode);
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, message: 'Voeg minimaal één geldige supplier URL toe (Bouwmaat, Toolstation of Gamma).' }, { status: 400 });
    }

    const context = await getContext();
    const page = context.pages()[0] || await context.newPage();
    const materials: BouwmaatScrapedMaterial[] = [];
    const failures = [];
    const rejectedSamples: Array<{ linkText: string; textSample: string; url: string }> = [];
    const seen = new Set<string>();
    let rawCardsSeen = 0;
    let normalizedAccepted = 0;
    let pagesVisited = 0;
    let cancelled = false;

    for (const category of urls) {
      if (isCancelRequested()) {
        cancelled = true;
        break;
      }
      let nextUrl: string | null = category.url;
      const visitedForCategory = new Set<string>();
      try {
        for (let pageIndex = 0; nextUrl && pageIndex < maxPagesPerUrl; pageIndex += 1) {
          if (isCancelRequested()) {
            cancelled = true;
            break;
          }
          if (visitedForCategory.has(nextUrl)) break;
          visitedForCategory.add(nextUrl);

          await waitBetweenPages(pageDelaySeconds);
          if (isCancelRequested()) {
            cancelled = true;
            break;
          }
          await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          pagesVisited += 1;
          await page.waitForTimeout(randomInt(1800, 3800));
          await loadAllVisibleProducts(page);

          const rawProducts = await extractBouwmaatProductsFromPage(page);
          rawCardsSeen += rawProducts.length;
          for (const raw of rawProducts) {
            const normalized = normalizeBouwmaatProduct(raw, category);
            if (!normalized) {
              if (rejectedSamples.length < 8) {
                rejectedSamples.push({
                  linkText: safeString(raw.linkText).slice(0, 180),
                  textSample: safeString(raw.text).slice(0, 280),
                  url: safeString(raw.href || category.url),
                });
              }
              continue;
            }
            const normalizedWithPriceMode = (() => {
              if (priceMode !== 'incl' || normalized.prijs_excl_btw == null) return normalized;
              const parsedIncl = Number(normalized.prijs_excl_btw.toFixed(2));
              const derivedExcl = Number((parsedIncl / 1.21).toFixed(2));
              return {
                ...normalized,
                prijs_excl_btw: derivedExcl,
                prijs_incl_btw: parsedIncl,
              };
            })();
            const key = normalizedWithPriceMode.source_product_id || `${normalizedWithPriceMode.materiaalnaam}|${normalizedWithPriceMode.source_url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            materials.push(normalizedWithPriceMode);
            normalizedAccepted += 1;
          }

          const foundNextUrl = await findNextPageUrl(page);
          nextUrl = foundNextUrl && !visitedForCategory.has(foundNextUrl) ? foundNextUrl : null;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('gestopt')) {
          cancelled = true;
          break;
        }
        failures.push({
          url: nextUrl || category.url,
          message: error instanceof Error ? error.message : 'Scrape mislukt.',
        });
      }
    }

    if (materials.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Geen producten gevonden (cards: ${rawCardsSeen}, valid: ${normalizedAccepted}). Controleer login of pagina-opmaak.`,
        failures,
        rejectedSamples,
      }, { status: 422 });
    }

    let audited = materials.map((row) => deterministicAudit(row, priceMode));
    const uncertain = audited.filter(isUncertainForAi).slice(0, 120);
    if (aiAudit && uncertain.length > 0 && !isCancelRequested()) {
      const aiDecisions = await runAiAudit(uncertain).catch(() => new Map<string, AiAuditDecision>());
      if (aiDecisions.size > 0) {
        audited = audited.map((row) => {
          const key = buildAuditKey(row);
          const decision = aiDecisions.get(key);
          if (!decision) return row;
          const next = { ...row };
          if (decision.status === 'valid' || decision.status === 'review' || decision.status === 'rejected') {
            next.audit_status = decision.status;
          }
          if (safeString(decision.reason)) {
            next.audit_reason = safeString(decision.reason);
          }
          if (typeof decision.corrected_price_excl_btw === 'number' && Number.isFinite(decision.corrected_price_excl_btw)) {
            const corrected = Number(decision.corrected_price_excl_btw.toFixed(2));
            next.prijs_excl_btw = corrected;
            next.prijs_incl_btw = Number((corrected * 1.21).toFixed(2));
          }
          const correctedUnit = safeString(decision.corrected_eenheid);
          if (correctedUnit) next.eenheid = correctedUnit;
          if (typeof decision.confidence === 'number' && Number.isFinite(decision.confidence)) {
            next.audit_confidence = Math.max(0, Math.min(1, decision.confidence));
          }
          return next;
        });
      }
    }

    const rejectedCount = audited.filter((row) => row.audit_status === 'rejected').length;
    const reviewCount = audited.filter((row) => row.audit_status === 'review').length;
    const pricedMaterials = audited.filter((row) => row.audit_status !== 'rejected');

    if (pricedMaterials.length === 0) {
      return NextResponse.json({
        ok: false,
        message: 'Alle regels zijn afgekeurd door de validatie. Controleer URL of filters.',
        failures,
        rejectedCount,
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      materials: pricedMaterials,
      classification: 'manual',
      pagesVisited,
      maxPagesPerUrl,
      pageDelaySeconds,
      priceMode,
      cancelled,
      failures,
      aiAudit,
      reviewCount,
      rejectedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bouwmaat scrape mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
