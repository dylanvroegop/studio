'use client';

import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { cn } from '@/lib/utils';

type ContactMethod = 'phone' | 'email';

type PriceImportFormState = {
  leverancierNaam: string;
  websiteUrl: string;
  materiaalType: string;
  productVoorbeelden: string;
  opmerkingen: string;
};

const EMPTY_FORM: PriceImportFormState = {
  leverancierNaam: '',
  websiteUrl: '',
  materiaalType: '',
  productVoorbeelden: '',
  opmerkingen: '',
};

interface PriceImportRequestFormProps {
  className?: string;
  onSuccess?: () => void;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PriceImportRequestForm({ className, onSuccess }: PriceImportRequestFormProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [form, setForm] = useState<PriceImportFormState>(EMPTY_FORM);
  const [contactMethod, setContactMethod] = useState<ContactMethod>('phone');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [hasLoadedDefaults, setHasLoadedDefaults] = useState(false);
  const [allowPublicPriceScrape, setAllowPublicPriceScrape] = useState(false);
  const [allowAiScrape, setAllowAiScrape] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user || !firestore || hasLoadedDefaults) return;

    let cancelled = false;

    const loadDefaults = async () => {
      const fallbackEmail = (user.email || '').trim();
      let phoneDefault = '';
      let emailDefault = fallbackEmail;

      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data() as {
            settings?: { telefoon?: string; email?: string };
            telefoon?: string;
            email?: string;
          };
          phoneDefault = (data.settings?.telefoon || data.telefoon || '').trim();
          emailDefault = (data.settings?.email || data.email || fallbackEmail).trim();
        }
      } catch (error) {
        console.warn('Kon standaard contactgegevens niet laden, fallback op account e-mail.', error);
      }

      if (cancelled) return;

      setContactPhone(phoneDefault);
      setContactEmail(emailDefault);
      setContactMethod(phoneDefault ? 'phone' : 'email');
      setHasLoadedDefaults(true);
    };

    void loadDefaults();

    return () => {
      cancelled = true;
    };
  }, [firestore, hasLoadedDefaults, user]);

  const updateForm = (key: keyof PriceImportFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setAllowPublicPriceScrape(false);
    setAllowAiScrape(false);
  };

  const submitRequest = async () => {
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
    const terugbelNummer = contactPhone.trim();
    const contactEmailTrimmed = contactEmail.trim();

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

    if (contactMethod === 'phone' && !terugbelNummer) {
      toast({
        variant: 'destructive',
        title: 'Telefoonnummer ontbreekt',
        description: 'Vul een terugbelnummer in of kies contact via e-mail.',
      });
      return;
    }

    if (contactMethod === 'email') {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmailTrimmed);
      if (!emailOk) {
        toast({
          variant: 'destructive',
          title: 'E-mailadres ongeldig',
          description: 'Vul een geldig e-mailadres in of kies contact via telefoon.',
        });
        return;
      }
    }

    if (!allowPublicPriceScrape || !allowAiScrape) {
      toast({
        variant: 'destructive',
        title: 'Bevestiging nodig',
        description: 'Bevestig beide akkoord-vakken om door te gaan.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = cleanFirestoreData({
        userId: user.uid,
        leverancierNaam,
        websiteUrl,
        materiaalType,
        productVoorbeelden: form.productVoorbeelden.trim(),
        opmerkingen: form.opmerkingen.trim(),
        contactVoorkeur: contactMethod,
        terugbelNummer: terugbelNummer || null,
        contactEmail: contactEmailTrimmed || null,
        contactKanaalWaarde: contactMethod === 'phone' ? terugbelNummer : contactEmailTrimmed,
        userEmail: user.email || '',
        toestemmingOpenbarePrijsbronnen: true,
        toestemmingAiScrape: true,
        status: 'nieuw',
        bron: 'price_import_page',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(firestore, 'price_import_requests'), payload);
      resetForm();
      toast({
        title: 'Aanvraag verzonden',
        description: 'Je aanvraag is ontvangen. We nemen contact met je op voor afstemming.',
      });
      onSuccess?.();
    } catch (error) {
      console.error('Prijs import aanvraag mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'De aanvraag kon niet worden verzonden.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('w-full rounded-xl border border-border/60 bg-card/40 p-6', className)}>
      <p className="text-sm text-muted-foreground">
        Vul zoveel mogelijk details in. Na je aanvraag nemen we contact met je op. Na bevestiging kan AI openbare
        prijzen van de opgegeven websites verzamelen en als producten importeren met naam, prijs en categorie.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="import-leverancier">Leverancier / website naam</Label>
          <Input
            id="import-leverancier"
            value={form.leverancierNaam}
            onChange={(event) => updateForm('leverancierNaam', event.target.value)}
            placeholder="Bijv. Bouwmaat, Stiho, etc."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-url">Website URL</Label>
          <Input
            id="import-url"
            value={form.websiteUrl}
            onChange={(event) => updateForm('websiteUrl', event.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="import-materiaal-type">Materiaal type</Label>
        <Input
          id="import-materiaal-type"
          value={form.materiaalType}
          onChange={(event) => updateForm('materiaalType', event.target.value)}
          placeholder="Bijv. regelwerk, gips, isolatie, bevestiging"
        />
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="import-voorbeelden">Productvoorbeelden / zoektermen</Label>
        <Textarea
          id="import-voorbeelden"
          value={form.productVoorbeelden}
          onChange={(event) => updateForm('productVoorbeelden', event.target.value)}
          placeholder="Noem producten, maten, merken of links van pagina's met prijzen."
          className="min-h-[120px]"
        />
      </div>

      <div className="mt-4 rounded-lg border p-4">
        <Label className="text-sm">Voorkeur contact</Label>
        <p className="mt-1 text-xs text-muted-foreground">Kies hoe je wilt dat we contact opnemen.</p>

        <RadioGroup
          value={contactMethod}
          onValueChange={(value) => setContactMethod(value as ContactMethod)}
          className="mt-3 gap-3"
        >
          <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <RadioGroupItem value="phone" id="contact-phone-choice" />
            <span>Telefoon</span>
          </label>
          <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <RadioGroupItem value="email" id="contact-email-choice" />
            <span>E-mail</span>
          </label>
        </RadioGroup>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="import-telefoon">Terugbelnummer (optioneel)</Label>
            <Input
              id="import-telefoon"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="06..."
              disabled={contactMethod !== 'phone'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-email">E-mailadres</Label>
            <Input
              id="import-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="naam@bedrijf.nl"
              disabled={contactMethod !== 'email'}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="import-opmerkingen">Extra informatie</Label>
        <Textarea
          id="import-opmerkingen"
          value={form.opmerkingen}
          onChange={(event) => updateForm('opmerkingen', event.target.value)}
          placeholder="Beschrijf precies wat je wilt laten importeren en waar AI op moet letten."
          className="min-h-[140px]"
        />
      </div>

      <div className="mt-4 space-y-3 rounded-lg border p-3">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={allowPublicPriceScrape} onCheckedChange={(checked) => setAllowPublicPriceScrape(checked === true)} />
          <span>Ik bevestig dat de gevraagde prijzen op openbare webpagina&apos;s staan (zonder accountlogin).</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={allowAiScrape} onCheckedChange={(checked) => setAllowAiScrape(checked === true)} />
          <span>
            Ik geef toestemming dat AI deze openbare pagina&apos;s mag uitlezen om producten met naam, prijs en
            categorie klaar te zetten.
          </span>
        </label>
      </div>

      <Button className="mt-5" onClick={submitRequest} disabled={isSaving} variant="success">
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Aanvraag versturen
      </Button>
    </div>
  );
}
