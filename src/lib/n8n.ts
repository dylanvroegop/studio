
'use server';

export async function uploadPrijsbestandNaarN8n(
  bestand: File,
  gebruikerId: string,
  leverancierNaam: string
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
  if (!url) {
    throw new Error("N8N webhook URL ontbreekt (NEXT_PUBLIC_N8N_WEBHOOK_URL).");
  }

  const formData = new FormData();
  formData.append("bestand", bestand);
  formData.append("gebruikerId", gebruikerId);
  formData.append("leverancier", leverancierNaam);

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    // res.ok checks for 2xx status codes
    throw new Error(`Upload naar n8n mislukt (status ${res.status}).`);
  }
  // No need to parse JSON, any 2xx is considered a success.
}
