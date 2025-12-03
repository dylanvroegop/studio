'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createQuote, createJob, updateJob, updateQuoteStatus, getFullQuoteDetails } from './data';
import type { JobCategory } from './types';

const NewClientSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht'),
  adres: z.string().min(1, 'Adres is verplicht'),
  postcode: z.string().min(1, 'Postcode is verplicht'),
  plaats: z.string().min(1, 'Plaats is verplicht'),
  email: z.string().email('Ongeldig emailadres').optional().or(z.literal('')),
  telefoon: z.string().optional(),
});

const QuoteFormSchema = z.object({
  titel: z.string().min(3, 'Titel is verplicht (min. 3 karakters)'),
  clientSource: z.enum(['new', 'existing']),
  existingClientId: z.string().optional(),
  newClient: NewClientSchema.optional(),
}).refine(data => {
    if (data.clientSource === 'existing') {
        return !!data.existingClientId;
    }
    if (data.clientSource === 'new') {
        return !!data.newClient?.naam && !!data.newClient?.adres && !!data.newClient?.postcode && !!data.newClient?.plaats;
    }
    return false;
}, {
    message: "Selecteer een bestaande klant of voer de gegevens voor een nieuwe klant in.",
    path: ["clientSource"],
});


type CreateQuoteState = {
  errors?: {
    titel?: string[];
    clientSource?: string[];
    existingClientId?: string[];
    newClient?: string[];
  };
  message?: string | null;
  redirect?: string | null;
};

export async function createQuoteAction(formData: FormData): Promise<CreateQuoteState> {
    const rawData = {
        titel: formData.get('titel'),
        clientSource: formData.get('clientSource'),
        existingClientId: formData.get('existingClientId'),
        newClient: {
            naam: formData.get('newClient.naam'),
            adres: formData.get('newClient.adres'),
            postcode: formData.get('newClient.postcode'),
            plaats: formData.get('newClient.plaats'),
            email: formData.get('newClient.email'),
            telefoon: formData.get('newClient.telefoon'),
        }
    };

    if (rawData.clientSource === 'existing') {
        delete rawData.newClient;
    } else {
        delete rawData.existingClientId;
    }

    const validatedFields = QuoteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error(validatedFields.error.flatten().fieldErrors);
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validatie mislukt.'
    };
  }
  
  const { titel, clientSource, existingClientId, newClient } = validatedFields.data;
  let clientId: string;

  try {
    if (clientSource === 'new' && newClient) {
      const createdClient = await createClient(newClient);
      clientId = createdClient.id;
    } else if (clientSource === 'existing' && existingClientId) {
      clientId = existingClientId;
    } else {
      return { message: 'Geen klantgegevens ontvangen' };
    }
  
    const newQuote = await createQuote({ clientId, titel });
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
