'use client';

import { WorkDescriptionStructured } from '@/lib/quote-calculations';

interface WorkDescriptionPreviewProps {
  value: WorkDescriptionStructured;
}

function renderRows(rows: string[]): string[] {
  return rows.map((row) => row.trim()).filter(Boolean);
}

export function WorkDescriptionPreview({ value }: WorkDescriptionPreviewProps) {
  const voorbereiding = renderRows(value.sections.voorbereiding);
  const uitvoering = renderRows(value.sections.uitvoering);
  const afwerking = renderRows(value.sections.afwerking);
  const legacyNotes = Array.isArray(value.legacyNotes)
    ? value.legacyNotes.map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card/60 p-5">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {value.title.trim() || 'Werkbeschrijving'}
        </h3>
        {value.context.trim() ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{value.context.trim()}</p>
        ) : null}
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Voorbereiding</h4>
        <ol className="space-y-1 text-sm text-foreground/90">
          {voorbereiding.length > 0 ? voorbereiding.map((item, index) => (
            <li key={`preview-voorbereiding-${index}`}>{index + 1}. {item}</li>
          )) : <li className="text-muted-foreground">Geen stappen ingevuld.</li>}
        </ol>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Uitvoering</h4>
        <ol className="space-y-1 text-sm text-foreground/90">
          {uitvoering.length > 0 ? uitvoering.map((item, index) => (
            <li key={`preview-uitvoering-${index}`}>{index + 1}. {item}</li>
          )) : <li className="text-muted-foreground">Geen stappen ingevuld.</li>}
        </ol>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Afwerking</h4>
        <ol className="space-y-1 text-sm text-foreground/90">
          {afwerking.length > 0 ? afwerking.map((item, index) => (
            <li key={`preview-afwerking-${index}`}>{index + 1}. {item}</li>
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
