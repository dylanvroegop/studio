// src/lib/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getFullQuoteDetails, updateJob } from './data';
import type { JobCategory } from './types';
import { addDoc, serverTimestamp, collection, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebaseServer } from '@/firebase/server';

/* ---------------------------------------------
 Schema
--------------------------------------------- */

const QuoteFormSchema = z.object({
  werkomschrijving: z.string().min(1).max(800),
  userId: z.string(),

  clientType: z.enum(['particulier', 'zakelijk']),
  bedrijfsnaam: z.string().optional(),
  contactpersoon: z.string().optional(),
  voornaam: z.string().min(1),
  achternaam: z.string().min(1),

  email: z.string().email(),
  telefoon: z.string().min(1),

  straat: z.string().min(1),
  huisnummer: z.string().min(1),
  postcode: z.string().min(1),
  plaats: z.string().optional(),

  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});

/**
 * ✅ FIX: errors-type moet exact matchen met `flatten().fieldErrors`
 * `fieldErrors` is: Record<string, string[]>
 */
type CreateQuoteState = {
  errors?: Record<string, string[]>;
  message?: string | null;
  redirect?: string | null;
};

/* ---------------------------------------------
 Offerte aanmaken
--------------------------------------------- */

export async function createQuoteAction(formData: FormData): Promise<CreateQuoteState> {
  const { firestore } = initializeFirebaseServer();

  const validatedFields = QuoteFormSchema.safeParse(Object.fromEntries(formData));
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validatie mislukt. Controleer de gemarkeerde velden.',
    };
  }

  const {
    userId,
    werkomschrijving,

    clientType,
    bedrijfsnaam,
    contactpersoon,
    voornaam,
    achternaam,

    email,
    telefoon,

    straat,
    huisnummer,
    postcode,
    plaats,

    afwijkendProjectadres,
    projectStraat,
    projectHuisnummer,
    projectPostcode,
    projectPlaats,
  } = validatedFields.data;

  const quoteData = {
    userId,
    status: 'concept' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    werkomschrijving,
    titel: werkomschrijving,

    klantinformatie: {
      klanttype: clientType === 'particulier' ? 'Particulier' : 'Zakelijk',

      bedrijfsnaam: bedrijfsnaam || null,
      contactpersoon: contactpersoon || null,
      voornaam,
      achternaam,

      'e-mailadres': email,
      telefoonnummer: telefoon,

      factuuradres: {
        straat,
        huisnummer,
        postcode,
        plaats: plaats || null,
      },

      afwijkendProjectadres: afwijkendProjectadres || false,
      projectadres: {
        straat: projectStraat || null,
        huisnummer: projectHuisnummer || null,
        postcode: projectPostcode || null,
        plaats: projectPlaats || null,
      },
    },
  };

  try {
    const docRef = await addDoc(collection(firestore, 'quotes'), quoteData);
    revalidatePath('/');
    return { redirect: `/offertes/${docRef.id}/klus/nieuw` };
  } catch (error) {
    console.error('Firebase schrijf fout in createQuoteAction:', error);
    return { message: 'Database Fout: Offerte kon niet worden aangemaakt.' };
  }
}

/* ---------------------------------------------
 Klus aanmaken
--------------------------------------------- */

export async function createJobAction(
  quoteId: string,
  categorie: JobCategory,
  omschrijving: string
) {
  const { redirect } = await import('next/navigation');
  const { firestore } = initializeFirebaseServer();

  if (!quoteId) return { message: 'Offerte ID is niet aanwezig.' };

  const newJob = {
    categorie,
    omschrijvingKlant: omschrijving,
    aantal: 1,
    createdAt: serverTimestamp(),
  };

  try {
    const jobsCollectionRef = collection(firestore, `quotes/${quoteId}/jobs`);
    const docRef = await addDoc(jobsCollectionRef, newJob);
    revalidatePath(`/offertes/${quoteId}`);
    redirect(`/offertes/${quoteId}/klus/${docRef.id}/bewerken`);
  } catch (error) {
    console.error('Fout bij aanmaken klus:', error);
    return { message: 'Database Fout: Klus kon niet worden aangemaakt.' };
  }
}

/* ---------------------------------------------
 Klus updaten
--------------------------------------------- */

const JobDetailsSchema = z.object({
  subcategorie: z.string().optional(),
  lengteMm: z.coerce.number().optional(),
  hoogteMm: z.coerce.number().optional(),
  diepteMm: z.coerce.number().optional(),
  aantal: z.coerce.number().min(1),
  omschrijvingKlant: z.string().min(1),
});

export async function updateJobAction(quoteId: string, jobId: string, formData: FormData) {
  const { redirect } = await import('next/navigation');

  const validatedFields = JobDetailsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  try {
    await updateJob(jobId, validatedFields.data);
  } catch (error) {
    console.error(error);
    return { message: 'Database Fout: Klus kon niet worden opgeslagen.' };
  }

  revalidatePath(`/offertes/${quoteId}`);
  redirect(`/offertes/${quoteId}`);
}

/* ---------------------------------------------
 Wanden keuze opslaan
--------------------------------------------- */

