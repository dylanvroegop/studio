'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/firebase';

type FeatureStatus = 'In onderzoek' | 'Roadmap kandidaat' | 'Klaar voor planning';

interface IncomingFeature {
  id: number;
  title: string;
  domein: string;
  status: FeatureStatus;
  beschrijving: string;
}

const INCOMING_FEATURES: IncomingFeature[] = [
  {
    id: 1,
    title: 'Klantportaal met live offerte-status',
    domein: 'Offertes / Klanten',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Klanten kunnen offertes bekijken, opmerkingen plaatsen en statusupdates volgen zonder losse e-mailketens.',
  },
  {
    id: 2,
    title: 'AI controle op missende calculatieposten',
    domein: 'Offertes',
    status: 'In onderzoek',
    beschrijving:
      'Automatische check op veelvoorkomende vergeten posten zoals afwerking, bevestiging en transport.',
  },
  {
    id: 3,
    title: 'Automatische follow-up op open offertes',
    domein: 'Offertes / CRM',
    status: 'Klaar voor planning',
    beschrijving:
      'Instelbare herinneringen voor offertes zonder reactie, inclusief voorgestelde vervolgtekst.',
  },
  {
    id: 4,
    title: 'Scenariovergelijker voor materiaalkeuzes',
    domein: 'Offertes / Producten',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Vergelijk meerdere materiaalvarianten op prijs, marge en totaal, inclusief verschil per regel.',
  },
  {
    id: 5,
    title: 'Korting- en staffelregels per leverancier',
    domein: 'Producten',
    status: 'In onderzoek',
    beschrijving:
      'Ondersteuning voor leveranciersafspraken zoals staffels, projectkorting en seizoensprijzen.',
  },
  {
    id: 6,
    title: 'Prijsvolatiliteit waarschuwingen',
    domein: 'Producten / Winst',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Signalen wanneer veelgebruikte producten sterk stijgen in prijs, met impact op open calculaties.',
  },
  {
    id: 7,
    title: 'Branchespecifieke offerte-templates',
    domein: 'Offertes',
    status: 'Klaar voor planning',
    beschrijving:
      'Templatebibliotheek per werksoort (dak, wand, kozijn) met standaardteksten en vaste opbouw.',
  },
  {
    id: 8,
    title: 'Meerwerk-flow met digitale akkoord',
    domein: 'Offertes / Facturen',
    status: 'In onderzoek',
    beschrijving:
      'Tijdens uitvoering extra werk registreren, laten goedkeuren en direct meenemen in nacalculatie.',
  },
  {
    id: 9,
    title: 'Foto- en bijlagenkoppeling per klus',
    domein: 'Planning / Offertes',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Werkfoto’s, detailshots en opleverdocumenten gestructureerd opslaan op project- en klusniveau.',
  },
  {
    id: 10,
    title: 'Capaciteitsprognose per week',
    domein: 'Planning',
    status: 'Klaar voor planning',
    beschrijving:
      'Inzicht in over- of onderbezetting op basis van lopende projecten, ureninschattingen en teamcapaciteit.',
  },
  {
    id: 11,
    title: 'Teamplanning met verlof en afwezigheid',
    domein: 'Planning',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Beschikbaarheid van medewerkers meenemen in planning om dubbele boekingen te voorkomen.',
  },
  {
    id: 12,
    title: 'Slimme route- en dagvolgorde suggesties',
    domein: 'Planning',
    status: 'In onderzoek',
    beschrijving:
      'Optimaliseer bezoekvolgorde op basis van locatie, reistijd en prioriteit per project.',
  },
  {
    id: 13,
    title: 'Betaallinks op facturen',
    domein: 'Facturen',
    status: 'Klaar voor planning',
    beschrijving:
      'Directe online betaalopties toevoegen voor snellere betaling en minder openstaande posten.',
  },
  {
    id: 14,
    title: 'Automatische betaalherinneringsflow',
    domein: 'Facturen',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Instelbare herinneringsmomenten met oplopende toon en logging van verzonden berichten.',
  },
  {
    id: 15,
    title: 'Margelek-rapportage per project',
    domein: 'Winst / Urenregistratie',
    status: 'In onderzoek',
    beschrijving:
      'Analyse van afwijkingen tussen begrote en gerealiseerde uren, materiaal en winst.',
  },
  {
    id: 16,
    title: 'Inkooplijst export per leverancier',
    domein: 'Producten / Offertes',
    status: 'Klaar voor planning',
    beschrijving:
      'Automatische bundeling van benodigde materialen per leverancier met aantallen en artikelniveau.',
  },
  {
    id: 17,
    title: 'Afval- en snijverlies aanbevelingen',
    domein: 'Calculatie',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Voorstel voor opslagpercentages op basis van historisch verbruik per materiaalgroep.',
  },
  {
    id: 18,
    title: 'Revisiegeschiedenis van offertes',
    domein: 'Offertes',
    status: 'Klaar voor planning',
    beschrijving:
      'Volledige versiehistorie met vergelijkweergave van prijswijzigingen en aangepaste regels.',
  },
  {
    id: 19,
    title: 'Offline mobiele urenregistratie',
    domein: 'Urenregistratie',
    status: 'In onderzoek',
    beschrijving:
      'Uren en notities lokaal kunnen registreren op locatie zonder internet, met latere synchronisatie.',
  },
  {
    id: 20,
    title: 'Predictieve omzet- en kasstroomforecast',
    domein: 'Dashboard / Winst',
    status: 'Roadmap kandidaat',
    beschrijving:
      'Verwachtingsmodel op basis van offertepijplijn, factuurhistorie en betaalgedrag.',
  },
];

function statusClassName(status: FeatureStatus): string {
  if (status === 'Klaar voor planning') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (status === 'Roadmap kandidaat') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

function PageSkeleton() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Incoming updates" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function NieuwPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  if (isUserLoading || !user) return <PageSkeleton />;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Incoming updates" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-6xl space-y-5 rounded-xl border border-border/60 bg-card/40 p-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-5 w-5 text-emerald-300" />
            Incoming features
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Overzicht van 20 potentiële verbeteringen voor Calvora, afgestemd op calculatie, planning, facturatie en winststuring.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {INCOMING_FEATURES.map((feature) => (
              <Card key={feature.id} className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base leading-snug">{feature.id}. {feature.title}</CardTitle>
                    <Badge variant="outline" className={statusClassName(feature.status)}>
                      {feature.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{feature.domein}</p>
                  <p className="text-sm text-muted-foreground">{feature.beschrijving}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
