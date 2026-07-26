/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { DashboardHeader } from '@/components/DashboardHeader';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, RefreshCw, Settings } from 'lucide-react';
import { usePlanningData } from '@/hooks/usePlanningData';
import { TimelineView, PlanningEntry, PlanningEntryType } from '@/lib/types-planning';
import { getDateRangeForView, autoSplitJob, calculateEndDateFromHours } from '@/lib/planning-utils';
import { PlanningGrid } from '@/components/planning/PlanningGrid';
import { ScheduleModal } from '@/components/planning/ScheduleModal';
import { SchedulingBanner } from '@/components/planning/SchedulingBanner';
import { MobileMonthCalendar } from '@/components/planning/MobileMonthCalendar';
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, isToday } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DEFAULT_PLANNING_SETTINGS, PlanningSettings } from '@/lib/types-planning';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { getPlanningQuoteMetrics } from '@/lib/planning-earnings';
import { resolveQuoteProjectAddress } from '@/lib/maps';

interface Quote {
    id: string;
    titel?: string;
    amount?: number;
    totaalbedrag?: number;
    totaal_uren?: number;
    klantinformatie?: {
        voornaam?: string;
        achternaam?: string;
        bedrijfsnaam?: string;
        straat?: string;
        huisnummer?: string;
        postcode?: string;
        plaats?: string;
        projectStraat?: string;
        projectHuisnummer?: string;
        projectPostcode?: string;
        projectPlaats?: string;
        projectadres?: {
            straat?: string;
            huisnummer?: string;
            postcode?: string;
            plaats?: string;
        };
        projectAdres?: {
            straat?: string;
            huisnummer?: string;
            postcode?: string;
            plaats?: string;
        };
        factuuradres?: {
            straat?: string;
            huisnummer?: string;
            postcode?: string;
            plaats?: string;
        };
        factuurAdres?: {
            straat?: string;
            huisnummer?: string;
            postcode?: string;
            plaats?: string;
        };
    };
    offerteNummer?: number;
}

const QUOTE_WERKBESPREKING_DEFAULT_START_TIME = '19:00';

