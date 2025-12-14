
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, Send, HardHat, Truck, Percent, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getQuoteById, getJobsForQuote } from '@/lib/data';
import type { Quote, Job, KleinMateriaalConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

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
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

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
    async function fetchData() {
      if (!quoteId) return;
      setLoading(true);
      try {
        const [quoteData, jobsData] = await Promise.all([
          getQuoteById(quoteId),
          getJobsForQuote(quoteId),
        ]);
        setQuote(quoteData || null);
        setJobs(jobsData);
      } catch (error) {
        console.error("Fout bij ophalen offertegegevens:", error);
        toast({
          variant: "destructive",
          title: "Fout",
          description: "Kon de offertegegevens niet laden.",
        });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [quoteId, toast]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Offerteoverzicht laden...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
       <header className="sticky top-0 z-10 grid h-14 w-full grid-cols-3 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-start">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            {/* This should ideally go back to the last material page */}
            <Link href={`/offertes/${quoteId}`}>
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
              {jobs.map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 -m-3 rounded-lg bg-muted/30">
                  <p className="font-medium">{job.omschrijvingKlant}</p>
                </div>
              ))}
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
                   <Select value={item.per} onValueChange={(value) => handleMaterieelChange(index, 'per', value)}>
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
  );
}
