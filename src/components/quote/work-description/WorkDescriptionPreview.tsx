'use client';

import { WorkDescriptionStructured, normalizeWerkbeschrijving } from '@/lib/quote-calculations';

interface WorkDescriptionPreviewProps {
  value: WorkDescriptionStructured;
  activeJobIndex?: number;
}

function renderRows(rows: string[]): string[] {
  return rows.map((row) => row.trim()).filter(Boolean);
}

export function WorkDescriptionPreview({ value, activeJobIndex = 0 }: WorkDescriptionPreviewProps) {
  const normalizeRows = (rows: unknown): string[] => normalizeWerkbeschrijving(rows || []);
  const jobs = Array.isArray(value.jobs) && value.jobs.length > 0
    ? value.jobs.map((job) => ({
      ...job,
      sections: {
        voorbereiding: normalizeRows(job?.sections?.voorbereiding),
        uitvoering: normalizeRows(job?.sections?.uitvoering),
        afwerking: normalizeRows(job?.sections?.afwerking),
      },
      legacyNotes: normalizeRows(job?.legacyNotes || []),
    }))
    : [{
      title: value.title,
      context: value.context,
      sections: {
        voorbereiding: normalizeRows(value.sections?.voorbereiding),
        uitvoering: normalizeRows(value.sections?.uitvoering),
        afwerking: normalizeRows(value.sections?.afwerking),
      },
      legacyNotes: normalizeRows(value.legacyNotes || []),
    }];
  const clampedIndex = Math.max(0, Math.min(activeJobIndex, jobs.length - 1));
  const activeJob = jobs[clampedIndex];
  const uitvoering = renderRows(activeJob?.sections?.uitvoering || []);
  const legacyNotes = Array.isArray(activeJob?.legacyNotes)
    ? activeJob.legacyNotes.map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card/60 p-5">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {activeJob?.title?.trim() || 'Werkbeschrijving'}
        </h3>
        {activeJob?.context?.trim() ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{activeJob.context.trim()}</p>
        ) : null}
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Uitvoering</h4>
        <ol className="space-y-1 text-sm text-foreground/90">
          {uitvoering.length > 0 ? uitvoering.map((item, index) => (
            <li key={`preview-uitvoering-${index}`}>{index + 1}. {item}</li>
          )) : <li className="text-muted-foreground">Geen stappen ingevuld.</li>}
        </ol>
      </section>
      {legacyNotes.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-300">Overgenomen notities</h4>
          <ul className="space-y-1 text-sm text-amber-100/90">
            {legacyNotes.map((item, index) => (
              <li key={`preview-legacy-${index}`}>- {item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
