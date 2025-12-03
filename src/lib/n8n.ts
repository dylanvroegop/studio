'use server';

export async function uploadPrijsbestandNaarN8n(
  bestand: File,
  gebruikerId: string,
  leverancierNaam: string
) {
  const url = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
  if (!url) {
    throw new Error('Webhook URL ontbreekt in de omgevingsvariabelen.');
  }

  const form = new FormData();
  form.append('bestand', bestand);
  form.append('gebruikerId', gebruikerId);
  form.append('leverancier', leverancierNaam);

  const res = await fetch(url, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload naar n8n mislukt: ${res.status} ${await res.text()}`);
  }

  // Return a success message or data if n8n returns something useful
  return { success: true, message: 'Bestand succesvol naar n8n verstuurd.' };
}
