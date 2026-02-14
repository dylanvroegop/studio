/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Plus, LayoutDashboard, FileText, Pencil, Boxes, Users, Settings, CheckCircle2, AlertTriangle, CalendarDays, ReceiptText, TrendingUp, Clock3, Archive, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { JOB_REGISTRY } from '@/lib/job-registry';


// --- Helpers ---
function slugify(value: string) {
    return (value || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
}

function humanizeJobKey(jobKey?: string | null): string {
    if (!jobKey) return 'Klus';
    switch (jobKey) {
        case 'hsb-voorzetwand':
            return 'HSB voorzetwand';
        default:
            return jobKey.replace(/-/g, ' ');
    }
}

function hasObjectEntries(value: unknown): boolean {
    return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0;
}

function hasFilledMetingen(job: any): boolean {
    const maatwerk = job?.maatwerk;
    if (Array.isArray(maatwerk) && maatwerk.length > 0) return true;
    if (Array.isArray(maatwerk?.basis) && maatwerk.basis.length > 0) return true;
    if (Array.isArray(maatwerk?.items) && maatwerk.items.length > 0) return true;

    return Object.entries(job || {}).some(([key, value]) => {
        return key.endsWith('_maatwerk') && Array.isArray(value) && value.length > 0;
    });
}

function hasFilledMaterialen(job: any): boolean {
    const mat = job?.materialen || {};
    const hasSelections = hasObjectEntries(mat.selections);
    const hasMaterialenLijst = hasObjectEntries(mat.materialen_lijst);
    const hasExtraMaterials = Array.isArray(mat.extraMaterials) && mat.extraMaterials.length > 0;
    const hasCustom = hasObjectEntries(mat.custommateriaal);
    const presetLabel = job?.werkwijze?.presetLabel;
    const hasWerkwijzePreset = !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';
    const workMethodId = job?.werkwijze?.workMethodId;
    const hasWorkMethodId = !!workMethodId && workMethodId !== 'default';

    return hasSelections || hasMaterialenLijst || hasExtraMaterials || hasCustom || hasWerkwijzePreset || hasWorkMethodId;
}

interface WizardHeaderProps {
    title: string;
    backLink: string;
    progress: number;
    rightContent?: React.ReactNode;
    quoteId?: string; // Optional, enables the menu
}

export function WizardHeader({
    title,
    // backLink, // Unused
    progress,
    rightContent,
    quoteId
}: WizardHeaderProps) {
    const firestore = useFirestore();
    const [jobs, setJobs] = useState<any[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);

    // Fetch Jobs if quoteId is present
    useEffect(() => {
        if (!quoteId || !firestore) return;

        const unsub = onSnapshot(doc(firestore, 'quotes', quoteId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const klussenMap = data.klussen || {};
                const extractedJobs: any[] = [];

                Object.keys(klussenMap).forEach((id) => {
                    const job = klussenMap[id];
                    const maatwerkMeta = job?.maatwerk?.meta;
                    const rawKey =
                        job?.klusinformatie?.title?.trim?.() ||
                        maatwerkMeta?.title?.trim?.() ||
                        job?.meta?.title?.trim?.() ||
                        job?.materialen?.jobKey?.trim?.() ||
                        job?.jobKey ||
                        'Naamloze klus';

                    const title = humanizeJobKey(rawKey);

                    const type =
                        job?.klusinformatie?.type ||
                        job?.materialen?.jobType ||
                        maatwerkMeta?.type ||
                        job?.meta?.type ||
                        'wanden'; // Fallback

                    const slug =
                        job?.materialen?.jobKey ||
                        job?.materialen?.jobSlug ||
                        maatwerkMeta?.slug ||
                        job?.meta?.slug ||
                        slugify(title);

                    // Determine completion status
                    const metingenCompleted = hasFilledMetingen(job);
                    const materialenCompleted = hasFilledMaterialen(job);

                    // Check if this job type has measurements defined in the registry
                    let hasMeasurements = false;
                    const categoryRegistry = (JOB_REGISTRY as any)[type];
                    if (categoryRegistry?.items) {
                        const jobConfig = categoryRegistry.items.find((item: any) => item.slug === slug);
                        if (jobConfig?.measurements && Array.isArray(jobConfig.measurements)) {
                            hasMeasurements = jobConfig.measurements.length > 0;
                        }
                    }

                    // Fallback: check if job data has measurements metadata
                    if (!hasMeasurements) {
                        const jobMeta = job?.maatwerk?.meta || job?.meta;
                        if (jobMeta?.measurements && Array.isArray(jobMeta.measurements)) {
                            hasMeasurements = jobMeta.measurements.length > 0;
                        }
                    }

                    extractedJobs.push({
                        id,
                        title,
                        type,
                        slug,
                        createdAt: job.createdAt,
                        metingenCompleted,
                        materialenCompleted,
                        hasMeasurements
                    });
                });

                // Optional: Sort by creation time if available
                // extractedJobs.sort((a, b) => ...); 

                setJobs(extractedJobs);
            }
        });

        return () => unsub();
    }, [quoteId, firestore]);

    return (
        <header className="border-b bg-background">
            <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
                <div className="flex items-center gap-3">
                    {/* Back Button */}


                    {/* Menu Button (Conditionally Rendered) */}
                    {quoteId && (
                        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl shrink-0">
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
                                <SheetHeader className="p-6 border-b text-left">
                                    <SheetTitle>Navigatie</SheetTitle>
                                    <SheetDescription>Snelle toegang tot alle onderdelen.</SheetDescription>
                                </SheetHeader>

                                <ScrollArea className="h-[calc(100vh-140px)]">
                                    <div className="p-4 space-y-6">
                                        {/* Top Section */}
                                        <div className="space-y-2">
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2 h-10" onClick={() => setMenuOpen(false)}>
                                                <Link href={`/offertes/${quoteId}/klus/nieuw`}>
                                                    <Plus className="h-4 w-4 text-emerald-600" />
                                                    <span className="font-semibold text-emerald-600">Nieuwe calculatie</span>
                                                </Link>
                                            </Button>
                                        </div>

                                        <Separator />

                                        {/* Jobs List */}
                                        <div className="space-y-4">
                                            <div className="px-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                                Jouw Klussen ({jobs.length})
                                            </div>

                                            {jobs.length === 0 ? (
                                                <p className="px-2 text-sm text-muted-foreground italic">Nog geen klussen.</p>
                                            ) : (
                                                <div className="space-y-4">
                                                    {jobs.map((job) => (
                                                        <div key={job.id} className="space-y-1">
                                                            <div className="px-2 text-sm font-medium truncate mb-1">{job.title}</div>
                                                            <div className="pl-4 border-l-2 border-muted space-y-1">
                                                                <Link
                                                                    href={`/offertes/${quoteId}/klus/${job.id}/${job.type}/${job.slug}/materialen`}
                                                                    onClick={() => setMenuOpen(false)}
                                                                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                                                >
                                                                    {job.materialenCompleted ? (
                                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                                    ) : (
                                                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                                                    )}
                                                                    Materialen
                                                                </Link>
                                                                {job.hasMeasurements && (
                                                                    <Link
                                                                        href={`/offertes/${quoteId}/klus/${job.id}/${job.type}/${job.slug}`}
                                                                        onClick={() => setMenuOpen(false)}
                                                                        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                                                    >
                                                                        {job.metingenCompleted ? (
                                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                                        ) : (
                                                                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                                                        )}
                                                                        Metingen
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <Button asChild variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => setMenuOpen(false)}>
                                                <Link href={`/offertes/${quoteId}/edit`}>
                                                    <Pencil className="h-4 w-4" />
                                                    Klant informatie bewerken
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => setMenuOpen(false)}>
                                                <Link href={`/offertes/${quoteId}/overzicht`}>
                                                    <FileText className="h-4 w-4" />
                                                    Overzicht &amp; Extra&apos;s
                                                </Link>
                                            </Button>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            <div className="px-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
                                                Algemeen
                                            </div>

                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/dashboard">
                                                    <LayoutDashboard className="h-4 w-4" />
                                                    Dashboard
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/offertes">
                                                    <FileText className="h-4 w-4" />
                                                    Offertes
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/facturen">
                                                    <ReceiptText className="h-4 w-4" />
                                                    Facturen
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/winst">
                                                    <TrendingUp className="h-4 w-4" />
                                                    Winst
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/planning">
                                                    <CalendarDays className="h-4 w-4" />
                                                    Planning
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/materialen">
                                                    <Boxes className="h-4 w-4" />
                                                    Producten
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/klanten">
                                                    <Users className="h-4 w-4" />
                                                    Klanten
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/urenregistratie">
                                                    <Clock3 className="h-4 w-4" />
                                                    Urenregistratie
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/notities">
                                                    <StickyNote className="h-4 w-4" />
                                                    Notities
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/archief">
                                                    <Archive className="h-4 w-4" />
                                                    Archief
                                                </Link>
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                                                <Link href="/instellingen">
                                                    <Settings className="h-4 w-4" />
                                                    Instellingen
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </SheetContent>
                        </Sheet>
                    )}

                    <div className="flex-1">
                        <div className="text-sm font-semibold text-center">{title}</div>

                        <div className="mt-3">
                            <div className="h-1.5 rounded-full bg-muted/40 mx-auto">
                                <div
                                    className="h-full rounded-full bg-emerald-600/65 transition-all"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center shrink-0">
                        {rightContent}
                    </div>
                </div>
            </div>
        </header>
    );
}
