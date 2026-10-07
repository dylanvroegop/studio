'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { AlertTriangle, Check, FileText, Headphones, Loader2, Save, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MEETING_ITEM_STATUSES, MEETING_SECTIONS, MEETING_STATUS_LABELS, formatMeetingTime, getConfirmedMeetingItems, meetingReportSchema, type MeetingDetail, type MeetingItem, type MeetingReport, type MeetingSection, type MeetingTranscriptSegment } from '@/lib/client-meetings';

interface MeetingReviewProps {
    user: User;
    detail: MeetingDetail;
    request: <T>(path: string, init?: RequestInit) => Promise<T>;
    onRefresh: (id?: string | null) => Promise<void>;
    onDirtyChange: (dirty: boolean) => void;
    onQuoteCreated: (url: string) => void;
}

interface LocalReviewDraft { report: MeetingReport; revision: number; expiresAt: number }

export function MeetingReview({ user, detail, request, onRefresh, onDirtyChange, onQuoteCreated }: MeetingReviewProps) {
    const { meeting, transcript, chunks } = detail;
    const { toast } = useToast();
    const [tab, setTab] = useState('description');
    const [report, setReport] = useState<MeetingReport | null>(detail.report);
    const [revision, setRevision] = useState(meeting.revision);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creatingQuote, setCreatingQuote] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [restorePrompt, setRestorePrompt] = useState(false);
    const [draftMessage, setDraftMessage] = useState('');
    const [query, setQuery] = useState('');
    const [normalizedInputs, setNormalizedInputs] = useState<Record<string, string>>({});
    const [activeSegment, setActiveSegment] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioLabel, setAudioLabel] = useState('');
    const [audioLoading, setAudioLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrls = useRef(new Map<number, string>());
    const audioAbort = useRef<AbortController | null>(null);
    const audioRequest = useRef(0);
    const audioStart = useRef(0);
    const audioEnd = useRef<number | null>(null);
    const initialized = useRef(false);
    const dirtyRef = useRef(false);
    const draftKey = `client-meeting-review:${user.uid}:${meeting.id}`;

    useEffect(() => {
        if (!initialized.current) {
            initialized.current = true;
            try {
                const stored = localStorage.getItem(draftKey);
                if (stored) {
                    const value = JSON.parse(stored) as LocalReviewDraft;
                    const parsed = meetingReportSchema.safeParse(value.report);
                    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
                        localStorage.removeItem(draftKey);
                    } else if (parsed.success && Number.isInteger(value.revision) && value.revision >= 0) {
                        setReport(parsed.data); setRevision(value.revision); setDirty(true); dirtyRef.current = true;
                        onDirtyChange(true);
                        setDraftMessage('Je niet-opgeslagen wijzigingen zijn hersteld van dit apparaat.');
                        return;
                    }
                }
            } catch { /* Beschikbare servergegevens blijven bruikbaar. */ }
        }
        if (!dirtyRef.current) { setReport(detail.report); setNormalizedInputs({}); setRevision(detail.meeting.revision); }
    }, [detail.report, detail.meeting.revision, draftKey, onDirtyChange]);

    useEffect(() => () => {
        audioAbort.current?.abort();
        audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
        audioUrls.current.clear();
    }, []);

    useEffect(() => {
        if (tab !== 'transcript' || !activeSegment) return;
        const frame = requestAnimationFrame(() => document.getElementById(`meeting-segment-${activeSegment}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return () => cancelAnimationFrame(frame);
    }, [activeSegment, tab]);

    const updateReport = (next: MeetingReport) => {
        setReport(next); setDirty(true); dirtyRef.current = true; onDirtyChange(true);
        try { localStorage.setItem(draftKey, JSON.stringify({ report: next, revision, expiresAt: meeting.expiresAt })); }
        catch { setDraftMessage('Lokale opslag is niet beschikbaar. Sla je wijzigingen op voordat je deze pagina sluit.'); }
    };

    const updateItem = (id: string, change: Partial<MeetingItem>, isReview = false) => {
        if (!report) return;
        const original = report.items.find((item) => item.id === id)?.measurement;
        if (change.measurement && original && (change.measurement.value !== original.value || change.measurement.unit !== original.unit || change.measurement.dimension !== original.dimension)) {
            setNormalizedInputs((current) => { const next = { ...current }; delete next[id]; return next; });
        }
        updateReport({ ...report, items: report.items.map((item) => item.id === id ? { ...item, ...change, reviewed: isReview ? change.reviewed === true : false } : item) });
    };

    const save = async (): Promise<number | null> => {
        if (!report) return null;
        if (!dirty) return revision;
        const checked = meetingReportSchema.safeParse(report);
        if (!checked.success) {
            toast({ title: 'Controleer je verslag', description: checked.error.issues[0]?.message || 'Een veld is niet geldig.', variant: 'destructive' });
            return null;
        }
        setSaving(true);
        try {
            const result = await request<{ meeting?: { revision: number }; revision?: number }>(`/${encodeURIComponent(meeting.id)}`, { method: 'PATCH', body: JSON.stringify({ report: checked.data, revision }) });
            const nextRevision = result.meeting?.revision ?? result.revision ?? revision + 1;
            setRevision(nextRevision); setDirty(false); dirtyRef.current = false; onDirtyChange(false); setDraftMessage('');
            try { localStorage.removeItem(draftKey); } catch { /* Serveropslag is voltooid. */ }
            await onRefresh(meeting.id);
            toast({ title: 'Verslag opgeslagen' });
            return nextRevision;
        } catch (cause) {
            toast({ title: 'Opslaan mislukt', description: cause instanceof Error ? cause.message : 'Probeer opnieuw.', variant: 'destructive' });
            return null;
        } finally { setSaving(false); }
    };

    const makeQuote = async () => {
        setCreatingQuote(true);
        try {
            const savedRevision = await save();
            if (savedRevision === null) return;
            const result = await request<{ quoteId: string; url: string }>(`/${encodeURIComponent(meeting.id)}/quote`, { method: 'POST', body: JSON.stringify({ revision: savedRevision }) });
            onQuoteCreated(result.url);
        } catch (cause) {
            toast({ title: 'Offerte maken mislukt', description: cause instanceof Error ? cause.message : 'Probeer opnieuw.', variant: 'destructive' });
        } finally { setCreatingQuote(false); }
    };

    const retry = async () => {
        setRetrying(true);
        try {
            await request(`/${encodeURIComponent(meeting.id)}/retry`, { method: 'POST' });
            await onRefresh(meeting.id);
        } catch (cause) {
            toast({ title: 'Opnieuw verwerken mislukt', description: cause instanceof Error ? cause.message : 'Probeer opnieuw.', variant: 'destructive' });
        } finally { setRetrying(false); }
    };

    const play = useCallback(async (index: number, segment?: MeetingTranscriptSegment) => {
        const chunk = chunks.find((item) => item.index === index);
        if (!chunk) return;
        audioRef.current?.pause();
        audioAbort.current?.abort();
        const controller = new AbortController();
        audioAbort.current = controller;
        const requestId = ++audioRequest.current;
        setAudioLoading(true);
        try {
            let url = audioUrls.current.get(index);
            if (!url) {
                const response = await fetch(`/api/client-meetings/${encodeURIComponent(meeting.id)}/chunks/${index}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('De opname kon niet worden geladen. Mogelijk is de bewaartermijn verlopen.');
                const blob = await response.blob();
                if (requestId !== audioRequest.current || controller.signal.aborted) return;
                url = URL.createObjectURL(blob);
                audioUrls.current.set(index, url);
            }
            if (requestId !== audioRequest.current || controller.signal.aborted) return;
            audioStart.current = segment ? Math.max(0, segment.startMs - chunk.startMs) / 1000 : 0;
            audioEnd.current = segment ? Math.max(audioStart.current, (segment.endMs - chunk.startMs) / 1000) : null;
            setAudioLabel(segment ? `Fragment ${formatMeetingTime(segment.startMs)} – ${formatMeetingTime(segment.endMs)}` : `Opname ${formatMeetingTime(chunk.startMs)} – ${formatMeetingTime(chunk.startMs + chunk.durationMs)}`);
            if (audioRef.current?.src === url) {
                audioRef.current.currentTime = audioStart.current;
                await audioRef.current.play().catch(() => undefined);
            } else setAudioUrl(url);
        } catch (cause) {
            if (!controller.signal.aborted) toast({ title: 'Afspelen mislukt', description: cause instanceof Error ? cause.message : 'Probeer opnieuw.', variant: 'destructive' });
        } finally { if (requestId === audioRequest.current) setAudioLoading(false); }
    }, [chunks, meeting.id, toast, user]);

    const groups = useMemo(() => Object.entries(MEETING_SECTIONS).map(([key, label]) => {
        const items = report?.items.filter((item) => item.section === key) || [];
        if (key === 'question' || key === 'risk') {
            const priority = { high: 0, normal: 1, low: 2 };
            items.sort((a, b) => priority[a.priority] - priority[b.priority]);
        }
        return { key: key as MeetingSection, label, items };
    }), [report]);
    const confirmedCount = report ? getConfirmedMeetingItems(report).length : 0;
    const hasConfirmedScope = report ? getConfirmedMeetingItems(report).some((item) => item.section === 'scope') : false;
    const checks = report?.items.filter((item) => ['question', 'risk'].includes(item.section) || ['uncertain', 'contradiction'].includes(item.status)) || [];
    const searchResults = transcript.filter((segment) => segment.text.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl')));
    const blocked = saving || creatingQuote;
    const isProcessing = ['queued', 'transcribing', 'analyzing'].includes(meeting.status);
    const remoteChanged = dirty && meeting.revision !== revision;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{meeting.title}</h2><p className="text-xs text-muted-foreground">{MEETING_STATUS_LABELS[meeting.status]} · {formatMeetingTime(meeting.durationMs)}{meeting.expiresAt ? ` · Bewaard tot ${new Date(meeting.expiresAt).toLocaleDateString('nl-NL')}` : ''}</p></div>{report && <Button size="sm" disabled={!dirty || blocked} onClick={() => { void save(); }}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : dirty ? <Save className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}{saving ? 'Opslaan…' : dirty ? 'Opslaan' : 'Opgeslagen'}</Button>}</div>
            {isProcessing && <div className="flex gap-2 rounded-lg border p-3 text-sm" role="status"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /><p>{MEETING_STATUS_LABELS[meeting.status]}{meeting.chunkCount > 0 ? ` · ${meeting.processedChunks}/${meeting.chunkCount} opnamedelen verwerkt` : ''}. Je kunt later terugkomen; de status wordt automatisch bijgewerkt.</p></div>}
            {meeting.status === 'recording' && <p className="rounded-lg border p-3 text-sm">De upload is nog niet afgerond. Gebruik de lokale opname bovenaan deze pagina om de upload te hervatten.</p>}
            {meeting.status === 'error' && <div className="space-y-2 rounded-lg border border-destructive/40 p-3"><p role="alert" className="text-sm">{meeting.error || 'De verwerking is onderbroken. Je geüploade opname blijft beschikbaar.'}</p><Button size="sm" variant="outline" disabled={retrying} onClick={() => { void retry(); }}>{retrying ? 'Opnieuw starten…' : 'Verwerking opnieuw proberen'}</Button></div>}
            {draftMessage && <p role="status" className="text-sm text-amber-500">{draftMessage}</p>}
            {remoteChanged && <p role="alert" className="text-sm text-amber-500">Dit verslag is intussen elders gewijzigd. Je eigen wijzigingen zijn behouden. Laad de laatste opgeslagen versie voordat je verdergaat.</p>}
            {dirty && <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setRestorePrompt(true)}>Laatste opgeslagen versie laden</Button>}
            {(report || transcript.length > 0 || chunks.length > 0) && <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid h-auto w-full grid-cols-3"><TabsTrigger className="px-1.5 py-2 text-xs sm:text-sm" value="description">Beschrijving</TabsTrigger><TabsTrigger className="px-1.5 py-2 text-xs sm:text-sm" value="project">Projectgegevens</TabsTrigger><TabsTrigger className="px-1.5 py-2 text-xs sm:text-sm" value="transcript">Transcript</TabsTrigger></TabsList>
                <TabsContent value="description" className="space-y-4">
                    {report ? <><div className="space-y-1.5"><Label htmlFor="meeting-project-name">Projectnaam</Label><Input id="meeting-project-name" value={report.projectName} maxLength={300} disabled={blocked} onChange={(event) => updateReport({ ...report, projectName: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="meeting-description">Projectbeschrijving</Label><Textarea id="meeting-description" rows={16} className="min-h-72 text-sm leading-relaxed" value={report.description} maxLength={40000} disabled={blocked} onChange={(event) => updateReport({ ...report, description: event.target.value })} /></div><p className="text-xs text-muted-foreground">AI-concept. Controleer maten, keuzes en afspraken bij Projectgegevens met de originele gespreksfragmenten.</p>{checks.length > 0 && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" />{checks.length} punten vragen controle</div><ul className="list-inside list-disc space-y-1 text-sm">{checks.slice(0, 6).map((item) => <li key={item.id}>{item.title}{item.basis === 'assessment' ? ' (AI-beoordeling)' : ''}</li>)}</ul><Button size="sm" variant="link" className="mt-2 h-auto p-0" onClick={() => setTab('project')}>Bekijk alle projectgegevens</Button></div>}</> : <p className="py-4 text-sm text-muted-foreground">De beschrijving verschijnt na de verwerking.</p>}
                </TabsContent>
                <TabsContent value="project" className="space-y-5">
                    {report ? <><p className="text-xs text-muted-foreground">Vink elk gegeven pas aan na controle. Na een wijziging moet je het opnieuw controleren. Alleen bevestigde, gecontroleerde gegevens met een gespreksbron gaan naar de offerte.</p>{groups.map((group) => <section key={group.key} className="space-y-2"><h3 className="border-b pb-1.5 text-sm font-semibold">{group.label}</h3>{!group.items.length ? <p className="text-xs text-muted-foreground">Niet vermeld in het gesprek.</p> : group.items.map((item) => <div key={item.id} className={cn('space-y-3 rounded-lg border p-3', ['uncertain', 'contradiction'].includes(item.status) && 'border-amber-500/40')}>
                        <div className="flex flex-wrap items-center justify-between gap-2"><Label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs" htmlFor={`review-${item.id}`}><Checkbox id={`review-${item.id}`} checked={item.reviewed} disabled={blocked} onCheckedChange={(value) => updateItem(item.id, { reviewed: value === true }, true)} />Gecontroleerd</Label><span className={cn('text-xs', item.basis === 'assessment' ? 'text-amber-500' : 'text-muted-foreground')}>{item.basis === 'assessment' ? 'AI-beoordeling · niet als feit overnemen' : 'Uit het gesprek'}{item.priority === 'high' ? ' · Hoge prioriteit' : ''}</span></div>
                        <Input aria-label={`Titel ${group.label}`} value={item.title} maxLength={300} disabled={blocked} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                        <Textarea aria-label={`Toelichting ${item.title}`} value={item.detail} rows={2} maxLength={4000} disabled={blocked} onChange={(event) => updateItem(item.id, { detail: event.target.value })} />
                        <Select value={item.status} disabled={blocked} onValueChange={(value: MeetingItem['status']) => updateItem(item.id, { status: value })}><SelectTrigger className="h-9" aria-label={`Status ${item.title}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MEETING_ITEM_STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                        {item.measurement && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{([['element', 'Onderdeel'], ['dimension', 'Maattype'], ['value', 'Oorspronkelijke maat'], ['unit', 'Eenheid'], ['normalizedValue', 'Omgerekende maat'], ['normalizedUnit', 'Omgerekende eenheid']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label className="text-xs" htmlFor={`${item.id}-${key}`}>{label}</Label><Input id={`${item.id}-${key}`} className="h-9" value={key === 'normalizedValue' ? normalizedInputs[item.id] ?? item.measurement?.normalizedValue ?? '' : item.measurement?.[key] ?? ''} disabled={blocked} inputMode={key === 'normalizedValue' ? 'decimal' : 'text'} onChange={(event) => { if (!item.measurement) return; const raw = event.target.value; const number = Number(raw.replace(',', '.')); if (key === 'normalizedValue') setNormalizedInputs((current) => ({ ...current, [item.id]: raw })); updateItem(item.id, { measurement: { ...item.measurement, ...(['value', 'unit', 'dimension'].includes(key) ? { normalizedValue: null, normalizedUnit: null } : {}), [key]: key === 'normalizedValue' ? raw.trim() && Number.isFinite(number) ? number : null : key === 'normalizedUnit' ? raw || null : raw } }); }} /></div>)}</div>}
                        {item.evidence.length > 0 && <div className="space-y-1 border-t pt-2">{item.evidence.map((source, index) => { const segment = transcript.find((entry) => entry.id === source.segmentId); return <button type="button" key={`${source.segmentId}-${index}`} className="block w-full rounded px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setQuery(''); setActiveSegment(source.segmentId); setTab('transcript'); }}><span className="font-medium text-emerald-500">Bron {segment ? formatMeetingTime(segment.startMs) : ''}</span> · “{source.quote}”</button>; })}</div>}
                    </div>)}</section>)}</> : <p className="py-4 text-sm text-muted-foreground">Projectgegevens verschijnen na de verwerking.</p>}
                </TabsContent>
                <TabsContent value="transcript" className="space-y-3">
                    <p className="text-xs text-muted-foreground">Origineel transcript. Controleer onduidelijke woorden en maten met de opname. Tijdcodes kunnen het hele opnamefragment aanduiden. Sprekers worden alleen getoond als het model ze onderscheidt; dezelfde sprekernaam kan per fragment iemand anders zijn.</p>
                    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Zoek in het transcript" aria-label="Zoek in het transcript" /></div>
                    {chunks.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-muted-foreground">Opname:</span>{chunks.map((chunk) => <Button key={chunk.index} variant="outline" size="sm" className="h-8 text-xs" onClick={() => { void play(chunk.index); }} disabled={audioLoading}><Headphones className="mr-1.5 h-3.5 w-3.5" />{formatMeetingTime(chunk.startMs)}</Button>)}</div>}
                    {audioLoading && <p role="status" className="text-xs text-muted-foreground">Opname laden…</p>}
                    {audioUrl && <div className="sticky top-2 z-10 rounded-lg border bg-card p-2"><p className="mb-1 text-xs">{audioLabel}</p><audio ref={audioRef} src={audioUrl} controls preload="metadata" className="h-10 w-full" onLoadedMetadata={() => { const audio = audioRef.current; if (audio) { audio.currentTime = audioStart.current; void audio.play().catch(() => undefined); } }} onTimeUpdate={() => { const audio = audioRef.current; if (audio && audioEnd.current !== null && audio.currentTime >= audioEnd.current) { audio.pause(); audioEnd.current = null; } }} /></div>}
                    <div className="space-y-1">{searchResults.length ? searchResults.map((segment) => <div key={segment.id} id={`meeting-segment-${segment.id}`} className={cn('scroll-mt-24 rounded-lg p-3', activeSegment === segment.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'bg-muted/30')}><div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{formatMeetingTime(segment.startMs)} – {formatMeetingTime(segment.endMs)}{segment.speaker ? ` · ${segment.speaker}` : ''}</span><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={audioLoading || !chunks.some((chunk) => chunk.index === segment.chunkIndex)} onClick={() => { setActiveSegment(segment.id); void play(segment.chunkIndex, segment); }}><Headphones className="mr-1 h-3.5 w-3.5" />Luister</Button></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{segment.text}</p></div>) : <p className="py-6 text-center text-sm text-muted-foreground">{query ? 'Geen fragmenten gevonden.' : 'Het transcript is nog niet beschikbaar.'}</p>}</div>
                </TabsContent>
            </Tabs>}
            {report && <div className="space-y-2 border-t pt-4"><p className="text-xs text-muted-foreground">{meeting.generatedQuoteId ? 'De gecontroleerde gegevens zijn al overgenomen. Latere wijzigingen in dit verslag worden niet opnieuw naar de offerte gekopieerd.' : `${confirmedCount} gecontroleerde, bevestigde gegevens worden overgenomen als offertenotities. Controleer ten minste één werkzaamheid. De vrije AI-beschrijving, voorstellen, onzekerheden en risico’s worden niet automatisch overgenomen.`}</p><Button disabled={blocked || (!meeting.generatedQuoteId && !hasConfirmedScope) || meeting.status !== 'ready' || remoteChanged} className="w-full sm:w-auto" onClick={() => { void makeQuote(); }}>{creatingQuote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}{meeting.generatedQuoteId ? 'Open offerte' : meeting.quoteId ? 'Overnemen in offerte' : 'Maak offerte van gecontroleerde gegevens'}</Button></div>}
            <AlertDialog open={restorePrompt} onOpenChange={setRestorePrompt}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Opgeslagen verslag laden?</AlertDialogTitle><AlertDialogDescription>Je lokale wijzigingen worden vervangen door de laatste opgeslagen versie.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => { setReport(detail.report); setNormalizedInputs({}); setRevision(meeting.revision); setDirty(false); dirtyRef.current = false; onDirtyChange(false); setDraftMessage(''); try { localStorage.removeItem(draftKey); } catch { /* Lokale opslag kan uitstaan. */ } }}>Opgeslagen versie laden</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
    );
}
