'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Loader2, MessageCircle, Send } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cleanFirestoreData } from '@/lib/clean-firestore';

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
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  const submitFeedback = async () => {
    if (!user || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Niet beschikbaar',
        description: 'Feedback kan alleen worden verzonden wanneer je bent ingelogd.',
      });
      return;
    }

    const trimmed = message.trim();
    if (trimmed.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Feedback te kort',
        description: 'Omschrijf je feedback iets uitgebreider.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = cleanFirestoreData({
        userId: user.uid,
        bericht: trimmed,
        bron: 'feedback_page',
        status: 'nieuw',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(firestore, 'support_feedback'), payload);
      setMessage('');
      toast({
        title: 'Feedback verzonden',
        description: 'Bedankt, je feedback is ontvangen.',
      });
    } catch (error) {
      console.error('Feedback verzenden mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Feedback kon niet worden verzonden.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || !user) return <PageSkeleton />;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Feedback" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
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
            disabled={isSaving || message.trim().length < 6}
            variant="success"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Feedback verzenden
          </Button>
        </div>
      </main>
    </div>
  );
}

