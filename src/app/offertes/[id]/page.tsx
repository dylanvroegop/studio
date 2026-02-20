'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Euro, Package, Clock, FileText, MessageSquare, Download, Mail, Settings, PenTool, CalendarDays, Eye, ReceiptText, Loader2, AlertCircle, Save, Box, ChevronDown, ChevronRight, Sparkles, Search, ClipboardList, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Percent } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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
import { SendQuoteModal, type QuoteAttachmentOptions } from '@/components/quote/SendQuoteModal';
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
import { reportOperationalError } from '@/lib/report-operational-error';
import {
    defaultQuotePdfTextSettings,
    sanitizeQuotePdfTextSettings,
    type QuotePdfTextSettings,
} from '@/lib/quote-pdf-text-settings';

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

type VoorwaardenEditorMode = 'vastePrijs' | 'onderVoorbehoud';
type MaterialViewMode = 'single' | 'split';
type MobileMaterialSection = 'groot' | 'verbruik';

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

function getVoorwaardenByMode(
    settings: QuotePdfTextSettings,
    mode: VoorwaardenEditorMode,
): string[] {
    return mode === 'vastePrijs'
        ? settings.voorwaardenVastePrijs
        : settings.voorwaardenOnderVoorbehoud;
}

function withVoorwaardenByMode(
    settings: QuotePdfTextSettings,
    mode: VoorwaardenEditorMode,
    regels: string[],
): QuotePdfTextSettings {
    if (mode === 'vastePrijs') {
        return { ...settings, voorwaardenVastePrijs: regels };
    }
    return { ...settings, voorwaardenOnderVoorbehoud: regels };
}

