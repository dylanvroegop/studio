'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuoteData } from '@/hooks/useQuoteData';
import { normalizeDataJson, calculateQuoteTotals, QuoteSettings, QuoteTotals } from '@/lib/quote-calculations';
import { ClientInfoCard } from '@/components/quote/ClientInfoCard';
import { CostSummaryCard } from '@/components/quote/CostSummaryCard';
import { WorkDescriptionCard } from '@/components/quote/WorkDescriptionCard';
import { QuoteSelector } from './QuoteSelector';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, AlertTriangle, CheckCircle2, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { formatCurrency } from '@/lib/quote-calculations';

// Re-defining or importing types if needed, trying to rely on imports
// Assuming QuoteSettings is exported from quote-calculations or types
// If calculateQuoteTotals needs specific types, we ensure we pass them correctly.

export default function ClientViewPage() {
    const params = useParams();
    const id = params?.id as string;
    const firestore = useFirestore();

    const { calculation, loading: calculationLoading, error: calculationError } = useQuoteData(id);
    const [quoteMeta, setQuoteMeta] = useState<any>(null);
    const [businessData, setBusinessData] = useState<any>(null);
    const [settings, setSettings] = useState<QuoteSettings | null>(null);
    const [totals, setTotals] = useState<QuoteTotals | null>(null); // Use appropriate Type

    const [loadingMeta, setLoadingMeta] = useState(true);

    // Fetch Meta & Business Data
    useEffect(() => {
        if (!firestore || !id) return;
        const fetchMeta = async () => {
            setLoadingMeta(true);
            try {
                // 1. Fetch Quote Meta to get User ID (the professional)
                const docRef = doc(firestore, 'quotes', id);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    const data = snap.data();
                    setQuoteMeta(data);

                    // 2. Fetch Business Info of the professional
                    const proId = data.userId || data.klantinformatie?.userId;
                    if (proId) {
                        // Try businesses collection first
                        const busRef = doc(firestore, 'businesses', proId);
                        const busSnap = await getDoc(busRef);
                        if (busSnap.exists()) {
                            setBusinessData(busSnap.data());
                        } else {
                            // Fallback to user profile
                            const userRef = doc(firestore, 'users', proId);
                            const userSnap = await getDoc(userRef);
                            if (userSnap.exists()) {
                                setBusinessData(userSnap.data());
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching meta:", e);
            } finally {
                setLoadingMeta(false);
            }
        };
        fetchMeta();
    }, [id, firestore]);

    // Normalize & Calculate
    useEffect(() => {
        if (calculation?.data_json) {
            const normalized = normalizeDataJson(calculation.data_json);

            // Extract settings
            const rawInst = normalized.instellingen as any;
            const rawExtras = normalized.extras as any;

            const curSettings: QuoteSettings = {
                btwTarief: rawInst?.btwTarief || 21,
                uurTariefExclBtw: rawInst?.uurTariefExclBtw || rawInst?.uurTarief || 50,
                schattingUren: rawInst?.schattingUren ?? false,
                extras: {
                    transport: {
                        prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? 0.30,
                        vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? 0,
                        mode: rawExtras?.transport?.mode ?? 'perKm'
                    },
                    winstMarge: {
                        percentage: rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
                        fixedAmount: rawExtras?.winstMarge?.fixedAmount ?? 0,
                        mode: rawExtras?.winstMarge?.mode ?? 'percentage',
                        basis: rawExtras?.winstMarge?.basis ?? 'totaal'
                    }
                }
            };
            setSettings(curSettings);

            // Calculate Totals using normalized data + settings
            // We need to pass the material arrays. normalizeDataJson returns them.
            // But calculateQuoteTotals expects "Job" structure? 
            // Actually calculateQuoteTotals signature is (job: Job, settings: QuoteSettings).
            // normalizeDataJson returns a structure close to Job.

            const calcData = {
                ...normalized,
                grootmaterialen: normalized.grootmaterialen || [],
                verbruiksartikelen: normalized.verbruiksartikelen || []
            };

            const t = calculateQuoteTotals(calcData as any, curSettings);
            setTotals(t);
        }
    }, [calculation]);

    const loading = calculationLoading || loadingMeta;

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
            </div>
        );
    }

    if (!calculation && !loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
                <div className="text-center">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
                    <h2 className="text-xl font-bold text-white mb-2">Offerte niet gevonden</h2>
                    <p>Deze offerte bestaat niet of is verwijderd.</p>
                </div>
            </div>
        );
    }

    const normalized = calculation?.data_json ? normalizeDataJson(calculation.data_json) : null;
    const clientEmail = normalized?.klantinformatie?.emailadres || (normalized?.klantinformatie as any)?.['e-mailadres'];

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-40">
            {/* Simple Header */}
            <header className="bg-zinc-900 border-b border-zinc-800 p-6">
                <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {/* Logo / Company Name */}
                        <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-900/20">
                            {businessData?.bedrijfsnaam?.[0] || 'O'}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">{businessData?.bedrijfsnaam || 'Uw Vakman'}</h1>
                            <div className="text-sm text-zinc-400 flex items-center gap-3">
                                {businessData?.telefoon && <span className="flex items-center gap-1"><Phone size={12} /> {businessData.telefoon}</span>}
                                {businessData?.email && <span className="flex items-center gap-1"><Mail size={12} /> {businessData.email}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Offerte</div>
                        <div className="text-xl font-mono text-emerald-400">{quoteMeta?.offerteNummer || 'CONCEPT'}</div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">

                {/* Quote Switcher */}
                <QuoteSelector
                    currentQuoteId={id}
                    clientEmail={clientEmail}
                    clientId={quoteMeta?.klantinformatie?.userId} // Pass this just in case, though email is better
                />

                {/* Status Banner */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-1">{normalized?.korteTitel || quoteMeta?.titel || 'Offerte voor werkzaamheden'}</h2>
                        <p className="text-zinc-400 max-w-xl">{normalized?.korteBeschrijving || quoteMeta?.werkomschrijving}</p>
                    </div>
                    {totals && (
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 min-w-[200px] text-right">
                            <div className="text-zinc-500 text-sm mb-1">Totaalbedrag</div>
                            <div className="text-3xl font-bold text-emerald-400">{formatCurrency(totals.totaalInclBtw)}</div>
                            <div className="text-xs text-zinc-600 mt-1">Geldig tot {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL')}</div>
                        </div>
                    )}
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Col: Info & Costs */}
                    <div className="space-y-6">
                        {/* Client Info (Read Only) */}
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                            <div className="bg-zinc-800/50 px-4 py-3 border-b border-zinc-800 font-medium text-zinc-300 flex items-center gap-2">
                                <Building2 size={16} /> Uw Gegevens
                            </div>
                            <div className="p-4 text-sm text-zinc-400 space-y-2">
                                <div className="font-medium text-white text-base">
                                    {normalized?.klantinformatie?.voornaam} {normalized?.klantinformatie?.achternaam}
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin size={14} className="mt-1 shrink-0 text-zinc-600" />
                                    <div>
                                        {normalized?.klantinformatie?.straat} {normalized?.klantinformatie?.huisnummer}<br />
                                        {normalized?.klantinformatie?.postcode} {normalized?.klantinformatie?.plaats}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cost Breakdown (Read Only Summary) */}
                        {totals && settings && (
                            <div className="pointer-events-none">
                                <CostSummaryCard
                                    totals={totals}
                                    settings={settings}
                                    totalUren={normalized?.totaal_uren || 0}
                                    onUpdateHourlyRate={() => { }}
                                    onUpdateTotalHours={() => { }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Col: Description */}
                    <div className="md:col-span-2 space-y-6">
                        <WorkDescriptionCard werkbeschrijving={normalized?.werkbeschrijving || []} />

                        {/* Approval Call to Action - Placeholder */}
                        <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-6 text-center">
                            <h3 className="text-emerald-400 font-bold mb-2">Akkoord gaan met deze offerte?</h3>
                            <p className="text-zinc-400 mb-4 text-sm">Neem contact op met {businessData?.bedrijfsnaam || 'ons'} om de werkzaamheden in te plannen.</p>
                            <div className="flex justify-center gap-4">
                                {businessData?.email && (
                                    <a href={`mailto:${businessData.email}?subject=Akkoord Offerte ${quoteMeta?.offerteNummer}`} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
                                        <Mail size={16} /> Mailen
                                    </a>
                                )}
                                {businessData?.telefoon && (
                                    <a href={`tel:${businessData.telefoon}`} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors border border-zinc-700 flex items-center gap-2">
                                        <Phone size={16} /> Bellen
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}

