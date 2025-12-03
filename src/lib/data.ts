import type { Client, Quote, Job, JobMaterial, User } from './types';

// Mock data, simulating a Firestore database

const users: User[] = [
  { id: 'user-1', name: 'Tim de Timmerman', email: 'tim@houtofferte.nl', createdAt: new Date().toISOString() },
];

let clients: Client[] = [
  { id: 'client-1', userId: 'user-1', naam: 'Familie de Vries', adres: 'Dorpsstraat 1', postcode: '1234 AB', plaats: 'Utrecht', email: 'devries@email.com', telefoon: '0612345678', createdAt: new Date('2023-10-15').toISOString() },
  { id: 'client-2', userId: 'user-1', naam: 'Jansen & Co', adres: 'Industrieweg 10', postcode: '5678 CD', plaats: 'Eindhoven', email: 'info@jansen.co', telefoon: '0408765432', createdAt: new Date('2023-11-01').toISOString() },
];

let quotes: Quote[] = [
  { id: 'quote-1', userId: 'user-1', clientId: 'client-1', titel: 'Aanbouw achterzijde', status: 'verzonden', createdAt: new Date('2024-05-20').toISOString() },
  { id: 'quote-2', userId: 'user-1', clientId: 'client-2', titel: 'Nieuwe kantoorwanden', status: 'in_behandeling', createdAt: new Date('2024-05-22').toISOString() },
  { id: 'quote-3', userId: 'user-1', clientId: 'client-1', titel: 'Dakkapel plaatsen', status: 'concept', createdAt: new Date('2024-05-25').toISOString() },
];

let jobs: Job[] = [
  { id: 'job-1', quoteId: 'quote-1', categorie: 'Wanden', omschrijvingKlant: 'Buitenwand aanbouw', aantal: 1, createdAt: new Date().toISOString() },
  { id: 'job-2', quoteId: 'quote-2', categorie: 'Wanden', omschrijvingKlant: 'Glazen tussenwand kantoor', aantal: 5, createdAt: new Date().toISOString() },
];

let jobMaterials: JobMaterial[] = [
  { id: 'mat-1', jobId: 'job-1', materiaalCategorie: 'hout', naam: 'Vuren SLS 38x140mm', eenheid: 'm1', hoeveelheid: 120, createdAt: new Date().toISOString() },
  { id: 'mat-2', jobId: 'job-1', materiaalCategorie: 'isolatie', naam: 'Glaswol 140mm', eenheid: 'm2', hoeveelheid: 25, createdAt: new Date().toISOString() },
];

// Mock API functions
export const getClients = async (): Promise<Client[]> => {
  return Promise.resolve(clients);
};

export const getClientById = async (id: string): Promise<Client | undefined> => {
  return Promise.resolve(clients.find(c => c.id === id));
};

export const createClient = async (clientData: Omit<Client, 'id' | 'createdAt' | 'userId'>): Promise<Client> => {
  const newClient: Client = {
    ...clientData,
    id: `client-${Date.now()}`,
    userId: 'user-1', // Assuming a single logged-in user
    createdAt: new Date().toISOString(),
  };
  clients.push(newClient);
  return Promise.resolve(newClient);
}

export const getQuotes = async (): Promise<Quote[]> => {
  return Promise.resolve(quotes);
};

export const getQuoteById = async (id: string): Promise<Quote | undefined> => {
    return Promise.resolve(quotes.find(q => q.id === id));
}

export const createQuote = async (quoteData: Omit<Quote, 'id' | 'createdAt' | 'userId' | 'status' | 'titel'> & { titel: string }): Promise<Quote> => {
    const newQuote: Quote = {
        ...quoteData,
        id: `quote-${Date.now()}`,
        userId: 'user-1',
        status: 'concept',
        createdAt: new Date().toISOString(),
    };
    quotes.push(newQuote);
    return Promise.resolve(newQuote);
}

export const updateQuoteStatus = async (id: string, status: Quote['status']): Promise<Quote | undefined> => {
    const quoteIndex = quotes.findIndex(q => q.id === id);
    if (quoteIndex !== -1) {
        quotes[quoteIndex].status = status;
        return Promise.resolve(quotes[quoteIndex]);
    }
    return Promise.resolve(undefined);
}

export const getJobsForQuote = async (quoteId: string): Promise<Job[]> => {
    return Promise.resolve(jobs.filter(j => j.quoteId === quoteId));
}

export const createJob = async (jobData: Omit<Job, 'id' | 'createdAt'>): Promise<Job> => {
    const newJob: Job = {
        ...jobData,
        id: `job-${Date.now()}`,
        createdAt: new Date().toISOString(),
    };
    jobs.push(newJob);
    return Promise.resolve(newJob);
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

    const client = await getClientById(quote.clientId);
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
