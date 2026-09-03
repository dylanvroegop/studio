'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CalendarDays, Check, Copy, Loader2, MessageCircle } from 'lucide-react';

import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface AutoMessageClient {
    quoteId: string;
    firstName: string;
    lastName: string;
    companyName: string;
    city: string;
}

function cleanText(value: unknown): string {
    return String(value ?? '').trim();
}

function getQuoteDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
        const seconds = (value as { seconds?: unknown }).seconds;
        if (typeof seconds === 'number') return new Date(seconds * 1000);
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

function getClientInfo(data: Record<string, unknown>): Record<string, unknown> {
    if (data.klantinformatie && typeof data.klantinformatie === 'object') {
        return data.klantinformatie as Record<string, unknown>;
    }
    if (data.client && typeof data.client === 'object') {
        return data.client as Record<string, unknown>;
    }
    return {};
}

function getClientName(client: AutoMessageClient): string {
    return [client.firstName, client.lastName].filter(Boolean).join(' ') || client.companyName;
}

function getGreetingName(client: AutoMessageClient): string {
    return client.firstName || client.companyName || client.lastName || 'klant';
}

function normalizeClientKeyPart(value: string): string {
    return value.toLocaleLowerCase('nl-NL').replace(/[\s-]+/g, '');
}

export function AutoMessagesTab() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [clients, setClients] = useState<AutoMessageClient[]>([]);
    const [selectedQuoteId, setSelectedQuoteId] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (isUserLoading) return;
        if (!user || !firestore) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        const loadWerkbesprekingClients = async () => {
            setIsLoading(true);
            setLoadError(null);

            try {
                // Query only on userId so this keeps working without a composite
                // Firestore index. The status filter is intentionally local.
                const snapshot = await getDocs(query(
                    collection(firestore, 'quotes'),
                    where('userId', '==', user.uid),
                ));

                const clientsByKey = new Map<string, AutoMessageClient>();
                const currentYear = new Date().getFullYear();

                snapshot.docs.forEach((quoteDoc) => {
                    const data = quoteDoc.data() as Record<string, unknown>;
                    const quoteDate = getQuoteDate(data.updatedAt) || getQuoteDate(data.createdAt);
                    if (
                        data.status !== 'werkbespreking'
                        || data.archived === true
                        || data.isCalculationTest === true
                        || !quoteDate
                        || quoteDate.getFullYear() !== currentYear
                    ) return;

                    const info = getClientInfo(data);
                    const factuuradres = info.factuuradres && typeof info.factuuradres === 'object'
                        ? info.factuuradres as Record<string, unknown>
                        : {};
                    const firstName = cleanText(info.voornaam);
                    const lastName = cleanText(info.achternaam);
                    const companyName = cleanText(info.bedrijfsnaam);
                    const city = cleanText(info.plaats || factuuradres.plaats);
                    const displayName = [firstName, lastName].filter(Boolean).join(' ') || companyName;
                    if (!displayName) return;

                    const clientKey = `${normalizeClientKeyPart(displayName)}|${normalizeClientKeyPart(city)}`;

                    if (!clientsByKey.has(clientKey)) {
                        clientsByKey.set(clientKey, {
                            quoteId: quoteDoc.id,
                            firstName,
                            lastName,
                            companyName,
                            city,
                        });
                    }
                });

                const nextClients = [...clientsByKey.values()].sort((a, b) =>
                    getClientName(a).localeCompare(getClientName(b), 'nl', { sensitivity: 'base' }),
                );

                if (cancelled) return;
                setClients(nextClients);
                setSelectedQuoteId((currentSelection) => {
                    if (nextClients.some((client) => client.quoteId === currentSelection)) return currentSelection;
                    return nextClients[0]?.quoteId || '';
                });
            } catch (error) {
                console.error('Kon werkbespreking-klanten niet ophalen:', error);
                if (!cancelled) {
                    setLoadError('De klanten konden niet worden opgehaald.');
                    toast({
                        variant: 'destructive',
                        title: 'Klanten laden mislukt',
                        description: 'Probeer het tabblad opnieuw te openen.',
                    });
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void loadWerkbesprekingClients();

        return () => {
            cancelled = true;
        };
    }, [firestore, isUserLoading, toast, user]);

    const selectedClient = useMemo(
        () => clients.find((client) => client.quoteId === selectedQuoteId) || null,
        [clients, selectedQuoteId],
    );

    const formattedDate = useMemo(() => {
        if (!selectedDate) return '';
        const date = new Date(`${selectedDate}T12:00:00`);
        if (Number.isNaN(date.getTime())) return '';

        return new Intl.DateTimeFormat('nl-NL', {
            day: 'numeric',
            month: 'long',
        }).format(date);
    }, [selectedDate]);

    const message = useMemo(() => {
        const greetingName = selectedClient ? getGreetingName(selectedClient) : '[kies een klant]';
        const appointment = formattedDate ? `${formattedDate} om 19:00` : '[kies een datum]';

        return `Beste ${greetingName},

Bedankt voor uw bericht via Werkspot.

Komt het gelegen dat ik ${appointment}
langs kan komen voor een werkbespreking?

Dan bespreek ik de werkzaamheden met u en maak ik daarna kosteloos een offerte voor u op.

Mvg,
Dylan

Vroegop timmerwerken`;
    }, [formattedDate, selectedClient]);

    const handleCopy = async () => {
        if (!selectedClient || !selectedDate) return;

        try {
            await navigator.clipboard.writeText(message);
            setIsCopied(true);
            toast({ title: 'Bericht gekopieerd', description: 'Je kunt het nu in Werkspot plakken.' });
            window.setTimeout(() => setIsCopied(false), 2000);
        } catch (error) {
            console.error('Kon automatisch bericht niet kopiëren:', error);
            toast({
                variant: 'destructive',
                title: 'Kopiëren mislukt',
                description: 'Selecteer de tekst handmatig en kopieer deze.',
            });
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <section className="rounded-xl border border-border bg-card p-5">
                <div className="mb-5 flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                        <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Werkbespreking-bericht</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Kies een klant en datum voor het standaardbericht.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="auto-message-client" className="text-sm font-medium text-foreground">
                            Klant
                        </label>
                        {isLoading ? (
                            <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Werkbesprekingen laden...
                            </div>
                        ) : clients.length > 0 ? (
                            <select
                                id="auto-message-client"
                                value={selectedQuoteId}
                                onChange={(event) => setSelectedQuoteId(event.target.value)}
                                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            >
                                {clients.map((client) => (
                                    <option key={client.quoteId} value={client.quoteId}>
                                        {getClientName(client)}{client.city ? ` · ${client.city}` : ''}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                                {loadError || 'Geen klanten met status Werkbespreking gevonden.'}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="auto-message-date" className="text-sm font-medium text-foreground">
                            Datum werkbespreking
                        </label>
                        <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="auto-message-date"
                                type="date"
                                value={selectedDate}
                                onChange={(event) => setSelectedDate(event.target.value)}
                                onInput={(event) => setSelectedDate(event.currentTarget.value)}
                                className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2.5">
                        <span className="text-sm text-muted-foreground">Tijd</span>
                        <span className="text-sm font-medium text-foreground">19:00 (standaard)</span>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Voorbeeld bericht</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Controleer het bericht voordat je het naar Werkspot kopieert.</p>
                    </div>
                    <Button
                        type="button"
                        variant="success"
                        className="shrink-0 gap-2"
                        onClick={() => void handleCopy()}
                        disabled={!selectedClient || !selectedDate}
                    >
                        {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {isCopied ? 'Gekopieerd' : 'Kopieer'}
                    </Button>
                </div>
                <textarea
                    aria-label="Automatisch bericht"
                    value={message}
                    readOnly
                    rows={14}
                    className="min-h-[320px] w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none"
                />
            </section>
        </div>
    );
}