export async function updateWandenKeuzeAction(
  quoteId: string,
  title: string,
  description: string,
  slug: string
) {
  const { firestore } = initializeFirebaseServer();
  if (!quoteId) return { message: 'Offerte ID is niet aanwezig.' };

  try {
    const quoteRef = doc(firestore, 'quotes', quoteId);

    await updateDoc(quoteRef, {
      'jobCards.wanden': {
        title,
        description,
        slug,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });

    revalidatePath(`/offertes/${quoteId}`);
    return { ok: true };
  } catch (error) {
    console.error('Fout bij opslaan wanden keuze:', error);
    return { message: 'Database Fout: Wanden keuze kon niet worden opgeslagen.' };
  }
}

/* ---------------------------------------------
 Offerte versturen
--------------------------------------------- */

export async function submitQuoteAction(quoteId: string) {
  const { redirect } = await import('next/navigation');

  try {
    const fullQuoteData = await getFullQuoteDetails(quoteId);
    if (!fullQuoteData) throw new Error('Offerte niet gevonden.');

    const webhookUrl = 'https://placeholder.webhook.url/n8n';
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullQuoteData),
    });

    if (!response.ok) throw new Error(`Webhook mislukt met status: ${response.status}`);
  } catch (error) {
    console.error(error);
    return { message: 'Fout: Offerte kon niet worden verstuurd.' };
  }

  revalidatePath('/');
  redirect('/');
}

/* ---------------------------------------------
 Selection Helpers (Client)
--------------------------------------------- */

export async function getQuotesForSelectionAction() {
  const { getActiveQuotes } = await import('./data');
  const quotes = await getActiveQuotes();

  // Serialize for client
  return quotes.map((q) => ({
    ...q,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
    // Ensure nested dates are also serialized if any (klantinformatie usually plain objects)
  }));
}

export async function getJobsForQuoteSelectionAction(quoteId: string) {
  const { getJobsForQuote } = await import('./data');
  const jobs = await getJobsForQuote(quoteId);
  // Jobs already have string createdAt from getJobsForQuote
  return jobs;
}

/* ---------------------------------------------
 n8n Proxy Actions
--------------------------------------------- */

export async function calculateMaterialsAction(jobData: any) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("N8N_WEBHOOK_URL is not defined");
    return { error: "Server configuratie fout: Webhook URL ontbreekt." };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`n8n webhook error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  } catch (error: any) {
    console.error("Error in calculateMaterialsAction:", error);
    return { error: "Fout bij ophalen materialen." };
  }
}

export async function calculateMaterialsActionWithFirestore(quoteId: string, jobId: string, jobData: any) {
  const { firestore } = initializeFirebaseServer();
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("N8N_WEBHOOK_URL is not defined");
    return { error: "Server configuratie fout: Webhook URL ontbreekt." };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`n8n webhook error: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    let materials: any[] = [];

    // Parse logic
    if (Array.isArray(rawData) && rawData.length === 1 && rawData[0].materialen) {
      materials = rawData[0].materialen;
    } else if (rawData && rawData.materialen && Array.isArray(rawData.materialen)) {
      materials = rawData.materialen;
    } else if (Array.isArray(rawData) && rawData.length > 0 && !rawData[0].materiaal) {
      if (rawData[0].json && rawData[0].json.materialen) {
        materials = rawData[0].json.materialen;
      }
    } else if (Array.isArray(rawData)) {
      if (rawData.length > 0 && rawData[0].materiaal) {
        materials = rawData;
      }
    } else if (rawData && rawData.success && rawData.materialen) {
      materials = rawData.materialen;
    }

    if (quoteId && jobId && materials.length > 0) {
      const jobRef = doc(firestore, `quotes/${quoteId}/jobs/${jobId}`);
      await updateDoc(jobRef, {
        materialen: materials,
        updatedAt: serverTimestamp()
      });
    }

    return { data: materials };
  } catch (error: any) {
    console.error("Error in calculateMaterialsAction:", error);
    return { error: "Fout bij ophalen materialen." };
  }
}

export async function fetchMaterialsFromN8nAction(jobData: any) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("N8N_WEBHOOK_URL is not defined");
    return { error: "Server configuratie fout: Webhook URL ontbreekt." };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData),
      cache: 'no-store'
    });

    // FIRE AND FORGET / POLLING STRATEGY
    // We do NOT wait for the full JSON response anymore.
    // We just check if the request was accepted (200 OK).
    if (!response.ok) {
      throw new Error(`n8n webhook error: ${response.status} ${response.statusText}`);
    }

    // Indicate that the calculation started
    return {
      data: [],
      started: true,
      message: "Calculatie aangevraagd. Polling gestart..."
    };

  } catch (error: any) {
    console.error("Error in fetchMaterialsFromN8nAction:", error);
    return { error: "Fout bij ophalen materialen: " + error.message };
  }
}

export async function checkCalculationStatusAction(quoteId: string, userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { error: "Server config error: Missing Supabase Admin Key" };
  }

  // Use Service Role to bypass RLS
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabaseAdmin
      .from('quotes collection')
      .select('status, data_json')
      .eq('quoteid', quoteId)
      .eq('gebruikerid', userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase polling error (server):", error);
      return { error: error.message };
    }

    return { data };
  } catch (e: any) {
    return { error: e.message };
  }
}
