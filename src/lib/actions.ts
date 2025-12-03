'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createQuote, createJob, updateJob, updateQuoteStatus, getFullQuoteDetails } from './data';
import type { JobCategory } from './types';

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
  plaats: z.string().min(1, 'Plaats is verplicht'),
  afwijkendProjectadres: z.boolean().optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: zstring().optional(),
  projectPlaats: z.string().optional(),
});


const QuoteFormSchema = z.object({
  werkomschrijving: z.string().min(10, 'Geef een korte omschrijving van het werk.').max(800, 'De omschrijving mag maximaal 800 tekens lang zijn.'),
  clientSource: z.enum(['new', 'existing']),
  existingClientId: z.string().optional(),
  newClient: NewClientSchema.optional(),
}).refine(data => {
    if (data.clientSource === 'existing') {
        return !!data.existingClientId;
    }
    if (data.clientSource === 'new') {
        return !!data.newClient;
    }
    return false;
}, {
    message: "Selecteer een bestaande klant of voer de gegevens voor een nieuwe klant in.",
    path: ["clientSource"],
});


type CreateQuoteState = {
  errors?: z.ZodError<typeof QuoteFormSchema>['formErrors']['fieldErrors'];
  message?: string | null;
  redirect?: string | null;
};

export async function createQuoteAction(formData: FormData): Promise<CreateQuoteState> {
    const rawData = {
        werkomschrijving: formData.get('werkomschrijving'),
        clientSource: formData.get('clientSource') || 'new',
        existingClientId: formData.get('existingClientId'),
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
    
    // Alleen valideren wat nodig is
    if (rawData.clientSource === 'existing') {
        delete (rawData as any).newClient;
    } else {
        delete rawData.existingClientId;
    }

    const validatedFields = QuoteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validatie mislukt. Controleer de gemarkeerde velden.'
    };
  }
  
  const { werkomschrijving, clientSource, existingClientId, newClient } = validatedFields.data;
  let clientId: string;

  try {
    // Stap 1: Klant aanmaken of ophalen
    if (clientSource === 'new' && newClient) {
        const clientToCreate = {
            naam: newClient.clientType === 'zakelijk' ? newClient.bedrijfsnaam || `${newClient.voornaam} ${newClient.achternaam}` : `${newClient.voornaam} ${newClient.achternaam}`,
            adres: `${newClient.straat} ${newClient.huisnummer}`,
            postcode: newClient.postcode,
            plaats: newClient.plaats,
            email: newClient.email,
            telefoon: newClient.telefoon,
            // Hier zou je de extra velden kunnen opslaan in een 'details' object
        };
      const createdClient = await createClient(clientToCreate);
      clientId = createdClient.id;
    } else if (clientSource === 'existing' && existingClientId) {
      clientId = existingClientId;
    } else {
      return { message: 'Geen klantgegevens ontvangen' };
    }
  
    // Stap 2: Offerte aanmaken met de korte omschrijving als titel
    const newQuote = await createQuote({ clientId, titel: werkomschrijving });

    // Stap 3: Navigeer naar de job builder (stap 2)
    revalidatePath('/');
    return { redirect: `/offertes/${newQuote.id}/klus/nieuw` };

  } catch (error) {
    console.error(error);
    return { message: 'Database Fout: Offerte kon niet worden aangemaakt.' };
  }
}

export async function createJobAction(quoteId: string, categorie: JobCategory, omschrijving: string) {
    const { redirect } = await import('next/navigation');
    try {
        const newJob = await createJob({
            quoteId,
            categorie,
            omschrijvingKlant: omschrijving,
            aantal: 1,
        });
        redirect(`/offertes/${quoteId}/klus/${newJob.id}/bewerken`);
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
            throw new Error(`Webhook failed with status: ${response.status}`);
        }
        
        await updateQuoteStatus(quoteId, 'in_behandeling');

    } catch (error) {
        console.error(error);
        return { message: 'Fout: Offerte kon niet worden verstuurd.' };
    }

    revalidatePath('/');
    redirect('/');
}
