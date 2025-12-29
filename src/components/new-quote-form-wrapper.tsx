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
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';

/* ---------------------------------------------
 Validatie
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
  plaats: z.string().min(1, 'Plaats is verplicht'),
  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});

function schoonObject(obj: any) {
  const cleaned: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
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
  const [isPending, startTransition] = useTransition();
  const [initialKI, setInitialKI] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(!!quoteId);

  useEffect(() => {
    if (!quoteId || !firestore) return;
    const fetchQuote = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const ki = data?.klantinformatie;
          setInitialKI(ki);
          setKlanttype(ki?.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier');
          setShowProjectAddress(!!ki?.afwijkendProjectadres);
        }
      } finally { setIsLoading(false); }
    };
    fetchQuote();
  }, [quoteId, firestore]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !firestore) return;

    const formData = new FormData(event.currentTarget);
    const raw = Object.fromEntries(formData);

    startTransition(async () => {
      const validated = KlantinformatieSchema.safeParse(raw);
      if (!validated.success) {
        toast({ variant: 'destructive', title: 'Vul alle verplichte velden in' });
        return;
      }

      const klantinformatie = schoonObject({
        ...validated.data,
        userId: user.uid,
        updatedAt: serverTimestamp(),
        klanttype: validated.data.klanttype === 'particulier' ? 'Particulier' : 'Zakelijk',
      });

      try {
        if (quoteId) {
          await updateDoc(doc(firestore, 'quotes', quoteId), { klantinformatie });
          router.push(`/offertes/${quoteId}/klus/nieuw`);
        } else {
          const docRef = await addDoc(collection(firestore, 'quotes'), {
            createdAt: serverTimestamp(),
            klantinformatie,
          });
          router.push(`/offertes/${docRef.id}/klus/nieuw`);
        }
      } catch (e) {
        toast({ variant: 'destructive', title: 'Fout bij opslaan' });
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline mr-2" /> Laden...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{quoteId ? 'Offerte bewerken' : 'Klantinformatie'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFormSubmit} className="space-y-8">
          <input type="hidden" name="afwijkendProjectadres" value={showProjectAddress ? 'on' : ''} />
          
          <RadioGroup name="klanttype" value={klanttype} onValueChange={(v: any) => setKlanttype(v)} className="flex gap-6">
            <div className="flex items-center space-x-2"><RadioGroupItem value="particulier" id="p" /><Label htmlFor="p">Particulier</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="zakelijk" id="z" /><Label htmlFor="z">Zakelijk</Label></div>
          </RadioGroup>

          {klanttype === 'zakelijk' && (
            <div className="grid grid-cols-2 gap-4">
              <Input name="bedrijfsnaam" placeholder="Bedrijfsnaam" defaultValue={initialKI?.bedrijfsnaam} />
              <Input name="contactpersoon" placeholder="Contactpersoon" defaultValue={initialKI?.contactpersoon} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input name="voornaam" placeholder="Voornaam *" required defaultValue={initialKI?.voornaam} />
            <Input name="achternaam" placeholder="Achternaam *" required defaultValue={initialKI?.achternaam} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <Input name="emailadres" type="email" placeholder="E-mail *" required defaultValue={initialKI?.emailadres} />
            <Input name="telefoonnummer" type="tel" placeholder="Telefoon *" required defaultValue={initialKI?.telefoonnummer} />
          </div>

          <Separator />

          {/* FACTUURADRES */}
          <div className="space-y-4">
            <h3 className="font-medium">Factuuradres</h3>
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-4">
                <Input name="straat" placeholder="Straat *" required defaultValue={initialKI?.straat} />
              </div>
              <div className="col-span-2">
                <Input name="huisnummer" placeholder="Nr. *" required defaultValue={initialKI?.huisnummer} />
              </div>
              <div className="col-span-2">
                <Input name="postcode" placeholder="Postcode *" required defaultValue={initialKI?.postcode} />
              </div>
              <div className="col-span-4">
                <Input name="plaats" placeholder="Plaats *" required defaultValue={initialKI?.plaats} />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch checked={showProjectAddress} onCheckedChange={setShowProjectAddress} />
            <Label>Afwijkend projectadres</Label>
          </div>

          {/* PROJECTADRES */}
          {showProjectAddress && (
            <div className="grid grid-cols-6 gap-4 p-4 border rounded-md bg-muted/20">
              <div className="col-span-4">
                <Input name="projectStraat" placeholder="Projectstraat" defaultValue={initialKI?.projectStraat} />
              </div>
              <div className="col-span-2">
                <Input name="projectHuisnummer" placeholder="Nr." defaultValue={initialKI?.projectHuisnummer} />
              </div>
              <div className="col-span-2">
                <Input name="projectPostcode" placeholder="Postcode" defaultValue={initialKI?.projectPostcode} />
              </div>
              <div className="col-span-4">
                <Input name="projectPlaats" placeholder="Plaats" defaultValue={initialKI?.projectPlaats} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-4">
            <Button variant="outline" asChild><Link href="/">Annuleren</Link></Button>
            <Button type="submit" variant="success" disabled={isPending}>{isPending ? 'Bezig...' : 'Volgende'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}