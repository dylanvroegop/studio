'use client';

import { sanitizeWorkDescriptionStructured, type WorkDescriptionStructured } from '@/lib/quote-calculations';
import { FileText } from 'lucide-react';

interface WorkDescriptionCardProps {
    werkbeschrijving: string[];
    structured?: WorkDescriptionStructured;
}

export function WorkDescriptionCard({ werkbeschrijving, structured }: WorkDescriptionCardProps) {
    const scope = structured ? sanitizeWorkDescriptionStructured(structured) : null;
    const job = scope?.jobs[scope.activeJobIndex || 0] || scope;
    const sections: Array<[string, string[]]> = job ? [
        ['Werkzaamheden', job.work_scope],
        ['Maatvoering', job.dimensions],
        ['Inbegrepen', job.included],
        ['Niet inbegrepen', job.excluded],
    ] : [];
    const hasStructuredRows = sections.some(([, rows]) => rows.length > 0);

    if (!hasStructuredRows && (!werkbeschrijving || werkbeschrijving.length === 0)) {
        return null;
    }

    return (
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <h3 className="font-semibold text-muted-foreground text-sm mb-4 flex items-center gap-2">
                <FileText size={14} />
                WERK &amp; LEVERING
            </h3>

            {job?.summary ? <p className="mb-4 text-sm text-foreground/80">{job.summary}</p> : null}
            <div className="space-y-5">
                {(hasStructuredRows ? sections : [['', werkbeschrijving] as [string, string[]]]).map(([label, rows]) => rows.length > 0 ? (
                    <section key={label || 'scope'}>
                        {label ? <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4> : null}
                        <ol className="space-y-2 text-sm text-foreground/80">
                            {rows.map((item, index) => <li key={`${label}-${index}`}>{index + 1}. {item}</li>)}
                        </ol>
                    </section>
                ) : null)}
            </div>
        </div>
    );
}
