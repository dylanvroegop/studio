import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
        async function fetchQuoteData() {
            try {
                setLoading(true);
                console.log('Fetching for quoteId:', quoteId);

                const { data, error } = await supabase
                    .from('quotes_collection')
                    .select('*')
                    .eq('quoteid', quoteId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                console.log('Supabase response:', { data, error });

                if (error) {
                    if (error.code === 'PGRST116') {
                        // No rows found - this is fine, just means no calculation yet
                        setCalculation(null);
                    } else {
                        throw error;
                    }
                } else {
                    setCalculation(data);
                }
            } catch (err) {
                console.error('Fetch error:', err);
                // Only set error if it wasn't handled above
                if ((err as any)?.code !== 'PGRST116') {
                    setError(err instanceof Error ? err.message : 'Failed to fetch quote data');
                }
            } finally {
                setLoading(false);
            }
        }

        if (quoteId) {
            fetchQuoteData();
        }
    }, [quoteId]);

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
                setCalculation(prev => prev ? { ...prev, data_json: result.data.data_json } : null);
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
