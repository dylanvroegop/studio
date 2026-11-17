import { z } from 'zod';
import type { ReviewedScopeLine, WorkDescriptionStructured } from './quote-calculations';

export const MAX_REVIEW_PHOTOS = 12;
export const sourceSchema = z.object({ label: z.string().min(1).max(200), text: z.string().min(1).max(80000) });
export type ReviewSource = z.infer<typeof sourceSchema>;

export function scopeReviewSources(
    title: string, notes: string, materials: string[], work: WorkDescriptionStructured | null,
): ReviewSource[] {
    const sources: ReviewSource[] = [];
    function add(label: string, text: string) {
        if (text.trim()) sources.push({ label, text: text.trim() });
    }
    add('Aanvraag', title);
    add('Notities', notes);
    add('Materiaal', materials.join('\n'));
    if (work) {
        add('Werk & levering · inbegrepen', work.included.join('\n'));
        add('Werk & levering · uitgesloten', work.excluded.join('\n'));
        (work.jobs.length ? work.jobs : [work]).forEach((job, i) => {
            const label = 'Klus ' + (i + 1);
            add(label, [job.title, ...(job.work_scope.length ? job.work_scope : [job.summary]), ...job.dimensions].filter(Boolean).join('\n'));
            if (work.jobs.length) {
                add(label + ' · inbegrepen', job.included.join('\n'));
                add(label + ' · uitgesloten', job.excluded.join('\n'));
            }
        });
    }
    return sources;
}

const statement = z.string().trim().min(1).max(1500);
export const findingSchema = z.object({
    topic: statement, priority: z.enum(['Hoog', 'Normaal']), sources: z.array(statement).min(1),
    evidence: statement, risk: statement, question: statement, inspection: z.string().max(1000),
    included: z.string().max(1200), excluded: z.string().max(1200),
});
export const reportSchema = z.object({ findings: z.array(findingSchema).max(12) });
export type ScopeReport = z.infer<typeof reportSchema>;


export type ScopeDecision = ReviewedScopeLine;

export function addScopeDecisions(work: WorkDescriptionStructured, decisions: ScopeDecision[]): WorkDescriptionStructured {
    const chosen = decisions.map(d => ({ ...d, text: d.text.trim() })).filter(d => d.text);
    if (!chosen.length) return work;
    const previous = work.reviewedScopeLines || [];
    const topics = new Set(chosen.map(d => d.topic));
    const retained = previous.filter(d => !topics.has(d.topic));
    function merge(kind: ScopeDecision['kind']): string[] {
        const replaced = new Set(previous.filter(d => d.kind === kind && topics.has(d.topic)).map(d => d.text));
        const kept = new Set(retained.filter(d => d.kind === kind).map(d => d.text));
        return Array.from(new Set([
            ...work[kind].filter(text => !replaced.has(text) || kept.has(text)),
            ...chosen.filter(d => d.kind === kind).map(d => d.text),
        ]));
    }
    return { ...work, included: merge('included'), excluded: merge('excluded'), reviewedScopeLines: [...retained, ...chosen] };
}
