'use client';

import { supabase } from '@/lib/supabase';
import { useState, useEffect, useRef } from 'react';
import { useQuoteData } from '@/hooks/useQuoteData';
import { calculateQuoteTotals, QuoteSettings as QuoteCalculationSettings, KlantInformatie, formatCurrency, MaterialItem, generateWorkSummary, normalizeWerkbeschrijving, normalizeDataJson, unwrapRoot } from '@/lib/quote-calculations';
import { ClientInfoCard } from '@/components/quote/ClientInfoCard';
import { CostSummaryCard } from '@/components/quote/CostSummaryCard';
import { WorkDescriptionCard } from '@/components/quote/WorkDescriptionCard';
import { MaterialEditor } from '@/components/quote/MaterialEditor';
import { LaborBreakdown } from '@/components/quote/LaborBreakdown';
import { PDFPreview } from '@/components/quote/PDFPreview';
import { QuoteSettings, QuotePDFSettings, defaultQuotePDFSettings } from '@/components/quote/QuoteSettings';
import { generateQuotePDF, PDFQuoteData } from '@/lib/generate-quote-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Euro, Package, Clock, FileText, MessageSquare, Download, Mail, Settings, PenTool, CalendarDays, Eye, ReceiptText, Loader2, AlertCircle, Save, Box, ChevronDown, ChevronRight, Sparkles, Search } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Link from "next/link";
import { SendQuoteModal } from '@/components/quote/SendQuoteModal';
import { DrawingsTab } from '@/components/quote/DrawingsTab';
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { HiddenPDFDrawings } from '@/components/quote/HiddenPDFDrawings';
import { QuoteSwitcher } from '@/components/quote/QuoteSwitcher';
import { AppNavigation } from '@/components/AppNavigation';
import { LogoUpload } from '@/components/settings/LogoUpload';
import { findExistingVoorschotInvoiceId } from '@/lib/invoice-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { parsePriceToNumber } from '@/lib/utils';

import { Quote } from "@/lib/types";

interface GrootCompareQuoteColumn {
    quoteId: string;
    label: string;
    offerteNummer: number | null;
    grootSubtotal: number;
    verbruikSubtotal: number;
    totalHours: number | null;
    itemsByProduct: Record<string, { aantal: number; totaal: number; detail: string }>;
    verbruikItemsByProduct: Record<string, { aantal: number; totaal: number; detail: string }>;
}

interface GrootCompareRow {
    product: string;
    values: Array<{ aantal: number; totaal: number; detail: string }>;
}

type MaterialPresetItem = {
    product: string;
    aantal: number;
    prijs_per_stuk: number;
    eenheid?: string;
};

type QuoteMaterialPreset = {
    grootmaterialen: MaterialPresetItem[];
    verbruiksartikelen: MaterialPresetItem[];
};

type QuoteMaterialPackage = QuoteMaterialPreset & {
    id: string;
    naam: string;
    updatedAt?: string;
};

function toPresetItems(items: MaterialItem[]): MaterialPresetItem[] {
    const mapped: Array<MaterialPresetItem | null> = items.map((item) => {
        const product = String(item.product || '').trim();
        if (!product) return null;

        const parsedAantal = Number(item.aantal);
        const parsedPrijs = Number(item.prijs_per_stuk);
        const aantal = Number.isFinite(parsedAantal) && parsedAantal > 0 ? parsedAantal : 1;
        const prijs = Number.isFinite(parsedPrijs) && parsedPrijs >= 0 ? parsedPrijs : 0;
        const rawEenheid = typeof (item as any).eenheid === 'string' ? (item as any).eenheid : '';

        const base: MaterialPresetItem = {
            product,
            aantal,
            prijs_per_stuk: prijs,
        };

        if (rawEenheid.trim()) {
            base.eenheid = rawEenheid.trim();
        }

        return base;
    });

    return mapped.filter((item): item is MaterialPresetItem => item !== null);
}

function toMaterialItems(items: MaterialPresetItem[]): MaterialItem[] {
    return items.map((item) => ({
        product: item.product,
        aantal: item.aantal,
        prijs_per_stuk: item.prijs_per_stuk,
        ...(item.eenheid ? { eenheid: item.eenheid } : {}),
    }));
}

function sanitizeStoredPresetItems(value: unknown): MaterialPresetItem[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((rawItem) => {
            if (!rawItem || typeof rawItem !== 'object') return null;
            const row = rawItem as Record<string, unknown>;
            const product = String(row.product ?? '').trim();
            if (!product) return null;

            const parsedAantal = Number(row.aantal);
            const parsedPrijs = Number(row.prijs_per_stuk ?? row.prijs_excl_btw ?? row.prijs);
            const aantal = Number.isFinite(parsedAantal) && parsedAantal > 0 ? parsedAantal : 1;
            const prijs = Number.isFinite(parsedPrijs) && parsedPrijs >= 0 ? parsedPrijs : 0;
            const eenheid = typeof row.eenheid === 'string' ? row.eenheid.trim() : '';

            return {
                product,
                aantal,
                prijs_per_stuk: prijs,
                ...(eenheid ? { eenheid } : {}),
            } as MaterialPresetItem;
        })
        .filter((item): item is MaterialPresetItem => item !== null);
}

function normalizeStoredMaterialPackages(value: unknown): QuoteMaterialPackage[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((rawPackage, index) => {
            if (!rawPackage || typeof rawPackage !== 'object') return null;
            const row = rawPackage as Record<string, unknown>;

            const naam = String(row.naam ?? '').trim();
            if (!naam) return null;

            const idRaw = typeof row.id === 'string' ? row.id.trim() : '';
            const id = idRaw || `pakket_${index + 1}_${Date.now()}`;
            const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : undefined;

            return {
                id,
                naam,
                updatedAt,
                grootmaterialen: sanitizeStoredPresetItems(row.grootmaterialen),
                verbruiksartikelen: sanitizeStoredPresetItems(row.verbruiksartikelen),
            } as QuoteMaterialPackage;
        })
        .filter((item): item is QuoteMaterialPackage => item !== null);
}

