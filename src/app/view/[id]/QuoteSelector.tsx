'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileText, ArrowRight, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/quote-calculations';

interface QuoteSelectorProps {
    currentQuoteId: string;
    clientId?: string; // userId of the client
    clientEmail?: string; // fallback if no userId
}

export function QuoteSelector({ currentQuoteId, clientId, clientEmail }: QuoteSelectorProps) {
    const firestore = useFirestore();
    const router = useRouter();
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!firestore) return;

        // We need at least one identifier
        if (!clientId && !clientEmail) return;

        const fetchQuotes = async () => {
            setLoading(true);
            try {
                // Determine query strategy
                // Ideally we query by userId (owner of the quote? No, that's the pro)
                // We want quotes FOR this client. 
                // In the current schema, 'klantinformatie.userId' is the PRO's ID.
                // 'userId' on the quote is also the PRO's ID.
                // We need to match on client details.
                // This is tricky without a dedicated 'clientId' field for the end-client.
                // We will match by email address in 'klantinformatie.emailadres' or 'klantinformatie.e-mailadres'

                // NOTE: querying deep fields might require an index or be slow/restricted.
                // Let's rely on the passed email for now.

                if (!clientEmail) {
                    // Fallback: if we only have PRO's generic userId, we can't easily find other quotes for THIS specific client 
                    // unless we filter locally or have a better query.
                    // For now, let's assume we can't find others if no email.
                    setLoading(false);
                    return;
                }

                const q = query(
                    collection(firestore, 'quotes'),
                    // field path format for nested fields
                    where('klantinformatie.emailadres', '==', clientEmail),
                    // where('klantinformatie.e-mailadres', '==', clientEmail), // Try not to use special chars in keys if possible, check schema
                    // orderBy('createdAt', 'desc') // Requires index
                );

                // Fallback query if email is stored differently? 
                // Let's try to query by the email field we know exsits.

                const snap = await getDocs(q);
                const found: any[] = [];
                snap.forEach(doc => {
                    if (doc.id !== currentQuoteId) {
                        found.push({ id: doc.id, ...doc.data() });
                    }
                });

                setQuotes(found);

            } catch (err) {
                console.error("Error fetching related quotes:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchQuotes();
    }, [firestore, clientId, clientEmail, currentQuoteId]);

    if (loading) return <div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Zoeken naar andere offertes...</div>;

    if (quotes.length === 0) return null;

    return (
        <Card className="bg-zinc-900 border-zinc-800 p-4 mb-6">
            <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Andere offertes voor u</h3>
            <div className="space-y-2">
                {quotes.map(quote => (
                    <div
                        key={quote.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer group border border-zinc-700/50 hover:border-zinc-600"
                        onClick={() => router.push(`/view/${quote.id}`)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500/20">
                                <FileText size={14} />
                            </div>
                            <div>
                                <div className="font-medium text-zinc-200 text-sm">{quote.offerteNummer || 'Concept'}</div>
                                <div className="text-xs text-zinc-500">{quote.titel || 'Geen titel'}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-zinc-300">
                                {formatCurrency(quote.totaalbedrag || quote.amount || 0)}
                            </span>
                            <ArrowRight size={14} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
