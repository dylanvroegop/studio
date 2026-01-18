'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
    ArrowLeft,
    Pencil,
    ClipboardList,
    Ruler,
    Package,
    Euro,
    Layers,
    ChevronDown
} from "lucide-react";
import type { Job, Quote, Client as ClientType } from "@/lib/types";
import { JobPreview } from "@/components/JobPreview";
import { useUser, useFirestore } from '@/firebase';
import { WorkStatusBadge } from "@/components/WorkStatusBadge";
import { doc, getDoc } from 'firebase/firestore';
import { cn } from "@/lib/utils";

type View = 'drawing' | 'materials' | 'costs' | 'notes';

export default function QuoteDetailPage() {
    const params = useParams();
    const quoteId = params.id as string;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const [quote, setQuote] = useState<Quote | null>(null);
    const [client, setClient] = useState<ClientType | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Layout State
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<View>('costs');

    // Fetch Data
    useEffect(() => {
        if (isUserLoading) return;
        if (!user) return;
        if (!firestore || !quoteId) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const docRef = doc(firestore, 'quotes', quoteId);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    setError("Offerte niet gevonden");
                    setLoading(false);
                    return;
                }

                const quoteData = docSnap.data() as Quote;
                if (quoteData.userId !== user.uid && (quoteData as any).klantinformatie?.userId !== user.uid) {
                    setError("Geen toegang tot deze offerte");
                    setLoading(false);
                    return;
                }

                setQuote({ ...quoteData, id: docSnap.id });

                // Client Info
                const ki: any = (quoteData as any).klantinformatie;
                const factuur = ki?.factuuradres;
                const clientNaam =
                    ki?.klanttype === 'Zakelijk'
                        ? (ki?.bedrijfsnaam || `${ki?.voornaam || ''} ${ki?.achternaam || ''}`.trim())
                        : `${ki?.voornaam || ''} ${ki?.achternaam || ''}`.trim();

                const clientObj: ClientType = {
                    id: 'temp-id',
                    userId: user.uid,
                    naam: clientNaam,
                    email: ki?.['e-mailadres'] || '',
                    telefoon: ki?.telefoonnummer || '',
                    adres: `${factuur?.straat || ''} ${factuur?.huisnummer || ''}`.trim(),
                    postcode: factuur?.postcode || '',
                    plaats: factuur?.plaats || '',
                    createdAt: new Date().toISOString()
                };
                setClient(clientObj);

                // Jobs
                const extractedJobs: Job[] = [];
                const klussenMap: any = (quoteData as any).klussen;

                if (klussenMap && typeof klussenMap === 'object') {
                    Object.keys(klussenMap).forEach(key => {
                        const data = klussenMap[key];
                        extractedJobs.push({
                            id: key,
                            quoteId: docSnap.id,
                            ...data,
                            meta: data.meta || {},
                            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
                        } as Job);
                    });
                }
                setJobs(extractedJobs);
                if (extractedJobs.length > 0) {
                    setActiveJobId(extractedJobs[0].id);
                }

            } catch (err: any) {
                console.error("Error fetching quote:", err);
                setError("Fout bij laden.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [quoteId, user, isUserLoading, firestore]);

    const activeJob = useMemo(() => jobs.find(j => j.id === activeJobId), [jobs, activeJobId]);

    // Derived Values for Drawing Overlay
    const maatwerk = activeJob?.maatwerk?.[0] || {};
    const length = maatwerk.lengte || activeJob?.lengteMm || 0;
    const height = maatwerk.hoogte || activeJob?.hoogteMm || 0;

    if (isUserLoading || loading) return <div className="min-h-screen bg-zinc-950" />;

    if (error || !quote || !client) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-white">
                <h1 className="text-xl font-semibold text-red-500">Fout</h1>
                <p className="text-zinc-400">{error || "Er is iets misgegaan."}</p>
                <Button asChild variant="secondary"><Link href="/dashboard">Terug</Link></Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-hidden">

            {/* 1. HEADER (Minimal) */}
            <header className="shrink-0 z-50 bg-zinc-900/40 backdrop-blur-md border-b border-white/5 h-16 flex items-center px-6 justify-between supports-[backdrop-filter]:bg-zinc-900/40">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h1 className="font-bold text-sm tracking-wide text-zinc-100">{quote.titel}</h1>
                        <span className="text-xs text-zinc-500">{client.naam}</span>
                    </div>
                    <div className="h-6 w-px bg-zinc-800/50 hidden sm:block" />
                    <WorkStatusBadge quote={quote} />
                </div>

                {/* Job Selector (If multiple jobs) */}
                {jobs.length > 1 && (
                    <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-1 bg-zinc-800/50 p-1 rounded-lg border border-white/5">
                        {jobs.map(job => (
                            <button
                                key={job.id}
                                onClick={() => setActiveJobId(job.id)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    activeJobId === job.id
                                        ? "bg-zinc-800 text-white shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {/* Fallback logic: check for 'slug', 'type' (often used for internal names), or 'categorie'. 'omschrijvingKlant' is usually the user-friendly name, but user wants technical name if possible */}
                                {(job as any).slug || (job as any).type || job.categorie || "Naamloze klus"}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            {/* 2. MAIN CONTENT (Scrollable) */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                <div className="max-w-5xl mx-auto h-full flex flex-col items-center justify-center">

                    {!activeJob ? (
                        <div className="text-center py-24 border border-dashed border-zinc-800 rounded-xl w-full">
                            <p className="text-zinc-500">Geen klussen gevonden in deze offerte.</p>
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col gap-6 animate-in fade-in duration-500">

                            {/* View: DRAWING */}
                            {activeView === 'drawing' && (
                                <div className="relative w-full h-full flex flex-col">
                                    {/* Job Title Overlay */}
                                    <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                                        <div>
                                            <h2 className="text-2xl font-light text-zinc-100 drop-shadow-md">
                                                {(activeJob as any).slug || (activeJob as any).type || activeJob.categorie || "Naamloze klus"}
                                            </h2>
                                            <p className="text-zinc-400 text-sm font-medium drop-shadow-md opacity-80">{activeJob.categorie}</p>
                                        </div>
                                        <div className="flex flex-col gap-2 items-end">
                                            {length > 0 && <Badge variant="outline" className="bg-zinc-900/80 backdrop-blur border-emerald-500/30 text-emerald-400 font-mono text-xs"><Ruler className="w-3 h-3 mr-2" />{length}mm</Badge>}
                                            {height > 0 && <Badge variant="outline" className="bg-zinc-900/80 backdrop-blur border-emerald-500/30 text-emerald-400 font-mono text-xs"><Ruler className="w-3 h-3 mr-2 rotate-90" />{height}mm</Badge>}
                                        </div>
                                    </div>

                                    {/* The Visualizer */}
                                    <div className="flex-1 bg-zinc-900/30 border border-zinc-800/50 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center p-8 md:p-16">
                                        <JobPreview job={activeJob} />
                                    </div>
                                </div>
                            )}

                            {/* View: MATERIALS */}
                            {activeView === 'materials' && (
                                <div className="w-full max-w-2xl mx-auto py-12">
                                    <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/30 border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-xl shadow-black/20">
                                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto border border-zinc-700/30">
                                            <Package className="w-8 h-8 text-zinc-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-medium text-white">Nog geen materialen</h3>
                                            <p className="text-zinc-500 mt-2 max-w-xs mx-auto">
                                                De materiaalstaat wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* View: COSTS */}
                            {activeView === 'costs' && (
                                <div className="w-full max-w-2xl mx-auto py-12">
                                    <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/30 border border-zinc-800 rounded-2xl p-8 space-y-8 shadow-xl shadow-black/20">
                                        <div className="flex items-center gap-3 border-b border-zinc-800/50 pb-4">
                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                <Euro className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <h3 className="font-medium text-white">Kostenoverzicht</h3>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-zinc-400">
                                                <span>Arbeid</span>
                                                <span className="font-mono text-zinc-200">€ 0,00</span>
                                            </div>
                                            <div className="flex justify-between items-center text-zinc-400">
                                                <span>Materialen</span>
                                                <span className="font-mono text-zinc-200">€ 0,00</span>
                                            </div>
                                            <div className="flex justify-between items-center text-zinc-400">
                                                <span>Transport</span>
                                                <span className="font-mono text-zinc-200">€ 0,00</span>
                                            </div>
                                            <div className="border-t border-zinc-800/50 pt-4 flex justify-between items-center font-bold text-lg text-white">
                                                <span>Totaal excl. BTW</span>
                                                <span className="font-mono">€ 0,00</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* View: NOTES */}
                            {activeView === 'notes' && (
                                <div className="w-full max-w-2xl mx-auto py-12 h-full flex flex-col">
                                    <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 relative">
                                        <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <ClipboardList className="w-4 h-4" /> Veldnotities
                                        </h3>
                                        <div className="text-base text-zinc-300 leading-relaxed whitespace-pre-wrap font-medium">
                                            {activeJob.notities || <span className="text-zinc-600 italic">Geen notities genoteerd tijdens opname.</span>}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </main>

            {/* 3. STICKY FOOTER NAVIGATION */}
            <footer className="shrink-0 bg-zinc-900/80 backdrop-blur-md border-t border-white/5 pb-safe pt-2 px-6 z-50">
                <div className="max-w-5xl mx-auto flex items-center justify-between py-2">

                    {/* Left: Back */}
                    <div className="flex-1">
                        <Button asChild variant="outline" className="h-10 px-4 rounded-lg gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-zinc-200 dark:border-zinc-800">
                            <Link href="/dashboard">
                                <ArrowLeft className="w-4 h-4" />
                                <span className="hidden sm:inline font-medium">Terug</span>
                            </Link>
                        </Button>
                    </div>

                    {/* Center: Tabs (BottomNav Style) */}
                    <div className="flex items-center gap-2 md:gap-6">
                        <TabButton
                            active={activeView === 'costs'}
                            onClick={() => setActiveView('costs')}
                            icon={<Euro />}
                            label="Kosten"
                        />
                        <TabButton
                            active={activeView === 'materials'}
                            onClick={() => setActiveView('materials')}
                            icon={<Package />}
                            label="Materialen"
                        />
                        <TabButton
                            active={activeView === 'drawing'}
                            onClick={() => setActiveView('drawing')}
                            icon={<Layers />}
                            label="Tekening"
                        />
                        <TabButton
                            active={activeView === 'notes'}
                            onClick={() => setActiveView('notes')}
                            icon={<ClipboardList />}
                            label="Notities"
                        />
                    </div>

                    {/* Right: Actions */}
                    <div className="flex-1 flex justify-end">
                        <Button asChild variant="secondary" className="gap-2 h-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-100 shadow-sm">
                            <Link href={`/offertes/${quote.id}/overzicht`}>
                                <Pencil className="w-4 h-4" />
                                <span className="hidden sm:inline">Bewerken</span>
                            </Link>
                        </Button>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center gap-1 p-2 transition-colors min-w-[64px]",
                active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
            )}
        >
            <div className={cn("[&_svg]:w-6 [&_svg]:h-6", active ? "[&_svg]:stroke-[2.5px]" : "[&_svg]:stroke-2")}>
                {icon}
            </div>
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
        </button>
    )
}