function PlanningPageContent() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isMobile = useIsMobile();

    // Extract URL parameters for scheduling mode
    const schedulingMode = searchParams?.get('mode') === 'schedule';
    const schedulingQuoteId = searchParams?.get('quoteId') || '';
    const schedulingHours = Number(searchParams?.get('hours')) || 0;
    const urlView = searchParams?.get('view') as TimelineView;
    const urlScheduleType = searchParams?.get('scheduleType');
    const schedulingType: PlanningEntryType = urlScheduleType === 'werkbespreking' ? 'werkbespreking' : 'job';
    const openScheduleModalFromQuery = searchParams?.get('openScheduleModal') === '1';
    const prefillDateParam = (searchParams?.get('prefillDate') || '').trim();
    const prefillTimeParam = (searchParams?.get('prefillTime') || '').trim();
    const prefillHoursParam = Number(searchParams?.get('prefillHours') || '');

    const [view, setView] = useState<TimelineView>(urlView || 'week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<PlanningEntry | null>(null);
    const [modalPreselectedDate, setModalPreselectedDate] = useState<Date | undefined>(undefined);
    const [modalPreselectedPlanningType, setModalPreselectedPlanningType] = useState<PlanningEntryType>('job');
    const [modalPreselectedStartTime, setModalPreselectedStartTime] = useState<string | undefined>(undefined);
    const [modalPreselectedTotalHours, setModalPreselectedTotalHours] = useState<number | undefined>(undefined);
    const [isWerkbesprekingTimeDialogOpen, setIsWerkbesprekingTimeDialogOpen] = useState(false);
    const [pendingWerkbesprekingDate, setPendingWerkbesprekingDate] = useState<Date | null>(null);
    const [werkbesprekingStartTime, setWerkbesprekingStartTime] = useState(DEFAULT_PLANNING_SETTINGS.defaultStartTime);
    const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const [draftPlanningSettings, setDraftPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const [isPlanningSettingsOpen, setIsPlanningSettingsOpen] = useState(false);
    const [isSavingPlanningSettings, setIsSavingPlanningSettings] = useState(false);
    const [isRefreshingGoogleCalendar, setIsRefreshingGoogleCalendar] = useState(false);
    const [selectedMobileDate, setSelectedMobileDate] = useState(new Date());
    const [schedulingQuote, setSchedulingQuote] = useState<Quote | null>(null);
    const [isLoadingSchedulingQuote, setIsLoadingSchedulingQuote] = useState(false);
    const [quoteFinanceById, setQuoteFinanceById] = useState<Record<string, { amount: number; totalHours: number | null; totalEarnings: number | null }>>({});
    const lastAutoOpenKeyRef = React.useRef<string>('');

    const dateRange = useMemo(() => getDateRangeForView(view, currentDate), [view, currentDate]);

    const { entries, isLoading: isLoadingEntries, updateEntry, shiftQuoteEntries, addEntry, addMultipleEntries, deleteEntriesForQuote } = usePlanningData({
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

    useEffect(() => {
        if (!user || !firestore) return;

        const fetchQuoteFinance = async () => {
            try {
                const q = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
                const snap = await getDocs(q);
                const mapped: Record<string, { amount: number; totalHours: number | null; totalEarnings: number | null }> = {};
                snap.docs.forEach((quoteDoc) => {
                    const raw = quoteDoc.data() as any;
                    if (raw?.isCalculationTest === true) return;
                    const amount = Number(raw?.totaalbedrag || raw?.amount || 0) || 0;
                    const totalHoursRaw = Number(raw?.totaal_uren);
                    const earningsExcl = Number(raw?.totals?.arbeidTotaal || 0) + Number(raw?.totals?.winstMarge || 0);
                    const btwTarief = Number(raw?.totals?.btwPercentage || raw?.instellingen?.btwTarief || 21) || 21;
                    const earningsRaw = earningsExcl > 0 ? earningsExcl * (1 + (btwTarief / 100)) : 0;
                    mapped[quoteDoc.id] = {
                        amount,
                        totalHours: Number.isFinite(totalHoursRaw) && totalHoursRaw > 0 ? totalHoursRaw : null,
                        totalEarnings: Number.isFinite(earningsRaw) && earningsRaw > 0 ? earningsRaw : null,
                    };
                });
                setQuoteFinanceById(mapped);
            } catch (err) {
                console.error('Error fetching quote finance for planning:', err);
            }
        };

        void fetchQuoteFinance();
    }, [user, firestore]);

    const activeQuoteIds = useMemo(() => {
        const ids = new Set<string>();
        entries.forEach((entry) => {
            if (entry.quoteId) ids.add(entry.quoteId);
        });
        if (schedulingQuoteId) ids.add(schedulingQuoteId);
        return Array.from(ids);
    }, [entries, schedulingQuoteId]);

    useEffect(() => {
        if (!user || activeQuoteIds.length === 0) return;

        const fetchQuoteMetrics = async () => {
            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/quotes/get-calculations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        quoteIds: activeQuoteIds,
                        status: 'completed',
                    }),
                });

                const payload = await response.json();
                if (!response.ok || !payload.ok || !Array.isArray(payload.rows)) {
                    return;
                }

                const latestByQuoteId = new Map<string, any>();
                payload.rows.forEach((row: any) => {
                    if (!row?.quoteid || latestByQuoteId.has(row.quoteid)) return;
                    latestByQuoteId.set(row.quoteid, row);
                });

                setQuoteFinanceById((prev) => {
                    const next = { ...prev };
                    latestByQuoteId.forEach((row, quoteId) => {
                        if (!row?.data_json) return;
                        const metrics = getPlanningQuoteMetrics(row.data_json);
                        const existing = next[quoteId] || { amount: 0, totalHours: null, totalEarnings: null };
                        next[quoteId] = {
                            ...existing,
                            totalHours: metrics.totalHours > 0 ? metrics.totalHours : existing.totalHours,
                            totalEarnings: metrics.totalEarnings > 0 ? metrics.totalEarnings : existing.totalEarnings,
                        };
                    });
                    return next;
                });
            } catch (err) {
                console.error('Error fetching quote metrics for planning:', err);
            }
        };

        void fetchQuoteMetrics();
    }, [user, activeQuoteIds]);

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
                : Math.max(0, Math.round(Number(input.pauzeMinuten) || 0)),
            showDailyEarnings: input.showDailyEarnings ?? DEFAULT_PLANNING_SETTINGS.showDailyEarnings,
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

    const handleRefreshGoogleCalendar = async () => {
        if (!user || isRefreshingGoogleCalendar) return;
        setIsRefreshingGoogleCalendar(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/google-calendar/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    startDate: dateRange.start.toISOString(),
                    endDate: dateRange.end.toISOString(),
                }),
            });
            const result = await response.json().catch(() => null) as {
                error?: string;
                checked?: number;
                imported?: number;
                updated?: number;
                missing?: number;
                removed?: number;
                hidden?: number;
                skipped?: number;
            } | null;

            if (!response.ok) {
                throw new Error(result?.error || 'Google Calendar vernieuwen mislukt.');
            }

            const details = [
                result?.imported ? `${result.imported} Google-item(s) geïmporteerd` : '',
                `${result?.updated || 0} planning-item(s) bijgewerkt`,
                result?.removed ? `${result.removed} lokale planning-item(s) verwijderd` : '',
                result?.missing ? `${result.missing} verwijderd Google-item niet overgenomen` : '',
                result?.skipped ? `${result.skipped} item(s) overgeslagen` : '',
            ].filter(Boolean).join('. ');
            toast({
                title: 'Google Calendar gesynchroniseerd',
                description: details || `${result?.checked || 0} gekoppelde item(s) gecontroleerd.`,
            });
        } catch (error) {
            toast({
                title: 'Synchroniseren mislukt',
                description: error instanceof Error ? error.message : 'Google Calendar vernieuwen mislukt.',
                variant: 'destructive',
            });
        } finally {
            setIsRefreshingGoogleCalendar(false);
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

    const hydratedEntries = useMemo(() => {
        return entries.map((entry) => {
            const quoteFinance = quoteFinanceById[entry.quoteId];
            const existingAmount = Number((entry.cache as any)?.totalQuoteAmount || 0);
            const existingTotalHours = Number((entry.cache as any)?.totalQuoteHours || 0);
            const existingEarnings = Number((entry.cache as any)?.totalQuoteEarnings || 0);
            return {
                ...entry,
                cache: {
                    ...entry.cache,
                    totalQuoteAmount: existingAmount > 0 ? existingAmount : (quoteFinance?.amount || 0),
                    totalQuoteHours: existingTotalHours > 0
                        ? existingTotalHours
                        : (quoteFinance?.totalHours && quoteFinance.totalHours > 0 ? quoteFinance.totalHours : entry.scheduledHours),
                    totalQuoteEarnings: existingEarnings > 0
                        ? existingEarnings
                        : (quoteFinance?.totalEarnings && quoteFinance.totalEarnings > 0 ? quoteFinance.totalEarnings : 0),
                },
            };
        });
    }, [entries, quoteFinanceById]);

    const mobilePlanningEntries = useMemo(() => {
        const toDate = (value: any): Date => {
            if (!value) return new Date();
            if (typeof value?.toDate === 'function') return value.toDate();
            if (value instanceof Date) return value;
            return new Date(value);
        };

        return hydratedEntries
            .map((entry) => {
                const start = toDate(entry.startDate);
                const end = toDate(entry.endDate);
                return {
                    entry,
                    start,
                    end,
                    clientName: entry.cache?.clientName || 'Onbekende klant',
                    projectTitle: entry.cache?.projectTitle || '',
                };
            })
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [hydratedEntries]);

    const showMobileLayout = isMobile;
    const selectedMobileDateIsToday = isToday(selectedMobileDate);
    const mobileDayEntries = useMemo(() => {
        return mobilePlanningEntries.filter((item) => {
            return (
                item.start.getFullYear() === selectedMobileDate.getFullYear()
                && item.start.getMonth() === selectedMobileDate.getMonth()
                && item.start.getDate() === selectedMobileDate.getDate()
            );
        });
    }, [mobilePlanningEntries, selectedMobileDate]);

    useEffect(() => {
        setSelectedMobileDate(currentDate);
    }, [currentDate]);

    useEffect(() => {
        if (!openScheduleModalFromQuery || !schedulingMode || !schedulingQuote) return;

        const autoOpenKey = [
            schedulingQuoteId,
            schedulingType,
            prefillDateParam,
            prefillTimeParam,
            Number.isFinite(prefillHoursParam) ? String(prefillHoursParam) : '',
        ].join('|');

        if (lastAutoOpenKeyRef.current === autoOpenKey) return;
        lastAutoOpenKeyRef.current = autoOpenKey;

        const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(prefillDateParam)
            ? new Date(`${prefillDateParam}T00:00:00`)
            : undefined;
        const safeDate = normalizedDate && !Number.isNaN(normalizedDate.getTime())
            ? normalizedDate
            : undefined;
        const safeTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(prefillTimeParam)
            ? prefillTimeParam
            : undefined;
        const safeHours = Number.isFinite(prefillHoursParam) && prefillHoursParam > 0
            ? prefillHoursParam
            : undefined;

        setSelectedEntry(null);
        setModalPreselectedDate(safeDate);
        setModalPreselectedPlanningType(schedulingType);
        setModalPreselectedStartTime(safeTime);
        setModalPreselectedTotalHours(safeHours);
        setIsScheduleModalOpen(true);
    }, [
        openScheduleModalFromQuery,
        prefillDateParam,
        prefillHoursParam,
        prefillTimeParam,
        schedulingMode,
        schedulingQuote,
        schedulingQuoteId,
        schedulingType,
    ]);

    const handleEntryClick = (entry: PlanningEntry) => {
        setSelectedEntry(entry);
        setModalPreselectedDate(undefined);
        setModalPreselectedStartTime(undefined);
        setModalPreselectedTotalHours(undefined);
        setIsScheduleModalOpen(true);
    };

    const createSchedulingEntryFromDate = async (
        date: Date,
        werkbesprekingTime?: string
    ) => {
        // In scheduling mode: directly create the planning entry
        if (!schedulingQuote || (schedulingType !== 'werkbespreking' && !schedulingHours)) {
            toast({
                title: 'Fout',
                description: 'Offerte gegevens ontbreken',
                variant: 'destructive'
            });
            return;
        }

        try {
            const clientName = schedulingQuote.klantinformatie?.bedrijfsnaam ||
                `${schedulingQuote.klantinformatie?.voornaam || ''} ${schedulingQuote.klantinformatie?.achternaam || ''}`.trim() ||
                'Onbekend';
            const projectAddress = resolveQuoteProjectAddress(schedulingQuote);
            const schedulingDurationHours = schedulingType === 'werkbespreking'
                ? 1
                : schedulingHours;

            // Scheduling from quote should replace previous job planning for that quote.
            // Without this, stale historical split rows can remain and produce incorrect pending-hour prompts.
            if (schedulingType === 'job') {
                await deleteEntriesForQuote(schedulingQuote.id);
            }

            const cacheData = {
                clientName,
                projectTitle: schedulingType === 'werkbespreking'
                    ? `Werkbespreking${schedulingQuote.titel ? ` · ${schedulingQuote.titel}` : ''}`
                    : (schedulingQuote.titel || ''),
                projectAddress,
                totalQuoteHours: schedulingDurationHours,
                totalQuoteAmount: Number((schedulingQuote as any)?.totaalbedrag || (schedulingQuote as any)?.amount || 0) || 0,
                totalQuoteEarnings: quoteFinanceById[schedulingQuote.id]?.totalEarnings || 0,
            };

            if (schedulingType !== 'werkbespreking' && schedulingDurationHours > planningSettings.defaultWorkdayHours && planningSettings.allowAutoSplit) {
                // Auto-split the job
                const splitEntries = autoSplitJob(
                    schedulingDurationHours,
                    date,
                    planningSettings
                );

                // Convert to the format expected by addMultipleEntries
                const entriesToAdd = splitEntries.map(entry => ({
                    quoteId: schedulingQuote.id,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    scheduledHours: entry.hours,
                    planningType: schedulingType,
                    isAutoSplit: true,
                    cache: cacheData
                }));

                await addMultipleEntries(entriesToAdd);

                toast({
                    title: 'Ingepland',
                    description: `${schedulingDurationHours}u verdeeld over ${splitEntries.length} werkdagen`
                });
            } else {
                // Single entry
                const selectedStartTime = schedulingType === 'werkbespreking'
                    ? (werkbesprekingTime || planningSettings.defaultStartTime)
                    : planningSettings.defaultStartTime;

                const startTime = selectedStartTime.split(':');
                const startDate = new Date(date);
                startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), 0);
                const endDate = schedulingType === 'werkbespreking'
                    ? new Date(startDate.getTime() + 60 * 60 * 1000)
                    : calculateEndDateFromHours(
                        startDate,
                        schedulingDurationHours,
                        planningSettings.pauzeMinuten ?? 0
                    );

                await addEntry({
                    quoteId: schedulingQuote.id,
                    startDate,
                    endDate,
                    scheduledHours: schedulingDurationHours,
                    planningType: schedulingType,
                    isAutoSplit: false,
                    cache: cacheData
                });

                toast({
                    title: 'Ingepland',
                    description: schedulingType === 'werkbespreking'
                        ? `Werkbespreking ingepland op ${format(date, 'd MMMM yyyy', { locale: nl })} om ${selectedStartTime}`
                        : `${schedulingDurationHours}u ingepland op ${format(date, 'd MMMM yyyy', { locale: nl })}`
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
    };

    const handleEmptyCellClick = async (date: Date) => {
        if (schedulingMode) {
            if (schedulingType === 'werkbespreking') {
                setPendingWerkbesprekingDate(date);
                setWerkbesprekingStartTime(QUOTE_WERKBESPREKING_DEFAULT_START_TIME);
                setIsWerkbesprekingTimeDialogOpen(true);
                return;
            }

            await createSchedulingEntryFromDate(date);
        } else {
            setSelectedEntry(null);
            setModalPreselectedDate(date);
            setModalPreselectedPlanningType('werkbespreking');
            setModalPreselectedStartTime(undefined);
            setModalPreselectedTotalHours(undefined);
            setIsScheduleModalOpen(true);
        }
    };

    const handleCancelScheduling = () => {
        router.push('/planning');
    };

    const handleConfirmWerkbesprekingTime = async () => {
        if (!pendingWerkbesprekingDate) return;

        const trimmed = werkbesprekingStartTime.trim();
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) {
            toast({
                title: 'Ongeldige tijd',
                description: 'Gebruik het formaat HH:mm, bijvoorbeeld 09:30.',
                variant: 'destructive'
            });
            return;
        }

        setIsWerkbesprekingTimeDialogOpen(false);
        await createSchedulingEntryFromDate(
            pendingWerkbesprekingDate,
            trimmed
        );
        setPendingWerkbesprekingDate(null);
    };

    const handleEntryDrop = async (entryId: string, newStart: Date) => {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) return;

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
                    endDate: newEnd
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

            if (diffDays !== 0) {
                // The requirements say: "move 'maandag' to 'zaterdag'... automatically adjusts the last one that would be in dinsdag as well to maandag."
                // This implies moving the whole group.
                await shiftQuoteEntries(
                    entry.quoteId,
                    entry.startDate.toDate(),
                    newStart,
                    planningSettings.workDays
                );
            }
            return;
        }

        const duration = entry.endDate.toDate().getTime() - entry.startDate.toDate().getTime();
        const newEnd = new Date(newStart.getTime() + duration);

        await updateEntry(entryId, {
            startDate: newStart,
            endDate: newEnd
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
                        planningType={schedulingType}
                        onCancel={handleCancelScheduling}
                    />
                )}

                {/* Controls */}
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                        {/* View Toggle */}
                        <div className={cn("flex bg-muted rounded-lg p-1", isMobile && "w-full")}>
                            {(['day', 'week'] as TimelineView[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                        isMobile && "flex-1",
                                        view === v
                                            ? "bg-background text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {v === 'day' ? 'Week' : 'Maand'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                        {/* Date Navigation */}
                        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted p-1">
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
                                className="h-8 max-w-[170px] px-3 text-sm sm:max-w-none"
                                onClick={() => navigateDate('today')}
                            >
                                <span className="truncate">{dateSwitchLabel}</span>
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

                        <span className="text-sm font-medium text-foreground min-w-[180px] text-center hidden sm:block">
                            {periodLabel}
                        </span>

                        <Button
                            variant="outline"
                            className="h-10 gap-2"
                            onClick={handleRefreshGoogleCalendar}
                            disabled={isRefreshingGoogleCalendar}
                            aria-label="Wijzigingen uit Google Calendar ophalen"
                            title="Google Calendar is leidend en overschrijft deze planning"
                        >
                            <RefreshCw className={cn("h-4 w-4", isRefreshingGoogleCalendar && "animate-spin")} />
                            <span className="hidden xl:inline">Google verversen</span>
                        </Button>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            onClick={handleOpenPlanningSettings}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>

                        {!isMobile && (
                            <Button
                                variant="outline"
                                className="gap-2 sm:ml-0 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/15"
                                onClick={() => {
                                    setSelectedEntry(null);
                                    setModalPreselectedDate(undefined);
                                    setModalPreselectedPlanningType('werkbespreking');
                                    setModalPreselectedStartTime(undefined);
                                    setModalPreselectedTotalHours(undefined);
                                    setIsScheduleModalOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">Werkbespreking</span>
                            </Button>
                        )}

                        <Button
                            variant="success"
                            className={cn("gap-2 sm:ml-0", isMobile && "ml-auto")}
                            onClick={() => {
                                setSelectedEntry(null);
                                setModalPreselectedDate(undefined);
                                setModalPreselectedPlanningType(schedulingMode ? schedulingType : 'job');
                                setModalPreselectedStartTime(undefined);
                                setModalPreselectedTotalHours(undefined);
                                setIsScheduleModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            <span>{isMobile ? 'Nieuw' : 'Klus inplannen'}</span>
                        </Button>
                    </div>
                </div>

                {/* Mobile Date Label */}
                <div
                    className={cn(
                        "sm:hidden text-center text-sm font-medium text-foreground",
                        showMobileLayout && selectedMobileDateIsToday && "text-emerald-300"
                    )}
                >
                    {getDateRangeLabel()}
                </div>

                {/* Planning Content */}
                {isLoadingEntries ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : showMobileLayout ? (
                    <div className="flex-1 space-y-3 overflow-y-auto pb-2">
                        <MobileMonthCalendar
                            currentDate={currentDate}
                            selectedDate={selectedMobileDate}
                            entries={hydratedEntries}
                            schedulingMode={schedulingMode}
                            onSelectDate={setSelectedMobileDate}
                            onEntryClick={handleEntryClick}
                            onScheduleDayClick={handleEmptyCellClick}
                        />

                        {schedulingMode ? (
                            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                                Tik op een dag in de kalender om direct in te plannen.
                            </div>
                        ) : mobileDayEntries.length === 0 ? (
                            <div
                                className={cn(
                                    "rounded-xl border p-5 text-sm",
                                    selectedMobileDateIsToday
                                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                                        : "border-border bg-card/60 text-muted-foreground"
                                )}
                            >
                                Geen planning op {format(selectedMobileDate, 'EEEE d MMMM', { locale: nl })}.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div
                                    className={cn(
                                        "rounded-xl border px-4 py-3 text-sm",
                                        selectedMobileDateIsToday
                                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                                            : "border-cyan-500/25 bg-cyan-500/10 text-cyan-100"
                                    )}
                                >
                                    {format(selectedMobileDate, 'EEEE d MMMM', { locale: nl })}
                                </div>
                                {mobileDayEntries.map((item) => (
                                <button
                                    key={item.entry.id}
                                    type="button"
                                    onClick={() => handleEntryClick(item.entry)}
                                    className="w-full rounded-xl border border-border/70 bg-card/70 p-4 text-left transition-colors hover:bg-card"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="truncate font-semibold text-foreground">{item.clientName}</span>
                                    </div>
                                    <div className="mt-1">
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                                (item.entry.planningType || 'job') === 'werkbespreking'
                                                    ? "bg-cyan-500/20 text-cyan-300"
                                                    : "bg-emerald-500/20 text-emerald-300"
                                            )}
                                        >
                                            {(item.entry.planningType || 'job') === 'werkbespreking' ? 'Werkbespreking' : 'Klus'}
                                        </span>
                                    </div>
                                    {item.projectTitle ? (
                                        <div className="mt-1 truncate text-xs text-muted-foreground">{item.projectTitle}</div>
                                    ) : null}
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {format(item.start, 'EEE d MMM HH:mm', { locale: nl })} - {format(item.end, 'HH:mm', { locale: nl })}
                                    </div>
                                </button>
                            ))
                            }
                            </div>
                        )}
                    </div>
                ) : (
                    <PlanningGrid
                        view={view}
                        dateRange={dateRange}
                        entries={hydratedEntries}
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
                    setModalPreselectedStartTime(undefined);
                    setModalPreselectedTotalHours(undefined);
                }}
                planningSettings={planningSettings}
                view={view}
                preselectedQuote={schedulingMode ? (schedulingQuote || undefined) : undefined}
                preselectedHours={schedulingMode && schedulingHours > 0 ? schedulingHours : undefined}
                existingEntry={
                    selectedEntry
                        ? (hydratedEntries.find((entry) => entry.id === selectedEntry.id) || selectedEntry)
                        : null
                }
                preselectedDate={modalPreselectedDate}
                preselectedPlanningType={modalPreselectedPlanningType}
                preselectedStartTime={modalPreselectedStartTime}
                preselectedQuoteId={schedulingMode ? schedulingQuoteId || undefined : undefined}
                preselectedTotalHours={modalPreselectedTotalHours}
            />

            <Dialog
                open={isWerkbesprekingTimeDialogOpen}
                onOpenChange={(open) => {
                    setIsWerkbesprekingTimeDialogOpen(open);
                    if (!open) {
                        setPendingWerkbesprekingDate(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Kies starttijd</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="werkbespreking-starttijd">Starttijd werkbespreking</Label>
                        <Input
                            id="werkbespreking-starttijd"
                            type="time"
                            value={werkbesprekingStartTime}
                            onChange={(e) => setWerkbesprekingStartTime(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsWerkbesprekingTimeDialogOpen(false);
                                setPendingWerkbesprekingDate(null);
                            }}
                        >
                            Annuleren
                        </Button>
                        <Button variant="success" onClick={handleConfirmWerkbesprekingTime}>
                            Inplannen
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPlanningSettingsOpen} onOpenChange={setIsPlanningSettingsOpen}>
                <DialogContent className="w-[95vw] sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Planning instellingen</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
