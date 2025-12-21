'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import type { Quote } from '@/lib/types';

/* ---------------------------------------------
 Validatie (alleen klantinformatie)
--------------------------------------------- */

const KlantinformatieSchema = z.object({
  klanttype: z.enum(['particulier', 'zakelijk']),

  bedrijfsnaam: z.string().optional(),
  contactpersoon: z.string().optional(),

  voornaam: z.string().min(1, 'Voornaam is verplicht'),
  achternaam: z.string().min(1, 'Achternaam is verplicht'),

  emailadres: z.string().email('Ongeldig e-mailadres'),
  telefoonnummer: z.string().min(1, 'Telefoonnummer is verplicht'),

  straat: z.string().min(1, 'Straat is verplicht'),
  huisnummer: z.string().min(1, 'Huisnummer is verplicht'),
  postcode: z.string().min(1, 'Postcode is verplicht'),
  plaats: z.string().optional(),

  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),

  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});

/* ---------------------------------------------
 Helpers: geen null/undefined/"" opslaan
--------------------------------------------- */

function isLeeg(val: unknown) {
  return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
}

function schoonObject<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (isLeeg(v)) continue;

    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const nested = schoonObject(v);
      if (Object.keys(nested).length === 0) continue;
      cleaned[k] = nested;
      continue;
    }

    cleaned[k] = v;
  }
  return cleaned;
}

/* ---------------------------------------------
 Component
--------------------------------------------- */

