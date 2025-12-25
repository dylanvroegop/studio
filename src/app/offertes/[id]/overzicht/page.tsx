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
  Plus,
  Trash2,
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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type { Quote, Job, KleinMateriaalConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';

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
  let v = raw.replace(/[^\d,]/g, '');

  const firstComma = v.indexOf(',');
  if (firstComma !== -1) {
    const before = v.slice(0, firstComma + 1);
    const after = v.slice(firstComma + 1).replace(/,/g, '');
    v = before + after;
  }

  const [intRaw, decRaw] = v.split(',');

  let intPart = (intRaw ?? '').replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = '0';

  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decRaw !== undefined) {
    const dec = decRaw.slice(0, 2);
    return `${intFormatted},${dec}`;
  }

  return intFormatted;
}

function euroNLToNumberOrNull(v: string) {
  const s = (v ?? '').trim();
  if (!s) return null;

  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------
 UI component: € prefix that never disappears
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

type MaterieelPer = 'dag' | 'week' | 'klus';

type MaterieelItem = {
  id: string;
  naam: string;
  prijs: string;
  per: MaterieelPer;
  isVast: boolean;
};

type TransportMode = 'perKm' | 'fixed' | 'none';

// Winstmarge mode met "none"
type WinstMargeMode = 'percentage' | 'fixed' | 'none';

/* ---------------------------------------------
 Materieel helpers
--------------------------------------------- */

function maakMaterieelId() {
  return `mat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultMaterieel(): MaterieelItem[] {
  return [
    { id: 'steiger', naam: 'Steiger', prijs: '', per: 'dag', isVast: true },
    { id: 'container', naam: 'Container', prijs: '', per: 'klus', isVast: true },
    { id: 'aanhanger', naam: 'Aanhanger', prijs: '', per: 'dag', isVast: true },
  ];
}

function slugify(value: string) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

/* ---------------------------------------------
 n8n webhook helper
--------------------------------------------- */

// ✅ Standaard naar PRODUCTION (werkt altijd als workflow actief is)
const DEFAULT_N8N_WEBHOOK_URL = 'https://n8n.dylan8n.org/webhook/offerte-test';

// ✅ Zet in je env (Firebase Studio / Vercel / etc.):
// NEXT_PUBLIC_N8N_WEBHOOK_URL=https://n8n.dylan8n.org/webhook/offerte-test
// of voor test:
// NEXT_PUBLIC_N8N_WEBHOOK_URL=https://n8n.dylan8n.org/webhook-test/offerte-test
function getN8nWebhookUrl() {
  const envUrl = (process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || '').trim();
  return envUrl || DEFAULT_N8N_WEBHOOK_URL;
}

async function readResponseBodySafe(res: Response) {
  const ct = res.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) return JSON.stringify(await res.json());
    return await res.text();
  } catch {
    return '';
  }
}

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

  // Job delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);

  // Transport
  const [transportMode, setTransportMode] = useState<TransportMode>('perKm');
  const [prijsPerKm, setPrijsPerKm] = useState('');
  const [vasteTransportkosten, setVasteTransportkosten] = useState('');

  // Materieel (optioneel)
  const [materieel, setMaterieel] = useState<MaterieelItem[]>(defaultMaterieel);

  // Winstmarge (optioneel door "none")
  const [winstMarge, setWinstMarge] = useState<KleinMateriaalConfig>({
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
   Validatie helpers
  --------------------------------------------- */

  const prijsPerKmNum = useMemo(
    () => euroNLToNumberOrNull(prijsPerKm),
    [prijsPerKm]
  );
  const vasteTransportNum = useMemo(
    () => euroNLToNumberOrNull(vasteTransportkosten),
    [vasteTransportkosten]
  );

  const transportIsValid = useMemo(() => {
    if (transportMode === 'none') return true;
    if (transportMode === 'perKm') return prijsPerKmNum !== null && prijsPerKmNum > 0;
    if (transportMode === 'fixed') return vasteTransportNum !== null && vasteTransportNum > 0;
    return false;
  }, [transportMode, prijsPerKmNum, vasteTransportNum]);

  const winstMode = (winstMarge?.mode as WinstMargeMode) ?? 'percentage';

  const winstMargeIsValid = useMemo(() => {
    if (winstMode === 'none') return true;

    if (winstMode === 'percentage') {
      const p = (winstMarge as any)?.percentage;
      return typeof p === 'number' && Number.isFinite(p) && p > 0;
    }

    if (winstMode === 'fixed') {
      const a = (winstMarge as any)?.fixedAmount;
      return typeof a === 'number' && Number.isFinite(a) && a > 0;
    }

    return false;
  }, [winstMarge, winstMode]);

  /* ---------------------------------------------
   Derived UI
  --------------------------------------------- */

  const stats = useMemo(() => {
    const totaal = jobs.length;
    const compleet = jobs.filter((j: any) => jobIsComplete(j)).length;
    const incompleet = Math.max(0, totaal - compleet);

    return {
      totaal,
      compleet,
      incompleet,
      transportIsValid,
      winstMargeIsValid,
      isReady: totaal > 0 && incompleet === 0 && transportIsValid && winstMargeIsValid,
    };
  }, [jobs, transportIsValid, winstMargeIsValid]);

  const primaryHint = useMemo(() => {
    if (stats.totaal === 0) return 'Voeg minimaal 1 klus toe.';
    if (stats.incompleet > 0) return 'Er zijn nog onvolledige klussen. Werk ze eerst af.';
    if (!stats.transportIsValid)
      return 'Transport is niet ingevuld. Kies “Geen” of vul een bedrag in.';
    if (!stats.winstMargeIsValid)
      return 'Winstmarge is niet ingevuld. Kies “Geen” of vul een bedrag/percentage in.';
    return 'Alles staat goed. Je kunt de offerte genereren.';
  }, [stats]);

  const statusVariant = useMemo(() => {
    if (stats.totaal === 0) return 'warn';
    if (stats.incompleet > 0) return 'error';
    if (!stats.transportIsValid) return 'error';
    if (!stats.winstMargeIsValid) return 'error';
    return 'success';
  }, [stats]);

  /* ---------------------------------------------
   Handlers
  --------------------------------------------- */

  const handleMaterieelChange = (
    id: string,
    field: keyof Pick<MaterieelItem, 'naam' | 'prijs' | 'per'>,
    value: string
  ) => {
    setMaterieel((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const handleAddExtraMaterieel = () => {
    setMaterieel((prev) => [
      ...prev,
      {
        id: maakMaterieelId(),
        naam: '',
        prijs: '',
        per: 'klus',
        isVast: false,
      },
    ]);
  };

  const handleRemoveMaterieel = (id: string) => {
    setMaterieel((prev) => prev.filter((m) => m.id !== id));
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

    if (!stats.isReady) {
      toast({
        variant: 'destructive',
        title: 'Niet compleet',
        description: primaryHint,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const transportPayload =
        transportMode === 'none'
          ? { prijsPerKm: null, vasteTransportkosten: null, mode: 'none' }
          : transportMode === 'perKm'
          ? { prijsPerKm: prijsPerKmNum, vasteTransportkosten: null, mode: 'perKm' }
          : { prijsPerKm: null, vasteTransportkosten: vasteTransportNum, mode: 'fixed' };

      const materieelPayload = materieel
        .filter((m) => {
          const naamOk = (m.naam ?? '').trim() !== '';
          const prijsNum = euroNLToNumberOrNull(m.prijs);
          const prijsOk = prijsNum !== null && prijsNum !== 0;
          return naamOk || prijsOk;
        })
        .map((m) => ({
          naam: (m.naam ?? '').trim() || 'Extra materieel',
          per: m.per,
          prijs: euroNLToNumberOrNull(m.prijs),
          isVast: m.isVast,
        }));

      const winstPayload =
        winstMode === 'none'
          ? { mode: 'none', percentage: null, fixedAmount: null }
          : winstMarge;

      const webhookUrl = getN8nWebhookUrl();

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          quote,
          extras: {
            transport: transportPayload,
            materieel: materieelPayload,
            winstMarge: winstPayload,
            onvoorzien: winstPayload, // backward compat
          },
          triggeredAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await readResponseBodySafe(response);
        throw new Error(
          `Webhook fout: ${response.status}${body ? ` - ${body}` : ''}`
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

  const openDeleteDialogForJob = (job: any) => {
    const rawKey =
      job?.klusinformatie?.title?.trim?.() ||
      job?.meta?.title?.trim?.() ||
      job?.materialen?.jobKey?.trim?.() ||
      job?.jobKey ||
      '';

    const title = humanizeJobKey(rawKey);

    setJobToDelete({ id: job.id, title });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteJob = async () => {
    if (!firestore || !user || !quoteId || !jobToDelete) return;
    if (isDeletingJob) return;

    setIsDeletingJob(true);

    try {
      const ref = doc(firestore, 'quotes', quoteId);

      await updateDoc(ref, {
        [`klussen.${jobToDelete.id}`]: deleteField(),
        updatedAt: serverTimestamp(),
      } as any);

      setJobs((prev) => prev.filter((j: any) => j.id !== jobToDelete.id));

      toast({
        title: 'Klus verwijderd',
        description: 'De klus is definitief verwijderd uit de offerte.',
      });

      setDeleteDialogOpen(false);
      setJobToDelete(null);
    } catch (err: any) {
      console.error('Delete job error:', err);
      toast({
        variant: 'destructive',
        title: 'Verwijderen mislukt',
        description: err?.message || 'Kon de klus niet verwijderen.',
      });
    } finally {
      setIsDeletingJob(false);
    }
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
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klus verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt om{' '}
              <span className="font-medium">{jobToDelete?.title ?? 'deze klus'}</span>{' '}
              definitief te verwijderen. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingJob}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteJob();
              }}
              disabled={isDeletingJob}
              className={cn(
                'bg-red-600 text-white hover:bg-red-700',
                isDeletingJob && 'opacity-70'
              )}
            >
              {isDeletingJob ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verwijderen…
                </>
              ) : (
                'Ja, verwijderen'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 px-4 py-6 md:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
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

            <div />
          </div>

          <div
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              statusVariant === 'success' &&
                'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              statusVariant === 'warn' &&
                'border-amber-500/30 bg-amber-500/10 text-amber-200',
              statusVariant === 'error' &&
                'border-red-500/30 bg-red-500/10 text-red-200'
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
                const rawKey =
                  job?.klusinformatie?.title?.trim?.() ||
                  job?.meta?.title?.trim?.() ||
                  job?.materialen?.jobKey?.trim?.() ||
                  job?.jobKey ||
                  '';

                const title = humanizeJobKey(rawKey);

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
                  slugify(title);

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
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
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

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openDeleteDialogForJob(job)}
                        aria-label="Klus verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Transport</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'perKm' &&
                    transportIsValid &&
                    'border-emerald-500/40 bg-emerald-500/10',
                  transportMode === 'perKm' &&
                    !transportIsValid &&
                    'border-red-500/40 bg-red-500/10',
                  transportMode !== 'perKm' && 'hover:border-muted-foreground/30'
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
                    {!transportIsValid && (
                      <p className="mt-2 text-xs text-red-300">
                        Vul een tarief in of kies “Geen”.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'fixed' &&
                    transportIsValid &&
                    'border-emerald-500/40 bg-emerald-500/10',
                  transportMode === 'fixed' &&
                    !transportIsValid &&
                    'border-red-500/40 bg-red-500/10',
                  transportMode !== 'fixed' && 'hover:border-muted-foreground/30'
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
                    {!transportIsValid && (
                      <p className="mt-2 text-xs text-red-300">
                        Vul een bedrag in of kies “Geen”.
                      </p>
                    )}
                  </div>
                )}
              </div>

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

          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Materieel</CardTitle>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'transition-colors',
                    'hover:bg-emerald-600 hover:border-emerald-600 hover:text-white'
                  )}
                  onClick={handleAddExtraMaterieel}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Extra materieel toevoegen
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {materieel.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-4">
                    <Label className="text-xs sm:sr-only">Naam</Label>
                    {item.isVast ? (
                      <span className="text-sm">{item.naam}</span>
                    ) : (
                      <Input
                        value={item.naam}
                        onChange={(e) =>
                          handleMaterieelChange(item.id, 'naam', e.target.value)
                        }
                        placeholder="Bijv. Hoogwerker / Gereedschap huur"
                      />
                    )}
                  </div>

                  <EuroInput
                    value={item.prijs}
                    onChange={(v) => handleMaterieelChange(item.id, 'prijs', v)}
                    className="sm:col-span-5"
                    placeholder="0,00"
                  />

                  <div className="sm:col-span-2">
                    <Select
                      value={item.per}
                      onValueChange={(v) => handleMaterieelChange(item.id, 'per', v)}
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

                  <div className="sm:col-span-1 flex sm:justify-end">
                    {!item.isVast && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemoveMaterieel(item.id)}
                        aria-label="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Winstmarge</CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'percentage' &&
                    winstMargeIsValid &&
                    'border-emerald-500/40 bg-emerald-500/10',
                  winstMode === 'percentage' &&
                    !winstMargeIsValid &&
                    'border-red-500/40 bg-red-500/10',
                  winstMode !== 'percentage' && 'hover:border-muted-foreground/30'
                )}
                onClick={() =>
                  setWinstMarge({ ...winstMarge, mode: 'percentage' } as any)
                }
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Percent className="mr-2 h-4 w-4" /> Percentage
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reken een percentage over de totale offerteprijs.
                </p>

                {winstMode === 'percentage' && (
                  <div className="mt-3">
                    <Label className="text-xs">Percentage</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        value={(winstMarge as any).percentage ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw.trim() === '') {
                            setWinstMarge(
                              { ...winstMarge, percentage: null as any } as any
                            );
                            return;
                          }
                          const n = Number(raw);
                          setWinstMarge({
                            ...winstMarge,
                            percentage: Number.isFinite(n) ? n : null,
                          } as any);
                        }}
                        inputMode="decimal"
                        placeholder=""
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>

                    {!winstMargeIsValid && (
                      <p className="mt-2 text-xs text-red-300">
                        Vul een percentage groter dan 0 in of kies “Geen”.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'fixed' &&
                    winstMargeIsValid &&
                    'border-emerald-500/40 bg-emerald-500/10',
                  winstMode === 'fixed' &&
                    !winstMargeIsValid &&
                    'border-red-500/40 bg-red-500/10',
                  winstMode !== 'fixed' && 'hover:border-muted-foreground/30'
                )}
                onClick={() => setWinstMarge({ ...winstMarge, mode: 'fixed' } as any)}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Voeg één vast bedrag toe als marge.
                </p>

                {winstMode === 'fixed' && (
                  <div className="mt-3">
                    <Label className="text-xs">Bedrag</Label>
                    <EuroInput
                      value={
                        (winstMarge as any).fixedAmount === null
                          ? ''
                          : formatEuroNL(
                              String((winstMarge as any).fixedAmount).replace('.', ',')
                            )
                      }
                      onChange={(v) => {
                        const n = euroNLToNumberOrNull(v);
                        setWinstMarge({
                          ...winstMarge,
                          fixedAmount: n === null ? null : n,
                        } as any);
                      }}
                      className="mt-1"
                      placeholder="0,00"
                    />

                    {!winstMargeIsValid && (
                      <p className="mt-2 text-xs text-red-300">
                        Vul een bedrag groter dan 0 in of kies “Geen”.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'none'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'hover:border-muted-foreground/30'
                )}
                onClick={() =>
                  setWinstMarge({
                    mode: 'none' as any,
                    percentage: null,
                    fixedAmount: null,
                  } as any)
                }
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold">Geen</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Geen winstmarge toevoegen.
                </p>
              </div>
            </CardContent>
          </Card>

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
                disabled={isSubmitting || !stats.isReady}
                className={cn(
                  'w-full sm:w-auto',
                  'bg-emerald-600 text-white hover:bg-emerald-700',
                  (!stats.isReady || isSubmitting) && 'opacity-60'
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
