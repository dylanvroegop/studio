/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Quote, Job } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface HiddenPDFDrawingsProps {
    quote: Quote;
    onReady: (images: string[]) => void;
}

function getVisualisatieUrl(job: Job): string | null {
    const raw = (job as any).visualisatieUrl;
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    return value.length > 0 ? value : null;
}

function getSnapshotUrls(job: Job): string[] {
    const rawSnapshots = (job as any).visualisatieSnapshots;
    if (Array.isArray(rawSnapshots)) {
        const urls = rawSnapshots
            .map((snapshot: any) => {
                if (typeof snapshot === 'string') return snapshot.trim();
                if (!snapshot || typeof snapshot !== 'object') return '';
                const value = snapshot.url ?? snapshot.visualisatieUrl;
                return typeof value === 'string' ? value.trim() : '';
            })
            .filter((url: string) => url.length > 0);

        if (urls.length > 0) {
            return urls;
        }
    }

    const fallbackUrl = getVisualisatieUrl(job);
    return fallbackUrl ? [fallbackUrl] : [];
}

export function HiddenPDFDrawings({ quote, onReady }: HiddenPDFDrawingsProps) {
    const firestore = useFirestore();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadJobs = async () => {
            setIsLoading(true);

            const klussenMap = (quote as any).klussen;
            if (klussenMap && typeof klussenMap === 'object' && Object.keys(klussenMap).length > 0) {
                const jobsFromMap = Object.entries(klussenMap).map(([key, data]: [string, any]) => ({
                    id: key,
                    ...data,
                }));
                setJobs(jobsFromMap as Job[]);
                setIsLoading(false);
                return;
            }

            if ((quote as any).jobs && Array.isArray((quote as any).jobs) && (quote as any).jobs.length > 0) {
                setJobs((quote as any).jobs);
                setIsLoading(false);
                return;
            }

            if (firestore && quote.id) {
                try {
                    const jobsRef = collection(firestore, `quotes/${quote.id}/jobs`);
                    const snap = await getDocs(jobsRef);
                    const fetchedJobs = snap.docs.map((d) => ({
                        id: d.id,
                        ...d.data(),
                    } as Job));
                    setJobs(fetchedJobs);
                } catch (err) {
                    console.error('Error fetching jobs subcollection for PDF:', err);
                }
            }

            setIsLoading(false);
        };

        if (quote) {
            void loadJobs();
        }
    }, [quote, firestore]);

    const snapshotUrls = useMemo(() => {
        return jobs.flatMap((job) => getSnapshotUrls(job));
    }, [jobs]);

    const urlToBase64 = async (url: string): Promise<string | null> => {
        try {
            const res = await fetch(`/api/visualisatie-to-base64?url=${encodeURIComponent(url)}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.dataUrl || null;
        } catch (err) {
            console.error('Error converting image to base64 via API:', err);
            return null;
        }
    };

    const onReadyCalledRef = useRef(false);
    const onReadyRef = useRef(onReady);

    useEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
        onReadyCalledRef.current = false;
    }, [quote.id]);

    useEffect(() => {
        if (isLoading) return;
        if (onReadyCalledRef.current) return;

        let cancelled = false;

        const loadImages = async () => {
            const images: string[] = [];

            for (const url of snapshotUrls) {
                if (cancelled) return;
                const base64 = await urlToBase64(url);
                if (base64) images.push(base64);
            }

            if (!cancelled) {
                onReadyCalledRef.current = true;
                onReadyRef.current(images);
            }
        };

        void loadImages();

        return () => {
            cancelled = true;
        };
    }, [isLoading, snapshotUrls]);

    return null;
}
