'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getJobById, updateJob, getFullQuoteDetails } from './data';
import type { JobCategory } from './types';
import { addDoc, serverTimestamp, collection } from 'firebase/firestore';
import { initializeFirebaseServer } from '@/firebase/server';
import { getAuth } from 'firebase/auth';

const NewClientSchema = z.object({
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
  afwijkendProjectadres: z.boolean().optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});


const QuoteFormSchema = z.object({
  werkomschrijving: z.string().min(10, 'Geef een korte omschrijving van het werk.').max(800, 'De omschrijving mag maximaal 800 tekens lang zijn.'),
  clientSource: z.enum(['new']),
  newClient: NewClientSchema,
});


type CreateQuoteState = {
  errors?: z.ZodError<typeof QuoteFormSchema>['formErrors']['fieldErrors'];
  message?: string | null;
  redirect?: string | null;
};

export async function createQuoteAction(formData: FormData): Promise<CreateQuoteState> {
    const { redirect } = await import('next/navigation');
    const { auth, firestore } = initializeFirebaseServer();
    // This is a server action, we cannot rely on client-side auth state.
    // The framework should handle authentication context for server actions.
    // For now, we'll assume there is a way to get the user, but we can't use `auth.currentUser`.
    // We'll need to adapt this if a server-side auth method is available.
    // Let's assume for now we get the UID from a session or similar mechanism.
    // As a placeholder, this action is not truly secure without proper session management.
    const uid = formData.get('userId'); // Let's assume userId is passed in form for now.
    
    // A real implementation would get UID from a server-side session.
    // For now, we'll proceed, but this is a security note.
    if (!uid) {
        // This check would be more robust with server-side auth state.
        return { message: 'Gebruiker niet ingelogd.'};
    }

    const rawData = {
        werkomschrijving: formData.get('werkomschrijving'),
        clientSource: 'new', // Hardcoded as per form
        userId: uid,
        newClient: {
            clientType: formData.get('clientType') || 'particulier',
            bedrijfsnaam: formData.get('bedrijfsnaam'),
            contactpersoon: formData.get('contactpersoon'),
            voornaam: formData.get('voornaam'),
            achternaam: formData.get('achternaam'),
            email: formData.get('email'),
            telefoon: formData.get('telefoon'),
            straat: formData.get('straat'),
            huisnummer: formData.get('huisnummer'),
            postcode: formData.get('postcode'),
            plaats: formData.get('plaats'),
            afwijkendProjectadres: formData.get('afwijkendProjectadres') === 'on',
            projectStraat: formData.get('projectStraat'),
            projectHuisnummer: formData.get('projectHuisnummer'),
            projectPostcode: formData.get('projectPostcode'),
            projectPlaats: formData.get('projectPlaats'),
        }
    };
    
    const validatedFields = QuoteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validatie mislukt. Controleer de gemarkeerde velden.'
    };
  }
  
  const { werkomschrijving, newClient } = validatedFields.data;

  const quoteData = {
      userId: uid as string,
      status: "concept",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      clientType: newClient.clientType === 'particulier' ? 'Particulier' : 'Zakelijk',
      companyName: newClient.bedrijfsnaam,
      contactPerson: newClient.contactpersoon,
      firstName: newClient.voornaam,
      lastName: newClient.achternaam,
      email: newClient.email,
      phone: newClient.telefoon,
      billingStreet: newClient.straat,
      billingHouseNumber: newClient.huisnummer,
      billingPostcode: newClient.postcode,
      billingCity: newClient.plaats,
      hasDifferentProjectAddress: newClient.afwijkendProjectadres,
      projectStreet: newClient.projectStraat,
      projectHouseNumber: newClient.projectHuisnummer,
      projectPostcode: newClient.projectPostcode,
      projectCity: newClient.projectPlaats,
      shortDescription: werkomschrijving,
      clientName: newClient.clientType === 'zakelijk' ? newClient.bedrijfsnaam || `${newClient.voornaam} ${newClient.achternaam}` : `${newClient.voornaam} ${newClient.achternaam}`,
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
      if (error instanceof Error && error.message.includes('permission-error')) {
          message = error.message; // Propagate the detailed error message
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
