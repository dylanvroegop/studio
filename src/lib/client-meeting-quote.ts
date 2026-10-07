import { buildConfirmedMeetingNotes, getConfirmedMeetingItems, type MeetingReport } from './client-meetings';

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

/** Klantgegevens komen uit het gekozen klantdossier, nooit uit de AI-transcriptie. */
export function meetingClientToQuote(clientId: string, client: Record<string, unknown>): Record<string, unknown> {
  const project = {
    straat: text(client.projectStraat), huisnummer: text(client.projectHuisnummer),
    postcode: text(client.projectPostcode), plaats: text(client.projectPlaats),
  };
  const address = {
    straat: text(client.straat) || text(client.adres), huisnummer: text(client.huisnummer),
    postcode: text(client.postcode), plaats: text(client.plaats),
  };
  const email = text(client.emailadres) || text(client.email);
  return {
    clientId, klanttype: text(client.bedrijfsnaam) ? 'Zakelijk' : 'Particulier',
    voornaam: text(client.voornaam) || (!text(client.achternaam) ? text(client.naam) : ''),
    achternaam: text(client.achternaam), bedrijfsnaam: text(client.bedrijfsnaam),
    contactpersoon: text(client.contactpersoon), kvkNummer: text(client.kvkNummer), btwNummer: text(client.btwNummer),
    emailadres: email, 'e-mailadres': email,
    telefoonnummer: text(client.telefoonnummer) || text(client.telefoon),
    ...address, factuuradres: address,
    afwijkendProjectadres: Object.values(project).some(Boolean),
    projectStraat: project.straat, projectHuisnummer: project.huisnummer,
    projectPostcode: project.postcode, projectPlaats: project.plaats,
    projectAdres: project, projectadres: project,
  };
}

export function meetingQuoteNotes(report: MeetingReport): string {
  const title = report.projectName.replace(/[\r\n#]/g, ' ').trim();
  return `### ${title}\n${buildConfirmedMeetingNotes(report)}`;
}

export function meetingQuoteSource(meetingId: string, report: MeetingReport, revision: number) {
  return { meetingId, revision, items: getConfirmedMeetingItems(report) };
}

export function isEditableMeetingQuote(quote: Record<string, unknown>, userId: string, clientId: string): boolean {
  const customer = quote.klantinformatie as Record<string, unknown> | undefined;
  const legacyCustomer = quote.klant as Record<string, unknown> | undefined;
  const legacyClient = quote.client as Record<string, unknown> | undefined;
  const links = [quote.clientId, quote.klantId, customer?.clientId, customer?.klantId, legacyCustomer?.id, legacyClient?.id].filter(Boolean);
  return quote.userId === userId && !quote.archived && !quote.sentAt
    && ['concept', 'werkbespreking'].includes(String(quote.status))
    && links.length > 0 && links.every((id) => id === clientId);
}
