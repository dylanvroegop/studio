export type OperationalErrorSeverity = 'error' | 'warning' | 'critical';

export interface ReportOperationalErrorInput {
  source: string;
  title: string;
  message: string;
  severity?: OperationalErrorSeverity;
  context?: unknown;
}

const REPORT_DEDUPE_WINDOW_MS = 15000;
const recentReports = new Map<string, number>();

function pruneOldReports(now: number): void {
  recentReports.forEach((timestamp, key) => {
    if (now - timestamp > REPORT_DEDUPE_WINDOW_MS) {
      recentReports.delete(key);
    }
  });
}

function shouldSkipDuplicate(key: string): boolean {
  const now = Date.now();
  pruneOldReports(now);

  const previous = recentReports.get(key);
  if (previous && now - previous < REPORT_DEDUPE_WINDOW_MS) {
    return true;
  }

  recentReports.set(key, now);
  return false;
}

function normalizeText(value: string, fallback: string): string {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function reportOperationalError(input: ReportOperationalErrorInput): Promise<void> {
  if (typeof window === 'undefined') return;

  const source = normalizeText(input.source, 'unknown');
  const title = normalizeText(input.title, 'Onbekende fout');
  const message = normalizeText(input.message, 'Geen foutmelding opgegeven.');
  const severity = input.severity ?? 'error';
  const dedupeKey = `${source}|${title}|${message}`;

  if (shouldSkipDuplicate(dedupeKey)) return;

  try {
    const { getAuth } = await import('firebase/auth');
    const token = await getAuth().currentUser?.getIdToken().catch(() => null);
    if (!token) return;

    await fetch('/api/errors/report', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source,
        title,
        message,
        severity,
        context: input.context ?? null,
        route: window.location.pathname,
        url: window.location.href,
        clientTimestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
    });
  } catch {
    // Reporting failures are intentionally ignored to avoid impacting the user flow.
  }
}
