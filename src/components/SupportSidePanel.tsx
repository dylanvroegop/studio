'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Globe, LifeBuoy, Loader2, Megaphone, MessageCircle, Send, Sparkles } from 'lucide-react';

import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

type PanelSection = 'feedback' | 'price-import' | 'nieuw';

type PriceImportFormState = {
  leverancierNaam: string;
  websiteUrl: string;
  materiaalType: string;
  materiaalCategorie: string;
  productVoorbeelden: string;
  regioOfFiliaal: string;
  opmerkingen: string;
  terugbelNummer: string;
};

const EMPTY_PRICE_IMPORT_FORM: PriceImportFormState = {
  leverancierNaam: '',
  websiteUrl: '',
  materiaalType: '',
  materiaalCategorie: '',
  productVoorbeelden: '',
  regioOfFiliaal: '',
  opmerkingen: '',
  terugbelNummer: '',
};

const SIDE_PANEL_ITEMS: Array<{
  id: PanelSection;
  title: string;
  icon: typeof MessageCircle;
}> = [
  { id: 'feedback', title: 'Feedback', icon: MessageCircle },
  { id: 'price-import', title: 'Prijs import aanvragen', icon: Globe },
  { id: 'nieuw', title: 'Nieuw', icon: Megaphone },
];

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SupportSidePanel() {
  const pathname = usePathname();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<PanelSection>('feedback');

  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  const [form, setForm] = useState<PriceImportFormState>(EMPTY_PRICE_IMPORT_FORM);
  const [allowPublicPriceScrape, setAllowPublicPriceScrape] = useState(false);
  const [allowAiScrape, setAllowAiScrape] = useState(false);
  const [isSavingImportRequest, setIsSavingImportRequest] = useState(false);

  const hidePanel = useMemo(() => {
    if (!pathname) return false;
    if (pathname === '/' || pathname === '/login' || pathname === '/register') return true;
    return pathname.startsWith('/view/');
  }, [pathname]);

  const updateForm = (key: keyof PriceImportFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetImportForm = () => {
    setForm(EMPTY_PRICE_IMPORT_FORM);
    setAllowPublicPriceScrape(false);
    setAllowAiScrape(false);
  };

  const submitFeedback = async () => {
    if (!user || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Niet beschikbaar',
        description: 'Feedback kan alleen worden verzonden wanneer je bent ingelogd.',
      });
      return;
    }

    const message = feedbackMessage.trim();
    if (message.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Feedback te kort',
        description: 'Omschrijf je feedback iets uitgebreider.',
      });
      return;
    }

    setIsSavingFeedback(true);
    try {
      const payload = cleanFirestoreData({
        userId: user.uid,
        bericht: message,
        bron: 'side_panel',
        status: 'nieuw',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(firestore, 'support_feedback'), payload);
      setFeedbackMessage('');
      toast({
        title: 'Feedback verzonden',
        description: 'Bedankt, je feedback is ontvangen.',
      });
    } catch (error) {
      console.error('Feedback verzenden mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Feedback kon niet worden verzonden.',
      });
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const submitPriceImportRequest = async () => {
    if (!user || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Niet beschikbaar',
        description: 'Aanvragen kunnen alleen worden verzonden wanneer je bent ingelogd.',
      });
      return;
    }

    const leverancierNaam = form.leverancierNaam.trim();
    const websiteUrl = form.websiteUrl.trim();
    const materiaalType = form.materiaalType.trim();

    if (!leverancierNaam || !websiteUrl || !materiaalType) {
      toast({
        variant: 'destructive',
        title: 'Verplichte velden missen',
        description: 'Vul leverancier, website en materiaaltype in.',
      });
      return;
    }

    if (!isValidHttpUrl(websiteUrl)) {
      toast({
        variant: 'destructive',
        title: 'Website ongeldig',
        description: 'Gebruik een volledige URL, bijvoorbeeld https://leverancier.nl',
      });
      return;
    }

    if (!allowPublicPriceScrape || !allowAiScrape) {
      toast({
        variant: 'destructive',
        title: 'Bevestiging nodig',
        description: 'Bevestig beide akkoord-vakken om door te gaan.',
      });
      return;
    }

    setIsSavingImportRequest(true);
    try {
      const payload = cleanFirestoreData({
        userId: user.uid,
        leverancierNaam,
        websiteUrl,
        materiaalType,
        materiaalCategorie: form.materiaalCategorie.trim(),
        productVoorbeelden: form.productVoorbeelden.trim(),
        regioOfFiliaal: form.regioOfFiliaal.trim(),
        opmerkingen: form.opmerkingen.trim(),
        terugbelNummer: form.terugbelNummer.trim(),
        userEmail: user.email || '',
        toestemmingOpenbarePrijsbronnen: true,
        toestemmingAiScrape: true,
        status: 'nieuw',
        bron: 'side_panel',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(firestore, 'price_import_requests'), payload);
      resetImportForm();

      toast({
        title: 'Aanvraag verzonden',
        description: 'Je aanvraag is ontvangen. We nemen contact met je op voor afstemming.',
      });
    } catch (error) {
      console.error('Prijs import aanvraag mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'De aanvraag kon niet worden verzonden.',
      });
    } finally {
      setIsSavingImportRequest(false);
    }
  };

  if (hidePanel) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[70]">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button className="h-12 rounded-xl px-4 shadow-lg" variant="outline">
            <LifeBuoy className="mr-2 h-4 w-4" />
            Support
          </Button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full max-w-full p-0 sm:max-w-4xl">
          <div className="grid h-full grid-cols-1 sm:grid-cols-[240px_1fr]">
            <div className="border-b bg-muted/40 p-4 sm:border-b-0 sm:border-r">
              <SheetHeader className="mb-4 text-left">
                <SheetTitle>Support</SheetTitle>
                <SheetDescription>Kies een onderdeel.</SheetDescription>
              </SheetHeader>

              <div className="space-y-1">
                {SIDE_PANEL_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                        active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-full overflow-y-auto p-5">
              {activeSection === 'feedback' ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Feedback</h3>
                    <p className="text-sm text-muted-foreground">
                      Deel verbeterpunten of bugs. Hoe concreter, hoe sneller we het kunnen oppakken.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="support-feedback">Bericht</Label>
                    <Textarea
                      id="support-feedback"
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      placeholder="Wat werkt niet goed of wat kan beter?"
                      className="min-h-[180px]"
                    />
                  </div>

                  <Button
                    onClick={submitFeedback}
                    disabled={isSavingFeedback || feedbackMessage.trim().length < 6}
                    variant="success"
                  >
                    {isSavingFeedback ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Feedback verzenden
                  </Button>
                </div>
              ) : null}

              {activeSection === 'price-import' ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold">Prijs import aanvragen</h3>
                    <p className="text-sm text-muted-foreground">
                      Vul zoveel mogelijk details in. Na je aanvraag nemen we contact met je op. Na bevestiging kan AI
                      openbare prijzen van de opgegeven websites verzamelen en als producten importeren met naam, prijs
                      en categorie.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="import-leverancier">Leverancier / website naam</Label>
                      <Input
                        id="import-leverancier"
                        value={form.leverancierNaam}
                        onChange={(e) => updateForm('leverancierNaam', e.target.value)}
                        placeholder="Bijv. Bouwmaat, Stiho, etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="import-url">Website URL</Label>
                      <Input
                        id="import-url"
                        value={form.websiteUrl}
                        onChange={(e) => updateForm('websiteUrl', e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="import-materiaal-type">Materiaal type</Label>
                      <Input
                        id="import-materiaal-type"
                        value={form.materiaalType}
                        onChange={(e) => updateForm('materiaalType', e.target.value)}
                        placeholder="Bijv. regelwerk, gips, isolatie, bevestiging"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="import-categorie">Materiaal categorie (optioneel)</Label>
                      <Input
                        id="import-categorie"
                        value={form.materiaalCategorie}
                        onChange={(e) => updateForm('materiaalCategorie', e.target.value)}
                        placeholder="Bijv. Wanden, Dak, Kozijnen"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import-voorbeelden">Productvoorbeelden / zoektermen</Label>
                    <Textarea
                      id="import-voorbeelden"
                      value={form.productVoorbeelden}
                      onChange={(e) => updateForm('productVoorbeelden', e.target.value)}
                      placeholder="Noem producten, maten, merken of links van pagina's met prijzen."
                      className="min-h-[110px]"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="import-regio">Regio of filiaal (optioneel)</Label>
                      <Input
                        id="import-regio"
                        value={form.regioOfFiliaal}
                        onChange={(e) => updateForm('regioOfFiliaal', e.target.value)}
                        placeholder="Bijv. Zeeland / Middelburg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="import-telefoon">Terugbelnummer (optioneel)</Label>
                      <Input
                        id="import-telefoon"
                        value={form.terugbelNummer}
                        onChange={(e) => updateForm('terugbelNummer', e.target.value)}
                        placeholder="06..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import-opmerkingen">Extra informatie</Label>
                    <Textarea
                      id="import-opmerkingen"
                      value={form.opmerkingen}
                      onChange={(e) => updateForm('opmerkingen', e.target.value)}
                      placeholder="Beschrijf precies wat je wilt laten importeren en waar AI op moet letten."
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border p-3">
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={allowPublicPriceScrape}
                        onCheckedChange={(checked) => setAllowPublicPriceScrape(checked === true)}
                      />
                      <span>
                        Ik bevestig dat de gevraagde prijzen op openbare webpagina&apos;s staan (zonder accountlogin).
                      </span>
                    </label>
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={allowAiScrape}
                        onCheckedChange={(checked) => setAllowAiScrape(checked === true)}
                      />
                      <span>
                        Ik geef toestemming dat AI deze openbare pagina&apos;s mag uitlezen om producten met naam, prijs
                        en categorie klaar te zetten.
                      </span>
                    </label>
                  </div>

                  <Button
                    onClick={submitPriceImportRequest}
                    disabled={isSavingImportRequest}
                    variant="success"
                  >
                    {isSavingImportRequest ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Aanvraag versturen
                  </Button>
                </div>
              ) : null}

              {activeSection === 'nieuw' ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Nieuw</h3>
                    <p className="text-sm text-muted-foreground">
                      Nieuwe updates en verbeteringen worden hier getoond.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 text-emerald-400" />
                      <div>
                        <div className="font-medium">Prijs import aanvragen</div>
                        <p className="text-muted-foreground">
                          Je kunt nu leveranciers en websites doorgeven zodat AI openbare prijzen kan voorbereiden voor
                          import in je productenlijst.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

