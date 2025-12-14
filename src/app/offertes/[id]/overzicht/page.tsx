'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  PlusCircle,
  Send,
  Loader2,
  Percent,
  Euro,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Quote, Job, KleinMateriaalConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

/* ---------------------------------------------
 Helpers
--------------------------------------------- */

function humanizeJobKey(jobKey: string): string {
  switch (jobKey) {
    case 'hsb-wand':
      return 'HSB wand';
    default:
      return jobKey.replace(/-/g, ' ');
  }
}

function resolvePresetLabel(presetLabel?: string | null) {
  if (!presetLabel || !presetLabel.trim()) {
    return 'Aangepaste werkwijze';
  }
  return presetLabel;
}

function jobIsComplete(job: any): boolean {
  // Simple, safe heuristic
  return (
    job?.selections &&
    Object.keys(job.selections).length > 0
  );
}

/* ---------------------------------------------
 Types
--------------------------------------------- */

type MaterieelItem = {
  naam: string;
  prijs: string;
  per: 'dag' | 'week' | 'klus';
};

/* ---------------------------------------------
 Page
--------------------------------------------- */

export default function OverzichtPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;

  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transport / extra state
  const [prijsPerKm, setPrijsPerKm] = useState('');
  const [vasteTransportkosten, setVasteTransportkosten] = useState('');

  const [materieel, setMaterieel] = useState<MaterieelItem[]>([
    { naam: 'Steiger', prijs: '', per: 'dag' },
    { naam: 'Container', prijs: '', per: 'klus' },
    { naam: 'Aanhanger', prijs: '', per: 'dag' },
  ]);

  const [onvoorzien, setOnvoorzien] = useState<KleinMateriaalConfig>({
    mode: 'percentage',
    percentage: 5,
    fixedAmount: null,
  });

  /* ---------------------------------------------
   Fetch quote
  --------------------------------------------- */

  useEffect(() => {
    if (isUserLoading || !user || !firestore) return;

    const fetchQuote = async () => {
      setLoading(true);
      setError(null);

      try {
        const ref = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError('Offerte niet gevonden.');
          return;
        }

        const data = snap.data() as Quote;

        if (data.userId !== user.uid) {
          setError('Geen toegang tot deze offerte.');
          return;
        }

        setQuote(data);

        const extractedJobs: Job[] = [];

        if (data.jobs) {
          for (const key in data.jobs) {
            const jobData: any = data.jobs[key];

            extractedJobs.push({
              id: jobData.jobKey ?? key,
              quoteId,
              ...jobData,
            });
          }
        }

        setJobs(extractedJobs);
      } catch (err: any) {
        console.error(err);
        setError('Kon offerte niet laden.');
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId, firestore, user, isUserLoading]);

  /* ---------------------------------------------
   Handlers
  --------------------------------------------- */

  const handleMaterieelChange = (
    index: number,
    field: keyof MaterieelItem,
    value: string
  ) => {
    const copy = [...materieel];
    copy[index] = { ...copy[index], [field]: value };
    setMaterieel(copy);
  };

  const handleFinishQuote = () => {
    toast({
      title: 'Offerte wordt gegenereerd',
      description: 'U wordt doorgestuurd.',
    });
    router.push(`/offertes/${quoteId}`);
  };

  /* ---------------------------------------------
   Render states
  --------------------------------------------- */

  if (loading || isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">
          Overzicht laden…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">
              Fout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------
   UI
  --------------------------------------------- */

  return (
    <main className="flex flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 grid grid-cols-3 items-center border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div>
          <Button asChild variant="ghost" size="icon">
            <Link href={`/offertes/${quoteId}/klus/wanden/hsb-wand/materialen`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="text-center">
          <h1 className="font-semibold text-lg">
            Overzicht & extra’s
          </h1>
          <p className="text-xs text-muted-foreground">
            stap 6 van 6
          </p>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Huidige klussen</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Er zijn nog geen klussen toegevoegd.
                </p>
              )}

              {jobs.map((job) => {
                const title = humanizeJobKey(job.jobKey);
                const preset = resolvePresetLabel(job.presetLabel);
                const isComplete = jobIsComplete(job);

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">
                        Werkwijze: {preset}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      {isComplete ? (
                        <span className="flex items-center text-emerald-500">
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Ingesteld
                        </span>
                      ) : (
                        <span className="flex items-center text-amber-500">
                          <AlertTriangle className="mr-1 h-4 w-4" />
                          Onvolledig
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              <Button asChild variant="outline" className="w-full">
                <Link href={`/offertes/${quoteId}/klus/nieuw`}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Nog een klus toevoegen
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Transport */}
          <Card>
            <CardHeader>
              <CardTitle>Transport</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prijs per km (€)</Label>
                <Input
                  type="number"
                  value={prijsPerKm}
                  onChange={(e) => setPrijsPerKm(e.target.value)}
                />
              </div>
              <div>
                <Label>Vaste transportkosten (€)</Label>
                <Input
                  type="number"
                  value={vasteTransportkosten}
                  onChange={(e) => setVasteTransportkosten(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Materieel */}
          <Card>
            <CardHeader>
              <CardTitle>Materieel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {materieel.map((item, i) => (
                <div key={i} className="grid grid-cols-5 gap-3 items-center">
                  <span className="col-span-2 text-sm">
                    {item.naam}
                  </span>
                  <Input
                    type="number"
                    value={item.prijs}
                    onChange={(e) =>
                      handleMaterieelChange(i, 'prijs', e.target.value)
                    }
                    className="col-span-2"
                  />
                  <Select
                    value={item.per}
                    onValueChange={(v) =>
                      handleMaterieelChange(i, 'per', v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dag">dag</SelectItem>
                      <SelectItem value="week">week</SelectItem>
                      <SelectItem value="klus">klus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Onvoorzien */}
          <Card>
            <CardHeader>
              <CardTitle>Onvoorzien</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer',
                  onvoorzien.mode === 'percentage' &&
                    'border-primary bg-muted/30'
                )}
                onClick={() =>
                  setOnvoorzien({ ...onvoorzien, mode: 'percentage' })
                }
              >
                <h4 className="font-semibold flex items-center">
                  <Percent className="mr-2 h-4 w-4" /> Percentage
                </h4>
                {onvoorzien.mode === 'percentage' && (
                  <Input
                    className="mt-2"
                    type="number"
                    value={onvoorzien.percentage ?? ''}
                    onChange={(e) =>
                      setOnvoorzien({
                        ...onvoorzien,
                        percentage: Number(e.target.value),
                      })
                    }
                  />
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer',
                  onvoorzien.mode === 'fixed' &&
                    'border-primary bg-muted/30'
                )}
                onClick={() =>
                  setOnvoorzien({ ...onvoorzien, mode: 'fixed' })
                }
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                {onvoorzien.mode === 'fixed' && (
                  <Input
                    className="mt-2"
                    type="number"
                    value={onvoorzien.fixedAmount ?? ''}
                    onChange={(e) =>
                      setOnvoorzien({
                        ...onvoorzien,
                        fixedAmount: Number(e.target.value),
                      })
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleFinishQuote}
            className="w-full bg-primary text-primary-foreground"
          >
            <Send className="mr-2 h-4 w-4" />
            Offerte genereren
          </Button>
        </div>
      </div>
    </main>
  );
}