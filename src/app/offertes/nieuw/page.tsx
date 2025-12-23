'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NewQuoteForm } from '@/components/new-quote-form-wrapper';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';

function PaginaLaden() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="rounded-3xl border bg-card/50 p-8 text-center text-muted-foreground shadow-sm backdrop-blur-xl flex items-center">
        <svg
          className="animate-spin -ml-1 mr-3 h-8 w-8 text-primary"
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

function StapPunt({
  index,
  label,
  actief,
  klaar,
}: {
  index: number;
  label: string;
  actief?: boolean;
  klaar?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1',
          actief
            ? 'bg-primary/12 ring-primary/30 text-primary'
            : klaar
              ? 'bg-primary/10 ring-primary/20 text-primary'
              : 'bg-muted/35 ring-border text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {klaar ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{index}</span>}
      </div>
      <div className={cn('truncate text-xs', actief ? 'text-foreground/90' : 'text-muted-foreground')}>
        {label}
      </div>
    </div>
  );
}

export default function NewQuotePage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  const totaalStappen = 6;
  const huidigeStap = 1;
  const progressValue = (huidigeStap / totaalStappen) * 100;

  if (isUserLoading || !user) return <PaginaLaden />;

  return (
    <main className="relative min-h-screen bg-background">
      {/* Forceer CTA (submit) groen binnen deze pagina */}
      <style jsx global>{`
        .oh-cta-green button[type='submit'] {
          background-color: hsl(142 71% 45%) !important;
          color: white !important;
          border-color: transparent !important;
        }
        .oh-cta-green button[type='submit']:hover {
          background-color: hsl(142 71% 40%) !important;
        }
        .oh-cta-green button[type='submit']:disabled {
          opacity: 0.6 !important;
        }
      `}</style>

      {/* ambience zoals landing */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="absolute left-1/2 top-[-340px] h-[920px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-[-460px] top-[220px] h-[760px] w-[760px] rounded-full bg-muted/20 blur-3xl" />
        <div className="absolute right-[-520px] top-[420px] h-[820px] w-[820px] rounded-full bg-muted/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_60%)] opacity-70" />
      </div>

      {/* TOP BAR: NIET sticky/fixed -> scrollt weg */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-xl">
              <Link href="/landing">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>

            <div className="min-w-0 flex-1 text-center">
              <div className="text-sm font-semibold text-foreground/90 leading-5">Nieuwe offerte</div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40 ring-1 ring-border">
                <div
                  className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
                  style={{ width: `${progressValue}%` }}
                  aria-hidden="true"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                <StapPunt index={1} label="Klant" actief />
                <StapPunt index={2} label="Klus" />
                <StapPunt index={3} label="Maten" />
                <StapPunt index={4} label="Materialen" />
              </div>
            </div>

            <div className="h-9 w-9" aria-hidden="true" />
          </div>
        </div>
      </header>

      {/* Content: GEEN extra "Klantinformatie" header hier.
          Alleen de form zelf mag die titel tonen. */}
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-3xl border bg-card/55 shadow-sm backdrop-blur-xl">
            <div className="oh-cta-green p-5 sm:p-6">
              <NewQuoteForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
