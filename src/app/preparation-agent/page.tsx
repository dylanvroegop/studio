'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { PreparationInput } from '@/components/preparation/PreparationInput';
import { PreparationResult, type PreparationResultData } from '@/components/preparation/PreparationResult';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Preparation Agent" />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <div className="rounded-2xl border border-border/70 bg-card/30 p-6 text-sm text-muted-foreground">
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function PreparationAgentPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreparationResultData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, router, user]);

  const handleGenerate = async () => {
    if (!user) {
      toast({
        title: 'Niet ingelogd',
        description: 'Log opnieuw in en probeer daarna nogmaals.',
        variant: 'destructive',
      });
      return;
    }

    if (!input.trim() && !file) {
      toast({
        title: 'Input ontbreekt',
        description: 'Voeg tekst toe of upload een screenshot.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('input', input.trim());
      if (file) {
        formData.append('file', file);
      }

      const response = await fetch('/api/preparation-agent/generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        message?: string;
        preparation?: PreparationResultData;
      } | null;

      if (!response.ok || !payload?.ok || !payload.preparation) {
        throw new Error(payload?.message || 'Kon voorbereiding niet genereren.');
      }

      setResult(payload.preparation);
      toast({
        title: 'Voorbereiding klaar',
        description: 'De intake-voorbereiding is gegenereerd.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout tijdens genereren.';
      toast({
        title: 'Genereren mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isUserLoading || !user) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Preparation Agent" />

      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-2">
        <PreparationInput
          value={input}
          file={file}
          isLoading={isLoading}
          onValueChange={setInput}
          onFileChange={setFile}
          onSubmit={handleGenerate}
        />
        <PreparationResult result={result} />
      </main>
    </div>
  );
}
