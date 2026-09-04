/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, getDoc, query, serverTimestamp, updateDoc, where, getDocs } from 'firebase/firestore';
import { normalizeDataJson } from '@/lib/quote-calculations';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter as AlertDialogFooterLayout,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Calendar, Clock, Briefcase, Trash2, Navigation, Search, Check } from 'lucide-react';
import { PlanningEntry, PlanningEntryType, PlanningSettings, TimelineView } from '@/lib/types-planning';
import { autoSplitJob, calculateEndDateFromHours } from '@/lib/planning-utils';
import { usePlanningData } from '@/hooks/usePlanningData';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildGoogleMapsDirectionsUrl, resolveQuoteProjectAddress } from '@/lib/maps';
import { getPlanningQuoteMetrics } from '@/lib/planning-earnings';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Quote {
    id: string;
    titel?: string;
    amount?: number;
    totaalbedrag?: number;
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
        afwijkendProjectadres?: boolean;
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
    };
    offerteNummer?: number;
}

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    planningSettings: PlanningSettings;
    view?: TimelineView;
    preselectedQuote?: Quote;
    preselectedHours?: number;
    existingEntry?: PlanningEntry | null;
    preselectedDate?: Date;
    preselectedPlanningType?: PlanningEntryType;
    preselectedStartTime?: string;
    preselectedQuoteId?: string;
    preselectedTotalHours?: number;
}

