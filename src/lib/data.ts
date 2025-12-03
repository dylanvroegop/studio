import { getFirestore, collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import type { Client, Quote, Job, JobMaterial, User } from './types';
import { initializeFirebase } from '@/firebase';

// This file will be deprecated in favor of direct Firestore calls.
// The functions are kept for now to avoid breaking other parts of the app, but will be removed.

let jobs: Job[] = [
  { id: 'job-1', quoteId: 'quote-1', categorie: 'Wanden', omschrijvingKlant: 'Buitenwand aanbouw', aantal: 1, createdAt: new Date().toISOString() },
  { id: 'job-2', quoteId: 'quote-2', categorie: 'Wanden', omschrijvingKlant: 'Glazen tussenwand kantoor', aantal: 5, createdAt: new Date().toISOString() },
];

let jobMaterials: JobMaterial[] = [
  { id: 'mat-1', jobId: 'job-1', materiaalCategorie: 'hout', naam: 'Vuren SLS 38x140mm', eenheid: 'm1', hoeveelheid: 120, createdAt: new Date().toISOString() },
  { id: 'mat-2', jobId: 'job-1', materiaalCategorie: 'isolatie', naam: 'Glaswol 140mm', eenheid: 'm2', hoeveelheid: 25, createdAt: new Date().toISOString() },
];

export const getQuoteById = async (id: string): Promise<Quote | undefined> => {
    const { firestore } = initializeFirebase();
    const docRef = doc(firestore, "quotes", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Quote;
    } else {
        return undefined;
    }
}

export const getJobsForQuote = async (quoteId: string): Promise<Job[]> => {
    return Promise.resolve(jobs.filter(j => j.quoteId === quoteId));
}

export const getJobById = async (id: string): Promise<Job | undefined> => {
    return Promise.resolve(jobs.find(j => j.id === id));
}

export const updateJob = async (id: string, jobData: Partial<Omit<Job, 'id'>>): Promise<Job | undefined> => {
    const jobIndex = jobs.findIndex(j => j.id === id);
    if (jobIndex > -1) {
        jobs[jobIndex] = { ...jobs[jobIndex], ...jobData };
        return Promise.resolve(jobs[jobIndex]);
    }
    return Promise.resolve(undefined);
}

export const getMaterialsForJob = async (jobId: string): Promise<JobMaterial[]> => {
    return Promise.resolve(jobMaterials.filter(m => m.jobId === jobId));
}

export const getFullQuoteDetails = async (quoteId: string) => {
    const quote = await getQuoteById(quoteId);
    if (!quote) return null;

    // Client is now part of the quote document, so we don't need a separate fetch.
    const client: Client = {
        id: 'temp-client-id',
        userId: quote.userId,
        naam: quote.clientName,
        email: quote.email,
        telefoon: quote.phone,
        adres: `${quote.billingStreet} ${quote.billingHouseNumber}`,
        postcode: quote.billingPostcode,
        plaats: quote.billingCity || '',
        createdAt: quote.createdAt.toDate().toISOString(),
    };

    const quoteJobs = await getJobsForQuote(quoteId);

    const jobsWithMaterials = await Promise.all(
        quoteJobs.map(async (job) => {
            const materials = await getMaterialsForJob(job.id);
            return { ...job, materials };
        })
    );

    return {
        quote,
        client,
        jobs: jobsWithMaterials,
    };
}

    