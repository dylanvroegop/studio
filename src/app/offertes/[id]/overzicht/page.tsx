'use client';

import { useState, useEffect, useMemo } from 'react';
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
  ClipboardList,
  Truck,
  Wrench,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function humanizeJobKey(jobKey?: string | null): string {
  if (!jobKey) return 'Klus';
  switch (jobKey) {
    case 'hsb-voorzetwand':
      return 'HSB voorzetwand';
    default:
      return jobKey.replace(/-/g, ' ');
  }
}

function resolvePresetLabelForUI(presetLabel?: string | null) {
  const v = (presetLabel ?? '').trim();
  if (!v) return null;
  if (v.toLowerCase() === 'nieuw') return null;
  return v;
}

function jobIsComplete(job: any): boolean {
  const selections = job?.materialen?.selections;
  const hasSelections =
    selections &&
    typeof selections === 'object' &&
    Object.keys(selections).length > 0;

  const presetLabel = job?.werkwijze?.presetLabel;
  const hasWerkwijzePreset =
    !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';

  return hasSelections || hasWerkwijzePreset;
}

/* ---------------------------------------------
 EURO input helpers (NL style)
- Alleen cijfers + komma
- Duizendtallen met punt
- Max 2 decimalen
--------------------------------------------- */

function formatEuroNL(raw: string): string {
  // 1) laat alleen cijfers en komma toe
  let v = raw.replace(/[^\d,]/g, '');

  // 2) max 1 komma
  const firstComma = v.indexOf(',');
  if (firstComma !== -1) {
    const before = v.slice(0, firstComma + 1);
    const after = v
      .slice(firstComma + 1)
      .replace(/,/g, ''); // alle extra komma’s weg
    v = before + after;
  }

  // 3) split integer/decimal
  const [intRaw, decRaw] = v.split(',');

  // 4) integer: leading zeros trimmen (maar laat 0 staan)
  let intPart = (intRaw ?? '').replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = '0';

  // 5) duizendtallen punten
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // 6) decimal: max 2
  if (decRaw !== undefined) {
    const dec = decRaw.slice(0, 2);
    return `${intFormatted},${dec}`;
  }

  return intFormatted;
}

