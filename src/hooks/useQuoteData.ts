import { useCallback, useEffect, useRef, useState } from 'react';
import { DataJson } from '@/lib/quote-calculations';
import { useUser } from '@/firebase/provider';

export interface QuoteCalculation {
    id: string;
    quoteid: string;
    gebruikerid: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    data_json: DataJson;
}

interface UseQuoteDataOptions {
    pollWhenMissing?: boolean;
    pollIntervalMs?: number;
    preferCompletedFallback?: boolean;
}

function extractErrorMessage(err: unknown): string {
    if (err instanceof Error && typeof err.message === 'string') return err.message;
    return String(err ?? 'Onbekende fout');
}

interface ApiErrorPayload {
    ok?: boolean;
    message?: string;
}

class TransientApiResponseError extends Error {}

async function parseApiJson<T extends ApiErrorPayload>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();

    if (!contentType.toLowerCase().includes('application/json')) {
        const status = response.status || 0;
        throw new TransientApiResponseError(
            `De server gaf tijdelijk geen geldig antwoord${status ? ` (HTTP ${status})` : ''}.`
        );
    }

    try {
        return JSON.parse(rawBody) as T;
    } catch {
        throw new TransientApiResponseError('De server gaf tijdelijk een onvolledig antwoord.');
    }
}

async function getUserTokenSafe(user: { getIdToken: () => Promise<string> } | null): Promise<string | null> {
    if (!user) return null;
    try {
        return await user.getIdToken();
    } catch (err) {
        console.warn('⚠️ [useQuoteData] getIdToken failed, using cached fallback if available:', err);
        const cached = (user as { stsTokenManager?: { accessToken?: unknown } })
            .stsTokenManager?.accessToken;
        if (typeof cached === 'string' && cached.length > 0) {
            return cached;
        }
        return null;
    }
}

