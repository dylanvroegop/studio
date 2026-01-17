import { initializeFirebaseServer } from '@/firebase/server';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import type { Client, Quote, Job, JobMaterial } from './types';

// This file will be deprecated in favor of direct Firestore calls.
// The functions are kept for now to avoid breaking other parts of the app, but will be removed.

/* ---------------------------------------------
 Mock data (alleen voor onderdelen die nog niet op Firestore zitten)
--------------------------------------------- */

let jobs: Job[] = [
  {
    id: 'job-1',
    quoteId: 'quote-1',
    categorie: 'Wanden',
    omschrijvingKlant: 'Buitenwand aanbouw',
    aantal: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'job-2',
    quoteId: 'quote-2',
    categorie: 'Wanden',
    omschrijvingKlant: 'Glazen tussenwand kantoor',
    aantal: 5,
    createdAt: new Date().toISOString(),
  },
];

let jobMaterials: JobMaterial[] = [
  {
    id: 'mat-1',
    jobId: 'job-1',
    materiaalCategorie: 'hout',
    naam: 'Vuren SLS 38x140mm',
    eenheid: 'm1',
    hoeveelheid: 120,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mat-2',
    jobId: 'job-1',
    materiaalCategorie: 'isolatie',
    naam: 'Glaswol 140mm',
    eenheid: 'm2',
    hoeveelheid: 25,
    createdAt: new Date().toISOString(),
  },
];

/* ---------------------------------------------
 Quotes
--------------------------------------------- */

export const getQuoteById = async (id: string): Promise<Quote | undefined> => {
  const { firestore } = initializeFirebaseServer();
  const docRef = doc(firestore, 'quotes', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return undefined;

  const data: any = docSnap.data();

  // Convert Firestore Timestamps to serializable format for client components
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
    sentAt: data.sentAt?.toDate ? data.sentAt.toDate() : data.sentAt,
  } as unknown as Quote;
};

/* ---------------------------------------------
 Jobs
--------------------------------------------- */

export const getJobsForQuote = async (quoteId: string): Promise<Job[]> => {
  const { firestore } = initializeFirebaseServer();

  const jobsCollectionRef = collection(firestore, `quotes/${quoteId}/jobs`);
  const q = query(jobsCollectionRef);
  const querySnapshot = await getDocs(q);

  const result: Job[] = [];
  querySnapshot.forEach((d) => {
    const data: any = d.data();
    result.push({
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    } as Job);
  });

  return result;
};

export const getJobById = async (id: string): Promise<Job | undefined> => {
  // Deze functie is nog mock-based (er is geen quoteId meegegeven).
  return Promise.resolve(jobs.find((j) => j.id === id));
};

export const updateJob = async (
  id: string,
  jobData: Partial<Omit<Job, 'id'>>
): Promise<Job | undefined> => {
  const jobIndex = jobs.findIndex((j) => j.id === id);
  if (jobIndex > -1) {
    jobs[jobIndex] = { ...jobs[jobIndex], ...jobData };
    return Promise.resolve(jobs[jobIndex]);
  }
  return Promise.resolve(undefined);
};

/* ---------------------------------------------
 Materials
--------------------------------------------- */

export const getMaterialsForJob = async (jobId: string): Promise<JobMaterial[]> => {
  return Promise.resolve(jobMaterials.filter((m) => m.jobId === jobId));
};

/* ---------------------------------------------
 Full quote details (overzicht + webhook)
--------------------------------------------- */

export const getFullQuoteDetails = async (quoteId: string) => {
  const quote = await getQuoteById(quoteId);
  if (!quote) return null;

  // ✅ NIEUWE structuur: alles uit quote.klantinformatie
  const ki: any = (quote as any).klantinformatie;

  const factuur = ki?.factuuradres;
  const clientNaam =
    ki?.klanttype === 'Zakelijk'
      ? (ki?.bedrijfsnaam || `${ki?.voornaam || ''} ${ki?.achternaam || ''}`.trim())
      : `${ki?.voornaam || ''} ${ki?.achternaam || ''}`.trim();

  const client: Client = {
    id: 'temp-client-id',
    userId: (quote as any).userId,
    naam: clientNaam,
    email: ki?.['e-mailadres'] || '',
    telefoon: ki?.telefoonnummer || '',
    adres: `${factuur?.straat || ''} ${factuur?.huisnummer || ''}`.trim(),
    postcode: factuur?.postcode || '',
    plaats: factuur?.plaats || '',
    createdAt: (quote as any).createdAt?.toISOString
      ? (quote as any).createdAt.toISOString()
      : new Date().toISOString(),
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
};

/* ---------------------------------------------
 Active Quotes (for Selection)
--------------------------------------------- */

export const getActiveQuotes = async (limitCount = 50): Promise<Quote[]> => {
  const { firestore } = initializeFirebaseServer();
  const q = query(
    collection(firestore, 'quotes'),
    orderBy('updatedAt', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  const quotes: Quote[] = [];

  querySnapshot.forEach((d) => {
    const data: any = d.data();
    quotes.push({
      id: d.id,
      ...data,
      // Convert Timestamps to Strings or Dates as per existing pattern
      // NOTE: The Quote type defines Timestamp, but here we might need to be careful.
      // The existing pattern uses assertions. I'll stick to returning what looks like a Quote but with Dates if possible,
      // or depend on the caller to serialize if needed.
      // However, for Client components, we usually want ISO strings.
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
    } as unknown as Quote);
  });

  return quotes;
};
