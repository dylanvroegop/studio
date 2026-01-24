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
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { cn, parsePriceToNumber } from "@/lib/utils";
import { fetchMaterialsFromN8nAction, checkCalculationStatusAction } from "@/lib/actions";
import { supabase } from "@/lib/supabase";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type View = 'drawing' | 'materials' | 'costs' | 'notes' | 'testing';

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

    console.log("Render State:", {
        loading,
        isUserLoading,
        hasUser: !!user,
        hasFirestore: !!firestore,
        jobsCount: jobs.length,
        activeJobId
    });



    // Fetch Data
    useEffect(() => {
        if (isUserLoading) return;

        if (!user) {
            setLoading(false);
            setError("Niet ingelogd");
            return;
        }

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

                        // Normalize 'maatwerk' field which has a dynamic key like '{slug}_maatwerk'
                        let normalizedMaatwerk = data.maatwerk;
                        if (!normalizedMaatwerk) {
                            const match = Object.keys(data).find(k => k.endsWith('_maatwerk'));
                            if (match) {
                                normalizedMaatwerk = data[match];
                            }
                        }

                        extractedJobs.push({
                            id: key,
                            quoteId: docSnap.id,
                            ...data,
                            // Ensure standard field is populated
                            maatwerk: normalizedMaatwerk || [],
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

    // Material List State (Derived)
    const materialList = useMemo(() => {
        if (activeJob?.materialen && Array.isArray(activeJob.materialen)) {
            return activeJob.materialen;
        }
        return [];
    }, [activeJob?.materialen]);

    const [isCalculating, setIsCalculating] = useState(false);

    // Fetch Materials via n8n & Supabase Polling
    const [fetchedJobIds, setFetchedJobIds] = useState<Set<string>>(new Set());
    const [debugData, setDebugData] = useState<any>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [pollingStatus, setPollingStatus] = useState<'idle' | 'polling' | 'completed' | 'error'>('idle');
    const [polledMaterials, setPolledMaterials] = useState<any[]>([]);

    const handleTestFetch = async () => {
        if (!activeJob) return;
        setIsTesting(true);
        // Reset state so polling starts fresh
        setPollingStatus('idle');
        setIsCalculating(true);

        try {
            await fetchMaterialsFromN8nAction(activeJob);
            setPollingStatus('polling');
        } catch (e) {
            console.error(e);
            setPollingStatus('error');
        } finally {
            setIsTesting(false);
        }
    };

    // Polling Logic
    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        if (pollingStatus === 'polling' && activeJob && user) {
            console.log("Starting polling for job:", activeJob.id);

            intervalId = setInterval(async () => {
                try {
                    // Use Server Action to bypass RLS
                    const result = await checkCalculationStatusAction(activeJob.quoteId, user.uid);

                    if (result.error) {
                        console.error("Supabase polling error:", result.error);
                        setDebugData({ error: result.error });
                        return;
                    }

                    const data = result.data;

                    if (!data) {
                        console.log("Polling: No data found matching criteria.");
                    } else {
                        console.log("Polled status:", data.status);

                        // Status handling
                        if (data.status === 'completed' && data.data_json) {
                            clearInterval(intervalId);
                            setPollingStatus('completed');
                            setIsCalculating(false);

                            // Parse Data
                            let materials = [];
                            let raw = data.data_json;

                            // 1. Handle double-encoded JSON (string inside JSONB)
                            // Supabase/Postgres sometimes returns JSONB as a string if stringified before save
                            if (typeof raw === 'string') {
                                try {
                                    raw = JSON.parse(raw);
                                } catch (e) {
                                    console.error("Failed to parse inner JSON string:", e);
                                }
                            }

                            // 2. Handle various n8n return structures
                            // Recursive helper to look for 'materialen' array anywhere
                            const findMaterialen = (obj: any): any[] | null => {
                                if (!obj || typeof obj !== 'object') return null;
                                // 1. Check if current object IS the result (contains materialen)
                                // Handle case { materialen: [...] }
                                if (Array.isArray(obj.materialen) && obj.materialen.length > 0) return obj.materialen;

                                // 2. Perform deep search
                                if (Array.isArray(obj)) {
                                    for (const item of obj) {
                                        const res = findMaterialen(item);
                                        if (res) return res;
                                    }
                                } else {
                                    for (const key of Object.keys(obj)) {
                                        const res = findMaterialen(obj[key]);
                                        if (res) return res;
                                    }
                                }
                                return null;
                            };

                            materials = findMaterialen(raw) || [];

                            // Fallback: maybe 'raw' itself is the array of materials, if it lacks 'materialen' wrapper
                            if (materials.length === 0 && Array.isArray(raw) && raw.length > 0 && raw[0].materiaal) {
                                materials = raw;
                            }

                            console.log("Parsed materials count:", materials.length);

                            // Filter for valid items
                            if (!Array.isArray(materials)) {
                                console.warn("Materials is not an array, attempting to wrap", materials);
                                materials = materials ? [materials] : [];
                            }
                            materials = materials.filter((m: any) => m && m.materiaal);

                            // Extended Debug Info
                            setDebugData({
                                raw_sample: raw && Array.isArray(raw) ? "Array(len=" + raw.length + ")" : typeof raw,
                                parsed_count: materials.length,
                                first_item: materials.length > 0 ? materials[0] : "N/A",
                                raw_full: raw
                            });

                            setPolledMaterials(materials);

                            // Save to Firestore
                            if (activeJob.quoteId && activeJob.id && firestore) {
                                const jobRef = doc(firestore, `quotes/${activeJob.quoteId}/jobs/${activeJob.id}`);
                                await updateDoc(jobRef, {
                                    materialen: materials,
                                    updatedAt: new Date()
                                });
                            }

                            // Update Local State
                            setJobs(currentJobs => currentJobs.map(j => j.id === activeJob.id ? { ...j, materialen: materials } : j));
                        } else if (data.status === 'error') {
                            setPollingStatus('error');
                            clearInterval(intervalId);
                            setIsCalculating(false);
                        }
                    }
                } catch (err) {
                    console.error("Polling exception:", err);
                }
            }, 10000); // 10 seconds
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [pollingStatus, activeJob, user, firestore]);

    // Initial Check on Load
    useEffect(() => {
        if (!activeJob || !user) return;

        const checkStatus = async () => {
            // Only check if we don't have materials locally
            if (materialList.length > 0) return;

            try {
                const result = await checkCalculationStatusAction(activeJob.quoteId, user.uid);
                if (result.data) {
                    const data = result.data;
                    console.log("Initial Check Status:", data.status);

                    if (data.status === 'completed' && data.data_json) {
                        // REUSE PARSING LOGIC
                        let raw = data.data_json;
                        if (typeof raw === 'string') {
                            try { raw = JSON.parse(raw); } catch (e) { console.error(e); }
                        }

                        const findMaterialen = (obj: any): any[] | null => {
                            if (!obj || typeof obj !== 'object') return null;
                            if (Array.isArray(obj.materialen) && obj.materialen.length > 0) return obj.materialen;
                            if (Array.isArray(obj)) {
                                for (const item of obj) {
                                    const res = findMaterialen(item);
                                    if (res) return res;
                                }
                            } else {
                                for (const key of Object.keys(obj)) {
                                    const res = findMaterialen(obj[key]);
                                    if (res) return res;
                                }
                            }
                            return null;
                        };

                        let materials = findMaterialen(raw) || [];
                        if (materials.length === 0 && Array.isArray(raw) && raw.length > 0 && raw[0].materiaal) {
                            materials = raw;
                        }

                        if (materials.length > 0) {
                            setPolledMaterials(materials);
                            setPollingStatus('completed');

                            // Debug Info
                            setDebugData({
                                raw_sample: raw && Array.isArray(raw) ? "Array(len=" + raw.length + ")" : typeof raw,
                                parsed_count: materials.length,
                                first_item: materials.length > 0 ? materials[0] : "N/A",
                                raw_full: raw,
                                source: 'initial_check'
                            });
                        }
                    } else if (data.status === 'processing' || data.status === 'pending') {
                        setPollingStatus('polling');
                        setIsCalculating(true);
                    }
                }
            } catch (e) {
                console.error("Initial check failed", e);
            }
        };

        checkStatus();
    }, [activeJob?.id, user?.uid]); // Only re-run if job changes

    // Initial Trigger Logic (Existing - kept for fallback triggering)
    useEffect(() => {
        if (!activeJob) return;

        // Condition to fetch:
        // 1. Materials are missing (undefined)
        // 2. We haven't fetched for this ID yet
        // 3. We are not currently calculating
        if (activeJob.materialen === undefined && !fetchedJobIds.has(activeJob.id) && !isCalculating && pollingStatus === 'idle') {
            const triggerCalculation = async () => {
                setIsCalculating(true);
                setFetchedJobIds(prev => new Set(prev).add(activeJob.id));
                setPollingStatus('polling');

                try {
                    // Fire and forget trigger
                    await fetchMaterialsFromN8nAction(activeJob);
                    console.log("Calculation triggered, polling started...");
                } catch (err) {
                    console.error("Trigger error:", err);
                    setPollingStatus('error');
                    setIsCalculating(false);
                }
            };

            triggerCalculation();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeJob?.id, activeJob?.materialen, firestore, pollingStatus]);

    // Calculate Totals
    const materialTotal = useMemo(() => {
        const list = materialList.length > 0 ? materialList : polledMaterials;
        if (!Array.isArray(list)) return 0;
        return list.reduce((sum, item) => {
            const price = parsePriceToNumber(item.totaal_prijs) || 0;
            return sum + price;
        }, 0);
    }, [materialList, polledMaterials]);

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
                                <div className="w-full max-w-4xl mx-auto py-12">
                                    {isCalculating ? (
                                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                                            <p className="text-zinc-500 text-sm">
                                                {pollingStatus === 'polling'
                                                    ? "Ons AI-systeem berekent momenteel de materialen. Dit duurt ongeveer 5-10 minuten..."
                                                    : "Materialen berekenen..."}
                                            </p>
                                        </div>
                                    ) : (materialList.length > 0 || polledMaterials.length > 0) ? (
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                                            <Table>
                                                <TableHeader className="bg-zinc-900/80">
                                                    <TableRow className="border-zinc-800 hover:bg-zinc-900/80">
                                                        <TableHead className="text-zinc-400 font-medium pl-6">Materiaal</TableHead>
                                                        <TableHead className="text-zinc-400 font-medium w-[150px]">Aantal</TableHead>
                                                        <TableHead className="text-zinc-400 font-medium text-right w-[140px]">Prijs p/st</TableHead>
                                                        <TableHead className="text-zinc-400 font-medium text-right w-[140px] pr-6">Totaal</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(materialList.length > 0 ? materialList : polledMaterials).map((item, idx) => (
                                                        <TableRow key={idx} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                                                            <TableCell className="font-medium text-zinc-200 pl-6 py-4">
                                                                <div className="flex flex-col">
                                                                    <span>{item.materiaal}</span>
                                                                    {/* Optional: Show ID or extra info if available */}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-zinc-400 text-sm">
                                                                <span className="bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50 text-xs font-mono">
                                                                    {item.aantal}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right text-zinc-400 font-mono text-sm">
                                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(item.prijs_per_stuk) || 0)}
                                                            </TableCell>
                                                            <TableCell className="text-right text-zinc-200 font-mono font-medium pr-6">
                                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(item.totaal_prijs) || 0)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {/* Total Row */}
                                                    <TableRow className="bg-emerald-950/20 border-t border-emerald-900/30 hover:bg-emerald-950/30">
                                                        <TableCell colSpan={3} className="text-right font-medium text-emerald-400 py-4">Totaal excl. BTW</TableCell>
                                                        <TableCell className="text-right font-bold text-emerald-400 font-mono text-lg pr-6">
                                                            {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
                                                                (materialList.length > 0 ? materialList : polledMaterials).reduce((acc, item) => acc + (Number(item.totaal_prijs) || 0), 0)
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
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
                                    )}
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
                                                <span className="font-mono text-zinc-200">
                                                    {isCalculating ? (
                                                        <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                                                    ) : (
                                                        new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(materialTotal)
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-zinc-400">
                                                <span>Transport</span>
                                                <span className="font-mono text-zinc-200">€ 0,00</span>
                                            </div>
                                            <div className="border-t border-zinc-800/50 pt-4 flex justify-between items-center font-bold text-lg text-white">
                                                <span>Totaal excl. BTW</span>
                                                <span className="font-mono">
                                                    {isCalculating ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(materialTotal) // Assuming other costs are 0 for now as per original code
                                                    )}
                                                </span>
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

                            {/* View: TESTING */}
                            {activeView === 'testing' && (
                                <div className="w-full h-full p-4 overflow-auto flex flex-col gap-4">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="font-bold text-lg text-white">Webhook Response Test</h3>
                                            <p className="text-xs text-zinc-500 font-mono mt-1">
                                                Status: <span className={cn(pollingStatus === 'polling' ? "text-amber-400 animate-pulse" : "text-zinc-300")}>{pollingStatus.toUpperCase()}</span>
                                            </p>
                                        </div>
                                        <Button
                                            onClick={handleTestFetch}
                                            disabled={isTesting}
                                            variant="secondary"
                                            className="gap-2"
                                        >
                                            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                                            Test & Refresh Data
                                        </Button>
                                    </div>

                                    {/* DEBUG PANEL */}
                                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 space-y-2 text-xs font-mono text-zinc-400">
                                        <div><strong>Query Target:</strong> Table 'quotes collection'</div>
                                        <div><strong>Quote ID:</strong> {activeJob.quoteId}</div>
                                        <div><strong>User ID:</strong> {user?.uid}</div>
                                    </div>

                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-green-400 whitespace-pre-wrap flex-1 overflow-auto">
                                        {debugData ? JSON.stringify(debugData, null, 2) : (
                                            <span className="text-zinc-600">
                                                Geen data gevonden.<br />
                                                1. Controleer of rows in Supabase 'quotes collection' bestaan.<br />
                                                2. Controleer of 'quoteid' en 'gebruikerid' matchen met bovenstaande values.<br />
                                                3. Controleer of status = 'completed'.
                                            </span>
                                        )}
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
                        <TabButton
                            active={activeView === 'testing'}
                            onClick={() => setActiveView('testing')}
                            icon={<div className="font-mono text-[10px] border border-current rounded px-1">{ }</div>}
                            label="Testing"
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