export function useQuoteData(quoteId: string, options?: UseQuoteDataOptions) {
    const { user } = useUser();
    const pollWhenMissing = options?.pollWhenMissing === true;
    const pollIntervalMs = Number.isFinite(options?.pollIntervalMs)
        ? Math.max(1000, Number(options?.pollIntervalMs))
        : 5000;
    const preferCompletedFallback = options?.preferCompletedFallback !== false;
    const [calculation, setCalculation] = useState<QuoteCalculation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const calculationRef = useRef<QuoteCalculation | null>(null);
    const lastSyncedDataJsonSignatureRef = useRef<string | null>(null);
    const latestRequestedDataJsonSignatureRef = useRef<string | null>(null);
    const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
    const mutationVersionRef = useRef(0);

    useEffect(() => {
        calculationRef.current = calculation;
    }, [calculation]);

    useEffect(() => {
        let isMounted = true;
        let pollTimer: NodeJS.Timeout;
        const POLL_INTERVAL_MS = pollIntervalMs;
        const RETRY_INTERVAL_MS = 5000;

        async function fetchQuoteData() {
            if (!user) return;

            try {
                // Only set loading to true on the very first call if we don't have data yet
                // But generally, we want the UI to know we are "waiting" for completion.
                // We'll keep loading=true as long as we don't have a 'completed' status.

                const token = await getUserTokenSafe(user);
                if (!token) {
                    throw new Error('Authenticatie tijdelijk niet beschikbaar. Controleer je internetverbinding en probeer opnieuw.');
                }
                const response = await fetch('/api/quotes/get-calculations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        quoteId,
                        latestOnly: true,
                        preferCompletedFallback,
                    }),
                });

                const result = await parseApiJson<{
                    ok?: boolean;
                    message?: string;
                    row?: QuoteCalculation | null;
                }>(response);
                if (!response.ok || !result.ok) {
                    throw new Error(result.message || 'Failed to fetch quote data');
                }

                const data = result.row as QuoteCalculation | null;
                const hasDataJson = Boolean(data?.data_json);

                if (isMounted) {
                    setError(null);
                    setCalculation(data);
                    calculationRef.current = data;
                    lastSyncedDataJsonSignatureRef.current = data?.data_json ? JSON.stringify(data.data_json) : null;

                    if (!data) {
                        // Calculation may still be creating the row (n8n webhook path).
                        if (pollWhenMissing) {
                            setLoading(true);
                            pollTimer = setTimeout(fetchQuoteData, POLL_INTERVAL_MS);
                            return;
                        }
                        setLoading(false);
                        return;
                    }

                    if (data.status === 'failed') {
                        setLoading(false);
                        setError('De calculatie is mislukt. Start de berekening opnieuw.');
                        return;
                    }

                    if (hasDataJson || data.status === 'completed') {
                        setLoading(false);
                    } else {
                        setLoading(true);
                        // Still processing, keep polling with configured interval.
                        pollTimer = setTimeout(fetchQuoteData, POLL_INTERVAL_MS);
                    }
                }
            } catch (err) {
                console.error('Fetch error:', err);
                if (isMounted) {
                    const message = err instanceof Error ? err.message : 'Failed to fetch quote data';
                    const isTransientResponse = err instanceof TransientApiResponseError;

                    // App Hosting can briefly return an HTML error document while an
                    // instance starts or a deployment switches over. Keep retrying
                    // without replacing the entire quote page with a parser error.
                    if (!isTransientResponse) {
                        setError(message);
                    }

                    const hasResolvedData = Boolean(calculationRef.current?.data_json);
                    if (hasResolvedData) {
                        setLoading(false);
                        return;
                    }

                    // Keep polling after transient API/network errors so the UI updates without manual refresh.
                    setLoading(true);
                    pollTimer = setTimeout(fetchQuoteData, RETRY_INTERVAL_MS);
                }
            }
        }

        if (quoteId) {
            fetchQuoteData();
        }

        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [quoteId, user, pollWhenMissing, pollIntervalMs, preferCompletedFallback]);


    // Function to update the data_json (for price edits)
    const updateDataJson = useCallback(async (newDataJson: QuoteCalculation['data_json']) => {
        const currentCalculation = calculationRef.current;
        if (!currentCalculation) {
            return;
        }

        if (!user) {
            return;
        }

        const nextSignature = JSON.stringify(newDataJson);

        // Prevent duplicate writes, including repeated blur events for a payload
        // that is already waiting in the queue.
        if (
            nextSignature === latestRequestedDataJsonSignatureRef.current
            || nextSignature === lastSyncedDataJsonSignatureRef.current
        ) {
            return;
        }

        const mutationVersion = ++mutationVersionRef.current;
        latestRequestedDataJsonSignatureRef.current = nextSignature;

        // Apply edits immediately. Persisting is serialized below, so an older
        // server response can never make a deleted/edited row flash back in.
        const optimisticCalculation = { ...currentCalculation, data_json: newDataJson };
        calculationRef.current = optimisticCalculation;
        setCalculation(optimisticCalculation);
        setError(null);

        const persist = async (): Promise<void> => {
            const token = await getUserTokenSafe(user);
            if (!token) {
                throw new Error('Authenticatie tijdelijk niet beschikbaar. Controleer je internetverbinding en probeer opnieuw.');
            }

            const response = await fetch('/api/quotes/update-data-json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    calculation_id: currentCalculation.id,
                    data_json: newDataJson
                })
            });

            const result = await parseApiJson<{
                ok?: boolean;
                message?: string;
                data?: QuoteCalculation;
            }>(response);

            if (!response.ok || !result.ok) {
                throw new Error(result.message || 'Failed to update');
            }

            const persistedDataJson = result.data?.data_json ?? newDataJson;
            lastSyncedDataJsonSignatureRef.current = JSON.stringify(persistedDataJson);

            // A newer optimistic edit may already be visible. Never replace it
            // with this older response while that newer write waits its turn.
            if (mutationVersionRef.current === mutationVersion) {
                const persistedCalculation = {
                    ...(calculationRef.current ?? currentCalculation),
                    data_json: persistedDataJson,
                };
                calculationRef.current = persistedCalculation;
                setCalculation(persistedCalculation);
            }
        };

        const queuedWrite = writeQueueRef.current
            .catch(() => undefined)
            .then(persist);
        writeQueueRef.current = queuedWrite.catch(() => undefined);

        try {
            await queuedWrite;
        } catch (err) {
            console.error('Failed to update quote data:', err);
            const message = extractErrorMessage(err);
            setError(message.includes('auth/network-request-failed')
                ? 'Geen verbinding met authenticatie. Controleer je internet en probeer opnieuw.'
                : message);
            if (mutationVersionRef.current === mutationVersion) {
                latestRequestedDataJsonSignatureRef.current = null;
            }
            throw err;
        }
    }, [user]);

    const updateDataJsonPatch = useCallback(async (patch: Record<string, unknown>) => {
        const currentCalculation = calculationRef.current;
        if (!currentCalculation || !user) {
            throw new Error('Offerte-data is nog niet beschikbaar.');
        }

        const mutationVersion = ++mutationVersionRef.current;
        const currentRoot = Array.isArray(currentCalculation.data_json)
            ? currentCalculation.data_json[0]
            : currentCalculation.data_json;
        const optimisticDataJson = {
            ...(currentRoot && typeof currentRoot === 'object' ? currentRoot : {}),
            ...patch,
        } as QuoteCalculation['data_json'];
        const optimisticCalculation = { ...currentCalculation, data_json: optimisticDataJson };
        calculationRef.current = optimisticCalculation;
        latestRequestedDataJsonSignatureRef.current = JSON.stringify(optimisticDataJson);
        setCalculation(optimisticCalculation);
        setError(null);

        let persisted: QuoteCalculation['data_json'] = optimisticDataJson;
        const persist = async (): Promise<void> => {
            const token = await getUserTokenSafe(user);
            if (!token) {
                throw new Error('Authenticatie tijdelijk niet beschikbaar.');
            }

            const response = await fetch('/api/quotes/update-data-json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    calculation_id: currentCalculation.id,
                    data_json_patch: patch,
                }),
            });
            const result = await parseApiJson<{
                ok?: boolean;
                message?: string;
                data?: QuoteCalculation;
            }>(response).catch(() => null);
            if (!response.ok || !result?.ok || !result.data?.data_json) {
                throw new Error(result?.message || 'Kon offerte-data niet opslaan.');
            }

            persisted = result.data.data_json as QuoteCalculation['data_json'];
            lastSyncedDataJsonSignatureRef.current = JSON.stringify(persisted);
            if (mutationVersionRef.current === mutationVersion) {
                const persistedCalculation = {
                    ...(calculationRef.current ?? currentCalculation),
                    data_json: persisted,
                };
                calculationRef.current = persistedCalculation;
                setCalculation(persistedCalculation);
            }
        };

        const queuedWrite = writeQueueRef.current
            .catch(() => undefined)
            .then(persist);
        writeQueueRef.current = queuedWrite.catch(() => undefined);
        await queuedWrite;
        return persisted;
    }, [user]);

    return { calculation, loading, error, updateDataJson, updateDataJsonPatch };
}
