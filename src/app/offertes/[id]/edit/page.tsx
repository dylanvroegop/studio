/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { useUser } from '@/firebase';

import { PersonalNotes } from '@/components/PersonalNotes';
import { WizardHeader } from '@/components/WizardHeader';

function PaginaLaden() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex items-center rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
        <svg
          className="mr-3 h-8 w-8 animate-spin text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Laden...
      </div>
    </div>
  );
}

export default function EditQuotePage() {
  const router = useRouter();
  const params = useParams();
  const { user, isUserLoading } = useUser();

  const quoteId = params.id as string;

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) return <PaginaLaden />;

  return (
    <main className="relative min-h-screen bg-background">
      {/* ✅ FORCE groen: CTA + radio (inner dot) + switch */}
      <style jsx global>{`
  }
  .oh-cta-green button[type='submit']:disabled {
    opacity: 0.6 !important;
  }

  /* RADIO — outer + inner dot */
  .oh-cta-green [role='radio'][data-state='checked'] {
    border-color: hsl(142 71% 45%) !important;
    color: hsl(142 71% 45%) !important;
  }

  /* SWITCH */
  .oh-cta-green button[role='switch'][data-state='checked'] {
    background-color: hsl(142 71% 45%) !important;
  }
`}</style>


      {/* ambience */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="absolute left-1/2 top-[-340px] h-[920px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-[-460px] top-[220px] h-[760px] w-[760px] rounded-full bg-muted/20 blur-3xl" />
        <div className="absolute right-[-520px] top-[420px] h-[820px] w-[820px] rounded-full bg-muted/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_60%)] opacity-70" />
      </div>

      <WizardHeader
        title="Offerte bewerken"
        backLink={`/offertes/${quoteId}`}
        progress={0}
        quoteId={quoteId}
        rightContent={<PersonalNotes quoteId={quoteId} context="Klantgegevens" />}
      />

      {/* CONTENT */}
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-3xl border bg-card/55 shadow-sm backdrop-blur-xl">
            <div className="oh-cta-green p-5 sm:p-6">
              <NewQuoteForm quoteId={quoteId} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
