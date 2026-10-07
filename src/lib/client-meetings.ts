import { z } from 'zod';

export const MEETING_MAX_DURATION_MS = 90 * 60 * 1000;
export const MEETING_MAX_CHUNK_BYTES = 12 * 1024 * 1024;
export const MEETING_RETENTION_DAYS = 30;
export const MEETING_SECTIONS = {
  overview: 'Projectoverzicht',
  scope: 'Werkzaamheden',
  measurement: 'Maten en aantallen',
  material: 'Materialen en afwerking',
  preference: 'Klantwensen',
  site: 'Werkomstandigheden',
  planning: 'Planning',
  agreement: 'Afspraken',
  question: 'Openstaande vragen',
  risk: 'Risico’s',
} as const;

export const MEETING_ITEM_STATUSES = {
  confirmed: 'Bevestigd', request: 'Klantverzoek', suggestion: 'Voorstel',
  uncertain: 'Onzeker', contradiction: 'Tegenstrijdig',
} as const;

export const meetingEvidenceSchema = z.object({
  segmentId: z.string().min(1).max(100),
  quote: z.string().min(1).max(2000),
}).strict();

export const meetingMeasurementSchema = z.object({
  element: z.string().max(300),
  dimension: z.string().max(100),
  value: z.string().max(100),
  unit: z.string().max(40),
  normalizedValue: z.number().finite().nullable(),
  normalizedUnit: z.string().max(40).nullable(),
}).strict();

export const meetingItemSchema = z.object({
  id: z.string().min(1).max(100),
  section: z.enum(['overview', 'scope', 'measurement', 'material', 'preference', 'site', 'planning', 'agreement', 'question', 'risk']),
  title: z.string().min(1).max(300),
  detail: z.string().max(4000),
  status: z.enum(['confirmed', 'request', 'suggestion', 'uncertain', 'contradiction']),
  basis: z.enum(['spoken', 'assessment']),
  priority: z.enum(['high', 'normal', 'low']),
  reviewed: z.boolean(),
  evidence: z.array(meetingEvidenceSchema).max(12),
  measurement: meetingMeasurementSchema.nullable(),
}).strict();

export const meetingReportSchema = z.object({
  projectName: z.string().min(1).max(300),
  description: z.string().max(40000),
  items: z.array(meetingItemSchema).max(250),
}).strict().superRefine((report, ctx) => {
  const ids = new Set<string>();
  report.items.forEach((item, index) => {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'Dubbel veldnummer.' });
    ids.add(item.id);
    if (item.section === 'measurement' && !item.measurement) {
      ctx.addIssue({ code: 'custom', path: ['items', index, 'measurement'], message: 'Maatgegevens ontbreken.' });
    }
  });
});

export type MeetingReport = z.infer<typeof meetingReportSchema>;
export type MeetingItem = z.infer<typeof meetingItemSchema>;
export type MeetingSection = MeetingItem['section'];
export type MeetingStatus = 'recording' | 'queued' | 'transcribing' | 'analyzing' | 'ready' | 'error';

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  recording: 'Upload nog niet afgerond', queued: 'In wachtrij', transcribing: 'Transcript maken',
  analyzing: 'Project analyseren', ready: 'Klaar voor controle', error: 'Verwerking mislukt',
};

export interface ClientMeeting {
  id: string;
  userId: string;
  clientId: string;
  quoteId: string | null;
  title: string;
  status: MeetingStatus;
  chunkCount: number;
  uploadedChunks: number;
  processedChunks: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  error: string | null;
  revision: number;
  generatedQuoteId?: string | null;
}

export interface MeetingChunk {
  index: number;
  startMs: number;
  durationMs: number;
  mimeType: string;
  bytes: number;
  sha256: string;
}

export interface MeetingTranscriptSegment {
  id: string;
  chunkIndex: number;
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
}

export interface MeetingDetail {
  meeting: ClientMeeting;
  chunks: MeetingChunk[];
  transcript: MeetingTranscriptSegment[];
  report: MeetingReport | null;
}

/** Alleen letterlijk terugvindbare bronverwijzingen worden aanvaard. */
export function validateMeetingEvidence(report: MeetingReport, transcript: MeetingTranscriptSegment[]): string[] {
  const texts = new Map(transcript.map((segment) => [segment.id, segment.text]));
  const errors: string[] = [];
  for (const item of report.items) {
    if (item.basis === 'spoken' && item.evidence.length === 0) errors.push(`${item.id}: bron ontbreekt`);
    for (const source of item.evidence) {
      if (!texts.get(source.segmentId)?.includes(source.quote)) errors.push(`${item.id}: bron bestaat niet`);
    }
  }
  return errors;
}

export function getConfirmedMeetingItems(report: MeetingReport): MeetingItem[] {
  return report.items.filter((item) => item.reviewed && item.status === 'confirmed'
    && item.basis === 'spoken' && item.section !== 'question' && item.section !== 'risk');
}

/** De vrije AI-beschrijving kan onzekerheden bevatten; overdracht gebruikt gecontroleerde velden. */
export function buildConfirmedMeetingNotes(report: MeetingReport): string {
  const items = getConfirmedMeetingItems(report);
  return Object.entries(MEETING_SECTIONS).flatMap(([section, label]) => {
    const rows = items.filter((item) => item.section === section);
    if (!rows.length) return [];
    return [label, ...rows.map((item) => {
      const measure = item.measurement;
      const suffix = measure ? ` (${measure.element}: ${measure.dimension} ${measure.value} ${measure.unit})` : '';
      return `- ${item.title}: ${item.detail}${suffix}`;
    }), ''];
  }).join('\n').trim();
}

export function formatMeetingTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
