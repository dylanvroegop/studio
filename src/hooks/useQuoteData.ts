import { useEffect, useState } from 'react';
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

export function useQuoteData(quoteId: string) {
    const { user } = useUser();
    const [calculation, setCalculation] = useState<QuoteCalculation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        let pollTimer: NodeJS.Timeout;

        async function fetchQuoteData() {
            if (!user) return;

            try {
                // Only set loading to true on the very first call if we don't have data yet
                // But generally, we want the UI to know we are "waiting" for completion.
                // We'll keep loading=true as long as we don't have a 'completed' status.

                console.log('Fetching for quoteId:', quoteId);
                const token = await user.getIdToken();
                const response = await fetch('/api/quotes/get-calculations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        quoteId,
                        latestOnly: true,
                    }),
                });

                const result = await response.json();
                if (!response.ok || !result.ok) {
                    throw new Error(result.message || 'Failed to fetch quote data');
                }

                const data = result.row as QuoteCalculation | null;
                const hasDataJson = Boolean(data?.data_json);

                if (isMounted) {
                    setCalculation(data);

                    if (!data) {
                        // No calculation has been started yet.
                        setLoading(false);
                        return;
                    }

                    if (hasDataJson || data.status === 'completed') {
                        setLoading(false);
                    } else {
                        setLoading(true);
                        // Still processing, poll in 3s.
                        pollTimer = setTimeout(fetchQuoteData, 3000);
                    }
                }
            } catch (err) {
                console.error('Fetch error:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch quote data');
                    setLoading(false);
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
    }, [quoteId, user]);


    // Function to update the data_json (for price edits)
    const updateDataJson = async (newDataJson: QuoteCalculation['data_json']) => {
        console.log('💾 [updateDataJson] Starting update...', {
            hasCalculation: !!calculation,
            calculationId: calculation?.id,
            groot: (newDataJson as any)?.grootmaterialen?.length,
            verbruik: (newDataJson as any)?.verbruiksartikelen?.length
        });

        if (!calculation) {
            console.error('❌ [updateDataJson] No calculation!');
            return;
        }

        if (!user) {
            console.error('❌ [updateDataJson] No user authenticated!');
            return;
        }

        try {
            console.log('📤 [updateDataJson] Calling API route...');
            const token = await user.getIdToken();

            const response = await fetch('/api/quotes/update-data-json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    calculation_id: calculation.id,
                    data_json: newDataJson
                })
            });

            const result = await response.json();

            console.log('📥 [updateDataJson] API response:', {
                ok: result.ok,
                hasData: !!result.data,
                status: response.status
            });

            if (!result.ok) {
                console.error('❌ [updateDataJson] API error:', result.message);
                throw new Error(result.message || 'Failed to update');
            }

            // Update was successful, use the returned data
            if (result.data) {
                console.log('✅ [updateDataJson] Update successful, setting calculation');
                console.log('🔍 [DEBUG] Returned data_json totaal_uren:', (result.data.data_json as any)?.totaal_uren);
                setCalculation(prev => {
                    const updated = prev ? { ...prev, data_json: result.data.data_json } : null;
                    console.log('🔧 [STATE] setCalculation called:', {
                        prev_totaal: (prev?.data_json as any)?.totaal_uren,
                        new_totaal: (result.data.data_json as any)?.totaal_uren,
                        same_ref: prev?.data_json === result.data.data_json
                    });
                    return updated;
                });
            } else {
                console.log('⚠️ [updateDataJson] No data returned, using optimistic update');
                setCalculation(prev => prev ? { ...prev, data_json: newDataJson } : null);
            }
        } catch (err) {
            console.error('❌ [updateDataJson] Failed to update quote data:', err);
            throw err;
        }
    };

    return { calculation, loading, error, updateDataJson };
}
