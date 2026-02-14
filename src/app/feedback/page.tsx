'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MessageCircle, Send } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Feedback" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function FeedbackPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [submittedState, setSubmittedState] = useState<{
    feedbackId: string | null;
    submittedAt: Date;
  } | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const submitFeedback = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Niet beschikbaar',
        description: 'Feedback kan alleen worden verzonden wanneer je bent ingelogd.',
      });
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      toast({
        variant: 'destructive',
        title: 'Bericht ontbreekt',
        description: 'Vul een bericht in.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();

      const response = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bericht: trimmed,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; feedbackId?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.message || 'Feedback kon niet worden verzonden.');
      }

      setMessage('');
      setSubmittedState({
        feedbackId: data?.feedbackId || null,
        submittedAt: new Date(),
      });
    } catch (error) {
      console.error('Feedback verzenden mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: error instanceof Error ? error.message : 'Feedback kon niet worden verzonden.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || !user) return <PageSkeleton />;

  const submittedAtText = submittedState
    ? new Intl.DateTimeFormat('nl-NL', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(submittedState.submittedAt)
    : null;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Feedback" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        {submittedState ? (
          <div className="w-full max-w-4xl rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              Feedback ontvangen
            </h2>
            <p className="mt-2 text-sm text-emerald-50/90">
              Bedankt voor je bericht. We hebben je feedback goed ontvangen en direct doorgestuurd naar ons
              supportteam. We beoordelen dit zo snel mogelijk.
            </p>
            <p className="mt-4 text-sm text-emerald-50/80">
              Ingediend op: {submittedAtText}
              {submittedState.feedbackId ? ` • Referentie: ${submittedState.feedbackId}` : ''}
            </p>

            <div className="mt-5">
              <Button
                variant="outline"
                className="border-emerald-300/40 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20"
                onClick={() => setSubmittedState(null)}
              >
                Nieuwe feedback sturen
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl rounded-xl border border-border/60 bg-card/40 p-6">
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <MessageCircle className="h-5 w-5 text-emerald-300" />
              Feedback
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deel verbeterpunten of bugs. Hoe concreter, hoe sneller we het kunnen oppakken.
            </p>

            <div className="mt-5 space-y-2">
              <Label htmlFor="feedback-message">Bericht</Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Wat werkt niet goed of wat kan beter?"
                className="min-h-[280px]"
              />
            </div>

            <Button
              className="mt-5"
              onClick={submitFeedback}
              disabled={isSaving || !message.trim()}
              variant="success"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Feedback verzenden
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
