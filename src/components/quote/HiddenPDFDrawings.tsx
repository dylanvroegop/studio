/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Quote, Job } from '@/lib/types';
import { VisualizerController } from '@/components/visualizers/VisualizerController';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import html2canvas from 'html2canvas';

interface HiddenPDFDrawingsProps {
    quote: Quote;
    onReady: (images: string[]) => void;
}

export function HiddenPDFDrawings({ quote, onReady }: HiddenPDFDrawingsProps) {
    const firestore = useFirestore();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Fetch/Extract Jobs (Identical logic to DrawingsTab)
    useEffect(() => {
        const loadJobs = async () => {
            setIsLoading(true);

            // Strategy A: Check 'klussen' map
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

            // Strategy B: Check 'jobs' array
            if ((quote as any).jobs && Array.isArray((quote as any).jobs) && (quote as any).jobs.length > 0) {
                setJobs((quote as any).jobs);
                setIsLoading(false);
                return;
            }

            // Strategy C: Fetch from Firestore subcollection
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
                    console.error("Error fetching jobs subcollection for PDF:", err);
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
        console.log("[HiddenPDFDrawings] Filtering jobs:", jobs.length, jobs);

        const filtered = jobs.filter(job => {
            const maatwerk = job.maatwerk as any;
            const hasMaatwerk = maatwerk && (
                (Array.isArray(maatwerk) && maatwerk.length > 0) ||
                (maatwerk.items && Array.isArray(maatwerk.items) && maatwerk.items.length > 0) ||
                (maatwerk.basis && Array.isArray(maatwerk.basis) && maatwerk.basis.length > 0)
            );
            const hasVisualUrl = !!(job as any).visualisatieUrl;

            // Allow Visual URL even if slug is missing
            if (hasVisualUrl) return true;

            // Check both meta locations (top-level and inside maatwerk)
            const topMeta = (job as any).meta || {};
            const maatwerkMeta = (job.maatwerk as any)?.meta || {};
            const slug = topMeta.slug || maatwerkMeta.slug;

            console.log("[HiddenPDFDrawings] Job filter check:", {
                jobId: job.id,
                hasMaatwerk,
                hasVisualUrl,
                topMeta,
                maatwerkMeta,
                slug,
                passes: !!(hasMaatwerk && slug)
            });

            return hasMaatwerk && slug;
        });

        console.log("[HiddenPDFDrawings] Filtered drawingJobs:", filtered.length);
        return filtered;
    }, [jobs]);

    // 3. Render and Capture
    useEffect(() => {
        if (isLoading) return;

        // If no jobs, return empty list immediately
        if (drawingJobs.length === 0) {
            onReady([]);
            return;
        }

        // Wait a bit for React to render the visualizers in the DOM
        const captureTimeout = setTimeout(async () => {
            if (!containerRef.current) return;

            const distinctDrawings = containerRef.current.querySelectorAll('.pdf-drawing-wrapper');
            const capturedImages: string[] = [];

            // Helper to load images to ensure they are ready for canvas
            const loadImages = (container: Element) => {
                const imgs = container.querySelectorAll('img');
                const promises: Promise<void>[] = [];
                imgs.forEach((img) => {
                    if (img.complete) return;
                    promises.push(new Promise((resolve) => {
                        img.onload = () => resolve();
                        img.onerror = () => resolve(); // Proceed even if error
                    }));
                });
                return Promise.all(promises);
            };

            for (let i = 0; i < distinctDrawings.length; i++) {
                const el = distinctDrawings[i] as HTMLElement;
                try {
                    await loadImages(el);

                    const canvas = await html2canvas(el, {
                        useCORS: true,
                        scale: 2, // Higher resolution
                        backgroundColor: '#ffffff', // Force white background
                        logging: false
                    });
                    capturedImages.push(canvas.toDataURL('image/png'));
                } catch (err) {
                    console.error("Error capturing drawing for PDF:", err);
                }
            }

            onReady(capturedImages);
        }, 2000); // 2 seconds delay to allow visualizers (SVG/Canvas) to fully render

        return () => clearTimeout(captureTimeout);
    }, [isLoading, drawingJobs, onReady]);


    // If loading, render nothing but keep the hook logic running
    if (isLoading) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: '-9999px',
                top: '-9999px',
                width: '800px', // Fixed width for A4 consistency
                visibility: 'visible', // Must be visible for html2canvas, but off-screen
                zIndex: -100
            }}
            ref={containerRef}
        >
            {drawingJobs.map((job, i) => (
                <div key={job.id || i} className="pdf-drawing-wrapper p-4 bg-white mb-8 border border-gray-200">
                    <JobDrawingSection job={job} quote={quote} index={i} />
                </div>
            ))}
        </div>
    );
}

