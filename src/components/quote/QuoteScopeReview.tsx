'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { QuotePhotoAttachment } from '@/lib/types';
import { MAX_REVIEW_PHOTOS, reportSchema, type ReviewSource, type ScopeDecision, type ScopeReport } from '@/lib/quote-scope-review';

interface ReviewDraft {
    context: string;
    omitted: string[];
    decisions: ScopeDecision[];
    last?: { report: ScopeReport; input: string; at: string };
}
interface ReviewProps {
    quoteId: string;
    user: User;
    sources: ReviewSource[];
    photos: QuotePhotoAttachment[];
    uploading: boolean;
    onUpload: (file: File) => Promise<void>;
    onApply?: (decisions: ScopeDecision[]) => string | void;
}

const emptyDraft: ReviewDraft = { context: '', omitted: [], decisions: [] };
const kindLabel = { included: 'Inbegrepen', excluded: 'Niet inbegrepen' } as const;

export function QuoteScopeReview({ quoteId, user, sources, photos, uploading, onUpload, onApply }: ReviewProps): JSX.Element {
    const storageKey = 'offertecheck:v1:' + user.uid + ':' + quoteId;
    const [draft, setDraft] = useState<ReviewDraft>(emptyDraft);
    const [ready, setReady] = useState(false);
    const [storageError, setStorageError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const request = useRef<AbortController | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) setDraft({ ...emptyDraft, ...JSON.parse(raw) });
        } catch { setStorageError(true); }
        setReady(true);
        return () => request.current?.abort();
    }, [storageKey]);

    useEffect(() => {
        if (!ready) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(draft));
            setStorageError(false);
        } catch { setStorageError(true); }
    }, [draft, ready, storageKey]);

    const selected = photos.filter(p => !draft.omitted.includes(p.id));
    const reviewSources = draft.context.trim() ? [...sources, { label: 'Extra context', text: draft.context.trim() }] : sources;
    const input = JSON.stringify({ sources: reviewSources, photoIds: selected.map(p => p.id) });
    const canAnalyze = ready && !busy && !uploading && !importing && selected.length <= MAX_REVIEW_PHOTOS && !!(selected.length || reviewSources.length);
    const stale = !!draft.last && draft.last.input !== input;
    const decisions = draft.decisions.filter(d => d.text.trim());

    async function analyze() {
        if (!canAnalyze || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/quotes/scope-review', {
                method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
                body: JSON.stringify({ quoteId, sources: reviewSources, photoIds: selected.map(p => p.id) }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw Error(result?.error || result?.message || 'De controle is mislukt (HTTP ' + response.status + ').');
            const report = reportSchema.parse(result);
            setDraft(previous => ({ ...previous, last: { report, input, at: new Date().toISOString() } }));
        } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'De analyse is mislukt.');
        } finally {
            request.current = null;
            setBusy(false);
        }
    }

    function choose(row: ScopeDecision) {
        setDraft(previous => ({
            ...previous, decisions: [...previous.decisions.filter(d => d.topic !== row.topic), row],
        }));
    }

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: 'Gekopieerd' });
        } catch { setError('Kopiëren is mislukt. Selecteer en kopieer de tekst handmatig.'); }
    }

    return <div className="min-w-0 space-y-4 text-sm">
        <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-base font-semibold">Offertecheck</h2>
            <details>
                <summary className="cursor-pointer font-medium">Bronnen uit de offerte ({sources.length})</summary>
                <div className="mt-2 max-h-72 space-y-3 overflow-auto rounded-md bg-muted/40 p-3">
                    {sources.length === 0 && <p>Nog geen offertetekst of notities beschikbaar.</p>}
                    {sources.map(source => <div key={source.label}><strong>{source.label}</strong><p className="whitespace-pre-line break-words">{source.text}</p></div>)}
                </div>
            </details>
            <div>
                <label htmlFor="scope-review-context" className="font-medium">Extra context of oorspronkelijke klantvraag</label>
                <Textarea id="scope-review-context" className="mt-1" rows={3} maxLength={12000} value={draft.context} disabled={!ready}
                    placeholder="Wat heeft de klant gevraagd? Welke afwerking verwacht hij bij oplevering?"
                    onChange={e => setDraft({ ...draft, context: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">Projectfoto’s ({selected.length} geselecteerd)</span>
                <input type="file" multiple accept="image/*" ref={fileInput} className="hidden" onChange={async e => {
                    const files = Array.from(e.currentTarget.files || []);
                    e.currentTarget.value = '';
                    setImporting(true);
                    try { for (const file of files) await onUpload(file); }
                    finally { setImporting(false); }
                }} />
                <Button type="button" size="sm" variant="outline" disabled={importing || uploading} onClick={() => fileInput.current?.click()}>
                    <Upload size={14} className="mr-2" />{importing || uploading ? 'Uploaden…' : 'Foto’s toevoegen'}
                </Button>
            </div>
            {photos.length > 0 && <div className="flex flex-wrap gap-2">{photos.map((photo, index) =>
                <label key={photo.id} className="flex max-w-full cursor-pointer items-center gap-2 rounded border p-2">
                    <input type="checkbox" checked={!draft.omitted.includes(photo.id)} onChange={e => {
                        const omitted = e.target.checked ? draft.omitted.filter(id => id !== photo.id) : [...draft.omitted, photo.id];
                        setDraft({ ...draft, omitted });
                    }} />
                    {/* Een al opgeslagen, besloten projectfoto. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.thumbnailDownloadUrl || photo.downloadUrl} alt="" className="h-10 w-12 rounded object-cover" />
                    <span className="min-w-0 break-all">{'Foto ' + (index + 1)}<small className="block text-muted-foreground">{photo.originalName}</small></span>
                </label>)}</div>}
            {selected.length > MAX_REVIEW_PHOTOS && <p role="alert">Selecteer maximaal {MAX_REVIEW_PHOTOS} foto’s per controle.</p>}
            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="success" disabled={!canAnalyze} onClick={analyze}>
                    {busy && <Loader2 size={15} className="mr-2 animate-spin" />}{busy ? 'Analyseren…' : draft.last ? 'Opnieuw controleren' : 'Controleer offerte'}
                </Button>
                <span className="text-xs text-muted-foreground">OpenAI analyseert de bronnen en geselecteerde foto’s.</span>
            </div>

            {storageError && <p role="alert">Opslaan in deze browser is mislukt. Kopieer je keuzes voordat je afsluit.</p>}
        </section>
        {draft.last && <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Bespreekpunten ({draft.last.report.findings.length})</h3>
                <span className="text-xs text-muted-foreground">{new Date(draft.last.at).toLocaleString('nl-NL')}</span>
            </div>
            {stale && <p role="status" className="text-amber-600 dark:text-amber-400">Bronnen gewijzigd sinds deze controle.</p>}
            {draft.last.report.findings.length === 0 && <p>De AI vond in deze bronnen geen concrete open punten.</p>}
            {draft.last.report.findings.map((finding, index) => <article key={index} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2"><h4 className="font-semibold">{finding.topic}</h4><span className="text-xs text-muted-foreground">Prioriteit {finding.priority.toLowerCase()}</span></div>
                <p>{finding.risk}</p>
                <p className="text-muted-foreground"><strong>{finding.sources.join(' · ')}</strong> — {finding.evidence}</p>
                <p><strong>Vraag aan klant</strong> · {finding.question}</p>
                {finding.inspection && <p><strong>Op locatie</strong> · {finding.inspection}</p>}
                {(finding.included || finding.excluded) && <details>
                    <summary className="cursor-pointer font-medium">Tekst voor Werk &amp; levering kiezen</summary>
                    {(['included', 'excluded'] as const).map(kind => finding[kind] && <div key={kind} className="mt-2 space-y-1 border-l-2 pl-3">
                        <strong>{kindLabel[kind]}</strong><p>{finding[kind]}</p>
                        <Button size="sm" variant="outline" disabled={draft.decisions.some(row => row.topic === finding.topic && row.kind === kind)}
                            onClick={() => choose({ topic: finding.topic, kind, text: finding[kind] })}>
                            {draft.decisions.some(row => row.topic === finding.topic && row.kind === kind) ? 'Gekozen' : 'Kies deze tekst'}
                        </Button>
                    </div>)}
                </details>}
            </article>)}
            {!!draft.last.report.findings.length && <Button size="sm" variant="outline" onClick={() => copy(draft.last!.report.findings.map(f => '• ' + f.question).join('\n'))}>Kopieer klantvragen</Button>}
        </section>}
        {draft.decisions.length > 0 && <section className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="font-semibold">Gekozen offertetekst</h3>
            {draft.decisions.map((row, index) => <div key={row.topic} className="space-y-1">
                <div className="flex items-center justify-between gap-3"><label htmlFor={'scope-decision-' + index}>{kindLabel[row.kind]} · {row.topic}</label>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, decisions: draft.decisions.filter(d => d !== row) })}>Verwijder</Button></div>
                <Textarea id={'scope-decision-' + index} value={row.text} onChange={e => setDraft({ ...draft, decisions: draft.decisions.map(d => d === row ? { ...d, text: e.target.value } : d) })} />
            </div>)}
            <div className="flex flex-wrap gap-2">
                {onApply && <Button disabled={!decisions.length} onClick={() => { const message = onApply(decisions); setError(message || ''); }}>Overnemen in beschrijving</Button>}
                <Button variant="outline" disabled={!decisions.length} onClick={() => copy(decisions.map(d => kindLabel[d.kind] + ' — ' + d.text).join('\n'))}>Kopieer tekst</Button>
            </div>
        </section>}
        {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
        <p className="text-xs text-muted-foreground">De controle en je keuzes worden in deze browser bij deze offerte bewaard.</p>
    </div>;
}
