/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { DashboardHeader } from '@/components/DashboardHeader';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { useEmployees } from '@/hooks/useEmployees';
import { usePlanningData } from '@/hooks/usePlanningData';
import { TimelineView, PlanningEntry } from '@/lib/types-planning';
import { getDateRangeForView, getDaysInRange, formatDateHeader } from '@/lib/planning-utils';
import { PlanningGrid } from '@/components/planning/PlanningGrid';
import { ScheduleModal } from '@/components/planning/ScheduleModal';
import { SchedulingBanner } from '@/components/planning/SchedulingBanner';
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DEFAULT_PLANNING_SETTINGS, PlanningSettings } from '@/lib/types-planning';
import { useToast } from '@/hooks/use-toast';

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

export default function PlanningPage() {
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
    const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const [schedulingQuote, setSchedulingQuote] = useState<Quote | null>(null);
    const [isLoadingSchedulingQuote, setIsLoadingSchedulingQuote] = useState(false);
    const [preselectedDate, setPreselectedDate] = useState<Date | undefined>();
    const [preselectedEmployee, setPreselectedEmployee] = useState<string | undefined>();

    const { employees, isLoading: isLoadingEmployees, autoCreateSelf, isAutoCreating } = useEmployees();

    const dateRange = useMemo(() => getDateRangeForView(view, currentDate), [view, currentDate]);

    const { entries, isLoading: isLoadingEntries, updateEntry, shiftQuoteEntries } = usePlanningData({
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
                        setPlanningSettings({ ...DEFAULT_PLANNING_SETTINGS, ...settings });
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
                setCurrentDate(prev => amount > 0 ? addWeeks(prev, 6) : subWeeks(prev, 6));
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
                return `${format(start, 'd MMM', { locale: nl })} - ${format(end, 'd MMM yyyy', { locale: nl })}`;
            case 'month':
                return format(currentDate, 'MMMM yyyy', { locale: nl });
        }
    };

    const handleEntryClick = (entry: PlanningEntry) => {
        setSelectedEntry(entry);
        setIsScheduleModalOpen(true);
    };

    const handleEmptyCellClick = (date: Date, employeeId: string) => {
        if (schedulingMode) {
            setPreselectedDate(date);
            setPreselectedEmployee(employeeId);
            setSelectedEntry(null);
            setIsScheduleModalOpen(true);
        } else {
            setSelectedEntry(null);
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
        <div className="min-h-screen bg-background flex flex-col">
            <DashboardHeader user={user} title="Planning" />

            <div className="flex-1 flex flex-col p-4 pb-40 space-y-4 overflow-hidden">
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
                            {(['day', 'week', 'month'] as TimelineView[]).map((v) => (
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
                                    {v === 'day' ? 'Dag' : v === 'week' ? 'Week' : 'Maand'}
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
                                Vandaag
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
                            {getDateRangeLabel()}
                        </span>

                        <Button
                            variant="success"
                            className="gap-2"
                            onClick={() => {
                                setSelectedEntry(null);
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
                    />
                )}
            </div>

            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => {
                    setIsScheduleModalOpen(false);
                    setSelectedEntry(null);
                    setPreselectedDate(undefined);
                    setPreselectedEmployee(undefined);
                    if (schedulingMode) {
                        router.push('/planning');
                    }
                }}
                employees={employees}
                planningSettings={planningSettings}
                view={view}
                existingEntry={selectedEntry}
                preselectedQuote={schedulingMode ? schedulingQuote : undefined}
                preselectedHours={schedulingMode ? schedulingHours : undefined}
                preselectedDate={preselectedDate}
                preselectedEmployee={preselectedEmployee}
            />

            <BottomNav />
        </div>
    );
}
