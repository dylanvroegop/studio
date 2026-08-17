'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Download,
  FileText,
  FileSignature,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import type {
  Meerwerkbon,
  MeerwerkbonApproval,
  MeerwerkbonClientSnapshot,
  MeerwerkbonLineItem,
  MeerwerkbonPricingMode,
  MeerwerkbonTemplatePreset,
  MeerwerkbonTemplateSettings,
} from '@/lib/types';
import type { KlantInformatie } from '@/lib/quote-calculations';
import { calculateMeerwerkbonTotals, clientSnapshotKey, formatCurrency, normalizeMeerwerkbonLineItem, recalcMeerwerkbonLineItems, safeNumber } from '@/lib/meerwerkbon-utils';
import {
  createCombinedInvoiceConceptFromMeerwerkbon,
  updateMeerwerkbonClientSnapshot,
  updateMeerwerkbonEstimatedHours,
  updateMeerwerkbonLineItems,
  updateMeerwerkbonPricingMode,
  updateMeerwerkbonStatus,
  updateMeerwerkbonTemplate,
} from '@/lib/meerwerkbon-actions';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/lib/types-settings';
import { generateMeerwerkbonPDF, type PDFMeerwerkbonData } from '@/lib/generate-meerwerkbon-pdf';
import { PDFPreviewMeerwerkbon } from '@/components/meerwerk/PDFPreviewMeerwerkbon';
import { SendMeerwerkbonModal } from '@/components/meerwerk/SendMeerwerkbonModal';
import { SendQuoteWhatsAppModal } from '@/components/quote/SendQuoteWhatsAppModal';
import { MeerwerkbonStatusBadge } from '@/components/meerwerk/MeerwerkbonStatusBadge';
import { toast } from '@/hooks/use-toast';
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { getIdTokenResult } from 'firebase/auth';

function naarDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function defaultTemplateByPreset(preset: MeerwerkbonTemplatePreset): MeerwerkbonTemplateSettings {
  if (preset === 'compact') {
    return {
      preset,
      showIntroText: true,
      showVoorwaarden: false,
      showLinkedQuotes: true,
      showSignatureBlocks: true,
      showVatColumn: false,
    };
  }
  return {
    preset: 'uitgebreid',
    showIntroText: true,
    showVoorwaarden: true,
    showLinkedQuotes: true,
    showSignatureBlocks: true,
    showVatColumn: true,
  };
}

function statusLabel(status: Meerwerkbon['status']): string {
  const map: Record<Meerwerkbon['status'], string> = {
    concept: 'Concept',
    verzonden: 'Verzonden',
    akkoord: 'Akkoord',
    afgekeurd: 'Afgekeurd',
    gefactureerd: 'Gefactureerd',
    geannuleerd: 'Geannuleerd',
  };
  return map[status] || status;
}

function pricingModeLabel(mode: MeerwerkbonPricingMode): string {
  if (mode === 'uren_nacalculatie') return 'Uren op nacalculatie';
  if (mode === 'uren_materialen_nacalculatie') return 'Uren + materialen op nacalculatie';
  return 'Begrote kosten';
}

function pricingModeDescription(mode: MeerwerkbonPricingMode, hourlyRateExclBtw: number, estimatedHours?: number): string {
  const hourlyRate = formatCurrency(hourlyRateExclBtw);
  const estimate = estimatedHours && estimatedHours > 0
    ? ` De schatting is ongeveer ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(estimatedHours)} uur.`
    : '';
  if (mode === 'uren_nacalculatie') return `Dit is geen vaste prijs of urenakkoord. Werkelijke uren worden achteraf afgerekend tegen ${hourlyRate} per uur excl. btw.${estimate}`;
  if (mode === 'uren_materialen_nacalculatie') return `Dit is geen vaste prijs of urenakkoord. Werkelijke uren worden achteraf afgerekend tegen ${hourlyRate} per uur excl. btw; materialen volgen op nacalculatie.${estimate}`;
  return 'De werkzaamheden worden afgerekend op basis van de begrote kosten op deze meerwerkbon.';
}

function pricingModeRateLabel(mode: MeerwerkbonPricingMode, hourlyRateExclBtw: number): string {
  const hourlyRate = formatCurrency(hourlyRateExclBtw);
  if (mode === 'uren_nacalculatie') return `${hourlyRate} per uur excl. btw`;
  if (mode === 'uren_materialen_nacalculatie') return `${hourlyRate} per uur + materialen achteraf`;
  return 'Vaste voorafgaande inschatting';
}

function serializeRulesState(
  items: Partial<MeerwerkbonLineItem>[],
  opmerking: string,
  introText: string,
  voorwaardenText: string
): string {
  const normalized = recalcMeerwerkbonLineItems(items);
  return JSON.stringify({
    lineItems: normalized,
    opmerking: (opmerking || '').toString(),
    introText: (introText || '').toString(),
    voorwaardenText: (voorwaardenText || '').toString(),
  });
}

function serializeTemplateState(template: MeerwerkbonTemplateSettings): string {
  return JSON.stringify({
    preset: template.preset,
    showIntroText: !!template.showIntroText,
    showVoorwaarden: !!template.showVoorwaarden,
    showLinkedQuotes: !!template.showLinkedQuotes,
    showSignatureBlocks: !!template.showSignatureBlocks,
    showVatColumn: !!template.showVatColumn,
  });
}

