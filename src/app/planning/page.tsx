/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DEFAULT_PLANNING_SETTINGS, PlanningSettings } from '@/lib/types-planning';

export default function PlanningPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const [view, setView] = useState<TimelineView>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<PlanningEntry | null>(null);
    const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);

    const { employees, isLoading: isLoadingEmployees, autoCreateSelf, isAutoCreating } = useEmployees();

    const dateRange = useMemo(() => getDateRangeForView(view, currentDate), [view, currentDate]);

    const { entries, isLoading: isLoadingEntries, updateEntry } = usePlanningData({
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
        setSelectedEntry(null);
        setIsScheduleModalOpen(true);
    };

    const handleEntryDrop = async (entryId: string, newStart: Date, newEmployeeId: string) => {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) return;

        const duration = entry.endDate.toDate().getTime() - entry.startDate.toDate().getTime();
        const newEnd = new Date(newStart.getTime() + duration);

        await updateEntry(entryId, {
            startDate: newStart,
            endDate: newEnd,
            employeeId: newEmployeeId
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

            <div className="flex-1 flex flex-col p-4 pb-24 space-y-4 overflow-hidden">
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
                        onEmptyCellClick={handleEmptyCellClick}
                    />
                )}
            </div>

            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => {
                    setIsScheduleModalOpen(false);
                    setSelectedEntry(null);
                }}
                employees={employees}
                planningSettings={planningSettings}
                existingEntry={selectedEntry}
            />

            <BottomNav />
        </div>
    );
}
