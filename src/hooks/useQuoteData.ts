import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface MaterialItem {
    aantal: number;
    product: string;
    prijs_per_stuk?: number;
    totaal_prijs?: number;
}

export interface UrenItem {
    taak: string;
    uren: number;
}

export interface QuoteCalculation {
    id: string;
    quoteid: string;
    gebruikerid: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    data_json: {
        totaal_uren: number;
        grootmaterialen: MaterialItem[];
        verbruiksartikelen: MaterialItem[];
        werkbeschrijving: string[];
        uren_specificatie: UrenItem[];
    };
}

export function useQuoteData(quoteId: string) {
    const [calculation, setCalculation] = useState<QuoteCalculation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchQuoteData() {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('quotes_collection')
                    .select('*')
                    .eq('quoteid', quoteId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error) throw error;
                setCalculation(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch quote data');
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
        if (!calculation) return;

        try {
            const { error } = await supabase
                .from('quotes_collection')
                .update({ data_json: newDataJson })
                .eq('id', calculation.id);

            if (error) throw error;

            setCalculation(prev => prev ? { ...prev, data_json: newDataJson } : null);
        } catch (err) {
            console.error('Failed to update quote data:', err);
            throw err;
        }
    };

    return { calculation, loading, error, updateDataJson };
}
