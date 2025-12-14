
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, Send, HardHat, Truck, Percent, Euro, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Quote, Job, KleinMateriaalConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

type MaterieelItem = {
  naam: string;
  prijs: string;
  per: 'dag' | 'week' | 'klus';
};

export default function OverzichtPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for this page's data
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

  useEffect(() => {
    if (isUserLoading || !firestore) return;
    if (!user) {
        router.push('/login');
        return;
    }

    const fetchQuoteData = async () => {
      setLoading(true);
      setError(null);
      const quoteRef = doc(firestore, 'quotes', quoteId);

      try {
        const docSnap = await getDoc(quoteRef);

        if (!docSnap.exists()) {
          setError("Offerte niet gevonden.");
          setLoading(false);
          return;
        }
        
        const quoteData = docSnap.data() as Quote;

        if (quoteData.userId !== user.uid) {
          setError("U heeft geen toegang tot deze offerte.");
          setLoading(false);
          return;
        }

        setQuote(quoteData);

        // Extract jobs from the quote object itself
        const extractedJobs: Job[] = [];
        if (quoteData.jobs && typeof quoteData.jobs === 'object') {
            for (const key in quoteData.jobs) {
                // @ts-ignore
                const jobData = quoteData.jobs[key];
                extractedJobs.push({
                    id: jobData.jobKey, // Use the key as an ID
                    quoteId: quoteId,
                    categorie: jobData.jobType,
                    omschrijvingKlant: jobData.presetLabel || jobData.jobType, // Fallback label
                    aantal: 1, // Default or find from data
                    createdAt: jobData.savedAt?.toDate().toISOString() || new Date().toISOString(),
                    ...jobData,
                });
            }
        }
        setJobs(extractedJobs);

      } catch (err: any) {
        console.error("Fout bij ophalen offertegegevens:", {
            quoteId: quoteId,
            uid: user.uid,
            pathTried: `quotes/${quoteId}`,
            errorCode: err.code,
            errorMessage: err.message,
        });
        setError("Kon de offertegegevens niet laden.");
        toast({
          variant: "destructive",
          title: "Fout",
          description: `Kon offerte niet laden: ${err.message}`,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchQuoteData();
  }, [quoteId, firestore, user, isUserLoading, router, toast]);

  const handleMaterieelChange = (index: number, field: keyof MaterieelItem, value: string) => {
    const newMaterieel = [...materieel];
    newMaterieel[index] = { ...newMaterieel[index], [field]: value };
    setMaterieel(newMaterieel);
  };

  const handleFinishQuote = () => {
    // Logic to save all data and generate quote will go here
    // For now, we can just navigate to the quote detail page
    toast({ title: "Offerte wordt gegenereerd...", description: "U wordt doorgestuurd." });
    router.push(`/offertes/${quoteId}`);
  };

  if (loading || isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-4 text-muted-foreground">Offerteoverzicht laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-destructive">Fout</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{error}</p>
            </CardContent>
            <CardFooter>
                 <Button asChild className="w-full">
                    <Link href="/">Terug naar dashboard</Link>
                </Button>
            </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
       <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            {/* This should ideally go back to the last material page */}
            <Link href={`/offertes/${quoteId}/klus/wanden/hsb-wand/materialen`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Terug</span>
            </Link>
          </Button>
        </div>
        <div className="text-center">
          <h1 className="font-semibold text-lg">Overzicht & Extra's</h1>
          <p className="text-xs text-muted-foreground">stap 6 van 6</p>
        </div>
        <div className="flex items-center justify-end">
          {quote ? (
            <p className="text-sm text-muted-foreground truncate"></p>
          ) : null}
        </div>
      </header>
      
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto w-full space-y-8">
          
          {/* Huidige klussen */}
          <Card>
            <CardHeader>
              <CardTitle>Huidige klus(sen)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.length > 0 ? jobs.map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 -m-3 rounded-lg bg-muted/30">
                  <p className="font-medium">{job.omschrijvingKlant}</p>
                </div>
              )) : (
                 <p className="text-sm text-muted-foreground italic text-center py-4">Er zijn nog geen klussen toegevoegd aan deze offerte.</p>
              )}
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
              <div className="space-y-2">
                <Label htmlFor="prijs-per-km">Prijs per km (€)</Label>
                <Input id="prijs-per-km" type="number" placeholder="0,00" value={prijsPerKm} onChange={e => setPrijsPerKm(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vaste-kosten">Vaste transportkosten (€)</Label>
                <Input id="vaste-kosten" type="number" placeholder="0,00" value={vasteTransportkosten} onChange={e => setVasteTransportkosten(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Materieel */}
          <Card>
             <CardHeader>
              <CardTitle>Materieel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {materieel.map((item, index) => (
                <div key={index} className="grid grid-cols-5 items-center gap-3">
                  <Label className="col-span-2">{item.naam}</Label>
                  <Input 
                    type="number" 
                    placeholder="Prijs" 
                    value={item.prijs}
                    onChange={e => handleMaterieelChange(index, 'prijs', e.target.value)}
                    className="col-span-2"
                  />
                   <Select value={item.per} onValueChange={(value) => handleMaterieelChange(index, 'per', value as 'dag' | 'week' | 'klus')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
              <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                          className={cn(
                              "p-4 rounded-lg border cursor-pointer",
                              onvoorzien.mode === 'percentage' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                          )}
                          onClick={() => setOnvoorzien(prev => ({...prev, mode: 'percentage'}))}
                      >
                          <h4 className="font-semibold flex items-center"><Percent className="mr-2 h-4 w-4"/> Percentage (%)</h4>
                          {onvoorzien.mode === 'percentage' && (
                              <div className="pt-2">
                                  <Label htmlFor="onvoorzien-percentage" className="sr-only">Percentage</Label>
                                  <Input id="onvoorzien-percentage" type="number" value={onvoorzien.percentage ?? ''} onChange={(e) => setOnvoorzien({ ...onvoorzien, percentage: e.target.value ? parseFloat(e.target.value) : null })} />
                              </div>
                          )}
                      </div>
                      <div
                          className={cn(
                              "p-4 rounded-lg border cursor-pointer",
                              onvoorzien.mode === 'fixed' ? "border-primary bg-muted/30" : "hover:bg-muted/50"
                          )}
                          onClick={() => setOnvoorzien(prev => ({...prev, mode: 'fixed'}))}
                      >
                          <h4 className="font-semibold flex items-center"><Euro className="mr-2 h-4 w-4"/> Vast bedrag (€)</h4>
                          {onvoorzien.mode === 'fixed' && (
                                <div className="pt-2">
                                  <Label htmlFor="onvoorzien-fixedAmount" className="sr-only">Bedrag</Label>
                                  <Input id="onvoorzien-fixedAmount" type="number" placeholder="Bijv. 50" value={onvoorzien.fixedAmount || ''} onChange={(e) => setOnvoorzien({ ...onvoorzien, fixedAmount: e.target.value ? Number(e.target.value) : null })}/>
                              </div>
                          )}
                      </div>
                  </div>
              </CardContent>
          </Card>
          
          <div className="mt-8 flex justify-end">
            <Button onClick={handleFinishQuote} className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="mr-2 h-4 w-4" />
              Offerte genereren
            </Button>
          </div>
        </div>
      </div>
    </main>
  
    