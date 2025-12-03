
'use server';

export async function uploadPrijsbestandNaarN8n(
  bestand: File,
  gebruikerId: string,
  leverancierNaam: string
): Promise<void> {
  const url = "https://n8n.dylan8n.org/webhook-test/bee441de-eaaa-495e-a294-4be7d3c1a0b2";

  if (!url) {
    throw new Error("N8N webhook URL ontbreekt.");
  }

  const formData = new FormData();
  formData.append("bestand", bestand);
  formData.append("gebruikerId", gebruikerId);
  formData.append("leverancier", leverancierNaam);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
  
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload mislukt: Status ${res.status}. Reactie: ${errorText || 'Geen response body'}`);
    }
  } catch (error) {
    if (error instanceof Error) {
        throw new Error(`Netwerkfout bij uploaden: ${error.message}`);
    }
    throw new Error('Een onbekende netwerkfout is opgetreden.');
  }
}