function createMaterialPackageId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `pakket_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const CALCULATION_ESTIMATE_SECONDS = 180;

function getMaterialPackageSummary(pkg: QuoteMaterialPackage): string {
    const grootCount = Array.isArray(pkg.grootmaterialen) ? pkg.grootmaterialen.length : 0;
    const verbruikCount = Array.isArray(pkg.verbruiksartikelen) ? pkg.verbruiksartikelen.length : 0;
    const totalCount = grootCount + verbruikCount;

    if (totalCount === 0) return 'Geen materialen';
    if (grootCount > 0 && verbruikCount > 0) {
        return `${totalCount} materialen (${grootCount} groot, ${verbruikCount} verbruik)`;
    }
    return `${totalCount} materialen`;
}

export default function QuotePage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { toast } = useToast();

    // Fetch calculation data from Supabase
    const { calculation, loading: calculationLoading, error: calculationError, updateDataJson } = useQuoteData(id);

    // Normalize calculation data
    const normalizedData = calculation?.data_json ? normalizeDataJson(calculation.data_json) : null;

    // Firebase hooks
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const [quoteSettings, setQuoteSettings] = useState<QuoteCalculationSettings | null>(null);
    const [klantInfo, setKlantInfo] = useState<KlantInformatie | null>(null);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [firebaseLoading, setFirebaseLoading] = useState(true);
    const [firebaseError, setFirebaseError] = useState<string | null>(null);

    // Add state for PDF settings using default imported settings
    const [pdfSettings, setPdfSettings] = useState<QuotePDFSettings>(defaultQuotePDFSettings);
    const [activeTab, setActiveTab] = useState('materialen');
    const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);

    const [materials, setMaterials] = useState<{
        groot: MaterialItem[];
        verbruik: MaterialItem[];
    }>({ groot: [], verbruik: [] });

    // Ref to track if we're currently updating materials to prevent race conditions
    const isUpdatingRef = useRef(false);
    const lastSmallSaveToastAtRef = useRef<number>(0);
    const hasEditedMaterialsRef = useRef(false);
    const materialPresetSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedMaterialPresetRef = useRef<string>('');

    // Refresh captured drawings when entering the PDF tab or when data changes
    useEffect(() => {
        if (activeTab !== 'pdf') return;
        setCapturedDrawings([]);
        setIsDrawingsReady(false);
    }, [activeTab, quote?.id, calculation?.data_json]);

    // State for Material Selection Modal
    const [alleMaterialen, setAlleMaterialen] = useState<any[]>([]);
    const [activeCategory, setActiveCategory] = useState<'groot' | 'verbruik' | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [materialPackages, setMaterialPackages] = useState<QuoteMaterialPackage[]>([]);
    const [selectedMaterialPackageId, setSelectedMaterialPackageId] = useState<string>('NIEUW');
    const [isMaterialPackagePickerOpen, setIsMaterialPackagePickerOpen] = useState(false);
    const [materialPackagePickerSearch, setMaterialPackagePickerSearch] = useState('');
    const [isSaveMaterialPackageOpen, setIsSaveMaterialPackageOpen] = useState(false);
    const [materialPackageName, setMaterialPackageName] = useState('');
    const [isSavingMaterialPackage, setIsSavingMaterialPackage] = useState(false);

    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [voorschotIngeschakeld, setVoorschotIngeschakeld] = useState(false);
    const [voorschotPercentage, setVoorschotPercentage] = useState<number>(50);
    const [existingVoorschotInvoiceId, setExistingVoorschotInvoiceId] = useState<string | null>(null);

    // PDF Generation State
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [capturedDrawings, setCapturedDrawings] = useState<string[]>([]);
    const [isDrawingsReady, setIsDrawingsReady] = useState(false);
    const [pendingPDFAction, setPendingPDFAction] = useState<((images: string[]) => Promise<void>) | null>(null);
    const pendingPDFPromiseRef = useRef<{
        resolve: () => void;
        reject: (error: Error) => void;
    } | null>(null);

    useEffect(() => {
        return () => {
            if (pendingPDFPromiseRef.current) {
                pendingPDFPromiseRef.current.reject(new Error('PDF generatie afgebroken.'));
                pendingPDFPromiseRef.current = null;
            }
        };
    }, []);


    const [userProfile, setUserProfile] = useState<any>(null);
    const [businessData, setBusinessData] = useState<any>(null);
    const [isDevUser, setIsDevUser] = useState(false);
    const [isComparingGrootPrices, setIsComparingGrootPrices] = useState(false);
    const [isGrootCompareOpen, setIsGrootCompareOpen] = useState(false);
    const [grootCompareError, setGrootCompareError] = useState<string | null>(null);
    const [grootCompareQuotes, setGrootCompareQuotes] = useState<GrootCompareQuoteColumn[]>([]);
    const [grootCompareRows, setGrootCompareRows] = useState<GrootCompareRow[]>([]);
    const [verbruikCompareRows, setVerbruikCompareRows] = useState<GrootCompareRow[]>([]);
    const [showGrootCalculation, setShowGrootCalculation] = useState(false);
    const [showVerbruikToelichting, setShowVerbruikToelichting] = useState(false);
    const [compareMaterialView, setCompareMaterialView] = useState<'groot' | 'verbruik'>('groot');
    const [calculationElapsedSeconds, setCalculationElapsedSeconds] = useState(0);
    const calculationTimerStartedAtRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadDevClaim = async () => {
            if (!user) {
                setIsDevUser(false);
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
            }
        };

        void loadDevClaim();

        return () => {
            cancelled = true;
        };
    }, [user]);

    // Fetch user profile and business details
    useEffect(() => {
        const fetchUserData = async () => {
            if (user && firestore) {
                try {
                    // Fetch from users collection
                    const userRef = doc(firestore, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserProfile(data);
                        const instellingen =
                            data?.instellingen && typeof data.instellingen === 'object'
                                ? (data.instellingen as Record<string, unknown>)
                                : {};
                        const settings =
                            data?.settings && typeof data.settings === 'object'
                                ? (data.settings as Record<string, unknown>)
                                : {};
                        const rawPackages = instellingen.offerteMateriaalPakketten ?? settings.offerteMateriaalPakketten;
                        const parsedPackages = normalizeStoredMaterialPackages(rawPackages);
                        setMaterialPackages(parsedPackages);

                        const selectedPackageRaw =
                            typeof instellingen.offerteMateriaalPakketId === 'string'
                                ? instellingen.offerteMateriaalPakketId
                                : typeof settings.offerteMateriaalPakketId === 'string'
                                    ? settings.offerteMateriaalPakketId
                                    : '';
                        if (selectedPackageRaw.trim()) {
                            setSelectedMaterialPackageId(selectedPackageRaw.trim());
                        }

                        if (data.defaultPdfSettings) {
                            setPdfSettings(data.defaultPdfSettings);
                        }
                    }

                    // Fetch from businesses collection
                    const businessRef = doc(firestore, 'businesses', user.uid);
                    const businessSnap = await getDoc(businessRef);
                    if (businessSnap.exists()) {
                        setBusinessData(businessSnap.data());
                    }
                } catch (err) {
                    console.error("Error fetching user/business data:", err);
                }
            }
        };
        fetchUserData();
    }, [user, firestore]);

    useEffect(() => {
        hasEditedMaterialsRef.current = false;
        lastSavedMaterialPresetRef.current = '';
        setSelectedMaterialPackageId('NIEUW');
    }, [id]);

    useEffect(() => {
        if (selectedMaterialPackageId === 'NIEUW') return;
        const exists = materialPackages.some((pkg) => pkg.id === selectedMaterialPackageId);
        if (!exists) {
            setSelectedMaterialPackageId('NIEUW');
        }
    }, [materialPackages, selectedMaterialPackageId]);

    useEffect(() => {
        if (!isMaterialPackagePickerOpen) {
            setMaterialPackagePickerSearch('');
        }
    }, [isMaterialPackagePickerOpen]);

    // Init & sync facturatie instellingen (voorschot) vanuit quote
    useEffect(() => {
        if (!quote) return;
        const f = (quote as any)?.facturatie;
        if (f && typeof f === 'object') {
            setVoorschotIngeschakeld(!!f.voorschotIngeschakeld);
            if (typeof f.voorschotPercentage === 'number' && Number.isFinite(f.voorschotPercentage)) {
                setVoorschotPercentage(f.voorschotPercentage);
            }
        }
    }, [quote]);

    // Zoek bestaande voorschotfactuur id (voor link in UI)
    useEffect(() => {
        if (!user || !firestore || !id) return;
        let cancelled = false;
        (async () => {
            try {
                const existingId = await findExistingVoorschotInvoiceId(firestore, { userId: user.uid, quoteId: id });
                if (!cancelled) setExistingVoorschotInvoiceId(existingId);
            } catch {
                // ignore
            }
        })();
        return () => { cancelled = true; };
    }, [user, firestore, id]);

    // Debounced save facturatie to quote doc
    useEffect(() => {
        if (!user || !firestore || !id) return;
        if (!quote) return;
        const timer = setTimeout(async () => {
            try {
                const quoteRef = doc(firestore, 'quotes', id);
                await updateDoc(quoteRef, {
                    facturatie: {
                        voorschotIngeschakeld,
                        voorschotPercentage,
                    },
                    updatedAt: new Date(),
                });
            } catch (e) {
                console.error('Fout bij opslaan facturatie:', e);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [voorschotIngeschakeld, voorschotPercentage, user, firestore, id, quote]);

    // Fetch Materials for Modal
    const [materialRefreshTrigger, setMaterialRefreshTrigger] = useState(0);

    useEffect(() => {
        const fetchMaterials = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/materialen/get', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();

                if (res.ok && json.ok) {
                    const materialenData = (json.data || []).map((m: any) => {
                        const excl = parsePriceToNumber(m.prijs_excl_btw)
                            ?? Number((((parsePriceToNumber(m.prijs_incl_btw ?? m.prijs) ?? 0) / 1.21)).toFixed(2));
                        const incl = parsePriceToNumber(m.prijs_incl_btw)
                            ?? Number((excl * 1.21).toFixed(2));
                        return {
                            ...m,
                            id: m.row_id || m.id,
                            // In offertes we treat row/unit price as EXCL. BTW.
                            prijs: excl,
                            prijs_per_stuk: excl,
                            prijs_excl_btw: excl,
                            prijs_incl_btw: incl,
                            // Standardization for the modal
                            materiaalnaam: m.materiaalnaam || m.naam,
                            categorie: m.categorie || m.subsectie || 'Overig',
                        };
                    });
                    setAlleMaterialen(materialenData);
                } else {
                    const message = json?.message || json?.error || 'Kon materialen niet laden.';
                    toast({
                        variant: 'destructive',
                        title: 'Fout bij laden materialen',
                        description: message,
                    });
                }
            } catch (err) {
                console.error("Error fetching materials:", err);
                toast({
                    variant: 'destructive',
                    title: 'Fout bij laden materialen',
                    description: 'Netwerkfout tijdens ophalen van materialen.',
                });
            }
        };
        fetchMaterials();
    }, [user, materialRefreshTrigger, toast]);

    // Initialize state from calculation data (Supabase)
    useEffect(() => {
        if (calculation?.data_json) {
            const normalized = normalizeDataJson(calculation.data_json);

            // 1. Materials
            setMaterials({
                groot: normalized.grootmaterialen || [],
                verbruik: normalized.verbruiksartikelen || [],
            });

            // 2. Client Info
            if (normalized.klantinformatie) {
                const rawKi = normalized.klantinformatie as any;
                const normalizedKi: KlantInformatie = {
                    klanttype: rawKi.klanttype || 'Particulier',
                    voornaam: rawKi.voornaam || '',
                    achternaam: rawKi.achternaam || '',
                    bedrijfsnaam: rawKi.bedrijfsnaam || null,
                    emailadres: rawKi.emailadres || rawKi['e-mailadres'] || '',
                    telefoonnummer: rawKi.telefoonnummer || '',
                    straat: rawKi.straat || rawKi.factuuradres?.straat || '',
                    huisnummer: rawKi.huisnummer || rawKi.factuuradres?.huisnummer || '',
                    postcode: rawKi.postcode || rawKi.factuuradres?.postcode || '',
                    plaats: rawKi.plaats || rawKi.factuuradres?.plaats || '',
                    afwijkendProjectadres: rawKi.afwijkendProjectadres || false,
                    projectAdres: rawKi.projectAdres || rawKi.projectadres,
                };
                setKlantInfo(normalizedKi);
            }

            // 3. Settings
            if (normalized.instellingen || normalized.extras) {
                const rawInst = normalized.instellingen as any;
                const rawExtras = normalized.extras as any;

                const mappedSettings: QuoteCalculationSettings = {
                    btwTarief: rawInst?.btwTarief || 21,
                    uurTariefExclBtw: rawInst?.uurTariefExclBtw || rawInst?.uurTarief || 50,
                    schattingUren: rawInst?.schattingUren ?? false,
                    extras: {
                        transport: {
                            prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm,
                            vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten,
                            tunnelkosten: rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten,
                            mode: rawExtras?.transport?.mode ?? rawInst?.extras?.transport?.mode
                        },
                        winstMarge: {
                            percentage: rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
                            fixedAmount: rawExtras?.winstMarge?.fixedAmount ?? 0,
                            mode: rawExtras?.winstMarge?.mode ?? 'percentage',
                            basis: rawExtras?.winstMarge?.basis ?? 'totaal'
                        }
                    }
                };
                setQuoteSettings(mappedSettings);
            }
        }
    }, [calculation]);

    // Fetch quote metadata from Firebase (Fallback for legacy data or metadata only)
    useEffect(() => {
        if (isUserLoading) return;
        if (!user) {
            setFirebaseLoading(false);
            setFirebaseError("Niet ingelogd");
            return;
        }
        if (!firestore || !id) return;

        const fetchData = async () => {
            setFirebaseLoading(true);
            setFirebaseError(null);
            try {
                const docRef = doc(firestore, 'quotes', id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    setFirebaseError("Offerte niet gevonden");
                    setFirebaseLoading(false);
                    return;
                }

                const quoteData = docSnap.data() as any;

                // Security check
                if (quoteData.userId !== user.uid && quoteData.klantinformatie?.userId !== user.uid) {
                    setFirebaseError("Geen toegang tot deze offerte");
                    setFirebaseLoading(false);
                    return;
                }

                setQuote({ ...quoteData, id: docSnap.id } as Quote);

                // Only set KlantInfo/Settings from Firebase if NOT already set by Supabase calculation
                // (However, this runs async and independent of calculation loading...)
                // Safer strategy: Only pull quote-level metadata here.
                // Or: Check if we successfully loaded from calculation? 
                // For now, let's allow Firebase to overwrite ONLY if calculation was missing it, 
                // but since hooks run in parallel, it's safer to just rely on calculation for the 'meat' 
                // and Firebase for the 'header' (offerteNummer, title).

                // If calculation didn't have client info, try Firebase (legacy support)
                setKlantInfo((prev) => {
                    if (prev) return prev; // Already loaded from calculation

                    const ki = quoteData.klantinformatie || {};
                    const factuur = ki.factuuradres || {};
                    return {
                        klanttype: ki.klanttype || 'Particulier',
                        voornaam: ki.voornaam || '',
                        achternaam: ki.achternaam || '',
                        bedrijfsnaam: ki.bedrijfsnaam,
                        emailadres: ki['e-mailadres'] || '',
                        telefoonnummer: ki.telefoonnummer || '',
                        straat: factuur.straat || '',
                        huisnummer: (factuur.huisnummer || '') + (factuur.toevoeging ? ` ${factuur.toevoeging}` : ''),
                        postcode: factuur.postcode || '',
                        plaats: factuur.plaats || '',
                        afwijkendProjectadres: ki.afwijkendProjectadres || false,
                        projectAdres: ki.projectadres ? {
                            straat: ki.projectadres.straat || '',
                            huisnummer: (ki.projectadres.huisnummer || '') + (ki.projectadres.toevoeging ? ` ${ki.projectadres.toevoeging}` : ''),
                            postcode: ki.projectadres.postcode || '',
                            plaats: ki.projectadres.plaats || ''
                        } : undefined
                    };
                });

                setQuoteSettings(prev => {
                    if (prev) return prev;
                    const inst = quoteData.instellingen || {};
                    return {
                        btwTarief: inst.btwTarief || 21,
                        uurTariefExclBtw: inst.uurTarief || 50,
                        schattingUren: inst.schattingUren ?? false,
                        extras: {
                            transport: {
                                prijsPerKm: inst.reiskosten_prijs_per_km ?? inst?.extras?.transport?.prijsPerKm,
                                vasteTransportkosten: inst?.extras?.transport?.vasteTransportkosten,
                                tunnelkosten: inst?.extras?.transport?.tunnelkosten,
                                mode: inst.reiskosten_type === 'vast'
                                    ? 'vast'
                                    : inst.reiskosten_type === 'perKm'
                                        ? 'perKm'
                                        : inst?.extras?.transport?.mode
                            },
                            winstMarge: {
                                percentage: inst.winstmarge_percentage || 10,
                                fixedAmount: 0,
                                mode: 'percentage',
                                basis: 'totaal'
                            }
                        }
                    };
                });

            } catch (err: any) {
                console.error("Error fetching firebase quote:", err);
                setFirebaseError("Fout bij laden offerte gegevens.");
            } finally {
                setFirebaseLoading(false);
            }
        };

        fetchData();
    }, [id, user, isUserLoading, firestore]);

    // Helper to update master price via API
    const updateMasterPrice = async (materiaalnaam: string, priceExclBtw: number, priceInclBtw: number, rowId?: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/materialen/update-price', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...(rowId ? { row_id: rowId } : { materiaalnaam }),
                    prijs_excl_btw: priceExclBtw.toFixed(2),
                    prijs_incl_btw: priceInclBtw.toFixed(2)
                })
            });

            const result = await response.json();
            if (result.data && result.data[0]) {
                // Trigger material list refetch to show updated price
                setMaterialRefreshTrigger(prev => prev + 1);
            }

            if (!result.ok) {
                console.error('update-price failed:', result.message);
            }
        } catch (err) {
            console.error("Failed to update master price:", err);
        }
    };

    // Helper to update master material name via API
    const updateMasterName = async (oldName: string, newName: string, rowId?: string): Promise<boolean> => {
        if (!user) return false;
        if (!oldName || !newName || oldName === newName) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/materialen/update-price', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...(rowId ? { row_id: rowId } : { materiaalnaam: oldName }),
                    new_materiaalnaam: newName
                })
            });

            const result = await response.json();
            return result.ok === true;
        } catch (err) {
            console.error("Failed to update master name:", err);
            return false;
        }
    };

    // Sync verbruiksartikelen to small material list (insert-or-update by name)
    const upsertSmallMaterial = async (name: string, priceExclBtw: number, oldName?: string): Promise<boolean> => {
        if (!user) return false;
        if (!name?.trim() || Number.isNaN(priceExclBtw) || priceExclBtw < 0) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/materialen/upsert-small', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    naam: name.trim(),
                    old_naam: oldName?.trim() || null,
                    prijs_excl_btw: Number(priceExclBtw.toFixed(2)),
                })
            });

            const result = await response.json();
            return response.ok && result.ok === true;
        } catch (err) {
            console.error("Failed to upsert small material:", err);
            return false;
        }
    };

    // Handler for updating grootmaterialen items
    const handleUpdateGrootItem = async (index: number, updates: Partial<MaterialItem>) => {
        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId('NIEUW');
        isUpdatingRef.current = true;

        try {
            const updated = [...materials.groot];
            const oldItem = updated[index];
            updated[index] = { ...updated[index], ...updates };
            setMaterials(prev => ({ ...prev, groot: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    grootmaterialen: updated,
                    verbruiksartikelen: materials.verbruik,
                });
            } else {
                console.error('No calculation available, cannot save material update.');
            }

            // Update master material price if changed
            if (updates.prijs_per_stuk !== undefined && updated[index].product && quoteSettings?.btwTarief) {
                const priceExcl = updates.prijs_per_stuk;
                const priceIncl = priceExcl * (1 + (quoteSettings.btwTarief / 100));
                await updateMasterPrice(updated[index].product!, priceExcl, priceIncl, updated[index].row_id);
                setLastSyncedAt(new Date());
            }

            // Update master material name if changed
            if (updates.product !== undefined && oldItem.product && updates.product !== oldItem.product) {
                const success = await updateMasterName(oldItem.product, updates.product, oldItem.row_id);
                if (success) {
                    setLastSyncedAt(new Date());
                }
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    // Handler for updating verbruiksartikelen items
    const handleUpdateVerbruiksItem = async (index: number, updates: Partial<MaterialItem>) => {
        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId('NIEUW');
        isUpdatingRef.current = true;

        try {
            const updated = [...materials.verbruik];
            const oldItem = updated[index];
            updated[index] = { ...updated[index], ...updates };
            setMaterials(prev => ({ ...prev, verbruik: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    verbruiksartikelen: updated,
                    grootmaterialen: materials.groot,
                });
            }

            // Keep small material list in sync when name and/or price changes.
            if (updates.product !== undefined || updates.prijs_per_stuk !== undefined) {
                const updatedName = (updated[index].product || '').trim();
                const oldName = (oldItem.product || '').trim();
                const updatedPrice = Number(updated[index].prijs_per_stuk || 0);

                if (updatedName && updatedPrice >= 0) {
                    const success = await upsertSmallMaterial(updatedName, updatedPrice, oldName);
                    if (success) {
                        setLastSyncedAt(new Date());
                        const now = Date.now();
                        if (now - lastSmallSaveToastAtRef.current > 1200) {
                            toast({
                                title: 'Opgeslagen',
                                description: 'Opgeslagen in de producten lijst.',
                            });
                            lastSmallSaveToastAtRef.current = now;
                        }
                    } else {
                        toast({
                            variant: 'destructive',
                            title: 'Opslaan mislukt',
                            description: 'Kon niet opslaan in de producten lijst.',
                        });
                    }
                }
            }

            // Update master material price if changed
            if (updates.prijs_per_stuk !== undefined && updated[index].product && quoteSettings?.btwTarief) {
                const priceExcl = updates.prijs_per_stuk;
                const priceIncl = priceExcl * (1 + (quoteSettings.btwTarief / 100));
                await updateMasterPrice(updated[index].product!, priceExcl, priceIncl, updated[index].row_id);
                setLastSyncedAt(new Date());
            }

            // Update master material name if changed
            if (updates.product !== undefined && oldItem.product && updates.product !== oldItem.product) {
                const success = await updateMasterName(oldItem.product, updates.product, oldItem.row_id);
                if (success) {
                    setLastSyncedAt(new Date());
                }
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleAddItem = async (category: 'groot' | 'verbruik', item: MaterialItem) => {
        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId('NIEUW');
        isUpdatingRef.current = true;

        try {
            const listKey = category === 'groot' ? 'groot' : 'verbruik';
            const jsonKey = category === 'groot' ? 'grootmaterialen' : 'verbruiksartikelen';

            const updated = [...materials[listKey], item];
            setMaterials(prev => ({ ...prev, [listKey]: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    [jsonKey]: updated,
                });
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleRemoveItem = async (category: 'groot' | 'verbruik', index: number) => {
        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId('NIEUW');
        isUpdatingRef.current = true;

        try {
            const listKey = category === 'groot' ? 'groot' : 'verbruik';
            const jsonKey = category === 'groot' ? 'grootmaterialen' : 'verbruiksartikelen';
            const current = materials[listKey];

            if (index < 0 || index >= current.length) return;

            const updated = current.filter((_, i) => i !== index);
            setMaterials(prev => ({ ...prev, [listKey]: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    [jsonKey]: updated,
                });
            }

            toast({
                title: 'Materiaal verwijderd',
                description: 'Rij is verwijderd uit de offerte.',
            });
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleSelectMaterial = (material: any) => {
        if (!activeCategory) return;

        const newItem: MaterialItem = {
            aantal: 1,
            product: material.materiaalnaam,
            prijs_per_stuk: material.prijs_per_stuk || material.prijs || 0
        };

        handleAddItem(activeCategory, newItem);
        setActiveCategory(null);
    };

    const persistMaterialPackages = async (
        nextPackages: QuoteMaterialPackage[],
        activePreset?: QuoteMaterialPreset,
        activePackageId?: string
    ) => {
        if (!firestore || !user) return;

        const userRef = doc(firestore, 'users', user.uid);
        const updates: Record<string, any> = {
            'instellingen.offerteMateriaalPakketten': nextPackages,
            'settings.offerteMateriaalPakketten': nextPackages,
            updatedAt: serverTimestamp(),
        };

        if (activePreset) {
            updates['instellingen.offerteMateriaalPreset'] = activePreset;
            updates['settings.offerteMateriaalPreset'] = activePreset;
        }

        if (activePackageId) {
            updates['instellingen.offerteMateriaalPakketId'] = activePackageId;
            updates['settings.offerteMateriaalPakketId'] = activePackageId;
        }

        try {
            await updateDoc(userRef, updates);
        } catch (error) {
            console.warn('Pakket updateDoc faalde, fallback naar setDoc:', error);
            const instellingenPayload: Record<string, unknown> = {
                offerteMateriaalPakketten: nextPackages,
            };
            const settingsPayload: Record<string, unknown> = {
                offerteMateriaalPakketten: nextPackages,
            };

            if (activePreset) {
                instellingenPayload.offerteMateriaalPreset = activePreset;
                settingsPayload.offerteMateriaalPreset = activePreset;
            }
            if (activePackageId) {
                instellingenPayload.offerteMateriaalPakketId = activePackageId;
                settingsPayload.offerteMateriaalPakketId = activePackageId;
            }

            await setDoc(
                userRef,
                {
                    instellingen: instellingenPayload,
                    settings: settingsPayload,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
        }
    };

    const handleApplyMaterialPackage = async (packageId: string) => {
        const selectedPackage = materialPackages.find((pkg) => pkg.id === packageId);
        if (!selectedPackage) return;

        const nextGroot = toMaterialItems(selectedPackage.grootmaterialen);
        const nextVerbruik = toMaterialItems(selectedPackage.verbruiksartikelen);
        const nextPreset: QuoteMaterialPreset = {
            grootmaterialen: selectedPackage.grootmaterialen,
            verbruiksartikelen: selectedPackage.verbruiksartikelen,
        };

        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId(packageId);
        setMaterials({
            groot: nextGroot,
            verbruik: nextVerbruik,
        });

        isUpdatingRef.current = true;
        try {
            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    grootmaterialen: nextGroot,
                    verbruiksartikelen: nextVerbruik,
                });
            }

            await persistMaterialPackages(materialPackages, nextPreset, packageId);
            setLastSyncedAt(new Date());

            toast({
                title: 'Werkpakket toegepast',
                description: `"${selectedPackage.naam}" is geladen in deze offerte.`,
            });
        } catch (error) {
            console.error('Kon werkpakket niet toepassen:', error);
            toast({
                variant: 'destructive',
                title: 'Toepassen mislukt',
                description: 'Kon het werkpakket niet laden in deze offerte.',
            });
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleResetMaterialPackageToNieuw = async () => {
        hasEditedMaterialsRef.current = true;
        setIsMaterialPackagePickerOpen(false);
        setSelectedMaterialPackageId('NIEUW');
        setMaterials({ groot: [], verbruik: [] });

        isUpdatingRef.current = true;
        try {
            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    grootmaterialen: [],
                    verbruiksartikelen: [],
                });
            }

            await persistMaterialPackages(
                materialPackages,
                { grootmaterialen: [], verbruiksartikelen: [] },
                'NIEUW'
            );
            setLastSyncedAt(new Date());

            toast({
                title: 'Werkpakket gereset',
                description: 'Je start nu zonder werkpakket.',
            });
        } catch (error) {
            console.error('Kon werkpakket niet resetten:', error);
            toast({
                variant: 'destructive',
                title: 'Reset mislukt',
                description: 'Kon niet terugzetten naar Nieuw.',
            });
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleSelectMaterialPackageFromPicker = (packageId: string) => {
        if (packageId === 'NIEUW') {
            void handleResetMaterialPackageToNieuw();
            return;
        }
        setIsMaterialPackagePickerOpen(false);
        if (packageId === selectedMaterialPackageId) return;
        void handleApplyMaterialPackage(packageId);
    };

    const openSaveMaterialPackageDialog = () => {
        setMaterialPackageName(selectedMaterialPackage?.naam || '');
        setIsSaveMaterialPackageOpen(true);
    };

    const handleSaveCurrentAsMaterialPackage = async () => {
        if (!firestore || !user) return;

        const naam = materialPackageName.trim();
        if (!naam) {
            toast({
                variant: 'destructive',
                title: 'Naam ontbreekt',
                description: 'Vul eerst een naam in voor dit werkpakket.',
            });
            return;
        }

        setIsSavingMaterialPackage(true);
        try {
            const preset: QuoteMaterialPreset = {
                grootmaterialen: toPresetItems(materials.groot),
                verbruiksartikelen: toPresetItems(materials.verbruik),
            };

            const existingByName = materialPackages.find(
                (pkg) => pkg.naam.trim().toLowerCase() === naam.toLowerCase()
            );
            const packageId = existingByName?.id ?? createMaterialPackageId();
            const nowIso = new Date().toISOString();

            const nextPackage: QuoteMaterialPackage = {
                id: packageId,
                naam,
                updatedAt: nowIso,
                ...preset,
            };

            const nextPackages: QuoteMaterialPackage[] = [
                nextPackage,
                ...materialPackages.filter((pkg) => pkg.id !== packageId),
            ];

            await persistMaterialPackages(nextPackages, preset, packageId);
            setMaterialPackages(nextPackages);
            setSelectedMaterialPackageId(packageId);
            setIsSaveMaterialPackageOpen(false);
            setMaterialPackageName('');

            toast({
                title: existingByName ? 'Werkpakket bijgewerkt' : 'Werkpakket opgeslagen',
                description: `"${naam}" is opgeslagen.`,
            });
        } catch (error) {
            console.error('Kon werkpakket niet opslaan:', error);
            toast({
                variant: 'destructive',
                title: 'Opslaan mislukt',
                description: 'Kon dit werkpakket niet opslaan.',
            });
        } finally {
            setIsSavingMaterialPackage(false);
        }
    };

    useEffect(() => {
        if (!firestore || !user || !quote?.id) return;
        if (!hasEditedMaterialsRef.current) return;

        if (materialPresetSaveTimerRef.current) {
            clearTimeout(materialPresetSaveTimerRef.current);
        }

        materialPresetSaveTimerRef.current = setTimeout(async () => {
            const preset: QuoteMaterialPreset = {
                grootmaterialen: toPresetItems(materials.groot),
                verbruiksartikelen: toPresetItems(materials.verbruik),
            };

            const nextPresetJson = JSON.stringify(preset);
            if (nextPresetJson === lastSavedMaterialPresetRef.current) return;

            const userRef = doc(firestore, 'users', user.uid);
            const updates: Record<string, any> = {
                'instellingen.offerteMateriaalPreset': preset,
                'settings.offerteMateriaalPreset': preset,
                updatedAt: serverTimestamp(),
            };

            try {
                await updateDoc(userRef, updates);
                lastSavedMaterialPresetRef.current = nextPresetJson;
            } catch (error) {
                console.warn('Preset updateDoc faalde, fallback naar setDoc:', error);
                try {
                    await setDoc(
                        userRef,
                        {
                            instellingen: { offerteMateriaalPreset: preset },
                            settings: { offerteMateriaalPreset: preset },
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                    lastSavedMaterialPresetRef.current = nextPresetJson;
                } catch (fallbackError) {
                    console.error('Kon materiaal preset niet opslaan:', fallbackError);
                }
            }
        }, 700);

        return () => {
            if (materialPresetSaveTimerRef.current) {
                clearTimeout(materialPresetSaveTimerRef.current);
            }
        };
    }, [materials.groot, materials.verbruik, firestore, user, quote?.id]);

    const handleCompareLastThreeGrootPrices = async () => {
        if (!user || !firestore || isComparingGrootPrices) return;

        setIsComparingGrootPrices(true);
        setGrootCompareError(null);
        setShowGrootCalculation(false);
        setShowVerbruikToelichting(false);
        setCompareMaterialView('groot');

        try {
            const summarizeMaterialItems = (
                items: any[],
                productNameByKey: Map<string, string>,
                detailFields: string[]
            ): { itemsByProduct: Record<string, { aantal: number; totaal: number; detail: string }>; subtotal: number } => {
                const itemsByProduct: Record<string, { aantal: number; totaal: number; detail: string }> = {};
                let subtotal = 0;

                for (const item of items) {
                    const name = String(item?.product || '').trim();
                    if (!name) continue;
                    const key = name.toLowerCase();
                    const parsedPrice = parsePriceToNumber((item as any)?.prijs_per_stuk ?? (item as any)?.prijs_excl_btw ?? (item as any)?.prijs);
                    const parsedAantal = parsePriceToNumber((item as any)?.aantal);
                    const prijs = parsedPrice !== null && Number.isFinite(parsedPrice) ? parsedPrice : 0;
                    const aantal = parsedAantal !== null && Number.isFinite(parsedAantal) ? parsedAantal : 0;
                    const regelTotaal = prijs * aantal;
                    const detailText = detailFields
                        .map((field) => item?.[field])
                        .find((value) => typeof value === 'string' && value.trim().length > 0);

                    subtotal += regelTotaal;

                    const existing = itemsByProduct[key] || { aantal: 0, totaal: 0, detail: '' };
                    const detailParts = existing.detail ? existing.detail.split(' | ') : [];
                    const normalizedDetail = typeof detailText === 'string' ? detailText.trim() : '';
                    const mergedDetail =
                        normalizedDetail && !detailParts.includes(normalizedDetail)
                            ? detailParts.concat(normalizedDetail).join(' | ')
                            : existing.detail;

                    itemsByProduct[key] = {
                        aantal: Number((existing.aantal + aantal).toFixed(2)),
                        totaal: Number((existing.totaal + regelTotaal).toFixed(2)),
                        detail: mergedDetail,
                    };

                    if (!productNameByKey.has(key)) {
                        productNameByKey.set(key, name);
                    }
                }

                return {
                    itemsByProduct,
                    subtotal: Number(subtotal.toFixed(2)),
                };
            };

            const quotesSnapshot = await getDocs(
                query(collection(firestore, 'quotes'), where('userId', '==', user.uid))
            );

            const sortedActiveQuotes = quotesSnapshot.docs
                .map((docSnap) => {
                    const data = docSnap.data() as any;
                    const offerteNummerRaw = Number(data?.offerteNummer);
                    const offerteNummer = Number.isFinite(offerteNummerRaw) ? offerteNummerRaw : null;
                    const archived = data?.archived === true;
                    const createdAtMs =
                        typeof data?.createdAt?.toMillis === 'function'
                            ? data.createdAt.toMillis()
                            : typeof data?.updatedAt?.toMillis === 'function'
                                ? data.updatedAt.toMillis()
                                : 0;

                    return {
                        quoteId: docSnap.id,
                        offerteNummer,
                        archived,
                        createdAtMs,
                    };
                })
                .filter((quoteMeta) => !quoteMeta.archived)
                .sort((a, b) => {
                    const aNr = a.offerteNummer ?? -1;
                    const bNr = b.offerteNummer ?? -1;
                    if (aNr !== bNr) return bNr - aNr;
                    return b.createdAtMs - a.createdAtMs;
                });

            const currentQuoteMeta = sortedActiveQuotes.find((quoteMeta) => quoteMeta.quoteId === id);
            const otherRecentQuotes = sortedActiveQuotes
                .filter((quoteMeta) => quoteMeta.quoteId !== id)
                .slice(0, 2);

            const recentQuotes = currentQuoteMeta
                ? [currentQuoteMeta, ...otherRecentQuotes]
                : sortedActiveQuotes.slice(0, 3);

            if (recentQuotes.length === 0) {
                throw new Error('Geen offertes gevonden voor vergelijking.');
            }

            const quoteIds = recentQuotes.map((quoteMeta) => quoteMeta.quoteId);
            const { data: calculationRows, error: calculationRowsError } = await supabase
                .from('quotes_collection')
                .select('quoteid, data_json, created_at')
                .in('quoteid', quoteIds)
                .order('created_at', { ascending: false });

            if (calculationRowsError) {
                throw new Error(calculationRowsError.message || 'Kon calculaties niet ophalen.');
            }

            const latestCalculationByQuote = new Map<string, { quoteid: string; data_json: unknown }>();
            for (const row of calculationRows || []) {
                if (!row?.quoteid || latestCalculationByQuote.has(row.quoteid)) continue;
                latestCalculationByQuote.set(row.quoteid, row as { quoteid: string; data_json: unknown });
            }

            const grootProductNameByKey = new Map<string, string>();
            const verbruikProductNameByKey = new Map<string, string>();

            const quoteColumns: GrootCompareQuoteColumn[] = recentQuotes.map((quoteMeta, index) => {
                const calculationRow = latestCalculationByQuote.get(quoteMeta.quoteId);
                const normalized = calculationRow?.data_json ? normalizeDataJson(calculationRow.data_json as any) : null;
                const grootItems = Array.isArray(normalized?.grootmaterialen) ? normalized.grootmaterialen : [];
                const verbruikItems = Array.isArray(normalized?.verbruiksartikelen) ? normalized.verbruiksartikelen : [];
                const grootSummary = summarizeMaterialItems(grootItems, grootProductNameByKey, ['hoe_berekend', 'berekening']);
                const verbruikSummary = summarizeMaterialItems(verbruikItems, verbruikProductNameByKey, ['waarom_dit', 'toelichting']);

                const label =
                    quoteMeta.quoteId === id
                        ? `Huidige offerte${quoteMeta.offerteNummer !== null ? ` (${quoteMeta.offerteNummer})` : ''}`
                        : quoteMeta.offerteNummer !== null
                        ? `Offerte ${quoteMeta.offerteNummer}`
                        : `Offerte ${index + 1}`;

                const parsedHours = parsePriceToNumber((normalized as any)?.totaal_uren);
                const totalHours = parsedHours !== null && Number.isFinite(parsedHours)
                    ? Number(parsedHours.toFixed(2))
                    : null;

                return {
                    quoteId: quoteMeta.quoteId,
                    label,
                    offerteNummer: quoteMeta.offerteNummer,
                    grootSubtotal: grootSummary.subtotal,
                    verbruikSubtotal: verbruikSummary.subtotal,
                    totalHours,
                    itemsByProduct: grootSummary.itemsByProduct,
                    verbruikItemsByProduct: verbruikSummary.itemsByProduct,
                };
            });

            const sortedGrootProductKeys = Array.from(grootProductNameByKey.keys()).sort((a, b) =>
                (grootProductNameByKey.get(a) || '').localeCompare(grootProductNameByKey.get(b) || '', 'nl')
            );

            const compareRows: GrootCompareRow[] = sortedGrootProductKeys.map((productKey) => {
                const values = quoteColumns.map((col) => {
                    const item = col.itemsByProduct[productKey];
                    return item ? { aantal: item.aantal, totaal: item.totaal, detail: item.detail } : { aantal: 0, totaal: 0, detail: '' };
                });

                return {
                    product: grootProductNameByKey.get(productKey) || productKey,
                    values,
                };
            });

            const sortedVerbruikProductKeys = Array.from(verbruikProductNameByKey.keys()).sort((a, b) =>
                (verbruikProductNameByKey.get(a) || '').localeCompare(verbruikProductNameByKey.get(b) || '', 'nl')
            );

            const verbruikRows: GrootCompareRow[] = sortedVerbruikProductKeys.map((productKey) => {
                const values = quoteColumns.map((col) => {
                    const item = col.verbruikItemsByProduct[productKey];
                    return item ? { aantal: item.aantal, totaal: item.totaal, detail: item.detail } : { aantal: 0, totaal: 0, detail: '' };
                });

                return {
                    product: verbruikProductNameByKey.get(productKey) || productKey,
                    values,
                };
            });

            setGrootCompareQuotes(quoteColumns);
            setGrootCompareRows(compareRows);
            setVerbruikCompareRows(verbruikRows);
            setIsGrootCompareOpen(true);
        } catch (error: any) {
            setGrootCompareError(error?.message || 'Vergelijken mislukt.');
            setIsGrootCompareOpen(true);
        } finally {
            setIsComparingGrootPrices(false);
        }
    };

    const formatAantal = (value: number): string => {
        const isWhole = Math.abs(value - Math.round(value)) < 0.00001;
        return new Intl.NumberFormat('nl-NL', {
            minimumFractionDigits: isWhole ? 0 : 2,
            maximumFractionDigits: 2,
        }).format(value);
    };
    const hasGrootCalculationDetails = grootCompareRows.some((row) =>
        row.values.some((value) => value.detail.trim().length > 0)
    );
    const hasVerbruikToelichtingDetails = verbruikCompareRows.some((row) =>
        row.values.some((value) => value.detail.trim().length > 0)
    );

    // Calculate subtotals for display
    const grootSubtotal = materials.groot.reduce(
        (sum, item) => sum + (item.prijs_per_stuk || 0) * item.aantal,
        0
    );
    const verbruikSubtotal = materials.verbruik.reduce(
        (sum, item) => sum + (item.prijs_per_stuk || 0) * item.aantal,
        0
    );
    const selectedMaterialPackage =
        materialPackages.find((pkg) => pkg.id === selectedMaterialPackageId) || null;
    const materialPackagePickerQuery = materialPackagePickerSearch.trim().toLowerCase();
    const filteredMaterialPackages = materialPackagePickerQuery
        ? materialPackages.filter((pkg) => pkg.naam.toLowerCase().includes(materialPackagePickerQuery))
        : materialPackages;

    // Count materials without prices
    const materialsWithoutPrice = [
        ...materials.groot.filter(item => !item.prijs_per_stuk || item.prijs_per_stuk === 0),
        ...materials.verbruik.filter(item => !item.prijs_per_stuk || item.prijs_per_stuk === 0)
    ].length;

    // Calculate totals when data is available
    const totals = normalizedData && quoteSettings
        ? calculateQuoteTotals({
            ...normalizedData,
            grootmaterialen: materials.groot,
            verbruiksartikelen: materials.verbruik,
        }, quoteSettings)
        : null;

    // Sync calculated totals to Firebase for Dashboard visibility
    useEffect(() => {
        if (!firestore || !user || !id || !totals) return;

        const updateFirebasePrice = async () => {
            try {
                const docRef = doc(firestore, 'quotes', id);
                await updateDoc(docRef, {
                    totaalbedrag: totals.totaalInclBtw,
                    amount: totals.totaalInclBtw, // Sync both for compatibility
                    updatedAt: new Date(),
                });
            } catch (err) {
                console.error("Failed to sync price to Firestore:", err);
            }
        };

        // Debounce to avoid rapid writes during slider/input changes
        const timer = setTimeout(updateFirebasePrice, 2000);
        return () => clearTimeout(timer);
    }, [totals, firestore, user, id]);

    // Handle updating settings
    const handleUpdateSettings = async (newSettings: QuoteCalculationSettings) => {
        setQuoteSettings(newSettings);
        if (calculation) {
            const root = unwrapRoot(calculation.data_json);
            await updateDataJson({
                ...root,
                instellingen: {
                    ...(root?.instellingen as any),
                    ...newSettings
                }
            });
        }
    };

    // Helper to build PDF data object
    const buildPDFData = (): PDFQuoteData | null => {
        if (!calculation?.data_json || !klantInfo || !quoteSettings || !totals) {
            return null;
        }

        return {
            offerteNummer: (quote as any)?.offerteNummer || 'CONCEPT',
            datum: new Date().toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }),
            geldigTot: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }),
            logoUrl: userProfile?.settings?.logoUrl || undefined,
            signatureUrl: userProfile?.settings?.signatureUrl || userProfile?.signatureUrl || undefined,
            logoScale: userProfile?.settings?.logoScale || 1.0,
            bedrijf: {
                naam: (
                    userProfile?.settings?.bedrijfsnaam ||
                    businessData?.bedrijfsnaam ||
                    userProfile?.bedrijfsnaam ||
                    userProfile?.companyName ||
                    'Uw Bedrijfsnaam'
                ),
                adres:
                    `${userProfile?.settings?.adres || ''} ${userProfile?.settings?.huisnummer || ''}`.trim() ||
                    userProfile?.settings?.adres ||
                    businessData?.adres ||
                    userProfile?.adres ||
                    userProfile?.address ||
                    'Straatnaam 123',
                postcode: userProfile?.settings?.postcode || businessData?.postcode || userProfile?.postcode || userProfile?.zipcode || '1234 AB',
                plaats: userProfile?.settings?.plaats || businessData?.plaats || userProfile?.plaats || userProfile?.city || 'Plaats',
                telefoon: userProfile?.settings?.telefoon || businessData?.telefoon || userProfile?.telefoon || userProfile?.phone || '06-12345678',
                email: userProfile?.settings?.email || businessData?.email || userProfile?.email || user?.email || 'email@voorbeeld.nl',
                kvk: userProfile?.settings?.kvkNummer || businessData?.kvkNummer || businessData?.kvk || userProfile?.kvkNummer || userProfile?.kvk || '12345678',
                btw: userProfile?.settings?.btwNummer || businessData?.btwNummer || businessData?.btw || userProfile?.btwNummer || userProfile?.btw || 'NL123456789B01',
                iban: userProfile?.settings?.iban || businessData?.iban || userProfile?.iban || '',
            },
            klant: {
                naam: `${klantInfo.voornaam} ${klantInfo.achternaam}`,
                adres: `${klantInfo.straat} ${klantInfo.huisnummer}`,
                postcode: klantInfo.postcode,
                plaats: klantInfo.plaats,
                telefoon: klantInfo.telefoonnummer,
                email: klantInfo.emailadres,
            },
            projectLocatie: klantInfo.afwijkendProjectadres && klantInfo.projectAdres
                ? `${klantInfo.projectAdres.straat} ${klantInfo.projectAdres.huisnummer}, ${klantInfo.projectAdres.plaats}`
                : `${klantInfo.straat} ${klantInfo.huisnummer}, ${klantInfo.plaats}`,
            korteTitel: normalizedData?.korteTitel,
            korteBeschrijving: normalizedData?.korteBeschrijving,
            werkbeschrijving: generateWorkSummary(normalizedData?.werkbeschrijving, 800),
            werkbeschrijvingFull: normalizedData?.werkbeschrijving || [],
            grootmaterialen: materials.groot.map(m => ({
                aantal: m.aantal,
                product: m.product,
                prijsPerStuk: m.prijs_per_stuk || 0,
                totaal: (m.prijs_per_stuk || 0) * m.aantal,
            })),
            verbruiksartikelen: materials.verbruik.map(m => ({
                aantal: m.aantal,
                product: m.product,
                prijsPerStuk: m.prijs_per_stuk || 0,
                totaal: (m.prijs_per_stuk || 0) * m.aantal,
            })),
            urenSpecificatie: normalizedData?.uren_specificatie || [],
            totals: {
                materialenGroot: totals.materialenGroot,
                materialenVerbruik: totals.materialenVerbruik,
                materialenTotaal: totals.materialenTotaal,
                arbeidTotaal: totals.arbeidTotaal,
                transportTotaal: totals.transportTotaal,
                subtotaalExclBtw: totals.subtotaalExclBtw,
                winstMarge: totals.winstMarge,
                totaalExclBtw: totals.totaalExclBtw,
                btw: totals.btw,
                totaalInclBtw: totals.totaalInclBtw,
                totaalUren: normalizedData?.totaal_uren || 0,
                uurTarief: quoteSettings.uurTariefExclBtw,
                btwPercentage: quoteSettings.btwTarief,
                margePercentage: quoteSettings.extras.winstMarge.percentage,
            },
            settings: pdfSettings,
            drawingImages: capturedDrawings, // Include captured drawings for preview
        };
    };

    // Updated PDF Download Handler
    const handleDownloadPDF = async (): Promise<void> => {
        if (isGeneratingPDF) return;

        setCapturedDrawings([]);
        setIsDrawingsReady(false);
        setIsGeneratingPDF(true);

        await new Promise<void>((resolve, reject) => {
            pendingPDFPromiseRef.current = {
                resolve: () => {
                    pendingPDFPromiseRef.current = null;
                    resolve();
                },
                reject: (error: Error) => {
                    pendingPDFPromiseRef.current = null;
                    reject(error);
                }
            };

            // The actual generation is triggered by the onReady callback of HiddenPDFDrawings
            setPendingPDFAction(() => async (images: string[]) => {
                const data = preparePDFData();
                // Inject captured images
                (data as any).drawingImages = images;

                try {
                    const pdfBlob = await generateQuotePDF(data);
                    const url = window.URL.createObjectURL(pdfBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Offerte-${data.offerteNummer}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    pendingPDFPromiseRef.current?.resolve();
                } catch (err) {
                    console.error("Error generating PDF:", err);
                    const error = err instanceof Error ? err : new Error('Kon PDF niet genereren');
                    toast({
                        title: 'PDF genereren mislukt',
                        description: error.message,
                        variant: 'destructive',
                    });
                    pendingPDFPromiseRef.current?.reject(error);
                } finally {
                    setIsGeneratingPDF(false);
                    setPendingPDFAction(null);
                }
            });
        });
    };

    const handleMarkQuoteAsSent = async (): Promise<void> => {
        if (!firestore || !user || !id) return;

        const currentStatus = quote?.status;
        if (currentStatus === 'geaccepteerd' || currentStatus === 'afgewezen' || currentStatus === 'verlopen') {
            return;
        }

        const quoteRef = doc(firestore, 'quotes', id);
        await updateDoc(quoteRef, {
            status: 'verzonden',
            updatedAt: serverTimestamp(),
        } as any);

        setQuote((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                status: 'verzonden',
            };
        });
    };

    // Callback when drawings are captured
    const handleDrawingsCaptured = (images: string[]) => {
        // Always store the captured drawings for preview
        setCapturedDrawings(images);
        setIsDrawingsReady(true);

        if (pendingPDFAction) {
            void pendingPDFAction(images);
        } else {
            setIsGeneratingPDF(false);
        }
    };

    const preparePDFData = (): PDFQuoteData => {
        return {
            offerteNummer: (quote as any)?.offerteNummer || 'CONCEPT',
            datum: new Date().toLocaleDateString('nl-NL'),
            geldigTot: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL'),
            logoUrl: userProfile?.settings?.logoUrl || userProfile?.logoUrl || undefined,
            signatureUrl: userProfile?.settings?.signatureUrl || userProfile?.signatureUrl || undefined,
            logoScale: userProfile?.settings?.logoScale || userProfile?.logoScale || 1.0,
            bedrijf: {
                naam: (
                    userProfile?.settings?.bedrijfsnaam ||
                    businessData?.bedrijfsnaam ||
                    userProfile?.bedrijfsnaam ||
                    userProfile?.companyName ||
                    'Mijn Bedrijf'
                ),
                adres:
                    `${userProfile?.settings?.adres || ''} ${userProfile?.settings?.huisnummer || ''}`.trim() ||
                    userProfile?.settings?.adres ||
                    businessData?.adres ||
                    userProfile?.adres ||
                    userProfile?.address ||
                    '',
                postcode: userProfile?.settings?.postcode || businessData?.postcode || userProfile?.postcode || userProfile?.zipcode || '',
                plaats: userProfile?.settings?.plaats || businessData?.plaats || userProfile?.plaats || userProfile?.city || '',
                telefoon: userProfile?.settings?.telefoon || businessData?.telefoon || userProfile?.telefoon || userProfile?.phone || '',
                email: userProfile?.settings?.email || businessData?.email || userProfile?.email || user?.email || '',
                kvk: userProfile?.settings?.kvkNummer || businessData?.kvkNummer || businessData?.kvk || userProfile?.kvkNummer || userProfile?.kvk || '',
                btw: userProfile?.settings?.btwNummer || businessData?.btwNummer || businessData?.btw || userProfile?.btwNummer || userProfile?.btw || '',
                iban: userProfile?.settings?.iban || businessData?.iban || userProfile?.iban || '',
            },
            klant: {
                naam: klantInfo ? `${klantInfo.voornaam} ${klantInfo.achternaam}`.trim() : '',
                adres: klantInfo?.straat ? `${klantInfo.straat} ${klantInfo.huisnummer}` : '',
                postcode: klantInfo?.postcode || '',
                plaats: klantInfo?.plaats || '',
                telefoon: klantInfo?.telefoonnummer || '',
                email: klantInfo?.emailadres || '',
            },
            projectLocatie: normalizedData?.projectLocatie || '',
            korteTitel: normalizedData?.korteTitel,
            korteBeschrijving: normalizedData?.korteBeschrijving,
            werkbeschrijving: generateWorkSummary(normalizedData?.werkbeschrijving || []),
            werkbeschrijvingFull: normalizeWerkbeschrijving(normalizedData?.werkbeschrijving || []),
            grootmaterialen: materials.groot.map(m => ({
                aantal: m.aantal,
                product: m.product,
                prijsPerStuk: m.prijs_per_stuk || 0,
                totaal: m.aantal * (m.prijs_per_stuk || 0)
            })),
            verbruiksartikelen: materials.verbruik.map(m => ({
                aantal: m.aantal,
                product: m.product,
                prijsPerStuk: m.prijs_per_stuk || 0,
                totaal: m.aantal * (m.prijs_per_stuk || 0)
            })),
            urenSpecificatie: (normalizedData?.urenSpecificatie || []).map((u: any) => ({
                taak: u.omschrijving,
                uren: parseFloat(u.uren) || 0
            })),
            totals: {
                materialenGroot: totals?.materialenGroot || 0,
                materialenVerbruik: totals?.materialenVerbruik || 0,
                materialenTotaal: totals?.materialenTotaal || 0,
                arbeidTotaal: totals?.arbeidTotaal || 0,
                transportTotaal: totals?.transportTotaal || 0,
                subtotaalExclBtw: totals?.subtotaalExclBtw || 0,
                winstMarge: totals?.winstMarge || 0,
                totaalExclBtw: totals?.totaalExclBtw || 0,
                btw: totals?.btw || 0,
                totaalInclBtw: totals?.totaalInclBtw || 0,
                // Add missing fields required by PDFQuoteData
                totaalUren: normalizedData?.totaal_uren || 0,
                uurTarief: quoteSettings?.uurTariefExclBtw || 0,
                btwPercentage: quoteSettings?.btwTarief || 21,
                margePercentage: quoteSettings?.extras?.winstMarge?.percentage || 0
            },
            settings: pdfSettings,
        };
    };

    // Handle PDF settings update with persistence
    const handlePdfSettingsChange = async (newSettings: QuotePDFSettings) => {
        setPdfSettings(newSettings);

        if (user && firestore) {
            try {
                const userRef = doc(firestore, 'users', user.uid);
                await updateDoc(userRef, {
                    defaultPdfSettings: newSettings
                });
            } catch (err) {
                console.error("Error saving PDF settings preference:", err);
            }
        }
    };

    const handlePdfLogoChange = async (url: string | null) => {
        if (!user || !firestore) return;

        try {
            const userRef = doc(firestore, 'users', user.uid);
            await setDoc(userRef, {
                settings: {
                    ...(userProfile?.settings || {}),
                    logoUrl: url || ''
                }
            }, { merge: true });

            setUserProfile((prev: any) => ({
                ...(prev || {}),
                settings: {
                    ...(prev?.settings || {}),
                    logoUrl: url || ''
                }
            }));
        } catch (err) {
            console.error("Error saving logo preference:", err);
        }
    };

    const handlePdfSignatureChange = async (url: string | null) => {
        if (!user || !firestore) return;

        try {
            const userRef = doc(firestore, 'users', user.uid);
            await setDoc(userRef, {
                settings: {
                    ...(userProfile?.settings || {}),
                    signatureUrl: url || ''
                }
            }, { merge: true });

            setUserProfile((prev: any) => ({
                ...(prev || {}),
                settings: {
                    ...(prev?.settings || {}),
                    signatureUrl: url || ''
                }
            }));
        } catch (err) {
            console.error("Error saving signature preference:", err);
        }
    };

    const handleLogoScaleChange = async (scale: number) => {
        if (!user || !firestore) return;

        try {
            const userRef = doc(firestore, 'users', user.uid);
            await setDoc(userRef, {
                settings: {
                    ...(userProfile?.settings || {}),
                    logoScale: scale
                }
            }, { merge: true });

            setUserProfile((prev: any) => ({
                ...(prev || {}),
                settings: {
                    ...(prev?.settings || {}),
                    logoScale: scale
                }
            }));
        } catch (err) {
            console.error("Error saving logo scale:", err);
        }
    };

    // Old handleDownloadPDF removed to fix duplicate declaration.
    // The new one is defined above at line ~523.

    const formatTimerValue = (totalSeconds: number): string => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const getTimestampMillis = (value: unknown): number | null => {
        if (!value) return null;

        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (value instanceof Date) {
            const ms = value.getTime();
            return Number.isFinite(ms) ? ms : null;
        }

        if (typeof value === 'string') {
            const ms = Date.parse(value);
            return Number.isNaN(ms) ? null : ms;
        }

        if (typeof value === 'object' && value !== null) {
            const timestampLike = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };

            if (typeof timestampLike.toMillis === 'function') {
                const ms = timestampLike.toMillis();
                return Number.isFinite(ms) ? ms : null;
            }

            if (typeof timestampLike.seconds === 'number') {
                const nanos = typeof timestampLike.nanoseconds === 'number' ? timestampLike.nanoseconds : 0;
                return timestampLike.seconds * 1000 + Math.floor(nanos / 1_000_000);
            }
        }

        return null;
    };

    const calculationInProgress = quote?.status === 'in_behandeling' && !calculation?.data_json;
    const calculationTimerStorageKey = `offerte_calculation_started_at_${id}`;

    useEffect(() => {
        if (!calculationInProgress) {
            calculationTimerStartedAtRef.current = null;
            setCalculationElapsedSeconds(0);
            window.localStorage.removeItem(calculationTimerStorageKey);
            return;
        }

        if (calculationTimerStartedAtRef.current === null) {
            const quoteStartMs =
                getTimestampMillis(quote?.calculationStartedAt)
                ?? getTimestampMillis(quote?.updatedAt);

            const localStartRaw = window.localStorage.getItem(calculationTimerStorageKey);
            const localStartMs = localStartRaw ? Number(localStartRaw) : Number.NaN;

            const resolvedStartMs =
                quoteStartMs
                ?? (Number.isFinite(localStartMs) && localStartMs > 0 ? localStartMs : null)
                ?? Date.now();

            calculationTimerStartedAtRef.current = resolvedStartMs;
            window.localStorage.setItem(calculationTimerStorageKey, String(resolvedStartMs));
        }

        const updateElapsed = () => {
            const startedAt = calculationTimerStartedAtRef.current ?? Date.now();
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            setCalculationElapsedSeconds(Math.min(CALCULATION_ESTIMATE_SECONDS, Math.max(0, elapsedSeconds)));
        };

        updateElapsed();
        const intervalId = window.setInterval(updateElapsed, 1000);
        return () => window.clearInterval(intervalId);
    }, [calculationInProgress, calculationTimerStorageKey, quote?.calculationStartedAt, quote?.updatedAt]);

    const loading = calculationLoading || calculationInProgress || firebaseLoading || isUserLoading;
    const error = calculationError || firebaseError;
    const calculationProgressPercentage = Math.min(
        100,
        (calculationElapsedSeconds / CALCULATION_ESTIMATE_SECONDS) * 100
    );

    const LoadingPanel = () => (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="flex w-full max-w-sm flex-col items-center gap-3">
                <div className="text-emerald-400 font-medium tracking-wide">
                    {quote?.status === 'in_behandeling' ? 'MATERIALEN BEREKENEN' : 'LADEN'}
                </div>
                <div className="text-muted-foreground text-sm animate-pulse text-center">
                    {quote?.status === 'in_behandeling'
                        ? 'De AI berekent de benodigde materialen en uren...'
                        : 'Even geduld afrubelen...'}
                </div>
                {quote?.status === 'in_behandeling' && (
                    <div className="w-full space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatTimerValue(calculationElapsedSeconds)}</span>
                            <span>{formatTimerValue(CALCULATION_ESTIMATE_SECONDS)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full border border-emerald-500/20 bg-emerald-950/50">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500/70 to-emerald-400 transition-[width] duration-1000 ease-linear"
                                style={{ width: `${calculationProgressPercentage}%` }}
                            />
                        </div>
                        <div className="text-center text-xs text-muted-foreground">
                            Gemiddelde reken tijd; 3 minuten
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
            <AppNavigation />
            {/* Header */}
            <header className="border-b border-border px-6 py-4 bg-background/40 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-foreground">
                                    Offerte {(quote as any)?.offerteNummer || 'Concept'}
                                </h1>
                                <QuoteSwitcher currentQuoteId={id} />
                                {quote?.titel && <span className="text-muted-foreground font-normal hidden sm:inline">• {quote.titel}</span>}
                            </div>
                            {klantInfo && (
                                <p className="text-muted-foreground text-sm">
                                    {klantInfo.voornaam} {klantInfo.achternaam} • {klantInfo.plaats}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                void handleDownloadPDF();
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!totals || loading || isGeneratingPDF}
                        >
                            {isGeneratingPDF ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Download size={18} />
                            )}
                            Download
                        </button>

                        {!loading && (
                            <>
                                <Button
                                    variant="outline"
                                    className="flex-1 sm:flex-none gap-2"
                                    onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(id)}`)}
                                >
                                    <ReceiptText size={16} /> Maak factuur
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1 sm:flex-none gap-2"
                                    onClick={() => {
                                        const params = new URLSearchParams({
                                            mode: 'schedule',
                                            quoteId: id,
                                            hours: String(normalizedData?.totaal_uren || 0),
                                            view: 'week'
                                        });
                                        router.push(`/planning?${params.toString()}`);
                                    }}
                                >
                                    <CalendarDays size={16} /> Inplannen
                                </Button>
                                <Button
                                    className="flex-1 sm:flex-none gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                                    onClick={() => setIsSendModalOpen(true)}
                                >
                                    <Mail size={16} /> Versturen
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl p-4 pb-10 sm:p-6">
                {error ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="text-red-400 font-medium">Fout bij laden: {error}</div>
                        <Button asChild variant="secondary">
                            <Link href="/dashboard">Terug naar Dashboard</Link>
                        </Button>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-1 rounded-lg w-full sm:w-auto">
                            <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap justify-start w-full sm:w-auto">
                                <TabsTrigger value="materialen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <Package size={16} />
                                    {materialsWithoutPrice > 0 && (
                                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-red-500">
                                            <AlertCircle size={10} />
                                            {materialsWithoutPrice}
                                        </div>
                                    )}
                                    Materialen
                                </TabsTrigger>
                                <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <Euro size={16} /> Overzicht
                                </TabsTrigger>
                                <TabsTrigger value="arbeid" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <Clock size={16} /> Arbeid
                                </TabsTrigger>
                                <TabsTrigger value="tekeningen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <PenTool size={16} /> Tekeningen
                                </TabsTrigger>
                                <TabsTrigger value="pdf" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <FileText size={16} /> PDF Preview
                                </TabsTrigger>
                                <TabsTrigger value="notities" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <MessageSquare size={16} /> Notities
                                </TabsTrigger>
                            </TabsList>

                            {activeTab === 'pdf' && (
                                <Dialog open={isPdfSettingsOpen} onOpenChange={setIsPdfSettingsOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground mr-1">
                                            <Settings size={16} className="mr-2" /> PDF Instellingen
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-background border-border shadow-2xl">
                                        <DialogHeader className="px-6 pt-6">
                                            <DialogTitle>PDF Instellingen</DialogTitle>
                                            <DialogDescription>
                                                Settings voor inhoud en logo in de PDF.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="px-6 pb-6 space-y-6 max-h-[75vh] overflow-y-auto">
                                            <div className="rounded-lg border border-border bg-card">
                                                <QuoteSettings
                                                    settings={pdfSettings}
                                                    onChange={handlePdfSettingsChange}
                                                    variant="flat"
                                                />
                                            </div>

                                            <div className="space-y-4 rounded-lg border border-border p-4">
                                                <div>
                                                    <h3 className="font-semibold">Bedrijfslogo</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        Dit logo wordt getoond op uw offertes en facturen.
                                                    </p>
                                                </div>

                                                {user && (
                                                    <LogoUpload
                                                        currentLogoUrl={userProfile?.settings?.logoUrl || undefined}
                                                        userId={user.uid}
                                                        onLogoChange={handlePdfLogoChange}
                                                    />
                                                )}

                                                {(userProfile?.settings?.logoUrl || '').trim() !== '' && (
                                                    <div className="space-y-2 pt-2 border-t">
                                                        <Label htmlFor="pdfLogoScale">Logogrootte in PDF</Label>
                                                        <div className="flex items-center gap-4">
                                                            <input
                                                                id="pdfLogoScale"
                                                                type="range"
                                                                min="0.5"
                                                                max="2"
                                                                step="0.1"
                                                                value={userProfile?.settings?.logoScale || 1.0}
                                                                onChange={e => handleLogoScaleChange(parseFloat(e.target.value))}
                                                                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                            <span className="text-sm font-semibold min-w-[60px] text-right">
                                                                {Math.round((userProfile?.settings?.logoScale || 1.0) * 100)}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            Pas de grootte van het logo in de PDF aan (50% - 200%). Standaard is 100%.
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="space-y-2 pt-2 border-t">
                                                    <h4 className="font-medium">Handtekening</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Deze handtekening wordt onderaan de offerte-PDF geplaatst.
                                                    </p>
                                                    {user && (
                                                        <LogoUpload
                                                            currentLogoUrl={userProfile?.settings?.signatureUrl || undefined}
                                                            userId={user.uid}
                                                            onLogoChange={handlePdfSignatureChange}
                                                            itemLabel="Handtekening"
                                                            storageKey="signature"
                                                            recommendedText="Aanbevolen: transparante PNG met brede verhouding (bijv. 600x200px)"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>

                        {/* Overzicht Tab */}
                        <TabsContent value="overzicht" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {loading ? (
                                <LoadingPanel />
                            ) : !calculation?.data_json ? (
                                <div className="bg-card rounded-lg border border-border p-12 text-center">
                                    <Package size={48} className="mx-auto text-muted mb-4" />
                                    <h3 className="text-lg font-medium text-foreground mb-2">Nog geen calculatie</h3>
                                    <p className="text-muted-foreground">
                                        De materiaalstaat wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Top row: Client + Cost Summary */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <ClientInfoCard klantInfo={klantInfo} />
                                        <div className="lg:col-span-2 flex flex-col gap-4">

                                            <CostSummaryCard
                                                totals={totals}
                                                settings={quoteSettings}
                                                totalUren={(calculation?.data_json as any)?.totaal_uren || normalizedData?.totaal_uren || 0}
                                                onUpdateHourlyRate={(newRate) => {
                                                    if (!quoteSettings) return;
                                                    handleUpdateSettings({ ...quoteSettings, uurTariefExclBtw: newRate });
                                                }}
                                                onUpdateTotalHours={async (newHours) => {
                                                    if (!calculation) return;
                                                    // Assuming we can just update the total, note: this might desync from uren_specificatie
                                                    // but since user explicitly requested editing total hours, we allow it.
                                                    const root = unwrapRoot(calculation.data_json);
                                                    await updateDataJson({
                                                        ...root,
                                                        totaal_uren: newHours,
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Facturatie (Voorschot) */}
                                    {totals && (
                                        <Card className="border border-border bg-card/50">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base">Facturatie</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-foreground">Voorschot gebruiken</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            Gebruik een voorschotpercentage voor de eindfactuur.
                                                        </div>
                                                    </div>
                                                    <Switch
                                                        checked={voorschotIngeschakeld}
                                                        onCheckedChange={(checked) => {
                                                            const wasOn = voorschotIngeschakeld;
                                                            setVoorschotIngeschakeld(checked);
                                                            if (checked && !wasOn) {
                                                                const defaultPct = Number(userProfile?.settings?.standaardVoorschotPercentage);
                                                                if (Number.isFinite(defaultPct)) {
                                                                    setVoorschotPercentage(defaultPct);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-3">
                                                    <div className="space-y-2">
                                                        <Label>Voorschot (%)</Label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                value={voorschotPercentage}
                                                                onChange={(e) => setVoorschotPercentage(Number(e.target.value))}
                                                                disabled={!voorschotIngeschakeld}
                                                                className="w-full h-10 rounded-md border border-border bg-background px-3 pr-8 text-sm disabled:opacity-60"
                                                            />
                                                            <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2 md:col-span-2">
                                                        <Label>Preview (incl. BTW)</Label>
                                                        <div className="h-10 rounded-md border border-border bg-background px-3 flex items-center justify-between">
                                                            <span className="text-sm text-muted-foreground">Voorschotbedrag</span>
                                                            <span className="text-sm font-semibold text-foreground">
                                                                {formatCurrency(
                                                                    Math.round((totals.totaalInclBtw * (Math.max(0, Math.min(100, voorschotPercentage)) / 100)) * 100) / 100
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => existingVoorschotInvoiceId && router.push(`/facturen/${existingVoorschotInvoiceId}`)}
                                                        disabled={!existingVoorschotInvoiceId}
                                                    >
                                                        Open voorschotfactuur
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Work Description */}
                                    <WorkDescriptionCard werkbeschrijving={normalizedData?.werkbeschrijving || []} />
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="tekeningen" className="mt-6 space-y-6">
                            {loading ? <LoadingPanel /> : quote && <DrawingsTab quote={quote} />}
                        </TabsContent>

                        {/* Materialen Tab */}
                        <TabsContent value="materialen" className="mt-6 space-y-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : !calculation?.data_json ? (
                                <div className="bg-card rounded-lg border border-border p-12 text-center">
                                    <Package size={48} className="mx-auto text-muted mb-4" />
                                    <h3 className="text-lg font-medium text-foreground mb-2">Nog geen materialen</h3>
                                    <p className="text-muted-foreground">
                                        De materiaalstaat wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {lastSyncedAt && (
                                        <div className="flex items-center justify-end mb-4">
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Opgeslagen {formatDistanceToNow(lastSyncedAt, { addSuffix: true, locale: nl })}
                                            </span>
                                        </div>
                                    )}

                                    <div className="space-y-3 pb-8 mb-8 border-b border-border/60">
                                        <Label className="text-base font-semibold text-foreground/90">Kies Een Werkpakket</Label>
                                        <div
                                            className="grid w-full items-stretch"
                                            style={{ gridTemplateColumns: '84% 15%', columnGap: '1%' }}
                                        >
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-10 rounded-xl border-border/70 bg-card/40 text-foreground hover:bg-muted/40 hover:border-border justify-between px-3"
                                                onClick={() => setIsMaterialPackagePickerOpen(true)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 text-left flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-foreground truncate">
                                                            {selectedMaterialPackageId === 'NIEUW'
                                                                ? 'Nieuw'
                                                                : (selectedMaterialPackage?.naam || 'Werkpakket')}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            •
                                                        </span>
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            {selectedMaterialPackageId === 'NIEUW'
                                                                ? 'Start zonder werkpakket'
                                                                : 'Klik om werkpakket te kiezen'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-10 rounded-xl border-border/70 bg-card/40 text-foreground hover:bg-muted/40 hover:border-border font-semibold"
                                                onClick={() => void handleResetMaterialPackageToNieuw()}
                                            >
                                                <Sparkles className="h-4 w-4 mr-2 text-muted-foreground" />
                                                Nieuw
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Total materials summary */}
                                    <div className="bg-card/50 rounded-xl border border-border overflow-hidden backdrop-blur-sm mb-8">
                                        <div className="flex justify-between items-center px-6 py-4 bg-muted/20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                    <Package size={18} />
                                                </div>
                                                <h3 className="font-semibold text-foreground tracking-tight text-sm uppercase">TOTAAL MATERIALEN</h3>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="text-right w-32 px-6">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold leading-tight">Totaal</p>
                                                    <p className="text-[9px] text-zinc-400 uppercase font-medium leading-tight mb-1">(excl. btw)</p>
                                                    <p className="text-primary font-bold tracking-tight">
                                                        {formatCurrency(grootSubtotal + verbruikSubtotal)}
                                                    </p>
                                                </div>
                                                <div className="text-right w-32 px-6">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold leading-tight">Totaal</p>
                                                    <p className="text-[9px] text-zinc-400 uppercase font-medium leading-tight mb-1">(incl. btw)</p>
                                                    <p className="text-primary font-bold tracking-tight">
                                                        {formatCurrency((grootSubtotal + verbruikSubtotal) * (1 + (quoteSettings?.btwTarief || 21) / 100))}
                                                    </p>
                                                </div>
                                                {/* Spacer to align with trash icon column */}
                                                <div className="w-12" />
                                            </div>
                                        </div>
                                    </div>

                                    {isDevUser && (
                                        <div className="mb-3 flex items-center justify-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={handleCompareLastThreeGrootPrices}
                                                disabled={isComparingGrootPrices}
                                            >
                                                {isComparingGrootPrices ? (
                                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Eye className="mr-2 h-3.5 w-3.5" />
                                                )}
                                                Compare huidige + 2 offertes materialen (groot + verbruik): aantal + totaal
                                            </Button>
                                        </div>
                                    )}

                                    <MaterialEditor
                                        title="GROOTMATERIALEN"
                                        items={materials.groot}
                                        onUpdateItem={handleUpdateGrootItem}
                                        onRemoveItem={(index) => handleRemoveItem('groot', index)}
                                        onAddItem={(item) => handleAddItem('groot', item)}
                                        subtotal={grootSubtotal}
                                        vatRate={quoteSettings?.btwTarief}
                                        onAddClick={() => setActiveCategory('groot')}
                                        enableCalculationViewToggle
                                        calculationTextFields="hoe_berekend"
                                        showDontAutoIncludeOption={false}
                                    />
                                    <MaterialEditor
                                        title="VERBRUIKSARTIKELEN"
                                        items={materials.verbruik}
                                        onUpdateItem={handleUpdateVerbruiksItem}
                                        onRemoveItem={(index) => handleRemoveItem('verbruik', index)}
                                        onAddItem={(item) => handleAddItem('verbruik', item)}
                                        subtotal={verbruikSubtotal}
                                        vatRate={quoteSettings?.btwTarief}
                                        onAddClick={() => setActiveCategory('verbruik')}
                                        enableCalculationViewToggle
                                        calculationTextFields="waarom_dit"
                                        calculationToggleLabel="Laat toelichting zien"
                                        calculationRowLabel="Waarom dit"
                                        showDontAutoIncludeOption
                                    />

                                    <Dialog open={isGrootCompareOpen} onOpenChange={setIsGrootCompareOpen}>
                                        <DialogContent className="sm:max-w-6xl max-h-[94vh] overflow-hidden">
                                            <DialogHeader>
                                                <DialogTitle>Vergelijking huidige + 2 offertes - Materialen</DialogTitle>
                                                <DialogDescription>
                                                    Vergelijkt grootmaterialen en verbruiksmaterialen op aantal en regel-totalen. Ontbrekende producten worden als 0 getoond.
                                                </DialogDescription>
                                            </DialogHeader>

                                            {grootCompareError ? (
                                                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                                    {grootCompareError}
                                                </div>
                                            ) : (
                                                <div className="space-y-5 overflow-y-auto">
                                                    <div className="grid gap-2 md:grid-cols-3">
                                                        {grootCompareQuotes.map((quoteColumn) => (
                                                            <div
                                                                key={quoteColumn.quoteId}
                                                                className="rounded-md border border-border bg-muted/20 px-3 py-2"
                                                            >
                                                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                    {quoteColumn.label}
                                                                </div>
                                                                <div className="text-sm font-medium">
                                                                    Totaal groot: {formatCurrency(quoteColumn.grootSubtotal)}
                                                                </div>
                                                                <div className="text-sm font-medium">
                                                                    Totaal verbruik: {formatCurrency(quoteColumn.verbruikSubtotal)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={compareMaterialView === 'groot' ? 'default' : 'outline'}
                                                            onClick={() => setCompareMaterialView('groot')}
                                                        >
                                                            Grootmaterialen
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={compareMaterialView === 'verbruik' ? 'default' : 'outline'}
                                                            onClick={() => setCompareMaterialView('verbruik')}
                                                        >
                                                            Verbruiksmaterialen
                                                        </Button>
                                                    </div>

                                                    {compareMaterialView === 'groot' && (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grootmaterialen</h4>
                                                                {hasGrootCalculationDetails && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-muted-foreground">Laat berekening zien</span>
                                                                        <Switch checked={showGrootCalculation} onCheckedChange={setShowGrootCalculation} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="rounded-md border border-border overflow-hidden">
                                                                <div className="max-h-[52vh] overflow-auto">
                                                                    <table className="w-full border-collapse text-sm">
                                                                        <thead className="bg-muted/30">
                                                                            <tr>
                                                                                <th className="px-3 py-2 text-left font-semibold">Product</th>
                                                                                {grootCompareQuotes.map((quoteColumn) => (
                                                                                    <th key={`groot-head-${quoteColumn.quoteId}`} className="px-3 py-2 text-right font-semibold">
                                                                                        {quoteColumn.offerteNummer !== null ? `#${quoteColumn.offerteNummer}` : quoteColumn.label}
                                                                                    </th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            <tr className="border-t border-border bg-muted/10">
                                                                                <td className="px-3 py-2 font-medium">Uren</td>
                                                                                {grootCompareQuotes.map((quoteColumn) => (
                                                                                    <td key={`hours-${quoteColumn.quoteId}`} className="px-3 py-2 text-right font-mono">
                                                                                        {quoteColumn.totalHours === null ? '—' : `${formatAantal(quoteColumn.totalHours)} u`}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                            {grootCompareRows.length === 0 ? (
                                                                                <tr>
                                                                                    <td
                                                                                        colSpan={grootCompareQuotes.length + 1}
                                                                                        className="px-3 py-4 text-center text-muted-foreground"
                                                                                    >
                                                                                        Geen grootmaterialen gevonden in de geselecteerde offertes.
                                                                                    </td>
                                                                                </tr>
                                                                            ) : (
                                                                                grootCompareRows.map((row) => (
                                                                                    <tr key={`groot-${row.product}`} className="border-t border-border">
                                                                                        <td className="px-3 py-2">{row.product}</td>
                                                                                        {row.values.map((value, index) => (
                                                                                            <td key={`groot-${row.product}-${index}`} className="px-3 py-2 text-right">
                                                                                                <div className="flex flex-col items-end leading-tight">
                                                                                                    <span className="font-mono">{formatAantal(value.aantal)} st</span>
                                                                                                    <span className="text-xs text-muted-foreground font-mono">
                                                                                                        {formatCurrency(value.totaal)}
                                                                                                    </span>
                                                                                                    {showGrootCalculation && (
                                                                                                        <span className="mt-1 max-w-[28ch] text-[11px] text-muted-foreground/90">
                                                                                                            {value.detail || '—'}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </td>
                                                                                        ))}
                                                                                    </tr>
                                                                                ))
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {compareMaterialView === 'verbruik' && (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verbruiksmaterialen</h4>
                                                                {hasVerbruikToelichtingDetails && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-muted-foreground">Laat toelichting zien</span>
                                                                        <Switch checked={showVerbruikToelichting} onCheckedChange={setShowVerbruikToelichting} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="rounded-md border border-border overflow-hidden">
                                                                <div className="max-h-[52vh] overflow-auto">
                                                                    <table className="w-full border-collapse text-sm">
                                                                        <thead className="bg-muted/30">
                                                                            <tr>
                                                                                <th className="px-3 py-2 text-left font-semibold">Product</th>
                                                                                {grootCompareQuotes.map((quoteColumn) => (
                                                                                    <th key={`verbruik-head-${quoteColumn.quoteId}`} className="px-3 py-2 text-right font-semibold">
                                                                                        {quoteColumn.offerteNummer !== null ? `#${quoteColumn.offerteNummer}` : quoteColumn.label}
                                                                                    </th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {verbruikCompareRows.length === 0 ? (
                                                                                <tr>
                                                                                    <td
                                                                                        colSpan={grootCompareQuotes.length + 1}
                                                                                        className="px-3 py-4 text-center text-muted-foreground"
                                                                                    >
                                                                                        Geen verbruiksmaterialen gevonden in de geselecteerde offertes.
                                                                                    </td>
                                                                                </tr>
                                                                            ) : (
                                                                                verbruikCompareRows.map((row) => (
                                                                                    <tr key={`verbruik-${row.product}`} className="border-t border-border">
                                                                                        <td className="px-3 py-2">{row.product}</td>
                                                                                        {row.values.map((value, index) => (
                                                                                            <td key={`verbruik-${row.product}-${index}`} className="px-3 py-2 text-right">
                                                                                                <div className="flex flex-col items-end leading-tight">
                                                                                                    <span className="font-mono">{formatAantal(value.aantal)} st</span>
                                                                                                    <span className="text-xs text-muted-foreground font-mono">
                                                                                                        {formatCurrency(value.totaal)}
                                                                                                    </span>
                                                                                                    {showVerbruikToelichting && (
                                                                                                        <span className="mt-1 max-w-[28ch] text-[11px] text-muted-foreground/90">
                                                                                                            {value.detail || '—'}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </td>
                                                                                        ))}
                                                                                    </tr>
                                                                                ))
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </DialogContent>
                                    </Dialog>
                                </>
                            )}
                        </TabsContent>

                        {/* Arbeid Tab */}
                        <TabsContent value="arbeid" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : !calculation?.data_json || !quoteSettings ? (
                                <div className="bg-card rounded-lg border border-border p-12 text-center">
                                    <Clock size={48} className="mx-auto text-muted mb-4" />
                                    <h3 className="text-lg font-medium text-foreground mb-2">Nog geen uren</h3>
                                    <p className="text-muted-foreground">
                                        De urenspecificatie wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                    </p>
                                </div>
                            ) : (
                                <LaborBreakdown
                                    urenSpecificatie={normalizedData?.uren_specificatie || []}
                                    totaalUren={(calculation?.data_json as any)?.totaal_uren || normalizedData?.totaal_uren || 0}
                                    uurTarief={quoteSettings?.uurTariefExclBtw || 0}
                                    onUpdateHourlyRate={(newRate) => {
                                        if (!quoteSettings) return;
                                        handleUpdateSettings({ ...quoteSettings, uurTariefExclBtw: newRate });
                                    }}
                                    onUpdateTotalHours={async (newHours) => {
                                        if (!calculation) return;
                                        const root = unwrapRoot(calculation.data_json);
                                        await updateDataJson({
                                            ...root,
                                            totaal_uren: newHours,
                                        });
                                    }}
                                    onUpdateItem={async (index, newHours) => {
                                        if (!calculation || !normalizedData) return;
                                        const updatedItems = [...(normalizedData.uren_specificatie || [])];
                                        if (updatedItems[index]) {
                                            updatedItems[index] = { ...updatedItems[index], uren: newHours };

                                            // Recalculate total hours based on the new item value
                                            const newTotal = updatedItems.reduce((sum, item) => sum + (item.uren || 0), 0);

                                            const root = unwrapRoot(calculation.data_json);
                                            await updateDataJson({
                                                ...root,
                                                uren_specificatie: updatedItems,
                                                totaal_uren: newTotal
                                            });
                                        }
                                    }}
                                />
                            )}
                        </TabsContent>

                        {/* PDF Tab */}
                        <TabsContent value="pdf" className="mt-6 space-y-4">
                            {loading ? (
                                <LoadingPanel />
                            ) : !isDrawingsReady ? (
                                <div className="bg-card rounded-lg border border-border p-12 text-center">
                                    <div className="text-muted-foreground">PDF voorbereiden...</div>
                                </div>
                            ) : (
                                <PDFPreview
                                    pdfData={buildPDFData()}
                                />
                            )}
                        </TabsContent>

                        {/* Notities Tab - Reusing logic could be added here involving firestore update or specific Notes component from elsewhere */}
                        <TabsContent value="notities" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <div className="bg-card rounded-lg border border-border p-6">
                                    <div className="flex-1 bg-muted/50 border border-border/50 rounded-2xl p-8 relative">
                                        <h3 className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4" /> Veldnotities
                                        </h3>
                                        {/*  Ideally we would iterate over jobs to show all notes, or show quote level notes.
                                         The original code showed activeJob.notities.
                                         Since we don't have activeJob selector here yet (simplified view),
                                         we might just show a placeholder or aggregates.
                                     */}
                                        <p className="text-muted-foreground italic">Notities functionaliteit wordt bijgewerkt.</p>
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                )}

            </main>

            <SendQuoteModal
                isOpen={isSendModalOpen}
                onClose={() => setIsSendModalOpen(false)}
                klantInfo={klantInfo}
                offerteNummer={(quote as any)?.offerteNummer || 'CONCEPT'}
                werkbeschrijving={normalizedData?.werkbeschrijving}
                onDownloadPDF={handleDownloadPDF}
                onMarkAsSent={handleMarkQuoteAsSent}
                totaalInclBtw={totals?.totaalInclBtw || 0}
                geldigTot={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                })}
                bedrijfsnaam={
                    userProfile?.settings?.bedrijfsnaam ||
                    userProfile?.bedrijfsnaam ||
                    userProfile?.companyName ||
                    businessData?.bedrijfsnaam ||
                    ''
                }
                afzenderNaam={businessData?.contactNaam || user?.displayName || userProfile?.naam || ''}
                korteTitel={normalizedData?.korteTitel}
                korteBeschrijving={normalizedData?.korteBeschrijving}
            />

            <MaterialSelectionModal
                open={!!activeCategory}
                onOpenChange={(open) => !open && setActiveCategory(null)}
                existingMaterials={alleMaterialen}
                onSelectExisting={handleSelectMaterial}
                onMaterialAdded={handleSelectMaterial} // Handle custom created materials same way
                defaultCategory="all"
            />

            <Dialog open={isMaterialPackagePickerOpen} onOpenChange={setIsMaterialPackagePickerOpen}>
                <DialogContent className="w-[95vw] max-w-[1200px] h-[88vh] overflow-hidden flex flex-col">
                    <DialogHeader className="space-y-2">
                        <DialogTitle>Kies een werkpakket</DialogTitle>
                        <DialogDescription>
                            Selecteer een werkpakket of start direct zonder preset.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Zoek werkpakket..."
                            value={materialPackagePickerSearch}
                            onChange={(event) => setMaterialPackagePickerSearch(event.target.value)}
                            className="pl-9 h-10 border-muted-foreground/20 focus-visible:ring-emerald-500/40"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 py-1">
                        <button
                            type="button"
                            onClick={() => handleSelectMaterialPackageFromPicker('NIEUW')}
                            className={`group relative w-full text-left rounded-xl border border-l-4 px-4 py-2.5 transition-all duration-200 ${selectedMaterialPackageId === 'NIEUW'
                                ? 'border-white/20 border-l-white/30 bg-card/60 shadow-[0_10px_24px_-18px_rgba(255,255,255,0.35)]'
                                : 'border-white/10 border-l-white/10 bg-card/40 hover:bg-card/60 hover:border-white/20 hover:border-l-white/20'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 text-left">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                                        <span className="truncate text-sm font-semibold text-zinc-100">Nieuw</span>
                                        <span className="truncate text-sm text-zinc-400">Start zonder werkpakket</span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
                            </div>
                        </button>

                        {filteredMaterialPackages.map((pkg) => (
                            <button
                                key={pkg.id}
                                type="button"
                                onClick={() => handleSelectMaterialPackageFromPicker(pkg.id)}
                                className={`group relative w-full text-left rounded-xl border border-l-4 px-4 py-3 transition-all duration-200 ${selectedMaterialPackageId === pkg.id
                                    ? 'border-white/20 border-l-white/30 bg-card/60 shadow-[0_10px_24px_-18px_rgba(255,255,255,0.35)]'
                                    : 'border-white/10 border-l-white/10 bg-card/40 hover:bg-card/60 hover:border-white/20 hover:border-l-white/20'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 text-left">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Box className="h-4 w-4 text-emerald-400 shrink-0" />
                                            <span className="truncate text-base font-bold text-zinc-100">
                                                {pkg.naam}
                                            </span>
                                            <span className="truncate text-sm text-zinc-400">
                                                {getMaterialPackageSummary(pkg)}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
                                </div>
                            </button>
                        ))}

                        {filteredMaterialPackages.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-10">Geen werkpakketten gevonden.</div>
                        ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setIsMaterialPackagePickerOpen(false);
                                openSaveMaterialPackageDialog();
                            }}
                        >
                            <Save className="h-4 w-4 mr-2" />
                            Opslaan als werkpakket
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setIsMaterialPackagePickerOpen(false)}>
                            Sluiten
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isSaveMaterialPackageOpen} onOpenChange={setIsSaveMaterialPackageOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Werkpakket opslaan</DialogTitle>
                        <DialogDescription>
                            Maak een preset van de huidige materialen in deze offerte.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="werkpakket-naam">Naam</Label>
                            <Input
                                id="werkpakket-naam"
                                value={materialPackageName}
                                onChange={(event) => setMaterialPackageName(event.target.value)}
                                placeholder="Bijv. Dak renovatie basis"
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void handleSaveCurrentAsMaterialPackage();
                                    }
                                }}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsSaveMaterialPackageOpen(false)}
                                disabled={isSavingMaterialPackage}
                            >
                                Annuleren
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void handleSaveCurrentAsMaterialPackage()}
                                disabled={isSavingMaterialPackage}
                            >
                                {isSavingMaterialPackage ? 'Opslaan...' : 'Opslaan'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Hidden Drawing Generator - render when on PDF tab OR during download */}
            {
                (activeTab === 'pdf' || isGeneratingPDF) && quote && !isDrawingsReady && (
                    <HiddenPDFDrawings
                        quote={quote}
                        onReady={handleDrawingsCaptured}
                    />
                )
            }

        </div >

    );
}
