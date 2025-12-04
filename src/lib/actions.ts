'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getJobById, updateJob, getFullQuoteDetails } from './data';
import type { JobCategory } from './types';
import { addDoc, serverTimestamp, collection } from 'firebase/firestore';
import { initializeFirebaseServer } from '@/firebase/server';

const QuoteFormSchema = z.object({
  werkomschrijving: z.string().min(10, 'Geef een korte omschrijving van het werk.').max(800, 'De omschrijving mag maximaal 800 tekens lang zijn.'),
  userId: z.string(),
  clientType: z.enum(['particulier', 'zakelijk']),
  bedrijfsnaam: z.string().optional(),
  contactpersoon: z.string().optional(),
  voornaam: z.string().min(1, 'Voornaam is verplicht'),
  achternaam: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig emailadres'),
  telefoon: z.string().min(1, 'Telefoonnummer is verplicht'),
  straat: z.string().min(1, 'Straat is verplicht'),
  huisnummer: z.string().min(1, 'Huisnummer is verplicht'),
  postcode: z.string().min(1, 'Postcode is verplicht'),
  plaats: z.string().optional(),
  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});


type CreateQuoteState = {
  errors?: z.ZodError<typeof QuoteFormSchema>['formErrors']['fieldErrors'];
  message?: string | null;
  redirect?: string | null;
};

export async function createQuoteAction(formData: FormData): Promise<CreateQuoteState> {
    const { redirect } = await import('next/navigation');
    const { firestore } = initializeFirebaseServer();

    const rawData = Object.fromEntries(formData);
    
    const validatedFields = QuoteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validatie mislukt. Controleer de gemarkeerde velden.'
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
      userId: userId,
      status: "concept",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      clientType: clientType === 'particulier' ? 'Particulier' : 'Zakelijk',
      companyName: bedrijfsnaam || null,
      contactPerson: contactpersoon || null,
      firstName: voornaam,
      lastName: achternaam,
      email: email,
      phone: telefoon,
      billingStreet: straat,
      billingHouseNumber: huisnummer,
      billingPostcode: postcode,
      billingCity: plaats || null,
      hasDifferentProjectAddress: afwijkendProjectadres,
      projectStreet: projectStraat || null,
      projectHouseNumber: projectHuisnummer || null,
      projectPostcode: projectPostcode || null,
      projectCity: projectPlaats || null,
      shortDescription: werkomschrijving,
      clientName: clientType === 'zakelijk' ? bedrijfsnaam || `${voornaam} ${achternaam}` : `${voornaam} ${achternaam}`,
      title: werkomschrijving,
  };
  
  try {
      const docRef = await addDoc(collection(firestore, "quotes"), quoteData);
      if (!docRef) throw new Error("Kon documentreferentie niet ophalen.");
      revalidatePath('/');
      return { redirect: `/offertes/${docRef.id}/klus/nieuw` };
  } catch (error) {
      console.error("Firebase schrijf fout in createQuoteAction: ", error);
      let message = 'Database Fout: Offerte kon niet worden aangemaakt.';
      if (error instanceof Error) {
          message = `Database Fout: ${error.message}`;
      }
      return { message };
  }
}

export async function createJobAction(quoteId: string, categorie: JobCategory, omschrijving: string) {
    const { redirect } = await import('next/navigation');
    try {
        // This function will need to be updated to write to a subcollection in Firestore
        console.log("Klus aanmaken voor offerte:", quoteId);
        // For now, we redirect to the edit page, which is not yet Firestore-aware
        redirect(`/offertes/${quoteId}/klus/temp-job-id/bewerken`);
    } catch (error) {
        console.error(error);
        return { message: 'Database Fout: Klus kon niet worden aangemaakt.' };
    }
}

const JobDetailsSchema = z.object({
  subcategorie: z.string().optional(),
  lengteMm: z.coerce.number().optional(),
  hoogteMm: z.coerce.number().optional(),
  diepteMm: z.coerce.number().optional(),
  aantal: z.coerce.number().min(1, 'Aantal moet minimaal 1 zijn'),
  omschrijvingKlant: z.string().min(1, 'Omschrijving is verplicht'),
});


export async function updateJobAction(quoteId: string, jobId: string, formData: FormData) {
    const { redirect } = await import('next/navigation');
    const validatedFields = JobDetailsSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        console.error(validatedFields.error.flatten().fieldErrors);
        return {
          errors: validatedFields.error.flatten().fieldErrors,
        };
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

export async function submitQuoteAction(quoteId: string) {
    const { redirect } = await import('next/navigation');
    try {
        // This will need to be updated to use Firestore
        const fullQuoteData = await getFullQuoteDetails(quoteId);
        if (!fullQuoteData) {
            throw new Error("Offerte niet gevonden.");
        }

        const webhookUrl = 'https://placeholder.webhook.url/n8n';

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullQuoteData),
        });

        if (!response.ok) {
            throw new Error(`Webhook mislukt met status: ${response.status}`);
        }
        
        // This will need to be updated to use Firestore
        // await updateQuoteStatus(quoteId, 'in_behandeling');

    } catch (error) {
        console.error(error);
        return { message: 'Fout: Offerte kon niet worden verstuurd.' };
    }

    revalidatePath('/');
    redirect('/');
}
