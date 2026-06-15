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

async function getUserTokenSafe(user: { getIdToken: () => Promise<string> } | null): Promise<string | null> {
    if (!user) return null;
    try {
        return await user.getIdToken();
    } catch (err) {
        console.warn('⚠️ [useQuoteData] getIdToken failed, using cached fallback if available:', err);
        const cached = (user as any)?.stsTokenManager?.accessToken;
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
    const inFlightDataJsonSignatureRef = useRef<string | null>(null);

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

                const result = await response.json();
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
                    setError(message);

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
        const currentSignature = currentCalculation.data_json
            ? JSON.stringify(currentCalculation.data_json)
            : null;

        // Prevent duplicate writes when nothing actually changed.
        if (nextSignature === currentSignature || nextSignature === lastSyncedDataJsonSignatureRef.current) {
            return;
        }

        // Prevent overlapping duplicate requests for the same payload.
        if (inFlightDataJsonSignatureRef.current === nextSignature) {
            return;
        }

        inFlightDataJsonSignatureRef.current = nextSignature;

        try {
            const token = await getUserTokenSafe(user);
            if (!token) {
                setError('Authenticatie tijdelijk niet beschikbaar. Controleer je internetverbinding en probeer opnieuw.');
                inFlightDataJsonSignatureRef.current = null;
                return;
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

            const result = await response.json();

            if (!result.ok) {
                throw new Error(result.message || 'Failed to update');
            }

            // Update was successful, use the returned data
            if (result.data) {
                const returnedSignature = JSON.stringify(result.data.data_json);
                setCalculation(prev => prev ? { ...prev, data_json: result.data.data_json } : null);
                calculationRef.current = currentCalculation
                    ? { ...currentCalculation, data_json: result.data.data_json }
                    : currentCalculation;
                lastSyncedDataJsonSignatureRef.current = returnedSignature;
            } else {
                setCalculation(prev => prev ? { ...prev, data_json: newDataJson } : null);
                calculationRef.current = currentCalculation
                    ? { ...currentCalculation, data_json: newDataJson }
                    : currentCalculation;
                lastSyncedDataJsonSignatureRef.current = nextSignature;
            }
        } catch (err) {
            console.error('Failed to update quote data:', err);
            const message = extractErrorMessage(err);
            setError(message.includes('auth/network-request-failed')
                ? 'Geen verbinding met authenticatie. Controleer je internet en probeer opnieuw.'
                : message);
            throw err;
        } finally {
            inFlightDataJsonSignatureRef.current = null;
        }
    }, [user]);

    return { calculation, loading, error, updateDataJson };
}
