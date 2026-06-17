'use client';

import { sanitizeWorkDescriptionStructured, type WorkDescriptionStructured } from '@/lib/quote-calculations';

interface WorkDescriptionPreviewProps {
  value: WorkDescriptionStructured;
  activeJobIndex?: number;
}

export function WorkDescriptionPreview({ value, activeJobIndex = 0 }: WorkDescriptionPreviewProps) {
  const structured = sanitizeWorkDescriptionStructured(value);
  const jobs = structured.jobs.length > 0 ? structured.jobs : [structured];
  const job = jobs[Math.max(0, Math.min(activeJobIndex, jobs.length - 1))];
  const sections: Array<[string, string[]]> = [
    ['Werkzaamheden', job.work_scope],
    ['Maatvoering', job.dimensions],
    ['Inbegrepen', job.included],
    ['Niet inbegrepen', job.excluded],
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card/60 p-5">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <h3 className="text-lg font-semibold text-foreground">{job.title || 'Werk & Levering'}</h3>
        {job.summary ? <p className="text-sm leading-relaxed text-muted-foreground">{job.summary}</p> : null}
      </div>
      {sections.map(([label, rows]) => rows.length > 0 ? (
        <section key={label} className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4>
          <ol className="space-y-1 text-sm text-foreground/90">
            {rows.map((item, index) => <li key={`${label}-${index}`}>{index + 1}. {item}</li>)}
          </ol>
        </section>
      ) : null)}
    </div>
  );
}