const CALCULATION_ESTIMATE_SECONDS = 300;
const CALCULATION_STUCK_SECONDS = 20 * 60;

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
    const [pdfTextSettings, setPdfTextSettings] = useState<QuotePdfTextSettings>(defaultQuotePdfTextSettings);
    const [voorwaardenEditorMode, setVoorwaardenEditorMode] = useState<VoorwaardenEditorMode>('onderVoorbehoud');
    const [activeTab, setActiveTab] = useState('materialen');
    const [btwConverterRateInput, setBtwConverterRateInput] = useState('21');
    const [btwConverterExclInput, setBtwConverterExclInput] = useState('');
    const [btwConverterInclInput, setBtwConverterInclInput] = useState('');
    const [btwConverterLastEdited, setBtwConverterLastEdited] = useState<'excl' | 'incl' | null>(null);
    const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);
    const [hasSavedPdfSettings, setHasSavedPdfSettings] = useState(true); // assume true until proven otherwise
    const pdfSettingsShownOnceRef = useRef(false);

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

    // Auto-open PDF settings for first-time users when they navigate to the PDF tab
    useEffect(() => {
        if (activeTab !== 'pdf') return;
        if (hasSavedPdfSettings) return;
        if (pdfSettingsShownOnceRef.current) return;
        if (firebaseLoading) return;
        pdfSettingsShownOnceRef.current = true;
        setIsPdfSettingsOpen(true);
    }, [activeTab, hasSavedPdfSettings, firebaseLoading]);

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
    const [materialViewMode, setMaterialViewMode] = useState<MaterialViewMode>('single');
    const [mobileMaterialSection, setMobileMaterialSection] = useState<MobileMaterialSection>('groot');

    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [voorschotIngeschakeld, setVoorschotIngeschakeld] = useState(false);
    const [voorschotPercentage, setVoorschotPercentage] = useState<number>(50);
    const [onderVoorbehoud, setOnderVoorbehoud] = useState(false);
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
    const [isRetryingCalculation, setIsRetryingCalculation] = useState(false);
    const calculationTimerStartedAtRef = useRef<number | null>(null);

    const normalizedBtwConverterRate = useMemo(() => {
        const parsed = parsePriceToNumber(btwConverterRateInput);
        if (parsed === null) return 21;
        return Math.min(100, Math.max(0, parsed));
    }, [btwConverterRateInput]);

    const formatConverterAmount = (value: number): string =>
        value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const converterExclValue = useMemo(
        () => parsePriceToNumber(btwConverterExclInput),
        [btwConverterExclInput]
    );
    const converterInclValue = useMemo(
        () => parsePriceToNumber(btwConverterInclInput),
        [btwConverterInclInput]
    );

    const converterBtwAmount = useMemo(() => {
        if (converterExclValue === null || converterInclValue === null) return null;
        return converterInclValue - converterExclValue;
    }, [converterExclValue, converterInclValue]);

    const handleBtwExclChange = (value: string) => {
        setBtwConverterExclInput(value);
        setBtwConverterLastEdited('excl');
        const excl = parsePriceToNumber(value);
        if (excl === null) {
            setBtwConverterInclInput('');
            return;
        }
        const incl = excl * (1 + normalizedBtwConverterRate / 100);
        setBtwConverterInclInput(formatConverterAmount(incl));
    };

    const handleBtwInclChange = (value: string) => {
        setBtwConverterInclInput(value);
        setBtwConverterLastEdited('incl');
        const incl = parsePriceToNumber(value);
        if (incl === null) {
            setBtwConverterExclInput('');
            return;
        }
        const excl = incl / (1 + normalizedBtwConverterRate / 100);
        setBtwConverterExclInput(formatConverterAmount(excl));
    };

    useEffect(() => {
        if (btwConverterLastEdited === 'excl') {
            const excl = parsePriceToNumber(btwConverterExclInput);
            if (excl === null) {
                setBtwConverterInclInput('');
                return;
            }
            const incl = excl * (1 + normalizedBtwConverterRate / 100);
            setBtwConverterInclInput(formatConverterAmount(incl));
            return;
        }

        if (btwConverterLastEdited === 'incl') {
            const incl = parsePriceToNumber(btwConverterInclInput);
            if (incl === null) {
                setBtwConverterExclInput('');
                return;
            }
            const excl = incl / (1 + normalizedBtwConverterRate / 100);
            setBtwConverterExclInput(formatConverterAmount(excl));
        }
    }, [normalizedBtwConverterRate, btwConverterLastEdited, btwConverterExclInput, btwConverterInclInput]);

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
                            setHasSavedPdfSettings(true);
                        } else {
                            setHasSavedPdfSettings(false);
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
        setMaterialViewMode('single');
        setMobileMaterialSection('groot');
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
            if (f.onderVoorbehoud !== undefined) {
                setOnderVoorbehoud(!!f.onderVoorbehoud);
            }
        }
        setPdfTextSettings(sanitizeQuotePdfTextSettings((quote as any)?.pdfTeksten));
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
                        onderVoorbehoud,
                    },
                    pdfTeksten: pdfTextSettings,
                    updatedAt: new Date(),
                });
            } catch (e) {
                console.error('Fout bij opslaan facturatie:', e);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [voorschotIngeschakeld, voorschotPercentage, onderVoorbehoud, pdfTextSettings, user, firestore, id, quote]);

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
                console.log('[DEBUG] fetchMaterials response:', json);

                if (res.ok && json.ok) {
                    const materialenData = (json.data || []).map((m: any) => {
                        // ...
                        const excl = parsePriceToNumber(m.prijs_excl_btw)
                            ?? Number((((parsePriceToNumber(m.prijs_incl_btw ?? m.prijs) ?? 0) / 1.21)).toFixed(2));
                        const incl = parsePriceToNumber(m.prijs_incl_btw)
                            ?? Number((excl * 1.21).toFixed(2));
                        return {
                            ...m,
                            id: m.row_id || m.id,
                            prijs: excl,
                            prijs_per_stuk: excl,
                            prijs_excl_btw: excl,
                            prijs_incl_btw: incl,
                            materiaalnaam: m.materiaalnaam || m.naam,
                            categorie: m.categorie || m.subsectie || 'Overig',
                        };
                    });
                    console.log(`[DEBUG] Parsed ${materialenData.length} materials`);
                    setAlleMaterialen(materialenData);
                } else {
                    const message = json?.message || json?.error || 'Kon materialen niet laden.';
                    void reportOperationalError({
                        source: 'offerte_materialen_fetch',
                        title: 'Fout bij laden materialen',
                        message,
                        context: {
                            httpStatus: res.status,
                        },
                    });
                    toast({
                        variant: 'destructive',
                        title: 'Fout bij laden materialen',
                        description: message,
                    });
                }
            } catch (err) {
                console.error("Error fetching materials:", err);
                const message = err instanceof Error ? err.message : 'Netwerkfout tijdens ophalen van materialen.';
                void reportOperationalError({
                    source: 'offerte_materialen_fetch',
                    title: 'Fout bij laden materialen',
                    message,
                });
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
            const nextGroot = Array.isArray(normalized.grootmaterialen) ? normalized.grootmaterialen : [];
            const nextVerbruik = Array.isArray(normalized.verbruiksartikelen) ? normalized.verbruiksartikelen : [];
            const hasCalculatedMaterialDetails =
                nextGroot.some(
                    (item) => typeof item?.hoe_berekend === 'string' && item.hoe_berekend.trim().length > 0
                ) ||
                nextVerbruik.some(
                    (item) => typeof item?.waarom_dit === 'string' && item.waarom_dit.trim().length > 0
                );

            // 1. Materials
            setMaterials({
                groot: nextGroot,
                verbruik: nextVerbruik,
            });

            setMaterialViewMode(hasCalculatedMaterialDetails ? 'split' : 'single');

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

    useEffect(() => {
        if (materialViewMode === 'single') {
            setMobileMaterialSection('groot');
        }
    }, [materialViewMode]);

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

            const updated = [...materials[listKey], item];
            setMaterials(prev => ({ ...prev, [listKey]: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                const nextGroot = category === 'groot' ? updated : materials.groot;
                const nextVerbruik = category === 'verbruik' ? updated : materials.verbruik;
                await updateDataJson({
                    ...root,
                    grootmaterialen: nextGroot,
                    verbruiksartikelen: nextVerbruik,
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
            const current = materials[listKey];

            if (index < 0 || index >= current.length) return;

            const updated = current.filter((_, i) => i !== index);
            setMaterials(prev => ({ ...prev, [listKey]: updated }));

            if (calculation) {
                const root = unwrapRoot(calculation.data_json);
                const nextGroot = category === 'groot' ? updated : materials.groot;
                const nextVerbruik = category === 'verbruik' ? updated : materials.verbruik;
                await updateDataJson({
                    ...root,
                    grootmaterialen: nextGroot,
                    verbruiksartikelen: nextVerbruik,
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
            const token = await user.getIdToken();
            const response = await fetch('/api/quotes/get-calculations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ quoteIds }),
            });

            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || 'Kon calculaties niet ophalen.');
            }

            const calculationRows = Array.isArray(payload.rows)
                ? (payload.rows as Array<{ quoteid: string; data_json: unknown }>)
                : [];

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
    const totalMaterialItems = materials.groot.length + materials.verbruik.length;
    const totalMaterialExcl = grootSubtotal + verbruikSubtotal;
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

    type MaterialSourceCategory = 'groot' | 'verbruik';
    type CombinedMaterialItem = MaterialItem & {
        _sourceCategory: MaterialSourceCategory;
        _sourceIndex: number;
        _sourceKey: string;
    };

    const combinedMaterialItems = useMemo<CombinedMaterialItem[]>(() => {
        const grootItems = materials.groot.map((item, index) => ({
            ...item,
            _sourceCategory: 'groot' as const,
            _sourceIndex: index,
            _sourceKey: `groot-${index}`,
        }));
        const verbruikItems = materials.verbruik.map((item, index) => ({
            ...item,
            _sourceCategory: 'verbruik' as const,
            _sourceIndex: index,
            _sourceKey: `verbruik-${index}`,
        }));
        return [...grootItems, ...verbruikItems];
    }, [materials.groot, materials.verbruik]);

    const handleUpdateCombinedItem = (index: number, updates: Partial<MaterialItem>) => {
        const source = combinedMaterialItems[index];
        if (!source) return;
        if (source._sourceCategory === 'groot') {
            void handleUpdateGrootItem(source._sourceIndex, updates);
            return;
        }
        void handleUpdateVerbruiksItem(source._sourceIndex, updates);
    };

    const handleRemoveCombinedItem = (index: number) => {
        const source = combinedMaterialItems[index];
        if (!source) return;
        void handleRemoveItem(source._sourceCategory, source._sourceIndex);
    };
    const handleOpenSingleMaterialPicker = () => {
        setActiveCategory('groot');
    };

    const handleMainTabChange = (nextTab: string) => {
        if (nextTab === 'compare') {
            setActiveTab('materialen');
            void handleCompareLastThreeGrootPrices();
            return;
        }
        setActiveTab(nextTab);
    };

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

    const actieveVoorwaarden = getVoorwaardenByMode(pdfTextSettings, voorwaardenEditorMode);

    const updateVoorwaardenAt = (index: number, value: string) => {
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const next = [...current];
            next[index] = value;
            return withVoorwaardenByMode(prev, voorwaardenEditorMode, next);
        });
    };

    const addVoorwaarde = () => {
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            return withVoorwaardenByMode(prev, voorwaardenEditorMode, [...current, '']);
        });
    };

    const removeVoorwaarde = (index: number) => {
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const next = current.filter((_, i) => i !== index);
            return withVoorwaardenByMode(prev, voorwaardenEditorMode, next.length > 0 ? next : ['']);
        });
    };

    const moveVoorwaarde = (index: number, direction: -1 | 1) => {
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const target = index + direction;
            if (target < 0 || target >= current.length) return prev;
            const next = [...current];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return withVoorwaardenByMode(prev, voorwaardenEditorMode, next);
        });
    };

    const resetPdfTekstenNaarStandaard = () => {
        setPdfTextSettings(defaultQuotePdfTextSettings);
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
            onderVoorbehoud,
            tekstInstellingen: pdfTextSettings,
        };
    };

    // Updated PDF Download Handler
    const downloadBlobWithName = (blob: Blob, fileName: string) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
    };

    const sanitizeFileNamePart = (value: string): string =>
        value
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .slice(0, 80);

    const captureDrawingsForPdf = async (): Promise<string[]> => {
        if (isGeneratingPDF) {
            throw new Error('PDF generatie is al bezig.');
        }

        let resolvedImages: string[] = [];
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

            setPendingPDFAction(() => async (images: string[]) => {
                resolvedImages = images;
                try {
                    pendingPDFPromiseRef.current?.resolve();
                } finally {
                    setIsGeneratingPDF(false);
                    setPendingPDFAction(null);
                }
            });
        });

        return resolvedImages;
    };

    const generateDrawingsOnlyPdf = async (
        drawingImages: string[],
        offerteNummer: string,
        projectTitel: string,
    ): Promise<Blob> => {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 12;

        drawingImages.forEach((imgData, index) => {
            if (index > 0) doc.addPage();

            let y = margin;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(30, 30, 30);
            doc.text('TEKENINGEN', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Offerte #${offerteNummer}`, pageWidth - margin, y, { align: 'right' });

            y += 8;
            doc.setDrawColor(220, 220, 220);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;

            const subTitle = projectTitel || `Tekening ${index + 1}`;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(40, 40, 40);
            doc.text(`${subTitle} (${index + 1}/${drawingImages.length})`, margin, y);
            y += 6;

            const imageProps = doc.getImageProperties(imgData);
            const availableWidth = pageWidth - (margin * 2);
            const availableHeight = pageHeight - y - margin;

            let imageWidth = availableWidth;
            let imageHeight = (imageProps.height * availableWidth) / imageProps.width;
            if (imageHeight > availableHeight) {
                imageHeight = availableHeight;
                imageWidth = (imageProps.width * availableHeight) / imageProps.height;
            }

            const imageX = margin + ((availableWidth - imageWidth) / 2);
            doc.addImage(imgData, 'PNG', imageX, y, imageWidth, imageHeight);
        });

        return doc.output('blob');
    };

    const generateWerkbeschrijvingOnlyPdf = async (
        werkbeschrijvingStappen: string[],
        offerteNummer: string,
        klantNaam: string,
        projectTitel: string,
    ): Promise<Blob> => {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 16;
        let y = margin;

        const addPageIfNeeded = (requiredSpace: number) => {
            if (y + requiredSpace <= pageHeight - margin) return;
            doc.addPage();
            y = margin;
        };

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(25, 25, 25);
        doc.text('WERKBESCHRIJVING', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${offerteNummer}`, pageWidth - margin, y, { align: 'right' });
        y += 7;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        const intro = [
            projectTitel ? `Project: ${projectTitel}` : '',
            klantNaam ? `Klant: ${klantNaam}` : '',
        ].filter(Boolean).join('  |  ');

        if (intro) {
            doc.setFontSize(9);
            doc.setTextColor(90, 90, 90);
            const introLines = doc.splitTextToSize(intro, pageWidth - (margin * 2));
            doc.text(introLines, margin, y);
            y += introLines.length * 4.3 + 5;
        }

        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        const stappen = werkbeschrijvingStappen.length > 0
            ? werkbeschrijvingStappen
            : ['Geen werkbeschrijving beschikbaar.'];

        stappen.forEach((stap, index) => {
            const nummer = `${index + 1}.`;
            const regels = doc.splitTextToSize(stap, pageWidth - (margin * 2) - 10);
            const ruimte = Math.max(6, regels.length * 4.5) + 2;
            addPageIfNeeded(ruimte + 2);

            doc.setFont('helvetica', 'bold');
            doc.text(nummer, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(regels, margin + 8, y);
            y += ruimte;
        });

        return doc.output('blob');
    };

    const handleDownloadPDF = async (attachments?: QuoteAttachmentOptions): Promise<void> => {
        if (attachments) {
            const selectedCount = [attachments.includeOfferte, attachments.includeTekeningen, attachments.includeWerkbeschrijving]
                .filter(Boolean)
                .length;
            if (selectedCount === 0) {
                throw new Error('Selecteer minimaal één PDF om te downloaden.');
            }

            const baseData = preparePDFData();
            const offerteNummer = sanitizeFileNamePart(baseData.offerteNummer || 'CONCEPT');
            const projectTitel = String(baseData.korteTitel || '').trim();
            const klantNaam = String(baseData.klant?.naam || '').trim();

            if (attachments.includeOfferte) {
                const offerteData: PDFQuoteData = {
                    ...baseData,
                    settings: {
                        ...baseData.settings,
                        showTekeningen: false,
                        showFullWerkbeschrijving: false,
                    },
                };
                const offerteBlob = await generateQuotePDF(offerteData);
                downloadBlobWithName(offerteBlob, `Offerte-${offerteNummer}.pdf`);
            }

            if (attachments.includeTekeningen) {
                const images = await captureDrawingsForPdf();
                if (!images || images.length === 0) {
                    throw new Error('Geen tekeningen gevonden om als aparte PDF te versturen.');
                }
                const tekeningenBlob = await generateDrawingsOnlyPdf(images, offerteNummer, projectTitel);
                downloadBlobWithName(tekeningenBlob, `Tekeningen-${offerteNummer}.pdf`);
            }

            if (attachments.includeWerkbeschrijving) {
                const stappen = normalizeWerkbeschrijving(normalizedData?.werkbeschrijving || []);
                const werkbeschrijvingBlob = await generateWerkbeschrijvingOnlyPdf(
                    stappen,
                    offerteNummer,
                    klantNaam,
                    projectTitel,
                );
                downloadBlobWithName(werkbeschrijvingBlob, `Werkbeschrijving-${offerteNummer}.pdf`);
            }

            return;
        }

        if (isGeneratingPDF) return;

        try {
            const images = await captureDrawingsForPdf();
            const data = preparePDFData();
            (data as any).drawingImages = images;
            const pdfBlob = await generateQuotePDF(data);
            const offerteNummer = sanitizeFileNamePart(data.offerteNummer || 'CONCEPT');
            downloadBlobWithName(pdfBlob, `Offerte-${offerteNummer}.pdf`);
        } catch (err) {
            console.error("Error generating PDF:", err);
            const error = err instanceof Error ? err : new Error('Kon PDF niet genereren');
            toast({
                title: 'PDF genereren mislukt',
                description: error.message,
                variant: 'destructive',
            });
        }
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
            onderVoorbehoud,
            tekstInstellingen: pdfTextSettings,
        };
    };

    // Handle PDF settings update with persistence
    const handlePdfSettingsChange = async (newSettings: QuotePDFSettings) => {
        setPdfSettings(newSettings);
        setHasSavedPdfSettings(true);

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

    const storedQuoteTotal = (() => {
        const quoteWithTotal = quote as (Quote & { totaalbedrag?: unknown }) | null;
        const totaalbedrag = quoteWithTotal?.totaalbedrag;
        if (typeof totaalbedrag === 'number' && Number.isFinite(totaalbedrag)) return totaalbedrag;
        const amount = quote?.amount;
        if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
        return null;
    })();

    const hasStoredCalculatedTotal = storedQuoteTotal !== null;
    const calculationInProgress =
        quote?.status === 'in_behandeling' &&
        !calculation?.data_json &&
        !hasStoredCalculatedTotal;
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
            setCalculationElapsedSeconds(Math.min(CALCULATION_STUCK_SECONDS, Math.max(0, elapsedSeconds)));
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
    const isDelayedCalculation =
        calculationInProgress &&
        calculationElapsedSeconds >= CALCULATION_ESTIMATE_SECONDS;
    const isCalculationTimedOut =
        calculationInProgress &&
        calculationElapsedSeconds >= CALCULATION_STUCK_SECONDS;

    const handleRetryCalculation = async () => {
        if (!user || isRetryingCalculation) return;

        setIsRetryingCalculation(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/offerte/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ quoteId: id }),
            });

            const responseText = await response.text().catch(() => '');
            let payload: any = null;
            try {
                payload = responseText ? JSON.parse(responseText) : null;
            } catch {
                payload = null;
            }

            if (!response.ok || (payload && typeof payload === 'object' && payload.ok === false)) {
                const message =
                    payload && typeof payload === 'object'
                        ? payload.message || payload.error
                        : null;
                throw new Error(message || 'Kon calculatie niet opnieuw starten.');
            }

            const restartedAt = Date.now();
            calculationTimerStartedAtRef.current = restartedAt;
            window.localStorage.setItem(calculationTimerStorageKey, String(restartedAt));
            setCalculationElapsedSeconds(0);
            setQuote((prev) => (
                prev
                    ? { ...prev, status: 'in_behandeling', calculationStartedAt: new Date(restartedAt) }
                    : prev
            ));

            toast({
                title: 'Calculatie opnieuw gestart',
                description: 'We proberen de berekening opnieuw uit te voeren.',
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Opnieuw starten mislukt',
                description: err?.message || 'Kon calculatie niet opnieuw starten.',
            });
        } finally {
            setIsRetryingCalculation(false);
        }
    };

    const LoadingPanel = () => (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="flex w-full max-w-sm flex-col items-center gap-3">
                <div className={`font-medium tracking-wide ${isCalculationTimedOut ? 'text-rose-300' : 'text-emerald-400'}`}>
                    {calculationInProgress
                        ? isCalculationTimedOut
                            ? 'ER IS IETS MISGEGAAN'
                            : isDelayedCalculation
                                ? 'Berekening in behandeling'
                                : 'MATERIALEN BEREKENEN'
                        : 'LADEN'}
                </div>
                <div className={`text-sm text-center ${isCalculationTimedOut ? 'text-rose-200' : 'text-muted-foreground animate-pulse'}`}>
                    {calculationInProgress
                        ? isCalculationTimedOut
                            ? 'De berekening duurt langer dan 20 minuten. Probeer de calculatie opnieuw.'
                            : isDelayedCalculation
                                ? 'De berekening duurt momenteel langer dan gemiddeld. We verwerken uw materialen en uren nog.'
                                : 'De AI berekent de benodigde materialen en uren...'
                        : 'Even geduld afrubelen...'}
                </div>
                {calculationInProgress && (
                    isCalculationTimedOut ? (
                        <div className="w-full space-y-3 pt-1">
                            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-200">
                                De berekening is nog niet afgerond na 20 minuten.
                            </div>
                            <Button
                                type="button"
                                onClick={() => { void handleRetryCalculation(); }}
                                disabled={isRetryingCalculation}
                                className="w-full"
                            >
                                {isRetryingCalculation ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Calculatie opnieuw starten...
                                    </>
                                ) : (
                                    'Calculatie opnieuw proberen'
                                )}
                            </Button>
                        </div>
                    ) : (
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
                                {isDelayedCalculation
                                    ? 'U hoeft niets te doen; de resultaten verschijnen automatisch zodra de berekening is afgerond.'
                                    : 'Gemiddelde reken tijd; 5 minuten'}
                            </div>
                        </div>
                    )
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
                                <FileText className="h-5 w-5 text-cyan-400" />
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
                        <Button
                            type="button"
                            variant="success"
                            onClick={() => {
                                void handleDownloadPDF();
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2"
                            disabled={!totals || loading || isGeneratingPDF}
                        >
                            {isGeneratingPDF ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Download size={18} />
                            )}
                            Download
                        </Button>

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
                                    variant="success"
                                    className="flex-1 sm:flex-none gap-2"
                                    onClick={() => setIsSendModalOpen(true)}
                                >
                                    <Mail size={16} /> Versturen
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="mobile-calm mx-auto max-w-7xl p-4 pb-10 sm:p-6">
                {error ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="text-red-400 font-medium">Fout bij laden: {error}</div>
                        <Button asChild variant="secondary">
                            <Link href="/dashboard">Terug naar Dashboard</Link>
                        </Button>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={handleMainTabChange} className="space-y-6">
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
                                <TabsTrigger value="werkbeschrijving" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <ClipboardList size={16} /> Werkbeschrijving
                                </TabsTrigger>
                                <TabsTrigger value="notities" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <MessageSquare size={16} /> Notities
                                </TabsTrigger>
                                <TabsTrigger value="btw-converter" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    <Percent size={16} /> BTW-omrekenen
                                </TabsTrigger>
                                {isDevUser && (
                                    <TabsTrigger
                                        value="compare"
                                        disabled={isComparingGrootPrices}
                                        className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground"
                                    >
                                        {isComparingGrootPrices ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                        Compare
                                    </TabsTrigger>
                                )}
                            </TabsList>

                            {activeTab === 'pdf' && (
                                <Dialog open={isPdfSettingsOpen} onOpenChange={(open) => {
                                    setIsPdfSettingsOpen(open);
                                    if (!open && !hasSavedPdfSettings) {
                                        // User closed dialog without saving - mark as saved with defaults
                                        setHasSavedPdfSettings(true);
                                        handlePdfSettingsChange(pdfSettings);
                                    }
                                }}>
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

                                        {!hasSavedPdfSettings && (
                                            <div className="mx-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                                <p className="text-sm font-medium text-blue-400">👋 Welkom! Stel eerst je PDF voorkeuren in</p>
                                                <p className="text-xs text-blue-400/70 mt-1">Kies welke informatie je op offertes en facturen wilt tonen. Deze instellingen worden onthouden voor volgende offertes.</p>
                                            </div>
                                        )}

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
                                                    <h3 className="font-semibold">Prijsafspraak</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        Bepaal hoe het totaalbedrag in de offerte wordt gepresenteerd.
                                                    </p>
                                                </div>

                                                <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 p-3">
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-foreground">Onder voorbehoud</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            Gebruik richtprijs + nacalculatie en betaling achteraf op factuur.
                                                        </div>
                                                    </div>
                                                    <Switch
                                                        checked={onderVoorbehoud}
                                                        onCheckedChange={setOnderVoorbehoud}
                                                    />
                                                </div>

                                                <p className="text-xs text-muted-foreground">
                                                    Deze instelling wijzigt de tekst en betalingsvoorwaarden in de PDF-preview en in de uiteindelijke offerte.
                                                </p>
                                            </div>

                                            <div className="space-y-4 rounded-lg border border-border p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <h3 className="font-semibold">PDF Teksteditor</h3>
                                                        <p className="text-sm text-muted-foreground">
                                                            Bewerk voorwaarden, afsluiting en ondertekening voor deze offerte.
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-2"
                                                        onClick={resetPdfTekstenNaarStandaard}
                                                    >
                                                        <RotateCcw size={14} />
                                                        Standaard
                                                    </Button>
                                                </div>

                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    <Button
                                                        type="button"
                                                        variant={voorwaardenEditorMode === 'vastePrijs' ? 'default' : 'outline'}
                                                        onClick={() => setVoorwaardenEditorMode('vastePrijs')}
                                                    >
                                                        Voorwaarden vaste prijs
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant={voorwaardenEditorMode === 'onderVoorbehoud' ? 'default' : 'outline'}
                                                        onClick={() => setVoorwaardenEditorMode('onderVoorbehoud')}
                                                    >
                                                        Voorwaarden onder voorbehoud
                                                    </Button>
                                                </div>

                                                <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3">
                                                    <Label>
                                                        {voorwaardenEditorMode === 'vastePrijs'
                                                            ? 'Regels voor vaste prijs'
                                                            : 'Regels voor onder voorbehoud'}
                                                    </Label>
                                                    {actieveVoorwaarden.map((regel, index) => (
                                                        <div key={`${voorwaardenEditorMode}-${index}`} className="flex items-center gap-2">
                                                            <Input
                                                                value={regel}
                                                                onChange={(e) => updateVoorwaardenAt(index, e.target.value)}
                                                                placeholder="Voorwaarde..."
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-9 w-9"
                                                                onClick={() => moveVoorwaarde(index, -1)}
                                                                disabled={index === 0}
                                                            >
                                                                <ArrowUp size={14} />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-9 w-9"
                                                                onClick={() => moveVoorwaarde(index, 1)}
                                                                disabled={index === actieveVoorwaarden.length - 1}
                                                            >
                                                                <ArrowDown size={14} />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-9 w-9 text-red-500 hover:text-red-400"
                                                                onClick={() => removeVoorwaarde(index)}
                                                            >
                                                                <Trash2 size={14} />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    <Button type="button" variant="outline" className="gap-2" onClick={addVoorwaarde}>
                                                        <Plus size={14} />
                                                        Regel toevoegen
                                                    </Button>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="pdfAfsluitingTekst">Afsluitingstekst</Label>
                                                    <textarea
                                                        id="pdfAfsluitingTekst"
                                                        value={pdfTextSettings.afsluitingTekst}
                                                        onChange={(e) =>
                                                            setPdfTextSettings((prev) => ({
                                                                ...prev,
                                                                afsluitingTekst: e.target.value,
                                                            }))
                                                        }
                                                        rows={3}
                                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    />
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="pdfGroetTekst">Groet</Label>
                                                        <Input
                                                            id="pdfGroetTekst"
                                                            value={pdfTextSettings.groetTekst}
                                                            onChange={(e) =>
                                                                setPdfTextSettings((prev) => ({
                                                                    ...prev,
                                                                    groetTekst: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="Bijv. Met vriendelijke groet,"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="pdfOndertekeningNaam">Ondertekening naam</Label>
                                                        <Input
                                                            id="pdfOndertekeningNaam"
                                                            value={pdfTextSettings.ondertekeningNaam}
                                                            onChange={(e) =>
                                                                setPdfTextSettings((prev) => ({
                                                                    ...prev,
                                                                    ondertekeningNaam: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="Leeg = bedrijfsnaam uit profiel"
                                                        />
                                                    </div>
                                                </div>

                                                <p className="text-xs text-muted-foreground">
                                                    Wijzigingen worden automatisch opgeslagen voor deze offerte en direct toegepast in PDF Preview en Download.
                                                </p>
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
                                                                onKeyDown={(e) => {
                                                                    if (['e', 'E', '+', '-'].includes(e.key)) {
                                                                        e.preventDefault();
                                                                    }
                                                                }}
                                                                onPaste={(e) => {
                                                                    if (/[eE+-]/.test(e.clipboardData.getData('text'))) {
                                                                        e.preventDefault();
                                                                    }
                                                                }}
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

                                                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                                    Onder voorbehoud instellen? Gebruik <span className="font-medium text-foreground">PDF Instellingen</span> in de tab <span className="font-medium text-foreground">PDF Preview</span>.
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
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="tekeningen" className="mt-6 space-y-6">
                            {loading ? <LoadingPanel /> : quote && <DrawingsTab quote={quote} />}
                        </TabsContent>

                        {/* Materialen Tab */}
                        <TabsContent value="materialen" className="mt-6 space-y-6 pb-44 sm:pb-32">
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

                                    {materialViewMode === 'single' ? (
                                        <MaterialEditor
                                            title="MATERIALEN LIJST"
                                            items={combinedMaterialItems}
                                            onUpdateItem={handleUpdateCombinedItem}
                                            onRemoveItem={handleRemoveCombinedItem}
                                            subtotal={totalMaterialExcl}
                                            vatRate={quoteSettings?.btwTarief}
                                            showLineTotalInclBtw={false}
                                            viewMode="single"
                                            categoryStyle="neutral"
                                            showAdvancedControlsMenu
                                            onAddClick={handleOpenSingleMaterialPicker}
                                            showDontAutoIncludeOption={false}
                                        />
                                    ) : (
                                        <>
                                            <div className="hidden md:block space-y-4">
                                                <MaterialEditor
                                                    title="GROOTMATERIALEN"
                                                    items={materials.groot}
                                                    onUpdateItem={handleUpdateGrootItem}
                                                    onRemoveItem={(index) => handleRemoveItem('groot', index)}
                                                    onAddItem={(item) => handleAddItem('groot', item)}
                                                    subtotal={grootSubtotal}
                                                    vatRate={quoteSettings?.btwTarief}
                                                    showLineTotalInclBtw={false}
                                                    onAddClick={() => setActiveCategory('groot')}
                                                    enableCalculationViewToggle
                                                    calculationTextFields="hoe_berekend"
                                                    showDontAutoIncludeOption={false}
                                                    viewMode="split"
                                                    categoryStyle="groot"
                                                    showAdvancedControlsMenu
                                                />
                                                <MaterialEditor
                                                    title="VERBRUIKSARTIKELEN"
                                                    items={materials.verbruik}
                                                    onUpdateItem={handleUpdateVerbruiksItem}
                                                    onRemoveItem={(index) => handleRemoveItem('verbruik', index)}
                                                    onAddItem={(item) => handleAddItem('verbruik', item)}
                                                    subtotal={verbruikSubtotal}
                                                    vatRate={quoteSettings?.btwTarief}
                                                    showLineTotalInclBtw={false}
                                                    onAddClick={() => setActiveCategory('verbruik')}
                                                    enableCalculationViewToggle
                                                    calculationTextFields="waarom_dit"
                                                    calculationToggleLabel="Laat toelichting zien"
                                                    calculationRowLabel="Waarom dit"
                                                    showDontAutoIncludeOption
                                                    viewMode="split"
                                                    categoryStyle="verbruik"
                                                    showAdvancedControlsMenu
                                                />
                                            </div>
                                            <div className="md:hidden">
                                                <Accordion
                                                    type="single"
                                                    value={mobileMaterialSection}
                                                    onValueChange={(value) => {
                                                        if (value === 'groot' || value === 'verbruik') {
                                                            setMobileMaterialSection(value);
                                                        }
                                                    }}
                                                    className="space-y-3"
                                                >
                                                    <AccordionItem value="groot" className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
                                                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                                            <div className="flex w-full items-center justify-between gap-2 pr-2">
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                                                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                                                        Grootmaterialen
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
                                                                    <span>{materials.groot.length} regels</span>
                                                                    <span>{formatCurrency(grootSubtotal)}</span>
                                                                </div>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="pb-0">
                                                            <MaterialEditor
                                                                title="GROOTMATERIALEN"
                                                                items={materials.groot}
                                                                onUpdateItem={handleUpdateGrootItem}
                                                                onRemoveItem={(index) => handleRemoveItem('groot', index)}
                                                                onAddItem={(item) => handleAddItem('groot', item)}
                                                                subtotal={grootSubtotal}
                                                                vatRate={quoteSettings?.btwTarief}
                                                                showLineTotalInclBtw={false}
                                                                onAddClick={() => setActiveCategory('groot')}
                                                                enableCalculationViewToggle
                                                                calculationTextFields="hoe_berekend"
                                                                showDontAutoIncludeOption={false}
                                                                viewMode="split"
                                                                categoryStyle="groot"
                                                                showAdvancedControlsMenu
                                                            />
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                    <AccordionItem value="verbruik" className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
                                                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                                            <div className="flex w-full items-center justify-between gap-2 pr-2">
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                                                                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                                                        Verbruiksmaterialen
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
                                                                    <span>{materials.verbruik.length} regels</span>
                                                                    <span>{formatCurrency(verbruikSubtotal)}</span>
                                                                </div>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="pb-0">
                                                            <MaterialEditor
                                                                title="VERBRUIKSARTIKELEN"
                                                                items={materials.verbruik}
                                                                onUpdateItem={handleUpdateVerbruiksItem}
                                                                onRemoveItem={(index) => handleRemoveItem('verbruik', index)}
                                                                onAddItem={(item) => handleAddItem('verbruik', item)}
                                                                subtotal={verbruikSubtotal}
                                                                vatRate={quoteSettings?.btwTarief}
                                                                showLineTotalInclBtw={false}
                                                                onAddClick={() => setActiveCategory('verbruik')}
                                                                enableCalculationViewToggle
                                                                calculationTextFields="waarom_dit"
                                                                calculationToggleLabel="Laat toelichting zien"
                                                                calculationRowLabel="Waarom dit"
                                                                showDontAutoIncludeOption
                                                                viewMode="split"
                                                                categoryStyle="verbruik"
                                                                showAdvancedControlsMenu
                                                            />
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            </div>
                                        </>
                                    )}

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

                        <TabsContent value="werkbeschrijving" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <WorkDescriptionCard werkbeschrijving={normalizedData?.werkbeschrijving || []} />
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

                        <TabsContent value="btw-converter" className="mt-6">
                            <div className="bg-card rounded-lg border border-border p-6 space-y-6">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-semibold text-foreground">BTW-omrekenen</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Reken automatisch van excl. naar incl. BTW of andersom.
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="btw-percentage">BTW-percentage</Label>
                                        <div className="relative">
                                            <Input
                                                id="btw-percentage"
                                                value={btwConverterRateInput}
                                                onChange={(e) => setBtwConverterRateInput(e.target.value)}
                                                inputMode="decimal"
                                                placeholder="21"
                                                className="pr-8"
                                            />
                                            <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Standaard: 21%
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="btw-excl">Bedrag excl. BTW (€)</Label>
                                        <Input
                                            id="btw-excl"
                                            value={btwConverterExclInput}
                                            onChange={(e) => handleBtwExclChange(e.target.value)}
                                            inputMode="decimal"
                                            placeholder="0,00"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="btw-incl">Bedrag incl. BTW (€)</Label>
                                        <Input
                                            id="btw-incl"
                                            value={btwConverterInclInput}
                                            onChange={(e) => handleBtwInclChange(e.target.value)}
                                            inputMode="decimal"
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-md border border-border bg-muted/20 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        Actief tarief: <span className="font-medium text-foreground">{normalizedBtwConverterRate.toLocaleString('nl-NL')}%</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        BTW-bedrag:{' '}
                                        <span className="font-semibold text-foreground">
                                            {converterBtwAmount === null ? '—' : formatCurrency(converterBtwAmount)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setBtwConverterRateInput('21');
                                            setBtwConverterExclInput('');
                                            setBtwConverterInclInput('');
                                            setBtwConverterLastEdited(null);
                                        }}
                                    >
                                        Opnieuw instellen
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>

                        {activeTab === 'materialen' && !!calculation?.data_json && (
                            <div className="quote-materials-sticky-footer mobile-calm-pane fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm">
                                <div className="mx-auto max-w-7xl px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6">
                                    <div className="mobile-calm-card rounded-xl border border-border/70 bg-card/90 px-4 py-2 shadow-lg">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                                                    <Package size={14} />
                                                </div>
                                                <h3 className="font-semibold text-foreground tracking-tight text-xs uppercase whitespace-nowrap">
                                                    Totaal materialen
                                                </h3>
                                            </div>
                                            <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <span className="text-[11px] uppercase text-zinc-400 font-medium">
                                                        Totaal (excl. btw)
                                                    </span>
                                                    <span className="text-primary font-bold tracking-tight">
                                                        {formatCurrency(totalMaterialExcl)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <span className="text-[11px] uppercase text-zinc-400 font-medium">
                                                        Totaal (incl. btw)
                                                    </span>
                                                    <span className="text-primary font-bold tracking-tight">
                                                        {formatCurrency(totalMaterialExcl * (1 + (quoteSettings?.btwTarief || 21) / 100))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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