export function NewQuoteForm({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [klanttype, setKlanttype] = useState<'particulier' | 'zakelijk'>('particulier');
  const [showProjectAddress, setShowProjectAddress] = useState(false);

  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();

  const [initialData, setInitialData] = useState<Partial<Quote> | null>(null);
  const [isLoading, setIsLoading] = useState(!!quoteId);

  /* ---------------------------------------------
  Prefill bij edit
  --------------------------------------------- */

  useEffect(() => {
    if (!quoteId || !firestore) return;

    const fetchQuote = async () => {
      setIsLoading(true);

      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast({ variant: 'destructive', title: 'Fout', description: 'Offerte niet gevonden.' });
          router.push('/');
          return;
        }

        const data = docSnap.data() as Quote;
        setInitialData(data);

        const ki: any = (data as any).klantinformatie;
        const typeFromDb: 'particulier' | 'zakelijk' =
          ki?.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier';

        setKlanttype(typeFromDb);
        setShowProjectAddress(!!ki?.afwijkendProjectadres);
      } catch (e) {
        console.error('Fout bij ophalen offerte:', e);
        toast({
          variant: 'destructive',
          title: 'Fout',
          description: 'Offertegegevens konden niet worden geladen.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId, firestore, router, toast]);

  /* ---------------------------------------------
  Submit (alles IN klantinformatie, alleen createdAt buiten)
  - Geen werkomschrijving meer
  - Geen null/lege velden opslaan
  --------------------------------------------- */

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
    const raw = Object.fromEntries(formData);

    startTransition(async () => {
      const validated = KlantinformatieSchema.safeParse(raw);

      if (!validated.success) {
        setErrors(validated.error.flatten().fieldErrors);
        toast({
          variant: 'destructive',
          title: 'Validatiefout',
          description: 'Controleer de gemarkeerde velden en probeer het opnieuw.',
        });
        return;
      }

      const {
        klanttype,
        bedrijfsnaam,
        contactpersoon,
        voornaam,
        achternaam,
        emailadres,
        telefoonnummer,
        straat,
        huisnummer,
        postcode,
        plaats,
        afwijkendProjectadres,
        projectStraat,
        projectHuisnummer,
        projectPostcode,
        projectPlaats,
      } = validated.data;

      // Bouw klantinformatie (zonder null/lege velden)
      const klantinformatieRuw: any = {
        // Alles in NL + exact zoals UI
        klanttype: klanttype === 'particulier' ? 'Particulier' : 'Zakelijk',

        // Alleen voor zakelijk opslaan
        bedrijfsnaam: klanttype === 'zakelijk' ? bedrijfsnaam : undefined,
        contactpersoon: klanttype === 'zakelijk' ? contactpersoon : undefined,

        voornaam,
        achternaam,

        'e-mailadres': emailadres,
        telefoonnummer,

        factuuradres: {
          straat,
          huisnummer, // incl. toevoeging
          postcode,
          plaats,
        },

        afwijkendProjectadres: !!afwijkendProjectadres,
        projectadres: !!afwijkendProjectadres
          ? {
              straat: projectStraat,
              huisnummer: projectHuisnummer,
              postcode: projectPostcode,
              plaats: projectPlaats,
            }
          : undefined,

        // Als je écht alles in klantinformatie wilt:
        userId: user.uid,
        status: 'concept',
        updatedAt: serverTimestamp(),
      };

      const klantinformatie = schoonObject(klantinformatieRuw);

      try {
        if (quoteId) {
          // Update bestaande offerte:
          // - set klantinformatie volledig (clean)
          // - verwijder optionele velden die leeg geworden zijn (zodat ze niet blijven hangen)
          const patch: any = {
            klantinformatie,
          };

          // Als klant zakelijk -> velden mogen bestaan, anders verwijderen we ze expliciet
          if (klantinformatieRuw.klanttype === 'Particulier') {
            patch['klantinformatie.bedrijfsnaam'] = deleteField();
            patch['klantinformatie.contactpersoon'] = deleteField();
          }

          // Als projectadres uit staat -> projectadres verwijderen
          if (!klantinformatieRuw.afwijkendProjectadres) {
            patch['klantinformatie.projectadres'] = deleteField();
          }

          const docRef = doc(firestore, 'quotes', quoteId);
          await updateDoc(docRef, patch);

          toast({
            title: 'Offerte bijgewerkt',
            description: 'U wordt doorgestuurd naar de volgende stap.',
          });

          router.push(`/offertes/${quoteId}/klus/nieuw`);
        } else {
          // Nieuwe offerte: alleen createdAt buiten klantinformatie
          const fullQuoteData: any = {
            createdAt: serverTimestamp(),
            klantinformatie,
          };

          const docRef = await addDoc(collection(firestore, 'quotes'), fullQuoteData);

          toast({
            title: 'Offerte aangemaakt',
            description: 'U wordt doorgestuurd naar de volgende stap.',
          });

          router.push(`/offertes/${docRef.id}/klus/nieuw`);
        }
      } catch (error) {
        console.error('Fout bij opslaan offerte:', error);
        const message =
          error instanceof Error
            ? `Database Fout: ${error.message}`
            : 'Database Fout: Offerte kon niet worden opgeslagen.';

        toast({
          variant: 'destructive',
          title: 'Fout',
          description: message,
        });
      }
    });
  };

  /* ---------------------------------------------
  Loading
  --------------------------------------------- */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-4 text-muted-foreground">Offertegegevens laden...</p>
      </div>
    );
  }

  /* ---------------------------------------------
  Defaults uit nieuwe structuur
  --------------------------------------------- */

  const ki: any = (initialData as any)?.klantinformatie;
  const factuur: any = ki?.factuuradres;
  const project: any = ki?.projectadres;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{quoteId ? 'Offerte bewerken' : 'Klantinformatie'}</CardTitle>
        <CardDescription>
          {quoteId
            ? 'Pas de klantgegevens van de offerte aan.'
            : 'Vul de klantgegevens in — dit komt op de offerte.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleFormSubmit} className="space-y-8">
          {/* Hidden: Switch moet als "on" meekomen voor zod preprocess */}
          <input
            type="hidden"
            name="afwijkendProjectadres"
            value={showProjectAddress ? 'on' : ''}
          />

          {/* Sectie 1 – Klanttype en naam */}
          <div className="space-y-4">
            <h3 className="font-medium text-lg">Klanttype en naam</h3>

            <RadioGroup
              name="klanttype"
              value={klanttype}
              onValueChange={(v) => setKlanttype(v as 'particulier' | 'zakelijk')}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="particulier" id="particulier" />
                <Label htmlFor="particulier">Particulier</Label>
              </div>

              <div className="flex items-center space-x-2">
                <RadioGroupItem value="zakelijk" id="zakelijk" />
                <Label htmlFor="zakelijk">Zakelijk</Label>
              </div>
            </RadioGroup>

            {klanttype === 'zakelijk' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <Label htmlFor="bedrijfsnaam">Bedrijfsnaam</Label>
                  <Input
                    id="bedrijfsnaam"
                    name="bedrijfsnaam"
                    defaultValue={ki?.bedrijfsnaam || ''}
                  />
                </div>

                <div>
                  <Label htmlFor="contactpersoon">Contactpersoon</Label>
                  <Input
                    id="contactpersoon"
                    name="contactpersoon"
                    defaultValue={ki?.contactpersoon || ''}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <Label htmlFor="voornaam">Voornaam *</Label>
                <Input
                  id="voornaam"
                  name="voornaam"
                  required
                  defaultValue={ki?.voornaam || ''}
                />
                {errors?.voornaam && (
                  <p className="text-sm text-destructive mt-1">{errors.voornaam[0]}</p>
                )}
              </div>

              <div>
                <Label htmlFor="achternaam">Achternaam *</Label>
                <Input
                  id="achternaam"
                  name="achternaam"
                  required
                  defaultValue={ki?.achternaam || ''}
                />
                {errors?.achternaam && (
                  <p className="text-sm text-destructive mt-1">{errors.achternaam[0]}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Sectie 2 – Contactgegevens */}
          <div className="space-y-4">
            <h3 className="font-medium text-lg">Contactgegevens</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emailadres">E-mailadres *</Label>
                <Input
                  id="emailadres"
                  name="emailadres"
                  type="email"
                  required
                  defaultValue={ki?.['e-mailadres'] || ''}
                />
                {errors?.emailadres && (
                  <p className="text-sm text-destructive mt-1">{errors.emailadres[0]}</p>
                )}
              </div>

              <div>
                <Label htmlFor="telefoonnummer">Telefoonnummer (mobiel) *</Label>
                <Input
                  id="telefoonnummer"
                  name="telefoonnummer"
                  type="tel"
                  required
                  defaultValue={ki?.telefoonnummer || ''}
                />
                {errors?.telefoonnummer && (
                  <p className="text-sm text-destructive mt-1">{errors.telefoonnummer[0]}</p>
                )}
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
                <Input id="straat" name="straat" required defaultValue={factuur?.straat || ''} />
                {errors?.straat && (
                  <p className="text-sm text-destructive mt-1">{errors.straat[0]}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="huisnummer">Huisnummer + toev. *</Label>
                <Input
                  id="huisnummer"
                  name="huisnummer"
                  required
                  defaultValue={factuur?.huisnummer || ''}
                />
                {errors?.huisnummer && (
                  <p className="text-sm text-destructive mt-1">{errors.huisnummer[0]}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  required
                  defaultValue={factuur?.postcode || ''}
                />
                {errors?.postcode && (
                  <p className="text-sm text-destructive mt-1">{errors.postcode[0]}</p>
                )}
              </div>

              <div className="md:col-span-4">
                <Label htmlFor="plaats">Plaats</Label>
                <Input id="plaats" name="plaats" defaultValue={factuur?.plaats || ''} />
                {errors?.plaats && (
                  <p className="text-sm text-destructive mt-1">{errors.plaats[0]}</p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="afwijkend-projectadres"
                checked={showProjectAddress}
                onCheckedChange={setShowProjectAddress}
              />
              <Label htmlFor="afwijkend-projectadres">Afwijkend projectadres</Label>
            </div>

            {showProjectAddress && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-4 border-t border-dashed mt-4">
                <div className="md:col-span-4">
                  <Label htmlFor="projectStraat">Projectstraat</Label>
                  <Input
                    id="projectStraat"
                    name="projectStraat"
                    defaultValue={project?.straat || ''}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="projectHuisnummer">Project huisnummer</Label>
                  <Input
                    id="projectHuisnummer"
                    name="projectHuisnummer"
                    defaultValue={project?.huisnummer || ''}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="projectPostcode">Project postcode</Label>
                  <Input
                    id="projectPostcode"
                    name="projectPostcode"
                    defaultValue={project?.postcode || ''}
                  />
                </div>

                <div className="md:col-span-4">
                  <Label htmlFor="projectPlaats">Project plaats</Label>
                  <Input
                    id="projectPlaats"
                    name="projectPlaats"
                    defaultValue={project?.plaats || ''}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" asChild>
              <Link href={quoteId ? `/offertes/${quoteId}` : '/'}>Annuleren</Link>
            </Button>

            <Button
              type="submit"
              disabled={isPending || !user}
              className="bg-accent text-accent-foreground hover:bg-accent/hover"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? 'Bezig...' : 'Volgende'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
