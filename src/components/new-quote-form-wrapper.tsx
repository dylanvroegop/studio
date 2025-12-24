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
 Helpers: geen lege velden opslaan
--------------------------------------------- */

function isLeeg(val: unknown) {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && val.trim() === '')
  );
}

function schoonObject<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isLeeg(v)) continue;
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

  const [initialKI, setInitialKI] = useState<Record<string, any> | null>(null);
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

        const data = docSnap.data() as any;
        const ki = (data?.klantinformatie ?? null) as any;

        setInitialKI(ki);

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
  Submit
  - Alles onder klantinformatie (1 map)
  - Alleen createdAt buiten klantinformatie
  - Geen status opslaan
  - Als afwijkendProjectadres = false: veld + projectvelden NIET opslaan
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

      const heeftProjectadres = !!afwijkendProjectadres;

      // 1 map: klantinformatie (GEEN sub-maps zoals factuuradres)
      const klantinformatieRuw: any = {
        // ownership hoort hier (regels checken hierop)
        userId: user.uid,

        // timestamps horen hier (alles behalve createdAt)
        updatedAt: serverTimestamp(),

        // velden exact NL (zoals UI)
        klanttype: klanttype === 'particulier' ? 'Particulier' : 'Zakelijk',

        bedrijfsnaam: klanttype === 'zakelijk' ? bedrijfsnaam : undefined,
        contactpersoon: klanttype === 'zakelijk' ? contactpersoon : undefined,

        voornaam,
        achternaam,

        emailadres,
        telefoonnummer,

        straat,
        huisnummer,
        postcode,
        plaats,

        // alleen opslaan als true
        afwijkendProjectadres: heeftProjectadres ? true : undefined,

        // projectvelden alleen als true
        projectStraat: heeftProjectadres ? projectStraat : undefined,
        projectHuisnummer: heeftProjectadres ? projectHuisnummer : undefined,
        projectPostcode: heeftProjectadres ? projectPostcode : undefined,
        projectPlaats: heeftProjectadres ? projectPlaats : undefined,
      };

      const klantinformatie = schoonObject(klantinformatieRuw);

      try {
        if (quoteId) {
          const patch: any = {
            klantinformatie,
          };

          // als Particulier => zakelijke velden weg
          if (klantinformatieRuw.klanttype === 'Particulier') {
            patch['klantinformatie.bedrijfsnaam'] = deleteField();
            patch['klantinformatie.contactpersoon'] = deleteField();
          }

          // als projectadres uit => alles weg + flag weg
          if (!heeftProjectadres) {
            patch['klantinformatie.afwijkendProjectadres'] = deleteField();
            patch['klantinformatie.projectStraat'] = deleteField();
            patch['klantinformatie.projectHuisnummer'] = deleteField();
            patch['klantinformatie.projectPostcode'] = deleteField();
            patch['klantinformatie.projectPlaats'] = deleteField();
          }

          // zeker weten dat oude rommel niet blijft hangen
          patch['status'] = deleteField();
          patch['updatedAt'] = deleteField();
          patch['userId'] = deleteField();

          patch['billingStreet'] = deleteField();
          patch['billingHouseNumber'] = deleteField();
          patch['billingPostcode'] = deleteField();
          patch['billingCity'] = deleteField();
          patch['projectStreet'] = deleteField();
          patch['projectHouseNumber'] = deleteField();
          patch['projectPostcode'] = deleteField();
          patch['projectCity'] = deleteField();
          patch['clientName'] = deleteField();
          patch['clientType'] = deleteField();
          patch['companyName'] = deleteField();
          patch['contactPerson'] = deleteField();
          patch['firstName'] = deleteField();
          patch['lastName'] = deleteField();
          patch['email'] = deleteField();
          patch['phone'] = deleteField();
          patch['shortDescription'] = deleteField();
          patch['title'] = deleteField();
          patch['hasDifferentProjectAddress'] = deleteField();

          const docRef = doc(firestore, 'quotes', quoteId);
          await updateDoc(docRef, patch);

          toast({
            title: 'Offerte bijgewerkt',
            description: 'U wordt doorgestuurd naar de volgende stap.',
          });
          router.push(`/offertes/${quoteId}/klus/nieuw`);
        } else {
          // nieuwe offerte: alleen createdAt buiten klantinformatie
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

  const ki = initialKI || {};

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
          {/* Hidden: zodat Zod preprocess "on" kan lezen */}
          <input type="hidden" name="afwijkendProjectadres" value={showProjectAddress ? 'on' : ''} />

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
                  <Input id="bedrijfsnaam" name="bedrijfsnaam" defaultValue={ki?.bedrijfsnaam || ''} />
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
                <Input id="voornaam" name="voornaam" required defaultValue={ki?.voornaam || ''} />
                {errors?.voornaam && <p className="text-sm text-destructive mt-1">{errors.voornaam[0]}</p>}
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
                  defaultValue={ki?.emailadres || ''}
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

          {/* Sectie 3 – Adresgegevens (GEEN factuuradres map) */}
          <div className="space-y-4">
            <h3 className="font-medium text-lg">Factuuradres / hoofdadres</h3>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-4">
                <Label htmlFor="straat">Straat *</Label>
                <Input id="straat" name="straat" required defaultValue={ki?.straat || ''} />
                {errors?.straat && <p className="text-sm text-destructive mt-1">{errors.straat[0]}</p>}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="huisnummer">Huisnummer + toev. *</Label>
                <Input id="huisnummer" name="huisnummer" required defaultValue={ki?.huisnummer || ''} />
                {errors?.huisnummer && (
                  <p className="text-sm text-destructive mt-1">{errors.huisnummer[0]}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input id="postcode" name="postcode" required defaultValue={ki?.postcode || ''} />
                {errors?.postcode && (
                  <p className="text-sm text-destructive mt-1">{errors.postcode[0]}</p>
                )}
              </div>

              <div className="md:col-span-4">
                <Label htmlFor="plaats">Plaats</Label>
                <Input id="plaats" name="plaats" defaultValue={ki?.plaats || ''} />
                {errors?.plaats && <p className="text-sm text-destructive mt-1">{errors.plaats[0]}</p>}
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
                  <Input id="projectStraat" name="projectStraat" defaultValue={ki?.projectStraat || ''} />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="projectHuisnummer">Project huisnummer</Label>
                  <Input
                    id="projectHuisnummer"
                    name="projectHuisnummer"
                    defaultValue={ki?.projectHuisnummer || ''}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="projectPostcode">Project postcode</Label>
                  <Input
                    id="projectPostcode"
                    name="projectPostcode"
                    defaultValue={ki?.projectPostcode || ''}
                  />
                </div>

                <div className="md:col-span-4">
                  <Label htmlFor="projectPlaats">Project plaats</Label>
                  <Input id="projectPlaats" name="projectPlaats" defaultValue={ki?.projectPlaats || ''} />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
  <Button
    variant="outline"
    asChild
    className="hover:bg-destructive hover:text-destructive-foreground"
  >
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