// Minimal Version of JobDrawingSection optimized for PDF capture (White background, black text)
function JobDrawingSection({ job, quote, index }: { job: Job; quote: Quote; index: number }) {
    // Try multiple sources for meta: top-level (klussen map) or inside maatwerk (legacy/subcollection)
    const topMeta = (job as any).meta || {};
    const maatwerkMeta = (job.maatwerk as any)?.meta || {};
    const meta = topMeta.type ? topMeta : maatwerkMeta;

    const categorySlug = meta.type || '';
    const jobSlug = meta.slug || '';
    const visualisatieUrl = (job as any).visualisatieUrl;

    // DEBUG: Log the job data to understand structure
    console.log("[HiddenPDFDrawings] JobDrawingSection - job data:", {
        jobId: job.id,
        topMeta,
        maatwerkMeta,
        usedMeta: meta,
        categorySlug,
        jobSlug,
        hasMaatwerk: !!job.maatwerk,
        maatwerk: job.maatwerk,
        visualisatieUrl
    });

    const items = useMemo(() => {
        // Check multiple possible structures for maatwerk items
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

    console.log("[HiddenPDFDrawings] items extracted:", items.length, items);

    const hasItems = items.length > 0;
    const categoryConfig = JOB_REGISTRY[categorySlug];
    const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
    const fields = jobConfig?.measurements || [];
    const title = (job as any).title || jobConfig?.title || 'Onderdeel';

    // Material Logic
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
    const kozijnhoutFrameThicknessMm = parseDikteToMm(kozijnhoutDikte);
    const tussenstijlThicknessMm = parseDikteToMm(tussenstijlDikte);
    const isMaatwerkKozijn = jobSlug === 'maatwerk-kozijnen';
    const hasTussenstijl = items.some((item: any) => item.tussenstijlen && item.tussenstijlen.length > 0);

    // Render URL Image
    if (!hasItems && visualisatieUrl) {
        return (
            <div className="space-y-4">
                <div className="border-b border-gray-200 pb-2 mb-4">
                    <h2 className="text-xl font-bold text-black">{index + 1}. {title}</h2>
                    <span className="text-sm text-gray-500 capitalize">{categorySlug} / {jobSlug}</span>
                </div>
                <div className="flex justify-center p-4 border border-gray-100 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={visualisatieUrl}
                        alt={title}
                        crossOrigin="anonymous" // Attempt to fix CORS issues for capture
                        className="max-w-full max-h-[400px] object-contain"
                    />
                </div>
            </div>
        );
    }

    if (!hasItems) return null;

    return (
        <div className="space-y-4">
            <div className="border-b border-gray-200 pb-2 mb-4">
                <h2 className="text-xl font-bold text-black">{index + 1}. {title}</h2>
                <span className="text-sm text-gray-500 capitalize">{categorySlug} / {jobSlug}</span>
            </div>

            <div className="grid grid-cols-1 gap-8">
                {items.map((item: any, itemIdx: number) => (
                    <div key={item.id || itemIdx} className="bg-white border border-gray-100 p-4">
                        <h3 className="text-sm font-semibold mb-2 text-gray-700">Item {itemIdx + 1} {item.aantal ? `(${item.aantal}x)` : ''}</h3>
                        <div className="relative aspect-[4/3] w-full flex items-center justify-center bg-white">
                            <VisualizerController
                                category={categorySlug}
                                slug={jobSlug}
                                item={item}
                                fields={fields}
                                title={`${title} ${itemIdx + 1}`}
                                isMagnifier={false}
                                fitContainer={true}
                                frameThickness={isMaatwerkKozijn ? (kozijnhoutFrameThicknessMm ?? undefined) : undefined}
                                tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? (tussenstijlThicknessMm ?? undefined) : undefined}
                                tussenstijlOffset={isMaatwerkKozijn ? item.tussenstijl_van_links : undefined}
                                doorPosition={item.doorPosition}
                                doorSwing={item.doorSwing}
                                onOpeningsChange={() => { }}
                                onEdgeChange={() => { }}
                                onDataGenerated={() => { }}
                                onLeidingkoofChange={() => { }}
                                className="w-full h-full text-black" // Force text color for PDF
                            />
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-gray-600 font-mono">
                            {item.breedte && <div>B: {item.breedte}mm</div>}
                            {item.hoogte && <div>H: {item.hoogte}mm</div>}
                            {item.lengte && <div>L: {item.lengte}mm</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
