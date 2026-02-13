/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
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
import { cleanFirestoreData } from '@/lib/clean-firestore';

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

const DEV_CLIENT_AUTOFILL = {
  klanttype: 'Zakelijk',
  bedrijfsnaam: 'vroegop timmerwerken',
  contactpersoon: 'dylan',
  voornaam: 'Dylan',
  achternaam: 'Vroegop',
  emailadres: 'dylanvroegop2@gmail.com',
  telefoonnummer: '0657540176',
  straat: 'Spinhuisweg',
  huisnummer: '64',
  postcode: '4336 GB',
  plaats: 'Middelburg',
  afwijkendProjectadres: true,
  projectStraat: 'Bessestraat',
  projectHuisnummer: '3',
  projectPostcode: '4462 CK',
  projectPlaats: 'Goes',
} as const;

function hasKlantgegevens(data: Record<string, any> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  const keysToCheck = [
    'voornaam',
    'achternaam',
    'emailadres',
    'telefoonnummer',
    'straat',
    'huisnummer',
    'postcode',
    'plaats',
  ];
  return keysToCheck.some((key) => typeof data[key] === 'string' && data[key].trim().length > 0);
}

// function schoonObject removed in favor of cleanFirestoreData

/**
 * Haalt het volgende offerte-nummer op via transaction en verhoogt de teller.
 * - Start bij 260001 als teller nog niet bestaat.
 * - Per user eigen teller (voorkomt dat verschillende gebruikers elkaars nummers beïnvloeden).
 */


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
export function NewQuoteForm({ quoteId, backHref }: { quoteId?: string; backHref?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const formId = useId();

  const [klanttype, setKlanttype] = useState<'particulier' | 'zakelijk'>('particulier');
  const [showProjectAddress, setShowProjectAddress] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDevUser, setIsDevUser] = useState(false);
  const [isDevCheckDone, setIsDevCheckDone] = useState(false);
  const [quoteLoaded, setQuoteLoaded] = useState(!quoteId);

  // Data state
  const [initialKI, setInitialKI] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(!!quoteId);
  const [formKey, setFormKey] = useState(0);

  // Client Modal State
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const resolvedBackHref = backHref ?? (quoteId ? '/offertes' : '/');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDevClaim = async () => {
      if (!user) {
        if (!cancelled) {
          setIsDevUser(false);
          setIsDevCheckDone(true);
        }
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult(true);
        if (!cancelled) {
          setIsDevUser(tokenResult?.claims?.dev === true);
        }
      } catch {
        if (!cancelled) {
          setIsDevUser(false);
        }
      } finally {
        if (!cancelled) {
          setIsDevCheckDone(true);
        }
      }
    };

    setIsDevCheckDone(false);
    void loadDevClaim();

    return () => {
      cancelled = true;
    };
  }, [user]);

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
          setInitialKI(ki ?? null);
          setKlanttype(ki?.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier');
          setShowProjectAddress(!!ki?.afwijkendProjectadres);
          setFormKey((prev) => prev + 1);
        }
      } finally {
        setIsLoading(false);
        setQuoteLoaded(true);
      }
    };

    fetchQuote();
  }, [quoteId, firestore]);

  useEffect(() => {
    if (!quoteLoaded || !isDevCheckDone || !isDevUser) return;
    if (hasKlantgegevens(initialKI)) return;

    setInitialKI(DEV_CLIENT_AUTOFILL);
    setKlanttype('zakelijk');
    setShowProjectAddress(true);
    setFormKey((prev) => prev + 1);
  }, [initialKI, isDevCheckDone, isDevUser, quoteLoaded]);

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
  const selectClient = async (client: any) => {
    setInitialKI(client);
    setKlanttype(client.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier');
    setShowProjectAddress(!!client.afwijkendProjectadres);
    setFormKey((prev) => prev + 1);
    setIsClientModalOpen(false);

    if (quoteId && firestore) {
      try {
        // Strip metadata unrelated to the quote's embedded client info
        const { id, userId, createdAt, updatedAt, ...safeClientData } = client;

        await updateDoc(doc(firestore, 'quotes', quoteId), {
          klantinformatie: safeClientData,
          updatedAt: serverTimestamp(),
        });

        toast({
          title: 'Klant opgeslagen',
          description: `${client.voornaam} ${client.achternaam} is direct bijgewerkt.`
        });
      } catch (e) {
        console.error('Error auto-saving client selection:', e);
        toast({ variant: 'destructive', title: 'Fout bij opslaan geselecteerde klant' });
      }
    }
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

  const handleAutoSave = async (field: string, value: any) => {
    if (!quoteId || !firestore) return;
    try {
      // Clean the value before saving. If empty, it returns deleteField() (since isUpdate: true)
      // However, for nested fields like `klantinformatie.voornaam`, deleteField() works fine.
      const cleanValue = cleanFirestoreData(value, { isUpdate: true });

      await updateDoc(doc(firestore, 'quotes', quoteId), {
        [`klantinformatie.${field}`]: cleanValue,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !firestore) return;
    if (!quoteId) {
      toast({ variant: 'destructive', title: 'Geen offerte ID gevonden.' });
      return;
    }

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

      const cleanData = cleanFirestoreData({
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
        // 1) SAVE/UPDATE CLIENT in Address Book
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

        // 2) UPDATE QUOTE FINAL CHECK & NAVIGATE
        await updateDoc(doc(firestore, 'quotes', quoteId), {
          klantinformatie: cleanData
        });

        router.push(`/offertes/${quoteId}/klus/nieuw`);
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
    <>
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
          <form id={formId} key={formKey} onSubmit={handleFormSubmit} className="space-y-8">
          {showProjectAddress && <input type="hidden" name="afwijkendProjectadres" value="on" />}

          <RadioGroup
            name="klanttype"
            value={klanttype}
            onValueChange={(v: any) => {
              setKlanttype(v);
              handleAutoSave('klanttype', v === 'particulier' ? 'Particulier' : 'Zakelijk');
            }}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bedrijfsnaam">Bedrijfsnaam</Label>
                <Input
                  id="bedrijfsnaam"
                  name="bedrijfsnaam"
                  placeholder="Bedrijf B.V."
                  defaultValue={initialKI?.bedrijfsnaam}
                  onBlur={(e) => handleAutoSave('bedrijfsnaam', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactpersoon">Contactpersoon</Label>
                <Input
                  id="contactpersoon"
                  name="contactpersoon"
                  placeholder="Naam contactpersoon"
                  defaultValue={initialKI?.contactpersoon}
                  onBlur={(e) => handleAutoSave('contactpersoon', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="voornaam">Voornaam *</Label>
              <Input
                id="voornaam"
                name="voornaam"
                placeholder="Voornaam"
                required
                defaultValue={initialKI?.voornaam}
                onBlur={(e) => {
                  const v = formatCapitalize(e.target.value);
                  e.target.value = v;
                  handleAutoSave('voornaam', v);
                }}
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
                onBlur={(e) => {
                  const v = formatCapitalize(e.target.value);
                  e.target.value = v;
                  handleAutoSave('achternaam', v);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emailadres">E-mailadres *</Label>
              <Input
                id="emailadres"
                name="emailadres"
                type="email"
                placeholder="naam@voorbeeld.nl"
                required
                defaultValue={initialKI?.emailadres}
                onBlur={(e) => handleAutoSave('emailadres', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefoonnummer">Telefoonnummer *</Label>
              <Input
                id="telefoonnummer"
                name="telefoonnummer"
                type="tel"
                placeholder="06 12345678"
                required
                defaultValue={initialKI?.telefoonnummer}
                onBlur={(e) => handleAutoSave('telefoonnummer', e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* FACTUURADRES */}
          <div className="space-y-4">
            <h3 className="font-medium">Factuuradres</h3>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-4 space-y-1.5">
                <Label htmlFor="straat">Straat *</Label>
                <Input
                  id="straat"
                  name="straat"
                  placeholder="Straatnaam"
                  required

                  defaultValue={initialKI?.straat}
                  onBlur={(e) => {
                    const v = formatCapitalize(e.target.value);
                    e.target.value = v;
                    handleAutoSave('straat', v);
                  }}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="huisnummer">Nr. *</Label>
                <Input
                  id="huisnummer"
                  name="huisnummer"
                  placeholder="Nr."
                  required
                  defaultValue={initialKI?.huisnummer}
                  onBlur={(e) => handleAutoSave('huisnummer', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  placeholder="1234 AB"
                  required
                  defaultValue={initialKI?.postcode}
                  onBlur={(e) => {
                    const v = formatPostcode(e.target.value);
                    e.target.value = v;
                    handleAutoSave('postcode', v);
                  }}
                />
              </div>
              <div className="sm:col-span-4 space-y-1.5">
                <Label htmlFor="plaats">Plaats *</Label>
                <Input
                  id="plaats"
                  name="plaats"
                  placeholder="Plaatsnaam"
                  required
                  defaultValue={initialKI?.plaats}
                  onBlur={(e) => {
                    const v = formatCapitalize(e.target.value);
                    e.target.value = v;
                    handleAutoSave('plaats', v);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={showProjectAddress}
              onCheckedChange={(c: boolean) => {
                setShowProjectAddress(c);
                handleAutoSave('afwijkendProjectadres', c);
              }}
              id="project-switch"
            />
            <Label htmlFor="project-switch">Afwijkend projectadres</Label>
          </div>

          {/* PROJECTADRES */}
          {showProjectAddress && (
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 p-4 border rounded-md bg-muted/20">
              <div className="sm:col-span-4 space-y-1.5">
                <Label htmlFor="projectStraat">Straat</Label>
                <Input
                  id="projectStraat"
                  name="projectStraat"
                  placeholder="Straatnaam"
                  defaultValue={initialKI?.projectStraat}
                  onBlur={(e) => {
                    const v = formatCapitalize(e.target.value);
                    e.target.value = v;
                    handleAutoSave('projectStraat', v);
                  }}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="projectHuisnummer">Nr.</Label>
                <Input
                  id="projectHuisnummer"
                  name="projectHuisnummer"
                  placeholder="Nr."
                  defaultValue={initialKI?.projectHuisnummer}
                  onBlur={(e) => handleAutoSave('projectHuisnummer', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="projectPostcode">Postcode</Label>
                <Input
                  id="projectPostcode"
                  name="projectPostcode"
                  placeholder="1234 AB"
                  defaultValue={initialKI?.projectPostcode}
                  onBlur={(e) => {
                    const v = formatPostcode(e.target.value);
                    e.target.value = v;
                    handleAutoSave('projectPostcode', v);
                  }}
                />
              </div>
              <div className="sm:col-span-4 space-y-1.5">
                <Label htmlFor="projectPlaats">Plaats</Label>
                <Input
                  id="projectPlaats"
                  name="projectPlaats"
                  placeholder="Plaatsnaam"
                  defaultValue={initialKI?.projectPlaats}
                  onBlur={(e) => {
                    const v = formatCapitalize(e.target.value);
                    e.target.value = v;
                    handleAutoSave('projectPlaats', v);
                  }}
                />
              </div>
            </div>
          )}

          <div className="h-24" />

          </form>
        </CardContent>
      </Card>
      {isMounted
        ? createPortal(
            <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
              <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
                <Button variant="outline" asChild>
                  <Link href={resolvedBackHref}>Terug</Link>
                </Button>
                <Button form={formId} type="submit" variant="success" disabled={isPending}>
                  {isPending ? 'Opslaan...' : 'Opslaan'}
                </Button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
