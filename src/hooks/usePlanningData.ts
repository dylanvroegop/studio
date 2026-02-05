'use client';

import { useState, useEffect, useCallback } from 'react';
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
    writeBatch
} from 'firebase/firestore';
import { PlanningEntry, PlanningStatus } from '@/lib/types-planning';

interface UsePlanningDataOptions {
    startDate?: Date;
    endDate?: Date;
    employeeId?: string;
    quoteId?: string;
}

export function usePlanningData(options: UsePlanningDataOptions = {}) {
    const { user } = useUser();
    const firestore = useFirestore();

    const [entries, setEntries] = useState<PlanningEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

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

        if (options.employeeId) {
            q = query(q, where('employeeId', '==', options.employeeId));
        }

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
    }, [user, firestore, options.startDate?.getTime(), options.endDate?.getTime(), options.employeeId, options.quoteId]);

    const addEntry = useCallback(async (data: {
        quoteId: string;
        employeeId: string;
        startDate: Date;
        endDate: Date;
        scheduledHours: number;
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
            employeeId: data.employeeId,
            startDate: Timestamp.fromDate(data.startDate),
            endDate: Timestamp.fromDate(data.endDate),
            scheduledHours: data.scheduledHours,
            isAutoSplit: data.isAutoSplit || false,
            parentEntryId: data.parentEntryId || null,
            status: 'scheduled' as PlanningStatus,
            notes: data.notes || '',
            cache: data.cache,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(firestore, 'planning_entries'), entryData);
        return docRef.id;
    }, [user, firestore]);

    const addMultipleEntries = useCallback(async (entries: Array<{
        quoteId: string;
        employeeId: string;
        startDate: Date;
        endDate: Date;
        scheduledHours: number;
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
                employeeId: data.employeeId,
                startDate: Timestamp.fromDate(data.startDate),
                endDate: Timestamp.fromDate(data.endDate),
                scheduledHours: data.scheduledHours,
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
        return ids;
    }, [user, firestore]);

    const updateEntry = useCallback(async (
        entryId: string,
        data: Partial<{
            employeeId: string;
            startDate: Date;
            endDate: Date;
            scheduledHours: number;
            status: PlanningStatus;
            notes: string;
        }>
    ) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'planning_entries', entryId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
            updatedAt: serverTimestamp()
        };

        if (data.employeeId !== undefined) updateData.employeeId = data.employeeId;
        if (data.startDate !== undefined) updateData.startDate = Timestamp.fromDate(data.startDate);
        if (data.endDate !== undefined) updateData.endDate = Timestamp.fromDate(data.endDate);
        if (data.scheduledHours !== undefined) updateData.scheduledHours = data.scheduledHours;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.notes !== undefined) updateData.notes = data.notes;

        await updateDoc(docRef, updateData);
    }, [user, firestore]);

    const deleteEntry = useCallback(async (entryId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'planning_entries', entryId);
        await deleteDoc(docRef);
    }, [user, firestore]);

    const deleteEntriesForQuote = useCallback(async (quoteId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const entriesToDelete = entries.filter(e => e.quoteId === quoteId);
        const batch = writeBatch(firestore);

        for (const entry of entriesToDelete) {
            batch.delete(doc(firestore, 'planning_entries', entry.id));
        }

        await batch.commit();
    }, [user, firestore, entries]);

    return {
        entries,
        isLoading,
        error,
        addEntry,
        addMultipleEntries,
        updateEntry,
        deleteEntry,
        deleteEntriesForQuote
    };
}
