interface CalculationProgressRow {
    created_at: string;
    status: string;
    data_json?: unknown;
}

/** Alleen een resultaat van de huidige aanvraag mag de wachtstatus beëindigen. */
export function getCalculationProgress(
    quoteStatus: string | undefined,
    startedAtMs: number | null,
    latest: CalculationProgressRow | null,
): { running: boolean; completed: boolean; failed: boolean } {
    const belongsToRun = Boolean(latest && (
        startedAtMs === null || Date.parse(latest.created_at) >= startedAtMs
    ));
    const completed = belongsToRun && latest?.status === 'completed' && Boolean(latest.data_json);
    const failed = belongsToRun && latest?.status === 'failed';
    const running = quoteStatus === 'in_behandeling'
        ? !completed && !failed
        : quoteStatus !== 'fout' && (latest?.status === 'pending' || latest?.status === 'processing');
    return { running, completed, failed };
}

/** Webhook-responstijd is geen starttijd; een run kan dan al afgerond zijn. */
export function resolveCalculationStart(serverStart: unknown, requestedAt: number): number {
    return typeof serverStart === 'number' && Number.isFinite(serverStart) && serverStart > 0
        ? serverStart
        : requestedAt;
}
