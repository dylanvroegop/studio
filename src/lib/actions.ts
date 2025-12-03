'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, createQuote, createJob, updateJob, updateQuoteStatus, getFullQuoteDetails } from './data';
import type { Client, JobCategory } from './types';

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
});

export async function createQuoteAction(formData: FormData) {
  const validatedFields = QuoteFormSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!validatedFields.success) {
    console.error(validatedFields.error.flatten().fieldErrors);
    return {
      errors: validatedFields.error.flatten().fieldErrors,
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
      throw new Error('Geen klantgegevens ontvangen');
    }
  
    const newQuote = await createQuote({ clientId, titel });
    revalidatePath('/');
    redirect(`/offertes/${newQuote.id}`);

  } catch (error) {
    console.error(error);
    return { message: 'Database Fout: Offerte kon niet worden aangemaakt.' };
  }
}

export async function createJobAction(quoteId: string, categorie: JobCategory, omschrijving: string) {
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
