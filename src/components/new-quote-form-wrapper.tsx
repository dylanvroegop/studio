/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
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
  DialogDescription,
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
  BookUser,
  Sparkles,
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

function normalizeAppointmentDate(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return raw;
}

function normalizeAppointmentTime(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().replace(';', ':').replace('.', ':') : '';
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function buildAddressLine(parts: {
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}) {
  const line1 = [parts.straat, parts.huisnummer].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  const line2 = [parts.postcode, parts.plaats].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
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
  achternaam: z.string().optional(),
  emailadres: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().email('Ongeldig e-mailadres').optional()
  ),
  telefoonnummer: z.string().optional(),
  straat: z.string().optional(),
  huisnummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  afwijkendProjectadres: z.preprocess((val) => val === 'on', z.boolean()).optional(),
  projectStraat: z.string().optional(),
  projectHuisnummer: z.string().optional(),
  projectPostcode: z.string().optional(),
  projectPlaats: z.string().optional(),
});

/* ---------------------------------------------
 Component
--------------------------------------------- */
export function NewQuoteForm({
  quoteId,
  backHref,
  successHref,
}: {
  quoteId?: string;
  backHref?: string;
  successHref?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const formId = useId();

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
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiSourceImages, setAiSourceImages] = useState<File[]>([]);
  const [isAiExtracting, setIsAiExtracting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const resolvedBackHref = backHref ?? (quoteId ? '/offertes' : '/');
  const requiresWorkDescriptionPrompt = Boolean(successHref);
  const formRef = useRef<HTMLFormElement | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftSnapshotRef = useRef<string>('');
  const isFlushingDraftRef = useRef(false);
  const cleanupBodyModalLocks = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  const selectClient = async (client: any) => {
    setInitialKI(client);
    setKlanttype(client.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier');
    setShowProjectAddress(!!client.afwijkendProjectadres);
    setFormKey((prev) => prev + 1);
    setIsClientModalOpen(false);
    requestAnimationFrame(() => cleanupBodyModalLocks());

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

  const normalizeExtractedClientData = useCallback((rawClient: Record<string, unknown>) => {
    const get = (key: string) => (typeof rawClient[key] === 'string' ? String(rawClient[key]).trim() : '');
    const klanttypeRaw = get('klanttype').toLowerCase();
    const isZakelijk = klanttypeRaw === 'zakelijk';
    const afwijkendProjectadres =
      rawClient.afwijkendProjectadres === true
      || get('afwijkendProjectadres').toLowerCase() === 'true'
      || get('afwijkendProjectadres').toLowerCase() === 'ja';

    const normalized = {
      klanttype: isZakelijk ? 'Zakelijk' : 'Particulier',
      bedrijfsnaam: get('bedrijfsnaam'),
      contactpersoon: get('contactpersoon'),
      voornaam: formatCapitalize(get('voornaam')),
      achternaam: formatCapitalize(get('achternaam')),
      emailadres: get('emailadres'),
      telefoonnummer: get('telefoonnummer'),
      straat: formatCapitalize(get('straat')),
      huisnummer: get('huisnummer'),
      postcode: formatPostcode(get('postcode')),
      plaats: formatCapitalize(get('plaats')),
      afwijkendProjectadres,
      projectStraat: formatCapitalize(get('projectStraat')),
      projectHuisnummer: get('projectHuisnummer'),
      projectPostcode: formatPostcode(get('projectPostcode')),
      projectPlaats: formatCapitalize(get('projectPlaats')),
      afspraakAanwezig: rawClient.afspraakAanwezig === true || get('afspraakAanwezig').toLowerCase() === 'true' || get('afspraakAanwezig').toLowerCase() === 'ja',
      afspraakDatum: normalizeAppointmentDate(rawClient.afspraakDatum),
      afspraakTijd: normalizeAppointmentTime(rawClient.afspraakTijd),
      afspraakOmschrijving: get('afspraakOmschrijving'),
    };

    return normalized;
  }, []);

  const syncPlanningEntryToGoogleCalendar = useCallback(async (payload: {
    action: 'upsert';
    entryId: string;
    googleCalendarEventId?: string | null;
    quoteId: string;
    startDate: Date;
    endDate: Date;
    notes?: string;
    cache: {
      clientName: string;
      projectTitle: string;
      projectAddress: string;
    };
  }) => {
    if (!user) return;
    const token = await user.getIdToken().catch(() => null);
    if (!token) return;

    const response = await fetch('/api/google-calendar/sync-entry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: payload.action,
        entryId: payload.entryId,
        googleCalendarEventId: payload.googleCalendarEventId,
        quoteId: payload.quoteId,
        planningType: 'werkbespreking',
        startDate: payload.startDate.toISOString(),
        endDate: payload.endDate.toISOString(),
        notes: payload.notes || '',
        cache: payload.cache,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error || 'Google Calendar synchronisatie mislukt.');
    }

    const result = await response.json().catch(() => null) as {
      ok?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
    } | null;
    if (result?.skipped) {
      throw new Error(
        result.reason === 'calendar_not_connected'
          ? 'Google Calendar is niet gekoppeld. De afspraak is NIET in Google Calendar gezet.'
          : 'Google Calendar synchronisatie is overgeslagen. De afspraak is NIET in Google Calendar gezet.'
      );
    }
    if (!result?.ok) {
      throw new Error(result?.error || 'Google Calendar synchronisatie mislukt. De afspraak is NIET in Google Calendar gezet.');
    }
  }, [user]);

  const upsertExtractedWorkMeeting = useCallback(async (clientData: ReturnType<typeof normalizeExtractedClientData>) => {
    if (!quoteId || !firestore || !user) return null;
    if (!clientData.afspraakAanwezig || !clientData.afspraakDatum || !clientData.afspraakTijd) return null;

    const startDate = new Date(`${clientData.afspraakDatum}T${clientData.afspraakTijd}:00`);
    if (!Number.isFinite(startDate.getTime())) return null;
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const clientName = clientData.bedrijfsnaam || `${clientData.voornaam || ''} ${clientData.achternaam || ''}`.trim() || 'Onbekend';
    const projectAddress = clientData.afwijkendProjectadres
      ? buildAddressLine({
          straat: clientData.projectStraat,
          huisnummer: clientData.projectHuisnummer,
          postcode: clientData.projectPostcode,
          plaats: clientData.projectPlaats,
        })
      : buildAddressLine({
          straat: clientData.straat,
          huisnummer: clientData.huisnummer,
          postcode: clientData.postcode,
          plaats: clientData.plaats,
        });
    const cache = {
      clientName,
      projectTitle: 'Werkbespreking',
      projectAddress,
      totalQuoteHours: 1,
      totalQuoteAmount: 0,
      totalQuoteEarnings: 0,
    };
    const notes = clientData.afspraakOmschrijving || 'Werkbespreking uit screenshot';

    const existingSnapshot = await getDocs(query(
      collection(firestore, 'planning_entries'),
      where('userId', '==', user.uid),
      where('quoteId', '==', quoteId)
    ));
    const existingMeeting = existingSnapshot.docs.find((planningDoc) => {
      const data = planningDoc.data();
      return data?.planningType === 'werkbespreking' && data?.status !== 'cancelled';
    });

    let entryId = existingMeeting?.id || '';
    const googleCalendarEventId = typeof existingMeeting?.data()?.googleCalendarEventId === 'string'
      ? existingMeeting.data().googleCalendarEventId
      : null;

    if (existingMeeting) {
      await updateDoc(existingMeeting.ref, {
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        scheduledHours: 1,
        planningType: 'werkbespreking',
        isAutoSplit: false,
        status: 'scheduled',
        notes,
        cache,
        updatedAt: serverTimestamp(),
      });
    } else {
      const entryRef = await addDoc(collection(firestore, 'planning_entries'), {
        userId: user.uid,
        quoteId,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        scheduledHours: 1,
        planningType: 'werkbespreking',
        isAutoSplit: false,
        parentEntryId: null,
        status: 'scheduled',
        notes,
        cache,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      entryId = entryRef.id;
    }

    await updateDoc(doc(firestore, 'quotes', quoteId), {
      status: startDate.getTime() <= Date.now() ? 'concept' : 'werkbespreking',
      updatedAt: serverTimestamp(),
    });

    await syncPlanningEntryToGoogleCalendar({
      action: 'upsert',
      entryId,
      googleCalendarEventId,
      quoteId,
      startDate,
      endDate,
      notes,
      cache,
    });

    return {
      entryId,
      date: clientData.afspraakDatum,
      time: clientData.afspraakTijd,
      clientName,
      projectAddress,
      notes,
    };
  }, [firestore, quoteId, syncPlanningEntryToGoogleCalendar, user]);

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

  const collectDraftClientDataFromForm = useCallback((formEl: HTMLFormElement): Record<string, unknown> => {
    const formData = new FormData(formEl);
    const raw: Record<string, unknown> = Object.fromEntries(formData.entries());

    const get = (key: string) => (typeof raw[key] === 'string' ? String(raw[key]).trim() : '');
    const afwijkendProjectadres = raw.afwijkendProjectadres === 'on';

    const voornaam = formatCapitalize(get('voornaam'));
    const achternaam = formatCapitalize(get('achternaam'));
    const straat = formatCapitalize(get('straat'));
    const plaats = formatCapitalize(get('plaats'));
    const postcode = formatPostcode(get('postcode'));
    const projectStraat = formatCapitalize(get('projectStraat'));
    const projectPlaats = formatCapitalize(get('projectPlaats'));
    const projectPostcode = formatPostcode(get('projectPostcode'));
    const klanttypeRaw = get('klanttype');

    return {
      klanttype: klanttypeRaw === 'zakelijk' ? 'Zakelijk' : 'Particulier',
      bedrijfsnaam: get('bedrijfsnaam'),
      contactpersoon: get('contactpersoon'),
      voornaam,
      achternaam,
      emailadres: get('emailadres'),
      telefoonnummer: get('telefoonnummer'),
      straat,
      huisnummer: get('huisnummer'),
      postcode,
      plaats,
      afwijkendProjectadres,
      ...(afwijkendProjectadres
        ? {
            projectStraat,
            projectHuisnummer: get('projectHuisnummer'),
            projectPostcode,
            projectPlaats,
          }
        : {}),
    };
  }, []);

  const persistDraftClientData = useCallback(async (force = false) => {
    if (!quoteId || !firestore || !formRef.current || isFlushingDraftRef.current) return;
    const draft = collectDraftClientDataFromForm(formRef.current);
    const cleanDraft = cleanFirestoreData(draft);
    const snapshot = JSON.stringify(cleanDraft);

    if (!force && snapshot === lastDraftSnapshotRef.current) return;

    try {
      isFlushingDraftRef.current = true;
      await updateDoc(doc(firestore, 'quotes', quoteId), {
        klantinformatie: cleanDraft,
        updatedAt: serverTimestamp(),
      });
      lastDraftSnapshotRef.current = snapshot;
    } catch (error) {
      console.error('Draft auto-save error:', error);
    } finally {
      isFlushingDraftRef.current = false;
    }
  }, [collectDraftClientDataFromForm, firestore, quoteId]);

  const scheduleDraftSave = useCallback(() => {
    if (!quoteId || !firestore) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      void persistDraftClientData();
    }, 450);
  }, [firestore, persistDraftClientData, quoteId]);

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      cleanupBodyModalLocks();
    };
  }, [cleanupBodyModalLocks]);

  useEffect(() => {
    if (isClientModalOpen || isAiDialogOpen) return;
    const timer = window.setTimeout(() => cleanupBodyModalLocks(), 0);
    return () => window.clearTimeout(timer);
  }, [cleanupBodyModalLocks, isAiDialogOpen, isClientModalOpen]);

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
    const workDescriptionPrompt =
      typeof raw.workDescriptionPrompt === 'string' ? raw.workDescriptionPrompt.trim() : '';

    startTransition(async () => {
      const validated = KlantinformatieSchema.safeParse(raw);
      if (!validated.success) {
        const firstMessage = validated.error.issues[0]?.message || 'Controleer de ingevulde velden';
        toast({ variant: 'destructive', title: firstMessage });
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
        const emailadres = typeof cleanData.emailadres === 'string' ? cleanData.emailadres.trim() : '';
        if (emailadres) {
          const q = query(
            clientRef,
            where('emailadres', '==', emailadres),
            where('userId', '==', user.uid)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            const docId = snap.docs[0].id;
            await updateDoc(doc(firestore, 'clients', docId), { ...cleanData, updatedAt: serverTimestamp() });
          } else {
            await addDoc(clientRef, { ...cleanData, createdAt: serverTimestamp() });
          }
        } else {
          await addDoc(clientRef, { ...cleanData, createdAt: serverTimestamp() });
        }

        // 2) UPDATE QUOTE FINAL CHECK & NAVIGATE
        await updateDoc(doc(firestore, 'quotes', quoteId), {
          klantinformatie: cleanData
        });

        // 3) Ensure Supabase data_json is in sync with the latest client info.
        // Needed for manual-flow quotes that were initialized before klantdata existed.
        const token = await user.getIdToken();
        await fetch('/api/quotes/ensure-data-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteId }),
        });

        if (requiresWorkDescriptionPrompt && workDescriptionPrompt) {
          const generateResponse = await fetch('/api/generate-work-description', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              quoteId,
              prompt: workDescriptionPrompt,
            }),
          });

          const generatePayload = await generateResponse.json().catch(() => null) as { error?: string } | null;
          if (!generateResponse.ok) {
            throw new Error(generatePayload?.error || 'Kon Werk & Levering niet genereren.');
          }
        }

        const resolvedSuccessHref = successHref || `/offertes/${quoteId}/klus/nieuw`;
        router.push(resolvedSuccessHref);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Fout bij opslaan';
        toast({ variant: 'destructive', title: message });
      }
    });
  };

  const handleBackClick = async () => {
    if (quoteId && firestore) {
      await persistDraftClientData(true);
    }
    router.push(resolvedBackHref);
  };

  const handleGenerateClientFromImages = async (sourceImages: File[]) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Je moet ingelogd zijn.' });
      return;
    }

    if (isAiExtracting) {
      return;
    }

    setIsAiExtracting(true);
    if (sourceImages.length === 0 || sourceImages.length > 2) {
      toast({
        variant: 'destructive',
        title: sourceImages.length > 2 ? 'Selecteer maximaal 2 afbeeldingen.' : 'Selecteer minimaal 1 afbeelding.',
      });
      setIsAiExtracting(false);
      return;
    }

    setAiSourceImages(sourceImages);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      sourceImages.forEach((sourceImage) => formData.append('files', sourceImage));

      const response = await fetch('/api/quotes/extract-client-info', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        message?: string;
        model?: string;
        client?: Record<string, unknown>;
      } | null;

      if (!response.ok || !payload?.ok || !payload.client) {
        throw new Error(payload?.message || 'Kon klantgegevens niet genereren.');
      }

      const normalized = normalizeExtractedClientData(payload.client);
      const plannedWorkMeeting = await upsertExtractedWorkMeeting(normalized);
      const nextKlanttype = normalized.klanttype === 'Zakelijk' ? 'zakelijk' : 'particulier';
      const hasProjectAddress = Boolean(
        normalized.afwijkendProjectadres
        || normalized.projectStraat
        || normalized.projectHuisnummer
        || normalized.projectPostcode
        || normalized.projectPlaats
      );

      setInitialKI(normalized);
      setKlanttype(nextKlanttype);
      setShowProjectAddress(hasProjectAddress);
      setFormKey((prev) => prev + 1);

      if (quoteId && firestore) {
        await updateDoc(doc(firestore, 'quotes', quoteId), {
          klantinformatie: cleanFirestoreData(normalized),
          updatedAt: serverTimestamp(),
        });
      }

      setIsAiDialogOpen(false);
      setAiSourceImages([]);
      toast({
        title: plannedWorkMeeting ? 'Klantgegevens en Google Calendar-afspraak ingevuld' : 'Klantgegevens ingevuld',
        description: plannedWorkMeeting
          ? `Werkbespreking staat in Google Calendar op ${plannedWorkMeeting.date} om ${plannedWorkMeeting.time}.`
          : `Velden zijn ingevuld met ${payload.model || 'gpt-5.2'}. Controleer alles nog even.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kon klantgegevens niet genereren.';
      toast({
        variant: 'destructive',
        title: message.includes('Google Calendar') ? 'Afspraak niet in Google Calendar gezet' : message,
        description: message.includes('Google Calendar') ? message : undefined,
      });
    } finally {
      setIsAiExtracting(false);
    }
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Dialog
                open={isAiDialogOpen}
                onOpenChange={(open) => {
                  setIsAiDialogOpen(open);
                  if (!open) requestAnimationFrame(() => cleanupBodyModalLocks());
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Genereer uit screenshot</span>
                    <span className="sm:hidden">Genereer</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Klantgegevens genereren</DialogTitle>
                    <DialogDescription>
                      Upload 1 of 2 screenshots of foto&apos;s met klantgegevens. Gegevens uit beide afbeeldingen worden gecombineerd met AI (gpt-5.2).
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                      <Label htmlFor="ai-client-image">Afbeeldingen (maximaal 2)</Label>
                      <Input
                        id="ai-client-image"
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
                        onChange={async (event) => {
                          const files = Array.from(event.target.files || []);
                          if (files.length > 2) {
                            toast({
                              variant: 'destructive',
                              title: 'Selecteer maximaal 2 afbeeldingen.',
                            });
                          } else if (files.length > 0) {
                            await handleGenerateClientFromImages(files);
                          }
                          event.currentTarget.value = '';
                        }}
                        disabled={isAiExtracting}
                      />
                    {aiSourceImages.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {aiSourceImages.map((image) => image.name).join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Selecteer bijvoorbeeld één afbeelding met contactgegevens en één met het adres. Ondersteund: JPG, PNG, WEBP, HEIC/HEIF.
                      </p>
                    )}
                    {isAiExtracting && (
                      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Screenshot wordt geanalyseerd en velden worden direct ingevuld...
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsAiDialogOpen(false);
                          setAiSourceImages([]);
                        }}
                        disabled={isAiExtracting}
                      >
                        Annuleren
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isClientModalOpen}
                onOpenChange={(open) => {
                  setIsClientModalOpen(open);
                  if (!open) requestAnimationFrame(() => cleanupBodyModalLocks());
                }}
              >
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
                          <button
                            key={client.id}
                            type="button"
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
                          </button>
                        );
                      })
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form
            id={formId}
            key={formKey}
            ref={formRef}
            onSubmit={handleFormSubmit}
            onInput={scheduleDraftSave}
            className="space-y-8"
          >
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
              <Label htmlFor="achternaam">Achternaam</Label>
              <Input
                id="achternaam"
                name="achternaam"
                placeholder="Achternaam"
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
              <Label htmlFor="emailadres">E-mailadres</Label>
              <Input
                id="emailadres"
                name="emailadres"
                type="email"
                placeholder="naam@voorbeeld.nl"
                defaultValue={initialKI?.emailadres}
                onBlur={(e) => handleAutoSave('emailadres', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefoonnummer">Telefoonnummer</Label>
              <Input
                id="telefoonnummer"
                name="telefoonnummer"
                type="tel"
                placeholder="06 12345678"
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
                <Label htmlFor="straat">Straat</Label>
                <Input
                  id="straat"
                  name="straat"
                  placeholder="Straatnaam"

                  defaultValue={initialKI?.straat}
                  onBlur={(e) => {
                    const v = formatCapitalize(e.target.value);
                    e.target.value = v;
                    handleAutoSave('straat', v);
                  }}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="huisnummer">Nr.</Label>
                <Input
                  id="huisnummer"
                  name="huisnummer"
                  placeholder="Nr."
                  defaultValue={initialKI?.huisnummer}
                  onBlur={(e) => handleAutoSave('huisnummer', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  placeholder="1234 AB"
                  defaultValue={initialKI?.postcode}
                  onBlur={(e) => {
                    const v = formatPostcode(e.target.value);
                    e.target.value = v;
                    handleAutoSave('postcode', v);
                  }}
                />
              </div>
              <div className="sm:col-span-4 space-y-1.5">
                <Label htmlFor="plaats">Plaats</Label>
                <Input
                  id="plaats"
                  name="plaats"
                  placeholder="Plaatsnaam"
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

          {requiresWorkDescriptionPrompt && (
            <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/10">
              <h3 className="font-medium">Werk &amp; Levering genereren</h3>
              <Input
                id="workDescriptionPrompt"
                name="workDescriptionPrompt"
                placeholder="Bijv. schilderklus woonkamer"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Korte input is genoeg. Bijvoorbeeld: &quot;schilderklus woonkamer&quot;.
                </p>
                <span className="text-xs font-medium text-emerald-500">Genereer</span>
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
                <Button variant="outline" type="button" onClick={handleBackClick}>
                  Terug
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
