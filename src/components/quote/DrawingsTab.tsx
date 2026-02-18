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

interface DrawingsTabProps {
    quote: Quote;
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

function hasPotentialDrawing(job: Job): boolean {
    if (getVisualisatieUrl(job)) return true;

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
    const snapshotJobs = useMemo(() => drawingJobs.filter((job) => Boolean(getVisualisatieUrl(job))), [drawingJobs]);
    const missingSnapshotJobs = useMemo(() => drawingJobs.filter((job) => !getVisualisatieUrl(job)), [drawingJobs]);

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
        if (snapshotJobs.length === 0 || isExportingPdf) return;

        setIsExportingPdf(true);
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            const offerteNummer = String((quote as any)?.offerteNummer || quote.id || 'concept').trim();
            let exportedCount = 0;

            for (const job of snapshotJobs) {
                const imageUrl = getVisualisatieUrl(job);
                if (!imageUrl) continue;

                const imageData = await convertUrlToBase64(imageUrl);
                if (!imageData) continue;

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
                doc.text(getJobTitle(job), margin, y);
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
                doc.addImage(imageData, imageFormat, imageX, y, imageWidth, imageHeight);

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

            if (exportedCount < snapshotJobs.length) {
                toast({
                    title: 'Niet alle tekeningen meegenomen',
                    description: `${snapshotJobs.length - exportedCount} tekening(en) hadden geen bruikbare afbeelding.`,
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
                    className="gap-2"
                    onClick={() => {
                        void handleExportDrawingsPdf();
                    }}
                    disabled={isExportingPdf || snapshotJobs.length === 0}
                >
                    {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {isExportingPdf ? 'PDF genereren...' : 'Exporteer tekeningen als PDF'}
                </Button>
            </div>

            {snapshotJobs.map((job, i) => (
                <SnapshotDrawingSection key={job.id || i} job={job} index={i} />
            ))}

            {missingSnapshotJobs.length > 0 && (
                <Card className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-amber-300">Geen snapshot beschikbaar voor {missingSnapshotJobs.length} klus(sen)</h4>
                                <p className="text-xs text-amber-200/80">
                                    Deze klus(sen) hebben nog geen opgeslagen visualisatie. Open de klus en sla op om de snapshot te genereren.
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {missingSnapshotJobs.map((job, idx) => (
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

function SnapshotDrawingSection({ job, index }: { job: Job; index: number }) {
    const [isExpandedOpen, setIsExpandedOpen] = useState(false);

    const meta = getJobMeta(job);
    const categorySlug = meta.type || '';
    const jobSlug = meta.slug || '';
    const title = getJobTitle(job);
    const visualisatieUrl = getVisualisatieUrl(job);

    if (!visualisatieUrl) return null;

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
                <Card className="bg-black/20 border-white/5 overflow-hidden group transition-colors cursor-zoom-in hover:border-emerald-500/30">
                    <CardContent className="p-0 relative aspect-[4/3] bg-[#09090b]">
                        <div
                            className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                                backgroundSize: '24px 24px',
                            }}
                        />
                        <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={visualisatieUrl} alt={title} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                        </div>
                        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/60 px-2 py-1 text-[11px] text-zinc-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <Maximize2 className="h-3.5 w-3.5" />
                            Vergroot
                        </div>
                    </CardContent>
                </Card>
            </button>

            <Dialog open={isExpandedOpen} onOpenChange={setIsExpandedOpen}>
                <DialogContent className="w-[96vw] max-w-[1600px] h-[92vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)] border border-white/10 bg-[#050607]/95">
                    <DialogHeader className="px-5 py-4 border-b border-white/10">
                        <DialogTitle className="text-zinc-100">{title}</DialogTitle>
                    </DialogHeader>
                    <div className="relative min-h-0 h-full w-full overflow-hidden">
                        <div
                            className="absolute inset-0 z-0 opacity-[0.12] pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                                backgroundSize: '24px 24px',
                            }}
                        />
                        <div className="relative z-10 h-full w-full flex items-center justify-center p-2 sm:p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={visualisatieUrl} alt={title} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
