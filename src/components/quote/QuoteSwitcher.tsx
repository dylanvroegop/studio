'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { ChevronDown, FileText, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/quote-calculations';

interface QuoteItem {
    id: string;
    offerteNummer?: string;
    titel?: string;
    totaalbedrag?: number;
    amount?: number;
    createdAt?: Timestamp;
    klantinformatie?: {
        voornaam?: string;
        achternaam?: string;
        plaats?: string;
    };
}

interface QuoteSwitcherProps {
    currentQuoteId: string;
    currentQuoteNumber?: string;
}

export function QuoteSwitcher({ currentQuoteId, currentQuoteNumber }: QuoteSwitcherProps) {
    const router = useRouter();
    const { user } = useUser();
    const firestore = useFirestore();
    const [quotes, setQuotes] = useState<QuoteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!user || !firestore) return;

        const fetchQuotes = async () => {
            setLoading(true);
            try {
                // Query without orderBy to avoid composite index requirement
                const q = query(
                    collection(firestore, 'quotes'),
                    where('userId', '==', user.uid)
                );

                const snap = await getDocs(q);
                const items: QuoteItem[] = [];
                snap.forEach(doc => {
                    items.push({ id: doc.id, ...doc.data() } as QuoteItem);
                });

                // Sort client-side by createdAt (most recent first)
                items.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });

                setQuotes(items);
            } catch (err) {
                console.error('Error fetching quotes:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchQuotes();
    }, [user, firestore]);

    // Force close popover when navigating to prevent focus-scope loops
    useEffect(() => {
        setOpen(false);
    }, [currentQuoteId]);

    const handleSelect = (quoteId: string) => {
        // Close popover BEFORE navigation to prevent focus-scope issues
        setOpen(false);

        if (quoteId !== currentQuoteId) {
            // Small delay to let popover close cleanly
            setTimeout(() => {
                router.push(`/offertes/${quoteId}`);
            }, 50);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="gap-2 text-white hover:bg-zinc-800 font-bold text-xl h-auto py-1 px-2"
                >
                    <FileText size={18} className="text-emerald-500" />
                    {currentQuoteNumber || 'Offerte'}
                    <ChevronDown size={16} className="text-zinc-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 bg-zinc-900 border-zinc-800"
                align="start"
            >
                <div className="p-2 border-b border-zinc-800">
                    <div className="text-xs text-zinc-500 uppercase font-semibold px-2">Alle offertes</div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center text-zinc-500 text-sm">Laden...</div>
                    ) : quotes.length === 0 ? (
                        <div className="p-4 text-center text-zinc-500 text-sm">Geen offertes gevonden</div>
                    ) : (
                        quotes.map(quote => {
                            const isActive = quote.id === currentQuoteId;
                            const clientName = [quote.klantinformatie?.voornaam, quote.klantinformatie?.achternaam]
                                .filter(Boolean)
                                .join(' ') || 'Onbekende klant';
                            const totalAmount = quote.totaalbedrag || quote.amount || 0;

                            return (
                                <button
                                    key={quote.id}
                                    onClick={() => handleSelect(quote.id)}
                                    className={`w-full p-3 text-left hover:bg-zinc-800 transition-colors flex items-center justify-between gap-2 ${isActive ? 'bg-zinc-800/50' : ''
                                        }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm text-emerald-400">
                                                {quote.offerteNummer || 'Concept'}
                                            </span>
                                            {isActive && <Check size={14} className="text-emerald-500" />}
                                        </div>
                                        <div className="text-sm text-zinc-300 truncate">{clientName}</div>
                                        {quote.titel && (
                                            <div className="text-xs text-zinc-500 truncate">{quote.titel}</div>
                                        )}
                                    </div>
                                    <div className="text-sm font-medium text-zinc-400 shrink-0">
                                        {formatCurrency(totalAmount)}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
