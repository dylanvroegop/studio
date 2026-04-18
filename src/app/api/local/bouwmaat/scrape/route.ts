import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

import { initFirebaseAdmin } from '@/firebase/admin';
import {
  type BouwmaatCategoryInput,
  extractBouwmaatProductsFromPage,
  getBouwmaatBrowserProfilePath,
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
};

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

function normalizeUrls(raw: unknown): BouwmaatCategoryInput[] {
  if (!Array.isArray(raw)) return [];
  const rows: BouwmaatCategoryInput[] = [];
  raw.slice(0, 25).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const url = safeString(row.url);
      if (!url || !/^https:\/\/(?:www\.)?bouwmaat\.nl\//i.test(url)) return null;
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

    const byRel = anchors.find((anchor) => anchor.rel?.toLowerCase().split(/\s+/).includes('next'));
    if (byRel?.href) return byRel.href;

    const currentPageNumber = Number.parseInt(current.searchParams.get('page') || '1', 10) || 1;
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

        const pageParam = Number.parseInt(url.searchParams.get('page') || '', 10);
        const numericLabel = Number.parseInt(label, 10);
        const isExplicitNext =
          /\b(volgende|next)\b/.test(label)
          || label === '›'
          || label === '>'
          || label.includes('next page')
          || label.includes('volgende pagina');

        return {
          href,
          isExplicitNext,
          pageNumber: Number.isFinite(pageParam) ? pageParam : (Number.isFinite(numericLabel) ? numericLabel : null),
        };
      })
      .filter((item): item is { href: string; isExplicitNext: boolean; pageNumber: number | null } => Boolean(item));

    const explicit = candidates.find((item) => item.isExplicitNext);
    if (explicit) return explicit.href;

    const numbered = candidates
      .filter((item) => typeof item.pageNumber === 'number' && item.pageNumber > currentPageNumber)
      .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0))[0];

    return numbered?.href || null;
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
  return 5;
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

async function waitBetweenPages(baseSeconds: number): Promise<void> {
  const baseMs = baseSeconds * 1000;
  const jitterMs = randomInt(1000, 5000);
  await sleepCancellable(baseMs + jitterMs);
}

export async function POST(request: Request) {
  try {
    if (!isLocalRequest(request)) {
      return NextResponse.json(
        { ok: false, message: 'Bouwmaat import is alleen lokaal beschikbaar.' },
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
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, message: 'Voeg minimaal één Bouwmaat URL toe.' }, { status: 400 });
    }

    const context = await getContext();
    const page = context.pages()[0] || await context.newPage();
    const materials = [];
    const failures = [];
    const seen = new Set<string>();
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
          for (const raw of rawProducts) {
            const normalized = normalizeBouwmaatProduct(raw, category);
            if (!normalized) continue;
            const key = normalized.source_product_id || `${normalized.materiaalnaam}|${normalized.source_url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            materials.push(normalized);
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
        message: 'Geen producten gevonden. Controleer of je in de geopende Bouwmaat browser bent ingelogd.',
        failures,
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      materials,
      classification: 'manual',
      pagesVisited,
      maxPagesPerUrl,
      pageDelaySeconds,
      cancelled,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bouwmaat scrape mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
