'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, ImagePlus, Inbox, Loader2, Plus, RefreshCw, Save, Search, X } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { EMPTY_INTAKE_CLIENT, intakeClientSchema, type IntakeClient, type IntakeSession } from '@/lib/client-intake';
import { cn } from '@/lib/utils';

interface IntakeConfiguration { aiConfigured: boolean; workerOnline?: boolean }
interface ListResponse { sessions: IntakeSession[]; configuration: IntakeConfiguration }
interface Draft { id: string; revision?: number; client: IntakeClient; text: string; sourceRead?: boolean; savedAt: number }
interface Attachment { file: File; preview: string }
type Navigation = { id: string } | { href: string } | { new: true };
const MAX_BYTES = 12 * 1024 * 1024;

function dateLabel(value: number): string {
    return new Date(value).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(session: IntakeSession): string {
    if (session.state === 'error') return 'Verwerking mislukt';
    if (session.state === 'processing') return 'Wordt verwerkt';
    if (session.state === 'draft') return 'Concept';
    if (session.result?.appointment_status === 'scheduled') return 'Afspraak bevestigd';
    if (session.result?.appointment_status === 'completed') return 'Afspraak afgerond';
    if (session.result?.appointment_status === 'cancelled') return 'Afspraak geannuleerd';
    if (session.result?.appointment_status === 'pending') return 'Voorstel gereserveerd';
    return 'Opgeslagen';
}

export function ClientIntakePage() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();
    useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [isUserLoading, router, user]);
    if (isUserLoading || !user) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" aria-label="Laden" /></div>;
    return <ClientIntakeForUser key={user.uid} />;
}

