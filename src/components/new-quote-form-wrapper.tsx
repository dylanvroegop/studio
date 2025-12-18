
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useUser, useFirestore } from '@/firebase';
import { z } from 'zod';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { Quote } from '@/lib/types';


const QuoteFormSchema = z.object({
  title: z.string().min(1, 'Geef een titel voor de offerte.'),
  clientType: z.enum(['particulier', 'zakelijk']),
  bedrijfsnaam: z.string().optional(),
  contactpersoon: z.string().optional(),
  voornaam: z.string().min(1, 'Voornaam is verplicht'),
  achternaam: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig emailadres'),
  telefoon: z.string().min(1, 'Telefoonnummer is verplicht'),
  straat: z.string().min(1, 'Straat is verplicht'),
  huisnummer: z.string().min(1, 'Huisnummer is verplicht'),
  postcode: z.string().min(1, 'Postcode is verplicht'),
  plaats: z.string().min(1, 'Plaats is verplicht').optional(),
  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});


export function NewQuoteForm({ quoteId }: { quoteId?: string }) {
  const [clientType, setClientType] = useState('particulier');
  const [showProjectAddress, setShowProjectAddress] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const { user } = useUser();
  const firestore = useFirestore();
  const [initialData, setInitialData] = useState<Partial<Quote> | null>(null);
  const [isLoading, setIsLoading] = useState(!!quoteId);

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (quoteId && firestore) {
      const fetchQuote = async () => {
        setIsLoading(true);
        const docRef = doc(firestore, 'quotes', quoteId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Quote;
          setInitialData(data);
          setClientType(data.clientType === 'Zakelijk' ? 'zakelijk' : 'particulier');
          setShowProjectAddress(data.hasDifferentProjectAddress || false);
        } else {
          toast({ variant: 'destructive', title: 'Fout', description: 'Offerte niet gevonden.' });
          router.push('/');
        }
        setIsLoading(false);
      };
      fetchQuote();
    }
  }, [quoteId, firestore, router, toast]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Niet ingelogd',
            description: 'U moet ingelogd zijn om een offerte aan te maken.',
        });
        if (!user) router.push('/login');
        return;
    }
    
    const formData = new FormData(event.currentTarget);
    const rawData = Object.fromEntries(formData);
    
    startTransition(async () => {
        const validatedFields = QuoteFormSchema.safeParse(rawData);

        if (!validatedFields.success) {
            setErrors(validatedFields.error.flatten().fieldErrors);
            toast({
              variant: 'destructive',
              title: 'Validatiefout',
              description: 'Controleer de gemarkeerde velden en probeer het opnieuw.',
            });
            return;
        }

        const { 
          title,
          clientType,
          bedrijfsnaam,
          contactpersoon,
          voornaam,
          achternaam,
          email,
          telefoon,
          straat,
          huisnummer,
          postcode,
          plaats,
          afwijkendProjectadres,
          projectStraat,
          projectHuisnummer,
          projectPostcode,
          projectPlaats,
        } = validatedFields.data;

        const quoteData = {
          userId: user.uid,
          updatedAt: serverTimestamp(),
          clientType: clientType === 'particulier' ? 'Particulier' : 'Zakelijk' as "Particulier" | "Zakelijk",
          companyName: bedrijfsnaam || null,
          contactPerson: contactpersoon || null,
          firstName: voornaam,
          lastName: achternaam,
          email: email,
          phone: telefoon,
          billingStreet: straat,
          billingHouseNumber: huisnummer,
          billingPostcode: postcode,
          billingCity: plaats || null,
          hasDifferentProjectAddress: afwijkendProjectadres || false,
          projectStreet: projectStraat || null,
          projectHouseNumber: projectHuisnummer || null,
          projectPostcode: projectPostcode || null,
          projectCity: projectPlaats || null,
          shortDescription: title,
          clientName: clientType === 'zakelijk' ? bedrijfsnaam || `${voornaam} ${achternaam}` : `${voornaam} ${achternaam}`,
          title: title,
      };

      try {
        if (quoteId) {
          // Update existing document
          const docRef = doc(firestore, "quotes", quoteId);
          await updateDoc(docRef, quoteData);
          toast({
            title: 'Offerte bijgewerkt',
            description: 'U wordt doorgestuurd naar de volgende stap.',
          });
          router.push(`/offertes/${quoteId}/klus/nieuw`);

        } else {
          // Create new document
          const fullQuoteData = { ...quoteData, status: "concept" as const, createdAt: serverTimestamp() };
          const docRef = await addDoc(collection(firestore, "quotes"), fullQuoteData);
          toast({
            title: 'Offerte aangemaakt',
            description: 'U wordt doorgestuurd naar de volgende stap.',
          });
          router.push(`/offertes/${docRef.id}/klus/nieuw`);
        }
      } catch (error) {
        console.error("Fout bij opslaan offerte:", error);
        let message = 'Database Fout: Offerte kon niet worden opgeslagen.';
        if (error instanceof Error) {
            message = `Database Fout: ${error.message}`;
        }
        toast({
          variant: 'destructive',
          title: 'Fout',
          description: message,
        });
      }
    });
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="ml-4 text-muted-foreground">Offertegegevens laden...</p>
        </div>
    );
  }

  return (
     <Card>
      <CardHeader>
        <CardTitle>{quoteId ? 'Offerte bewerken' : 'Klantinformatie'}</CardTitle>
        <CardDescription>
          {quoteId ? 'Pas de gegevens van de offerte aan.' : 'Vul de klantgegevens in — dit komt op de offerte.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFormSubmit} className="space-y-8">
            {/* Sectie 0 – Titel */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Offertetitel</h3>
              <p className="text-sm text-muted-foreground">Geef een korte, duidelijke titel voor de offerte. Dit is voor uw eigen referentie.</p>
              <div>
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  placeholder="Bijv. Aanbouw fam. Jansen, Keukenverbouwing"
                  defaultValue={initialData?.title || ''}
                />
                {errors?.title && <p className="text-sm text-destructive mt-1">{errors.title[0]}</p>}
              </div>
            </div>
            <Separator />
            {/* Sectie 1 – Klanttype en naam */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Klanttype en naam</h3>
              <RadioGroup name="clientType" value={clientType} onValueChange={setClientType} className="flex gap-6">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="particulier" id="particulier" />
                    <Label htmlFor="particulier">Particulier</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="zakelijk" id="zakelijk" />
                    <Label htmlFor="zakelijk">Zakelijk</Label>
                </div>
              </RadioGroup>

              {clientType === 'zakelijk' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                        <Label htmlFor="bedrijfsnaam">Bedrijfsnaam</Label>
                        <Input id="bedrijfsnaam" name="bedrijfsnaam" defaultValue={initialData?.companyName || ''} />
                    </div>
                     <div>
                        <Label htmlFor="contactpersoon">Contactpersoon</Label>
                        <Input id="contactpersoon" name="contactpersoon" defaultValue={initialData?.contactPerson || ''}/>
                    </div>
                </div>
              )}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                        <Label htmlFor="voornaam">Voornaam *</Label>
                        <Input id="voornaam" name="voornaam" required defaultValue={initialData?.firstName || ''} />
                        {errors?.voornaam && <p className="text-sm text-destructive mt-1">{errors.voornaam[0]}</p>}
                    </div>
                    <div>
                        <Label htmlFor="achternaam">Achternaam *</Label>
                        <Input id="achternaam" name="achternaam" required defaultValue={initialData?.lastName || ''} />
                        {errors?.achternaam && <p className="text-sm text-destructive mt-1">{errors.achternaam[0]}</p>}
                    </div>
                </div>
            </div>
            <Separator />

            {/* Sectie 2 – Contactgegevens */}
            <div className="space-y-4">
                 <h3 className="font-medium text-lg">Contactgegevens</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="email">E-mailadres *</Label>
                        <Input id="email" name="email" type="email" required defaultValue={initialData?.email || ''} />
                        {errors?.email && <p className="text-sm text-destructive mt-1">{errors.email[0]}</p>}
                    </div>
                    <div>
                        <Label htmlFor="telefoon">Telefoonnummer (mobiel) *</Label>
                        <Input id="telefoon" name="telefoon" type="tel" required defaultValue={initialData?.phone || ''} />
                        {errors?.telefoon && <p className="text-sm text-destructive mt-1">{errors.telefoon[0]}</p>}
                    </div>
                </div>
            </div>
            <Separator />

            {/* Sectie 3 – Adresgegevens */}
            <div className="space-y-4">
                 <h3 className="font-medium text-lg">Factuuradres / hoofdadres</h3>
                 <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-4">
                        <Label htmlFor="straat">Straat *</Label>
                        <Input id="straat" name="straat" required defaultValue={initialData?.billingStreet || ''} />
                        {errors?.straat && <p className="text-sm text-destructive mt-1">{errors.straat[0]}</p>}
                    </div>
                     <div className="md:col-span-2">
                        <Label htmlFor="huisnummer">Huisnummer + toev. *</Label>
                        <Input id="huisnummer" name="huisnummer" required defaultValue={initialData?.billingHouseNumber || ''} />
                        {errors?.huisnummer && <p className="text-sm text-destructive mt-1">{errors.huisnummer[0]}</p>}
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="postcode">Postcode *</Label>
                        <Input id="postcode" name="postcode" required defaultValue={initialData?.billingPostcode || ''} />
                         {errors?.postcode && <p className="text-sm text-destructive mt-1">{errors.postcode[0]}</p>}
                    </div>
                     <div className="md:col-span-4">
                        <Label htmlFor="plaats">Plaats</Label>
                        <Input id="plaats" name="plaats" defaultValue={initialData?.billingCity || ''} />
                         {errors?.plaats && <p className="text-sm text-destructive mt-1">{errors.plaats[0]}</p>}
                    </div>
                 </div>
                 <div className="flex items-center space-x-2 pt-2">
                    <Switch id="afwijkend-projectadres" name="afwijkendProjectadres" checked={showProjectAddress} onCheckedChange={setShowProjectAddress} />
                    <Label htmlFor="afwijkend-projectadres">Afwijkend projectadres</Label>
                </div>
                {showProjectAddress && (
                     <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-4 border-t border-dashed mt-4">
                         <div className="md:col-span-4">
                            <Label htmlFor="projectStraat">Projectstraat</Label>
                            <Input id="projectStraat" name="projectStraat" defaultValue={initialData?.projectStreet || ''} />
                        </div>
                         <div className="md:col-span-2">
                            <Label htmlFor="projectHuisnummer">Project huisnummer</Label>
                            <Input id="projectHuisnummer" name="projectHuisnummer" defaultValue={initialData?.projectHouseNumber || ''} />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="projectPostcode">Project postcode</Label>
                            <Input id="projectPostcode" name="projectPostcode" defaultValue={initialData?.projectPostcode || ''} />
                        </div>
                         <div className="md:col-span-4">
                            <Label htmlFor="projectPlaats">Project plaats</Label>
                            <Input id="projectPlaats" name="projectPlaats" defaultValue={initialData?.projectCity || ''} />
                        </div>
                     </div>
                )}
            </div>
            
            <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" asChild>
                    <Link href={quoteId ? `/offertes/${quoteId}` : '/'}>Annuleren</Link>
                </Button>
                <Button type="submit" disabled={isPending || !user} className="bg-accent text-accent-foreground hover:bg-accent/hover">
                     {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isPending ? 'Bezig...' : 'Volgende'}
                </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
}
