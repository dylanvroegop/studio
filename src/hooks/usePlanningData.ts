'use client';

import { useState, useEffect, useCallback } from 'react';
import { addDays } from 'date-fns';
import { useUser, useFirestore } from '@/firebase';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
    writeBatch,
    getDocs
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { PlanningEntry, PlanningEntryType, PlanningStatus } from '@/lib/types-planning';

interface UsePlanningDataOptions {
    startDate?: Date;
    endDate?: Date;
    quoteId?: string;
}

export function usePlanningData(options: UsePlanningDataOptions = {}) {
    const { user } = useUser();
    const firestore = useFirestore();

    const [entries, setEntries] = useState<PlanningEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const syncEntryToGoogleCalendar = useCallback(async (payload: {
        action: 'upsert' | 'delete';
        entryId: string;
        googleCalendarEventId?: string | null;
        quoteId?: string;
        planningType?: PlanningEntryType;
        startDate?: Date;
        endDate?: Date;
        notes?: string;
        cache?: {
            clientName: string;
            projectTitle: string;
            projectAddress: string;
        };
    }) => {
        const idToken = await getAuth().currentUser?.getIdToken().catch(() => null);
        if (!idToken) return;
        const response = await fetch('/api/google-calendar/sync-entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                action: payload.action,
                entryId: payload.entryId,
                googleCalendarEventId: payload.googleCalendarEventId,
                quoteId: payload.quoteId,
                planningType: payload.planningType,
                startDate: payload.startDate?.toISOString(),
                endDate: payload.endDate?.toISOString(),
                notes: payload.notes,
                cache: payload.cache,
            }),
        });
        if (!response.ok) {
            const result = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(result?.error || 'Google Calendar synchronisatie mislukt.');
        }
    }, []);

    useEffect(() => {
        if (!user || !firestore) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        let q = query(
            collection(firestore, 'planning_entries'),
            where('userId', '==', user.uid)
        );

        if (options.quoteId) {
            q = query(q, where('quoteId', '==', options.quoteId));
        }

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                let data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as PlanningEntry[];

                if (options.startDate && options.endDate) {
                    const startTime = options.startDate.getTime();
                    const endTime = options.endDate.getTime();

                    data = data.filter(entry => {
                        const entryStart = entry.startDate instanceof Timestamp
                            ? entry.startDate.toDate().getTime()
                            : new Date(entry.startDate as unknown as string).getTime();
                        const entryEnd = entry.endDate instanceof Timestamp
                            ? entry.endDate.toDate().getTime()
                            : new Date(entry.endDate as unknown as string).getTime();

                        return (entryStart <= endTime && entryEnd >= startTime);
                    });
                }

                data.sort((a, b) => {
                    const aStart = a.startDate instanceof Timestamp ? a.startDate.toMillis() : 0;
                    const bStart = b.startDate instanceof Timestamp ? b.startDate.toMillis() : 0;
                    return aStart - bStart;
                });

                setEntries(data);
                setIsLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error fetching planning entries:', err);
                setError(err as Error);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, firestore, options.startDate?.getTime(), options.endDate?.getTime(), options.quoteId]);

    const addEntry = useCallback(async (data: {
        quoteId: string;
        startDate: Date;
        endDate: Date;
        scheduledHours: number;
        planningType?: PlanningEntryType;
        isAutoSplit?: boolean;
        parentEntryId?: string;
        notes?: string;
        cache: {
            clientName: string;
            projectTitle: string;
            projectAddress: string;
            totalQuoteHours: number;
        };
    }) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const entryData = {
            userId: user.uid,
            quoteId: data.quoteId,
            startDate: Timestamp.fromDate(data.startDate),
            endDate: Timestamp.fromDate(data.endDate),
            scheduledHours: data.scheduledHours,
            planningType: data.planningType || 'job',
            isAutoSplit: data.isAutoSplit || false,
            parentEntryId: data.parentEntryId || null,
            status: 'scheduled' as PlanningStatus,
            notes: data.notes || '',
            cache: data.cache,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(firestore, 'planning_entries'), entryData);
        await syncEntryToGoogleCalendar({
            action: 'upsert',
            entryId: docRef.id,
            quoteId: data.quoteId,
            planningType: data.planningType,
            startDate: data.startDate,
            endDate: data.endDate,
            notes: data.notes,
            cache: data.cache,
        });
        return docRef.id;
    }, [user, firestore, syncEntryToGoogleCalendar]);

    const addMultipleEntries = useCallback(async (entries: Array<{
        quoteId: string;
        startDate: Date;
        endDate: Date;
        scheduledHours: number;
        planningType?: PlanningEntryType;
        isAutoSplit?: boolean;
        parentEntryId?: string;
        notes?: string;
        cache: {
            clientName: string;
            projectTitle: string;
            projectAddress: string;
            totalQuoteHours: number;
        };
    }>) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const batch = writeBatch(firestore);
        const ids: string[] = [];

        for (const data of entries) {
            const docRef = doc(collection(firestore, 'planning_entries'));
            ids.push(docRef.id);

            batch.set(docRef, {
                userId: user.uid,
                quoteId: data.quoteId,
                startDate: Timestamp.fromDate(data.startDate),
                endDate: Timestamp.fromDate(data.endDate),
                scheduledHours: data.scheduledHours,
                planningType: data.planningType || 'job',
                isAutoSplit: data.isAutoSplit || false,
                parentEntryId: data.parentEntryId || null,
                status: 'scheduled' as PlanningStatus,
                notes: data.notes || '',
                cache: data.cache,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }

        await batch.commit();
        await Promise.all(entries.map((entry, index) => syncEntryToGoogleCalendar({
            action: 'upsert',
            entryId: ids[index],
            quoteId: entry.quoteId,
            planningType: entry.planningType,
            startDate: entry.startDate,
            endDate: entry.endDate,
            notes: entry.notes,
            cache: entry.cache,
        })));
        return ids;
    }, [user, firestore, syncEntryToGoogleCalendar]);

    const updateEntry = useCallback(async (
        entryId: string,
        data: Partial<{
            startDate: Date;
            endDate: Date;
            scheduledHours: number;
            planningType: PlanningEntryType;
            status: PlanningStatus;
            notes: string;
            cache: {
                clientName: string;
                projectTitle: string;
                projectAddress: string;
                totalQuoteHours: number;
                totalQuoteAmount?: number;
                totalQuoteEarnings?: number;
            };
        }>
    ) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'planning_entries', entryId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
            updatedAt: serverTimestamp()
        };

        if (data.startDate !== undefined) updateData.startDate = Timestamp.fromDate(data.startDate);
        if (data.endDate !== undefined) updateData.endDate = Timestamp.fromDate(data.endDate);
        if (data.scheduledHours !== undefined) updateData.scheduledHours = data.scheduledHours;
        if (data.planningType !== undefined) updateData.planningType = data.planningType;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.cache !== undefined) updateData.cache = data.cache;

        await updateDoc(docRef, updateData);
        if (data.startDate !== undefined || data.endDate !== undefined || data.cache !== undefined || data.planningType !== undefined || data.notes !== undefined) {
            const currentEntry = entries.find((entry) => entry.id === entryId);
            const effectiveStartDate = data.startDate
                || (currentEntry?.startDate instanceof Timestamp ? currentEntry.startDate.toDate() : undefined);
            const effectiveEndDate = data.endDate
                || (currentEntry?.endDate instanceof Timestamp ? currentEntry.endDate.toDate() : undefined);
            const effectiveQuoteId = currentEntry?.quoteId;
            const effectiveCache = data.cache || currentEntry?.cache;
            const effectiveType = data.planningType || currentEntry?.planningType;
            const effectiveNotes = data.notes ?? currentEntry?.notes;
            if (effectiveStartDate && effectiveEndDate && effectiveQuoteId && effectiveCache) {
                await syncEntryToGoogleCalendar({
                    action: 'upsert',
                    entryId,
                    quoteId: effectiveQuoteId,
                    planningType: effectiveType,
                    startDate: effectiveStartDate,
                    endDate: effectiveEndDate,
                    notes: effectiveNotes,
                    cache: {
                        clientName: effectiveCache.clientName,
                        projectTitle: effectiveCache.projectTitle,
                        projectAddress: effectiveCache.projectAddress,
                    }
                });
            }
        }
    }, [user, firestore, entries, syncEntryToGoogleCalendar]);

    const deleteEntry = useCallback(async (entryId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const currentEntry = entries.find((entry) => entry.id === entryId) as (PlanningEntry & { googleCalendarEventId?: string | null }) | undefined;
        await syncEntryToGoogleCalendar({
            action: 'delete',
            entryId,
            googleCalendarEventId: currentEntry?.googleCalendarEventId || null,
        });

        const docRef = doc(firestore, 'planning_entries', entryId);
        await deleteDoc(docRef);
    }, [user, firestore, entries, syncEntryToGoogleCalendar]);

    const deleteEntriesForQuote = useCallback(async (quoteId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');
        const snapshot = await getDocs(query(
            collection(firestore, 'planning_entries'),
            where('userId', '==', user.uid),
            where('quoteId', '==', quoteId)
        ));
        const batch = writeBatch(firestore);
        snapshot.docs.forEach((planningDoc) => batch.delete(planningDoc.ref));

        const syncPayloads = snapshot.docs.map((planningDoc) => {
            const data = planningDoc.data() as { googleCalendarEventId?: string | null };
            return {
                action: 'delete' as const,
                entryId: planningDoc.id,
                googleCalendarEventId: data.googleCalendarEventId || null,
            };
        });

        await batch.commit();
        await Promise.all(syncPayloads.map((payload) => syncEntryToGoogleCalendar(payload)));
    }, [user, firestore, syncEntryToGoogleCalendar]);

    const shiftQuoteEntries = useCallback(async (
        quoteId: string,
        referenceDate: Date,
        newStartDate: Date,
        workDays: number[] = [1, 2, 3, 4, 5]
    ) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        // Helper to normalize dates to start of day for comparison
        const normalize = (d: Date) => {
            const n = new Date(d);
            n.setHours(0, 0, 0, 0);
            return n;
        };

        const oldRef = normalize(referenceDate);
        const newRef = normalize(newStartDate);
        const normalizedWorkDays = Array.from(new Set(
            workDays
                .map(Number)
                .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
        )).sort((a, b) => a - b);
        const activeWorkDays = normalizedWorkDays.length > 0 ? normalizedWorkDays : [1, 2, 3, 4, 5];

        const getIsoDay = (date: Date): number => {
            const jsDay = date.getDay();
            return jsDay === 0 ? 7 : jsDay;
        };

        const isConfiguredWorkDay = (date: Date): boolean => activeWorkDays.includes(getIsoDay(date));

        const countWorkDayDistance = (from: Date, to: Date): number => {
            if (from.getTime() === to.getTime()) return 0;

            let distance = 0;
            const step = from < to ? 1 : -1;
            let cursor = new Date(from);

            while (cursor.getTime() !== to.getTime()) {
                cursor = addDays(cursor, step);
                if (isConfiguredWorkDay(cursor)) {
                    distance += step;
                }
            }

            return distance;
        };

        const addConfiguredWorkDays = (base: Date, amount: number): Date => {
            if (amount === 0) return new Date(base);

            const step = amount > 0 ? 1 : -1;
            let remaining = Math.abs(amount);
            let cursor = new Date(base);

            while (remaining > 0) {
                cursor = addDays(cursor, step);
                if (isConfiguredWorkDay(cursor)) {
                    remaining -= 1;
                }
            }

            return cursor;
        };

        if (oldRef.getTime() === newRef.getTime()) return;

        // Fetch all entries for this quote
        const q = query(
            collection(firestore, 'planning_entries'),
            where('quoteId', '==', quoteId),
            where('userId', '==', user.uid)
        );

        const snapshot = await getDocs(q);
        const batch = writeBatch(firestore);

        const syncPayloads: Array<{
            action: 'upsert';
            entryId: string;
            googleCalendarEventId?: string | null;
            quoteId: string;
            planningType?: PlanningEntryType;
            startDate: Date;
            endDate: Date;
            notes?: string;
            cache?: {
                clientName: string;
                projectTitle: string;
                projectAddress: string;
            };
        }> = [];

        snapshot.docs.forEach((doc) => {
            const data = doc.data() as {
                quoteId: string;
                planningType?: PlanningEntryType;
                notes?: string;
                googleCalendarEventId?: string | null;
                cache?: {
                    clientName: string;
                    projectTitle: string;
                    projectAddress: string;
                };
                startDate: Timestamp;
                endDate: Timestamp;
            };
            const currentStart = data.startDate.toDate();
            const currentEnd = data.endDate.toDate(); // Keep duration
            const duration = currentEnd.getTime() - currentStart.getTime();

            const entryDate = normalize(currentStart);
            const dist = countWorkDayDistance(oldRef, entryDate);

            // Preserve configured work-day spacing (e.g. includes Saturday if enabled),
            // while still allowing the dragged entry itself to land on any day.
            const newStart = dist === 0 ? new Date(newRef) : addConfiguredWorkDays(newRef, dist);

            // Preserve original time-of-day.
            newStart.setHours(currentStart.getHours(), currentStart.getMinutes(), 0, 0);

            const newEnd = new Date(newStart.getTime() + duration);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const update: any = {
                startDate: Timestamp.fromDate(newStart),
                endDate: Timestamp.fromDate(newEnd),
                updatedAt: serverTimestamp()
            };

            batch.update(doc.ref, update);

            syncPayloads.push({
                action: 'upsert',
                entryId: doc.id,
                googleCalendarEventId: data.googleCalendarEventId || null,
                quoteId: data.quoteId,
                planningType: data.planningType,
                startDate: newStart,
                endDate: newEnd,
                notes: data.notes,
                cache: data.cache,
            });
        });

        await batch.commit();
        await Promise.all(syncPayloads.map((payload) => syncEntryToGoogleCalendar(payload)));
    }, [user, firestore, syncEntryToGoogleCalendar]);

    return {
        entries,
        isLoading,
        error,
        addEntry,
        addMultipleEntries,
        updateEntry,
        deleteEntry,
        deleteEntriesForQuote,
        shiftQuoteEntries
    };
}
