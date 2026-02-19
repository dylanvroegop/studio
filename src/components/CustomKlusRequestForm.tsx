'use client';

import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { cn } from '@/lib/utils';

type CustomKlusFormState = {
  titel: string;
  omschrijving: string;
  contactNaam: string;
  telefoon: string;
  email: string;
};

const EMPTY_FORM: CustomKlusFormState = {
  titel: '',
  omschrijving: '',
  contactNaam: '',
  telefoon: '',
  email: '',
};

interface CustomKlusRequestFormProps {
  className?: string;
  quoteId?: string;
  onSuccess?: () => void;
}

export function CustomKlusRequestForm({ className, quoteId, onSuccess }: CustomKlusRequestFormProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [form, setForm] = useState<CustomKlusFormState>(EMPTY_FORM);
  const [allowContact, setAllowContact] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedDefaults, setHasLoadedDefaults] = useState(false);

  useEffect(() => {
    if (!user || !firestore || hasLoadedDefaults) return;

    let cancelled = false;

    const loadDefaults = async () => {
      const fallbackEmail = (user.email || '').trim();
      let contactNaam = (user.displayName || '').trim();
      let telefoon = '';
      let email = fallbackEmail;

      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data() as {
            displayName?: string;
            email?: string;
            telefoon?: string;
            settings?: { contactNaam?: string; email?: string; telefoon?: string };
          };

          contactNaam = (data.settings?.contactNaam || data.displayName || contactNaam).trim();
          telefoon = (data.settings?.telefoon || data.telefoon || '').trim();
          email = (data.settings?.email || data.email || fallbackEmail).trim();
        }
      } catch (error) {
        console.warn('Kon standaard contactgegevens niet laden voor custom klus.', error);
      }

      if (cancelled) return;
      setForm((prev) => ({ ...prev, contactNaam, telefoon, email }));
      setHasLoadedDefaults(true);
    };

    void loadDefaults();

    return () => {
      cancelled = true;
    };
  }, [firestore, hasLoadedDefaults, user]);

  const updateForm = (key: keyof CustomKlusFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm((prev) => ({
      ...EMPTY_FORM,
      contactNaam: prev.contactNaam,
      telefoon: prev.telefoon,
      email: prev.email,
    }));
    setAllowContact(false);
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

    const titel = form.titel.trim();
    const omschrijving = form.omschrijving.trim();
    const contactNaam = form.contactNaam.trim();
    const telefoon = form.telefoon.trim();
    const email = form.email.trim();

    if (!titel || !omschrijving || !contactNaam || !telefoon || !email) {
      toast({
        variant: 'destructive',
        title: 'Verplichte velden missen',
        description: 'Vul titel, omschrijving en contactgegevens in.',
      });
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      toast({
        variant: 'destructive',
        title: 'E-mailadres ongeldig',
        description: 'Vul een geldig e-mailadres in.',
      });
      return;
    }

    if (!allowContact) {
      toast({
        variant: 'destructive',
        title: 'Bevestiging nodig',
        description: 'Bevestig dat we contact met je mogen opnemen over deze custom klus.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = cleanFirestoreData({
        userId: user.uid,
        quoteId: quoteId || null,
        titel,
        omschrijving,
        contactNaam,
        telefoon,
        email,
        status: 'nieuw',
        bron: 'klus_nieuw_page',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(firestore, 'custom_klus_requests'), payload);
      resetForm();
      toast({
        title: 'Aanvraag verzonden',
        description: 'Je custom klus is ontvangen. We nemen contact met je op.',
      });
      onSuccess?.();
    } catch (error) {
      console.error('Custom klus aanvraag mislukt:', error);
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
        Beschrijf wat voor klus je mist. We bekijken hoe dit als nieuwe klus in Calvora toegevoegd kan worden.
      </p>

      <div className="mt-5 space-y-2">
        <Label htmlFor="custom-klus-titel">Titel van de klus</Label>
        <Input
          id="custom-klus-titel"
          value={form.titel}
          onChange={(event) => updateForm('titel', event.target.value)}
          placeholder="Bijv. Dakkapel renovatie"
        />
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="custom-klus-omschrijving">Omschrijving</Label>
        <Textarea
          id="custom-klus-omschrijving"
          value={form.omschrijving}
          onChange={(event) => updateForm('omschrijving', event.target.value)}
          placeholder="Beschrijf zo veel mogelijk informatie, wij nemen alsnog contact op om de mogelijkheden te bespreken."
          className="min-h-[130px]"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="custom-klus-contact-naam">Naam</Label>
          <Input
            id="custom-klus-contact-naam"
            value={form.contactNaam}
            onChange={(event) => updateForm('contactNaam', event.target.value)}
            placeholder="Jouw naam"
          />
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="custom-klus-contact-telefoon">Telefoon</Label>
          <Input
            id="custom-klus-contact-telefoon"
            value={form.telefoon}
            onChange={(event) => updateForm('telefoon', event.target.value)}
            placeholder="06..."
          />
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="custom-klus-contact-email">E-mail</Label>
          <Input
            id="custom-klus-contact-email"
            type="email"
            value={form.email}
            onChange={(event) => updateForm('email', event.target.value)}
            placeholder="naam@bedrijf.nl"
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border p-3">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={allowContact} onCheckedChange={(checked) => setAllowContact(checked === true)} />
          <span>Ik geef toestemming dat Calvora contact met mij opneemt over deze custom klus.</span>
        </label>
      </div>

      <Button className="mt-5" onClick={submitRequest} disabled={isSaving} variant="success">
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Aanvraag versturen
      </Button>
    </div>
  );
}
