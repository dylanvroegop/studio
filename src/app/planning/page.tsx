/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DashboardHeader } from '@/components/DashboardHeader';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react';
import { useEmployees } from '@/hooks/useEmployees';
import { usePlanningData } from '@/hooks/usePlanningData';
import { TimelineView, PlanningEntry } from '@/lib/types-planning';
import { getDateRangeForView, autoSplitJob, calculateEndDateFromHours } from '@/lib/planning-utils';
import { PlanningGrid } from '@/components/planning/PlanningGrid';
import { ScheduleModal } from '@/components/planning/ScheduleModal';
import { SchedulingBanner } from '@/components/planning/SchedulingBanner';
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DEFAULT_PLANNING_SETTINGS, PlanningSettings } from '@/lib/types-planning';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

interface Quote {
    id: string;
    titel?: string;
    klantinformatie?: {
        voornaam?: string;
        achternaam?: string;
        bedrijfsnaam?: string;
    };
    offerteNummer?: number;
}

function PlanningPageContent() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    // Extract URL parameters for scheduling mode
    const schedulingMode = searchParams?.get('mode') === 'schedule';
    const schedulingQuoteId = searchParams?.get('quoteId') || '';
    const schedulingHours = Number(searchParams?.get('hours')) || 0;
    const urlView = searchParams?.get('view') as TimelineView;

    const [view, setView] = useState<TimelineView>(urlView || 'week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<PlanningEntry | null>(null);
    const [modalPreselectedDate, setModalPreselectedDate] = useState<Date | undefined>(undefined);
    const [modalPreselectedEmployee, setModalPreselectedEmployee] = useState<string | undefined>(undefined);
    const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const [draftPlanningSettings, setDraftPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const [isPlanningSettingsOpen, setIsPlanningSettingsOpen] = useState(false);
    const [isSavingPlanningSettings, setIsSavingPlanningSettings] = useState(false);
    const [schedulingQuote, setSchedulingQuote] = useState<Quote | null>(null);
    const [isLoadingSchedulingQuote, setIsLoadingSchedulingQuote] = useState(false);

    const { employees, isLoading: isLoadingEmployees, autoCreateSelf, isAutoCreating } = useEmployees();

    const dateRange = useMemo(() => getDateRangeForView(view, currentDate), [view, currentDate]);

    const { entries, isLoading: isLoadingEntries, updateEntry, shiftQuoteEntries, addEntry, addMultipleEntries } = usePlanningData({
        startDate: dateRange.start,
        endDate: dateRange.end
    });

    React.useEffect(() => {
        if (!user || !firestore) return;

        const fetchSettings = async () => {
            try {
                const userDoc = await getDoc(doc(firestore, 'users', user.uid));
                if (userDoc.exists()) {
                    const settings = userDoc.data()?.settings?.planningSettings;
                    if (settings) {
                        const mergedSettings = { ...DEFAULT_PLANNING_SETTINGS, ...settings };
                        setPlanningSettings(mergedSettings);
                        setDraftPlanningSettings(mergedSettings);
                    }
                }
            } catch (err) {
                console.error('Error fetching planning settings:', err);
            }
        };

        fetchSettings();
    }, [user, firestore]);

    // Fetch quote when in scheduling mode
    useEffect(() => {
        if (!schedulingMode || !schedulingQuoteId || !user || !firestore) {
            setSchedulingQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setIsLoadingSchedulingQuote(true);
            try {
                const quoteDoc = await getDoc(doc(firestore, 'quotes', schedulingQuoteId));
                if (quoteDoc.exists() && quoteDoc.data()?.userId === user.uid) {
                    setSchedulingQuote({ id: quoteDoc.id, ...quoteDoc.data() } as Quote);
                } else {
                    toast({
                        title: 'Offerte niet gevonden',
                        description: 'Deze offerte bestaat niet of is van een andere gebruiker.',
                        variant: 'destructive'
                    });
                    router.push('/planning');
                }
            } catch (error) {
                console.error('Error fetching scheduling quote:', error);
                toast({
                    title: 'Fout bij ophalen offerte',
                    variant: 'destructive'
                });
                router.push('/planning');
            } finally {
                setIsLoadingSchedulingQuote(false);
            }
        };

        fetchQuote();
    }, [schedulingMode, schedulingQuoteId, user, firestore, toast, router]);

    const updateDraftPlanningSetting = <K extends keyof PlanningSettings>(key: K, value: PlanningSettings[K]) => {
        setDraftPlanningSettings(prev => ({ ...prev, [key]: value }));
    };

    const normalizePlanningSettings = (input: PlanningSettings): PlanningSettings => {
        const normalizedWorkDays = Array.from(new Set((input.workDays || DEFAULT_PLANNING_SETTINGS.workDays)
            .filter(day => Number.isFinite(day) && day >= 1 && day <= 7)))
            .sort((a, b) => a - b);

        return {
            defaultWorkdayHours: Math.max(0.5, Number(input.defaultWorkdayHours) || DEFAULT_PLANNING_SETTINGS.defaultWorkdayHours),
            allowAutoSplit: !!input.allowAutoSplit,
            defaultStartTime: input.defaultStartTime || DEFAULT_PLANNING_SETTINGS.defaultStartTime,
            defaultEndTime: input.defaultEndTime || DEFAULT_PLANNING_SETTINGS.defaultEndTime,
            workDays: normalizedWorkDays.length > 0 ? normalizedWorkDays : [...DEFAULT_PLANNING_SETTINGS.workDays],
            pauzeMinuten: input.pauzeMinuten === undefined || input.pauzeMinuten === null
                ? undefined
                : Math.max(0, Math.round(Number(input.pauzeMinuten) || 0))
        };
    };

    const handleOpenPlanningSettings = () => {
        setDraftPlanningSettings(planningSettings);
        setIsPlanningSettingsOpen(true);
    };

    const handleSavePlanningSettings = async () => {
        if (!user || !firestore) return;
        setIsSavingPlanningSettings(true);
        try {
            const normalized = normalizePlanningSettings(draftPlanningSettings);
            await setDoc(
                doc(firestore, 'users', user.uid),
                { settings: { planningSettings: normalized } },
                { merge: true }
            );

            setPlanningSettings(normalized);
            setDraftPlanningSettings(normalized);
            setIsPlanningSettingsOpen(false);
            toast({ title: 'Planning instellingen opgeslagen' });
        } catch (error) {
            console.error('Error saving planning settings:', error);
            toast({
                title: 'Opslaan mislukt',
                description: 'Kon planning instellingen niet opslaan.',
                variant: 'destructive'
            });
        } finally {
            setIsSavingPlanningSettings(false);
        }
    };

    const navigateDate = (direction: 'prev' | 'next' | 'today') => {
        if (direction === 'today') {
            setCurrentDate(new Date());
            return;
        }

        const amount = direction === 'next' ? 1 : -1;
        switch (view) {
            case 'day':
                setCurrentDate(prev => amount > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
                break;
            case 'week':
                setCurrentDate(prev => amount > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
                break;
            case 'month':
                setCurrentDate(prev => amount > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
                break;
        }
    };

    const getDateRangeLabel = () => {
        const { start, end } = dateRange;
        switch (view) {
            case 'day':
                return `${format(start, 'd MMM', { locale: nl })} - ${format(end, 'd MMM yyyy', { locale: nl })}`;
            case 'week':
                return format(currentDate, 'MMMM yyyy', { locale: nl });
            case 'month':
                return format(currentDate, 'MMMM yyyy', { locale: nl });
        }
    };

    const isWeekView = view === 'day';
    const isMonthView = view === 'week' || view === 'month';
    const weekRangeLabel = `${format(dateRange.start, 'd MMM', { locale: nl })} - ${format(dateRange.end, 'd MMM', { locale: nl })}`;

    const dateSwitchLabel = isWeekView
        ? weekRangeLabel
        : isMonthView
            ? format(currentDate, 'MMMM', { locale: nl })
            : 'Vandaag';

    const periodLabel = isWeekView || isMonthView
        ? format(currentDate, 'yyyy', { locale: nl })
        : getDateRangeLabel();

    const handleEntryClick = (entry: PlanningEntry) => {
        setSelectedEntry(entry);
        setModalPreselectedDate(undefined);
        setModalPreselectedEmployee(undefined);
        setIsScheduleModalOpen(true);
    };

    const handleEmptyCellClick = async (date: Date, employeeId: string) => {
        if (schedulingMode) {
            // In scheduling mode: directly create the planning entry
            if (!schedulingQuote || !schedulingHours) {
                toast({
                    title: 'Fout',
                    description: 'Offerte gegevens ontbreken',
                    variant: 'destructive'
                });
                return;
            }

            // Use first employee if no specific employee selected
            const targetEmployeeId = employeeId || employees[0]?.id;
            if (!targetEmployeeId) {
                toast({
                    title: 'Geen uitvoerder',
                    description: 'Maak eerst een profiel aan in instellingen',
                    variant: 'destructive'
                });
                return;
            }

            try {
                const clientName = schedulingQuote.klantinformatie?.bedrijfsnaam ||
                    `${schedulingQuote.klantinformatie?.voornaam || ''} ${schedulingQuote.klantinformatie?.achternaam || ''}`.trim() ||
                    'Onbekend';

                const cacheData = {
                    clientName,
                    projectTitle: schedulingQuote.titel || '',
                    projectAddress: '',
                    totalQuoteHours: schedulingHours
                };

                // Check if we need to auto-split
                if (schedulingHours > planningSettings.defaultWorkdayHours && planningSettings.allowAutoSplit) {
                    // Auto-split the job
                    const splitEntries = autoSplitJob(
                        schedulingHours,
                        date,
                        planningSettings
                    );

                    // Convert to the format expected by addMultipleEntries
                    const entriesToAdd = splitEntries.map(entry => ({
                        quoteId: schedulingQuote.id,
                        employeeId: targetEmployeeId,
                        startDate: entry.startDate,
                        endDate: entry.endDate,
                        scheduledHours: entry.hours,
                        isAutoSplit: true,
                        cache: cacheData
                    }));

                    await addMultipleEntries(entriesToAdd);

                    toast({
                        title: 'Ingepland',
                        description: `${schedulingHours}u verdeeld over ${splitEntries.length} werkdagen`
                    });
                } else {
                    // Single entry
                    const startTime = planningSettings.defaultStartTime.split(':');
                    const startDate = new Date(date);
                    startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), 0);
                    const endDate = calculateEndDateFromHours(
                        startDate,
                        schedulingHours,
                        planningSettings.pauzeMinuten ?? 0
                    );

                    await addEntry({
                        quoteId: schedulingQuote.id,
                        employeeId: targetEmployeeId,
                        startDate,
                        endDate,
                        scheduledHours: schedulingHours,
                        isAutoSplit: false,
                        cache: cacheData
                    });

                    toast({
                        title: 'Ingepland',
                        description: `${schedulingHours}u ingepland op ${format(date, 'd MMMM yyyy', { locale: nl })}`
                    });
                }

                // Exit scheduling mode
                router.push('/planning');
            } catch (error) {
                console.error('Error creating planning entry:', error);
                toast({
                    title: 'Fout bij inplannen',
                    description: error instanceof Error ? error.message : 'Onbekende fout',
                    variant: 'destructive'
                });
            }
        } else {
            setSelectedEntry(null);
            setModalPreselectedDate(date);
            setModalPreselectedEmployee(employeeId || undefined);
            setIsScheduleModalOpen(true);
        }
    };

    const handleCancelScheduling = () => {
        router.push('/planning');
    };

    const handleEntryDrop = async (entryId: string, newStart: Date, newEmployeeId: string) => {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) return;
        const effectiveEmployeeId = newEmployeeId || entry.employeeId;

        // If in week/month view, we want to shift the entire schedule for this quote
        if (view === 'week' || view === 'month') {
            // Only shift the entire quote when dragging the earliest entry.
            const quoteEntries = entries.filter(e => e.quoteId === entry.quoteId);
            const earliestEntry = quoteEntries.reduce((earliest, current) => {
                const earliestDate = earliest.startDate.toDate();
                const currentDate = current.startDate.toDate();
                return currentDate < earliestDate ? current : earliest;
            }, quoteEntries[0]);

            const isEarliest = earliestEntry?.id === entry.id;

            if (!isEarliest) {
                const duration = entry.endDate.toDate().getTime() - entry.startDate.toDate().getTime();
                const newEnd = new Date(newStart.getTime() + duration);

                await updateEntry(entryId, {
                    startDate: newStart,
                    endDate: newEnd,
                    employeeId: effectiveEmployeeId
                });
                return;
            }

            // Calculate day difference
            const currentStartStart = new Date(entry.startDate.toDate());
            currentStartStart.setHours(0, 0, 0, 0);

            const newStartStart = new Date(newStart);
            newStartStart.setHours(0, 0, 0, 0);

            const diffTime = newStartStart.getTime() - currentStartStart.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays !== 0 || newEmployeeId !== entry.employeeId) {
                // If the employee changed, passing newEmployeeId updates all entries to that employee?
                // The requirements say: "move 'maandag' to 'zaterdag'... automatically adjusts the last one that would be in dinsdag as well to maandag."
                // This implies moving the whole group.
                await shiftQuoteEntries(
                    entry.quoteId,
                    entry.startDate.toDate(),
                    newStart,
                    effectiveEmployeeId !== entry.employeeId ? effectiveEmployeeId : undefined
                );
            }
            return;
        }

        const duration = entry.endDate.toDate().getTime() - entry.startDate.toDate().getTime();
        const newEnd = new Date(newStart.getTime() + duration);

        await updateEntry(entryId, {
            startDate: newStart,
            endDate: newEnd,
            employeeId: effectiveEmployeeId
        });
    };

    const handleEntryResize = async (entryId: string, newStart: Date, newEnd: Date) => {
        await updateEntry(entryId, {
            startDate: newStart,
            endDate: newEnd
        });
    };

    if (isUserLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="app-shell min-h-screen bg-background flex flex-col">
            <AppNavigation />
            <DashboardHeader user={user} title="Planning" />

            <div className="flex-1 flex flex-col space-y-4 overflow-hidden p-4 pb-10">
                {/* Scheduling Mode Banner */}
                {schedulingMode && schedulingQuote && (
                    <SchedulingBanner
                        clientName={
                            schedulingQuote.klantinformatie?.bedrijfsnaam ||
                            `${schedulingQuote.klantinformatie?.voornaam || ''} ${schedulingQuote.klantinformatie?.achternaam || ''}`.trim() ||
                            'Onbekend'
                        }
                        offerteNummer={String(schedulingQuote.offerteNummer || '')}
                        hours={schedulingHours}
                        onCancel={handleCancelScheduling}
                    />
                )}

                {/* Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        {/* View Toggle */}
                        <div className="flex bg-zinc-800 rounded-lg p-1">
                            {(['day', 'week'] as TimelineView[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                        view === v
                                            ? "bg-zinc-700 text-white"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    {v === 'day' ? 'Week' : 'Maand'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Date Navigation */}
                        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => navigateDate('prev')}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-8 px-3 text-sm"
                                onClick={() => navigateDate('today')}
                            >
                                {dateSwitchLabel}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => navigateDate('next')}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        <span className="text-sm font-medium text-zinc-300 min-w-[180px] text-center hidden sm:block">
                            {periodLabel}
                        </span>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            onClick={handleOpenPlanningSettings}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>

                        <Button
                            variant="success"
                            className="gap-2"
                            onClick={() => {
                                setSelectedEntry(null);
                                setModalPreselectedDate(undefined);
                                setModalPreselectedEmployee(undefined);
                                setIsScheduleModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Inplannen</span>
                        </Button>
                    </div>
                </div>

                {/* Mobile Date Label */}
                <div className="sm:hidden text-center text-sm font-medium text-zinc-300">
                    {getDateRangeLabel()}
                </div>

                {/* Grid */}
                {isLoadingEmployees || isLoadingEntries ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <PlanningGrid
                        view={view}
                        dateRange={dateRange}
                        employees={employees}
                        entries={entries}
                        onEntryClick={handleEntryClick}
                        onEntryDrop={handleEntryDrop}
                        onEntryResize={handleEntryResize}
                        onEmptyCellClick={handleEmptyCellClick}
                        schedulingMode={schedulingMode}
                        currentDate={currentDate}
                        pauseMinutes={planningSettings.pauzeMinuten ?? 0}
                    />
                )}
            </div>

            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => {
                    setIsScheduleModalOpen(false);
                    setSelectedEntry(null);
                    setModalPreselectedDate(undefined);
                    setModalPreselectedEmployee(undefined);
                }}
                employees={employees}
                planningSettings={planningSettings}
                view={view}
                existingEntry={selectedEntry}
                preselectedDate={modalPreselectedDate}
                preselectedEmployee={modalPreselectedEmployee}
            />

            <Dialog open={isPlanningSettingsOpen} onOpenChange={setIsPlanningSettingsOpen}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Planning instellingen</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Uren per dag</Label>
                                <Input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={draftPlanningSettings.defaultWorkdayHours}
                                    onChange={e => updateDraftPlanningSetting('defaultWorkdayHours', Number(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Pauze (minuten)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={draftPlanningSettings.pauzeMinuten ?? ''}
                                    onChange={e => updateDraftPlanningSetting('pauzeMinuten', e.target.value === '' ? undefined : Number(e.target.value))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Start</Label>
                                <Input
                                    type="time"
                                    value={draftPlanningSettings.defaultStartTime}
                                    onChange={e => updateDraftPlanningSetting('defaultStartTime', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Eind</Label>
                                <Input
                                    type="time"
                                    value={draftPlanningSettings.defaultEndTime}
                                    onChange={e => updateDraftPlanningSetting('defaultEndTime', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Werkdagen</Label>
                            <div className="flex flex-wrap gap-4">
                                {[
                                    { day: 1, label: 'Ma' },
                                    { day: 2, label: 'Di' },
                                    { day: 3, label: 'Wo' },
                                    { day: 4, label: 'Do' },
                                    { day: 5, label: 'Vr' },
                                    { day: 6, label: 'Za' },
                                    { day: 7, label: 'Zo' },
                                ].map(({ day, label }) => {
                                    const checked = draftPlanningSettings.workDays.includes(day);
                                    return (
                                        <label key={day} className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={(nextChecked) => {
                                                    const current = draftPlanningSettings.workDays;
                                                    const updated = nextChecked
                                                        ? [...current, day].sort((a, b) => a - b)
                                                        : current.filter(d => d !== day);
                                                    updateDraftPlanningSetting('workDays', updated);
                                                }}
                                            />
                                            <span className="text-sm">{label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-md border border-border p-3">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Automatisch opdelen</Label>
                                <p className="text-xs text-muted-foreground">
                                    Verdeel klussen over meerdere werkdagen.
                                </p>
                            </div>
                            <Switch
                                checked={draftPlanningSettings.allowAutoSplit}
                                onCheckedChange={(checked) => updateDraftPlanningSetting('allowAutoSplit', checked)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsPlanningSettingsOpen(false)}
                            disabled={isSavingPlanningSettings}
                        >
                            Annuleren
                        </Button>
                        <Button
                            variant="success"
                            onClick={handleSavePlanningSettings}
                            disabled={isSavingPlanningSettings}
                        >
                            {isSavingPlanningSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Opslaan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

function PlanningPageFallback() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}

export default function PlanningPage() {
    return (
        <Suspense fallback={<PlanningPageFallback />}>
            <PlanningPageContent />
        </Suspense>
    );
}
