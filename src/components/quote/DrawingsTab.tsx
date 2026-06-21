import React, { useMemo, useState, useEffect } from 'react';
import { Quote, Job } from '@/lib/types';
import { JOB_REGISTRY } from '@/lib/job-registry';
import { Card, CardContent } from '@/components/ui/card';
import { StickyNote, Loader2, Maximize2, AlertTriangle, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { prepareDrawingImageForLightTheme, prepareDrawingImageForPdf } from '@/lib/pdf-drawing-image';

interface DrawingsTabProps {
    quote: Quote;
}

interface JobDrawingSnapshot {
    url: string;
    title?: string;
    index: number;
}

interface DrawingSnapshotEntry {
    job: Job;
    url: string;
    title?: string;
    index: number;
}

type DrawingStatus = 'pending' | 'processing' | 'ready' | 'error' | '';

function getDrawingStatus(job: Job): DrawingStatus {
    const value = String((job as Job & { visualisatieStatus?: unknown }).visualisatieStatus || '').trim().toLowerCase();
    return ['pending', 'processing', 'ready', 'error'].includes(value) ? value as DrawingStatus : '';
}

function getJobMeta(job: Job): { type?: string; slug?: string } {
    const topMeta = (job as any).meta || {};
    const maatwerkMeta = (job.maatwerk as any)?.meta || {};
    return topMeta.type ? topMeta : maatwerkMeta;
}

function getJobTitle(job: Job): string {
    const meta = getJobMeta(job);
    const categorySlug = meta.type || 'onbekend';
    const jobSlug = meta.slug || '';
    const categoryConfig = JOB_REGISTRY[categorySlug];
    const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
    return (job as any).title || jobConfig?.title || categorySlug;
}

function getVisualisatieUrl(job: Job): string | null {
    const raw = (job as any).visualisatieUrl;
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    return value.length > 0 ? value : null;
}

function getVisualisatieSnapshots(job: Job): JobDrawingSnapshot[] {
    const rawSnapshots = (job as any).visualisatieSnapshots;
    if (!Array.isArray(rawSnapshots)) return [];

    return rawSnapshots
        .map((rawSnapshot: any, fallbackIndex: number) => {
            if (typeof rawSnapshot === 'string') {
                const url = rawSnapshot.trim();
                if (!url) return null;
                return { url, index: fallbackIndex } as JobDrawingSnapshot;
            }

            if (!rawSnapshot || typeof rawSnapshot !== 'object') return null;
            const urlRaw = (rawSnapshot.url ?? rawSnapshot.visualisatieUrl);
            if (typeof urlRaw !== 'string') return null;
            const url = urlRaw.trim();
            if (!url) return null;

            const title = typeof rawSnapshot.title === 'string' ? rawSnapshot.title.trim() : undefined;
            const parsedIndex = typeof rawSnapshot.index === 'number'
                ? rawSnapshot.index
                : Number.parseInt(String(rawSnapshot.index ?? fallbackIndex), 10);
            const index = Number.isFinite(parsedIndex) ? parsedIndex : fallbackIndex;

            return {
                url,
                title: title || undefined,
                index,
            } as JobDrawingSnapshot;
        })
        .filter((snapshot): snapshot is JobDrawingSnapshot => Boolean(snapshot));
}

function getDrawingSnapshotEntries(job: Job): DrawingSnapshotEntry[] {
    const snapshots = getVisualisatieSnapshots(job);
    if (snapshots.length > 0) {
        return snapshots.map((snapshot, snapshotPosition) => ({
            job,
            url: snapshot.url,
            title: snapshot.title,
            index: Number.isFinite(snapshot.index) ? snapshot.index : snapshotPosition,
        }));
    }

    const fallbackUrl = getVisualisatieUrl(job);
    if (!fallbackUrl) return [];
    return [{ job, url: fallbackUrl, index: 0 }];
}

function hasPotentialDrawing(job: Job): boolean {
    if (getDrawingSnapshotEntries(job).length > 0) return true;

    const maatwerk = job.maatwerk as any;
    return Boolean(
        maatwerk &&
        ((Array.isArray(maatwerk) && maatwerk.length > 0) ||
            (maatwerk.items && Array.isArray(maatwerk.items) && maatwerk.items.length > 0) ||
            (maatwerk.basis && Array.isArray(maatwerk.basis) && maatwerk.basis.length > 0)),
    );
}

function getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);/i);
    const mimeSubtype = match?.[1]?.toLowerCase();
    if (mimeSubtype === 'jpeg' || mimeSubtype === 'jpg') {
        return 'JPEG';
    }
    return 'PNG';
}

