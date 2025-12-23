'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

import { cn } from '@/lib/utils';
import { DashboardHeader } from '@/components/dashboard-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  ArrowRight,
  LayoutDashboard,
  ClipboardList,
  Settings,
  UserRound,
  Ruler,
  Layers,
  Calculator,
} from 'lucide-react';

function LandingPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader user={null} />
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl">
          <div className="rounded-3xl border bg-card/50 p-6 shadow-sm backdrop-blur-xl">
            <div className="space-y-2">
              <div className="h-7 w-64 rounded bg-muted/50" />
              <div className="h-4 w-[30rem] rounded bg-muted/30" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="h-56 rounded-3xl border bg-card/40" />
              <div className="h-56 rounded-3xl border bg-card/40" />
            </div>
            <div className="mt-6 flex items-center gap-3 text-muted-foreground">
              <svg
                className="h-5 w-5 animate-spin text-primary"
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
              Pagina laden...
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stap({
  icon: Icon,
  titel,
  subtitel,
  tone = 'neutral',
}: {
  icon: any;
  titel: string;
  subtitel: string;
  tone?: 'neutral' | 'primary';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border bg-background/20 px-4 py-3',
        tone === 'primary' ? 'ring-1 ring-primary/15' : ''
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1',
          tone === 'primary'
            ? 'bg-primary/10 ring-primary/20'
            : 'bg-muted/35 ring-border'
        )}
      >
        <Icon
          className={cn(
            'h-4.5 w-4.5',
            tone === 'primary' ? 'text-primary' : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground/90">{titel}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{subtitel}</div>
      </div>
    </div>
  );
}

function MiniLink({
  href,
  titel,
  icon: Icon,
}: {
  href: string;
  titel: string;
  icon: any;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-2xl border bg-background/18 px-4 py-3 text-sm text-foreground/85 transition-all hover:bg-background/26"
    >
      <span className="inline-flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/35 ring-1 ring-border">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </span>
        {titel}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export default function LandingPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  const begroeting = useMemo(() => {
    const naam =
      (user as any)?.displayName ||
      (user as any)?.name ||
      (user as any)?.email?.split?.('@')?.[0] ||
      '';
    return naam ? `Welkom, ${naam}` : 'Welkom';
  }, [user]);

  if (isUserLoading || !user) return <LandingPageSkeleton />;

  return (
    <div className="min-h-screen bg-background">
      {/* keep header available for auth/menu logic, but visually use in-page header */}
      <div className="hidden">
        <DashboardHeader user={user} />
      </div>

      <main className="relative min-h-screen p-4 sm:p-6">
        {/* Fix: ensure the whole canvas has background + ambience (no black lower section) */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
          <div className="absolute left-1/2 top-[-320px] h-[920px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute left-[-420px] top-[220px] h-[760px] w-[760px] rounded-full bg-muted/20 blur-3xl" />
          <div className="absolute right-[-520px] top-[420px] h-[820px] w-[820px] rounded-full bg-muted/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_60%)] opacity-70" />
        </div>

        <div className="mx-auto w-full max-w-5xl">
          {/* In-page header with real logo + existing logout (DashboardHeader renders it) */}
          <DashboardHeader user={user} />

          {/* Greeting */}
          <div className="mt-6">
            <h1 className="text-3xl font-bold tracking-tight">{begroeting}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Jij vult de info in. Ik maak de berekening en de offerte.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            {/* PRIMARY: NOT clickable; only Starten button */}
            <Card className="relative overflow-hidden rounded-3xl border bg-card/60 shadow-sm backdrop-blur-xl ring-1 ring-primary/18">
              {/* glow */}
              <div className="pointer-events-none absolute -inset-24 opacity-55">
                <div className="absolute left-10 top-10 h-80 w-80 rounded-full bg-primary/16 blur-3xl" />
                <div className="absolute right-10 bottom-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              </div>
              {/* sheen */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(900px_circle_at_0%_0%,rgba(255,255,255,0.10),transparent_45%),radial-gradient(900px_circle_at_100%_0%,rgba(255,255,255,0.06),transparent_45%)] opacity-70" />
              </div>

              <CardHeader className="relative pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-xl">Nieuwe offerte</CardTitle>
                    <CardDescription className="mt-1">
                      Start de invulflow: klant → maten → materialen.
                    </CardDescription>
                  </div>

                  <Link href="/offertes/nieuw" className="shrink-0">
                    <Button className="gap-2">
                      Starten <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="relative pt-0">
                {/* User input steps */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stap
                    icon={UserRound}
                    titel="Klantinformatie"
                    subtitel="Naam, adres, contactgegevens."
                    tone="primary"
                  />
                  <Stap
                    icon={Ruler}
                    titel="Maten"
                    subtitel="Lengtes, hoogtes & breedtes."
                    tone="primary"
                  />
                  <Stap
                    icon={Layers}
                    titel="Materialen"
                    subtitel="Selecteer uit jouw bibliotheek."
                    tone="primary"
                  />
                </div>

                {/* System output (visually separated) */}
                <div className="mt-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Automatisch
                  </div>
                  <Stap
                    icon={Calculator}
                    titel="Automatische berekening"
                    subtitel="Offerte wordt door OfferteHulp gegenereerd op basis van jouw invoer."
                    tone="neutral"
                  />
                </div>

                {/* VERWIJDERD: extra regel "Jij voert in — wij rekenen uit." + "Klaar om te starten" */}
              </CardContent>
            </Card>

            {/* SECONDARY */}
            <Card className="rounded-3xl border bg-card/50 shadow-sm backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Doorgaan</CardTitle>
                <CardDescription className="mt-1">
                  Open je overzicht of beheer je data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <MiniLink href="/dashboard" titel="Overzicht" icon={LayoutDashboard} />
                <MiniLink
                  href="/materialen"
                  titel="Materiaalbibliotheek"
                  icon={ClipboardList}
                />
                <MiniLink href="/instellingen" titel="Instellingen" icon={Settings} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
