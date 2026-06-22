import type { User } from 'firebase/auth';

type NotesBackupInput = {
  user: User;
  quoteId: string;
  kind: 'notes';
  notes: string;
  source: string;
};

type MeasurementsBackupInput = {
  user: User;
  quoteId: string;
  kind: 'measurements';
  klusId: string;
  measurements: unknown;
  source: string;
};

export type QuoteBackupInput = NotesBackupInput | MeasurementsBackupInput;

export async function saveQuoteBackup(input: QuoteBackupInput): Promise<void> {
  const { user, ...payload } = input;
  const token = await user.getIdToken();
  const response = await fetch('/api/quotes/backup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || 'Back-up opslaan mislukt.');
  }
}
