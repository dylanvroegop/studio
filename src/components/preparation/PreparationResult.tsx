'use client';

import { ClipboardCheck, ListChecks } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type PreparationResultData = {
  titel: string;
  samenvatting: string;
  klantdoelen: string[];
  aannames: string[];
  vragenVoorKlant: string[];
  risicoEnAandacht: string[];
  materiaalRichting: string[];
  vervolgstappen: string[];
};

interface PreparationResultProps {
  result: PreparationResultData | null;
}

function ResultSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-md border border-border/60 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PreparationResult({ result }: PreparationResultProps) {
  if (!result) {
    return (
      <Card className="border-border/70 bg-card/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-400" />
            Intake voorbereiding
          </CardTitle>
          <CardDescription>
            Na genereren verschijnt hier een gestructureerde voorbereiding voor je klantgesprek.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border/70 bg-background/20 p-5 text-sm text-muted-foreground">
            Nog geen voorbereiding beschikbaar.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/40 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-emerald-400" />
          {result.titel}
        </CardTitle>
        <CardDescription>{result.samenvatting}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResultSection title="Klantdoelen" items={result.klantdoelen} />
        <ResultSection title="Aannames" items={result.aannames} />
        <ResultSection title="Vragen voor klantgesprek" items={result.vragenVoorKlant} />
        <ResultSection title="Risico en aandacht" items={result.risicoEnAandacht} />
        <ResultSection title="Materiaalrichting" items={result.materiaalRichting} />
        <ResultSection title="Vervolgstappen" items={result.vervolgstappen} />
      </CardContent>
    </Card>
  );
}
