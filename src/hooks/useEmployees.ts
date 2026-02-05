'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
    getDoc,
    serverTimestamp,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { Employee, EMPLOYEE_COLORS } from '@/lib/types-planning';

export function useEmployees() {
    const { user } = useUser();
    const firestore = useFirestore();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAutoCreating, setIsAutoCreating] = useState(false);
    // State for error handling
    const [error, setError] = useState<Error | null>(null);
    const hasAutoCreated = useRef(false);

    // Helper to get user name (moved out to be reusable/cleaner)
    const getUserName = async () => {
        if (!user || !firestore) return 'Ik';

        let userName = user.displayName || '';

        // Try to get name from users collection or businesses collection
        if (!userName) {
            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                userName = data?.settings?.contactNaam || data?.naam || '';
            }
        }

        if (!userName) {
            const businessDoc = await getDoc(doc(firestore, 'businesses', user.uid));
            if (businessDoc.exists()) {
                const data = businessDoc.data();
                userName = data?.contactNaam || data?.bedrijfsnaam || '';
            }
        }

        // Fallback to email prefix
        if (!userName && user.email) {
            userName = user.email.split('@')[0];
        }

        return userName || 'Ik';
    };

    // Auto-create the current user as first employee if none exist
    const autoCreateSelf = useCallback(async () => {
        if (!user || !firestore) return;

        // Don't check hasAutoCreated.current here to allow manual retries
        setIsAutoCreating(true);
        setError(null);

        try {
            const userName = await getUserName();

            // Create the employee
            await addDoc(collection(firestore, 'employees'), {
                userId: user.uid,
                name: userName,
                email: user.email || '',
                phone: '',
                color: EMPLOYEE_COLORS[0],
                isActive: true,
                defaultWorkHours: { start: '08:00', end: '17:00' },
                workDays: [1, 2, 3, 4, 5],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            hasAutoCreated.current = true;
        } catch (err) {
            console.error('Error auto-creating employee:', err);
            setError(err as Error);
        } finally {
            setIsAutoCreating(false);
        }
    }, [user, firestore]);

    useEffect(() => {
        if (!user || !firestore) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // Simple query - filter isActive client-side to avoid needing composite index
        const q = query(
            collection(firestore, 'employees'),
            where('userId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const data = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }) as Employee)
                    .filter(emp => emp.isActive !== false) // Filter active employees client-side
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '')); // Sort by name client-side

                // If no employees exist, auto-create the current user AND add a temporary optimistic entry
                if (data.length === 0) {
                    if (!hasAutoCreated.current) {
                        autoCreateSelf();
                    }

                    // Create optimistic employee to ensure UI never blocks
                    const optimisticEmployee: Employee = {
                        id: 'temp-current-user',
                        userId: user.uid,
                        name: user.displayName || user.email?.split('@')[0] || 'Ik',
                        email: user.email || '',
                        color: EMPLOYEE_COLORS[0],
                        isActive: true, // Always active
                        defaultWorkHours: { start: '08:00', end: '17:00' },
                        workDays: [1, 2, 3, 4, 5],
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    };

                    setEmployees([optimisticEmployee]);
                } else {
                    setEmployees(data);
                }

                setIsLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error fetching employees:', err);
                setError(err as Error);
                setIsLoading(false);

                // Still try to auto-create if query failed and we haven't tried yet
                if (!hasAutoCreated.current) {
                    autoCreateSelf();
                }
            }
        );

        return () => unsubscribe();
    }, [user, firestore, autoCreateSelf]);

    const addEmployee = useCallback(async (data: {
        name: string;
        email?: string;
        phone?: string;
        color?: string;
        defaultWorkHours?: { start: string; end: string };
        workDays?: number[];
    }) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const usedColors = employees.map(e => e.color);
        const availableColor = EMPLOYEE_COLORS.find(c => !usedColors.includes(c)) || EMPLOYEE_COLORS[0];

        const employeeData = {
            userId: user.uid,
            name: data.name,
            email: data.email || '',
            phone: data.phone || '',
            color: data.color || availableColor,
            isActive: true,
            defaultWorkHours: data.defaultWorkHours || { start: '08:00', end: '17:00' },
            workDays: data.workDays || [1, 2, 3, 4, 5],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(firestore, 'employees'), employeeData);
        return docRef.id;
    }, [user, firestore, employees]);

    const updateEmployee = useCallback(async (
        employeeId: string,
        data: Partial<Omit<Employee, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
    ) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'employees', employeeId);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    }, [user, firestore]);

    const deleteEmployee = useCallback(async (employeeId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'employees', employeeId);
        await updateDoc(docRef, {
            isActive: false,
            updatedAt: serverTimestamp()
        });
    }, [user, firestore]);

    const hardDeleteEmployee = useCallback(async (employeeId: string) => {
        if (!user || !firestore) throw new Error('Not authenticated');

        const docRef = doc(firestore, 'employees', employeeId);
        await deleteDoc(docRef);
    }, [user, firestore]);

    return {
        employees,
        isLoading: isLoading,
        isAutoCreating,
        error,
        autoCreateSelf,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        hardDeleteEmployee
    };
}
