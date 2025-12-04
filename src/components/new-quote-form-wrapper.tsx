'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createQuoteAction } from '@/lib/actions';
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
import { useAuth } from '@/firebase';

export function NewQuoteForm() {
  const [clientType, setClientType] = useState('particulier');
  const [showProjectAddress, setShowProjectAddress] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const { user } = useAuth();

  const router = useRouter();
  const { toast } = useToast();

  const handleFormSubmit = async (formData: FormData) => {
    setErrors({});
    
    if (!user) {
        toast({
            variant: 'destructive',
            title: 'Niet ingelogd',
            description: 'U moet ingelogd zijn om een offerte aan te maken.',
        });
        router.push('/login');
        return;
    }

    startTransition(async () => {
      // Dit is stap 1: klantgegevens en korte omschrijving verzamelen.
      // De server action maakt het document aan in Firestore.
      const result = await createQuoteAction(formData);

      if (result?.errors) {
        setErrors(result.errors);
        toast({
          variant: 'destructive',
          title: 'Validatiefout',
          description: result.message || 'Controleer de gemarkeerde velden en probeer het opnieuw.',
        });
      } else if (result?.message) {
          toast({
              variant: 'destructive',
              title: 'Fout',
              description: result.message,
          });
      } else if (result?.redirect) {
        toast({
          title: 'Offerte aangemaakt',
          description: 'U wordt doorgestuurd naar de volgende stap.',
        });
        router.push(result.redirect);
      }
    });
  };

  return (
     <Card>
      <CardHeader>
        <CardTitle>Klantinformatie</CardTitle>
        <CardDescription>
          Vul de klantgegevens in — dit komt op de offerte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleFormSubmit} className="space-y-8">
            <input type="hidden" name="clientSource" value="new" />
            
            {/* Sectie 1 – Klanttype en naam */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Klanttype en naam</h3>
              <RadioGroup name="clientType" defaultValue="particulier" onValueChange={setClientType} className="flex gap-6">
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
                        <Input id="bedrijfsnaam" name="bedrijfsnaam" placeholder="bv. Hout & Co" />
                    </div>
                     <div>
                        <Label htmlFor="contactpersoon">Contactpersoon</Label>
                        <Input id="contactpersoon" name="contactpersoon" placeholder="bv. Dhr. Jansen" />
                    </div>
                </div>
              )}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                        <Label htmlFor="voornaam">Voornaam *</Label>
                        <Input id="voornaam" name="voornaam" placeholder="Jan" required />
                        {errors?.['newClient.voornaam'] && <p className="text-sm text-destructive mt-1">{errors['newClient.voornaam'][0]}</p>}
                    </div>
                    <div>
                        <Label htmlFor="achternaam">Achternaam *</Label>
                        <Input id="achternaam" name="achternaam" placeholder="de Boer" required />
                        {errors?.['newClient.achternaam'] && <p className="text-sm text-destructive mt-1">{errors['newClient.achternaam'][0]}</p>}
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
                        <Input id="email" name="email" type="email" placeholder="jan@voorbeeld.nl" required />
                        {errors?.['newClient.email'] && <p className="text-sm text-destructive mt-1">{errors['newClient.email'][0]}</p>}
                    </div>
                    <div>
                        <Label htmlFor="telefoon">Telefoonnummer (mobiel) *</Label>
                        <Input id="telefoon" name="telefoon" type="tel" placeholder="0612345678" required />
                        {errors?.['newClient.telefoon'] && <p className="text-sm text-destructive mt-1">{errors['newClient.telefoon'][0]}</p>}
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
                        <Input id="straat" name="straat" placeholder="Voorbeeldstraat" required />
                    </div>
                     <div className="md:col-span-2">
                        <Label htmlFor="huisnummer">Huisnummer + toev. *</Label>
                        <Input id="huisnummer" name="huisnummer" placeholder="123 A" required />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="postcode">Postcode *</Label>
                        <Input id="postcode" name="postcode" placeholder="1234 AB" required />
                    </div>
                     <div className="md:col-span-4">
                        <Label htmlFor="plaats">Plaats</Label>
                        <Input id="plaats" name="plaats" placeholder="Amsterdam" />
                    </div>
                 </div>
                 <div className="flex items-center space-x-2 pt-2">
                    <Switch id="afwijkend-projectadres" name="afwijkendProjectadres" onCheckedChange={setShowProjectAddress} />
                    <Label htmlFor="afwijkend-projectadres">Afwijkend projectadres</Label>
                </div>
                {showProjectAddress && (
                     <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-4 border-t border-dashed mt-4">
                         <div className="md:col-span-4">
                            <Label htmlFor="projectStraat">Projectstraat</Label>
                            <Input id="projectStraat" name="projectStraat" placeholder="Klusstraat" />
                        </div>
                         <div className="md:col-span-2">
                            <Label htmlFor="projectHuisnummer">Project huisnummer</Label>
                            <Input id="projectHuisnummer" name="projectHuisnummer" placeholder="456" />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="projectPostcode">Project postcode</Label>
                            <Input id="projectPostcode" name="projectPostcode" placeholder="5678 CD" />
                        </div>
                         <div className="md:col-span-4">
                            <Label htmlFor="projectPlaats">Project plaats</Label>
                            <Input id="projectPlaats" name="projectPlaats" placeholder="Utrecht" />
                        </div>
                     </div>
                )}
            </div>
            <Separator />

            {/* Sectie 4 – Korte omschrijving */}
            <div className="space-y-4">
                 <h3 className="font-medium text-lg">Korte omschrijving van het werk</h3>
                 <p className="text-sm text-muted-foreground">Geef in één zin aan wat er moet gebeuren. Wij maken er later een duidelijke werkbeschrijving van.</p>
                 <div>
                    <Label htmlFor="werkomschrijving">Werkomschrijving *</Label>
                    <Textarea 
                        id="werkomschrijving" 
                        name="werkomschrijving"
                        required 
                        maxLength={800}
                        placeholder="Bijv. Plaatsen van HSB wand in keuken, incl. isolatie & gips."
                        className="min-h-[100px]"
                    />
                    {errors?.werkomschrijving && <p className="text-sm text-destructive mt-1">{errors.werkomschrijving[0]}</p>}
                 </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" asChild>
                    <Link href="/">Annuleren</Link>
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