export function DrawingsTab({ quote }: DrawingsTabProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    useEffect(() => {
        const loadJobs = async () => {
            setIsLoading(true);

            const klussenMap = (quote as any).klussen;
            if (klussenMap && typeof klussenMap === 'object' && Object.keys(klussenMap).length > 0) {
                const jobsFromMap = Object.entries(klussenMap).map(([key, data]: [string, any]) => ({
                    id: key,
                    ...data,
                }));
                setJobs(jobsFromMap as Job[]);
                setIsLoading(false);
                return;
            }

            if ((quote as any).jobs && Array.isArray((quote as any).jobs) && (quote as any).jobs.length > 0) {
                setJobs((quote as any).jobs);
                setIsLoading(false);
                return;
            }

            if (firestore && quote.id) {
                try {
                    const jobsRef = collection(firestore, `quotes/${quote.id}/jobs`);
                    const snap = await getDocs(jobsRef);
                    const fetchedJobs = snap.docs.map((d) => ({
                        id: d.id,
                        ...d.data(),
                    } as Job));
                    setJobs(fetchedJobs);
                } catch (err) {
                    console.error('Error fetching jobs subcollection:', err);
                }
            }

            setIsLoading(false);
        };

        if (quote) {
            void loadJobs();
        }
    }, [quote, firestore]);

    const drawingJobs = useMemo(() => jobs.filter((job) => hasPotentialDrawing(job)), [jobs]);
    const snapshotEntries = useMemo(
        () => drawingJobs.flatMap((job) => getDrawingSnapshotEntries(job)),
        [drawingJobs],
    );
    const missingSnapshotJobs = useMemo(
        () => drawingJobs.filter((job) => getDrawingSnapshotEntries(job).length === 0),
        [drawingJobs],
    );
    const processingJobs = useMemo(
        () => drawingJobs.filter((job) => ['pending', 'processing'].includes(getDrawingStatus(job))),
        [drawingJobs],
    );
    const failedJobs = useMemo(
        () => drawingJobs.filter((job) => getDrawingStatus(job) === 'error'),
        [drawingJobs],
    );

    const convertUrlToBase64 = async (url: string): Promise<string | null> => {
        try {
            const response = await fetch(`/api/visualisatie-to-base64?url=${encodeURIComponent(url)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return typeof data?.dataUrl === 'string' ? data.dataUrl : null;
        } catch (error) {
            console.error('Error converting visualisatie to base64:', error);
            return null;
        }
    };

    const handleExportDrawingsPdf = async (): Promise<void> => {
        if (snapshotEntries.length === 0 || isExportingPdf) return;

        setIsExportingPdf(true);
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            const offerteNummer = String((quote as any)?.offerteNummer || quote.id || 'concept').trim();
            let exportedCount = 0;

            for (const entry of snapshotEntries) {
                const rawImageData = await convertUrlToBase64(entry.url);
                if (!rawImageData) continue;
                const imageData = await prepareDrawingImageForPdf(rawImageData);

                if (exportedCount > 0) {
                    doc.addPage();
                }

                let y = margin;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.setTextColor(30, 30, 30);
                doc.text('TEKENING EXPORT', margin, y);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(100, 100, 100);
                doc.text(`Offerte #${offerteNummer}`, pageWidth - margin, y, { align: 'right' });

                y += 8;
                doc.setDrawColor(220, 220, 220);
                doc.line(margin, y, pageWidth - margin, y);
                y += 8;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(40, 40, 40);
                const fallbackTitle = getJobTitle(entry.job);
                const drawingTitle = entry.title || (entry.index > 0 ? `${fallbackTitle} ${entry.index + 1}` : fallbackTitle);
                doc.text(drawingTitle, margin, y);
                y += 6;

                const imageProps = doc.getImageProperties(imageData);
                const availableWidth = pageWidth - (margin * 2);
                const availableHeight = pageHeight - y - margin;

                let imageWidth = availableWidth;
                let imageHeight = (imageProps.height * availableWidth) / imageProps.width;
                if (imageHeight > availableHeight) {
                    imageHeight = availableHeight;
                    imageWidth = (imageProps.width * availableHeight) / imageProps.height;
                }

                const imageX = margin + ((availableWidth - imageWidth) / 2);
                const imageFormat = getImageFormatFromDataUrl(imageData);
                doc.addImage(imageData, imageFormat, imageX, y, imageWidth, imageHeight, undefined, 'NONE');

                exportedCount += 1;
            }

            if (exportedCount === 0) {
                toast({
                    title: 'Export mislukt',
                    description: 'Geen tekeningen met snapshot gevonden om te exporteren.',
                    variant: 'destructive',
                });
                return;
            }

            doc.save(`Tekeningen-${offerteNummer}.pdf`);

            toast({
                title: 'PDF geëxporteerd',
                description: `${exportedCount} tekening(en) gedownload.`,
            });

            if (exportedCount < snapshotEntries.length) {
                toast({
                    title: 'Niet alle tekeningen meegenomen',
                    description: `${snapshotEntries.length - exportedCount} tekening(en) hadden geen bruikbare afbeelding.`,
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error('Error exporting drawings PDF:', error);
            toast({
                title: 'Export mislukt',
                description: error instanceof Error ? error.message : 'Onbekende fout bij exporteren van tekeningen.',
                variant: 'destructive',
            });
        } finally {
            setIsExportingPdf(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-4" />
                <h3 className="text-zinc-400 font-medium">Tekeningen laden en controleren...</h3>
            </div>
        );
    }

    if (drawingJobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                <StickyNote className="h-10 w-10 text-zinc-600 mb-4" />
                <h3 className="text-zinc-400 font-medium">Geen tekeningen beschikbaar</h3>
                <p className="text-zinc-600 text-sm mt-1">Er zijn nog geen klussen toegevoegd aan deze offerte.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-[280px]">
            <div className="flex justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                        void handleExportDrawingsPdf();
                    }}
                    disabled={isExportingPdf || snapshotEntries.length === 0 || processingJobs.length > 0}
                    aria-label={isExportingPdf ? 'PDF genereren...' : 'Exporteer tekeningen als PDF'}
                    title={isExportingPdf ? 'PDF genereren...' : 'Exporteer tekeningen als PDF'}
                >
                    {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
            </div>

            {processingJobs.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="flex items-start gap-3 p-4 sm:p-5">
                        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-400" />
                        <div>
                            <h4 className="text-sm font-semibold text-amber-300">Tekeningen worden op de achtergrond verwerkt</h4>
                            <p className="mt-1 text-xs text-amber-200/80">
                                Je kunt ondertussen verder werken. Exporteren wordt beschikbaar zodra alle tekeningen gereed zijn.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {failedJobs.length > 0 && (
                <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-red-300">Tekening verwerken mislukt</h4>
                                <p className="text-xs text-red-200/80">Open de betreffende calculatie en sla opnieuw op om het opnieuw te proberen.</p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {failedJobs.map((job, index) => (
                                        <Badge key={job.id || index} variant="outline" className="border-red-500/30 bg-transparent text-red-200">
                                            {getJobTitle(job)}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {snapshotEntries.map((entry, i) => (
                <SnapshotDrawingSection
                    key={`${entry.job.id || 'job'}-${entry.index}-${entry.url}`}
                    job={entry.job}
                    visualisatieUrl={entry.url}
                    snapshotTitle={entry.title}
                    snapshotIndex={entry.index}
                    index={i}
                />
            ))}

            {missingSnapshotJobs.filter((job) => !['pending', 'processing'].includes(getDrawingStatus(job))).length > 0 && (
                <Card className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-amber-300">Geen snapshot beschikbaar voor {missingSnapshotJobs.filter((job) => !['pending', 'processing'].includes(getDrawingStatus(job))).length} klus(sen)</h4>
                                <p className="text-xs text-amber-200/80">
                                    Deze klus(sen) hebben nog geen opgeslagen visualisatie. Open de klus en sla op om de snapshot te genereren.
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {missingSnapshotJobs.filter((job) => !['pending', 'processing'].includes(getDrawingStatus(job))).map((job, idx) => (
                                        <Badge key={job.id || idx} variant="outline" className="border-amber-500/30 text-amber-200 bg-transparent">
                                            {getJobTitle(job)}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function SnapshotDrawingSection({
    job,
    visualisatieUrl,
    snapshotTitle,
    snapshotIndex,
    index,
}: {
    job: Job;
    visualisatieUrl: string;
    snapshotTitle?: string;
    snapshotIndex: number;
    index: number;
}) {
    const [isExpandedOpen, setIsExpandedOpen] = useState(false);
    const [displayUrl, setDisplayUrl] = useState(visualisatieUrl);
    const [isPreparingImage, setIsPreparingImage] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const prepareImage = async () => {
            setIsPreparingImage(true);
            try {
                const response = await fetch(`/api/visualisatie-to-base64?url=${encodeURIComponent(visualisatieUrl)}`);
                if (!response.ok) return;
                const data = await response.json();
                if (typeof data?.dataUrl !== 'string') return;
                const preparedUrl = await prepareDrawingImageForLightTheme(data.dataUrl);
                if (!cancelled) setDisplayUrl(preparedUrl);
            } catch (error) {
                console.error('Error preparing drawing snapshot:', error);
            } finally {
                if (!cancelled) setIsPreparingImage(false);
            }
        };

        void prepareImage();
        return () => {
            cancelled = true;
        };
    }, [visualisatieUrl]);

    const meta = getJobMeta(job);
    const categorySlug = meta.type || '';
    const jobSlug = meta.slug || '';
    const jobTitle = getJobTitle(job);
    const title = snapshotTitle || (snapshotIndex > 0 ? `${jobTitle} ${snapshotIndex + 1}` : jobTitle);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-2 py-0.5">
                    {index + 1}
                </Badge>
                <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
                <span className="text-xs text-zinc-500 font-mono ml-auto opacity-50 capitalize">{categorySlug} / {jobSlug}</span>
            </div>

            <button
                type="button"
                onClick={() => setIsExpandedOpen(true)}
                className="block w-full max-w-[620px] text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
            >
                <Card className="bg-white border-zinc-300 overflow-hidden group transition-colors cursor-zoom-in hover:border-zinc-400">
                    <CardContent className="p-0 relative aspect-[4/3] bg-white">
                        <div
                            className="absolute inset-0 z-0 opacity-45 pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#d2d2d6 1px, transparent 1px)',
                                backgroundSize: '16px 16px',
                            }}
                        />
                        <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {isPreparingImage ? (
                                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={displayUrl} alt={title} className="max-w-full max-h-full object-contain" />
                            )}
                        </div>
                        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white/95 px-2 py-1 text-[11px] text-black shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <Maximize2 className="h-3.5 w-3.5" />
                            Vergroot
                        </div>
                    </CardContent>
                </Card>
            </button>

            <Dialog open={isExpandedOpen} onOpenChange={setIsExpandedOpen}>
                <DialogContent className="w-[96vw] max-w-[1600px] h-[92vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)] border border-zinc-300 bg-white text-black">
                    <DialogHeader className="px-5 py-4 border-b border-zinc-200">
                        <DialogTitle className="text-black">{title}</DialogTitle>
                    </DialogHeader>
                    <div className="relative min-h-0 h-full w-full overflow-hidden">
                        <div
                            className="absolute inset-0 z-0 opacity-45 pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#d2d2d6 1px, transparent 1px)',
                                backgroundSize: '16px 16px',
                            }}
                        />
                        <div className="relative z-10 h-full w-full flex items-center justify-center p-2 sm:p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {isPreparingImage ? (
                                <Loader2 className="h-7 w-7 animate-spin text-zinc-500" />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={displayUrl} alt={title} className="max-w-full max-h-full object-contain" />
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