export function ScheduleModal({
    isOpen,
    onClose,
    planningSettings,
    view,
    preselectedQuote,
    preselectedHours,
    existingEntry,
    preselectedDate,
    preselectedPlanningType = 'job',
    preselectedStartTime,
    preselectedQuoteId,
    preselectedTotalHours,
}: ScheduleModalProps) {
    const router = useRouter();
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { addEntry, addMultipleEntries, updateEntry, deleteEntry } = usePlanningData();

    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
    const [hasLoadedQuotes, setHasLoadedQuotes] = useState(false);
    const [isQuotePickerOpen, setIsQuotePickerOpen] = useState(false);
    const [quoteSearch, setQuoteSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [quoteMetricsById, setQuoteMetricsById] = useState<Record<string, { totalHours: number; totalEarnings: number }>>({});

    const [selectedQuoteId, setSelectedQuoteId] = useState<string>(preselectedQuoteId || preselectedQuote?.id || '');
    const [startDate, setStartDate] = useState<string>(
        preselectedDate
            ? format(preselectedDate, 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd')
    );
    const [endDate, setEndDate] = useState<string>('');
    const [startTime, setStartTime] = useState<string>(planningSettings.defaultStartTime);
    const [endTime, setEndTime] = useState<string>(planningSettings.defaultEndTime);
    const [totalHours, setTotalHours] = useState<number>(0);
    const [useAutoSplit, setUseAutoSplit] = useState(true);
    const [selectedPlanningType, setSelectedPlanningType] = useState<PlanningEntryType>(preselectedPlanningType);
    const [manualProjectAddress, setManualProjectAddress] = useState<string>('');
    const [hasManualProjectAddressOverride, setHasManualProjectAddressOverride] = useState(false);
    const initializedForOpenRef = useRef(false);
    const hasManualEndDateRef = useRef(false);
    const timeInputRef = useRef<HTMLInputElement | null>(null);

    const addOneHourToTime = (timeValue: string) => {
        if (!timeValue) return '';
        const [hRaw, mRaw] = timeValue.split(':');
        const h = Number(hRaw);
        const m = Number(mRaw);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
        const base = new Date(2000, 0, 1, h, m, 0, 0);
        const plusOne = new Date(base.getTime() + 60 * 60 * 1000);
        return format(plusOne, 'HH:mm');
    };

    // Load only the quote that is already linked when the modal opens. The full
    // list is loaded lazily when the picker is opened so the modal appears
    // immediately, especially for Google Calendar entries without a quote.
    useEffect(() => {
        if (!isOpen || !user || !firestore) return;

        setQuoteSearch('');
        setIsQuotePickerOpen(false);

        const linkedQuoteId = existingEntry?.quoteId || preselectedQuoteId || preselectedQuote?.id || '';
        if (preselectedQuote) {
            setQuotes((current) => [
                preselectedQuote,
                ...current.filter((quote) => quote.id !== preselectedQuote.id),
            ]);
        }
        if (!linkedQuoteId || preselectedQuote?.id === linkedQuoteId) return;

        let cancelled = false;
        void getDoc(doc(firestore, 'quotes', linkedQuoteId)).then((linkedQuoteSnapshot) => {
            if (cancelled || !linkedQuoteSnapshot.exists()) return;
            const linkedQuote = {
                id: linkedQuoteSnapshot.id,
                ...linkedQuoteSnapshot.data(),
            } as Quote;
            setQuotes((current) => [
                linkedQuote,
                ...current.filter((quote) => quote.id !== linkedQuote.id),
            ]);
        }).catch((err) => {
            console.error('Error fetching linked quote:', err);
        });

        return () => {
            cancelled = true;
        };
    }, [isOpen, user, firestore, existingEntry, preselectedQuoteId, preselectedQuote]);

    const loadQuotes = useCallback(async () => {
        if (!user || !firestore || hasLoadedQuotes || isLoadingQuotes) return;

        setIsLoadingQuotes(true);
        try {
            const q = query(
                collection(firestore, 'quotes'),
                where('userId', '==', user.uid)
            );
            const snap = await getDocs(q);
            const data = snap.docs
                .map(d => ({
                    id: d.id,
                    ...d.data()
                }) as Quote & { isCalculationTest?: boolean })
                .filter((quote) => quote.isCalculationTest !== true) as Quote[];

            data.sort((a, b) => (b.offerteNummer || 0) - (a.offerteNummer || 0));
            setQuotes((current) => {
                const quotesById = new Map(current.map((quote) => [quote.id, quote]));
                data.forEach((quote) => quotesById.set(quote.id, quote));
                return Array.from(quotesById.values()).sort((a, b) => (b.offerteNummer || 0) - (a.offerteNummer || 0));
            });
            setHasLoadedQuotes(true);
        } catch (err) {
            console.error('Error fetching quotes:', err);
            toast({ variant: 'destructive', title: 'Offertes konden niet worden geladen' });
        } finally {
            setIsLoadingQuotes(false);
        }
    }, [firestore, hasLoadedQuotes, isLoadingQuotes, toast, user]);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            // Reset to defaults when modal closes
            setConfirmDeleteOpen(false);
            setSelectedQuoteId(preselectedQuoteId || preselectedQuote?.id || '');
            setStartDate(
                preselectedDate
                    ? format(preselectedDate, 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd')
            );
            setEndDate('');
            hasManualEndDateRef.current = false;
            setStartTime(preselectedStartTime || planningSettings.defaultStartTime);
            setEndTime(planningSettings.defaultEndTime);
            setTotalHours(preselectedTotalHours || preselectedHours || 0);
            setUseAutoSplit(true);
            setSelectedPlanningType(preselectedPlanningType);
            setManualProjectAddress('');
            setHasManualProjectAddressOverride(false);
        }
    }, [
        isOpen,
        preselectedDate,
        planningSettings,
        preselectedPlanningType,
        preselectedQuoteId,
        preselectedQuote,
        preselectedStartTime,
        preselectedTotalHours,
        preselectedHours,
    ]);

    // Initialize form once per open cycle
    useEffect(() => {
        if (!isOpen) {
            initializedForOpenRef.current = false;
            return;
        }

        if (initializedForOpenRef.current) return;
        initializedForOpenRef.current = true;

        if (existingEntry) {
            setSelectedQuoteId(existingEntry.quoteId);
            const start = existingEntry.startDate.toDate();
            const end = existingEntry.endDate.toDate();
            const existingType = existingEntry.planningType || 'job';
            setStartDate(format(start, 'yyyy-MM-dd'));
            setEndDate(format(end, 'yyyy-MM-dd'));
            hasManualEndDateRef.current = true;
            setStartTime(format(start, 'HH:mm'));
            setEndTime(existingType === 'werkbespreking' ? addOneHourToTime(format(start, 'HH:mm')) : format(end, 'HH:mm'));
            setTotalHours(existingType === 'werkbespreking' ? 1 : existingEntry.scheduledHours);
            setUseAutoSplit(false);
            setSelectedPlanningType(existingType);
            const cachedProjectAddress = existingEntry.cache?.projectAddress?.trim() || '';
            setManualProjectAddress(cachedProjectAddress);
            setHasManualProjectAddressOverride(Boolean(cachedProjectAddress));
        } else {
            setSelectedQuoteId(preselectedQuoteId || preselectedQuote?.id || '');

            if (preselectedDate) {
                setStartDate(format(preselectedDate, 'yyyy-MM-dd'));
            } else {
                setStartDate(format(new Date(), 'yyyy-MM-dd'));
            }

            setEndDate('');
            hasManualEndDateRef.current = false;
            setStartTime(preselectedStartTime || planningSettings.defaultStartTime);
            setEndTime(planningSettings.defaultEndTime);
            setTotalHours(preselectedTotalHours || preselectedHours || 0);
            setUseAutoSplit(planningSettings.allowAutoSplit);
            setSelectedPlanningType(preselectedPlanningType);
            setManualProjectAddress(preselectedQuote ? resolveQuoteProjectAddress(preselectedQuote) : '');
            setHasManualProjectAddressOverride(false);
        }
    }, [
        isOpen,
        existingEntry,
        preselectedQuote,
        preselectedHours,
        preselectedDate,
        planningSettings.defaultStartTime,
        planningSettings.defaultEndTime,
        planningSettings.allowAutoSplit,
        preselectedPlanningType,
        preselectedStartTime,
        preselectedQuoteId,
        preselectedTotalHours,
    ]);

    const handleCreateNewClientAndQuote = useCallback(() => {
        const params = new URLSearchParams({
            returnTo: 'planningSchedule',
            scheduleType: selectedPlanningType,
            view: view || 'week',
            prefillDate: startDate || format(new Date(), 'yyyy-MM-dd'),
            prefillTime: (startTime || planningSettings.defaultStartTime || '08:00').trim(),
            prefillHours: String(selectedPlanningType === 'werkbespreking' ? 1 : (totalHours || preselectedHours || 0)),
            openScheduleModal: '1',
        });

        router.push(`/offertes/nieuw?${params.toString()}`);
    }, [
        planningSettings.defaultStartTime,
        preselectedHours,
        router,
        selectedPlanningType,
        startDate,
        startTime,
        totalHours,
        view,
    ]);

    useEffect(() => {
        if (selectedPlanningType === 'werkbespreking') {
            setTotalHours(1);
            setEndTime(addOneHourToTime(startTime || planningSettings.defaultStartTime));
        }
    }, [selectedPlanningType, startTime, planningSettings.defaultStartTime]);

    useEffect(() => {
        if (!isOpen || selectedPlanningType !== 'werkbespreking') return;

        const shouldFocusTimeInput = Boolean(preselectedStartTime);
        if (!shouldFocusTimeInput) return;

        const timer = window.setTimeout(() => {
            const input = timeInputRef.current;
            if (!input) return;
            input.focus();
            input.select();
        }, 20);

        return () => window.clearTimeout(timer);
    }, [isOpen, selectedPlanningType, preselectedStartTime]);

    const syncHoursFromTimes = (nextStart: string, nextEnd: string, baseDate: string) => {
        if (view !== 'day') return;
        if (!nextStart || !nextEnd || !baseDate) return;
        const start = new Date(`${baseDate}T${nextStart}`);
        const end = new Date(`${baseDate}T${nextEnd}`);
        const diff = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
        if (diff) {
            setTotalHours(diff);
        }
    };

    // Fetch quote metrics when quote changes
    useEffect(() => {
        if (!selectedQuoteId || !firestore || existingEntry || !user) return;

        const fetchQuoteMetrics = async () => {
            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/quotes/get-calculations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        quoteId: selectedQuoteId,
                        status: 'completed',
                        latestOnly: true,
                    }),
                });

                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                    console.error('Error fetching calculation:', payload.message);
                    return;
                }

                if (payload.row?.data_json) {
                    const normalized = normalizeDataJson(payload.row.data_json);
                    const metrics = getPlanningQuoteMetrics(payload.row.data_json);

                    setQuoteMetricsById((prev) => ({
                        ...prev,
                        [selectedQuoteId]: metrics,
                    }));

                    if (selectedPlanningType !== 'werkbespreking' && normalized?.totaal_uren) {
                        setTotalHours(normalized.totaal_uren);
                    }
                }
            } catch (err) {
                console.error('Error fetching quote hours:', err);
            }
        };

        fetchQuoteMetrics();
    }, [selectedQuoteId, firestore, existingEntry, user, selectedPlanningType]);

    const getQuoteLabel = (quote: Quote) => {
        const parts: string[] = [];
        if (quote.offerteNummer) parts.push(`#${quote.offerteNummer}`);

        const info = quote.klantinformatie;
        const clientName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam;
        if (clientName) parts.push(clientName);

        if (quote.titel) parts.push(quote.titel);

        return parts.join(' - ') || 'Naamloze offerte';
    };

    const getClientName = (quote: Quote) => {
        const info = quote.klantinformatie;
        const fullName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ').trim();
        return info?.bedrijfsnaam || fullName || 'Onbekende klant';
    };

    const filteredQuotes = useMemo(() => {
        const normalizedSearch = quoteSearch.trim().toLocaleLowerCase();
        if (!normalizedSearch) return quotes;

        return quotes.filter((quote) => {
            const info = quote.klantinformatie;
            const fullName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ').trim();
            const clientName = info?.bedrijfsnaam || fullName || 'Onbekende klant';
            const quoteLabel = [
                quote.offerteNummer ? `#${quote.offerteNummer}` : '',
                clientName,
                quote.titel || '',
            ].filter(Boolean).join(' - ');
            const searchText = [
                quoteLabel,
                quote.titel || '',
                info?.plaats || '',
            ].join(' ').toLocaleLowerCase();
            return searchText.includes(normalizedSearch);
        });
    }, [quoteSearch, quotes]);

    const selectedQuote = useMemo(() => {
        if (selectedQuoteId) {
            return quotes.find((quote) => quote.id === selectedQuoteId)
                || (preselectedQuote?.id === selectedQuoteId ? preselectedQuote : undefined);
        }
        return preselectedQuote?.id ? preselectedQuote : undefined;
    }, [selectedQuoteId, quotes, preselectedQuote]);

    useEffect(() => {
        if (!isOpen) return;

        if (!selectedQuote) {
            setManualProjectAddress('');
            setHasManualProjectAddressOverride(false);
            return;
        }

        if (existingEntry) {
            const cachedProjectAddress = existingEntry.cache?.projectAddress?.trim() || '';
            if (cachedProjectAddress) {
                setManualProjectAddress(cachedProjectAddress);
                setHasManualProjectAddressOverride(true);
                return;
            }
        }

        setManualProjectAddress(resolveQuoteProjectAddress(selectedQuote));
        setHasManualProjectAddressOverride(false);
    }, [isOpen, existingEntry, selectedQuote]);

    const derivedQuoteAddress = useMemo(
        () => (selectedQuote ? resolveQuoteProjectAddress(selectedQuote) : ''),
        [selectedQuote]
    );

    const routeDestinationAddress = useMemo(
        () => (hasManualProjectAddressOverride ? manualProjectAddress.trim() : derivedQuoteAddress),
        [hasManualProjectAddressOverride, manualProjectAddress, derivedQuoteAddress]
    );

    const routeMapsUrl = useMemo(
        () => (routeDestinationAddress ? buildGoogleMapsDirectionsUrl(routeDestinationAddress) : ''),
        [routeDestinationAddress]
    );

    const splitEntries = useMemo(() => {
        if (selectedPlanningType === 'werkbespreking') {
            return null;
        }

        if (!useAutoSplit || totalHours <= planningSettings.defaultWorkdayHours) {
            return null;
        }

        return autoSplitJob(totalHours, new Date(startDate), planningSettings);
    }, [useAutoSplit, totalHours, startDate, planningSettings, selectedPlanningType]);

    const computedEndDateTime = useMemo(() => {
        if (!startDate) {
            return { date: '', time: '' };
        }

        const start = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);

        if (selectedPlanningType === 'werkbespreking') {
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            return {
                date: format(end, 'yyyy-MM-dd'),
                time: format(end, 'HH:mm'),
            };
        }

        if (splitEntries && useAutoSplit && splitEntries.length > 0) {
            const last = splitEntries[splitEntries.length - 1];
            return {
                date: format(last.endDate, 'yyyy-MM-dd'),
                time: format(last.endDate, 'HH:mm'),
            };
        }

        if (view === 'day') {
            const manualEnd = new Date(`${startDate}T${endTime || planningSettings.defaultEndTime}`);
            return {
                date: format(manualEnd, 'yyyy-MM-dd'),
                time: format(manualEnd, 'HH:mm'),
            };
        }

        const derivedEnd = calculateEndDateFromHours(start, totalHours || 0, planningSettings.pauzeMinuten ?? 0);
        return {
            date: format(derivedEnd, 'yyyy-MM-dd'),
            time: format(derivedEnd, 'HH:mm'),
        };
    }, [
        startDate,
        startTime,
        endTime,
        totalHours,
        selectedPlanningType,
        splitEntries,
        useAutoSplit,
        view,
        planningSettings.defaultStartTime,
        planningSettings.defaultEndTime,
        planningSettings.pauzeMinuten,
    ]);

    // Keep the default end date in sync with the calculated duration until the
    // user edits it explicitly. This also updates the date after quote hours
    // have been loaded asynchronously.
    useEffect(() => {
        if (!isOpen || existingEntry || hasManualEndDateRef.current || !computedEndDateTime.date) return;
        setEndDate(computedEndDateTime.date);
    }, [isOpen, existingEntry, computedEndDateTime.date]);

    const performSave = useCallback(async () => {
        // Validation for single user mode
        if ((!existingEntry && !selectedQuoteId) || !firestore) {
            setIsSaving(false);
            toast({ variant: 'destructive', title: 'Selecteer een offerte' });
            return;
        }

        if (selectedPlanningType !== 'werkbespreking' && !totalHours) {
            setIsSaving(false);
            toast({ variant: 'destructive', title: 'Vul aantal uren in' });
            return;
        }

        const effectiveEndDate = endDate || computedEndDateTime.date;
        if (selectedPlanningType !== 'werkbespreking') {
            const start = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);
            const end = new Date(`${effectiveEndDate}T${view === 'day' ? endTime : computedEndDateTime.time}`);
            if (!effectiveEndDate || !Number.isFinite(end.getTime()) || end.getTime() < start.getTime()) {
                setIsSaving(false);
                toast({ variant: 'destructive', title: 'Einddatum moet op of na de startdatum liggen' });
                return;
            }
        }

        setIsSaving(true);

        try {
            const werkbesprekingDurationHours = 1;
            const quote = quotes.find(q => q.id === selectedQuoteId) || preselectedQuote;
            if (!quote && !existingEntry) {
                console.error('Quote not found:', selectedQuoteId);
                toast({ variant: 'destructive', title: 'Offerte niet gevonden', description: 'Herlaad de pagina.' });
                setIsSaving(false);
                return;
            }

            const info = quote?.klantinformatie;
            const clientName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam || existingEntry?.cache.clientName || '';
            const address = routeDestinationAddress || existingEntry?.cache.projectAddress || '';
            const projectTitle = quote
                ? selectedPlanningType === 'werkbespreking'
                    ? `Werkbespreking${quote.titel ? ` · ${quote.titel}` : ''}`
                    : (quote.titel || 'Klus')
                : (existingEntry?.cache.projectTitle || 'Klus');

            const cache = {
                ...(existingEntry?.cache || {}),
                clientName,
                projectTitle,
                projectAddress: address,
                totalQuoteHours: selectedPlanningType === 'werkbespreking'
                    ? werkbesprekingDurationHours
                    : (quoteMetricsById[selectedQuoteId]?.totalHours || totalHours || existingEntry?.cache.totalQuoteHours || 0),
                totalQuoteAmount: Number((quote as any)?.totaalbedrag || (quote as any)?.amount || existingEntry?.cache.totalQuoteAmount || 0) || 0,
                totalQuoteEarnings: quoteMetricsById[selectedQuoteId]?.totalEarnings || existingEntry?.cache.totalQuoteEarnings || 0,
            };

            if (existingEntry) {
                // Update existing entry
                const entryStart = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);
                const shouldDeriveFromHours = selectedPlanningType !== 'werkbespreking' && view !== 'day';
                const entryEnd = selectedPlanningType === 'werkbespreking'
                    ? new Date(entryStart.getTime() + werkbesprekingDurationHours * 60 * 60 * 1000)
                    : shouldDeriveFromHours
                        ? new Date(`${effectiveEndDate}T${computedEndDateTime.time}`)
                        : new Date(`${effectiveEndDate}T${endTime || planningSettings.defaultEndTime}`);
                const hours = selectedPlanningType === 'werkbespreking'
                    ? werkbesprekingDurationHours
                    : shouldDeriveFromHours
                        ? totalHours
                        : Math.max(0, (entryEnd.getTime() - entryStart.getTime()) / (1000 * 60 * 60)) || totalHours;
                await updateEntry(existingEntry.id, {
                    ...(selectedQuoteId ? { quoteId: selectedQuoteId } : {}),
                    startDate: entryStart,
                    endDate: entryEnd,
                    scheduledHours: hours,
                    planningType: selectedPlanningType,
                    // Handmatig openen en opslaan bevestigt een automatische suggestie.
                    status: existingEntry.status === 'pending' ? 'scheduled' : existingEntry.status,
                    cache,
                });
                toast({ title: 'Planning bijgewerkt' });
            } else if (splitEntries) {
                // Create multiple split entries
                const entries = splitEntries.map((split) => ({
                    quoteId: selectedQuoteId,
                    startDate: split.startDate,
                    endDate: split.endDate,
                    scheduledHours: split.hours,
                    planningType: selectedPlanningType,
                    isAutoSplit: true,
                    cache
                }));

                await addMultipleEntries(entries);
                toast({
                    title: 'Planning aangemaakt',
                    description: `${entries.length} werkdagen ingepland`
                });
            } else {
                // Single entry
                const entryStart = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);
                const shouldDeriveFromHours = selectedPlanningType !== 'werkbespreking' && view !== 'day';
                const entryEnd = selectedPlanningType === 'werkbespreking'
                    ? new Date(entryStart.getTime() + werkbesprekingDurationHours * 60 * 60 * 1000)
                    : shouldDeriveFromHours
                        ? new Date(`${effectiveEndDate}T${computedEndDateTime.time}`)
                        : new Date(`${effectiveEndDate}T${endTime || planningSettings.defaultEndTime}`);
                const hours = selectedPlanningType === 'werkbespreking'
                    ? werkbesprekingDurationHours
                    : shouldDeriveFromHours
                        ? totalHours
                        : Math.max(0, (entryEnd.getTime() - entryStart.getTime()) / (1000 * 60 * 60)) || totalHours;

                await addEntry({
                    quoteId: selectedQuoteId,
                    startDate: entryStart,
                    endDate: entryEnd,
                    scheduledHours: hours,
                    planningType: selectedPlanningType,
                    cache
                });
                toast({ title: 'Planning aangemaakt' });
            }

            if (selectedPlanningType === 'werkbespreking' && selectedQuoteId) {
                const meetingStart = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);
                await updateDoc(doc(firestore, 'quotes', selectedQuoteId), {
                    status: meetingStart.getTime() <= Date.now() ? 'concept' : 'werkbespreking',
                    updatedAt: serverTimestamp(),
                });
            }

            onClose();
        } catch (err) {
            console.error('Error saving planning:', err);
            toast({
                variant: 'destructive',
                title: 'Fout bij opslaan',
                description: err instanceof Error ? err.message : 'Onbekende fout'
            });
        } finally {
            setIsSaving(false);
        }
    }, [
        selectedQuoteId,
        firestore,
        toast,
        totalHours,
        quotes,
        preselectedQuote,
        existingEntry,
        startDate,
        endDate,
        startTime,
        planningSettings.defaultStartTime,
        planningSettings.defaultEndTime,
        endTime,
        updateEntry,
        splitEntries,
        addMultipleEntries,
        addEntry,
        selectedPlanningType,
        routeDestinationAddress,
        quoteMetricsById,
        view,
        computedEndDateTime,
        onClose,
    ]);

    const handleSaveClick = useCallback(() => {
        void performSave();
    }, [performSave]);

    const handleDelete = async () => {
        if (!existingEntry) return;

        setIsSaving(true);
        try {
            await deleteEntry(existingEntry.id);
            setConfirmDeleteOpen(false);
            toast({ title: 'Planning verwijderd' });
            onClose();
        } catch (err) {
            console.error('Error deleting planning:', err);
            toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {existingEntry
                            ? 'Planning Bewerken'
                            : selectedPlanningType === 'werkbespreking'
                                ? 'Werkbespreking Inplannen'
                                : 'Klus Inplannen'}
                    </DialogTitle>
                    <DialogDescription>
                        {existingEntry
                            ? 'Pas de planning aan of verwijder deze.'
                            : preselectedQuote && preselectedDate
                            ? `Plan in op ${format(new Date(startDate), 'd MMMM yyyy', { locale: nl })}`
                            : 'Plan een offerte in voor een uitvoerder.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Quote Selection */}
                    <div className="space-y-2">
                        <Label>Type planning</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant={selectedPlanningType === 'werkbespreking' ? 'default' : 'outline'}
                                className={cn(
                                    'justify-start',
                                    selectedPlanningType === 'werkbespreking'
                                        ? 'bg-cyan-500 hover:bg-cyan-500/90 text-cyan-950'
                                        : ''
                                )}
                                onClick={() => setSelectedPlanningType('werkbespreking')}
                                disabled={isSaving}
                            >
                                Werkbespreking
                            </Button>
                            <Button
                                type="button"
                                variant={selectedPlanningType === 'job' ? 'default' : 'outline'}
                                className={cn(
                                    'justify-start',
                                    selectedPlanningType === 'job'
                                        ? 'bg-emerald-500 hover:bg-emerald-500/90 text-emerald-950'
                                        : ''
                                )}
                                onClick={() => setSelectedPlanningType('job')}
                                disabled={isSaving}
                            >
                                Klus
                            </Button>
                        </div>
                    </div>

                    {/* Quote Selection */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            Offerte / Klus
                        </Label>
                        <Popover
                            open={isQuotePickerOpen}
                            onOpenChange={(open) => {
                                setIsQuotePickerOpen(open);
                                if (open) void loadQuotes();
                                if (!open) setQuoteSearch('');
                            }}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between font-normal"
                                    disabled={isSaving || (!!existingEntry && Boolean(existingEntry.quoteId))}
                                >
                                    <span className="truncate text-left">
                                        {selectedQuote
                                            ? getQuoteLabel(selectedQuote)
                                            : selectedQuoteId && existingEntry?.cache.clientName
                                                ? existingEntry.cache.clientName
                                                : 'Selecteer een offerte'}
                                    </span>
                                    <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        autoFocus
                                        value={quoteSearch}
                                        onChange={(event) => setQuoteSearch(event.target.value)}
                                        placeholder="Zoek op klant, offerte of titel..."
                                        className="h-9 pl-9"
                                    />
                                </div>
                                <div className="mt-2 max-h-64 overflow-y-auto">
                                    {isLoadingQuotes ? (
                                        <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Offertes laden...
                                        </div>
                                    ) : filteredQuotes.length === 0 ? (
                                        <p className="px-2 py-3 text-sm text-muted-foreground">
                                            Geen offertes gevonden.
                                        </p>
                                    ) : (
                                        filteredQuotes.map((quote) => (
                                            <button
                                                key={quote.id}
                                                type="button"
                                                role="option"
                                                aria-selected={selectedQuoteId === quote.id}
                                                className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                                onClick={() => {
                                                    setSelectedQuoteId(quote.id);
                                                    setQuoteSearch('');
                                                    setIsQuotePickerOpen(false);
                                                }}
                                            >
                                                <span className="truncate">{getQuoteLabel(quote)}</span>
                                                {selectedQuoteId === quote.id && <Check className="ml-2 h-4 w-4 shrink-0" />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={handleCreateNewClientAndQuote}
                            disabled={isSaving}
                        >
                            Nieuwe klant + offerte toevoegen
                        </Button>
                    </div>

                    {selectedQuote && (
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-foreground">{getClientName(selectedQuote)}</p>
                                <Label htmlFor="projectAddressInput" className="text-xs text-muted-foreground">Projectadres</Label>
                                <Input
                                    id="projectAddressInput"
                                    value={manualProjectAddress}
                                    onChange={(event) => {
                                        setManualProjectAddress(event.target.value);
                                        setHasManualProjectAddressOverride(true);
                                    }}
                                    placeholder="Bijv. Hoofdstraat 10, 1234 AB Utrecht"
                                    disabled={isSaving}
                                />
                                {!routeDestinationAddress && (
                                    <p className="text-xs text-muted-foreground">Geen projectadres beschikbaar.</p>
                                )}
                            </div>
                            {routeMapsUrl && (
                                <div className="mt-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 gap-2"
                                        onClick={() => {
                                            window.location.assign(routeMapsUrl);
                                        }}
                                        title={routeDestinationAddress}
                                    >
                                        <Navigation className="h-4 w-4" />
                                        Route
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Start / End Date */}
                    <div className={cn('gap-3', selectedPlanningType === 'werkbespreking' ? 'grid grid-cols-1' : 'grid grid-cols-1 sm:grid-cols-3')}>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {selectedPlanningType === 'werkbespreking' ? 'Datum' : 'Startdatum'}
                            </Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    const nextDate = e.target.value;
                                    setStartDate(nextDate);
                                    syncHoursFromTimes(startTime, endTime, nextDate);
                                }}
                            />
                        </div>
                        {selectedPlanningType !== 'werkbespreking' && (
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Einddatum
                                </Label>
                                <Input
                                    type="date"
                                    value={endDate || computedEndDateTime.date}
                                    min={startDate}
                                    onChange={(e) => {
                                        hasManualEndDateRef.current = true;
                                        setEndDate(e.target.value);
                                        // A manually chosen end date describes one
                                        // continuous planning item, so disable the
                                        // automatic multi-day split.
                                        if (splitEntries) setUseAutoSplit(false);
                                    }}
                                    disabled={isSaving}
                                />
                            </div>
                        )}
                        {selectedPlanningType !== 'werkbespreking' && (
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Eindtijd
                                </Label>
                                <Input
                                    type="time"
                                    value={computedEndDateTime.time}
                                    readOnly
                                    disabled
                                />
                            </div>
                        )}
                    </div>

                    {(view === 'day' || selectedPlanningType === 'werkbespreking') && (
                        <div className={cn('gap-3', selectedPlanningType === 'werkbespreking' ? 'grid grid-cols-1' : 'grid grid-cols-2')}>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {selectedPlanningType === 'werkbespreking' ? 'Tijdstip' : 'Starttijd'}
                                </Label>
                                <Input
                                    ref={timeInputRef}
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => {
                                        const nextStart = e.target.value;
                                        setStartTime(nextStart);
                                        if (selectedPlanningType === 'werkbespreking') {
                                            setEndTime(addOneHourToTime(nextStart));
                                        } else {
                                            syncHoursFromTimes(nextStart, endTime, startDate);
                                        }
                                    }}
                                />
                            </div>
                            {selectedPlanningType !== 'werkbespreking' && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Eindtijd
                                    </Label>
                                    <Input
                                        type="time"
                                        value={endTime}
                                        onChange={(e) => {
                                            const nextEnd = e.target.value;
                                            setEndTime(nextEnd);
                                            syncHoursFromTimes(startTime, nextEnd, startDate);
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hours */}
                    {selectedPlanningType !== 'werkbespreking' && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Aantal uren
                            </Label>
                            <Input
                                type="number"
                                step="0.5"
                                min="0.5"
                                value={totalHours || ''}
                                onChange={(e) => setTotalHours(Number(e.target.value))}
                                placeholder="Bijv. 24"
                            />
                            {totalHours > planningSettings.defaultWorkdayHours && (
                                <p className="text-xs text-muted-foreground">
                                    Dit is meer dan {planningSettings.defaultWorkdayHours} uur (1 werkdag)
                                </p>
                            )}
                        </div>
                    )}

                    {/* Auto-split toggle */}
                    {selectedPlanningType !== 'werkbespreking' && totalHours > planningSettings.defaultWorkdayHours && !existingEntry && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <div className="space-y-0.5">
                                <Label>Automatisch opdelen</Label>
                                <p className="text-xs text-muted-foreground">
                                    Verdeel over {splitEntries?.length || Math.ceil(totalHours / planningSettings.defaultWorkdayHours)} werkdagen
                                </p>
                            </div>
                            <Switch
                                checked={useAutoSplit}
                                onCheckedChange={setUseAutoSplit}
                            />
                        </div>
                    )}

                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {existingEntry && (
                        <Button
                            variant="destructiveSoft"
                            onClick={() => setConfirmDeleteOpen(true)}
                            disabled={isSaving}
                            className="sm:mr-auto"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Verwijderen
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                        Annuleren
                    </Button>
                    <Button
                        variant="success"
                        onClick={handleSaveClick}
                        disabled={isSaving || (!existingEntry && !selectedQuoteId) || (selectedPlanningType !== 'werkbespreking' && !totalHours)}
                    >
                        {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {existingEntry ? 'Bijwerken' : selectedPlanningType === 'werkbespreking' ? 'Werkbespreking inplannen' : 'Klus inplannen'}
                    </Button>
                </DialogFooter>

                <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Planning verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Deze planning wordt verwijderd. Dit kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooterLayout>
                            <AlertDialogCancel asChild>
                                <Button variant="ghost" disabled={isSaving}>Annuleren</Button>
                            </AlertDialogCancel>
                            <AlertDialogAction
                                asChild
                                onClick={(event) => {
                                    event.preventDefault();
                                    void handleDelete();
                                }}
                            >
                                <Button variant="destructiveSoft" disabled={isSaving}>
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Verwijderen
                                </Button>
                            </AlertDialogAction>
                        </AlertDialogFooterLayout>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}
