import React, { useMemo, useState, useEffect } from 'react';
import { Quote, Job } from '@/lib/types';
import { VisualizerController } from '@/components/visualizers/VisualizerController';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StickyNote, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface DrawingsTabProps {
    quote: Quote;
}

export function DrawingsTab({ quote }: DrawingsTabProps) {
    const firestore = useFirestore();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 1. Fetch/Extract Jobs
    useEffect(() => {
        const loadJobs = async () => {
            setIsLoading(true);

            // Strategy A: Check 'klussen' map (Active Wizard / Modern Structure)
            const klussenMap = (quote as any).klussen;
            if (klussenMap && typeof klussenMap === 'object' && Object.keys(klussenMap).length > 0) {
                const jobsFromMap = Object.entries(klussenMap).map(([key, data]: [string, any]) => ({
                    id: key,
                    ...data
                }));
                setJobs(jobsFromMap as Job[]);
                setIsLoading(false);
                return;
            }

            // Strategy B: Check 'jobs' array (if already populated on quote object)
            if ((quote as any).jobs && Array.isArray((quote as any).jobs) && (quote as any).jobs.length > 0) {
                setJobs((quote as any).jobs);
                setIsLoading(false);
                return;
            }

            // Strategy C: Fetch from Firestore subcollection (Legacy Structure)
            if (firestore && quote.id) {
                try {
                    const jobsRef = collection(firestore, `quotes/${quote.id}/jobs`);
                    const snap = await getDocs(jobsRef);
                    const fetchedJobs = snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    } as Job));
                    setJobs(fetchedJobs);
                } catch (err) {
                    console.error("Error fetching jobs subcollection:", err);
                }
            }

            setIsLoading(false);
        };

        if (quote) {
            loadJobs();
        }
    }, [quote, firestore]);

    // 2. Filter for Valid Drawing Jobs
    const drawingJobs = useMemo(() => {
        return jobs.filter(job => {
            // Check for parametric data (Modern) - check multiple structures
            const maatwerk = job.maatwerk as any;
            const hasMaatwerk = maatwerk && (
                (Array.isArray(maatwerk) && maatwerk.length > 0) ||
                (maatwerk.items && Array.isArray(maatwerk.items) && maatwerk.items.length > 0) ||
                (maatwerk.basis && Array.isArray(maatwerk.basis) && maatwerk.basis.length > 0)
            );

            // Check for static visual URL (Legacy)
            const hasVisualUrl = !!(job as any).visualisatieUrl;

            // Check both meta locations (top-level and inside maatwerk)
            const topMeta = (job as any).meta || {};
            const maatwerkMeta = (job.maatwerk as any)?.meta || {};
            const slug = topMeta.slug || maatwerkMeta.slug;

            // Relaxed Filter: Allow Visual URL even if slug is missing
            if (hasVisualUrl) return true;

            // For Parametric, we generally need formatting info from the slug
            return hasMaatwerk && slug;
        });
    }, [jobs]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-4" />
                <h3 className="text-zinc-400 font-medium">Tekeningen laden en controleren...</h3>
            </div>
        );
    }

    if (drawingJobs.length === 0) {
        // Check if there are jobs but they just don't have visualizers
        const hasJobsWithoutVisualizers = jobs.length > 0;

        if (hasJobsWithoutVisualizers) {
            // Get job types/titles for display
            const jobTypes = jobs.map(job => {
                const topMeta = (job as any).meta || {};
                const maatwerkMeta = (job.maatwerk as any)?.meta || {};
                const meta = topMeta.type ? topMeta : maatwerkMeta;
                const categorySlug = meta.type || 'onbekend';

                // Try to get a friendly title
                const categoryConfig = JOB_REGISTRY[categorySlug];
                const jobSlug = meta.slug || '';
                const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
                return (job as any).title || jobConfig?.title || categorySlug;
            }).filter(Boolean);

            return (
                <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                    <StickyNote className="h-10 w-10 text-zinc-600 mb-4" />
                    <h3 className="text-zinc-400 font-medium">Geen tekeningen beschikbaar</h3>
                    <p className="text-zinc-600 text-sm mt-1 max-w-md text-center">
                        Deze offerte bevat {jobs.length} {jobs.length === 1 ? 'klus' : 'klussen'} waarvoor geen tekeningen beschikbaar zijn.
                    </p>
                    <p className="text-zinc-600 text-xs mt-2 max-w-md text-center">
                        Sommige klussen (zoals deuren, standaardmaten, etc.) hebben geen visuele weergave.
                    </p>

                    {jobTypes.length > 0 && (
                        <div className="mt-6 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 max-w-sm">
                            <p className="text-zinc-500 text-xs font-medium mb-2">Klussen in deze offerte:</p>
                            <ul className="text-zinc-400 text-sm space-y-1">
                                {jobTypes.map((type, idx) => (
                                    <li key={idx} className="flex items-center gap-2">
                                        <span className="text-zinc-600">•</span>
                                        {type}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        }

        // No jobs at all
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                <StickyNote className="h-10 w-10 text-zinc-600 mb-4" />
                <h3 className="text-zinc-400 font-medium">Geen tekeningen beschikbaar</h3>
                <p className="text-zinc-600 text-sm mt-1">Er zijn nog geen klussen toegevoegd aan deze offerte.</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-[280px]">
            {drawingJobs.map((job, i) => (
                <JobDrawingSection key={job.id || i} job={job} quote={quote} index={i} />
            ))}
        </div>
    );
}

// Helper component to isolate config lookup and rendering logic per job
function JobDrawingSection({ job, quote, index }: { job: Job; quote: Quote; index: number }) {
    // Try multiple sources for meta: top-level (klussen map) or inside maatwerk (legacy/subcollection)
    const topMeta = (job as any).meta || {};
    const maatwerkMeta = (job.maatwerk as any)?.meta || {};
    const meta = topMeta.type ? topMeta : maatwerkMeta;

    const categorySlug = meta.type || '';
    const jobSlug = meta.slug || '';
    const visualisatieUrl = (job as any).visualisatieUrl;

    // Normalize items from maatwerk - check multiple possible structures
    const items = useMemo(() => {
        if (Array.isArray(job.maatwerk)) return job.maatwerk;

        const maatwerk = job.maatwerk as any;
        if (maatwerk?.items && Array.isArray(maatwerk.items)) {
            return maatwerk.items;
        }
        if (maatwerk?.basis && Array.isArray(maatwerk.basis)) {
            return maatwerk.basis;
        }
        return [];
    }, [job.maatwerk]);

    const hasItems = items.length > 0;

    // Fetch config for fields
    const categoryConfig = JOB_REGISTRY[categorySlug];
    // Find specific job config
    const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
    const fields = jobConfig?.measurements || [];

    const title = (job as any).title || jobConfig?.title || 'Onderdeel';

    // --- Material Logic for "Exact" Parity (Frame Thickness, etc.) ---
    const materialenLijst = job.materialen?.materialen_lijst || {};

    const parseDikteToMm = (raw: any): number | null => {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        const s = String(raw).trim().toLowerCase();
        const match = s.match(/([\d.,]+)\s*(mm|cm|m)?/i);
        if (!match) return null;
        const num = parseFloat(match[1].replace(',', '.'));
        const unit = match[2];
        if (unit === 'cm') return num * 10;
        if (unit === 'm') return num * 1000;
        return num;
    };

    const getMaterialAttr = (key: string, sectionKeyCheck: string) => {
        const found = Object.values(materialenLijst).find((entry: any) => {
            const mat = entry.material;
            if (!mat) return false;
            const sk = entry.sectionKey || mat.sectionKey;
            return sk === sectionKeyCheck;
        });
        return found ? (found as any).material?.[key] : null;
    };

    const kozijnhoutDikte = getMaterialAttr('dikte', 'kozijnhout_buiten');
    const tussenstijlDikte = getMaterialAttr('dikte', 'tussenstijl');

    // Use 67mm as default frame thickness (common kozijnhout size) if not found in materials
    const DEFAULT_FRAME_THICKNESS = 67;
    const kozijnhoutFrameThicknessMm = parseDikteToMm(kozijnhoutDikte) ?? DEFAULT_FRAME_THICKNESS;
    const tussenstijlThicknessMm = parseDikteToMm(tussenstijlDikte) ?? kozijnhoutFrameThicknessMm;

    const isMaatwerkKozijn = jobSlug === 'maatwerk-kozijnen';
    const hasTussenstijl = items.some((item: any) => item.tussenstijlen && item.tussenstijlen.length > 0);

    // PRIORITIZE: If we have a visualisatieUrl, always use the pre-rendered image
    // This is simpler and shows the actual saved drawing without recreation
    if (visualisatieUrl) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-2 py-0.5">
                        {index + 1}
                    </Badge>
                    <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
                    <span className="text-xs text-zinc-500 font-mono ml-auto opacity-50 capitalize">{categorySlug} / {jobSlug}</span>
                </div>
                <Card className="bg-black/20 border-white/5 overflow-hidden group">
                    <CardContent className="p-0 relative aspect-[4/3] bg-[#09090b]">
                        {/* Dot Pattern Background */}
                        <div
                            className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                                backgroundSize: '24px 24px'
                            }}
                        />
                        <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={visualisatieUrl}
                                alt={title}
                                className="max-w-full max-h-full object-contain drop-shadow-2xl"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Fallback: If no visualisatieUrl and no items, don't render
    if (!hasItems) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-2 py-0.5">
                    {index + 1}
                </Badge>
                <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
                <span className="text-xs text-zinc-500 font-mono ml-auto opacity-50 capitalize">{categorySlug} / {jobSlug}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item: any, itemIdx: number) => (
                    <Card key={item.id || itemIdx} className="bg-black/20 border-white/5 overflow-hidden group">
                        <CardContent className="p-0 relative aspect-[4/3] bg-[#09090b]">
                            {/* Visualization Container */}
                            <div className="absolute inset-0 flex items-center justify-center p-6">
                                {/* Dot Pattern Background */}
                                <div
                                    className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                                    style={{
                                        backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                                        backgroundSize: '24px 24px'
                                    }}
                                />

                                <div className="relative z-10 w-full h-full flex items-center justify-center">
                                    <VisualizerController
                                        category={categorySlug}
                                        slug={jobSlug}
                                        item={item}
                                        fields={fields}
                                        title={`${title} ${itemIdx + 1}`}
                                        isMagnifier={false}
                                        fitContainer={true}
                                        // Pass the material-derived props for "Exact Same" rendering
                                        frameThickness={isMaatwerkKozijn ? (kozijnhoutFrameThicknessMm ?? undefined) : undefined}
                                        tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? (tussenstijlThicknessMm ?? undefined) : undefined}

                                        // Pass through other standard properties
                                        tussenstijlOffset={isMaatwerkKozijn ? item.tussenstijl_van_links : undefined}
                                        doorPosition={item.doorPosition}
                                        doorSwing={item.doorSwing}

                                        // We pass empty/noop handlers since this is read-only
                                        onOpeningsChange={() => { }}
                                        onEdgeChange={() => { }}
                                        onDataGenerated={() => { }}
                                        onKoofChange={() => { }}

                                        className="w-full h-full"
                                    />
                                </div>
                            </div>

                            {/* Overlay Label */}
                            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-black/60 backdrop-blur border border-white/5 text-xs font-medium text-zinc-300">
                                Item {itemIdx + 1} {item.aantal ? <span className="opacity-50 ml-1">({item.aantal}x)</span> : ''}
                            </div>

                            {/* Dimensions Overlay (Bottom) for quick reference */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent pt-10 flex gap-4 text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.breedte && <div>B: {item.breedte}mm</div>}
                                {item.hoogte && <div>H: {item.hoogte}mm</div>}
                                {item.lengte && <div>L: {item.lengte}mm</div>}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