function euroNLToNumberOrNull(v: string) {
  // "" of "0" of "1.000" of "1.000,50"
  const s = (v ?? '').trim();
  if (!s) return null;

  // remove thousand dots, convert comma to dot
  const normalized = s.replace(/\./g, '').replace(',', '.');

  // edge: "0," or "1," -> Number("0.") ok
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------
 UI component: € prefix that never disappears
- We keep the value numeric-ish (no € in value)
- Prefix is visual only
--------------------------------------------- */

function EuroInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}) {
  const {
    value,
    onChange,
    placeholder = '0,00',
    className,
    inputClassName,
    disabled,
    id,
  } = props;

  const [focused, setFocused] = useState(false);
  const hasValue = (value ?? '').trim() !== '' && (value ?? '').trim() !== '0';

  return (
    <div className={cn('relative', className)}>
      <span
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm transition-colors',
          focused || hasValue ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        €
      </span>

      <Input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(formatEuroNL(e.target.value))}
        placeholder={placeholder}
        className={cn('pl-7', inputClassName)}
      />
    </div>
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

type TransportMode = 'perKm' | 'fixed' | 'none';

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

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transport
  const [transportMode, setTransportMode] = useState<TransportMode>('perKm');
  const [prijsPerKm, setPrijsPerKm] = useState('');
  const [vasteTransportkosten, setVasteTransportkosten] = useState('');

  // Materieel
  const [materieel, setMaterieel] = useState<MaterieelItem[]>([
    { naam: 'Steiger', prijs: '', per: 'dag' },
    { naam: 'Container', prijs: '', per: 'klus' },
    { naam: 'Aanhanger', prijs: '', per: 'dag' },
  ]);

  // Onvoorzien
  const [onvoorzien, setOnvoorzien] = useState<KleinMateriaalConfig>({
    mode: 'percentage',
    percentage: 10,
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

        const ownerUid = (data as any)?.klantinformatie?.userId;

        if (!ownerUid) {
          setError('Geen eigenaar gevonden bij deze offerte.');
          return;
        }

        if (ownerUid !== user.uid) {
          setError('Geen toegang tot deze offerte.');
          return;
        }

        setQuote(data);

        const extractedJobs: any[] = [];
        const klussen: any = (data as any).klussen;

        if (klussen && typeof klussen === 'object') {
          for (const klusId in klussen) {
            const container: any = klussen[klusId] || {};

            const klusinformatie = container.klusinformatie ?? {};
            const materialen = container.materialen ?? {};
            const werkwijze = container.werkwijze ?? null;
            const kleinMateriaal = container.kleinMateriaal ?? null;
            const meta = container.meta ?? null;

            const jobKey =
              (materialen?.jobKey as string | undefined) ||
              (meta?.slug as string | undefined) ||
              (meta?.jobKey as string | undefined) ||
              (klusinformatie?.slug as string | undefined) ||
              (klusinformatie?.jobKey as string | undefined) ||
              'klus';

            extractedJobs.push({
              id: klusId,
              quoteId,
              klusId,
              jobKey,
              meta,
              klusinformatie,
              materialen,
              werkwijze,
              kleinMateriaal,
              createdAt: container.createdAt ?? null,
              updatedAt: container.updatedAt ?? null,
            });
          }
        }

        setJobs(extractedJobs as any);
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
   Derived UI
  --------------------------------------------- */

  const stats = useMemo(() => {
    const totaal = jobs.length;
    const compleet = jobs.filter((j: any) => jobIsComplete(j)).length;
    const incompleet = Math.max(0, totaal - compleet);

    const prijsPerKmNum = euroNLToNumberOrNull(prijsPerKm);
    const vasteTransportNum = euroNLToNumberOrNull(vasteTransportkosten);

    const heeftTransport =
      transportMode !== 'none' &&
      ((transportMode === 'perKm' && prijsPerKmNum !== null && prijsPerKmNum !== 0) ||
        (transportMode === 'fixed' &&
          vasteTransportNum !== null &&
          vasteTransportNum !== 0));

    const heeftMaterieel = materieel.some((m) => {
      const n = euroNLToNumberOrNull(m.prijs);
      return n !== null && n !== 0;
    });

    return { totaal, compleet, incompleet, heeftTransport, heeftMaterieel };
  }, [jobs, transportMode, prijsPerKm, vasteTransportkosten, materieel]);

  const primaryHint = useMemo(() => {
    if (stats.totaal === 0) return 'Voeg minimaal 1 klus toe.';
    if (stats.incompleet > 0) return 'Werk de onvolledige klussen af of genereer toch.';
    return 'Alles staat goed. Je kunt de offerte genereren.';
  }, [stats]);

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

  const handleFinishQuote = async () => {
    if (!quote) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Geen offerte gevonden om te versturen.',
      });
      return;
    }

    if (isSubmitting) return;

    if (stats.totaal === 0) {
      toast({
        variant: 'destructive',
        title: 'Geen klussen',
        description: 'Voeg eerst minimaal 1 klus toe.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const prijsPerKmNum = euroNLToNumberOrNull(prijsPerKm);
      const vasteTransportNum = euroNLToNumberOrNull(vasteTransportkosten);

      const transportPayload =
        transportMode === 'none'
          ? { prijsPerKm: null, vasteTransportkosten: null, mode: 'none' }
          : transportMode === 'perKm'
          ? { prijsPerKm: prijsPerKmNum, vasteTransportkosten: null, mode: 'perKm' }
          : { prijsPerKm: null, vasteTransportkosten: vasteTransportNum, mode: 'fixed' };

      const response = await fetch(
        'https://n8n.dylan8n.org/webhook-test/offerte-test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteId,
            quote,
            extras: {
              transport: transportPayload,
              materieel: materieel.map((m) => ({
                ...m,
                prijs: euroNLToNumberOrNull(m.prijs), // keep numeric for backend if needed later
              })),
              onvoorzien,
            },
            triggeredAt: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Webhook fout: ${response.status}${text ? ` - ${text}` : ''}`
        );
      }

      toast({
        title: 'Offerte verzonden',
        description: 'De offerte is doorgestuurd naar verwerking.',
      });

      router.push('/landing');
    } catch (err: any) {
      console.error('Webhook error:', err);
      toast({
        variant: 'destructive',
        title: 'Webhook fout',
        description: err?.message || 'Kon offerte niet versturen.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddJob = () => {
    if (!quoteId) return;
    router.push(`/offertes/${quoteId}/klus/nieuw`);
  };

  /* ---------------------------------------------
   Render states
  --------------------------------------------- */

  if (loading || isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Overzicht laden…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Fout</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <div className="pt-4">
              <Button variant="outline" onClick={() => router.push('/landing')}>
                Terug
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------
   UI
  --------------------------------------------- */

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1 px-4 py-6 md:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Page top row (part of page, scrolls away normally) */}
          <div className="grid grid-cols-3 items-center">
            <div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                aria-label="Terug"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-center">
              <h1 className="font-semibold text-lg">Overzicht & extra’s</h1>
            </div>

            <div className="flex justify-end">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                  stats.incompleet === 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                )}
              >
                {stats.incompleet === 0 ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Klaar
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {stats.incompleet} onvolledig
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Top summary */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                Eindcheck
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Klussen</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="text-xl font-semibold">{stats.totaal}</div>
                    <div className="text-xs text-muted-foreground">totaal</div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Compleet</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="text-xl font-semibold text-emerald-400">
                      {stats.compleet}
                    </div>
                    <div className="text-xs text-muted-foreground">ingesteld</div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Extra’s</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 text-xs',
                        stats.heeftTransport
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      <Truck className="mr-1 inline h-3.5 w-3.5" />
                      Transport
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 text-xs',
                        stats.heeftMaterieel
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      <Wrench className="mr-1 inline h-3.5 w-3.5" />
                      Materieel
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg border px-4 py-3 text-sm',
                  stats.totaal === 0
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : stats.incompleet > 0
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <ClipboardList className="mt-0.5 h-4 w-4 opacity-80" />
                  <div>
                    <div className="font-medium">Status</div>
                    <div className="text-xs opacity-90">{primaryHint}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Jobs */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Huidige klussen</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Er zijn nog geen klussen toegevoegd.
                </p>
              )}

              {jobs.map((job: any) => {
                const title =
                  job?.klusinformatie?.title?.trim?.() ||
                  job?.meta?.title?.trim?.() ||
                  job?.materialen?.jobKey?.trim?.() ||
                  humanizeJobKey(job?.jobKey);

                const preset = resolvePresetLabelForUI(
                  job?.werkwijze?.presetLabel ?? null
                );

                const isComplete = jobIsComplete(job);

                const type =
                  job?.klusinformatie?.type ||
                  job?.materialen?.jobType ||
                  job?.meta?.type ||
                  'wanden';

                const slug =
                  job?.materialen?.jobSlug ||
                  job?.meta?.slug ||
                  job?.jobKey ||
                  'hsb-voorzetwand';

                const bewerkenHref = `/offertes/${quoteId}/klus/${job.id}/${type}/${slug}`;

                return (
                  <div
                    key={job.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium truncate">{title}</p>
                      <p className="text-sm text-muted-foreground">
                        Werkwijze:{' '}
                        <span className={cn(!preset && 'opacity-60')}>
                          {preset ?? '—'}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs',
                          isComplete
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        )}
                      >
                        {isComplete ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Ingesteld
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                            Onvolledig
                          </>
                        )}
                      </span>

                      <Link href={bewerkenHref} prefetch={false}>
                        <Button variant="outline" size="sm">
                          Bewerken
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}

              <Button
                variant="outline"
                className={cn(
                  'w-full transition-colors',
                  'hover:bg-emerald-600 hover:border-emerald-600 hover:text-white'
                )}
                onClick={handleAddJob}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Nog een klus toevoegen
              </Button>
            </CardContent>
          </Card>

          {/* Transport (choose one) */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Transport</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Per km */}
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'perKm'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('perKm')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Truck className="mr-2 h-4 w-4" /> Prijs per km
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Afstand automatisch berekend.
                </p>

                {transportMode === 'perKm' && (
                  <div className="mt-3">
                    <Label className="text-xs">Tarief per km</Label>
                    <EuroInput
                      value={prijsPerKm}
                      onChange={setPrijsPerKm}
                      className="mt-1"
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>

              {/* Vast bedrag */}
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'fixed'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('fixed')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Eén bedrag voor transport.
                </p>

                {transportMode === 'fixed' && (
                  <div className="mt-3">
                    <Label className="text-xs">Bedrag</Label>
                    <EuroInput
                      value={vasteTransportkosten}
                      onChange={setVasteTransportkosten}
                      className="mt-1"
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>

              {/* Geen */}
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'none'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('none')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold">Geen</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Geen transportkosten rekenen.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Materieel */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Materieel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {materieel.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center"
                >
                  <span className="sm:col-span-2 text-sm">{item.naam}</span>

                  <EuroInput
                    value={item.prijs}
                    onChange={(v) => handleMaterieelChange(i, 'prijs', v)}
                    className="sm:col-span-2"
                    placeholder="0,00"
                  />

                  <Select
                    value={item.per}
                    onValueChange={(v) => handleMaterieelChange(i, 'per', v)}
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
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Onvoorzien</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  onvoorzien.mode === 'percentage'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() =>
                  setOnvoorzien({ ...onvoorzien, mode: 'percentage' })
                }
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Percent className="mr-2 h-4 w-4" /> Percentage
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reken een percentage van de totale materiaalkosten.
                </p>
                {onvoorzien.mode === 'percentage' && (
                  <div className="mt-3">
                    <Label className="text-xs">Percentage</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        value={onvoorzien.percentage ?? ''}
                        onChange={(e) =>
                          setOnvoorzien({
                            ...onvoorzien,
                            percentage: Number(e.target.value),
                          })
                        }
                        inputMode="decimal"
                        placeholder=""
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  onvoorzien.mode === 'fixed'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setOnvoorzien({ ...onvoorzien, mode: 'fixed' })}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Voeg één vast bedrag toe voor kleine/onvoorziene materialen.
                </p>
                {onvoorzien.mode === 'fixed' && (
                  <div className="mt-3">
                    <Label className="text-xs">Bedrag</Label>
                    <EuroInput
  value={
    onvoorzien.fixedAmount === null
      ? ''
      : formatEuroNL(String(onvoorzien.fixedAmount).replace('.', ','))
  }
  onChange={(v) => {
    const n = euroNLToNumberOrNull(v);
    setOnvoorzien({
      ...onvoorzien,
      fixedAmount: n === null ? null : n,
    });
  }}
  className="mt-1"
  placeholder="0,00"
/>

                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sticky footer CTA */}
          <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 backdrop-blur-sm">
            <div className="mx-auto max-w-3xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <div className="font-medium">Offerte genereren</div>
                <div className="text-xs text-muted-foreground">
                  Controleer je extra’s, daarna kun je direct genereren.
                </div>
              </div>

              <Button
                onClick={handleFinishQuote}
                disabled={isSubmitting || stats.totaal === 0}
                className={cn(
                  'w-full sm:w-auto',
                  'bg-emerald-600 text-white hover:bg-emerald-700'
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? 'Genereren…' : 'Offerte genereren'}
              </Button>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </main>
  );
}