function ClientIntakeForUser() {
    const { user } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const [sessions, setSessions] = useState<IntakeSession[]>([]);
    const [configuration, setConfiguration] = useState<IntakeConfiguration | null>(null);
    const [id, setId] = useState(() => crypto.randomUUID() as string);
    const [revision, setRevision] = useState<number | undefined>();
    const [client, setClient] = useState<IntakeClient>({ ...EMPTY_INTAKE_CLIENT });
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [dirty, setDirty] = useState(false);
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<'extract' | 'save' | 'process' | null>(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<Navigation | null>(null);
    const [busyNavigation, setBusyNavigation] = useState(false);
    const [draftRestored, setDraftRestored] = useState(false);
    const [sourceRead, setSourceRead] = useState(false);
    const [conflictSession, setConflictSession] = useState<IntakeSession | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const attachmentsRef = useRef(attachments);
    const operation = useRef(0);
    const listVersion = useRef(0);
    const draftKey = `client-intake-draft:${user!.uid}`;
    attachmentsRef.current = attachments;
    const selected = sessions.find(session => session.id === id);
    const locked = Boolean(busy) || !ready;
    const sourcePending = Boolean((text.trim() || attachments.length) && !sourceRead);

    const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
        if (!user) throw new Error('Log opnieuw in om je aanvragen te openen.');
        const response = await fetch(`/api/client-intake${path}`, {
            ...init, headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...init.headers }, cache: 'no-store',
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            const failure = new Error(body?.error || 'Het verzoek is mislukt. Probeer het opnieuw.') as Error & { session?: IntakeSession; code?: string };
            failure.session = body?.session;
            failure.code = body?.code;
            throw failure;
        }
        return body as T;
    }, [user]);

    const clearAttachments = useCallback(() => {
        for (const attachment of attachmentsRef.current) URL.revokeObjectURL(attachment.preview);
        attachmentsRef.current = [];
        setAttachments([]);
    }, []);

    const showSession = useCallback((session: IntakeSession) => {
        operation.current++;
        setId(session.id); setRevision(session.revision); setClient({ ...session.client });
        setText(''); setDirty(false); setError(session.error || ''); setCopied(false); setDraftRestored(false); setConflictSession(null); setSourceRead(false);
        clearAttachments();
    }, [clearAttachments]);

    const refreshList = useCallback(async () => {
        const version = ++listVersion.current;
        const result = await request<ListResponse>('');
        if (version === listVersion.current) { setSessions(result.sessions); setConfiguration(result.configuration); }
        return result;
    }, [request]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            let restored = false;
            try {
                const raw = localStorage.getItem(draftKey);
                const draft = raw ? JSON.parse(raw) as Draft : null;
                if (draft && typeof draft.id === 'string' && Date.now() - draft.savedAt < 30 * 86400_000) {
                    const parsed = intakeClientSchema.safeParse(draft.client);
                    if (parsed.success) {
                        setId(draft.id); setRevision(draft.revision); setClient(parsed.data); setText(draft.text || '');
                        setSourceRead(draft.sourceRead === true);
                        setDirty(true); setDraftRestored(true); restored = true;
                    }
                }
            } catch { /* Opslaan op de server blijft beschikbaar als lokale opslag uitstaat. */ }
            try {
                const result = await refreshList();
                if (cancelled) return;
                const requested = new URLSearchParams(window.location.search).get('id');
                const existing = result.sessions.find(session => session.id === requested);
                if (existing && !restored) showSession(existing);
            } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Aanvragen laden mislukt.'); }
            finally { if (!cancelled) { setLoading(false); setReady(true); } }
        };
        void load();
        const operationRef = operation;
        const versionRef = listVersion;
        return () => { cancelled = true; operationRef.current++; versionRef.current++; };
    }, [draftKey, refreshList, showSession]);

    useEffect(() => {
        if (!ready) return;
        try {
            if (dirty || text.trim()) localStorage.setItem(draftKey, JSON.stringify({ id, revision, client, text, sourceRead, savedAt: Date.now() } satisfies Draft));
            else localStorage.removeItem(draftKey);
        } catch { /* Geen browsermelding nodig; expliciet opslaan blijft mogelijk. */ }
    }, [client, dirty, draftKey, id, ready, revision, sourceRead, text]);

    useEffect(() => () => { for (const attachment of attachmentsRef.current) URL.revokeObjectURL(attachment.preview); }, []);

    useEffect(() => {
        if (!dirty && !busy && !attachments.length) return;
        const interceptLink = (event: MouseEvent) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (busy) setBusyNavigation(true);
            else setPendingNavigation({ href: anchor.href });
        };
        document.addEventListener('click', interceptLink, true);
        return () => document.removeEventListener('click', interceptLink, true);
    }, [attachments.length, busy, dirty]);

    const navigate = (next: Navigation) => {
        if ('id' in next) {
            const session = sessions.find(item => item.id === next.id);
            if (session) showSession(session);
        } else if ('new' in next) {
            operation.current++; setId(crypto.randomUUID()); setRevision(undefined); setClient({ ...EMPTY_INTAKE_CLIENT });
            setText(''); clearAttachments(); setDirty(false); setError(''); setDraftRestored(false); setCopied(false); setSourceRead(false); setConflictSession(null);
        } else {
            const url = new URL(next.href, window.location.href);
            setDirty(false);
            try { localStorage.removeItem(draftKey); } catch { /* Optionele lokale opslag. */ }
            if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
            else window.location.assign(url.href);
        }
    };

    const choose = (next: Navigation) => {
        if (locked || ('id' in next && next.id === id)) return;
        if (dirty || attachments.length) setPendingNavigation(next);
        else navigate(next);
    };

    const addFiles = (files: File[]) => {
        if (locked) return;
        const mimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
        const supported = files.filter(file => /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
            .map(file => /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) ? file : new File([file], file.name, { type: mimeByExtension[file.name.split('.').pop()!.toLowerCase()], lastModified: file.lastModified }));
        if (supported.length !== files.length) { setError('Gebruik PNG-, JPG-, WebP- of HEIC-afbeeldingen.'); return; }
        if (supported.length + attachments.length > 4) { setError('Voeg maximaal vier afbeeldingen per keer toe.'); return; }
        if ([...attachments.map(item => item.file), ...supported].reduce((total, file) => total + file.size, 0) > MAX_BYTES) {
            setError('De afbeeldingen mogen samen maximaal 12 MB zijn.'); return;
        }
        setAttachments(previous => [...previous, ...supported.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
        setError(''); setSourceRead(false);
    };

    const updateField = (field: keyof IntakeClient, value: string) => {
        setClient(previous => ({ ...previous, [field]: value || null,
            ...((field === 'appointment_date' || field === 'appointment_time') && previous[field] !== value && previous.appointment_status === 'confirmed' ? { appointment_status: 'pending' as const } : {}),
        })); setDirty(true); setCopied(false);
    };

    const extract = async () => {
        if (locked || (!attachments.length && !text.trim())) return;
        const version = ++operation.current;
        setBusy('extract'); setError('');
        try {
            const form = new FormData();
            for (const attachment of attachments) form.append('files', attachment.file);
            form.append('text', text); form.append('current', JSON.stringify(client));
            const result = await request<{ client: IntakeClient }>('/extract', { method: 'POST', body: form });
            if (version !== operation.current) return;
            setClient(result.client); setDirty(true); setCopied(false); setSourceRead(true);
            toast({ title: 'Gegevens uitgelezen', description: 'Controleer de klantgegevens en afspraak voordat je verwerkt.' });
        } catch (cause) { if (version === operation.current) setError(cause instanceof Error ? cause.message : 'Uitlezen mislukt.'); }
        finally { if (version === operation.current) setBusy(null); }
    };

    const storeSession = (session: IntakeSession, updateRevision = true) => {
        setSessions(previous => [session, ...previous.filter(item => item.id !== session.id)].sort((a, b) => b.updatedAt - a.updatedAt));
        if (updateRevision) setRevision(session.revision);
    };

    const save = async (action: 'save' | 'process') => {
        if (locked || sourcePending || conflictSession) return;
        const version = ++operation.current;
        setBusy(action); setError('');
        try {
            const result = await request<{ session: IntakeSession }>('', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revision, client, action }),
            });
            if (version !== operation.current) return;
            storeSession(result.session); setClient({ ...result.session.client }); setDirty(false); setDraftRestored(false); setCopied(false);
            clearAttachments(); setText(''); setSourceRead(false);
            setError(result.session.error || '');
            toast({ title: action === 'save' ? 'Concept opgeslagen' : 'Aanvraag verwerkt' });
        } catch (cause) {
            if (version !== operation.current) return;
            const failure = cause as Error & { session?: IntakeSession; code?: string };
            // De server kan al een klant of afspraak hebben opgeslagen. Bewaar de sessie voor een veilige herhaling.
            if (failure.session) {
                const isConflict = failure.session.id !== id || ['REVISION_CONFLICT', 'EXISTING_INTAKE', 'PROCESSING'].includes(failure.code || '');
                storeSession(failure.session, !isConflict);
                if (isConflict) setConflictSession(failure.session);
            }
            setError(failure.message || 'Opslaan mislukt. Je invoer blijft staan.');
        } finally { if (version === operation.current) setBusy(null); }
    };

    const filteredSessions = useMemo(() => {
        const needle = query.toLocaleLowerCase('nl-NL').trim();
        return sessions.filter(session => !needle || [session.client.client_name, session.client.city, session.client.phone, session.client.email, session.client.job_title].join(' ').toLocaleLowerCase('nl-NL').includes(needle));
    }, [query, sessions]);
    const message = selected?.result?.telegram_message;
    const formFields: Array<{ field: keyof IntakeClient; label: string; type?: string; autoComplete?: string }> = [
        { field: 'client_name', label: 'Klantnaam', autoComplete: 'name' },
        { field: 'phone', label: 'Telefoon', type: 'tel', autoComplete: 'tel' },
        { field: 'email', label: 'E-mailadres', type: 'email', autoComplete: 'email' },
        { field: 'address', label: 'Straat en huisnummer', autoComplete: 'street-address' },
        { field: 'city', label: 'Woonplaats', autoComplete: 'address-level2' },
        { field: 'job_title', label: 'Klus' },
    ];

    return (
        <main className="app-shell min-h-screen bg-background pb-16 md:pb-10">
            <AppNavigation />
            <DashboardHeader user={user} title="Aanvragen" />
            <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="flex items-center gap-2 text-lg font-semibold"><Inbox className="h-5 w-5 text-sky-400" />Aanvragen</h1>
                    <Button size="sm" onClick={() => choose({ new: true })} disabled={locked}><Plus className="mr-1.5 h-4 w-4" />Nieuwe aanvraag</Button>
                </div>
                {configuration?.workerOnline === false && <p role="status" className="text-sm text-amber-500">Opvolgherinneringen staan klaar, maar de automatische verzending is momenteel niet actief.</p>}
                <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
                    <section className="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label="Opgeslagen aanvragen">
                        <div className="flex items-center justify-between border-b px-3 py-2"><h2 className="text-sm font-semibold">Aanvragen ({sessions.length})</h2><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aanvragen vernieuwen" disabled={locked || loading} onClick={() => { setLoading(true); void refreshList().then(result => { const current = result.sessions.find(session => session.id === id); if (current && !dirty && !attachments.length) showSession(current); }).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false)); }}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button></div>
                        <div className="relative border-b p-2"><Search className="absolute left-4 top-5 h-4 w-4 text-muted-foreground" /><Input aria-label="Zoek aanvragen" value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek klant of klus" className="pl-8 text-base md:text-sm" /></div>
                        <div className="max-h-52 divide-y overflow-y-auto lg:max-h-[72vh]">
                            {loading && !sessions.length ? <p className="p-3 text-sm text-muted-foreground">Aanvragen laden…</p> : !filteredSessions.length ? <p className="p-3 text-sm text-muted-foreground">{query ? 'Geen aanvragen gevonden.' : 'Nog geen opgeslagen aanvragen.'}</p> : filteredSessions.map(session => (
                                <button key={session.id} type="button" disabled={locked} aria-pressed={id === session.id} onClick={() => choose({ id: session.id })} className={cn('block w-full px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60', id === session.id && 'bg-sky-500/10')}>
                                    <span className="block truncate text-sm font-medium">{session.client.client_name || 'Naam nog onbekend'}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{[session.client.job_title, session.client.city].filter(Boolean).join(' · ') || 'Nieuwe aanvraag'}</span>
                                    <span className={cn('mt-1 block text-xs', session.state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{statusLabel(session)} · {dateLabel(session.updatedAt)}</span>
                                    {session.reminderDueAt && session.reminderDueAt <= Date.now() && !session.reminderSentAt && <span className="mt-1 block text-xs text-amber-500">Opvolging nodig</span>}
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="min-w-0 space-y-4">
                        {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="whitespace-pre-wrap break-words">{error}</p>{conflictSession && <Button className="mt-2" variant="outline" size="sm" onClick={() => setPendingNavigation({ id: conflictSession.id })}>Actuele aanvraag openen</Button>}</div>}
                        {draftRestored && <p role="status" className="text-sm text-muted-foreground">Je niet-opgeslagen invoer is hersteld. Voeg eventuele afbeeldingen opnieuw toe.</p>}
                        <section className="rounded-lg border bg-card p-3 sm:p-4" onPaste={event => {
                            const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
                            if (files.length) { event.preventDefault(); addFiles(files); }
                        }}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{selected ? 'Aanvraag aanvullen' : 'Nieuwe aanvraag'}</h2>{selected && <span className="text-xs text-muted-foreground">{statusLabel(selected)}</span>}</div>
                            <p className="mb-3 text-sm text-muted-foreground">Voeg screenshots of tekst van deze klant toe, of vul de gegevens hieronder in.</p>
                            <div className="rounded-md border border-dashed p-3" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }}>
                                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" multiple className="sr-only" tabIndex={-1} aria-label="Screenshots toevoegen" disabled={locked} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
                                <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={locked} onClick={() => fileInput.current?.click()}><ImagePlus className="mr-1.5 h-4 w-4" />Afbeeldingen toevoegen</Button><span className="text-xs text-muted-foreground">Of plak/sleep hier · max. 4 / 12 MB</span></div>
                                {attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment, index) => <div key={attachment.preview} className="relative w-24 overflow-hidden rounded border">
                                    {/* Afbeeldingen zijn uitsluitend lokale previews van de gekozen bestanden. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={attachment.preview} alt={`Screenshot ${index + 1}`} className="h-20 w-full object-contain bg-muted" />
                                    <span className="block truncate px-1 py-1 text-[10px]" title={attachment.file.name}>{attachment.file.name}</span>
                                    <Button variant="secondary" size="icon" className="absolute right-0.5 top-0.5 h-6 w-6" disabled={locked} aria-label={`Verwijder screenshot ${index + 1}`} onClick={() => { URL.revokeObjectURL(attachment.preview); setAttachments(previous => previous.filter(item => item !== attachment)); }}><X className="h-3.5 w-3.5" /></Button>
                                </div>)}</div>}
                            </div>
                            <div className="mt-3 space-y-1.5"><Label htmlFor="intake-text">Bericht of aanvullende informatie</Label><Textarea id="intake-text" rows={3} maxLength={20000} value={text} disabled={locked} onChange={event => { setText(event.target.value); setDirty(true); setSourceRead(false); }} placeholder="Plak hier het gesprek of een aanvulling van deze klant…" className="text-base md:text-sm" /></div>
                            <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" disabled={locked || (!attachments.length && !text.trim()) || configuration?.aiConfigured === false} onClick={() => { void extract(); }}>{busy === 'extract' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Gegevens uitlezen</Button>{configuration?.aiConfigured === false && <span className="text-xs text-muted-foreground">Uitlezen is nog niet ingesteld. Handmatig invullen kan wel.</span>}</div>
                        </section>

                        <section className="rounded-lg border bg-card p-3 sm:p-4">
                            <h2 className="mb-3 font-semibold">Klant en afspraak</h2>
                            <div className="grid gap-3 sm:grid-cols-2">{formFields.map(({ field, label, type, autoComplete }) => <div key={field} className="min-w-0 space-y-1.5"><Label htmlFor={`intake-${field}`}>{label}</Label><Input id={`intake-${field}`} type={type || 'text'} autoComplete={autoComplete || 'off'} maxLength={field === 'email' ? 320 : 500} value={client[field] || ''} disabled={locked} onChange={event => updateField(field, event.target.value)} className="min-w-0 text-base md:text-sm" /></div>)}</div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="min-w-0 space-y-1.5"><Label htmlFor="intake-status">Afspraakstatus</Label><Select value={client.appointment_status} disabled={locked} onValueChange={value => updateField('appointment_status', value)}><SelectTrigger id="intake-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_found">Nog geen afspraak</SelectItem><SelectItem value="pending">Voorstel</SelectItem><SelectItem value="confirmed">Door klant bevestigd</SelectItem></SelectContent></Select></div>
                                <div className="min-w-0 space-y-1.5"><Label htmlFor="intake-date">Datum</Label><Input id="intake-date" type="date" value={client.appointment_date || ''} disabled={locked} onChange={event => updateField('appointment_date', event.target.value)} className="min-w-0 text-base md:text-sm" /></div>
                                <div className="min-w-0 space-y-1.5"><Label htmlFor="intake-time">Tijd</Label><Input id="intake-time" type="time" value={client.appointment_time || ''} disabled={locked} onChange={event => updateField('appointment_time', event.target.value)} className="min-w-0 text-base md:text-sm" /></div>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">Bij verwerken wordt een vrij moment gereserveerd in Google Agenda. Kies alleen ‘Door klant bevestigd’ als de klant akkoord is.</p>
                            {client.appointment_evidence && <div className="mt-3 space-y-1.5"><Label htmlFor="intake-evidence">Gelezen afspraaktekst</Label><Textarea id="intake-evidence" rows={2} maxLength={4000} value={client.appointment_evidence} disabled={locked} onChange={event => updateField('appointment_evidence', event.target.value)} className="text-base md:text-sm" /></div>}
                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"><Button disabled={locked || sourcePending || Boolean(conflictSession)} onClick={() => { void save('process'); }}>{busy === 'process' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}{selected?.state === 'error' ? 'Opnieuw verwerken' : 'Verwerken'}</Button><Button variant="outline" disabled={locked || sourcePending || Boolean(conflictSession)} onClick={() => { void save('save'); }}>{busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Concept opslaan</Button>{dirty && <span className="text-xs text-muted-foreground">Nog niet opgeslagen</span>}</div>
                            {sourcePending && <p className="mt-2 text-xs text-muted-foreground">Lees de toegevoegde tekst en afbeeldingen eerst uit, of verwijder ze om handmatig verder te gaan.</p>}
                            {selected?.result && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><Link href={`/offertes/${selected.result.project_id}`} className="underline underline-offset-4">Offerte openen</Link><Link href="/planning" className="underline underline-offset-4">Planning openen</Link>{selected.result.appointment_date && <span className="text-muted-foreground">Laatste afspraak: {selected.result.appointment_date.split('-').reverse().join('-')} {selected.result.appointment_time}</span>}</div>}
                        </section>

                        {message && <section className="rounded-lg border bg-card p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Bericht voor de klant</h2><Button size="sm" variant="outline" disabled={dirty || Boolean(busy) || sourcePending || selected?.state !== 'done'} onClick={() => { void navigator.clipboard.writeText(message).then(() => { setCopied(true); toast({ title: 'Bericht gekopieerd' }); }).catch(() => setError('Kopiëren is niet gelukt. Selecteer en kopieer de tekst hieronder.')); }}>{copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}{copied ? 'Gekopieerd' : 'Kopiëren'}</Button></div><p className="select-text whitespace-pre-wrap break-words text-sm">{message}</p>{(dirty || selected?.state !== 'done' || sourcePending) && <p className="mt-3 text-xs text-amber-500">Verwerk de aanvraag om dit bericht bij te werken.</p>}</section>}
                    </div>
                </div>
            </div>
            <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={open => { if (!open) setPendingNavigation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Wijzigingen nog niet opgeslagen</AlertDialogTitle><AlertDialogDescription>Je huidige invoer en toegevoegde afbeeldingen worden vervangen. Sla eerst een concept op als je deze wilt bewaren.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Terug naar aanvraag</AlertDialogCancel><AlertDialogAction onClick={() => { const next = pendingNavigation; setPendingNavigation(null); if (next) navigate(next); }}>Verder zonder opslaan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <AlertDialog open={busyNavigation} onOpenChange={setBusyNavigation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Verwerking bezig</AlertDialogTitle><AlertDialogDescription>Wacht tot de verwerking klaar is voordat je deze pagina verlaat.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Terug naar aanvraag</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </main>
    );
}
