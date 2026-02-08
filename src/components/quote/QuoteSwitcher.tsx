'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { ChevronDown, FileText, Check, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

export function QuoteSwitcher({ currentQuoteId }: QuoteSwitcherProps) {
    const router = useRouter();
    const { user } = useUser();
    const firestore = useFirestore();
    const [quotes, setQuotes] = useState<QuoteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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

    // Reset search when opening/closing popover
    useEffect(() => {
        if (!open) {
            setSearchQuery('');
        }
    }, [open]);

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

    // Filter quotes based on search query
    const filteredQuotes = quotes.filter(quote => {
        if (!searchQuery.trim()) return true;

        const search = searchQuery.toLowerCase();
        const quoteNumber = (quote.offerteNummer || '').toLowerCase();
        const clientName = [quote.klantinformatie?.voornaam, quote.klantinformatie?.achternaam]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        const title = (quote.titel || '').toLowerCase();
        const location = (quote.klantinformatie?.plaats || '').toLowerCase();

        return quoteNumber.includes(search) ||
               clientName.includes(search) ||
               title.includes(search) ||
               location.includes(search);
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                    <FileText size={16} />
                    Alle offertes
                    <ChevronDown size={14} />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-96 p-0 bg-card border-border"
                align="start"
            >
                {/* Search Input */}
                <div className="p-3 border-b border-border">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Zoek offerte, klant, plaats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-muted/50 border-border"
                        />
                    </div>
                </div>

                {/* Quote List */}
                <div className="max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">Laden...</div>
                    ) : filteredQuotes.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            {searchQuery ? 'Geen offertes gevonden' : 'Geen offertes beschikbaar'}
                        </div>
                    ) : (
                        filteredQuotes.map(quote => {
                            const isActive = quote.id === currentQuoteId;
                            const clientName = [quote.klantinformatie?.voornaam, quote.klantinformatie?.achternaam]
                                .filter(Boolean)
                                .join(' ') || 'Onbekende klant';
                            const totalAmount = quote.totaalbedrag || quote.amount || 0;

                            return (
                                <button
                                    key={quote.id}
                                    onClick={() => handleSelect(quote.id)}
                                    className={`w-full p-3 text-left hover:bg-accent transition-colors flex items-center justify-between gap-2 border-b border-border/50 last:border-0 ${
                                        isActive ? 'bg-accent/50' : ''
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm text-emerald-500 font-medium">
                                                {quote.offerteNummer || 'Concept'}
                                            </span>
                                            {isActive && <Check size={14} className="text-emerald-500" />}
                                        </div>
                                        <div className="text-sm text-foreground truncate">{clientName}</div>
                                        {quote.titel && (
                                            <div className="text-xs text-muted-foreground truncate">{quote.titel}</div>
                                        )}
                                    </div>
                                    <div className="text-sm font-medium text-muted-foreground shrink-0">
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
