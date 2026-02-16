'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Loader2, PhoneCall, Send } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ContactPreference = 'call_anytime' | 'plan_appointment';

type WebsiteBuildFormState = {
  contactNaam: string;
  bedrijfsnaam: string;
  telefoon: string;
  email: string;
  websiteType: string;
  projectBeschrijving: string;
  budgetRange: string;
  extraWensen: string;
  afspraakDatum: string;
  afspraakTijd: string;
};

type SubmitResponse = {
  ok?: boolean;
  message?: string;
  requestId?: string;
  webhookStatus?: 'skipped' | 'sent' | 'failed';
};

const EMPTY_FORM: WebsiteBuildFormState = {
  contactNaam: '',
  bedrijfsnaam: '',
  telefoon: '',
  email: '',
  websiteType: '',
  projectBeschrijving: '',
  budgetRange: '',
  extraWensen: '',
  afspraakDatum: '',
  afspraakTijd: '',
};

interface WebsiteBuildRequestFormProps {
  className?: string;
}

const budgetOptions = [
  { value: '0-200', label: '€0 - €200' },
  { value: '200-500', label: '€200 - €500' },
  { value: '500-1000', label: '€500 - €1.000' },
  { value: '1000-2000', label: '€1.000 - €2.000' },
  { value: '2000-plus', label: '€2.000+' },
];

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function mapBudgetLabel(value: string): string {
  const match = budgetOptions.find((option) => option.value === value);
  return match?.label || value;
}

