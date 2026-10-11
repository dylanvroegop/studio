'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { pushRequest } from '@/lib/push-client';
import { safePushPath } from '@/lib/push-validation';

interface Message { id: string; title: string; body: string; url: string; createdAt: number }
function Messages(): JSX.Element {
  const { user, isUserLoading } = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const result = await pushRequest(user, `inbox${id ? `?id=${encodeURIComponent(id)}` : ''}`);
      setMessages(result.messages as Message[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Meldingen ophalen mislukt.'); }
    finally { setBusy(false); }
  }, [user, id]);
  useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [user, isUserLoading, router]);
  useEffect(() => { void load(); }, [load]);
  return <div className="app-shell min-h-screen bg-background pb-20">
    <AppNavigation /><DashboardHeader user={user} title="Meldingen" />
    <main className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {id && <Button asChild variant="outline"><Link href="/meldingen">Alle meldingen</Link></Button>}
        <Button variant="outline" disabled={busy} onClick={load}>Vernieuwen</Button>
        <Button asChild variant="outline"><Link href="/instellingen?tab=meldingen">Meldingen instellen</Link></Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy && <p role="status" className="text-sm text-muted-foreground">Laden…</p>}
      {!busy && !error && !messages.length && <p className="text-sm text-muted-foreground">Nog geen meldingen.</p>}
      {!busy && !error && messages.map(message => <article key={message.id} className="rounded-lg border border-border p-4 space-y-3">
        <div><h2 className="font-semibold">{message.title}</h2><p className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}</p></div>
        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href={safePushPath(message.url)}>Open bijbehorende pagina</Link></Button>
          <Button size="sm" variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(message.body); setCopied(message.id); }
            catch { setError('Kopiëren lukt niet. Houd de tekst ingedrukt om deze te selecteren.'); }
          }}>{copied === message.id ? 'Gekopieerd' : 'Tekst kopiëren'}</Button>
        </div>
      </article>)}
    </main>
  </div>;
}
export default function MessagesPage(): JSX.Element {
  return <Suspense fallback={<p className="p-4">Meldingen laden…</p>}><Messages /></Suspense>;
}
