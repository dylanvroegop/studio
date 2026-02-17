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
  Plus,
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
  MeerwerkbonTemplatePreset,
  MeerwerkbonTemplateSettings,
} from '@/lib/types';
import { calculateMeerwerkbonTotals, clientSnapshotKey, formatCurrency, normalizeMeerwerkbonLineItem, recalcMeerwerkbonLineItems, safeNumber } from '@/lib/meerwerkbon-utils';
import {
  createCombinedInvoiceConceptFromMeerwerkbon,
  updateMeerwerkbonClientSnapshot,
  updateMeerwerkbonLineItems,
  updateMeerwerkbonStatus,
  updateMeerwerkbonTemplate,
} from '@/lib/meerwerkbon-actions';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/lib/types-settings';
import { generateMeerwerkbonPDF, type PDFMeerwerkbonData } from '@/lib/generate-meerwerkbon-pdf';
import { PDFPreviewMeerwerkbon } from '@/components/meerwerk/PDFPreviewMeerwerkbon';
import { SendMeerwerkbonModal } from '@/components/meerwerk/SendMeerwerkbonModal';
import { MeerwerkbonStatusBadge } from '@/components/meerwerk/MeerwerkbonStatusBadge';
import { toast } from '@/hooks/use-toast';
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';

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

function serializeRulesState(
  items: Partial<MeerwerkbonLineItem>[],
  introText: string,
  voorwaardenText: string
): string {
  const normalized = recalcMeerwerkbonLineItems(items);
  return JSON.stringify({
    lineItems: normalized,
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
  const [introText, setIntroText] = useState('');
  const [voorwaardenText, setVoorwaardenText] = useState('');
  const [template, setTemplate] = useState<MeerwerkbonTemplateSettings>(defaultTemplateByPreset('uitgebreid'));
  const [approvalForm, setApprovalForm] = useState<MeerwerkbonApproval>({
    naam: '',
    plaats: '',
    datum: toDateInputValue(new Date()),
    opmerking: '',
  });

  const [savingRules, setSavingRules] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [rulesSavedAt, setRulesSavedAt] = useState<number | null>(null);
  const [templateSavedAt, setTemplateSavedAt] = useState<number | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
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
  const rulesAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRulesRef = useRef<string>('');
  const lastSyncedTemplateRef = useRef<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

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
        const nextIntroText = (data.introText || '').toString();
        const nextVoorwaardenText = (data.voorwaardenText || '').toString();
        const nextTemplate = data.template || defaultTemplateByPreset('uitgebreid');

        setMeerwerkbon(data);
        setLineItems(nextLineItems);
        setIntroText(nextIntroText);
        setVoorwaardenText(nextVoorwaardenText);
        setTemplate(nextTemplate);
        setApprovalForm({
          naam: data.approval?.naam || data.clientSnapshot?.naam || '',
          plaats: data.approval?.plaats || data.clientSnapshot?.plaats || '',
          datum: data.approval?.datum || toDateInputValue(new Date()),
          opmerking: data.approval?.opmerking || '',
        });
        lastSyncedRulesRef.current = serializeRulesState(nextLineItems, nextIntroText, nextVoorwaardenText);
        lastSyncedTemplateRef.current = serializeTemplateState(nextTemplate);
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
      introText,
      voorwaardenText,
      approval: {
        naam: approvalForm.naam,
        plaats: approvalForm.plaats,
        datum: approvalForm.datum,
        opmerking: approvalForm.opmerking,
      },
      template,
    };
  }, [meerwerkbon, settings, businessData, linkedQuotes, lineItems, totals, introText, voorwaardenText, approvalForm, template]);

  const serializedRulesState = useMemo(
    () => serializeRulesState(lineItems, introText, voorwaardenText),
    [lineItems, introText, voorwaardenText]
  );
  const serializedTemplateState = useMemo(
    () => serializeTemplateState(template),
    [template]
  );

  useEffect(() => {
    if (!firestore || !meerwerkbon || !hydratedRef.current) return;
    if (serializedRulesState === lastSyncedRulesRef.current) return;

    if (rulesAutosaveTimerRef.current) {
      clearTimeout(rulesAutosaveTimerRef.current);
    }

    rulesAutosaveTimerRef.current = setTimeout(async () => {
      const normalizedLineItems = recalcMeerwerkbonLineItems(lineItems);
      const invalid = normalizedLineItems.some((item) => !item.omschrijving.trim() || safeNumber(item.aantal, 0) <= 0);
      if (invalid) return;

      setSavingRules(true);
      try {
        await updateMeerwerkbonLineItems(firestore, {
          meerwerkbonId: meerwerkbon.id,
          lineItems: normalizedLineItems,
          introText,
          voorwaardenText,
        });
        lastSyncedRulesRef.current = serializeRulesState(normalizedLineItems, introText, voorwaardenText);
        setRulesSavedAt(Date.now());
      } catch (err: any) {
        console.error(err);
        toast({
          title: 'Autosave mislukt',
          description: err?.message || 'Kon regels niet automatisch opslaan.',
          variant: 'destructive',
        });
      } finally {
        setSavingRules(false);
      }
    }, 700);

    return () => {
      if (rulesAutosaveTimerRef.current) {
        clearTimeout(rulesAutosaveTimerRef.current);
      }
    };
  }, [serializedRulesState, firestore, meerwerkbon?.id, lineItems, introText, voorwaardenText]);

  useEffect(() => {
    if (!firestore || !meerwerkbon || !hydratedRef.current) return;
    if (serializedTemplateState === lastSyncedTemplateRef.current) return;

    if (templateAutosaveTimerRef.current) {
      clearTimeout(templateAutosaveTimerRef.current);
    }

    templateAutosaveTimerRef.current = setTimeout(async () => {
      setSavingTemplate(true);
      try {
        await updateMeerwerkbonTemplate(firestore, {
          meerwerkbonId: meerwerkbon.id,
          template,
        });
        lastSyncedTemplateRef.current = serializeTemplateState(template);
        setTemplateSavedAt(Date.now());
      } catch (err: any) {
        console.error(err);
        toast({
          title: 'Autosave mislukt',
          description: err?.message || 'Kon PDF-instellingen niet automatisch opslaan.',
          variant: 'destructive',
        });
      } finally {
        setSavingTemplate(false);
      }
    }, 500);

    return () => {
      if (templateAutosaveTimerRef.current) {
        clearTimeout(templateAutosaveTimerRef.current);
      }
    };
  }, [serializedTemplateState, firestore, meerwerkbon?.id, template]);

  useEffect(() => {
    return () => {
      if (rulesAutosaveTimerRef.current) clearTimeout(rulesAutosaveTimerRef.current);
      if (templateAutosaveTimerRef.current) clearTimeout(templateAutosaveTimerRef.current);
    };
  }, []);

  const linkedQuoteCount = useMemo(
    () => (Array.isArray(meerwerkbon?.linkedQuoteIds) ? meerwerkbon!.linkedQuoteIds.length : 0),
    [meerwerkbon?.linkedQuoteIds]
  );
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
            opmerking: (approvalForm.opmerking || '').trim(),
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

      <main className="mx-auto max-w-7xl p-4 pb-10 sm:p-6">
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
                      {savingTemplate
                        ? 'PDF instellingen worden automatisch opgeslagen...'
                        : templateSavedAt
                          ? `PDF instellingen automatisch opgeslagen om ${new Date(templateSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                          : 'PDF instellingen worden automatisch opgeslagen.'}
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
                  <div className="text-xs text-muted-foreground">Totaal incl. BTW</div>
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
                  <div className="space-y-2 md:col-span-3">
                    <Label>Opmerking (optioneel)</Label>
                    <Textarea value={approvalForm.opmerking || ''} onChange={(e) => setApprovalForm((prev) => ({ ...prev, opmerking: e.target.value }))} />
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
                    {savingRules
                      ? 'Wijzigingen worden automatisch opgeslagen...'
                      : rulesSavedAt
                        ? `Automatisch opgeslagen om ${new Date(rulesSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Wijzigingen worden automatisch opgeslagen.'}
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
                    {savingRules
                      ? 'Regels worden automatisch opgeslagen...'
                      : rulesSavedAt
                        ? `Regels automatisch opgeslagen om ${new Date(rulesSavedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Regels worden automatisch opgeslagen.'}
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
