/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { normalizeDataJson } from '@/lib/quote-calculations';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Calendar, Clock, User, Briefcase, Trash2 } from 'lucide-react';
import { Employee, PlanningEntry, PlanningSettings, TimelineView } from '@/lib/types-planning';
import { autoSplitJob, formatHoursDisplay } from '@/lib/planning-utils';
import { usePlanningData } from '@/hooks/usePlanningData';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface Quote {
    id: string;
    titel?: string;
    klantinformatie?: {
        voornaam?: string;
        achternaam?: string;
        bedrijfsnaam?: string;
        projectadres?: {
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
    employees: Employee[];
    planningSettings: PlanningSettings;
    view?: TimelineView;
    preselectedQuote?: Quote;
    preselectedHours?: number;
    existingEntry?: PlanningEntry | null;
    preselectedDate?: Date;
    preselectedEmployee?: string;
}

export function ScheduleModal({
    isOpen,
    onClose,
    employees,
    planningSettings,
    view,
    preselectedQuote,
    preselectedHours,
    existingEntry,
    preselectedDate,
    preselectedEmployee
}: ScheduleModalProps) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { addEntry, addMultipleEntries, updateEntry, deleteEntry } = usePlanningData();

    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingSave, setPendingSave] = useState(false);

    const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(preselectedEmployee || '');
    const [startDate, setStartDate] = useState<string>(
        preselectedDate
            ? format(preselectedDate, 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd')
    );
    const [startTime, setStartTime] = useState<string>(planningSettings.defaultStartTime);
    const [endTime, setEndTime] = useState<string>(planningSettings.defaultEndTime);
    const [totalHours, setTotalHours] = useState<number>(0);
    const [useAutoSplit, setUseAutoSplit] = useState(true);

    // Fetch quotes
    useEffect(() => {
        if (!isOpen || !user || !firestore) return;

        const fetchQuotes = async () => {
            setIsLoadingQuotes(true);
            try {
                const q = query(
                    collection(firestore, 'quotes'),
                    where('userId', '==', user.uid)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                })) as Quote[];

                data.sort((a, b) => {
                    const numA = a.offerteNummer || 0;
                    const numB = b.offerteNummer || 0;
                    return numB - numA;
                });

                setQuotes(data);
            } catch (err) {
                console.error('Error fetching quotes:', err);
            } finally {
                setIsLoadingQuotes(false);
            }
        };

        fetchQuotes();
    }, [isOpen, user, firestore]);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            // Reset to defaults when modal closes
            setSelectedQuoteId('');
            setSelectedEmployeeId(preselectedEmployee || '');
            setStartDate(
                preselectedDate
                    ? format(preselectedDate, 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd')
            );
            setStartTime(planningSettings.defaultStartTime);
            setEndTime(planningSettings.defaultEndTime);
            setTotalHours(0);
            setUseAutoSplit(true);
        }
    }, [isOpen, preselectedDate, preselectedEmployee, planningSettings]);

    // Initialize form when modal opens
    useEffect(() => {
        if (!isOpen) return;

        if (existingEntry) {
            setSelectedQuoteId(existingEntry.quoteId);
            setSelectedEmployeeId(existingEntry.employeeId);
            const start = existingEntry.startDate.toDate();
            const end = existingEntry.endDate.toDate();
            setStartDate(format(start, 'yyyy-MM-dd'));
            setStartTime(format(start, 'HH:mm'));
            setEndTime(format(end, 'HH:mm'));
            setTotalHours(existingEntry.scheduledHours);
            setUseAutoSplit(false);
        } else {
            // Set quote from preselection
            if (!selectedQuoteId) setSelectedQuoteId(preselectedQuote?.id || '');

            // Set employee from preselection or auto-select if only one
            if (preselectedEmployee) {
                setSelectedEmployeeId(preselectedEmployee);
            } else if (!selectedEmployeeId && employees.length === 1) {
                setSelectedEmployeeId(employees[0].id);
            }

            // Set date from preselection or default to today
            if (preselectedDate) {
                setStartDate(format(preselectedDate, 'yyyy-MM-dd'));
            } else if (!startDate) {
                setStartDate(format(new Date(), 'yyyy-MM-dd'));
            }

            if (!startTime) setStartTime(planningSettings.defaultStartTime);
            if (!endTime) setEndTime(planningSettings.defaultEndTime);

            // Only set total hours if 0 (initial)
            if (totalHours === 0) {
                setTotalHours(preselectedHours || 0);
                setUseAutoSplit(planningSettings.allowAutoSplit);
            }
        }
    }, [isOpen, existingEntry, preselectedQuote, preselectedHours, preselectedDate, preselectedEmployee, employees, planningSettings, selectedQuoteId, selectedEmployeeId, startDate, startTime, endTime, totalHours]);

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

    // Fetch hours when quote changes
    useEffect(() => {
        if (!selectedQuoteId || !firestore || existingEntry) return;

        const fetchQuoteHours = async () => {
            try {
                // Fetch calculation data from Supabase
                const { data: calculation, error } = await supabase
                    .from('quotes_collection')
                    .select('data_json')
                    .eq('quoteid', selectedQuoteId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error) {
                    if (error.code === 'PGRST116') {
                        // No rows found - this is fine
                        return;
                    }
                    console.error('Error fetching calculation:', error);
                    return;
                }

                if (calculation?.data_json) {
                    const normalized = normalizeDataJson(calculation.data_json);
                    if (normalized?.totaal_uren) {
                        setTotalHours(normalized.totaal_uren);
                    }
                }
            } catch (err) {
                console.error('Error fetching quote hours:', err);
            }
        };

        fetchQuoteHours();
    }, [selectedQuoteId, firestore, existingEntry]);

    const getQuoteLabel = (quote: Quote) => {
        const parts: string[] = [];
        if (quote.offerteNummer) parts.push(`#${quote.offerteNummer}`);

        const info = quote.klantinformatie;
        const clientName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam;
        if (clientName) parts.push(clientName);

        if (quote.titel) parts.push(quote.titel);

        return parts.join(' - ') || 'Naamloze offerte';
    };

    const getProjectAddress = (quote: Quote) => {
        const info = quote.klantinformatie;
        const addr = info?.projectadres || info?.factuuradres;
        if (!addr) return '';

        const parts = [
            addr.straat,
            addr.huisnummer,
            addr.postcode,
            addr.plaats
        ].filter(Boolean);

        return parts.join(' ');
    };

    const splitEntries = useMemo(() => {
        if (!useAutoSplit || totalHours <= planningSettings.defaultWorkdayHours) {
            return null;
        }

        return autoSplitJob(totalHours, new Date(startDate), planningSettings);
    }, [useAutoSplit, totalHours, startDate, planningSettings]);

    const performSave = useCallback(async (overrideEmployeeId?: string) => {
        // Validation for single user mode
        if (!selectedQuoteId) {
            setIsSaving(false);
            setPendingSave(false);
            toast({ variant: 'destructive', title: 'Selecteer een offerte' });
            return;
        }

        if (!totalHours) {
            setIsSaving(false);
            setPendingSave(false);
            toast({ variant: 'destructive', title: 'Vul aantal uren in' });
            return;
        }

        // Auto-assign only in single-employee setups.
        const finalEmployeeId = overrideEmployeeId || selectedEmployeeId || (employees.length === 1 ? employees[0].id : '');

        if (!finalEmployeeId) {
            if (employees.length === 0) {
                // Employee list is still loading; retry once data arrives.
                setPendingSave(true);
                setIsSaving(true);
            } else {
                setIsSaving(false);
                setPendingSave(false);
                toast({
                    variant: 'destructive',
                    title: 'Selecteer een uitvoerder',
                    description: 'Kies eerst een uitvoerder voordat je de planning opslaat.',
                });
            }
            return;
        }

        setIsSaving(true);

        try {
            const quote = quotes.find(q => q.id === selectedQuoteId) || preselectedQuote;
            if (!quote) {
                console.error('Quote not found:', selectedQuoteId);
                toast({ variant: 'destructive', title: 'Offerte niet gevonden', description: 'Herlaad de pagina.' });
                setIsSaving(false);
                setPendingSave(false);
                return;
            }

            const info = quote.klantinformatie;
            const clientName = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam || '';
            const address = getProjectAddress(quote);

            const cache = {
                clientName,
                projectTitle: quote.titel || 'Klus',
                projectAddress: address,
                totalQuoteHours: totalHours
            };

            if (existingEntry) {
                // Update existing entry
                const entryStart = new Date(`${startDate}T${startTime || planningSettings.defaultStartTime}`);
                const entryEnd = new Date(`${startDate}T${endTime || planningSettings.defaultEndTime}`);
                const hours = Math.max(0, (entryEnd.getTime() - entryStart.getTime()) / (1000 * 60 * 60)) || totalHours;
                await updateEntry(existingEntry.id, {
                    employeeId: finalEmployeeId,
                    startDate: entryStart,
                    endDate: entryEnd,
                    scheduledHours: hours
                });
                toast({ title: 'Planning bijgewerkt' });
            } else if (splitEntries) {
                // Create multiple split entries
                const entries = splitEntries.map((split) => ({
                    quoteId: selectedQuoteId,
                    employeeId: finalEmployeeId,
                    startDate: split.startDate,
                    endDate: split.endDate,
                    scheduledHours: split.hours,
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
                const entryEnd = new Date(`${startDate}T${endTime || planningSettings.defaultEndTime}`);
                const hours = Math.max(0, (entryEnd.getTime() - entryStart.getTime()) / (1000 * 60 * 60)) || totalHours;

                await addEntry({
                    quoteId: selectedQuoteId,
                    employeeId: finalEmployeeId,
                    startDate: entryStart,
                    endDate: entryEnd,
                    scheduledHours: hours,
                    cache
                });
                toast({ title: 'Planning aangemaakt' });
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
        toast,
        totalHours,
        selectedEmployeeId,
        employees,
        quotes,
        preselectedQuote,
        existingEntry,
        startDate,
        startTime,
        planningSettings.defaultStartTime,
        planningSettings.defaultEndTime,
        endTime,
        updateEntry,
        splitEntries,
        addMultipleEntries,
        addEntry,
        onClose,
    ]);

    // Ensure employee is selected if list updates and we have exactly 1
    useEffect(() => {
        if (employees.length === 1 && selectedEmployeeId !== employees[0].id) {
            setSelectedEmployeeId(employees[0].id);
        }

        if (!pendingSave) {
            return;
        }

        if (employees.length === 1 && !selectedEmployeeId) {
            void performSave(employees[0].id);
            setPendingSave(false);
            return;
        }

        if (employees.length > 1 && !selectedEmployeeId) {
            setIsSaving(false);
            setPendingSave(false);
            toast({
                variant: 'destructive',
                title: 'Kies een uitvoerder',
                description: 'Selecteer een uitvoerder en probeer opnieuw.',
            });
            return;
        }

        if (employees.length > 0) {
            void performSave();
            setPendingSave(false);
            return;
        }

        // Fallback: if employee loading takes too long, try current user uid.
        const timer = window.setTimeout(() => {
            if (user?.uid) {
                void performSave(user.uid);
                setPendingSave(false);
                return;
            }

            setIsSaving(false);
            setPendingSave(false);
            toast({
                variant: 'destructive',
                title: 'Kan profiel niet laden',
                description: 'Ververs de pagina en probeer opnieuw.',
            });
        }, 2000);

        return () => window.clearTimeout(timer);
    }, [employees, selectedEmployeeId, pendingSave, user, performSave, toast]);

    const handleSaveClick = useCallback(() => {
        void performSave();
    }, [performSave]);

    const handleDelete = async () => {
        if (!existingEntry) return;

        setIsSaving(true);
        try {
            await deleteEntry(existingEntry.id);
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
                        {existingEntry ? 'Planning Bewerken' : 'Klus Inplannen'}
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
                        <Label className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            Offerte / Klus
                        </Label>
                        {isLoadingQuotes ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Laden...
                            </div>
                        ) : (
                            <Select
                                value={selectedQuoteId}
                                onValueChange={setSelectedQuoteId}
                                disabled={!!existingEntry}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecteer een offerte" />
                                </SelectTrigger>
                                <SelectContent>
                                    {quotes.map(quote => (
                                        <SelectItem key={quote.id} value={quote.id}>
                                            {getQuoteLabel(quote)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Employee Selection */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Uitvoerder
                        </Label>
                        <Select
                            value={selectedEmployeeId}
                            onValueChange={setSelectedEmployeeId}
                            disabled={isSaving || employees.length === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={employees.length === 0 ? 'Geen uitvoerder beschikbaar' : 'Selecteer een uitvoerder'} />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map((employee) => (
                                    <SelectItem key={employee.id} value={employee.id}>
                                        {employee.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>



                    {/* Start Date */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Startdatum
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

                    {view === 'day' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Starttijd
                                </Label>
                                <Input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => {
                                        const nextStart = e.target.value;
                                        setStartTime(nextStart);
                                        syncHoursFromTimes(nextStart, endTime, startDate);
                                    }}
                                />
                            </div>
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
                        </div>
                    )}

                    {/* Hours */}
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

                    {/* Auto-split toggle */}
                    {totalHours > planningSettings.defaultWorkdayHours && !existingEntry && (
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

                    {/* Split preview */}
                    {splitEntries && useAutoSplit && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                            <p className="text-sm font-medium text-emerald-400">
                                Planning wordt opgesplitst:
                            </p>
                            <div className="space-y-1">
                                {splitEntries.slice(0, 5).map((entry, idx) => (
                                    <div key={idx} className="text-xs text-zinc-400 flex justify-between">
                                        <span>{format(entry.startDate, 'EEE d MMM', { locale: nl })}</span>
                                        <span>{formatHoursDisplay(entry.hours)}</span>
                                    </div>
                                ))}
                                {splitEntries.length > 5 && (
                                    <div className="text-xs text-zinc-500">
                                        + {splitEntries.length - 5} meer dagen...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {existingEntry && (
                        <Button
                            variant="destructiveSoft"
                            onClick={handleDelete}
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
                        disabled={isSaving || !selectedQuoteId || !totalHours || (employees.length > 1 && !selectedEmployeeId)}
                    >
                        {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {existingEntry ? 'Bijwerken' : 'Inplannen'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
