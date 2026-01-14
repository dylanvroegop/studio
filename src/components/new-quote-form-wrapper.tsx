'use client';

import { useEffect, useState, useTransition, useMemo } from 'react';
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
  query,
  where,
  getDocs,
  orderBy,
  runTransaction,
  setDoc,
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
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Search,
  User,
  Building2,
  ChevronRight,
  BookUser
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';

/* ---------------------------------------------
 Formatters & Helpers
--------------------------------------------- */
function formatCapitalize(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPostcode(value: string) {
  if (!value) return '';
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length === 6) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  return clean;
}

function schoonObject(obj: any) {
  const cleaned: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    cleaned[k] = v;
  }
  return cleaned;
}

/**
 * Haalt het volgende offerte-nummer op via transaction en verhoogt de teller.
 * - Start bij 260001 als teller nog niet bestaat.
 * - Per user eigen teller (voorkomt dat verschillende gebruikers elkaars nummers beïnvloeden).
 */
async function reserveerVolgendOfferteNummer(params: {
  firestore: any;
  userId: string;
  startNummer?: number;
}): Promise<number> {
  const { firestore, userId, startNummer = 260001 } = params;

  const counterRef = doc(firestore, 'counters', `quoteNumber_${userId}`);

  const offerteNummer = await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(counterRef);

    const huidigeVolgende: number =
      snap.exists() && typeof snap.data()?.next === 'number'
        ? snap.data().next
        : startNummer;

    const nieuweVolgende = huidigeVolgende + 1;

    // Counter doc updaten/aanmaken binnen dezelfde transaction
    tx.set(
      counterRef,
      {
        next: nieuweVolgende,
        updatedAt: serverTimestamp(),
        userId,
      },
      { merge: true }
    );

    return huidigeVolgende;
  });

  return offerteNummer;
}

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

  // Data state
  const [initialKI, setInitialKI] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(!!quoteId);
  const [formKey, setFormKey] = useState(0);

  // Client Modal State
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Quote (if editing)
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
          setFormKey((prev) => prev + 1);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId, firestore]);

  // 2. Fetch Clients (ordered by newest first)
  useEffect(() => {
    if (!user || !firestore) return;

    const fetchClients = async () => {
      try {
        const q = query(
          collection(firestore, 'clients'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClients(list);
      } catch (e) {
        // Fallback zonder index
        const q = query(collection(firestore, 'clients'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setClients(list);
      }
    };

    fetchClients();
  }, [user, firestore]);

  // Handle Selection
  const selectClient = (client: any) => {
    setInitialKI(client);
    setKlanttype(client.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier');
    setShowProjectAddress(!!client.afwijkendProjectadres);
    setFormKey((prev) => prev + 1);
    setIsClientModalOpen(false);
    toast({ title: 'Klant geselecteerd', description: `${client.voornaam} ${client.achternaam} is ingevuld.` });
  };

  // Filter logic
  const filteredClients = useMemo(() => {
    const term = searchQuery.toLowerCase();
    return clients.filter(c => {
      const name = `${c.voornaam} ${c.achternaam} ${c.bedrijfsnaam || ''}`.toLowerCase();
      const email = (c.emailadres || '').toLowerCase();
      const city = (c.plaats || '').toLowerCase();
      return name.includes(term) || email.includes(term) || city.includes(term);
    });
  }, [clients, searchQuery]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !firestore) return;

    const formData = new FormData(event.currentTarget);
    const raw: any = Object.fromEntries(formData);

    // Formatting
    if (typeof raw.voornaam === 'string') raw.voornaam = formatCapitalize(raw.voornaam);
    if (typeof raw.achternaam === 'string') raw.achternaam = formatCapitalize(raw.achternaam);
    if (typeof raw.straat === 'string') raw.straat = formatCapitalize(raw.straat);
    if (typeof raw.plaats === 'string') raw.plaats = formatCapitalize(raw.plaats);
    if (typeof raw.postcode === 'string') raw.postcode = formatPostcode(raw.postcode);
    if (typeof raw.projectStraat === 'string') raw.projectStraat = formatCapitalize(raw.projectStraat);
    if (typeof raw.projectPlaats === 'string') raw.projectPlaats = formatCapitalize(raw.projectPlaats);
    if (typeof raw.projectPostcode === 'string') raw.projectPostcode = formatPostcode(raw.projectPostcode);

    startTransition(async () => {
      const validated = KlantinformatieSchema.safeParse(raw);
      if (!validated.success) {
        toast({ variant: 'destructive', title: 'Vul alle verplichte velden in' });
        return;
      }

      const cleanData = schoonObject({
        ...validated.data,
        userId: user.uid,
        updatedAt: serverTimestamp(),
        klanttype: validated.data.klanttype === 'particulier' ? 'Particulier' : 'Zakelijk',
        ...(validated.data.afwijkendProjectadres ? {
          afwijkendProjectadres: true,
          projectStraat: validated.data.projectStraat,
          projectHuisnummer: validated.data.projectHuisnummer,
          projectPostcode: validated.data.projectPostcode,
          projectPlaats: validated.data.projectPlaats,
        } : {
          afwijkendProjectadres: false,
        })
      });

      try {
        // 1) SAVE/UPDATE CLIENT
        const clientRef = collection(firestore, 'clients');
        const q = query(
          clientRef,
          where('emailadres', '==', cleanData.emailadres),
          where('userId', '==', user.uid)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docId = snap.docs[0].id;
          await updateDoc(doc(firestore, 'clients', docId), { ...cleanData, updatedAt: serverTimestamp() });
        } else {
          await addDoc(clientRef, { ...cleanData, createdAt: serverTimestamp() });
        }

        // 2) SAVE QUOTE
        if (quoteId) {
          // Bewerken: geen nieuw offertnummer aanmaken
          await updateDoc(doc(firestore, 'quotes', quoteId), { klantinformatie: cleanData });
          router.push(`/offertes/${quoteId}/klus/nieuw`);
          return;
        }

        // Nieuw: eerst een uniek offertenummer reserveren (transaction)
        const offerteNummer = await reserveerVolgendOfferteNummer({
          firestore,
          userId: user.uid,
          startNummer: 260001,
        });

        const docRef = await addDoc(collection(firestore, 'quotes'), {
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          offerteNummer, // ✅ jouw nummer zoals 260001
          klantinformatie: cleanData,
        });

        router.push(`/offertes/${docRef.id}/klus/nieuw`);
      } catch (e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Fout bij opslaan' });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="animate-spin inline mr-2" /> Laden...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle>{quoteId ? 'Offerte bewerken' : 'Klantinformatie'}</CardTitle>
            <CardDescription>Vul de gegevens van de klant in.</CardDescription>
          </div>

          <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-2">
                <BookUser className="h-4 w-4" />
                <span className="hidden sm:inline">Adresboek</span>
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Klant selecteren</DialogTitle>
              </DialogHeader>

              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam, bedrijf of e-mail..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto mt-2 -mx-2 px-2 space-y-2">
                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Geen klanten gevonden.
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const isZakelijk = client.klanttype === 'Zakelijk';
                    return (
                      <div
                        key={client.id}
                        onClick={() => selectClient(client)}
                        className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                              isZakelijk ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
                            )}
                          >
                            {isZakelijk ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {client.voornaam} {client.achternaam}
                              {isZakelijk && (
                                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  Zakelijk
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isZakelijk && client.bedrijfsnaam ? `${client.bedrijfsnaam} • ` : ''}
                              {client.plaats}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <form key={formKey} onSubmit={handleFormSubmit} className="space-y-8">
          {showProjectAddress && <input type="hidden" name="afwijkendProjectadres" value="on" />}

          <RadioGroup
            name="klanttype"
            value={klanttype}
            onValueChange={(v: any) => setKlanttype(v)}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="particulier" id="p" />
              <Label htmlFor="p">Particulier</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="zakelijk" id="z" />
              <Label htmlFor="z">Zakelijk</Label>
            </div>
          </RadioGroup>

          {klanttype === 'zakelijk' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bedrijfsnaam">Bedrijfsnaam</Label>
                <Input id="bedrijfsnaam" name="bedrijfsnaam" placeholder="Bedrijf B.V." defaultValue={initialKI?.bedrijfsnaam} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactpersoon">Contactpersoon</Label>
                <Input id="contactpersoon" name="contactpersoon" placeholder="Naam contactpersoon" defaultValue={initialKI?.contactpersoon} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="voornaam">Voornaam *</Label>
              <Input
                id="voornaam"
                name="voornaam"
                placeholder="Voornaam"
                required
                defaultValue={initialKI?.voornaam}
                onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="achternaam">Achternaam *</Label>
              <Input
                id="achternaam"
                name="achternaam"
                placeholder="Achternaam"
                required
                defaultValue={initialKI?.achternaam}
                onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emailadres">E-mailadres *</Label>
              <Input id="emailadres" name="emailadres" type="email" placeholder="naam@voorbeeld.nl" required defaultValue={initialKI?.emailadres} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefoonnummer">Telefoonnummer *</Label>
              <Input id="telefoonnummer" name="telefoonnummer" type="tel" placeholder="06 12345678" required defaultValue={initialKI?.telefoonnummer} />
            </div>
          </div>

          <Separator />

          {/* FACTUURADRES */}
          <div className="space-y-4">
            <h3 className="font-medium">Factuuradres</h3>
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-4 space-y-1.5">
                <Label htmlFor="straat">Straat *</Label>
                <Input
                  id="straat"
                  name="straat"
                  placeholder="Straatnaam"
                  required
                  defaultValue={initialKI?.straat}
                  onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="huisnummer">Nr. *</Label>
                <Input id="huisnummer" name="huisnummer" placeholder="Nr." required defaultValue={initialKI?.huisnummer} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  placeholder="1234 AB"
                  required
                  defaultValue={initialKI?.postcode}
                  onBlur={(e) => (e.target.value = formatPostcode(e.target.value))}
                />
              </div>
              <div className="col-span-4 space-y-1.5">
                <Label htmlFor="plaats">Plaats *</Label>
                <Input
                  id="plaats"
                  name="plaats"
                  placeholder="Plaatsnaam"
                  required
                  defaultValue={initialKI?.plaats}
                  onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch checked={showProjectAddress} onCheckedChange={setShowProjectAddress} id="project-switch" />
            <Label htmlFor="project-switch">Afwijkend projectadres</Label>
          </div>

          {/* PROJECTADRES */}
          {showProjectAddress && (
            <div className="grid grid-cols-6 gap-4 p-4 border rounded-md bg-muted/20">
              <div className="col-span-4 space-y-1.5">
                <Label htmlFor="projectStraat">Straat</Label>
                <Input
                  id="projectStraat"
                  name="projectStraat"
                  placeholder="Straatnaam"
                  defaultValue={initialKI?.projectStraat}
                  onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="projectHuisnummer">Nr.</Label>
                <Input id="projectHuisnummer" name="projectHuisnummer" placeholder="Nr." defaultValue={initialKI?.projectHuisnummer} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="projectPostcode">Postcode</Label>
                <Input
                  id="projectPostcode"
                  name="projectPostcode"
                  placeholder="1234 AB"
                  defaultValue={initialKI?.projectPostcode}
                  onBlur={(e) => (e.target.value = formatPostcode(e.target.value))}
                />
              </div>
              <div className="col-span-4 space-y-1.5">
                <Label htmlFor="projectPlaats">Plaats</Label>
                <Input
                  id="projectPlaats"
                  name="projectPlaats"
                  placeholder="Plaatsnaam"
                  defaultValue={initialKI?.projectPlaats}
                  onBlur={(e) => (e.target.value = formatCapitalize(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="flex w-full justify-between items-center pt-4">
            <Button variant="ghost" asChild>
              <Link href="/">Annuleren</Link>
            </Button>
            <Button type="submit" variant="success" disabled={isPending}>
              {isPending ? 'Bezig...' : 'Volgende'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