export function WebsiteBuildRequestForm({ className }: WebsiteBuildRequestFormProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<WebsiteBuildFormState>(EMPTY_FORM);
  const [contactPreference, setContactPreference] = useState<ContactPreference>('call_anytime');
  const [hasLoadedDefaults, setHasLoadedDefaults] = useState(false);
  const [agreedPaidService, setAgreedPaidService] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submittedState, setSubmittedState] = useState<{
    requestId: string | null;
    submittedAt: Date;
    webhookStatus: 'skipped' | 'sent' | 'failed';
  } | null>(null);

  useEffect(() => {
    const mode = (searchParams.get('mode') || '').trim().toLowerCase();
    if (mode === 'plan' || mode === 'plan_appointment') {
      setContactPreference('plan_appointment');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || !firestore || hasLoadedDefaults) return;

    let cancelled = false;

    const loadDefaults = async () => {
      const fallbackEmail = (user.email || '').trim();
      let contactNaam = (user.displayName || '').trim();
      let bedrijfsnaam = '';
      let telefoon = '';
      let email = fallbackEmail;

      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data() as {
            displayName?: string;
            email?: string;
            telefoon?: string;
            settings?: {
              bedrijfsnaam?: string;
              email?: string;
              telefoon?: string;
              contactNaam?: string;
            };
          };

          contactNaam =
            (data.settings?.contactNaam || data.displayName || contactNaam || '').trim();
          bedrijfsnaam = (data.settings?.bedrijfsnaam || '').trim();
          telefoon = (data.settings?.telefoon || data.telefoon || '').trim();
          email = (data.settings?.email || data.email || email).trim();
        }
      } catch (error) {
        console.warn('Kon standaard contactgegevens niet laden voor website-aanvraag.', error);
      }

      if (cancelled) return;

      setForm((prev) => ({
        ...prev,
        contactNaam,
        bedrijfsnaam,
        telefoon,
        email,
      }));
      setHasLoadedDefaults(true);
    };

    void loadDefaults();

    return () => {
      cancelled = true;
    };
  }, [firestore, hasLoadedDefaults, user]);

  const updateForm = (key: keyof WebsiteBuildFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm((prev) => ({
      ...EMPTY_FORM,
      contactNaam: prev.contactNaam,
      bedrijfsnaam: prev.bedrijfsnaam,
      telefoon: prev.telefoon,
      email: prev.email,
    }));
    setContactPreference('call_anytime');
    setAgreedPaidService(false);
  };

  const submitRequest = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Niet beschikbaar',
        description: 'Deze aanvraag werkt alleen wanneer je bent ingelogd.',
      });
      return;
    }

    const contactNaam = form.contactNaam.trim();
    const bedrijfsnaam = form.bedrijfsnaam.trim();
    const telefoon = form.telefoon.trim();
    const email = form.email.trim();
    const websiteType = form.websiteType.trim();
    const projectBeschrijving = form.projectBeschrijving.trim();
    const extraWensen = form.extraWensen.trim();
    const afspraakDatum = form.afspraakDatum.trim();
    const afspraakTijd = form.afspraakTijd.trim();
    const budgetRange = form.budgetRange.trim();

    if (!contactNaam || !telefoon || !email || !websiteType || !projectBeschrijving) {
      toast({
        variant: 'destructive',
        title: 'Verplichte velden missen',
        description: 'Vul naam, telefoon, e-mail, type website en projectbeschrijving in.',
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

    if (contactPreference === 'plan_appointment') {
      if (!afspraakDatum || !afspraakTijd) {
        toast({
          variant: 'destructive',
          title: 'Afspraak onvolledig',
          description: 'Kies een datum en tijd voor de afspraak.',
        });
        return;
      }

      const afspraakMoment = new Date(`${afspraakDatum}T${afspraakTijd}:00`);
      if (!Number.isFinite(afspraakMoment.getTime()) || afspraakMoment.getTime() <= Date.now()) {
        toast({
          variant: 'destructive',
          title: 'Afspraak ongeldig',
          description: 'Kies een tijdstip in de toekomst.',
        });
        return;
      }
    }

    if (!agreedPaidService) {
      toast({
        variant: 'destructive',
        title: 'Bevestiging nodig',
        description: 'Bevestig dat je begrijpt dat dit een betaalde extra dienst is.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();

      const response = await fetch('/api/support/website-request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactNaam,
          bedrijfsnaam,
          telefoon,
          email,
          websiteType,
          projectBeschrijving,
          budgetRange: budgetRange || null,
          extraWensen: extraWensen || null,
          contactVoorkeur: contactPreference,
          afspraakDatum: contactPreference === 'plan_appointment' ? afspraakDatum : null,
          afspraakTijd: contactPreference === 'plan_appointment' ? afspraakTijd : null,
          betaaldeDienstBevestigd: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as SubmitResponse | null;
      if (!response.ok) {
        throw new Error(data?.message || 'Aanvraag kon niet worden verzonden.');
      }

      setSubmittedState({
        requestId: data?.requestId || null,
        submittedAt: new Date(),
        webhookStatus: data?.webhookStatus || 'skipped',
      });

      resetForm();
      toast({
        title: 'Aanvraag verzonden',
        description:
          data?.webhookStatus === 'failed'
            ? 'Aanvraag opgeslagen. Melding naar het team wordt opnieuw geprobeerd.'
            : 'Je aanvraag is ontvangen. We nemen contact met je op.',
      });
    } catch (error) {
      console.error('Website-aanvraag mislukt:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description:
          error instanceof Error ? error.message : 'De aanvraag kon niet worden verzonden.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (submittedState) {
    return (
      <div className={cn('w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6', className)}>
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          Premium intake ontvangen
        </h2>
        <p className="mt-2 text-sm text-emerald-50/90">
          Top. We hebben je aanvraag voor &apos;Website laten maken&apos; ontvangen. We nemen zo snel
          mogelijk contact met je op.
        </p>
        <p className="mt-2 text-sm text-emerald-50/80">
          Persoonlijk traject, helder voorstel en focus op resultaat.
        </p>
        <p className="mt-3 text-sm text-emerald-50/80">
          Ingediend op: {formatDateTime(submittedState.submittedAt)}
          {submittedState.requestId ? ` • Referentie: ${submittedState.requestId}` : ''}
        </p>
        {submittedState.webhookStatus === 'failed' && (
          <p className="mt-3 text-sm text-amber-200">
            Let op: teammelding via n8n is mislukt, maar je aanvraag staat wel veilig opgeslagen.
          </p>
        )}
        <div className="mt-5">
          <Button
            variant="outline"
            className="border-emerald-300/40 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20"
            onClick={() => setSubmittedState(null)}
          >
            Start nieuwe intake
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full rounded-xl border border-border/60 bg-card/40 p-6', className)}>
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <PhoneCall className="h-5 w-5 text-emerald-300" />
        Website laten maken
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Premium extra dienst voor vakbedrijven die professioneel online zichtbaar willen zijn. Kies voor
        direct terugbellen of plan direct je afspraak. Vanaf €200.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Persoonlijk traject, helder voorstel en focus op resultaat.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-contact-naam">Contactnaam</Label>
          <Input
            id="website-contact-naam"
            value={form.contactNaam}
            onChange={(event) => updateForm('contactNaam', event.target.value)}
            placeholder="Voor- en achternaam"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-bedrijfsnaam">Bedrijfsnaam</Label>
          <Input
            id="website-bedrijfsnaam"
            value={form.bedrijfsnaam}
            onChange={(event) => updateForm('bedrijfsnaam', event.target.value)}
            placeholder="Naam van je bedrijf"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-telefoon">Telefoonnummer</Label>
          <Input
            id="website-telefoon"
            value={form.telefoon}
            onChange={(event) => updateForm('telefoon', event.target.value)}
            placeholder="06..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-email">E-mailadres</Label>
          <Input
            id="website-email"
            type="email"
            value={form.email}
            onChange={(event) => updateForm('email', event.target.value)}
            placeholder="naam@bedrijf.nl"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-type">Type website</Label>
          <Input
            id="website-type"
            value={form.websiteType}
            onChange={(event) => updateForm('websiteType', event.target.value)}
            placeholder="Bijv. zakelijke website, landingspagina, webshop"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-budget">Budget indicatie (optioneel)</Label>
          <Select value={form.budgetRange} onValueChange={(value) => updateForm('budgetRange', value)}>
            <SelectTrigger id="website-budget">
              <SelectValue placeholder="Kies budgetindicatie" />
            </SelectTrigger>
            <SelectContent>
              {budgetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="website-project-beschrijving">Projectbeschrijving</Label>
        <Textarea
          id="website-project-beschrijving"
          value={form.projectBeschrijving}
          onChange={(event) => updateForm('projectBeschrijving', event.target.value)}
          placeholder="Omschrijf wat je website moet doen (diensten, doelgroep, stijl, functionaliteiten)."
          className="min-h-[140px]"
        />
      </div>

      <div className="mt-4 rounded-lg border p-4">
        <Label className="text-sm">Contactvoorkeur</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Kies of we je vrij mogen bellen of dat je direct een afspraakmoment plant.
        </p>

        <RadioGroup
          value={contactPreference}
          onValueChange={(value) => setContactPreference(value as ContactPreference)}
          className="mt-3 gap-3"
        >
          <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <RadioGroupItem value="call_anytime" id="website-call-anytime" />
            <span>Bel mij wanneer het uitkomt</span>
          </label>
          <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <RadioGroupItem value="plan_appointment" id="website-plan-appointment" />
            <span>Ik plan nu een afspraak</span>
          </label>
        </RadioGroup>

        {contactPreference === 'plan_appointment' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website-afspraak-datum">Voorkeursdatum</Label>
              <Input
                id="website-afspraak-datum"
                type="date"
                value={form.afspraakDatum}
                onChange={(event) => updateForm('afspraakDatum', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-afspraak-tijd">Voorkeurstijd</Label>
              <Input
                id="website-afspraak-tijd"
                type="time"
                value={form.afspraakTijd}
                onChange={(event) => updateForm('afspraakTijd', event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="website-extra-wensen">Extra wensen (optioneel)</Label>
        <Textarea
          id="website-extra-wensen"
          value={form.extraWensen}
          onChange={(event) => updateForm('extraWensen', event.target.value)}
          placeholder="Bijv. koppeling met WhatsApp, portfolio, reviews, meertaligheid, etc."
          className="min-h-[120px]"
        />
      </div>

      <div className="mt-4 rounded-lg border p-3">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={agreedPaidService}
            onCheckedChange={(checked) => setAgreedPaidService(checked === true)}
          />
          <span>Ik begrijp dat &apos;Website laten maken&apos; een betaalde extra dienst is.</span>
        </label>
      </div>

      <Button className="mt-5" onClick={submitRequest} disabled={isSaving} variant="success">
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Start premium intake
      </Button>

      {form.budgetRange && (
        <p className="mt-3 text-xs text-muted-foreground">
          Gekozen budgetindicatie: {mapBudgetLabel(form.budgetRange)}
        </p>
      )}
    </div>
  );
}
