'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, FileText, Loader2, ReceiptText } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFirestore, useUser } from '@/firebase';
import type { UserSettings } from '@/lib/types-settings';
import { toast } from '@/hooks/use-toast';
import { createInvoiceFromQuote, findExistingVoorschotInvoiceId, getInvoiceSnapshotForAdjustments } from '@/lib/invoice-actions';

function formatCurrency(amount?: number) {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

function NieuweFactuurPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams?.get('quoteId') || '';
  const initialType = (searchParams?.get('type') === 'voorschot' || searchParams?.get('type') === 'eind')
    ? (searchParams.get('type') as 'voorschot' | 'eind')
    : 'eind';

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedType, setSelectedType] = useState<'voorschot' | 'eind'>(initialType);
  const [voorschotIngeschakeld, setVoorschotIngeschakeld] = useState(false);
  const [voorschotPercentage, setVoorschotPercentage] = useState<number>(50);
  const [existingVoorschotId, setExistingVoorschotId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user || !firestore || !quoteId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const s = userSnap.exists() ? (userSnap.data() as any)?.settings : null;
        if (!cancelled) setSettings(s as UserSettings);

        const quoteRef = doc(firestore, 'quotes', quoteId);
        const quoteSnap = await getDoc(quoteRef);
        const q = quoteSnap.exists() ? ({ id: quoteSnap.id, ...(quoteSnap.data() as any) }) : null;
        if (!cancelled) setQuote(q);

        if (q?.facturatie) {
          setVoorschotIngeschakeld(!!q.facturatie.voorschotIngeschakeld);
          if (typeof q.facturatie.voorschotPercentage === 'number' && Number.isFinite(q.facturatie.voorschotPercentage)) {
            setVoorschotPercentage(q.facturatie.voorschotPercentage);
          }
        } else if (s?.standaardVoorschotPercentage) {
          setVoorschotPercentage(Number(s.standaardVoorschotPercentage) || 50);
        }

        const existingId = await findExistingVoorschotInvoiceId(firestore, { userId: user.uid, quoteId });
        if (!cancelled) setExistingVoorschotId(existingId);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, firestore, quoteId]);

  const totalIncl = useMemo(() => {
    if (!quote) return 0;
    const n = typeof quote?.amount === 'number' ? quote.amount : (typeof quote?.totaalbedrag === 'number' ? quote.totaalbedrag : 0);
    return Number.isFinite(n) ? n : 0;
  }, [quote]);

  const pct = useMemo(() => clampPct(Number(voorschotPercentage) || 0), [voorschotPercentage]);
  const voorschotBedrag = useMemo(() => Math.round(totalIncl * (pct / 100) * 100) / 100, [totalIncl, pct]);
  const aftrek = useMemo(() => (voorschotIngeschakeld ? voorschotBedrag : 0), [voorschotIngeschakeld, voorschotBedrag]);
  const eindBedrag = useMemo(() => Math.round(Math.max(0, totalIncl - aftrek) * 100) / 100, [totalIncl, aftrek]);

  const canCreate = !!user && !!firestore && !!settings && !!quote && totalIncl > 0;

  const handleCreate = async () => {
    if (!user || !firestore) return;
    if (!settings) {
      toast({ title: 'Instellingen ontbreken', description: 'Open Instellingen en sla minimaal uw gegevens op.', variant: 'destructive' });
      return;
    }
    if (!quote) return;
    if (!totalIncl || totalIncl <= 0) {
      toast({ title: 'Geen totaalbedrag', description: 'Open de offerte om eerst een totaalbedrag te berekenen.', variant: 'destructive' });
      return;
    }
    if (creating) return;

    setCreating(true);
    try {
      if (selectedType === 'voorschot') {
        const existingId = await findExistingVoorschotInvoiceId(firestore, { userId: user.uid, quoteId });
        if (existingId) {
          router.push(`/facturen/${existingId}`);
          return;
        }

        const invoiceId = await createInvoiceFromQuote(firestore, {
          userId: user.uid,
          quoteId,
          quote,
          settings,
          invoiceType: 'voorschot',
          originalTotalInclBtw: totalIncl,
          totalsInclBtw: voorschotBedrag,
          voorschotAftrekInclBtw: 0,
        });
        router.push(`/facturen/${invoiceId}`);
        return;
      }

      const existingId = await findExistingVoorschotInvoiceId(firestore, { userId: user.uid, quoteId });
      const voorschotSnapshot = existingId ? await getInvoiceSnapshotForAdjustments(firestore, existingId) : null;

      const invoiceId = await createInvoiceFromQuote(firestore, {
        userId: user.uid,
        quoteId,
        quote,
        settings,
        invoiceType: 'eind',
        originalTotalInclBtw: totalIncl,
        totalsInclBtw: eindBedrag,
        voorschotAftrekInclBtw: aftrek,
        voorschotFactuurSnapshot: voorschotSnapshot,
        opmerking: voorschotIngeschakeld && !existingId ? 'Voorschot in mindering (zonder voorschotfactuur)' : '',
      });
      router.push(`/facturen/${invoiceId}`);
    } catch (e) {
      console.error(e);
      toast({ title: 'Fout', description: 'Kon factuur niet aanmaken.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background pb-10">
      <AppNavigation />
      <DashboardHeader user={user} title="Nieuwe factuur" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" className="gap-2">
              <Link href={quoteId ? `/offertes/${quoteId}` : '/facturen'}>
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
          </div>

          {!quote ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">Offerte niet gevonden</div>
                <Button asChild variant="outline">
                  <Link href="/facturen">Terug naar facturen</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-400" />
                    Offerte {typeof quote?.offerteNummer === 'number' ? `#${quote.offerteNummer}` : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="text-muted-foreground">{(quote?.titel || quote?.title || quote?.werkomschrijving || '—').toString()}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Totaal (incl. BTW)</span>
                    <span className="font-semibold">{formatCurrency(totalIncl)}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedType === 'voorschot' ? 'success' : 'outline'}
                  className="h-11"
                  onClick={() => setSelectedType('voorschot')}
                >
                  Voorschotfactuur
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'eind' ? 'success' : 'outline'}
                  className="h-11"
                  onClick={() => setSelectedType('eind')}
                >
                  Eindfactuur
                </Button>
              </div>

              {selectedType === 'voorschot' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Voorschot</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Voorschot (%)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={voorschotPercentage}
                            onChange={(e) => setVoorschotPercentage(Number(e.target.value))}
                            className="pr-10"
                          />
                          <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Bedrag (incl. BTW)</Label>
                        <div className="h-10 rounded-md border border-input bg-background/50 px-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Voorschot</span>
                          <span className="text-sm font-semibold">{formatCurrency(voorschotBedrag)}</span>
                        </div>
                      </div>
                    </div>

                    {existingVoorschotId && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/facturen/${existingVoorschotId}`}>Open bestaande voorschotfactuur</Link>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="success"
                      className="w-full gap-2"
                      onClick={handleCreate}
                      disabled={!canCreate || creating}
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                      {existingVoorschotId ? 'Open voorschotfactuur' : 'Maak voorschotfactuur'}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Eindfactuur</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">Voorschot aftrekken</div>
                        <div className="text-sm text-muted-foreground">
                          Eindfactuur = totaal - voorschot (ook zonder voorschotfactuur).
                        </div>
                      </div>
                      <Switch checked={voorschotIngeschakeld} onCheckedChange={setVoorschotIngeschakeld} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Voorschot (%)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={voorschotPercentage}
                            onChange={(e) => setVoorschotPercentage(Number(e.target.value))}
                            disabled={!voorschotIngeschakeld}
                            className="pr-10"
                          />
                          <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Voorschot in mindering (incl. BTW)</Label>
                        <div className="h-10 rounded-md border border-input bg-background/50 px-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Aftrek</span>
                          <span className="text-sm font-semibold">{formatCurrency(aftrek)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="h-10 rounded-md border border-input bg-background/50 px-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Te betalen eindfactuur</span>
                      <span className="text-sm font-semibold">{formatCurrency(eindBedrag)}</span>
                    </div>

                    <Button
                      type="button"
                      variant="success"
                      className="w-full gap-2"
                      onClick={handleCreate}
                      disabled={!canCreate || creating}
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                      Maak eindfactuur
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function NieuweFactuurPageFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
    </div>
  );
}

export default function NieuweFactuurPage() {
  return (
    <Suspense fallback={<NieuweFactuurPageFallback />}>
      <NieuweFactuurPageContent />
    </Suspense>
  );
}
