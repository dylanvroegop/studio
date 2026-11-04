'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, Mic, RefreshCw, Trash2 } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { deleteLocalMeeting } from '@/lib/client-meeting-local';
import { MEETING_STATUS_LABELS, type ClientMeeting, type MeetingDetail } from '@/lib/client-meetings';
import { MeetingRecorder } from './MeetingRecorder';
import { MeetingReview } from './MeetingReview';

interface ClientChoice { id: string; label: string }
interface QuoteChoice { id: string; clientId: string; label: string }
interface MeetingConfiguration { aiConfigured?: boolean; workerConfigured?: boolean; workerOnline?: boolean; retentionDays?: number }
interface MeetingListResponse { meetings: ClientMeeting[]; configuration: MeetingConfiguration }

function dateLabel(value?: string | number): string {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

export function ClientMeetingsPage() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();
    useEffect(() => {
        if (!isUserLoading && !user) router.replace('/login');
    }, [isUserLoading, router, user]);
    if (isUserLoading || !user) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" aria-label="Laden" /></div>;
    return <ClientMeetingsForUser key={user.uid} />;
}

function ClientMeetingsForUser() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [clients, setClients] = useState<ClientChoice[]>([]);
    const [quotes, setQuotes] = useState<QuoteChoice[]>([]);
    const [clientId, setClientId] = useState('');
    const [quoteId, setQuoteId] = useState('');
    const [title, setTitle] = useState('');
    const [meetings, setMeetings] = useState<ClientMeeting[]>([]);
    const [configuration, setConfiguration] = useState<MeetingConfiguration | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<MeetingDetail | null>(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState('');
    const [recordingBusy, setRecordingBusy] = useState(false);
    const [reviewDirty, setReviewDirty] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<{ href: string } | { meetingId: string } | null>(null);
    const [busyNavigation, setBusyNavigation] = useState(false);
    const selectedIdRef = useRef(selectedId);
    const detailRequestVersion = useRef(0);
    selectedIdRef.current = selectedId;

    const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
        if (!user) throw new Error('Log opnieuw in om je gesprekken te openen.');
        const response = await fetch(`/api/client-meetings${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Het gesprek kon niet worden geladen. Probeer opnieuw.');
        return body as T;
    }, [user]);

    useEffect(() => {
        if (!isUserLoading && !user) router.replace('/login');
    }, [isUserLoading, router, user]);

    useEffect(() => {
        if (!user) return;
        try {
            const prefix = `client-meeting-review:${user.uid}:`;
            for (const key of Object.keys(localStorage)) {
                if (!key.startsWith(prefix)) continue;
                try {
                    const draft = JSON.parse(localStorage.getItem(key) || '{}') as { expiresAt?: number };
                    if (!draft.expiresAt || draft.expiresAt <= Date.now()) localStorage.removeItem(key);
                } catch { localStorage.removeItem(key); }
            }
        } catch { /* Lokale opslag kan uitstaan; servergegevens blijven bereikbaar. */ }
    }, [user]);

    useEffect(() => {
        if (!user || !firestore) return;
        let cancelled = false;
        const loadChoices = async () => {
            const [clientResult, quoteResult] = await Promise.allSettled([
                getDocs(query(collection(firestore, 'clients'), where('userId', '==', user.uid))),
                getDocs(query(collection(firestore, 'quotes'), where('userId', '==', user.uid))),
            ]);
            if (cancelled) return;
            if (clientResult.status === 'fulfilled') {
                setClients(clientResult.value.docs.map((item) => {
                    const data = item.data();
                    return { id: item.id, label: String(data.bedrijfsnaam || [data.voornaam, data.achternaam].filter(Boolean).join(' ') || data.naam || 'Naam ontbreekt') };
                }).sort((a, b) => a.label.localeCompare(b.label, 'nl')));
            } else setError('De klantenlijst kon niet worden geladen. Vernieuw de pagina om opnieuw te proberen.');
            if (quoteResult.status === 'fulfilled') {
                setQuotes(quoteResult.value.docs.filter((item) => !item.data().archived && !item.data().isCalculationTest && !item.data().sentAt && ['concept', 'werkbespreking'].includes(String(item.data().status))).map((item) => {
                    const data = item.data();
                    return { id: item.id, clientId: String(data.klantinformatie?.klantId || data.klantinformatie?.clientId || data.clientId || data.klantId || data.klant?.id || data.client?.id || ''), label: `Offerte ${data.offerteNummer || 'zonder nummer'}${data.titel ? ` · ${data.titel}` : ''}` };
                }));
            }
        };
        void loadChoices();
        return () => { cancelled = true; };
    }, [firestore, user]);

    const refreshList = useCallback(async () => {
        const data = await request<MeetingListResponse>('');
        setMeetings(data.meetings || []);
        setConfiguration(data.configuration);
        setLoadingList(false);
    }, [request]);

    const refreshDetail = useCallback(async (id = selectedIdRef.current) => {
        if (!id) return;
        const version = ++detailRequestVersion.current;
        const data = await request<MeetingDetail>(`/${encodeURIComponent(id)}`);
        if (selectedIdRef.current === id && version === detailRequestVersion.current) setDetail(data);
    }, [request]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const refresh = async () => {
            try {
                const result = await request<MeetingListResponse>('');
                if (!cancelled) { setMeetings(result.meetings || []); setConfiguration(result.configuration); setLoadingList(false); }
            } catch (cause) {
                if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Gesprekken laden mislukt.'); setLoadingList(false); }
            }
        };
        void refresh();
        // Status wordt ook bijgewerkt wanneer de recorder geen actieve upload heeft.
        const interval = window.setInterval(() => { void refresh(); }, 10000);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, [request, user]);

    useEffect(() => {
        setDetail(null);
        setReviewDirty(false);
        if (!selectedId || !user) return;
        let cancelled = false;
        setLoadingDetail(true);
        const refresh = async () => {
            const version = ++detailRequestVersion.current;
            try {
                const result = await request<MeetingDetail>(`/${encodeURIComponent(selectedId)}`);
                if (!cancelled && version === detailRequestVersion.current) { setDetail(result); setLoadingDetail(false); }
            } catch (cause) {
                if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Gesprek laden mislukt.'); setLoadingDetail(false); }
            }
        };
        void refresh();
        const interval = window.setInterval(() => { void refresh(); }, 8000);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, [request, selectedId, user]);

    useEffect(() => {
        if (!reviewDirty && !recordingBusy) return;
        const interceptLink = (event: MouseEvent) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (recordingBusy) setBusyNavigation(true);
            else setPendingNavigation({ href: anchor.href });
        };
        document.addEventListener('click', interceptLink, true);
        return () => document.removeEventListener('click', interceptLink, true);
    }, [recordingBusy, reviewDirty]);

    const clientLabels = useMemo(() => new Map(clients.map((client) => [client.id, client.label])), [clients]);
    const chooseMeeting = (id: string) => {
        if (id === selectedId) return;
        if (reviewDirty) setPendingNavigation({ meetingId: id });
        else setSelectedId(id);
    };

    const deleteMeeting = async () => {
        if (!deleteId || !user) return;
        setDeleting(true);
        try {
            await request(`/${encodeURIComponent(deleteId)}`, { method: 'DELETE' });
            let localCleanupFailed = false;
            try { await deleteLocalMeeting(user.uid, deleteId); } catch { localCleanupFailed = true; }
            window.dispatchEvent(new CustomEvent('client-meeting-deleted', { detail: { id: deleteId } }));
            try { localStorage.removeItem(`client-meeting-review:${user.uid}:${deleteId}`); } catch { localCleanupFailed = true; }
            setMeetings((current) => current.filter((meeting) => meeting.id !== deleteId));
            if (selectedId === deleteId) { setReviewDirty(false); setSelectedId(null); }
            setDeleteId(null);
            toast({ title: 'Gesprek online verwijderd', description: localCleanupFailed ? 'Een lokale kopie kon niet worden verwijderd. Probeer dit bij de lokale opnamen bovenaan deze pagina opnieuw.' : undefined, variant: localCleanupFailed ? 'destructive' : 'default' });
        } catch (cause) {
            toast({ title: 'Verwijderen mislukt', description: cause instanceof Error ? cause.message : 'Probeer het opnieuw.', variant: 'destructive' });
        } finally { setDeleting(false); }
    };

    if (isUserLoading || !user) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" aria-label="Laden" /></div>;

    return (
        <main className="app-shell min-h-screen bg-background pb-16 md:pb-10">
            <AppNavigation />
            <DashboardHeader user={user} title="Klantgesprekken" />
            <div className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6">
                {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p>{error}</p><Button variant="ghost" size="sm" onClick={() => { setError(''); void refreshList().then(() => refreshDetail()).catch((cause: Error) => setError(cause.message)); }}>Opnieuw</Button></div>}
                <section className="rounded-xl border bg-card p-4">
                    <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Mic className="h-5 w-5 text-emerald-400" />Nieuw gesprek</h1>
                    {configuration && (configuration.aiConfigured === false || configuration.workerConfigured === false || configuration.workerOnline === false) && <p role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{configuration.aiConfigured === false ? 'De AI-verwerking is nog niet ingesteld.' : 'De achtergrondverwerking is nog niet verbonden.'} Je kunt lokaal opnemen en uploaden; het transcript volgt zodra de verwerking beschikbaar is.</p>}
                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5"><Label htmlFor="meeting-client">Klant</Label><Select value={clientId} disabled={recordingBusy} onValueChange={(value) => { setClientId(value); setQuoteId(''); }}><SelectTrigger id="meeting-client"><SelectValue placeholder="Kies een klant" /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.label}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-1.5"><Label htmlFor="meeting-title">Onderwerp</Label><Input id="meeting-title" maxLength={160} disabled={recordingBusy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Bijv. keukenfronten vervangen" /></div>
                        <div className="space-y-1.5"><Label htmlFor="meeting-quote">Offerte (optioneel)</Label><Select value={quoteId || 'none'} disabled={recordingBusy || !clientId} onValueChange={(value) => setQuoteId(value === 'none' ? '' : value)}><SelectTrigger id="meeting-quote"><SelectValue placeholder="Nieuwe offerte na controle" /></SelectTrigger><SelectContent><SelectItem value="none">Nieuwe offerte na controle</SelectItem>{quotes.filter((quote) => quote.clientId === clientId).map((quote) => <SelectItem key={quote.id} value={quote.id}>{quote.label}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    {!clients.length && !loadingList && <p className="mb-3 text-sm text-muted-foreground">Voeg eerst een klant toe via Klanten.</p>}
                    <MeetingRecorder key={user.uid} userId={user.uid} clientId={clientId} quoteId={quoteId || null} title={title} onBusyChange={setRecordingBusy} onUploaded={(id: string) => { void refreshList().catch(() => undefined); chooseMeeting(id); }} />
                </section>

                <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
                    <section className="overflow-hidden rounded-xl border bg-card">
                        <div className="flex items-center justify-between border-b px-3 py-2"><h2 className="font-semibold">Gesprekken</h2><Button size="icon" variant="ghost" aria-label="Gesprekken vernieuwen" onClick={() => { void refreshList().catch((cause: Error) => setError(cause.message)); }}><RefreshCw className="h-4 w-4" /></Button></div>
                        {loadingList ? <p className="p-4 text-sm text-muted-foreground">Gesprekken laden…</p> : !meetings.length ? <p className="p-4 text-sm text-muted-foreground">Je gesprekken verschijnen hier na de eerste upload.</p> : <div className="max-h-72 divide-y overflow-y-auto lg:max-h-[70vh]">{meetings.map((meeting) => <div key={meeting.id} className={cn('flex gap-1 p-2', selectedId === meeting.id && 'bg-emerald-500/10')}><button type="button" className="min-w-0 flex-1 rounded p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => chooseMeeting(meeting.id)} aria-pressed={selectedId === meeting.id}><span className="block truncate text-sm font-medium">{meeting.title || 'Klantgesprek'}</span><span className="block truncate text-xs text-muted-foreground">{clientLabels.get(meeting.clientId) || 'Klant'} · {dateLabel(meeting.createdAt)}</span><span className={cn('mt-1 block text-xs', meeting.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{MEETING_STATUS_LABELS[meeting.status] || meeting.status}</span></button><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={recordingBusy} aria-label={`Verwijder ${meeting.title || 'gesprek'}`} onClick={() => setDeleteId(meeting.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
                    </section>
                    <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4">
                        {loadingDetail && selectedId ? <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gesprek laden…</div> : detail ? <MeetingReview key={detail.meeting.id} user={user} detail={detail} request={request} onRefresh={refreshDetail} onDirtyChange={setReviewDirty} onQuoteCreated={(url) => router.push(url)} /> : <p className="py-8 text-center text-sm text-muted-foreground">Selecteer een gesprek om het verslag en transcript te bekijken.</p>}
                    </section>
                </div>
            </div>

            <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Gesprek verwijderen?</AlertDialogTitle><AlertDialogDescription>De opname, het transcript en het verslag worden verwijderd. Gegevens die al naar een offerte zijn overgenomen blijven daar staan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel><Button variant="destructive" disabled={deleting} onClick={() => { void deleteMeeting(); }}>{deleting ? 'Verwijderen…' : 'Verwijderen'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={(open) => { if (!open) setPendingNavigation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Wijzigingen nog niet opgeslagen</AlertDialogTitle><AlertDialogDescription>Sla je wijzigingen op voordat je verdergaat. Een lokaal concept blijft op dit apparaat bewaard als lokale opslag beschikbaar is.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Terug naar verslag</AlertDialogCancel><AlertDialogAction onClick={() => { const next = pendingNavigation; setPendingNavigation(null); setReviewDirty(false); if (next && 'meetingId' in next) setSelectedId(next.meetingId); else if (next) { const url = new URL(next.href, window.location.href); if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`); else window.location.assign(url.href); } }}>Verder zonder opslaan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <AlertDialog open={busyNavigation} onOpenChange={setBusyNavigation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Opname nog bezig</AlertDialogTitle><AlertDialogDescription>Stop de opname en wacht tot het opslaan klaar is voordat je deze pagina verlaat.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Terug naar opname</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </main>
    );
}