function mapClientDocToSnapshot(client: any): MeerwerkbonClientSnapshot {
  const voornaam = (client?.voornaam || '').toString().trim();
  const achternaam = (client?.achternaam || '').toString().trim();
  const bedrijfsnaam = (client?.bedrijfsnaam || '').toString().trim();
  const naam = (bedrijfsnaam || [voornaam, achternaam].filter(Boolean).join(' ') || 'Onbekende klant').trim();
  const straat = (client?.straat || '').toString().trim();
  const huisnummer = (client?.huisnummer || '').toString().trim();

  return {
    naam,
    email: (client?.emailadres || '').toString().trim(),
    telefoon: (client?.telefoonnummer || '').toString().trim(),
    adres: `${straat} ${huisnummer}`.trim(),
    postcode: (client?.postcode || '').toString().trim(),
    plaats: (client?.plaats || '').toString().trim(),
  };
}

function formatClientOptionLabel(snapshot: MeerwerkbonClientSnapshot): string {
  const parts = [snapshot.naam, snapshot.plaats].filter((part) => !!(part || '').trim());
  return parts.join(' - ') || 'Onbekende klant';
}

export default function MeerwerkbonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meerwerkbon, setMeerwerkbon] = useState<Meerwerkbon | null>(null);
  const [linkedQuotes, setLinkedQuotes] = useState<Array<{ quoteId: string; offerteNummer?: number; titel?: string }>>([]);

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [businessData, setBusinessData] = useState<any>(null);

  const [lineItems, setLineItems] = useState<MeerwerkbonLineItem[]>([]);
  const [pricingMode, setPricingMode] = useState<MeerwerkbonPricingMode>('begroot');
  const [geschatteArbeidsuren, setGeschatteArbeidsuren] = useState('');
  const [opgeslagenArbeidsuren, setOpgeslagenArbeidsuren] = useState('');
  const [opmerking, setOpmerking] = useState('');
  const [introText, setIntroText] = useState('');
  const [voorwaardenText, setVoorwaardenText] = useState('');
  const [template, setTemplate] = useState<MeerwerkbonTemplateSettings>(defaultTemplateByPreset('uitgebreid'));
  const [approvalForm, setApprovalForm] = useState<MeerwerkbonApproval>({
    naam: '',
    plaats: '',
    datum: toDateInputValue(new Date()),
  });

  const [savingAll, setSavingAll] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [hasDeveloperWhatsAppAccess, setHasDeveloperWhatsAppAccess] = useState(false);
  const [creatingCombinedInvoice, setCreatingCombinedInvoice] = useState(false);
  const [pdfSettingsOpen, setPdfSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overzicht' | 'regels' | 'pdf'>('overzicht');

  const [materials, setMaterials] = useState<any[]>([]);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [clientOptions, setClientOptions] = useState<Array<{
    id: string;
    label: string;
    snapshot: MeerwerkbonClientSnapshot;
  }>>([]);
  const [updatingClient, setUpdatingClient] = useState(false);

  const hydratedRef = useRef(false);
  const lastSyncedRulesRef = useRef<string>('');
  const lastSyncedTemplateRef = useRef<string>('');
  const lastSyncedPricingModeRef = useRef<MeerwerkbonPricingMode>('begroot');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setHasDeveloperWhatsAppAccess(false);
      setIsWhatsAppModalOpen(false);
      return;
    }

    const resolveDeveloperAccess = async () => {
      try {
        const token = await getIdTokenResult(user, false);
        const allowed = token.claims.dev === true || token.claims.admin === true;
        if (cancelled) return;
        setHasDeveloperWhatsAppAccess(allowed);
        if (!allowed) setIsWhatsAppModalOpen(false);
      } catch {
        if (cancelled) return;
        setHasDeveloperWhatsAppAccess(false);
        setIsWhatsAppModalOpen(false);
      }
    };

    void resolveDeveloperAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !firestore || !id) return;
    setLoading(true);
    setError(null);
    hydratedRef.current = false;

    const ref = doc(firestore, 'meerwerkbonnen', id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setMeerwerkbon(null);
          hydratedRef.current = false;
          setLoading(false);
          return;
        }
        const data = { ...(snap.data() as any), id: snap.id } as Meerwerkbon;
        const nextLineItems = Array.isArray(data.lineItems) ? recalcMeerwerkbonLineItems(data.lineItems) : [];
        const nextOpmerking = (data.opmerking || data.approval?.opmerking || '').toString();
        const nextIntroText = (data.introText || '').toString();
        const nextVoorwaardenText = (data.voorwaardenText || '').toString();
        const nextTemplate = data.template || defaultTemplateByPreset('uitgebreid');

        setMeerwerkbon(data);
        setLineItems(nextLineItems);
        setPricingMode(data.pricingMode || 'begroot');
        setGeschatteArbeidsuren(
          typeof data.geschatteArbeidsuren === 'number' && data.geschatteArbeidsuren > 0
            ? String(data.geschatteArbeidsuren)
            : ''
        );
        setOpgeslagenArbeidsuren(
          typeof data.geschatteArbeidsuren === 'number' && data.geschatteArbeidsuren > 0
            ? String(data.geschatteArbeidsuren)
            : ''
        );
        setOpmerking(nextOpmerking);
        setIntroText(nextIntroText);
        setVoorwaardenText(nextVoorwaardenText);
        setTemplate(nextTemplate);
        setApprovalForm({
          naam: data.approval?.naam || data.clientSnapshot?.naam || '',
          plaats: data.approval?.plaats || data.clientSnapshot?.plaats || '',
          datum: data.approval?.datum || toDateInputValue(new Date()),
        });
        lastSyncedRulesRef.current = serializeRulesState(nextLineItems, nextOpmerking, nextIntroText, nextVoorwaardenText);
        lastSyncedTemplateRef.current = serializeTemplateState(nextTemplate);
        lastSyncedPricingModeRef.current = data.pricingMode || 'begroot';
        hydratedRef.current = true;
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij laden meerwerkbon:', err);
        setError(`${err?.code ?? 'error'}: ${err?.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, firestore, id]);

  useEffect(() => {
    if (!user || !firestore) return;
    (async () => {
      try {
        const userSnap = await getDoc(doc(firestore, 'users', user.uid));
        const merged = {
          ...DEFAULT_USER_SETTINGS,
          ...((userSnap.exists() ? (userSnap.data() as any)?.settings : {}) || {}),
        } as UserSettings;
        setSettings(merged);

        const businessSnap = await getDoc(doc(firestore, 'businesses', user.uid));
        if (businessSnap.exists()) setBusinessData(businessSnap.data());
      } catch (err) {
        console.error('Fout bij laden instellingen/bedrijf:', err);
      }
    })();
  }, [user, firestore]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    (async () => {
      try {
        const clientsQuery = query(collection(firestore, 'clients'), where('userId', '==', user.uid));
        const snap = await getDocs(clientsQuery);
        const options = snap.docs
          .map((row) => {
            const snapshot = mapClientDocToSnapshot(row.data() as any);
            return {
              id: row.id,
              label: formatClientOptionLabel(snapshot),
              snapshot,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL'));

        if (!cancelled) {
          setClientOptions(options);
        }
      } catch (err) {
        console.error('Fout bij laden klanten:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, firestore]);

  useEffect(() => {
    if (!meerwerkbon || !firestore) {
      setLinkedQuotes([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const ids = Array.isArray(meerwerkbon.linkedQuoteIds) ? meerwerkbon.linkedQuoteIds : [];
      if (ids.length === 0) {
        if (!cancelled) setLinkedQuotes([]);
        return;
      }

      const rows = await Promise.all(ids.map(async (quoteId) => {
        try {
          const snap = await getDoc(doc(firestore, 'quotes', quoteId));
          if (!snap.exists()) return { quoteId };
          const data = snap.data() as any;
          return {
            quoteId,
            offerteNummer: typeof data?.offerteNummer === 'number' ? data.offerteNummer : undefined,
            titel: (data?.titel || data?.title || data?.werkomschrijving || '').toString() || undefined,
          };
        } catch {
          return { quoteId };
        }
      }));

      if (!cancelled) setLinkedQuotes(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, [meerwerkbon, firestore]);

  const totals = useMemo(() => calculateMeerwerkbonTotals(recalcMeerwerkbonLineItems(lineItems)), [lineItems]);

  useEffect(() => {
    if (!materialModalOpen || materials.length > 0 || !user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/materialen/get', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();
        if (!response.ok || !json?.ok || !Array.isArray(json?.data)) {
          throw new Error(json?.error || json?.message || 'Kon materialen niet laden.');
        }
        setMaterials(json.data);
      } catch (err: any) {
        console.error('Fout bij laden materialen:', err);
        toast({
          title: 'Fout bij laden materialen',
          description: err?.message || 'Onbekende fout',
          variant: 'destructive',
        });
      }
    })();
  }, [materialModalOpen, materials.length, user]);

  const pdfData: PDFMeerwerkbonData | null = useMemo(() => {
    if (!meerwerkbon) return null;

    const bedrijfNaam = settings.bedrijfsnaam || businessData?.bedrijfsnaam || '';
    if (!bedrijfNaam) return null;

    return {
      numberLabel: meerwerkbon.numbering?.label || meerwerkbon.id,
      issueDate: naarDate(meerwerkbon.createdAt)?.toLocaleDateString('nl-NL') || new Date().toLocaleDateString('nl-NL'),
      statusLabel: statusLabel(meerwerkbon.status),
      logoUrl: settings.logoUrl || undefined,
      logoScale: settings.logoScale || 1,
      bedrijf: {
        naam: bedrijfNaam,
        adres: `${settings.adres || ''} ${settings.huisnummer || ''}`.trim(),
        postcode: settings.postcode || '',
        plaats: settings.plaats || '',
        telefoon: settings.telefoon || businessData?.telefoon || '',
        email: settings.email || businessData?.email || '',
        kvk: settings.kvkNummer || businessData?.kvkNummer || '',
        btw: settings.btwNummer || businessData?.btwNummer || '',
      },
      klant: {
        naam: meerwerkbon.clientSnapshot?.naam || '',
        adres: meerwerkbon.clientSnapshot?.adres || '',
        postcode: meerwerkbon.clientSnapshot?.postcode || '',
        plaats: meerwerkbon.clientSnapshot?.plaats || '',
        telefoon: meerwerkbon.clientSnapshot?.telefoon || '',
        email: meerwerkbon.clientSnapshot?.email || '',
      },
      linkedQuotes,
      lineItems: recalcMeerwerkbonLineItems(lineItems),
      totals,
      pricingMode,
      uurTariefExclBtw: Number(settings.standaardUurtarief) || 0,
      geschatteArbeidsuren: Number(geschatteArbeidsuren.replace(',', '.')) > 0
        ? Number(geschatteArbeidsuren.replace(',', '.'))
        : undefined,
      opmerking,
      introText,
      voorwaardenText,
      approval: {
        naam: approvalForm.naam,
        plaats: approvalForm.plaats,
        datum: approvalForm.datum,
      },
      template,
    };
  }, [meerwerkbon, settings, businessData, linkedQuotes, lineItems, totals, pricingMode, geschatteArbeidsuren, opmerking, introText, voorwaardenText, approvalForm, template]);

  const serializedRulesState = useMemo(
    () => serializeRulesState(lineItems, opmerking, introText, voorwaardenText),
    [lineItems, opmerking, introText, voorwaardenText]
  );
  const serializedTemplateState = useMemo(
    () => serializeTemplateState(template),
    [template]
  );
  const normalizedEstimatedHours = useMemo(() => {
    const parsed = Number(geschatteArbeidsuren.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [geschatteArbeidsuren]);
  const hasUnsavedChanges = hydratedRef.current && (
    serializedRulesState !== lastSyncedRulesRef.current ||
    serializedTemplateState !== lastSyncedTemplateRef.current ||
    pricingMode !== lastSyncedPricingModeRef.current ||
    geschatteArbeidsuren !== opgeslagenArbeidsuren
  );

  const linkedQuoteCount = useMemo(
    () => (Array.isArray(meerwerkbon?.linkedQuoteIds) ? meerwerkbon!.linkedQuoteIds.length : 0),
    [meerwerkbon?.linkedQuoteIds]
  );
  const hourlyRateExclBtw = Number(settings.standaardUurtarief) || 0;

  const whatsappKlantInfo = useMemo<KlantInformatie | null>(() => {
    const snapshot = meerwerkbon?.clientSnapshot;
    if (!snapshot) return null;

    const naam = snapshot.naam.trim() || 'klant';
    const nameParts = naam.split(/\s+/).filter(Boolean);
    return {
      klanttype: 'Particulier',
      voornaam: nameParts[0] || naam,
      achternaam: nameParts.slice(1).join(' '),
      bedrijfsnaam: naam,
      emailadres: snapshot.email || '',
      telefoonnummer: snapshot.telefoon || '',
      straat: snapshot.adres || '',
      huisnummer: '',
      postcode: snapshot.postcode || '',
      plaats: snapshot.plaats || '',
      afwijkendProjectadres: false,
    };
  }, [meerwerkbon?.clientSnapshot]);

  const handlePricingModeChange = (nextMode: MeerwerkbonPricingMode): void => {
    if (nextMode === pricingMode) return;
    setPricingMode(nextMode);
  };

  const handleSaveMeerwerkbon = async (): Promise<void> => {
    if (!firestore || !meerwerkbon || savingAll || !hasUnsavedChanges) return;

    const normalizedLineItems = recalcMeerwerkbonLineItems(lineItems);
    const invalid = normalizedLineItems.some((item) => !item.omschrijving.trim() || safeNumber(item.aantal, 0) <= 0);
    if (invalid) {
      toast({
        title: 'Opslaan niet mogelijk',
        description: 'Vul bij elke regel een omschrijving en een aantal groter dan nul in.',
        variant: 'destructive',
      });
      return;
    }

    setSavingAll(true);
    try {
      await Promise.all([
        updateMeerwerkbonPricingMode(firestore, {
          meerwerkbonId: meerwerkbon.id,
          pricingMode,
        }),
        updateMeerwerkbonEstimatedHours(firestore, {
          meerwerkbonId: meerwerkbon.id,
          estimatedHours: normalizedEstimatedHours,
        }),
        updateMeerwerkbonLineItems(firestore, {
          meerwerkbonId: meerwerkbon.id,
          lineItems: normalizedLineItems,
          opmerking,
          introText,
          voorwaardenText,
        }),
        updateMeerwerkbonTemplate(firestore, {
          meerwerkbonId: meerwerkbon.id,
          template,
        }),
      ]);

      lastSyncedRulesRef.current = serializeRulesState(normalizedLineItems, opmerking, introText, voorwaardenText);
      lastSyncedTemplateRef.current = serializedTemplateState;
      lastSyncedPricingModeRef.current = pricingMode;
      const normalizedEstimateValue = normalizedEstimatedHours === null ? '' : String(normalizedEstimatedHours);
      setGeschatteArbeidsuren(normalizedEstimateValue);
      setOpgeslagenArbeidsuren(normalizedEstimateValue);
      setLastSavedAt(Date.now());
      toast({ title: 'Meerwerkbon opgeslagen', description: 'Alle wijzigingen zijn opgeslagen.' });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Opslaan mislukt',
        description: err?.message || 'Kon de meerwerkbon niet opslaan.',
        variant: 'destructive',
      });
    } finally {
      setSavingAll(false);
    }
  };
  const clientSelectionLockedByQuote = linkedQuoteCount > 0;

  const selectedClientOptionId = useMemo(() => {
    if (!meerwerkbon) return '';
    const currentKey = clientSnapshotKey(meerwerkbon.clientSnapshot);
    return clientOptions.find((option) => clientSnapshotKey(option.snapshot) === currentKey)?.id || '';
  }, [meerwerkbon, clientOptions]);

  useEffect(() => {
    if (!meerwerkbon || !clientSelectionLockedByQuote) return;
    const autoNaam = (meerwerkbon.clientSnapshot?.naam || '').toString().trim();
    const autoPlaats = (meerwerkbon.clientSnapshot?.plaats || '').toString().trim();
    if (!autoNaam && !autoPlaats) return;

    setApprovalForm((prev) => {
      const nextNaam = prev.naam.trim() ? prev.naam : autoNaam;
      const nextPlaats = prev.plaats.trim() ? prev.plaats : autoPlaats;
      if (nextNaam === prev.naam && nextPlaats === prev.plaats) return prev;
      return { ...prev, naam: nextNaam, plaats: nextPlaats };
    });
  }, [
    clientSelectionLockedByQuote,
    meerwerkbon,
    meerwerkbon?.clientSnapshot?.naam,
    meerwerkbon?.clientSnapshot?.plaats,
  ]);

  const handleClientSelection = async (clientId: string) => {
    if (!firestore || !meerwerkbon || clientSelectionLockedByQuote || updatingClient) return;
    const selected = clientOptions.find((option) => option.id === clientId);
    if (!selected) return;

    setUpdatingClient(true);
    try {
      await updateMeerwerkbonClientSnapshot(firestore, {
        meerwerkbonId: meerwerkbon.id,
        clientSnapshot: selected.snapshot,
      });
      setApprovalForm((prev) => ({
        ...prev,
        naam: prev.naam.trim() ? prev.naam : selected.snapshot.naam,
        plaats: prev.plaats.trim() ? prev.plaats : selected.snapshot.plaats,
      }));
      toast({
        title: 'Klant bijgewerkt',
        description: 'Klantgegevens van de meerwerkbon zijn aangepast.',
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Fout',
        description: err?.message || 'Kon klant niet aanpassen.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingClient(false);
    }
  };

  const handleSetStatus = async (status: Meerwerkbon['status']) => {
    if (!firestore || !meerwerkbon || statusUpdating) return;

    if (status === 'akkoord') {
      if (!approvalForm.naam.trim() || !approvalForm.plaats.trim() || !approvalForm.datum.trim()) {
        toast({
          title: 'Akkoordgegevens incompleet',
          description: 'Vul naam, plaats en datum in voordat je op akkoord zet.',
          variant: 'destructive',
        });
        return;
      }
    }

    setStatusUpdating(true);
    try {
      await updateMeerwerkbonStatus(firestore, {
        meerwerkbonId: meerwerkbon.id,
        status,
        approval: status === 'akkoord'
          ? {
            ...approvalForm,
            naam: approvalForm.naam.trim(),
            plaats: approvalForm.plaats.trim(),
            datum: approvalForm.datum.trim(),
          }
          : undefined,
      });
      toast({ title: 'Status bijgewerkt', description: `Nieuwe status: ${statusLabel(status)}.` });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Fout',
        description: err?.message || 'Kon status niet bijwerken.',
        variant: 'destructive',
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfData || isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await generateMeerwerkbonPDF(pdfData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Meerwerkbon-${pdfData.numberLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCreateCombinedInvoice = async () => {
    if (!firestore || !meerwerkbon || creatingCombinedInvoice) return;

    if (meerwerkbon.status !== 'akkoord') {
      toast({
        title: 'Actie geblokkeerd',
        description: 'Alleen geaccordeerde meerwerkbonnen kunnen omgezet worden naar factuur-concept.',
        variant: 'destructive',
      });
      return;
    }
    if ((meerwerkbon.invoiceLink as any)?.invoiceId) {
      router.push(`/facturen/${(meerwerkbon.invoiceLink as any).invoiceId}`);
      return;
    }

    setCreatingCombinedInvoice(true);
    try {
      const invoiceId = await createCombinedInvoiceConceptFromMeerwerkbon(firestore, {
        userId: user!.uid,
        meerwerkbonId: meerwerkbon.id,
      });
      router.push(`/facturen/${invoiceId}`);
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Factuur-concept mislukt',
        description: err?.message || 'Kon geen gecombineerde factuur maken.',
        variant: 'destructive',
      });
    } finally {
      setCreatingCombinedInvoice(false);
    }
  };

  const addFreeLine = () => {
    setLineItems((prev) => [
      ...prev,
      normalizeMeerwerkbonLineItem({
        type: 'vrije_post',
        omschrijving: '',
        aantal: 1,
        eenheid: 'stuk',
        prijsPerEenheidExclBtw: 0,
        btwTarief: 21,
      }),
    ]);
  };

  const addMaterialLine = (material: any) => {
    setLineItems((prev) => [
      ...prev,
      normalizeMeerwerkbonLineItem({
        type: 'materiaal',
        omschrijving: (material?.materiaalnaam || material?.naam || '').toString() || 'Materiaal',
        aantal: 1,
        eenheid: (material?.eenheid || 'stuk').toString(),
        prijsPerEenheidExclBtw: Number(material?.prijs_per_stuk ?? material?.prijs ?? 0) || 0,
        btwTarief: 21,
        bronMateriaalId: (material?.id || '').toString() || undefined,
        bronRowId: (material?.row_id || '').toString() || undefined,
      }),
    ]);
    setMaterialModalOpen(false);
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  if (!meerwerkbon) {
    return (
      <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
        <AppNavigation />
        <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              <h1 className="text-xl font-bold text-foreground">Meerwerkbon</h1>
            </div>
            <Link href="/meerwerkbon" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Meerwerkbon
            </Link>
          </div>
        </header>
        <main className="flex flex-col items-center p-6">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-8 text-center space-y-3">
              <div className="font-semibold">Meerwerkbon niet gevonden</div>
              <Button asChild variant="outline">
                <Link href="/meerwerkbon">Terug naar overzicht</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
      <AppNavigation />
      <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-amber-400" />
                <h1 className="text-xl font-bold text-foreground">
                  Meerwerkbon {meerwerkbon.numbering?.label || meerwerkbon.id}
                </h1>
                <Link href="/meerwerkbon" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Meerwerkbon
                </Link>
              </div>
              <p className="text-muted-foreground text-sm">{meerwerkbon.clientSnapshot?.naam || 'Onbekende klant'}</p>
            </div>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            {hasDeveloperWhatsAppAccess && (
              <Button
                type="button"
                variant="success"
                className="flex-1 sm:flex-none gap-2"
                onClick={() => setIsWhatsAppModalOpen(true)}
                disabled={!pdfData}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            )}
            <Button type="button" variant="outline" className="flex-1 sm:flex-none gap-2" onClick={() => setSendOpen(true)} disabled={!pdfData}>
              <Mail className="h-4 w-4" />
              Versturen
            </Button>
            <Button type="button" variant="success" className="flex-1 sm:flex-none gap-2" onClick={handleDownloadPdf} disabled={!pdfData || isDownloading}>
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 pb-28 sm:p-6 sm:pb-28">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'overzicht' | 'regels' | 'pdf')}
          className="space-y-6"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-1 rounded-lg w-full">
            <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap justify-start w-full sm:w-auto">
              <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <FileSignature className="h-4 w-4" /> Overzicht
              </TabsTrigger>
              <TabsTrigger value="regels" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <Plus className="h-4 w-4" /> Regels
              </TabsTrigger>
              <TabsTrigger value="pdf" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                <Download className="h-4 w-4" /> PDF
              </TabsTrigger>
            </TabsList>

            {activeTab === 'pdf' ? (
              <Dialog open={pdfSettingsOpen} onOpenChange={setPdfSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground mr-1">
                    <Settings className="h-4 w-4 mr-2" />
                    PDF instellingen
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
                  <DialogHeader className="px-6 pt-6">
                    <DialogTitle>PDF instellingen</DialogTitle>
                    <DialogDescription>
                      Bepaal hoe de meerwerkbon-PDF wordt opgebouwd.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="px-6 pb-6 space-y-4 max-h-[75vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label>Preset</Label>
                      <Select
                        value={template.preset}
                        onValueChange={(value) => {
                          const nextPreset = value as MeerwerkbonTemplatePreset;
                          setTemplate((prev) => ({
                            ...defaultTemplateByPreset(nextPreset),
                            showIntroText: prev.showIntroText,
                            showVoorwaarden: prev.showVoorwaarden,
                            showLinkedQuotes: prev.showLinkedQuotes,
                            showSignatureBlocks: prev.showSignatureBlocks,
                            showVatColumn: prev.showVatColumn,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compact">Compact</SelectItem>
                          <SelectItem value="uitgebreid">Uitgebreid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {[
                        { key: 'showIntroText', label: 'Introductietekst tonen' },
                        { key: 'showVoorwaarden', label: 'Voorwaarden tonen' },
                        { key: 'showLinkedQuotes', label: 'Gekoppelde offertes tonen' },
                        { key: 'showSignatureBlocks', label: 'Ondertekenblokken tonen' },
                        { key: 'showVatColumn', label: 'BTW kolom tonen' },
                      ].map((row) => (
                        <label key={row.key} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(template as any)[row.key]}
                            onChange={(e) => setTemplate((prev) => ({ ...prev, [row.key]: e.target.checked }))}
                          />
                          <span>{row.label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {hasUnsavedChanges
                        ? 'PDF-wijzigingen worden opgeslagen met de knop onderaan.'
                        : lastSavedAt
                          ? `Alles opgeslagen om ${new Date(lastSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Wijzigingen worden opgeslagen met de knop onderaan.'}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div className="space-y-6">

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-amber-400" />
                  <span className="text-base font-semibold">Status</span>
                  <MeerwerkbonStatusBadge status={meerwerkbon.status} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    {pricingMode === 'begroot' ? 'Totaal incl. BTW' : 'Begroot totaal incl. BTW'}
                  </div>
                  <div className="font-semibold">{formatCurrency(totals.totaalInclBtw)}</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(meerwerkbon.invoiceLink as any)?.invoiceId ? (
                <div>
                  <span className="text-muted-foreground">Gekoppelde factuur:</span>{' '}
                  <Link className="underline underline-offset-4" href={`/facturen/${(meerwerkbon.invoiceLink as any).invoiceId}`}>
                    {(meerwerkbon.invoiceLink as any).invoiceNumberLabel || (meerwerkbon.invoiceLink as any).invoiceId}
                  </Link>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" className="h-9" onClick={() => handleSetStatus('verzonden')} disabled={statusUpdating || meerwerkbon.status === 'gefactureerd'}>
                  Markeer als verzonden
                </Button>
                <Button type="button" variant="outline" className="h-9" onClick={() => handleSetStatus('afgekeurd')} disabled={statusUpdating || meerwerkbon.status === 'gefactureerd'}>
                  Markeer als afgekeurd
                </Button>
                <Button type="button" variant="success" className="h-9 gap-2" onClick={() => handleSetStatus('akkoord')} disabled={statusUpdating || meerwerkbon.status === 'gefactureerd'}>
                  <CheckCircle2 className="h-4 w-4" />
                  Markeer als akkoord
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={handleCreateCombinedInvoice}
                  disabled={creatingCombinedInvoice || meerwerkbon.status !== 'akkoord'}
                >
                  {creatingCombinedInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Maak gecombineerd factuur-concept
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prijswijze</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Kies hoe het meerwerk met de klant wordt afgerekend.</p>
              <div className="grid gap-2 md:grid-cols-3">
                <Button
                  type="button"
                  variant={pricingMode === 'begroot' ? 'success' : 'outline'}
                  className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left"
                  onClick={() => void handlePricingModeChange('begroot')}
                >
                  <span>
                    <span className="block font-medium">Begrote kosten</span>
                    <span className="block text-xs font-normal opacity-80">Vaste voorafgaande inschatting</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={pricingMode === 'uren_nacalculatie' ? 'success' : 'outline'}
                  className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left"
                  onClick={() => void handlePricingModeChange('uren_nacalculatie')}
                >
                  <span>
                    <span className="block font-medium">Uren op nacalculatie</span>
                    <span className="block text-xs font-normal opacity-80">{pricingModeRateLabel('uren_nacalculatie', hourlyRateExclBtw)}</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={pricingMode === 'uren_materialen_nacalculatie' ? 'success' : 'outline'}
                  className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left"
                  onClick={() => void handlePricingModeChange('uren_materialen_nacalculatie')}
                >
                  <span>
                    <span className="block font-medium">Uren + materialen op nacalculatie</span>
                    <span className="block text-xs font-normal opacity-80">{pricingModeRateLabel('uren_materialen_nacalculatie', hourlyRateExclBtw)}</span>
                  </span>
                </Button>
              </div>
              <div className="rounded-md border border-border/60 bg-card/30 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{pricingModeLabel(pricingMode)}:</span>{' '}
                {pricingModeDescription(
                  pricingMode,
                  hourlyRateExclBtw,
                  Number(geschatteArbeidsuren.replace(',', '.')) > 0 ? Number(geschatteArbeidsuren.replace(',', '.')) : undefined
                )}
              </div>

              {pricingMode !== 'begroot' && (
                <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
                  <div>
                    <Label htmlFor="geschatte-arbeidsuren" className="text-foreground">
                      Schatting uren voor arbeid
                    </Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Vul bijvoorbeeld 10 uur in. Dit is alleen een indicatie en geen vaste prijs of akkoord op een maximum aantal uren.
                      De werkelijke uren worden achteraf afgerekend: ongeveer 10 uur geschat en 13 uur gewerkt betekent 13 uur factureren; 7 uur gewerkt betekent 7 uur factureren.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 max-w-xs">
                    <Input
                      id="geschatte-arbeidsuren"
                      type="number"
                      min="0"
                      step="0.5"
                      value={geschatteArbeidsuren}
                      onChange={(event) => setGeschatteArbeidsuren(event.target.value)}
                      placeholder="Bijv. 10"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">uur (ongeveer)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {geschatteArbeidsuren !== opgeslagenArbeidsuren
                      ? 'Er zijn niet-opgeslagen wijzigingen. Gebruik de knop onderaan om alles op te slaan.'
                      : 'Deze schatting wordt op de meerwerkbon en in de PDF vermeld.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <TabsContent value="overzicht" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Akkoordgegevens klant</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-3">
                    <Label>Gekoppelde klant</Label>
                    {clientSelectionLockedByQuote ? (
                      <Input
                        value={meerwerkbon.clientSnapshot?.naam || ''}
                        disabled
                        readOnly
                      />
                    ) : (
                      <Select
                        value={selectedClientOptionId || undefined}
                        onValueChange={handleClientSelection}
                        disabled={updatingClient || clientOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={clientOptions.length === 0 ? 'Geen klanten beschikbaar' : 'Kies een klant'} />
                        </SelectTrigger>
                        <SelectContent>
                          {clientOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {clientSelectionLockedByQuote
                        ? 'Klant is automatisch gekoppeld via de geselecteerde offerte.'
                        : 'Geen gekoppelde offertes: je kunt hier handmatig een klant kiezen.'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Naam</Label>
                    <Input value={approvalForm.naam} onChange={(e) => setApprovalForm((prev) => ({ ...prev, naam: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Plaats</Label>
                    <Input value={approvalForm.plaats} onChange={(e) => setApprovalForm((prev) => ({ ...prev, plaats: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Datum</Label>
                    <Input type="date" value={approvalForm.datum} onChange={(e) => setApprovalForm((prev) => ({ ...prev, datum: e.target.value }))} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Werkzaamheden</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label>Opmerking / omschrijving van het meerwerk</Label>
                  <Textarea
                    rows={5}
                    value={opmerking}
                    onChange={(e) => setOpmerking(e.target.value)}
                    placeholder="Beschrijf duidelijk welk extra werk wordt uitgevoerd..."
                  />
                  <div className="text-xs text-muted-foreground">
                    Deze omschrijving komt op de meerwerkbon en in de PDF.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Teksten</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Introductietekst</Label>
                    <Textarea rows={4} value={introText} onChange={(e) => setIntroText(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Voorwaarden</Label>
                    <Textarea rows={6} value={voorwaardenText} onChange={(e) => setVoorwaardenText(e.target.value)} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasUnsavedChanges
                      ? 'Wijzigingen worden opgeslagen met de knop onderaan.'
                      : lastSavedAt
                        ? `Alles opgeslagen om ${new Date(lastSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Wijzigingen worden opgeslagen met de knop onderaan.'}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="regels" className="space-y-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>Regels</span>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" className="gap-2" onClick={() => setMaterialModalOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Materiaal
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={addFreeLine}>
                        <Plus className="h-4 w-4" />
                        Vrije post
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lineItems.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                      Nog geen regels toegevoegd.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="hidden md:grid md:grid-cols-[2fr_90px_90px_140px_90px_140px_48px] gap-3 px-3 text-[11px] font-bold text-muted-foreground/90 uppercase tracking-wider">
                        <div>Omschrijving</div>
                        <div>Aantal</div>
                        <div>Eenheid</div>
                        <div className="text-right">
                          Prijs <span className="text-[9px] font-normal lowercase">(excl. btw)</span>
                        </div>
                        <div className="text-right">BTW</div>
                        <div className="text-right">
                          Totaal <span className="text-[9px] font-normal lowercase">(incl. btw)</span>
                        </div>
                        <div />
                      </div>
                      {lineItems.map((row, index) => (
                        <div key={row.id} className="rounded-lg border border-border/60 bg-card/30 p-3 grid gap-3 md:grid-cols-[2fr_90px_90px_140px_90px_140px_48px]">
                          <Input
                            value={row.omschrijving}
                            placeholder="Omschrijving"
                            onChange={(e) => setLineItems((prev) => prev.map((item, idx) => idx === index ? normalizeMeerwerkbonLineItem({ ...item, omschrijving: e.target.value }) : item))}
                          />
                          <Input
                            type="number"
                            value={row.aantal}
                            className="text-right"
                            onChange={(e) => setLineItems((prev) => prev.map((item, idx) => idx === index ? normalizeMeerwerkbonLineItem({ ...item, aantal: Number(e.target.value) }) : item))}
                          />
                          <Input
                            value={row.eenheid}
                            onChange={(e) => setLineItems((prev) => prev.map((item, idx) => idx === index ? normalizeMeerwerkbonLineItem({ ...item, eenheid: e.target.value }) : item))}
                          />
                          <Input
                            type="number"
                            value={row.prijsPerEenheidExclBtw}
                            className="text-right"
                            onChange={(e) => setLineItems((prev) => prev.map((item, idx) => idx === index ? normalizeMeerwerkbonLineItem({ ...item, prijsPerEenheidExclBtw: Number(e.target.value) }) : item))}
                          />
                          <Input
                            type="number"
                            value={row.btwTarief}
                            className="text-right"
                            onChange={(e) => setLineItems((prev) => prev.map((item, idx) => idx === index ? normalizeMeerwerkbonLineItem({ ...item, btwTarief: Number(e.target.value) }) : item))}
                          />
                          <div className="h-10 rounded-md border border-input bg-background/50 px-3 flex items-center justify-end text-sm font-semibold">
                            {formatCurrency(row.totaalInclBtw)}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLineItems((prev) => prev.filter((_, idx) => idx !== index))}
                          >
                            <Trash2 className="h-4 w-4 text-red-300" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-border/60 bg-card/30 p-4 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subtotaal excl. BTW</span>
                      <span className="font-semibold">{formatCurrency(totals.subtotaalExclBtw)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">BTW totaal</span>
                      <span className="font-semibold">{formatCurrency(totals.btwTotaal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Totaal incl. BTW</span>
                      <span className="font-semibold">{formatCurrency(totals.totaalInclBtw)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {hasUnsavedChanges
                      ? 'Regelwijzigingen worden opgeslagen met de knop onderaan.'
                      : lastSavedAt
                        ? `Alles opgeslagen om ${new Date(lastSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Regelwijzigingen worden opgeslagen met de knop onderaan.'}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pdf" className="space-y-4">
              <PDFPreviewMeerwerkbon pdfData={pdfData} />
            </TabsContent>
        </div>
        </Tabs>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.2)] backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {savingAll
              ? 'Meerwerkbon wordt opgeslagen...'
              : hasUnsavedChanges
                ? 'Er zijn niet-opgeslagen wijzigingen.'
                : lastSavedAt
                  ? `Alles opgeslagen om ${new Date(lastSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Alle wijzigingen worden opgeslagen met één knop.'}
          </div>
          <Button
            type="button"
            variant="success"
            className="w-full gap-2 sm:w-auto"
            onClick={() => void handleSaveMeerwerkbon()}
            disabled={savingAll || !hasUnsavedChanges}
          >
            {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingAll ? 'Opslaan...' : 'Meerwerkbon opslaan'}
          </Button>
        </div>
      </footer>

      <SendMeerwerkbonModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        klantEmail={meerwerkbon.clientSnapshot?.email || ''}
        klantAanhef={meerwerkbon.clientSnapshot?.naam || ''}
        meerwerkbonNummer={meerwerkbon.numbering?.label || meerwerkbon.id}
        totaalInclBtw={totals.totaalInclBtw}
        bedrijfsnaam={settings.bedrijfsnaam || businessData?.bedrijfsnaam || ''}
        onDownloadPDF={handleDownloadPdf}
      />

      <SendQuoteWhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        klantInfo={whatsappKlantInfo}
        clientName={meerwerkbon.clientSnapshot?.naam || 'klant'}
        quotePdfUrl=""
        requireDocumentUrl={false}
        documentLabel="meerwerkbon"
        documentLinkToken="{{meerwerkbon_link}}"
        storageKey="whatsapp_meerwerkbon_message_preset_v1"
        successDescription="De officiële meerwerkbon-PDF is gedownload. Voeg deze handmatig toe in WhatsApp en verstuur."
        onDownloadOfficialPdf={handleDownloadPdf}
      />

      <MaterialSelectionModal
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
        existingMaterials={materials as any}
        onSelectExisting={addMaterialLine}
        onMaterialAdded={addMaterialLine}
        defaultCategory="all"
      />
    </div>
  );
}
