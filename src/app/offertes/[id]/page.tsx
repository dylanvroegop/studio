'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuoteData } from '@/hooks/useQuoteData';
import {
    calculateQuoteTotals,
    QuoteSettings as QuoteCalculationSettings,
    KlantInformatie,
    formatCurrency,
    MaterialItem,
    generateWorkSummary,
    normalizeWerkbeschrijving,
    normalizeDataJson,
    unwrapRoot,
    toStructuredWorkDescription,
    flattenStructuredWorkDescription,
    type WorkDescriptionStructured,
} from '@/lib/quote-calculations';
import { ClientInfoCard } from '@/components/quote/ClientInfoCard';
import { CostSummaryCard } from '@/components/quote/CostSummaryCard';
import { MaterialEditor } from '@/components/quote/MaterialEditor';
import { LaborBreakdown } from '@/components/quote/LaborBreakdown';
import { NacalculatieTab } from '@/components/quote/NacalculatieTab';
import { PDFPreview } from '@/components/quote/PDFPreview';
import { QuoteSettings, QuotePDFSettings, defaultQuotePDFSettings, sanitizeQuotePDFSettings } from '@/components/quote/QuoteSettings';
import { generateQuotePDF, PDFQuoteData } from '@/lib/generate-quote-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Euro, Package, Clock, FileText, MessageSquare, MessageCircle, Download, Mail, Settings, PenTool, CalendarDays, ReceiptText, Loader2, AlertCircle, Save, Box, ChevronDown, ChevronRight, Sparkles, Search, ClipboardList, Plus, Trash2, ArrowUp, ArrowDown, Share2, Upload, Maximize2, X, Navigation, Camera, ImageIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Link from "next/link";
import { SendQuoteModal, type QuoteAttachmentOptions } from '@/components/quote/SendQuoteModal';
import { SendQuoteWhatsAppModal } from '@/components/quote/SendQuoteWhatsAppModal';
import { DrawingsTab } from '@/components/quote/DrawingsTab';
import { MaterialListExportDialog } from '@/components/quote/MaterialListExportDialog';
import { WorkDescriptionWorkspace } from '@/components/quote/work-description/WorkDescriptionWorkspace';
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { HiddenPDFDrawings } from '@/components/quote/HiddenPDFDrawings';
import { AppNavigation } from '@/components/AppNavigation';
import { LogoUpload } from '@/components/settings/LogoUpload';
import { findExistingVoorschotInvoiceId } from '@/lib/invoice-actions';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn, parsePriceToNumber } from '@/lib/utils';
import { buildAddressString, buildGoogleMapsDirectionsUrl, hasMinimalAddress } from '@/lib/maps';
import { reportOperationalError } from '@/lib/report-operational-error';
import {
    defaultQuotePdfTextSettings,
    sanitizeQuotePdfTextSettings,
    type QuotePdfTextSettings,
} from '@/lib/quote-pdf-text-settings';
import { cloneTemplateSections, findWorkDescriptionTemplate } from '@/lib/work-description/templates';

import { Quote, ReceiptAttachment, QuotePhotoAttachment } from "@/lib/types";
import type { MaterialListExportItem, MaterialListExportMeta } from '@/lib/material-list-export';
import type { LeverancierContact } from '@/lib/types-settings';
import { normalizeLeverancierContactList, pickDefaultLeverancierId } from '@/lib/types-settings';
import { buildReceiptDownloadFileName } from '@/lib/receipt-file-naming';

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

function getRodeVoorwaardenByMode(
    settings: QuotePdfTextSettings,
    mode: VoorwaardenEditorMode,
): number[] {
    return mode === 'vastePrijs'
        ? settings.voorwaardenVastePrijsRodeRegels || []
        : settings.voorwaardenOnderVoorbehoudRodeRegels || [];
}

function withRodeVoorwaardenByMode(
    settings: QuotePdfTextSettings,
    mode: VoorwaardenEditorMode,
    indexes: number[],
): QuotePdfTextSettings {
    if (mode === 'vastePrijs') {
        return { ...settings, voorwaardenVastePrijsRodeRegels: indexes };
    }
    return { ...settings, voorwaardenOnderVoorbehoudRodeRegels: indexes };
}

const CALCULATION_ESTIMATE_SECONDS = 300;
const CALCULATION_STUCK_SECONDS = 20 * 60;
const WORK_DESCRIPTION_AUTOSAVE_DEBOUNCE_MS = 3500;
const WORK_DESCRIPTION_SAVING_INDICATOR_DELAY_MS = 900;

function truncatePromptText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLength
        ? `${normalized.slice(0, maxLength).trim()}...`
        : normalized;
}

interface QuoteNoteSection {
    id: string;
    title: string;
    notes: string;
}

function createQuoteNoteSectionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `quote-note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createQuoteNoteSection(index: number, overrides?: Partial<QuoteNoteSection>): QuoteNoteSection {
    return {
        id: overrides?.id || createQuoteNoteSectionId(),
        title: overrides?.title ?? `Klus ${index + 1}`,
        notes: overrides?.notes ?? '',
    };
}

function parseQuoteNotesToSections(rawValue: string): QuoteNoteSection[] {
    const normalized = rawValue.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return [createQuoteNoteSection(0)];
    }

    const lines = normalized.split('\n');
    const sections: Array<{ title: string; notesLines: string[] }> = [];
    let activeSection: { title: string; notesLines: string[] } | null = null;

    for (const line of lines) {
        const titleMatch = line.match(/^###\s+(.+)$/);
        if (titleMatch) {
            const title = titleMatch[1].trim() || `Klus ${sections.length + 1}`;
            activeSection = { title, notesLines: [] };
            sections.push(activeSection);
            continue;
        }

        if (!activeSection) {
            activeSection = { title: 'Klus 1', notesLines: [] };
            sections.push(activeSection);
        }

        activeSection.notesLines.push(line);
    }

    const mapped = sections.map((section, index) =>
        createQuoteNoteSection(index, {
            title: section.title,
            notes: section.notesLines.join('\n').trim(),
        }),
    );

    return mapped.length > 0 ? mapped : [createQuoteNoteSection(0)];
}

function serializeQuoteNoteSections(sections: QuoteNoteSection[]): string {
    const cleanedSections = sections
        .map((section, index) => ({
            title: section.title.trim() || `Klus ${index + 1}`,
            notes: section.notes.trim(),
        }))
        .filter((section) => section.title.length > 0 || section.notes.length > 0);

    if (cleanedSections.length === 0) return '';

    return cleanedSections
        .map((section) => (
            section.notes
                ? `### ${section.title}\n${section.notes}`
                : `### ${section.title}`
        ))
        .join('\n\n');
}

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

function isAllowedReceiptMimeType(mimeType: string): boolean {
    return [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
    ].includes(mimeType);
}

function isAllowedPhotoMimeType(mimeType: string): boolean {
    if (!mimeType) return false;
    if (mimeType.startsWith('image/')) return true;
    return ['image/heic', 'image/heif'].includes(mimeType.toLowerCase());
}

function parseReceiptCreatedAt(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
        const parsed = (value as { toDate: () => Date }).toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

export default function QuotePage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { toast } = useToast();

    // Fetch calculation data from Supabase
    const { calculation, loading: calculationLoading, error: calculationError, updateDataJson } = useQuoteData(id);

    // Normalize calculation data once per payload to keep downstream effects stable.
    const normalizedData = useMemo(
        () => (calculation?.data_json ? normalizeDataJson(calculation.data_json) : null),
        [calculation?.data_json],
    );

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
    const [algemeneVoorwaardenTitel, setAlgemeneVoorwaardenTitel] = useState('ALGEMENE VOORWAARDEN');
    const [algemeneVoorwaardenTekst, setAlgemeneVoorwaardenTekst] = useState('');
    const [algemeneVoorwaardenPdfUrl, setAlgemeneVoorwaardenPdfUrl] = useState('');
    const [algemeneVoorwaardenPdfBestandsnaam, setAlgemeneVoorwaardenPdfBestandsnaam] = useState('');
    const [isUploadingAlgemeneVoorwaardenPdf, setIsUploadingAlgemeneVoorwaardenPdf] = useState(false);
    const algemeneVoorwaardenInputRef = useRef<HTMLInputElement | null>(null);
    const algemeneVoorwaardenModalInputRef = useRef<HTMLInputElement | null>(null);
    const receiptInputRef = useRef<HTMLInputElement | null>(null);
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const photoCameraInputRef = useRef<HTMLInputElement | null>(null);
    const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
    const [receiptActionId, setReceiptActionId] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [photoActionId, setPhotoActionId] = useState<string | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<QuotePhotoAttachment | null>(null);
    const hasEditedPdfTextSettingsRef = useRef(false);
    const facturatieSyncInitializedRef = useRef(false);
    const facturatieHydratingRef = useRef(false);
    const lastSavedFacturatiePayloadRef = useRef('');
    const lastHydratedFacturatieSourceRef = useRef('');
    const [voorwaardenEditorMode, setVoorwaardenEditorMode] = useState<VoorwaardenEditorMode>('onderVoorbehoud');
    const [activeTab, setActiveTab] = useState('materialen');
    const [workDescriptionMode, setWorkDescriptionMode] = useState<'edit' | 'preview'>('edit');
    const [workDescriptionStructured, setWorkDescriptionStructured] = useState<WorkDescriptionStructured>(() => toStructuredWorkDescription(null));
    const [isGeneratingWorkDescription, setIsGeneratingWorkDescription] = useState(false);
    const [isGeneratingDistanceDev, setIsGeneratingDistanceDev] = useState(false);
    const [isAutoSavingWorkDescription, setIsAutoSavingWorkDescription] = useState(false);
    const autoDistanceAttemptedRef = useRef<Set<string>>(new Set());
    const lastSyncedWerkbeschrijvingRef = useRef<string>('');
    const autoSaveWerkbeschrijvingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const workDescriptionLastEditAtRef = useRef<number>(0);
    const workDescriptionDirtyRef = useRef<boolean>(false);
    const templateAutoAppliedRef = useRef(false);
    const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);
    const [isPdfFocusMode, setIsPdfFocusMode] = useState(false);
    const [hasSavedPdfSettings, setHasSavedPdfSettings] = useState(true); // assume true until proven otherwise
    const [isSavingPdfSettings, setIsSavingPdfSettings] = useState(false);
    const [pdfSettingsSavedAt, setPdfSettingsSavedAt] = useState<number | null>(null);
    const pdfSettingsShownOnceRef = useRef(false);
    const [quoteNotes, setQuoteNotes] = useState('');
    const [quoteNoteSections, setQuoteNoteSections] = useState<QuoteNoteSection[]>(() => [createQuoteNoteSection(0)]);
    const [isAutoSavingQuoteNotes, setIsAutoSavingQuoteNotes] = useState(false);
    const [quoteNotesSavedAt, setQuoteNotesSavedAt] = useState<Date | null>(null);
    const quoteNotesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedQuoteNotesRef = useRef('');
    const lastSerializedQuoteNoteSectionsRef = useRef('');
    const quoteNotesLastEditAtRef = useRef<number>(0);
    const quoteNotesDirtyRef = useRef<boolean>(false);

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
    const lastSyncedQuoteTotalRef = useRef<number | null>(null);

    // Refresh captured drawings when entering the PDF tab.
    // Avoid depending on calculation data object references, which can cause
    // unnecessary resets/re-mounts and repeated PDF preview refreshes.
    useEffect(() => {
        if (activeTab !== 'pdf') return;
        setCapturedDrawings([]);
        setIsDrawingsReady(false);
    }, [activeTab, quote?.id]);

    // Auto-open PDF settings for first-time users when they navigate to the PDF tab
    useEffect(() => {
        if (activeTab !== 'pdf') return;
        if (hasSavedPdfSettings) return;
        if (pdfSettingsShownOnceRef.current) return;
        if (firebaseLoading) return;
        pdfSettingsShownOnceRef.current = true;
        setIsPdfSettingsOpen(true);
    }, [activeTab, hasSavedPdfSettings, firebaseLoading]);

    useEffect(() => {
        if (!isPdfFocusMode) return;
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [isPdfFocusMode]);

    useEffect(() => {
        return () => {
            if (quoteNotesSaveTimerRef.current) {
                clearTimeout(quoteNotesSaveTimerRef.current);
                quoteNotesSaveTimerRef.current = null;
            }
        };
    }, []);

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
    const [confirmResetToNieuwOpen, setConfirmResetToNieuwOpen] = useState(false);
    const [isMaterialExportOpen, setIsMaterialExportOpen] = useState(false);
    const [materialSuppliers, setMaterialSuppliers] = useState<LeverancierContact[]>([]);
    const [defaultMaterialSupplierId, setDefaultMaterialSupplierId] = useState('');
    const [materialEmailTemplate, setMaterialEmailTemplate] = useState('');
    const [isSavingMaterialPackage, setIsSavingMaterialPackage] = useState(false);

    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
    const [isMobileMoreActionsOpen, setIsMobileMoreActionsOpen] = useState(false);
    const [isMobileMoreSectionsOpen, setIsMobileMoreSectionsOpen] = useState(false);
    const [isPlanningTypeDialogOpen, setIsPlanningTypeDialogOpen] = useState(false);
    const [voorschotIngeschakeld, setVoorschotIngeschakeld] = useState(true);
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
                        const leveranciers = normalizeLeverancierContactList(settings.leveranciers);
                        const defaultLeverancierId = pickDefaultLeverancierId(settings.defaultLeverancierId, leveranciers);
                        const savedMaterialEmailTemplate = String(settings.materialListEmailTemplate || '').trim();
                        setMaterialSuppliers(leveranciers);
                        setDefaultMaterialSupplierId(defaultLeverancierId);
                        setMaterialEmailTemplate(savedMaterialEmailTemplate);

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
                            setPdfSettings(sanitizeQuotePDFSettings(data.defaultPdfSettings));
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
        templateAutoAppliedRef.current = false;
        facturatieSyncInitializedRef.current = false;
        facturatieHydratingRef.current = false;
        lastSavedFacturatiePayloadRef.current = '';
        lastHydratedFacturatieSourceRef.current = '';
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

    useEffect(() => {
        if (activeTab === 'pdf') return;
        if (isPdfFocusMode) {
            setIsPdfFocusMode(false);
        }
    }, [activeTab, isPdfFocusMode]);

    // Init & sync facturatie instellingen (voorschot) vanuit quote
    useEffect(() => {
        if (!quote) return;
        const sourceSignature = JSON.stringify({
            quoteFacturatie: (quote as any)?.facturatie ?? null,
            quotePdfTeksten: (quote as any)?.pdfTeksten ?? null,
            quoteAlgemeneVoorwaarden: (quote as any)?.algemeneVoorwaarden ?? null,
            userDefaultPdfTeksten: (userProfile as any)?.defaultPdfTeksten ?? null,
            userDefaultAlgemeneVoorwaarden: (userProfile as any)?.defaultAlgemeneVoorwaarden ?? null,
        });
        if (sourceSignature === lastHydratedFacturatieSourceRef.current) return;
        lastHydratedFacturatieSourceRef.current = sourceSignature;

        facturatieHydratingRef.current = true;

        const f = (quote as any)?.facturatie;
        const nextVoorschotIngeschakeld =
            f && typeof f === 'object' && typeof f.voorschotIngeschakeld === 'boolean'
                ? f.voorschotIngeschakeld
                : true;
        const nextVoorschotPercentage =
            f && typeof f === 'object' && typeof f.voorschotPercentage === 'number' && Number.isFinite(f.voorschotPercentage)
                ? f.voorschotPercentage
                : 50;
        const nextOnderVoorbehoud =
            f && typeof f === 'object' && f.onderVoorbehoud !== undefined
                ? !!f.onderVoorbehoud
                : false;

        setVoorschotIngeschakeld((prev) => (prev === nextVoorschotIngeschakeld ? prev : nextVoorschotIngeschakeld));
        setVoorschotPercentage((prev) => (prev === nextVoorschotPercentage ? prev : nextVoorschotPercentage));
        setOnderVoorbehoud((prev) => (prev === nextOnderVoorbehoud ? prev : nextOnderVoorbehoud));

        const quotePdfTeksten = (quote as any)?.pdfTeksten;
        const userDefaultPdfTeksten = (userProfile as any)?.defaultPdfTeksten;
        const nextPdfTextSettings = sanitizeQuotePdfTextSettings(quotePdfTeksten ?? userDefaultPdfTeksten);
        setPdfTextSettings((prev) => {
            const prevSig = JSON.stringify(prev);
            const nextSig = JSON.stringify(nextPdfTextSettings);
            return prevSig === nextSig ? prev : nextPdfTextSettings;
        });
        hasEditedPdfTextSettingsRef.current = false;

        const quoteAlgemeneVoorwaarden = (quote as any)?.algemeneVoorwaarden;
        const userDefaultAlgemeneVoorwaarden = (userProfile as any)?.defaultAlgemeneVoorwaarden;
        const resolvedVoorwaarden =
            quoteAlgemeneVoorwaarden && typeof quoteAlgemeneVoorwaarden === 'object'
                ? quoteAlgemeneVoorwaarden
                : userDefaultAlgemeneVoorwaarden && typeof userDefaultAlgemeneVoorwaarden === 'object'
                    ? userDefaultAlgemeneVoorwaarden
                    : null;

        const nextAvTitel = String(resolvedVoorwaarden?.titel || 'ALGEMENE VOORWAARDEN');
        const nextAvTekst = String(resolvedVoorwaarden?.tekst || '');
        const nextAvPdfUrl = String(resolvedVoorwaarden?.pdfUrl || '');
        const nextAvBestandsnaam = String(resolvedVoorwaarden?.pdfBestandsnaam || '');

        setAlgemeneVoorwaardenTitel((prev) => (prev === nextAvTitel ? prev : nextAvTitel));
        setAlgemeneVoorwaardenTekst((prev) => (prev === nextAvTekst ? prev : nextAvTekst));
        setAlgemeneVoorwaardenPdfUrl((prev) => (prev === nextAvPdfUrl ? prev : nextAvPdfUrl));
        setAlgemeneVoorwaardenPdfBestandsnaam((prev) => (prev === nextAvBestandsnaam ? prev : nextAvBestandsnaam));

        lastSavedFacturatiePayloadRef.current = JSON.stringify({
            facturatie: {
                voorschotIngeschakeld: nextVoorschotIngeschakeld,
                voorschotPercentage: nextVoorschotPercentage,
                onderVoorbehoud: nextOnderVoorbehoud,
            },
            pdfTeksten: nextPdfTextSettings,
            algemeneVoorwaarden: {
                titel: nextAvTitel,
                tekst: nextAvTekst,
                pdfUrl: nextAvPdfUrl,
                pdfBestandsnaam: nextAvBestandsnaam,
            },
        });
        facturatieSyncInitializedRef.current = true;
        const hydrationTimer = window.setTimeout(() => {
            facturatieHydratingRef.current = false;
        }, 0);
        return () => window.clearTimeout(hydrationTimer);
    }, [quote, userProfile]);

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
        if (!facturatieSyncInitializedRef.current) return;
        if (facturatieHydratingRef.current) return;
        const payloadSignature = JSON.stringify({
            facturatie: {
                voorschotIngeschakeld,
                voorschotPercentage,
                onderVoorbehoud,
            },
            pdfTeksten: pdfTextSettings,
            algemeneVoorwaarden: {
                titel: algemeneVoorwaardenTitel,
                tekst: algemeneVoorwaardenTekst,
                pdfUrl: algemeneVoorwaardenPdfUrl,
                pdfBestandsnaam: algemeneVoorwaardenPdfBestandsnaam,
            },
        });
        if (payloadSignature === lastSavedFacturatiePayloadRef.current) return;
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
                    algemeneVoorwaarden: {
                        titel: algemeneVoorwaardenTitel,
                        tekst: algemeneVoorwaardenTekst,
                        pdfUrl: algemeneVoorwaardenPdfUrl,
                        pdfBestandsnaam: algemeneVoorwaardenPdfBestandsnaam,
                    },
                    updatedAt: new Date(),
                });
                lastSavedFacturatiePayloadRef.current = payloadSignature;

                if (hasEditedPdfTextSettingsRef.current) {
                    const userRef = doc(firestore, 'users', user.uid);
                    await setDoc(
                        userRef,
                        {
                            defaultPdfTeksten: pdfTextSettings,
                            defaultAlgemeneVoorwaarden: {
                                titel: algemeneVoorwaardenTitel,
                                tekst: algemeneVoorwaardenTekst,
                                pdfUrl: algemeneVoorwaardenPdfUrl,
                                pdfBestandsnaam: algemeneVoorwaardenPdfBestandsnaam,
                            },
                        },
                        { merge: true }
                    );
                    hasEditedPdfTextSettingsRef.current = false;
                }
            } catch (e) {
                console.error('Fout bij opslaan facturatie:', e);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [
        voorschotIngeschakeld,
        voorschotPercentage,
        onderVoorbehoud,
        pdfTextSettings,
        algemeneVoorwaardenTitel,
        algemeneVoorwaardenTekst,
        algemeneVoorwaardenPdfUrl,
        algemeneVoorwaardenPdfBestandsnaam,
        user,
        firestore,
        id,
    ]);

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

            // 1. Materials
            setMaterials({
                groot: nextGroot,
                verbruik: nextVerbruik,
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
                    const hasExistingClientData = !!(
                        (prev?.bedrijfsnaam && String(prev.bedrijfsnaam).trim()) ||
                        (prev?.voornaam && String(prev.voornaam).trim()) ||
                        (prev?.achternaam && String(prev.achternaam).trim()) ||
                        (prev?.emailadres && String(prev.emailadres).trim()) ||
                        (prev?.telefoonnummer && String(prev.telefoonnummer).trim())
                    );
                    if (hasExistingClientData) return prev;

                    const ki = quoteData.klantinformatie || {};
                    const factuur = ki.factuuradres || {};
                    return {
                        klanttype: ki.klanttype || 'Particulier',
                        voornaam: ki.voornaam || '',
                        achternaam: ki.achternaam || '',
                        bedrijfsnaam: ki.bedrijfsnaam,
                        emailadres: ki.emailadres || ki['e-mailadres'] || '',
                        telefoonnummer: ki.telefoonnummer || '',
                        straat: ki.straat || factuur.straat || '',
                        huisnummer: ((ki.huisnummer || factuur.huisnummer || '') + ((ki.toevoeging || factuur.toevoeging) ? ` ${ki.toevoeging || factuur.toevoeging}` : '')).trim(),
                        postcode: ki.postcode || factuur.postcode || '',
                        plaats: ki.plaats || factuur.plaats || '',
                        afwijkendProjectadres: ki.afwijkendProjectadres || false,
                        projectAdres: (ki.projectAdres || ki.projectadres) ? {
                            straat: (ki.projectAdres?.straat || ki.projectadres?.straat || ''),
                            huisnummer: ((ki.projectAdres?.huisnummer || ki.projectadres?.huisnummer || '') + ((ki.projectAdres?.toevoeging || ki.projectadres?.toevoeging) ? ` ${ki.projectAdres?.toevoeging || ki.projectadres?.toevoeging}` : '')).trim(),
                            postcode: ki.projectAdres?.postcode || ki.projectadres?.postcode || '',
                            plaats: ki.projectAdres?.plaats || ki.projectadres?.plaats || ''
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

    const handleQuoteNotesChange = useCallback((value: string) => {
        quoteNotesDirtyRef.current = true;
        quoteNotesLastEditAtRef.current = Date.now();
        setQuoteNotes(value);
    }, []);

    const syncQuoteNoteSectionsToQuoteNotes = useCallback((nextSections: QuoteNoteSection[]) => {
        const serialized = serializeQuoteNoteSections(nextSections);
        lastSerializedQuoteNoteSectionsRef.current = serialized;
        setQuoteNoteSections(nextSections);
        handleQuoteNotesChange(serialized);
    }, [handleQuoteNotesChange]);

    const handleQuoteNoteSectionChange = useCallback((sectionId: string, field: 'title' | 'notes', value: string) => {
        const nextSections = quoteNoteSections.map((section) => (
            section.id === sectionId
                ? { ...section, [field]: value }
                : section
        ));
        syncQuoteNoteSectionsToQuoteNotes(nextSections);
    }, [quoteNoteSections, syncQuoteNoteSectionsToQuoteNotes]);

    const handleAddQuoteNoteSection = useCallback(() => {
        const nextSections = [...quoteNoteSections, createQuoteNoteSection(quoteNoteSections.length)];
        syncQuoteNoteSectionsToQuoteNotes(nextSections);
    }, [quoteNoteSections, syncQuoteNoteSectionsToQuoteNotes]);

    const handleRemoveQuoteNoteSection = useCallback((sectionId: string) => {
        if (quoteNoteSections.length <= 1) {
            const resetSection = {
                ...quoteNoteSections[0],
                title: 'Klus 1',
                notes: '',
            };
            syncQuoteNoteSectionsToQuoteNotes([resetSection]);
            return;
        }

        const nextSections = quoteNoteSections.filter((section) => section.id !== sectionId);
        syncQuoteNoteSectionsToQuoteNotes(nextSections);
    }, [quoteNoteSections, syncQuoteNoteSectionsToQuoteNotes]);

    useEffect(() => {
        if (quoteNotes === lastSerializedQuoteNoteSectionsRef.current) return;

        const parsedSections = parseQuoteNotesToSections(quoteNotes);
        setQuoteNoteSections(parsedSections);
        lastSerializedQuoteNoteSectionsRef.current = quoteNotes;
    }, [quoteNotes]);

    useEffect(() => {
        if (!quote) return;

        const rawNotes = (quote as any)?.notities;
        const nextNotes = typeof rawNotes === 'string' ? rawNotes : '';
        const hasUnsavedLocalNotes = quoteNotesDirtyRef.current && quoteNotes !== lastSyncedQuoteNotesRef.current;

        if (hasUnsavedLocalNotes) {
            return;
        }

        if (nextNotes !== quoteNotes) {
            setQuoteNotes(nextNotes);
        }
        lastSyncedQuoteNotesRef.current = nextNotes;
    }, [quote, quoteNotes]);

    useEffect(() => {
        if (!firestore || !id || firebaseLoading) return;
        if (quoteNotes === lastSyncedQuoteNotesRef.current) return;

        if (quoteNotesSaveTimerRef.current) {
            clearTimeout(quoteNotesSaveTimerRef.current);
        }

        quoteNotesSaveTimerRef.current = setTimeout(async () => {
            const saveStartedAt = Date.now();
            setIsAutoSavingQuoteNotes(true);
            try {
                await updateDoc(doc(firestore, 'quotes', id), {
                    notities: quoteNotes,
                    updatedAt: serverTimestamp(),
                } as any);
                lastSyncedQuoteNotesRef.current = quoteNotes;
                if (quoteNotesLastEditAtRef.current <= saveStartedAt) {
                    quoteNotesDirtyRef.current = false;
                }
                setQuote((prev) => (prev ? ({ ...prev, notities: quoteNotes } as any) : prev));
                setQuoteNotesSavedAt(new Date());
            } catch (error) {
                console.error('Error auto-saving quote notes:', error);
                toast({
                    variant: 'destructive',
                    title: 'Notities opslaan mislukt',
                    description: 'Probeer het opnieuw.',
                });
            } finally {
                setIsAutoSavingQuoteNotes(false);
            }
        }, 500);

        return () => {
            if (quoteNotesSaveTimerRef.current) {
                clearTimeout(quoteNotesSaveTimerRef.current);
                quoteNotesSaveTimerRef.current = null;
            }
        };
    }, [quoteNotes, firestore, id, firebaseLoading, toast]);

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

            // Immediate sync for overzicht page so amount updates without waiting for debounced totals effect.
            if (firestore && id) {
                await updateDoc(doc(firestore, 'quotes', id), {
                    totaalbedrag: 0,
                    amount: 0,
                    updatedAt: serverTimestamp(),
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

    const handleRequestResetMaterialPackageToNieuw = () => {
        setConfirmResetToNieuwOpen(true);
    };

    const handleSelectMaterialPackageFromPicker = (packageId: string) => {
        if (packageId === 'NIEUW') {
            handleRequestResetMaterialPackageToNieuw();
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

    const roundMoney = (value: number): number => Number((value || 0).toFixed(2));

    const applyMaterialTargetWithAdjustment = async (
        category: 'groot' | 'verbruik',
        targetSubtotal: number,
    ) => {
        if (!calculation) return;
        const safeTarget = roundMoney(Math.max(0, targetSubtotal));
        const currentList = category === 'groot' ? materials.groot : materials.verbruik;
        const currentSubtotal = roundMoney(
            currentList.reduce((sum, item) => sum + (Number(item.prijs_per_stuk) || 0) * (Number(item.aantal) || 0), 0),
        );
        const delta = roundMoney(safeTarget - currentSubtotal);
        if (Math.abs(delta) < 0.01) return;

        const adjustmentIndex = currentList.findIndex((item) => {
            const name = String(item.product || '').trim().toLowerCase();
            return name === 'extra kosten';
        });

        let nextList: MaterialItem[];
        if (adjustmentIndex >= 0) {
            const existing = currentList[adjustmentIndex];
            const nextPrice = roundMoney((Number(existing.prijs_per_stuk) || 0) + delta);
            if (Math.abs(nextPrice) < 0.01) {
                nextList = currentList.filter((_, index) => index !== adjustmentIndex);
            } else {
                nextList = currentList.map((item, index) =>
                    index === adjustmentIndex
                        ? { ...item, aantal: 1, eenheid: item.eenheid || 'stuk', prijs_per_stuk: nextPrice }
                        : item,
                );
            }
        } else {
            nextList = [
                ...currentList,
                {
                    product: 'Extra kosten',
                    aantal: 1,
                    prijs_per_stuk: delta,
                    eenheid: 'stuk',
                },
            ];
        }

        hasEditedMaterialsRef.current = true;
        setSelectedMaterialPackageId('NIEUW');
        isUpdatingRef.current = true;

        try {
            const nextMaterials = category === 'groot'
                ? { groot: nextList, verbruik: materials.verbruik }
                : { groot: materials.groot, verbruik: nextList };

            setMaterials(nextMaterials);

            const root = unwrapRoot(calculation.data_json);
            await updateDataJson({
                ...root,
                grootmaterialen: nextMaterials.groot,
                verbruiksartikelen: nextMaterials.verbruik,
            });

            toast({
                title: 'Kosten aangepast',
                description: 'Verschil toegevoegd als "Extra kosten".',
            });
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleUpdateMaterialenGrootTotal = async (value: number) => {
        await applyMaterialTargetWithAdjustment('groot', value);
    };

    const handleUpdateMaterialenVerbruikTotal = async (value: number) => {
        await applyMaterialTargetWithAdjustment('verbruik', value);
    };

    const handleUpdateMaterialenSubtotal = async (value: number) => {
        const safeTarget = roundMoney(Math.max(0, value));
        const currentSubtotal = roundMoney(grootSubtotal + verbruikSubtotal);
        const delta = roundMoney(safeTarget - currentSubtotal);
        if (Math.abs(delta) < 0.01) return;
        await applyMaterialTargetWithAdjustment('groot', roundMoney(grootSubtotal + delta));
    };

    const handleUpdateWinstMargePercentage = async (percentage: number) => {
        if (!quoteSettings) return;
        const safePercentage = Math.max(0, Number(percentage) || 0);
        await handleUpdateSettings({
            ...quoteSettings,
            extras: {
                ...quoteSettings.extras,
                winstMarge: {
                    ...quoteSettings.extras.winstMarge,
                    mode: 'percentage',
                    percentage: safePercentage,
                },
            },
        });
    };

    const handleUpdateTransportTotal = async (amountExcl: number) => {
        if (!quoteSettings) return;
        const safeAmount = Math.max(0, Number(amountExcl) || 0);
        const totaalUren = Number((calculation?.data_json as any)?.totaal_uren || normalizedData?.totaal_uren || 0);
        const transportAantalDagen = Math.max(1, Math.ceil(Math.max(0, totaalUren) / 8));
        const vasteTransportkostenPerDag = safeAmount / transportAantalDagen;
        await handleUpdateSettings({
            ...quoteSettings,
            extras: {
                ...quoteSettings.extras,
                transport: {
                    ...quoteSettings.extras.transport,
                    mode: 'fixed',
                    vasteTransportkosten: vasteTransportkostenPerDag,
                    tunnelkosten: 0,
                },
            },
        });
    };

    const handleUpdateWinstMargeAmountExcl = async (amountExcl: number) => {
        if (!quoteSettings) return;
        const safeExcl = roundMoney(Math.max(0, Number(amountExcl) || 0));
        await handleUpdateSettings({
            ...quoteSettings,
            extras: {
                ...quoteSettings.extras,
                winstMarge: {
                    ...quoteSettings.extras.winstMarge,
                    mode: 'fixed',
                    fixedAmount: safeExcl,
                },
            },
        });
    };

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

    const materialExportItems = useMemo<MaterialListExportItem[]>(() => {
        const mapItem = (item: MaterialItem, bron: string, index: number): MaterialListExportItem | null => {
            const naam = String(item?.product || '').trim();
            if (!naam) return null;
            const eenheid = String((item as any)?.eenheid || 'stuk').trim() || 'stuk';
            const aantal = Number.isFinite(Number(item?.aantal)) && Number(item?.aantal) > 0 ? Math.round(Number(item.aantal)) : 1;
            const prijs = Number(item?.prijs_per_stuk);
            return {
                key: `${bron}-${naam}-${index}`,
                naam,
                bron,
                eenheid,
                aantal,
                prijsExclBtw: Number.isFinite(prijs) ? Number(prijs.toFixed(2)) : null,
            };
        };

        const groot = materials.groot
            .map((item, index) => mapItem(item, 'Grootmaterialen', index))
            .filter((item): item is MaterialListExportItem => item !== null);
        const verbruik = materials.verbruik
            .map((item, index) => mapItem(item, 'Verbruiksmaterialen', index))
            .filter((item): item is MaterialListExportItem => item !== null);
        return [...groot, ...verbruik];
    }, [materials.groot, materials.verbruik]);

    const werkbeschrijvingMaterialContext = useMemo(() => {
        const toRow = (item: MaterialItem, type: 'groot' | 'verbruik') => {
            const name = String(item?.product || '').trim();
            if (!name) return null;
            const quantity = Number(item?.aantal);
            const unit = String((item as any)?.eenheid || 'stuk').trim() || 'stuk';
            return {
                name,
                quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                unit,
                type,
            };
        };

        const rows = [
            ...materials.groot.map((item) => toRow(item, 'groot')),
            ...materials.verbruik.map((item) => toRow(item, 'verbruik')),
        ].filter((row): row is { name: string; quantity: number; unit: string; type: 'groot' | 'verbruik' } => row !== null);

        return rows;
    }, [materials.groot, materials.verbruik]);

    const materialExportContext = useMemo<MaterialListExportMeta>(() => ({
        offerteNummer: (quote as any)?.offerteNummer || null,
        klusTitel: normalizedData?.korteTitel || normalizedData?.werkbeschrijving || (quote as any)?.titel || 'Offerte',
        klantNaam: klantInfo ? `${klantInfo.voornaam} ${klantInfo.achternaam}`.trim() : '',
        klantEmail: klantInfo?.emailadres || '',
        senderCompanyName: userProfile?.settings?.bedrijfsnaam || businessData?.bedrijfsnaam || '',
        senderContactName: businessData?.contactNaam || user?.displayName || userProfile?.naam || '',
        senderAddress: `${userProfile?.settings?.adres || ''} ${userProfile?.settings?.huisnummer || ''}`.trim() || businessData?.adres || '',
        senderStreet: userProfile?.settings?.adres || '',
        senderHouseNumber: userProfile?.settings?.huisnummer || '',
        senderPostalCode: userProfile?.settings?.postcode || businessData?.postcode || '',
        senderCity: userProfile?.settings?.plaats || businessData?.plaats || '',
        senderPhone: userProfile?.settings?.telefoon || businessData?.telefoon || '',
        senderKvk: userProfile?.settings?.kvkNummer || businessData?.kvkNummer || businessData?.kvk || '',
        senderBtw: userProfile?.settings?.btwNummer || businessData?.btwNummer || businessData?.btw || '',
        createdAt: new Date(),
    }), [quote, normalizedData, klantInfo, userProfile, businessData, user]);

    const saveMaterialSupplierSettings = useCallback(async (
        nextSuppliersInput: LeverancierContact[],
        preferredDefaultSupplierId?: string,
    ): Promise<string> => {
        if (!user || !firestore) throw new Error('Gebruiker of database niet beschikbaar.');

        const normalizedSuppliers = normalizeLeverancierContactList(nextSuppliersInput);
        const resolvedDefaultSupplierId = pickDefaultLeverancierId(
            preferredDefaultSupplierId ?? defaultMaterialSupplierId,
            normalizedSuppliers,
        );

        await setDoc(doc(firestore, 'users', user.uid), {
            settings: {
                leveranciers: normalizedSuppliers,
                defaultLeverancierId: resolvedDefaultSupplierId,
            },
        }, { merge: true });

        setMaterialSuppliers(normalizedSuppliers);
        setDefaultMaterialSupplierId(resolvedDefaultSupplierId);
        return resolvedDefaultSupplierId;
    }, [user, firestore, defaultMaterialSupplierId]);

    const handleUpdateMaterialSupplierContact = useCallback(async ({
        supplierId,
        contactId,
        contactNaam,
        email,
    }: {
        supplierId: string;
        contactId?: string;
        contactNaam: string;
        email: string;
    }): Promise<void> => {
        const resolvedSupplierId = String(supplierId || '').trim();
        if (!resolvedSupplierId) throw new Error('Geen leverancier geselecteerd.');

        const trimmedContactNaam = String(contactNaam || '').trim();
        const trimmedEmail = String(email || '').trim();
        if (!trimmedEmail) throw new Error('E-mailadres ontbreekt.');

        const nextSuppliers = (materialSuppliers || []).map((supplier) => (
            supplier.id === resolvedSupplierId
                ? {
                    ...supplier,
                    contacten: (() => {
                        const existing = Array.isArray(supplier.contacten) ? supplier.contacten : [];
                        if (contactId) {
                            const hasTarget = existing.some((contact) => contact.id === contactId);
                            if (hasTarget) {
                                return existing.map((contact) => (
                                    contact.id === contactId
                                        ? { ...contact, naam: trimmedContactNaam, email: trimmedEmail }
                                        : contact
                                ));
                            }
                        }
                        if (existing.length === 0) {
                            return [{ id: crypto.randomUUID(), naam: trimmedContactNaam, email: trimmedEmail }];
                        }
                        return [{ ...existing[0], naam: trimmedContactNaam, email: trimmedEmail }, ...existing.slice(1)];
                    })(),
                    contactNaam: trimmedContactNaam,
                    email: trimmedEmail,
                }
                : supplier
        ));

        await saveMaterialSupplierSettings(nextSuppliers, defaultMaterialSupplierId || resolvedSupplierId);
    }, [materialSuppliers, saveMaterialSupplierSettings, defaultMaterialSupplierId]);

    const handleCreateMaterialSupplier = useCallback(async ({
        naam,
        contactNaam,
        email,
    }: {
        naam: string;
        contactNaam: string;
        email: string;
    }): Promise<string> => {
        const trimmedNaam = String(naam || '').trim();
        const trimmedContactNaam = String(contactNaam || '').trim();
        const trimmedEmail = String(email || '').trim();
        if (!trimmedNaam) throw new Error('Leveranciersnaam ontbreekt.');
        if (!trimmedEmail) throw new Error('E-mailadres ontbreekt.');

        const newSupplier: LeverancierContact = {
            id: crypto.randomUUID(),
            naam: trimmedNaam,
            contactNaam: trimmedContactNaam,
            email: trimmedEmail,
            contacten: [{ id: crypto.randomUUID(), naam: trimmedContactNaam, email: trimmedEmail }],
        };

        const nextSuppliers = [...(materialSuppliers || []), newSupplier];
        await saveMaterialSupplierSettings(nextSuppliers, newSupplier.id);
        return newSupplier.id;
    }, [materialSuppliers, saveMaterialSupplierSettings]);

    const handleSaveMaterialEmailTemplate = useCallback(async (template: string): Promise<void> => {
        if (!user || !firestore) throw new Error('Gebruiker of database niet beschikbaar.');
        const normalizedTemplate = String(template || '').trim();
        await setDoc(doc(firestore, 'users', user.uid), {
            settings: {
                materialListEmailTemplate: normalizedTemplate,
            },
        }, { merge: true });
        setMaterialEmailTemplate(normalizedTemplate);
    }, [user, firestore]);

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

    // Calculate totals when data is available
    const totals = useMemo(
        () => (normalizedData && quoteSettings
            ? calculateQuoteTotals({
                ...normalizedData,
                grootmaterialen: materials.groot,
                verbruiksartikelen: materials.verbruik,
            }, quoteSettings)
            : null),
        [normalizedData, quoteSettings, materials.groot, materials.verbruik],
    );
    const totalInclBtw = totals?.totaalInclBtw ?? null;

    // Sync calculated totals to Firebase for Dashboard visibility
    useEffect(() => {
        if (!firestore || !user || !id) return;
        if (typeof totalInclBtw !== 'number' || !Number.isFinite(totalInclBtw)) return;
        if (lastSyncedQuoteTotalRef.current === totalInclBtw) return;

        // Keep current detail-page UI in sync immediately, without waiting for Firestore roundtrip.
        setQuote((prev) => (
            prev
                ? (
                    ((prev as Quote & { totaalbedrag?: number }).totaalbedrag === totalInclBtw && prev.amount === totalInclBtw)
                        ? prev
                        : ({ ...prev, totaalbedrag: totalInclBtw, amount: totalInclBtw } as Quote)
                )
                : prev
        ));

        const updateFirebasePrice = async () => {
            try {
                const docRef = doc(firestore, 'quotes', id);
                await updateDoc(docRef, {
                    totaalbedrag: totalInclBtw,
                    amount: totalInclBtw, // Sync both for compatibility
                    updatedAt: new Date(),
                });
                lastSyncedQuoteTotalRef.current = totalInclBtw;
            } catch (err) {
                console.error("Failed to sync price to Firestore:", err);
            }
        };

        // Debounce to avoid rapid writes during slider/input changes
        const timer = setTimeout(updateFirebasePrice, 2000);
        return () => clearTimeout(timer);
    }, [totalInclBtw, firestore, user, id]);

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
                },
                extras: {
                    ...(root?.extras as any),
                    ...newSettings.extras,
                },
            });
        }
    };

    const actieveVoorwaarden = getVoorwaardenByMode(pdfTextSettings, voorwaardenEditorMode);

    const updateVoorwaardenAt = (index: number, value: string) => {
        hasEditedPdfTextSettingsRef.current = true;
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const next = [...current];
            next[index] = value;
            return withVoorwaardenByMode(prev, voorwaardenEditorMode, next);
        });
    };

    const addVoorwaarde = () => {
        hasEditedPdfTextSettingsRef.current = true;
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const next = [...current, ''];
            const withRegels = withVoorwaardenByMode(prev, voorwaardenEditorMode, next);
            const rodeIndexes = getRodeVoorwaardenByMode(withRegels, voorwaardenEditorMode)
                .filter((idx) => idx >= 0 && idx < next.length);
            return withRodeVoorwaardenByMode(withRegels, voorwaardenEditorMode, rodeIndexes);
        });
    };

    const removeVoorwaarde = (index: number) => {
        hasEditedPdfTextSettingsRef.current = true;
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const next = current.filter((_, i) => i !== index);
            const normalizedNext = next.length > 0 ? next : [''];
            const withRegels = withVoorwaardenByMode(prev, voorwaardenEditorMode, normalizedNext);
            const rodeIndexes = getRodeVoorwaardenByMode(prev, voorwaardenEditorMode)
                .filter((idx) => idx !== index)
                .map((idx) => (idx > index ? idx - 1 : idx))
                .filter((idx) => idx >= 0 && idx < normalizedNext.length);
            return withRodeVoorwaardenByMode(withRegels, voorwaardenEditorMode, rodeIndexes);
        });
    };

    const moveVoorwaarde = (index: number, direction: -1 | 1) => {
        hasEditedPdfTextSettingsRef.current = true;
        setPdfTextSettings((prev) => {
            const current = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const target = index + direction;
            if (target < 0 || target >= current.length) return prev;
            const next = [...current];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            const withRegels = withVoorwaardenByMode(prev, voorwaardenEditorMode, next);
            const rodeSet = new Set(getRodeVoorwaardenByMode(prev, voorwaardenEditorMode));
            const currentIsRed = rodeSet.has(index);
            const targetIsRed = rodeSet.has(target);
            if (currentIsRed !== targetIsRed) {
                if (currentIsRed) {
                    rodeSet.delete(index);
                    rodeSet.add(target);
                } else {
                    rodeSet.delete(target);
                    rodeSet.add(index);
                }
            }
            const rodeIndexes = Array.from(rodeSet).sort((a, b) => a - b);
            return withRodeVoorwaardenByMode(withRegels, voorwaardenEditorMode, rodeIndexes);
        });
    };

    const toggleVoorwaardeRood = (index: number) => {
        hasEditedPdfTextSettingsRef.current = true;
        setPdfTextSettings((prev) => {
            const regels = getVoorwaardenByMode(prev, voorwaardenEditorMode);
            const rodeSet = new Set(getRodeVoorwaardenByMode(prev, voorwaardenEditorMode));
            if (rodeSet.has(index)) {
                rodeSet.delete(index);
            } else {
                rodeSet.add(index);
            }
            const rodeIndexes = Array.from(rodeSet)
                .filter((idx) => idx >= 0 && idx < regels.length)
                .sort((a, b) => a - b);
            return withRodeVoorwaardenByMode(prev, voorwaardenEditorMode, rodeIndexes);
        });
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
            werkbeschrijvingStructured: workDescriptionStructured,
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
                margeBasis: quoteSettings.extras.winstMarge.basis,
            },
            settings: pdfSettings,
            drawingImages: capturedDrawings, // Include captured drawings for preview
            onderVoorbehoud,
            tekstInstellingen: pdfTextSettings,
            algemeneVoorwaardenTekst,
            algemeneVoorwaardenTitel,
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

    const sanitizeFileNamePart = (value: unknown): string => {
        const normalized = typeof value === 'string'
            ? value
            : typeof value === 'number'
                ? String(value)
                : '';
        return normalized
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .slice(0, 80);
    };

    const getQuotePdfFileName = (klantNaam: unknown, offerteNummer: unknown): string => {
        const safeKlantNaam = sanitizeFileNamePart(klantNaam) || 'Klant';
        const safeOfferteNummer = sanitizeFileNamePart(offerteNummer || 'CONCEPT');
        return `${safeKlantNaam} - ${safeOfferteNummer}.pdf`;
    };

    const createShareableOffertePdfLink = async (): Promise<string | null> => {
        if (!user || !id) return null;

        try {
            const baseData = preparePDFData();
            const offerteData: PDFQuoteData = {
                ...baseData,
                settings: {
                    ...baseData.settings,
                    showTekeningen: false,
                    showFullWerkbeschrijving: false,
                },
            };

            const offerteBlob = await generateQuotePDF(offerteData);
            const safeOfferteNummer = sanitizeFileNamePart(baseData.offerteNummer || 'CONCEPT').replace(/\s+/g, '-');
            const storagePath = `users/${user.uid}/quotes/${id}/shared/offerte-${safeOfferteNummer}-${Date.now()}.pdf`;
            const storage = getStorage();
            const fileRef = storageRef(storage, storagePath);

            await uploadBytes(fileRef, offerteBlob, { contentType: 'application/pdf' });
            return await getDownloadURL(fileRef);
        } catch (error) {
            console.error('Error creating shareable offerte PDF link:', error);
            const message = error instanceof Error ? error.message : 'Kon geen deelbare PDF-link maken.';
            void reportOperationalError({
                source: 'create_shareable_offerte_pdf_link',
                title: 'PDF-link maken mislukt',
                message,
                context: {
                    quoteId: id,
                },
            });
            return null;
        }
    };

    const receiptAttachments = useMemo<ReceiptAttachment[]>(() => {
        const raw = (quote as any)?.bonnetjes;
        if (!Array.isArray(raw)) return [];
        return raw as ReceiptAttachment[];
    }, [quote]);

    const photoAttachments = useMemo<QuotePhotoAttachment[]>(() => {
        const raw = (quote as any)?.fotos;
        if (!Array.isArray(raw)) return [];
        return raw as QuotePhotoAttachment[];
    }, [quote]);

    const handleUploadReceipt = async (file: File): Promise<void> => {
        if (!user || !firestore || !id || !quote) return;

        if (!isAllowedReceiptMimeType(file.type)) {
            toast({
                variant: 'destructive',
                title: 'Ongeldig bestandstype',
                description: 'Upload een PDF, JPG, PNG of WEBP bestand.',
            });
            return;
        }

        const maxBytes = 12 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast({
                variant: 'destructive',
                title: 'Bestand te groot',
                description: 'Maximale bestandsgrootte is 12 MB.',
            });
            return;
        }

        setIsUploadingReceipt(true);
        try {
            const storage = getStorage();
            const receiptId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const extension = String(file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
            const storagePath = `users/${user.uid}/quotes/${id}/bonnetjes/${receiptId}.${extension}`;
            const fileRef = storageRef(storage, storagePath);
            await uploadBytes(fileRef, file, { contentType: file.type });
            const downloadUrl = await getDownloadURL(fileRef);

            const nextAttachment: ReceiptAttachment = {
                id: receiptId,
                quoteId: id,
                originalName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                storagePath,
                downloadUrl,
                createdAt: new Date().toISOString(),
                uploadedBy: user.uid,
            };

            const existing = Array.isArray((quote as any).bonnetjes) ? ((quote as any).bonnetjes as ReceiptAttachment[]) : [];
            const nextBonnetjes = [...existing, nextAttachment];

            const quoteRef = doc(firestore, 'quotes', id);
            await updateDoc(quoteRef, {
                bonnetjes: nextBonnetjes,
                updatedAt: serverTimestamp(),
            } as any);

            setQuote((prev) => (prev ? ({ ...prev, bonnetjes: nextBonnetjes } as Quote) : prev));
            toast({
                title: 'Bonnetje geüpload',
                description: file.name,
            });
        } catch (error) {
            console.error('Error uploading bonnetje:', error);
            toast({
                variant: 'destructive',
                title: 'Upload mislukt',
                description: 'Kon bonnetje niet uploaden. Probeer het opnieuw.',
            });
        } finally {
            setIsUploadingReceipt(false);
            if (receiptInputRef.current) {
                receiptInputRef.current.value = '';
            }
        }
    };

    const handleDownloadReceipt = async (attachment: ReceiptAttachment, index: number): Promise<void> => {
        if (!attachment?.downloadUrl) return;
        setReceiptActionId(attachment.id);
        try {
            const response = await fetch(attachment.downloadUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const klantNaam = `${klantInfo?.voornaam || ''} ${klantInfo?.achternaam || ''}`.trim();
            const offerteNummer = (quote as any)?.offerteNummer || 'CONCEPT';
            const fileName = buildReceiptDownloadFileName(attachment, {
                klantNaam: klantNaam || (quote as any)?.klantinformatie?.bedrijfsnaam || 'Klant',
                offerteNummer,
                index,
            });
            downloadBlobWithName(blob, fileName);
        } catch (error) {
            console.error('Error downloading bonnetje:', error);
            toast({
                variant: 'destructive',
                title: 'Download mislukt',
                description: 'Kon bonnetje niet downloaden. Probeer het opnieuw.',
            });
        } finally {
            setReceiptActionId(null);
        }
    };

    const handleDeleteReceipt = async (attachment: ReceiptAttachment): Promise<void> => {
        if (!user || !firestore || !id || !quote) return;
        setReceiptActionId(attachment.id);
        try {
            if (attachment.storagePath) {
                const storage = getStorage();
                await deleteObject(storageRef(storage, attachment.storagePath));
            }
        } catch (error) {
            console.error('Error deleting bonnetje from storage:', error);
        }

        try {
            const existing = Array.isArray((quote as any).bonnetjes) ? ((quote as any).bonnetjes as ReceiptAttachment[]) : [];
            const nextBonnetjes = existing.filter((item) => item.id !== attachment.id);
            const quoteRef = doc(firestore, 'quotes', id);
            await updateDoc(quoteRef, {
                bonnetjes: nextBonnetjes,
                updatedAt: serverTimestamp(),
            } as any);
            setQuote((prev) => (prev ? ({ ...prev, bonnetjes: nextBonnetjes } as Quote) : prev));
            toast({
                title: 'Bonnetje verwijderd',
                description: attachment.originalName,
            });
        } catch (error) {
            console.error('Error deleting bonnetje metadata:', error);
            toast({
                variant: 'destructive',
                title: 'Verwijderen mislukt',
                description: 'Kon bonnetje niet verwijderen. Probeer het opnieuw.',
            });
        } finally {
            setReceiptActionId(null);
        }
    };

    const handleUploadPhoto = async (file: File): Promise<void> => {
        if (!user || !firestore || !id || !quote) return;

        if (!isAllowedPhotoMimeType(file.type)) {
            toast({
                variant: 'destructive',
                title: 'Ongeldig bestandstype',
                description: 'Upload een foto bestand (JPG, PNG, WEBP of HEIC).',
            });
            return;
        }

        const maxBytes = 15 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast({
                variant: 'destructive',
                title: 'Bestand te groot',
                description: 'Maximale bestandsgrootte is 15 MB.',
            });
            return;
        }

        setIsUploadingPhoto(true);
        try {
            const storage = getStorage();
            const photoId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const extension = String(file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const storagePath = `users/${user.uid}/quotes/${id}/fotos/${photoId}.${extension}`;
            const fileRef = storageRef(storage, storagePath);
            await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
            const downloadUrl = await getDownloadURL(fileRef);

            const nextPhoto: QuotePhotoAttachment = {
                id: photoId,
                quoteId: id,
                originalName: file.name,
                mimeType: file.type || 'image/jpeg',
                sizeBytes: file.size,
                storagePath,
                downloadUrl,
                createdAt: new Date().toISOString(),
                uploadedBy: user.uid,
            };

            const existing = Array.isArray((quote as any).fotos) ? ((quote as any).fotos as QuotePhotoAttachment[]) : [];
            const nextFotos = [...existing, nextPhoto];

            const quoteRef = doc(firestore, 'quotes', id);
            await updateDoc(quoteRef, {
                fotos: nextFotos,
                updatedAt: serverTimestamp(),
            } as any);

            setQuote((prev) => (prev ? ({ ...prev, fotos: nextFotos } as Quote) : prev));
            toast({
                title: 'Foto opgeslagen',
                description: file.name,
            });
        } catch (error) {
            console.error('Error uploading foto:', error);
            toast({
                variant: 'destructive',
                title: 'Upload mislukt',
                description: 'Kon foto niet uploaden. Probeer het opnieuw.',
            });
        } finally {
            setIsUploadingPhoto(false);
            if (photoInputRef.current) {
                photoInputRef.current.value = '';
            }
            if (photoCameraInputRef.current) {
                photoCameraInputRef.current.value = '';
            }
        }
    };

    const handleDeletePhoto = async (photo: QuotePhotoAttachment): Promise<void> => {
        if (!user || !firestore || !id || !quote) return;
        setPhotoActionId(photo.id);
        try {
            if (photo.storagePath) {
                const storage = getStorage();
                await deleteObject(storageRef(storage, photo.storagePath));
            }
        } catch (error) {
            console.error('Error deleting foto from storage:', error);
        }

        try {
            const existing = Array.isArray((quote as any).fotos) ? ((quote as any).fotos as QuotePhotoAttachment[]) : [];
            const nextFotos = existing.filter((item) => item.id !== photo.id);
            const quoteRef = doc(firestore, 'quotes', id);
            await updateDoc(quoteRef, {
                fotos: nextFotos,
                updatedAt: serverTimestamp(),
            } as any);
            setQuote((prev) => (prev ? ({ ...prev, fotos: nextFotos } as Quote) : prev));
            if (selectedPhoto?.id === photo.id) {
                setSelectedPhoto(null);
            }
            toast({
                title: 'Foto verwijderd',
                description: photo.originalName,
            });
        } catch (error) {
            console.error('Error deleting foto metadata:', error);
            toast({
                variant: 'destructive',
                title: 'Verwijderen mislukt',
                description: 'Kon foto niet verwijderen. Probeer het opnieuw.',
            });
        } finally {
            setPhotoActionId(null);
        }
    };

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

    const generateAlgemeneVoorwaardenOnlyPdf = async (
        titel: string,
        tekst: string,
        offerteNummer: string,
    ): Promise<Blob> => {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 16;
        let y = margin;

        const ensureSpace = (space: number) => {
            if (y + space <= pageHeight - margin) return;
            doc.addPage();
            y = margin;
        };

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(25, 25, 25);
        doc.text((titel || 'ALGEMENE VOORWAARDEN').trim() || 'ALGEMENE VOORWAARDEN', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Offerte #${offerteNummer}`, pageWidth - margin, y, { align: 'right' });
        y += 7;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(45, 45, 45);

        const cleaned = String(tekst || '').trim();
        const blocks = cleaned.length > 0
            ? cleaned.split(/\n\s*\n/g).map((item) => item.trim()).filter(Boolean)
            : ['Geen algemene voorwaarden ingevuld.'];

        blocks.forEach((block) => {
            const lines = doc.splitTextToSize(block, pageWidth - (margin * 2));
            ensureSpace((lines.length * 5) + 4);
            doc.text(lines, margin, y);
            y += (lines.length * 5) + 4;
        });

        return doc.output('blob');
    };

    const handleAlgemeneVoorwaardenPdfUpload = async (file: File): Promise<void> => {
        if (!user || !firestore || !id) return;

        if (file.type !== 'application/pdf') {
            toast({
                variant: 'destructive',
                title: 'Ongeldig bestand',
                description: 'Upload alleen een PDF-bestand voor algemene voorwaarden.',
            });
            return;
        }

        const maxBytes = 8 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast({
                variant: 'destructive',
                title: 'Bestand te groot',
                description: 'Maximale bestandsgrootte is 8 MB.',
            });
            return;
        }

        setIsUploadingAlgemeneVoorwaardenPdf(true);
        try {
            const storage = getStorage();
            const path = `users/${user.uid}/algemene-voorwaarden/algemene-voorwaarden-${Date.now()}.pdf`;
            const fileRef = storageRef(storage, path);
            await uploadBytes(fileRef, file, { contentType: 'application/pdf' });
            const url = await getDownloadURL(fileRef);

            setAlgemeneVoorwaardenPdfUrl(url);
            setAlgemeneVoorwaardenPdfBestandsnaam(file.name);
            setQuote((prev) => (
                prev
                    ? {
                        ...prev,
                        algemeneVoorwaarden: {
                            ...(prev as any).algemeneVoorwaarden,
                            titel: algemeneVoorwaardenTitel,
                            tekst: algemeneVoorwaardenTekst,
                            pdfUrl: url,
                            pdfBestandsnaam: file.name,
                        },
                    } as any
                    : prev
            ));

            toast({
                title: 'Algemene voorwaarden geüpload',
                description: file.name,
            });
        } catch (error) {
            console.error('Error uploading algemene voorwaarden PDF:', error);
            toast({
                variant: 'destructive',
                title: 'Upload mislukt',
                description: 'Kon PDF niet uploaden. Probeer het opnieuw.',
            });
        } finally {
            setIsUploadingAlgemeneVoorwaardenPdf(false);
            if (algemeneVoorwaardenInputRef.current) {
                algemeneVoorwaardenInputRef.current.value = '';
            }
            if (algemeneVoorwaardenModalInputRef.current) {
                algemeneVoorwaardenModalInputRef.current.value = '';
            }
        }
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
                downloadBlobWithName(offerteBlob, getQuotePdfFileName(klantNaam, offerteNummer));
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
            const klantNaam = sanitizeFileNamePart(data.klant?.naam || '');
            downloadBlobWithName(pdfBlob, getQuotePdfFileName(klantNaam, offerteNummer));
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
        const resolvedProjectLocatie =
            normalizedData?.projectLocatie?.trim()
            || (
                klantInfo?.afwijkendProjectadres && klantInfo?.projectAdres
                    ? `${klantInfo.projectAdres.straat || ''} ${klantInfo.projectAdres.huisnummer || ''}, ${klantInfo.projectAdres.plaats || ''}`.trim().replace(/\s+,/g, ',')
                    : `${klantInfo?.straat || ''} ${klantInfo?.huisnummer || ''}, ${klantInfo?.plaats || ''}`.trim().replace(/\s+,/g, ',')
            )
            || '';

        return {
            offerteNummer: (quote as any)?.offerteNummer || 'CONCEPT',
            datum: new Date().toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }),
            geldigTot: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }),
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
            projectLocatie: resolvedProjectLocatie,
            korteTitel: normalizedData?.korteTitel,
            korteBeschrijving: normalizedData?.korteBeschrijving,
            werkbeschrijving: generateWorkSummary(normalizedData?.werkbeschrijving || []),
            werkbeschrijvingFull: normalizeWerkbeschrijving(normalizedData?.werkbeschrijving || []),
            werkbeschrijvingStructured: workDescriptionStructured,
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
                margePercentage: quoteSettings?.extras?.winstMarge?.percentage || 0,
                margeBasis: quoteSettings?.extras?.winstMarge?.basis || 'totaal',
            },
            settings: pdfSettings,
            onderVoorbehoud,
            tekstInstellingen: pdfTextSettings,
            algemeneVoorwaardenTekst,
            algemeneVoorwaardenTitel,
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

    const savePdfSettingsNow = useCallback(async () => {
        if (!user || !firestore || !id || !quote) return;
        setIsSavingPdfSettings(true);
        try {
            await handlePdfSettingsChange(pdfSettings);

            const quoteRef = doc(firestore, 'quotes', id);
            await updateDoc(quoteRef, {
                facturatie: {
                    voorschotIngeschakeld,
                    voorschotPercentage,
                    onderVoorbehoud,
                },
                pdfTeksten: pdfTextSettings,
                algemeneVoorwaarden: {
                    titel: algemeneVoorwaardenTitel,
                    tekst: algemeneVoorwaardenTekst,
                    pdfUrl: algemeneVoorwaardenPdfUrl,
                    pdfBestandsnaam: algemeneVoorwaardenPdfBestandsnaam,
                },
                updatedAt: new Date(),
            });

            const userRef = doc(firestore, 'users', user.uid);
            await setDoc(
                userRef,
                {
                    defaultPdfTeksten: pdfTextSettings,
                    defaultAlgemeneVoorwaarden: {
                        titel: algemeneVoorwaardenTitel,
                        tekst: algemeneVoorwaardenTekst,
                        pdfUrl: algemeneVoorwaardenPdfUrl,
                        pdfBestandsnaam: algemeneVoorwaardenPdfBestandsnaam,
                    },
                },
                { merge: true }
            );

            setPdfSettingsSavedAt(Date.now());
            toast({
                title: 'Opgeslagen',
                description: 'PDF instellingen zijn opgeslagen.',
            });
            setIsPdfSettingsOpen(false);
        } catch (e) {
            console.error('Fout bij handmatig opslaan PDF instellingen:', e);
            toast({
                variant: 'destructive',
                title: 'Opslaan mislukt',
                description: 'Probeer het opnieuw.',
            });
        } finally {
            setIsSavingPdfSettings(false);
        }
    }, [
        user,
        firestore,
        id,
        quote,
        pdfSettings,
        voorschotIngeschakeld,
        voorschotPercentage,
        onderVoorbehoud,
        pdfTextSettings,
        algemeneVoorwaardenTitel,
        algemeneVoorwaardenTekst,
        algemeneVoorwaardenPdfUrl,
        algemeneVoorwaardenPdfBestandsnaam,
        toast,
    ]);

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
    const hasCalculationResult = Boolean(calculation?.data_json) || hasStoredCalculatedTotal;
    const laborTotalHours = (calculation?.data_json as any)?.totaal_uren || normalizedData?.totaal_uren || 0;
    const laborHoursPerDay = Number(userProfile?.settings?.planningSettings?.defaultWorkdayHours) || 8;
    const laborRateExcl = Number(quoteSettings?.uurTariefExclBtw) || 0;
    const laborTotalExcl = (Number(laborTotalHours) || 0) * laborRateExcl;
    const footerVatRate = Number(quoteSettings?.btwTarief) || 21;
    const footerQuoteTotalExcl = totalMaterialExcl + laborTotalExcl;
    const footerQuoteTotalIncl = footerQuoteTotalExcl * (1 + footerVatRate / 100);
    const calculationInProgress =
        quote?.status === 'in_behandeling' &&
        !hasCalculationResult;
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
    const showCalculationBanner = quote?.status === 'in_behandeling' && !hasCalculationResult;
    const calculationBannerMessage = calculationInProgress
        ? 'We berekenen nu de materialen en uren. Je kunt op deze pagina blijven; de uitkomst verschijnt automatisch.'
        : 'Calculatie draait nog op de achtergrond. Waarden kunnen nog wijzigen tot de berekening volledig klaar is.';

    useEffect(() => {
        if (!firestore || !id) return;
        if (quote?.status !== 'in_behandeling') return;
        if (!hasCalculationResult) return;

        // Result exists, so move quote out of processing state without requiring a page refresh.
        setQuote((prev) => (
            prev
                ? ({ ...prev, status: 'concept' } as Quote)
                : prev
        ));

        void updateDoc(doc(firestore, 'quotes', id), {
            status: 'concept',
            calculationError: null,
            updatedAt: serverTimestamp(),
        }).catch((err) => {
            console.warn('Kon offerte status niet automatisch afronden na calculatie:', err);
        });
    }, [firestore, id, quote?.status, hasCalculationResult]);

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

    const currentWerkbeschrijvingStructured = useMemo(
        () => toStructuredWorkDescription({
            werkbeschrijving: normalizedData?.werkbeschrijving,
            werkbeschrijving_structured: (normalizedData as any)?.werkbeschrijving_structured,
            korteTitel: normalizedData?.korteTitel,
            korteBeschrijving: normalizedData?.korteBeschrijving,
        }),
        [normalizedData],
    );

    const resolvedWorkDescriptionCategory = useMemo(() => {
        const candidates = [
            (normalizedData as any)?.category,
            (normalizedData as any)?.categorie,
            (normalizedData as any)?.jobType,
            (normalizedData as any)?.job_type,
            (normalizedData as any)?.slug,
            (normalizedData as any)?.klusType,
            quote?.titel,
        ];

        for (const candidate of candidates) {
            const value = String(candidate || '').trim();
            if (value) return value;
        }
        return '';
    }, [normalizedData, quote?.titel]);

    const werkbeschrijvingMeasurementsContext = useMemo(() => {
        const measurementsRaw = (normalizedData as any)?.measurements;
        if (!measurementsRaw || typeof measurementsRaw !== 'object') return '';

        const entries = Object.entries(measurementsRaw as Record<string, unknown>)
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    const compactRows = value
                        .slice(0, 3)
                        .map((row) => {
                            if (row && typeof row === 'object') {
                                const r = row as Record<string, unknown>;
                                const label = String(r.label || '').trim();
                                const breedte = Number(r.breedte);
                                const lengte = Number(r.lengte);
                                const dims = [
                                    Number.isFinite(breedte) ? `b ${breedte}` : '',
                                    Number.isFinite(lengte) ? `l ${lengte}` : '',
                                ].filter(Boolean).join(', ');
                                return [label, dims].filter(Boolean).join(' ');
                            }
                            return String(row || '').trim();
                        })
                        .filter(Boolean)
                        .join(' | ');
                    return compactRows ? `${key}: ${compactRows}` : '';
                }
                if (value && typeof value === 'object') return '';
                const text = String(value ?? '').trim();
                return text ? `${key}: ${text}` : '';
            })
            .filter(Boolean)
            .slice(0, 20);

        return truncatePromptText(entries.join('\n'), 2000);
    }, [normalizedData]);

    const detectedWorkDescriptionTemplate = useMemo(
        () => findWorkDescriptionTemplate({
            category: resolvedWorkDescriptionCategory,
            title: workDescriptionStructured.title,
            context: workDescriptionStructured.context,
        }),
        [resolvedWorkDescriptionCategory, workDescriptionStructured.title, workDescriptionStructured.context],
    );

    const isWerkbeschrijvingEmpty = useMemo(() => {
        const flat = flattenStructuredWorkDescription(workDescriptionStructured);
        const hasTitle = workDescriptionStructured.title.trim().length > 0;
        const hasContext = workDescriptionStructured.context.trim().length > 0;
        return !hasTitle && !hasContext && flat.length === 0;
    }, [workDescriptionStructured]);

    const showWerkbeschrijvingWarning = !loading && isWerkbeschrijvingEmpty;

    const applyLocalWorkDescriptionUpdate = useCallback(
        (
            next:
                | WorkDescriptionStructured
                | ((prev: WorkDescriptionStructured) => WorkDescriptionStructured)
        ) => {
            workDescriptionDirtyRef.current = true;
            workDescriptionLastEditAtRef.current = Date.now();
            setWorkDescriptionStructured(next);
        },
        [],
    );

    const handleWorkDescriptionChange = useCallback((next: WorkDescriptionStructured) => {
        applyLocalWorkDescriptionUpdate(next);
    }, [applyLocalWorkDescriptionUpdate]);

    useEffect(() => {
        if (workDescriptionDirtyRef.current) {
            return;
        }

        const serialized = JSON.stringify({
            structured: currentWerkbeschrijvingStructured,
        });
        const shouldAutoApplyTemplate = Boolean(
            !templateAutoAppliedRef.current
            && detectedWorkDescriptionTemplate
            && flattenStructuredWorkDescription(currentWerkbeschrijvingStructured).length === 0,
        );

        if (lastSyncedWerkbeschrijvingRef.current === serialized && !shouldAutoApplyTemplate) {
            return;
        }

        let next = currentWerkbeschrijvingStructured;
        if (shouldAutoApplyTemplate && detectedWorkDescriptionTemplate) {
            next = {
                ...currentWerkbeschrijvingStructured,
                sections: cloneTemplateSections(detectedWorkDescriptionTemplate),
            };
            templateAutoAppliedRef.current = true;
        }

        setWorkDescriptionStructured(next);
        lastSyncedWerkbeschrijvingRef.current = JSON.stringify({
            structured: next,
        });
    }, [currentWerkbeschrijvingStructured, detectedWorkDescriptionTemplate]);

    useEffect(() => {
        if (!calculation?.data_json) return;

        const parsedStructured = toStructuredWorkDescription({
            werkbeschrijving_structured: workDescriptionStructured,
            korteTitel: workDescriptionStructured.title,
            korteBeschrijving: workDescriptionStructured.context,
        });
        const parsedWerkbeschrijving = flattenStructuredWorkDescription(parsedStructured);
        const serializedParsed = JSON.stringify({
            structured: parsedStructured,
            rows: parsedWerkbeschrijving,
        });

        if (serializedParsed === lastSyncedWerkbeschrijvingRef.current) {
            return;
        }

        if (autoSaveWerkbeschrijvingTimerRef.current) {
            clearTimeout(autoSaveWerkbeschrijvingTimerRef.current);
        }

        autoSaveWerkbeschrijvingTimerRef.current = setTimeout(() => {
            let shouldHideIndicator = false;
            const savingIndicatorTimer = window.setTimeout(() => {
                setIsAutoSavingWorkDescription(true);
                shouldHideIndicator = true;
            }, WORK_DESCRIPTION_SAVING_INDICATOR_DELAY_MS);

            const saveStartedAt = Date.now();
            const root = unwrapRoot(calculation.data_json);
            updateDataJson({
                ...root,
                korteTitel: parsedStructured.title,
                korteBeschrijving: parsedStructured.context,
                werkbeschrijving: parsedWerkbeschrijving,
                werkbeschrijving_structured: parsedStructured,
            })
                .then(() => {
                    lastSyncedWerkbeschrijvingRef.current = serializedParsed;
                    if (workDescriptionLastEditAtRef.current <= saveStartedAt) {
                        workDescriptionDirtyRef.current = false;
                    }
                })
                .catch((err: any) => {
                    toast({
                        variant: 'destructive',
                        title: 'Automatisch opslaan mislukt',
                        description: err?.message || 'Kon werkbeschrijving niet opslaan.',
                    });
                })
                .finally(() => {
                    window.clearTimeout(savingIndicatorTimer);
                    if (shouldHideIndicator) {
                        setIsAutoSavingWorkDescription(false);
                    }
                });
        }, WORK_DESCRIPTION_AUTOSAVE_DEBOUNCE_MS);

        return () => {
            if (autoSaveWerkbeschrijvingTimerRef.current) {
                clearTimeout(autoSaveWerkbeschrijvingTimerRef.current);
            }
        };
    }, [workDescriptionStructured, calculation?.data_json, updateDataJson, toast]);

    const handleGenerateWorkDescription = async (action: 'full' | 'uitvoering-only' | 'improve') => {
        if (!user) return;

        if (!calculation?.data_json) {
            toast({
                variant: 'destructive',
                title: 'Nog geen offerte-data',
                description: 'Open deze offerte opnieuw nadat de basisdata is aangemaakt.',
            });
            return;
        }

        setIsGeneratingWorkDescription(true);
        try {
            const token = await user.getIdToken();
            const notesContext = truncatePromptText(quoteNotes, 1800);
            const materialPromptLines = werkbeschrijvingMaterialContext.length > 0
                ? [
                    'Verplichte materialen (deze moeten expliciet terugkomen in de werkbeschrijving):',
                    ...werkbeschrijvingMaterialContext.map((item) => `- ${item.name} (${item.quantity} ${item.unit}, type: ${item.type})`),
                    'Als materialen zijn opgegeven, noem ze concreet in de stappen.',
                ]
                : [];
            const notesPromptLines = notesContext
                ? [
                    'Notities van gebruiker (gebruik deze context actief, inclusief maten/afmetingen):',
                    notesContext,
                ]
                : [];
            const measurementPromptLines = werkbeschrijvingMeasurementsContext
                ? [
                    'Beschikbare maatvoering uit offerte-data (gebruik waar relevant):',
                    werkbeschrijvingMeasurementsContext,
                ]
                : [];
            const promptBase = [
                `Actie: ${action}`,
                workDescriptionStructured.title.trim() ? `Titel: ${workDescriptionStructured.title.trim()}` : '',
                workDescriptionStructured.context.trim() ? `Context: ${workDescriptionStructured.context.trim()}` : '',
                resolvedWorkDescriptionCategory ? `Categorie: ${resolvedWorkDescriptionCategory}` : '',
                ...materialPromptLines,
                ...notesPromptLines,
                ...measurementPromptLines,
            ].filter(Boolean).join('\n');

            const response = await fetch('/api/generate-work-description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt: promptBase,
                    quoteId: id,
                    action,
                    title: workDescriptionStructured.title,
                    context: workDescriptionStructured.context,
                    category: resolvedWorkDescriptionCategory,
                    targetSection: action === 'uitvoering-only' ? 'uitvoering' : undefined,
                    structuredInput: workDescriptionStructured,
                    materialContext: werkbeschrijvingMaterialContext,
                    notesContext,
                    measurementsContext: werkbeschrijvingMeasurementsContext,
                }),
            });

            const payload = await response.json().catch(() => null) as
                | { werkbeschrijving?: unknown; werkbeschrijvingStructured?: unknown; error?: string }
                | null;

            if (!response.ok) {
                throw new Error(payload?.error || 'Kon werkbeschrijving niet genereren.');
            }

            const generatedStructured = payload?.werkbeschrijvingStructured
                ? toStructuredWorkDescription({ werkbeschrijving_structured: payload.werkbeschrijvingStructured })
                : null;

            if (generatedStructured && flattenStructuredWorkDescription(generatedStructured).length > 0) {
                applyLocalWorkDescriptionUpdate(generatedStructured);
                toast({
                    title: 'Werkbeschrijving bijgewerkt',
                    description: 'AI-output is verwerkt in de structuur.',
                });
                return;
            }

            const generated = Array.isArray(payload?.werkbeschrijving)
                ? payload.werkbeschrijving
                    .map((row) => String(row || '').trim())
                    .filter(Boolean)
                : [];

            if (generated.length === 0) {
                throw new Error('Geen werkbeschrijving ontvangen.');
            }

            if (action === 'uitvoering-only') {
                applyLocalWorkDescriptionUpdate((prev) => ({
                    ...prev,
                    sections: {
                        ...prev.sections,
                        uitvoering: generated,
                    },
                }));
            } else {
                const inferred = toStructuredWorkDescription({
                    werkbeschrijving: generated,
                    korteTitel: workDescriptionStructured.title,
                    korteBeschrijving: workDescriptionStructured.context,
                });
                applyLocalWorkDescriptionUpdate(inferred);
            }

            toast({
                title: 'Werkbeschrijving bijgewerkt',
                description: 'AI-output is verwerkt in de structuur.',
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Genereren mislukt',
                description: err?.message || 'Kon werkbeschrijving niet genereren.',
            });
        } finally {
            setIsGeneratingWorkDescription(false);
        }
    };

    const handleApplyWorkDescriptionTemplate = useCallback(() => {
        if (!detectedWorkDescriptionTemplate) return;

        applyLocalWorkDescriptionUpdate((prev) => {
            const templateSections = cloneTemplateSections(detectedWorkDescriptionTemplate);
            const next = {
                ...prev,
                sections: {
                    voorbereiding: [],
                    uitvoering: prev.sections.uitvoering.length > 0 ? prev.sections.uitvoering : templateSections.uitvoering,
                    afwerking: [],
                },
            };
            return next;
        });

        templateAutoAppliedRef.current = true;
        toast({
            title: 'Template toegepast',
            description: `Template "${detectedWorkDescriptionTemplate.label}" is toegevoegd op lege secties.`,
        });
    }, [detectedWorkDescriptionTemplate, toast, applyLocalWorkDescriptionUpdate]);

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

    const routeOriginAddress = useMemo(() => {
        const origin = {
            straat: userProfile?.settings?.adres || businessData?.adres || '',
            huisnummer: userProfile?.settings?.huisnummer || businessData?.huisnummer || '',
            postcode: userProfile?.settings?.postcode || businessData?.postcode || '',
            plaats: userProfile?.settings?.plaats || businessData?.plaats || '',
        };
        return hasMinimalAddress(origin) ? buildAddressString(origin) : '';
    }, [businessData?.adres, businessData?.huisnummer, businessData?.plaats, businessData?.postcode, userProfile?.settings?.adres, userProfile?.settings?.huisnummer, userProfile?.settings?.plaats, userProfile?.settings?.postcode]);

    const routeDestinationAddress = useMemo(() => {
        if (!klantInfo) return '';
        const projectAdres = klantInfo.afwijkendProjectadres ? klantInfo.projectAdres : undefined;
        const preferredAddress = projectAdres && hasMinimalAddress(projectAdres)
            ? projectAdres
            : hasMinimalAddress(klantInfo)
                ? klantInfo
                : null;
        return preferredAddress ? buildAddressString(preferredAddress) : '';
    }, [klantInfo]);

    const routeMapsUrl = useMemo(() => {
        return routeDestinationAddress
            ? buildGoogleMapsDirectionsUrl(routeDestinationAddress)
            : '';
    }, [routeDestinationAddress]);

    const runDistanceGeneration = useCallback(async (options?: { source?: string; notify?: boolean }) => {
        if (!user) return;
        if (!routeOriginAddress || !routeDestinationAddress) {
            if (options?.notify !== false) {
                toast({
                    variant: 'destructive',
                    title: 'Adres ontbreekt',
                    description: 'Vul zowel vertrekadres (instellingen) als projectadres in.',
                });
            }
            return;
        }

        setIsGeneratingDistanceDev(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/generate-distance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    quoteId: id,
                    originAddress: routeOriginAddress,
                    destinationAddress: routeDestinationAddress,
                    manualQuote: true,
                }),
            });

            const payload = await response.json().catch(() => null) as
                | {
                    error?: string;
                    distanceKmOneWay?: number;
                    distanceKmRoundTrip?: number;
                    durationMinOneWay?: number;
                }
                | null;

            if (!response.ok) {
                throw new Error(payload?.error || 'Distance webhook mislukt.');
            }

            const distanceKmOneWay = Number(payload?.distanceKmOneWay || 0);
            const distanceKmRoundTrip = Number(payload?.distanceKmRoundTrip || (distanceKmOneWay * 2));
            const durationMinOneWay = Math.max(0, Math.round(Number(payload?.durationMinOneWay || 0)));
            const durationText = `${durationMinOneWay} min`;
            const prijsPerKm = Number(quoteSettings?.extras?.transport?.prijsPerKm || 0);
            const oneWayTravelCost = distanceKmOneWay * prijsPerKm;
            const roundTripTravelCost = oneWayTravelCost * 2;

            if (calculation?.data_json) {
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    transport_berekening: {
                        ...(root as any)?.transport_berekening,
                        distanceKm: distanceKmOneWay,
                        roundTripDistanceKm: distanceKmRoundTrip,
                        durationText,
                        durationMinOneWay,
                        oneWayTravelCost,
                        roundTripTravelCost,
                        source: options?.source || 'distance_generation',
                        originAddress: routeOriginAddress,
                        destinationAddress: routeDestinationAddress,
                        updatedAt: new Date().toISOString(),
                    },
                });
            }

            if (options?.notify !== false) {
                toast({
                    title: 'Distance opgehaald',
                    description: `${distanceKmOneWay.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km (enkele reis), ${durationMinOneWay} min.`,
                });
            }
        } catch (error: any) {
            if (options?.notify !== false) {
                toast({
                    variant: 'destructive',
                    title: 'Distance genereren mislukt',
                    description: error?.message || 'Onbekende fout.',
                });
            }
        } finally {
            setIsGeneratingDistanceDev(false);
        }
    }, [calculation?.data_json, id, quoteSettings?.extras?.transport?.prijsPerKm, routeDestinationAddress, routeOriginAddress, toast, updateDataJson, user]);

    const hasTransportDistance = useMemo(() => {
        const rawTransport = (normalizedData as any)?.transport_berekening || {};
        const oneWay = Number(rawTransport?.distanceKm || 0);
        const roundTrip = Number(rawTransport?.roundTripDistanceKm || 0);
        return oneWay > 0 || roundTrip > 0;
    }, [normalizedData]);

    useEffect(() => {
        if (!id) return;
        if (!user) return;
        if (!calculation?.data_json) return;
        if (!routeOriginAddress || !routeDestinationAddress) return;
        if (hasTransportDistance) return;
        if (isGeneratingDistanceDev) return;
        if (autoDistanceAttemptedRef.current.has(id)) return;

        autoDistanceAttemptedRef.current.add(id);
        void runDistanceGeneration({ source: 'auto_manual_quote', notify: false });
    }, [
        calculation?.data_json,
        hasTransportDistance,
        id,
        isGeneratingDistanceDev,
        routeDestinationAddress,
        routeOriginAddress,
        runDistanceGeneration,
        user,
    ]);

    const sortedReceiptAttachments = useMemo(() => {
        return [...receiptAttachments].sort((a, b) => {
            const aDate = parseReceiptCreatedAt(a.createdAt)?.getTime() ?? 0;
            const bDate = parseReceiptCreatedAt(b.createdAt)?.getTime() ?? 0;
            return bDate - aDate;
        });
    }, [receiptAttachments]);

    const sortedPhotoAttachments = useMemo(() => {
        return [...photoAttachments].sort((a, b) => {
            const aDate = parseReceiptCreatedAt(a.createdAt)?.getTime() ?? 0;
            const bDate = parseReceiptCreatedAt(b.createdAt)?.getTime() ?? 0;
            return bDate - aDate;
        });
    }, [photoAttachments]);

    const formatReceiptSize = (sizeBytes: number): string => {
        const size = Number(sizeBytes || 0);
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const secondaryTabs = ['nacalculatie', 'tekeningen', 'fotos', 'notities', 'algemene-voorwaarden'];
    const isSecondarySectionActive = secondaryTabs.includes(activeTab);
    const handleTabChange = useCallback((tab: string) => {
        setActiveTab(tab);
    }, []);
    const openPlanningWithType = useCallback((scheduleType: 'job' | 'werkbespreking') => {
        const params = new URLSearchParams({
            mode: 'schedule',
            quoteId: id,
            hours: String(normalizedData?.totaal_uren || 0),
            view: 'week',
            scheduleType,
        });
        router.push(`/planning?${params.toString()}`);
    }, [id, normalizedData?.totaal_uren, router]);

    return (
        <div className="app-shell min-h-screen bg-background font-sans selection:bg-emerald-500/30">
            <AppNavigation />
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-background/40 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
                    <div className="flex w-full items-center justify-center sm:w-auto sm:justify-start">
                        <div>
                            <div className="flex items-center justify-center gap-3 sm:justify-start">
                                <FileText className="h-5 w-5 text-cyan-400" />
                                <h1 className="text-xl font-bold text-foreground">
                                    Offerte {(quote as any)?.offerteNummer || 'Concept'}
                                </h1>
                                {quote?.titel && <span className="text-muted-foreground font-normal hidden sm:inline">• {quote.titel}</span>}
                            </div>
                            {klantInfo && (
                                <p className="text-sm text-muted-foreground">
                                    {klantInfo.voornaam} {klantInfo.achternaam} • {klantInfo.plaats}
                                </p>
                            )}
                        </div>
                    </div>
                    {!loading && (
                        <div className="grid w-full grid-cols-2 gap-2 sm:hidden">
                            <Button
                                variant="outline"
                                className="h-11 justify-start gap-2 px-4"
                                onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(id)}`)}
                            >
                                <ReceiptText size={16} />
                                Maak factuur
                            </Button>
                            <Button
                                variant="outline"
                                className="h-11 justify-start gap-2 px-4"
                                onClick={() => setIsPlanningTypeDialogOpen(true)}
                            >
                                <CalendarDays size={16} />
                                Inplannen
                            </Button>
                            {routeMapsUrl && (
                                <Button
                                    variant="outline"
                                    className="h-11 justify-start gap-2 px-4"
                                    onClick={() => {
                                        window.open(routeMapsUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                    title={routeDestinationAddress}
                                >
                                    <Navigation size={16} />
                                    Route openen
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                className={cn('h-11 justify-start gap-2 px-4', !routeMapsUrl && 'col-span-1')}
                                onClick={() => setIsMobileMoreActionsOpen(true)}
                            >
                                <ChevronDown size={16} />
                                Meer acties
                            </Button>
                        </div>
                    )}

                    <div className="hidden w-full gap-2 overflow-x-auto pb-1 sm:flex sm:w-auto sm:overflow-visible sm:pb-0">
                        {!loading && (
                            <>
                                <Button
                                    variant="outline"
                                    className="flex h-10 min-w-10 items-center justify-center gap-2 px-3 sm:h-9 sm:min-w-0 sm:flex-1 sm:px-4"
                                    onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(id)}`)}
                                    aria-label="Maak factuur"
                                    title="Maak factuur"
                                >
                                    <ReceiptText size={16} />
                                    Maak factuur
                                </Button>
                                {routeMapsUrl && (
                                    <Button
                                        variant="outline"
                                        className="flex h-10 min-w-10 items-center justify-center gap-2 px-3 sm:h-9 sm:min-w-0 sm:flex-1 sm:px-4"
                                        onClick={() => {
                                            window.open(routeMapsUrl, '_blank', 'noopener,noreferrer');
                                        }}
                                        title={routeDestinationAddress}
                                    >
                                        <Navigation size={16} />
                                        Route
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    className="flex h-10 min-w-10 items-center justify-center gap-2 px-3 sm:h-9 sm:min-w-0 sm:flex-1 sm:px-4"
                                    onClick={() => setIsPlanningTypeDialogOpen(true)}
                                    aria-label="Inplannen"
                                    title="Inplannen"
                                >
                                    <CalendarDays size={16} />
                                    Inplannen
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex h-10 min-w-10 items-center justify-center gap-2 px-3 sm:h-9 sm:min-w-0 sm:flex-1 sm:px-4"
                                    onClick={() => router.push(`/offertes/${id}/overzicht`)}
                                    aria-label="Calculatie"
                                    title="Calculatie"
                                >
                                    <PenTool size={16} />
                                    Calculatie
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex h-10 w-10 items-center justify-center p-0 sm:h-9 sm:w-9"
                                    aria-label="PDF instellingen"
                                    title="PDF instellingen"
                                    onClick={() => setIsPdfSettingsOpen(true)}
                                >
                                    <Settings size={16} />
                                </Button>
                                <Button
                                    type="button"
                                    variant="success"
                                    onClick={() => {
                                        void handleDownloadPDF();
                                    }}
                                    className="flex h-10 w-10 items-center justify-center p-0 sm:h-9 sm:w-9"
                                    disabled={!totals || loading || isGeneratingPDF}
                                    aria-label="Download"
                                    title="Download"
                                >
                                    {isGeneratingPDF ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download size={18} />
                                    )}
                                </Button>
                                <Button
                                    variant="success"
                                    className="flex h-10 w-10 items-center justify-center p-0 sm:h-9 sm:w-9"
                                    onClick={() => setIsWhatsAppModalOpen(true)}
                                    aria-label="WhatsApp"
                                    title="WhatsApp"
                                >
                                    <MessageCircle size={16} />
                                </Button>
                                <Button
                                    variant="success"
                                    className="flex h-10 w-10 items-center justify-center p-0 sm:h-9 sm:w-9"
                                    onClick={() => setIsSendModalOpen(true)}
                                    aria-label="Versturen"
                                    title="Versturen"
                                >
                                    <Mail size={16} />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="mobile-calm mx-auto max-w-7xl p-4 pb-28 sm:p-6 sm:pb-10">
                {error ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="text-red-400 font-medium">Fout bij laden: {error}</div>
                        <Button asChild variant="secondary">
                            <Link href="/dashboard">Terug naar Dashboard</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                    {showCalculationBanner && (
                        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                            <div className="flex items-start gap-3">
                                <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-300" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-amber-200">Calculatie wordt uitgevoerd</p>
                                    <p className="text-xs text-amber-100/80">{calculationBannerMessage}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                        <div className="relative z-30 pointer-events-auto sm:hidden space-y-1.5 rounded-xl border border-border bg-card p-2">
                            <TabsList className="h-auto w-full justify-between gap-1 bg-transparent p-0">
                                <TabsTrigger value="overzicht" className="relative z-[31] h-10 flex-1 px-2 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    Overzicht
                                </TabsTrigger>
                                <TabsTrigger value="materialen" className="relative z-[31] h-10 flex-1 px-2 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    Materialen
                                </TabsTrigger>
                                <TabsTrigger value="pdf" className="relative z-[31] h-10 flex-1 px-2 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                    PDF
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                type="button"
                                variant={isSecondarySectionActive ? 'secondary' : 'outline'}
                                className="h-9 w-full justify-between px-3 text-sm"
                                onClick={() => setIsMobileMoreSectionsOpen(true)}
                            >
                                <span>Meer</span>
                                <ChevronDown size={16} />
                            </Button>
                        </div>

                        <div className="relative z-30 pointer-events-auto hidden w-full items-center gap-2 rounded-lg border border-border bg-card p-1 sm:flex">
                            <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
                                <TabsTrigger value="materialen" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <Package size={16} />
                                    Materialen
                                    {materialsWithoutPrice > 0 && (
                                        <div className="ml-1 flex items-center gap-0.5 text-[10px] font-semibold text-red-500">
                                            <AlertCircle size={10} />
                                            {materialsWithoutPrice}
                                        </div>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="overzicht" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <Euro size={16} />
                                    Overzicht
                                </TabsTrigger>
                                <TabsTrigger value="nacalculatie" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <ClipboardList size={16} />
                                    Nacalculatie
                                </TabsTrigger>
                                <TabsTrigger value="tekeningen" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <PenTool size={16} />
                                    Tekeningen
                                </TabsTrigger>
                                <TabsTrigger value="pdf" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <FileText size={16} />
                                    PDF
                                </TabsTrigger>
                                <TabsTrigger value="fotos" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <ImageIcon size={16} />
                                    Foto&apos;s
                                </TabsTrigger>
                                <TabsTrigger
                                    value="werkbeschrijving"
                                    className={cn(
                                        "relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground",
                                        showWerkbeschrijvingWarning && "text-red-400 data-[state=active]:text-red-400"
                                    )}
                                >
                                    <ClipboardList size={16} />
                                    Werkbeschrijving
                                    {showWerkbeschrijvingWarning && <AlertCircle size={12} className="text-red-500" />}
                                </TabsTrigger>
                                <TabsTrigger value="notities" className="relative z-[31] items-center gap-2 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground">
                                    <MessageSquare size={16} />
                                    Notities
                                </TabsTrigger>
                            </TabsList>
                        </div>

                            <Dialog open={isPdfSettingsOpen} onOpenChange={(open) => {
                                setIsPdfSettingsOpen(open);
                                if (open) {
                                    setVoorwaardenEditorMode('vastePrijs');
                                }
                                if (!open && !hasSavedPdfSettings) {
                                    // User closed dialog without saving - mark as saved with defaults
                                    setHasSavedPdfSettings(true);
                                    handlePdfSettingsChange(pdfSettings);
                                }
                            }}>
                                <DialogContent className="w-[96vw] sm:max-w-6xl p-0 overflow-hidden bg-background border-border shadow-2xl">
                                        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/70">
                                            <DialogTitle>PDF Instellingen</DialogTitle>
                                            <DialogDescription>
                                                Stel de offerte-opmaak in per onderdeel. Wijzigingen worden automatisch opgeslagen.
                                            </DialogDescription>
                                        </DialogHeader>

                                        {!hasSavedPdfSettings && (
                                            <div className="mx-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                                <p className="text-sm font-medium text-blue-400">👋 Welkom! Stel eerst je PDF voorkeuren in</p>
                                                <p className="text-xs text-blue-400/70 mt-1">Kies welke informatie je op offertes en facturen wilt tonen. Deze instellingen worden onthouden voor volgende offertes.</p>
                                            </div>
                                        )}

                                        <div className="max-h-[78vh] overflow-y-auto">
                                            <div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                                <p className="text-xs text-muted-foreground">
                                                    {isSavingPdfSettings
                                                        ? 'Opslaan...'
                                                        : pdfSettingsSavedAt
                                                            ? `Opgeslagen ${formatDistanceToNow(new Date(pdfSettingsSavedAt), { addSuffix: true, locale: nl })}`
                                                            : 'Wijzigingen worden automatisch opgeslagen.'}
                                                </p>
                                            </div>

                                            <div className="px-6 py-5 pb-24">
                                                <div className="mx-auto w-full max-w-5xl space-y-6">
                                                    <section className="rounded-2xl border border-white/10 bg-muted/45 shadow-[0_10px_24px_rgba(0,0,0,0.22)] overflow-hidden">
                                                        <div className="border-b border-white/10 bg-muted/65 px-5 py-3.5">
                                                            <h3 className="text-sm font-semibold text-foreground">1. Inhoud en Samenvatting</h3>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                Kies welke onderdelen zichtbaar zijn in de PDF en op de eerste pagina.
                                                            </p>
                                                        </div>
                                                        <div className="p-3">
                                                            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 p-3">
                                                                <div>
                                                                    <div className="text-sm font-medium">Onder voorbehoud</div>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        Toon PDF als richtprijs (incl. nacalculatie-tekst).
                                                                    </p>
                                                                </div>
                                                                <Switch
                                                                    checked={onderVoorbehoud}
                                                                    onCheckedChange={setOnderVoorbehoud}
                                                                    aria-label="Onder voorbehoud inschakelen"
                                                                />
                                                            </div>
                                                            <QuoteSettings
                                                                settings={pdfSettings}
                                                                onChange={handlePdfSettingsChange}
                                                                variant="flat"
                                                            />
                                                        </div>
                                                    </section>

                                                    {quoteSettings && (
                                                        <section className="rounded-2xl border border-white/10 bg-muted/45 shadow-[0_10px_24px_rgba(0,0,0,0.22)] overflow-hidden">
                                                            <div className="border-b border-white/10 bg-muted/65 px-5 py-3.5">
                                                                <h3 className="text-sm font-semibold text-foreground">2. Financiële instellingen</h3>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    Bepaal hoe winstmarge en facturatie worden toegepast.
                                                                </p>
                                                            </div>
                                                            <div className="p-5 space-y-5">
                                                                <div className="grid gap-2 max-w-md">
                                                                    <Label htmlFor="pdf-winstmarge-basis">Winstmarge basis</Label>
                                                                    <select
                                                                        id="pdf-winstmarge-basis"
                                                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                                                        value={quoteSettings.extras.winstMarge.basis}
                                                                        onChange={(e) => {
                                                                            const nextBasis = e.target.value as 'totaal' | 'arbeid' | 'materiaal';
                                                                            void handleUpdateSettings({
                                                                                ...quoteSettings,
                                                                                extras: {
                                                                                    ...quoteSettings.extras,
                                                                                    winstMarge: {
                                                                                        ...quoteSettings.extras.winstMarge,
                                                                                        basis: nextBasis,
                                                                                    },
                                                                                },
                                                                            });
                                                                        }}
                                                                    >
                                                                        <option value="totaal">Totaal</option>
                                                                        <option value="materiaal">Materialen</option>
                                                                        <option value="arbeid">Arbeid</option>
                                                                    </select>
                                                                </div>

                                                                {totals && (
                                                                    <div className="space-y-4 rounded-xl border border-white/10 bg-muted/60 p-4">
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
                                                                            Onder voorbehoud instellen? Dit regel je hierboven bij <span className="font-medium text-foreground">Inhoud en Samenvatting</span>.
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
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </section>
                                                    )}

                                                    <section className="rounded-2xl border border-white/10 bg-muted/45 shadow-[0_10px_24px_rgba(0,0,0,0.22)] overflow-hidden">
                                                        <div className="border-b border-white/10 bg-muted/65 px-5 py-3.5">
                                                            <h3 className="text-sm font-semibold text-foreground">3. Voorwaarden en teksten</h3>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                Bewerk voorwaarden, afsluiting en ondertekeningstekst per offerte.
                                                            </p>
                                                        </div>

                                                        <div className="p-5 space-y-4">
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

                                                            <div className="space-y-3 rounded-xl border border-white/10 bg-muted/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                                                <div>
                                                                    <Label>
                                                                        {voorwaardenEditorMode === 'vastePrijs'
                                                                            ? 'Regels voor vaste prijs'
                                                                            : 'Regels voor onder voorbehoud'}
                                                                    </Label>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">Per regel kun je een rode tekststijl aanzetten met de knop ‘Rood’.</p>
                                                                </div>
                                                                {actieveVoorwaarden.map((regel, index) => (
                                                                    <div key={`${voorwaardenEditorMode}-${index}`} className="flex items-center gap-2">
                                                                        <Input
                                                                            value={regel}
                                                                            onChange={(e) => updateVoorwaardenAt(index, e.target.value)}
                                                                            placeholder="Voorwaarde..."
                                                                            className={cn(
                                                                                getRodeVoorwaardenByMode(pdfTextSettings, voorwaardenEditorMode).includes(index)
                                                                                    ? 'text-red-400 border-red-500/40'
                                                                                    : undefined
                                                                            )}
                                                                        />
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            className={cn(
                                                                                'h-9 px-3 text-xs',
                                                                                getRodeVoorwaardenByMode(pdfTextSettings, voorwaardenEditorMode).includes(index)
                                                                                    ? 'border-red-500/50 text-red-400 hover:text-red-300'
                                                                                    : 'text-muted-foreground'
                                                                            )}
                                                                            onClick={() => toggleVoorwaardeRood(index)}
                                                                        >
                                                                            Rood
                                                                        </Button>
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

                                                            <div className="space-y-4 rounded-xl border border-white/10 bg-muted/60 p-4">
                                                                <div className="space-y-2">
                                                                    <Label htmlFor="pdfAfsluitingTekst">Afsluitingstekst</Label>
                                                                    <textarea
                                                                        id="pdfAfsluitingTekst"
                                                                        value={pdfTextSettings.afsluitingTekst}
                                                                        onChange={(e) =>
                                                                            ((hasEditedPdfTextSettingsRef.current = true),
                                                                            setPdfTextSettings((prev) => ({
                                                                                ...prev,
                                                                                afsluitingTekst: e.target.value,
                                                                            })))
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
                                                                                ((hasEditedPdfTextSettingsRef.current = true),
                                                                                setPdfTextSettings((prev) => ({
                                                                                    ...prev,
                                                                                    groetTekst: e.target.value,
                                                                                })))
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
                                                                                ((hasEditedPdfTextSettingsRef.current = true),
                                                                                setPdfTextSettings((prev) => ({
                                                                                    ...prev,
                                                                                    ondertekeningNaam: e.target.value,
                                                                                })))
                                                                            }
                                                                            placeholder="Leeg = bedrijfsnaam uit profiel"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </section>

                                                    <section className="rounded-2xl border border-white/10 bg-muted/45 shadow-[0_10px_24px_rgba(0,0,0,0.22)] overflow-hidden">
                                                        <div className="border-b border-white/10 bg-muted/65 px-5 py-3.5">
                                                            <h3 className="text-sm font-semibold text-foreground">4. Branding</h3>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                Upload en pas logo en handtekening aan voor de PDF-uitstraling.
                                                            </p>
                                                        </div>

                                                        <div className="p-5 grid gap-4 lg:grid-cols-2">
                                                            <div className="space-y-3 rounded-xl border border-white/10 bg-muted/60 p-4">
                                                                <h4 className="font-medium text-foreground">Bedrijfslogo</h4>
                                                                {user && (
                                                                    <LogoUpload
                                                                        currentLogoUrl={userProfile?.settings?.logoUrl || undefined}
                                                                        userId={user.uid}
                                                                        onLogoChange={handlePdfLogoChange}
                                                                    />
                                                                )}
                                                            </div>

                                                            <div className="space-y-3 rounded-xl border border-white/10 bg-muted/60 p-4">
                                                                <h4 className="font-medium">Handtekening</h4>
                                                                <p className="text-sm text-muted-foreground">
                                                                    Deze handtekening wordt onderaan elke pagina van de offerte-PDF geplaatst.
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

                                                        {(userProfile?.settings?.logoUrl || '').trim() !== '' && (
                                                            <div className="px-5 pb-5">
                                                                <div className="rounded-xl border border-white/10 bg-muted/60 p-4">
                                                                    <Label htmlFor="pdfLogoScale">Logogrootte in PDF</Label>
                                                                    <div className="flex items-center gap-4 mt-2">
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
                                                                    <p className="text-xs text-muted-foreground mt-2">
                                                                        Pas de grootte van het logo in de PDF aan (50% - 200%).
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="px-5 pb-5">
                                                            <div className="rounded-xl border border-white/10 bg-muted/60 p-4 space-y-3">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div>
                                                                        <h4 className="font-medium text-foreground">Algemene voorwaarden (PDF)</h4>
                                                                        <p className="text-xs text-muted-foreground">Upload een bestaande voorwaarden-PDF voor losse download of verzending.</p>
                                                                    </div>
                                                                    <Switch
                                                                        checked={pdfSettings.showAlgemeneVoorwaarden}
                                                                        onCheckedChange={(checked) =>
                                                                            void handlePdfSettingsChange({
                                                                                ...pdfSettings,
                                                                                showAlgemeneVoorwaarden: checked,
                                                                            })
                                                                        }
                                                                        aria-label="Algemene voorwaarden op offerte tonen"
                                                                    />
                                                                </div>
                                                                <input
                                                                    ref={algemeneVoorwaardenModalInputRef}
                                                                    type="file"
                                                                    accept="application/pdf"
                                                                    className="hidden"
                                                                    onChange={(event) => {
                                                                        const file = event.target.files?.[0];
                                                                        if (file) {
                                                                            void handleAlgemeneVoorwaardenPdfUpload(file);
                                                                        }
                                                                    }}
                                                                />
                                                                <div className="flex flex-wrap gap-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        onClick={() => algemeneVoorwaardenModalInputRef.current?.click()}
                                                                        disabled={isUploadingAlgemeneVoorwaardenPdf}
                                                                    >
                                                                        {isUploadingAlgemeneVoorwaardenPdf ? (
                                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                        ) : (
                                                                            <Upload className="mr-2 h-4 w-4" />
                                                                        )}
                                                                        PDF uploaden
                                                                    </Button>
                                                                    {algemeneVoorwaardenPdfUrl && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            onClick={() => window.open(algemeneVoorwaardenPdfUrl, '_blank', 'noopener,noreferrer')}
                                                                        >
                                                                            <Download className="mr-2 h-4 w-4" />
                                                                            Download
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {algemeneVoorwaardenPdfBestandsnaam
                                                                        ? `Bestand: ${algemeneVoorwaardenPdfBestandsnaam}`
                                                                        : 'Nog geen algemene voorwaarden PDF geüpload.'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </section>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs text-muted-foreground">
                                                    {isSavingPdfSettings
                                                        ? 'Opslaan...'
                                                        : pdfSettingsSavedAt
                                                            ? `Opgeslagen ${formatDistanceToNow(new Date(pdfSettingsSavedAt), { addSuffix: true, locale: nl })}`
                                                            : 'Wijzigingen worden automatisch opgeslagen.'}
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="success"
                                                    className="gap-2"
                                                    onClick={savePdfSettingsNow}
                                                    disabled={isSavingPdfSettings}
                                                >
                                                    {isSavingPdfSettings ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                                    Opslaan
                                                </Button>
                                            </div>
                                        </div>
                                </DialogContent>
                            </Dialog>

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
                                        <ClientInfoCard
                                            klantInfo={klantInfo}
                                            onEditClient={() => {
                                                const redirect = encodeURIComponent(`/offertes/${id}`);
                                                router.push(`/offertes/${id}/klant?successRedirect=${redirect}`);
                                            }}
                                        />
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
                                                onUpdateMaterialenGrootTotal={handleUpdateMaterialenGrootTotal}
                                                onUpdateMaterialenVerbruikTotal={handleUpdateMaterialenVerbruikTotal}
                                                onUpdateMaterialenSubtotal={handleUpdateMaterialenSubtotal}
                                                onUpdateTransportTotal={handleUpdateTransportTotal}
                                                onUpdateWinstMargePercentage={handleUpdateWinstMargePercentage}
                                                onUpdateWinstMargeAmountExcl={handleUpdateWinstMargeAmountExcl}
                                            />
                                        </div>
                                    </div>

                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="nacalculatie" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {isUserLoading || !user ? (
                                <LoadingPanel />
                            ) : (
                                <NacalculatieTab
                                    quoteId={id}
                                    userId={user.uid}
                                    defaultHourlyRateExcl={quoteSettings?.uurTariefExclBtw || 50}
                                />
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
                                    <div className="space-y-3 pb-8 mb-8 border-b border-border/60">
                                        <div
                                            className="grid w-full items-stretch grid-cols-[minmax(0,1fr)_auto] gap-2"
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
                                                className="h-10 min-w-[88px] rounded-xl border-border/70 bg-card/40 px-3 text-foreground hover:bg-muted/40 hover:border-border font-semibold sm:min-w-[108px]"
                                                onClick={handleRequestResetMaterialPackageToNieuw}
                                            >
                                                <Sparkles className="mr-2 hidden h-4 w-4 text-muted-foreground sm:inline-block" />
                                                Nieuw
                                            </Button>
                                        </div>
                                    </div>

                                    {!quoteSettings ? (
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
                                            totaalUren={laborTotalHours}
                                            uurTarief={quoteSettings?.uurTariefExclBtw || 0}
                                            btwTarief={quoteSettings?.btwTarief || 21}
                                            urenPerDag={laborHoursPerDay}
                                            showSummaryInHeader
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
                                        categoryStyle="neutral"
                                        showAdvancedControlsMenu
                                        hideHeader
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

                        {/* PDF Tab */}
                        <TabsContent value="pdf" className="mt-6 space-y-4">
                            <div className="flex items-center justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => setIsPdfFocusMode(true)}
                                    disabled={loading || !isDrawingsReady}
                                >
                                    <Maximize2 className="h-4 w-4" />
                                    Focusmodus
                                </Button>
                            </div>

                            {loading ? (
                                <LoadingPanel />
                            ) : !isDrawingsReady ? (
                                <div className="bg-card rounded-lg border border-border p-12 text-center">
                                    <div className="text-muted-foreground">PDF voorbereiden...</div>
                                </div>
                            ) : (
                                <PDFPreview
                                    pdfData={buildPDFData()}
                                    iframeClassName="w-full h-[82vh] rounded border border-zinc-700"
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="werkbeschrijving" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <WorkDescriptionWorkspace
                                    value={workDescriptionStructured}
                                    mode={workDescriptionMode}
                                    onModeChange={setWorkDescriptionMode}
                                    onChange={handleWorkDescriptionChange}
                                    onGenerate={(action) => { void handleGenerateWorkDescription(action); }}
                                    isGenerating={isGeneratingWorkDescription}
                                    isAutoSaving={isAutoSavingWorkDescription}
                                    templateLabel={detectedWorkDescriptionTemplate?.label || null}
                                    onApplyTemplate={detectedWorkDescriptionTemplate ? handleApplyWorkDescriptionTemplate : undefined}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="bonnetjes" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <div className="space-y-4 rounded-lg border border-border bg-card p-6">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground">Bonnetjes</h3>
                                            <p className="text-xs text-muted-foreground">
                                                Upload foto&apos;s of PDF&apos;s en download ze met bestandsnaam op basis van offerte + klant.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                ref={receiptInputRef}
                                                type="file"
                                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                                className="hidden"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    void handleUploadReceipt(file);
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="gap-2"
                                                onClick={() => receiptInputRef.current?.click()}
                                                disabled={isUploadingReceipt}
                                            >
                                                {isUploadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                                Upload bonnetje
                                            </Button>
                                        </div>
                                    </div>

                                    {sortedReceiptAttachments.length === 0 ? (
                                        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                                            Nog geen bonnetjes toegevoegd.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {sortedReceiptAttachments.map((attachment, index) => {
                                                const createdAt = parseReceiptCreatedAt(attachment.createdAt);
                                                const isBusy = receiptActionId === attachment.id;
                                                return (
                                                    <div
                                                        key={attachment.id}
                                                        className="flex flex-col gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                                    >
                                                        <div className="min-w-0 space-y-1">
                                                            <div className="truncate text-sm font-medium text-foreground">{attachment.originalName}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {formatReceiptSize(attachment.sizeBytes)} · {attachment.mimeType || 'onbekend type'}
                                                                {createdAt ? ` · ${createdAt.toLocaleString('nl-NL')}` : ''}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-2"
                                                                disabled={isBusy}
                                                                onClick={() => { void handleDownloadReceipt(attachment, index); }}
                                                            >
                                                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                                                Download
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-2 text-red-400 hover:text-red-300"
                                                                disabled={isBusy}
                                                                onClick={() => { void handleDeleteReceipt(attachment); }}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                Verwijderen
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="fotos" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <div className="space-y-4 rounded-lg border border-border bg-card p-6">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground">Foto&apos;s op locatie</h3>
                                            <p className="text-xs text-muted-foreground">
                                                Maak direct een foto op locatie en bekijk hem meteen terug in deze offerte.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input
                                                ref={photoCameraInputRef}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    void handleUploadPhoto(file);
                                                }}
                                            />
                                            <input
                                                ref={photoInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    void handleUploadPhoto(file);
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="gap-2"
                                                onClick={() => photoCameraInputRef.current?.click()}
                                                disabled={isUploadingPhoto}
                                            >
                                                {isUploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                                Foto maken
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="gap-2"
                                                onClick={() => photoInputRef.current?.click()}
                                                disabled={isUploadingPhoto}
                                            >
                                                <Upload className="h-4 w-4" />
                                                Foto uploaden
                                            </Button>
                                        </div>
                                    </div>

                                    {sortedPhotoAttachments.length === 0 ? (
                                        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                                            Nog geen foto&apos;s toegevoegd.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {sortedPhotoAttachments.map((photo) => {
                                                const createdAt = parseReceiptCreatedAt(photo.createdAt);
                                                const isBusy = photoActionId === photo.id;
                                                return (
                                                    <div key={photo.id} className="overflow-hidden rounded-lg border border-border/70 bg-background/50">
                                                        <button
                                                            type="button"
                                                            className="relative block w-full"
                                                            onClick={() => setSelectedPhoto(photo)}
                                                        >
                                                            <img
                                                                src={photo.downloadUrl}
                                                                alt={photo.originalName || 'Projectfoto'}
                                                                className="h-44 w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                            <div className="absolute right-2 top-2 rounded-md bg-background/90 p-1 text-foreground shadow">
                                                                <Maximize2 className="h-3.5 w-3.5" />
                                                            </div>
                                                        </button>
                                                        <div className="space-y-2 p-3">
                                                            <div className="line-clamp-1 text-sm font-medium text-foreground">
                                                                {photo.originalName}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {formatReceiptSize(photo.sizeBytes)}
                                                                {createdAt ? ` · ${createdAt.toLocaleString('nl-NL')}` : ''}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-2"
                                                                    disabled={isBusy}
                                                                    onClick={() => setSelectedPhoto(photo)}
                                                                >
                                                                    <Maximize2 className="h-3.5 w-3.5" />
                                                                    Bekijken
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-2 text-red-400 hover:text-red-300"
                                                                    disabled={isBusy}
                                                                    onClick={() => { void handleDeletePhoto(photo); }}
                                                                >
                                                                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                                    Verwijderen
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="notities" className="mt-6">
                            {loading ? (
                                <LoadingPanel />
                            ) : (
                                <div className="space-y-4 rounded-lg border border-border bg-card p-6">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            <MessageSquare className="w-4 h-4" /> Notities bij deze offerte
                                        </h3>
                                        <div className="text-xs text-muted-foreground">
                                            {isAutoSavingQuoteNotes
                                                ? 'Automatisch opslaan...'
                                                : quoteNotesSavedAt
                                                    ? `Opgeslagen ${formatDistanceToNow(quoteNotesSavedAt, { addSuffix: true, locale: nl })}`
                                                    : 'Wordt automatisch opgeslagen'}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {quoteNoteSections.map((section, index) => (
                                            <div key={section.id} className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                    <Input
                                                        value={section.title}
                                                        onChange={(e) => handleQuoteNoteSectionChange(section.id, 'title', e.target.value)}
                                                        placeholder={`Titel notitieblok ${index + 1}`}
                                                        className="h-9 sm:flex-1"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-2 self-start sm:self-auto"
                                                        onClick={() => handleRemoveQuoteNoteSection(section.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        Verwijder
                                                    </Button>
                                                </div>
                                                <textarea
                                                    value={section.notes}
                                                    onChange={(e) => handleQuoteNoteSectionChange(section.id, 'notes', e.target.value)}
                                                    placeholder="Voeg notities toe voor dit onderdeel..."
                                                    className="min-h-[180px] w-full rounded-xl border border-border/60 bg-background p-4 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-border"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="gap-2"
                                        onClick={handleAddQuoteNoteSection}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Notitieblok toevoegen
                                    </Button>
                                </div>
                            )}
                        </TabsContent>

                        {activeTab === 'materialen' && !!calculation?.data_json && (
                            <div className="quote-materials-sticky-footer mobile-calm-pane fixed bottom-0 left-0 right-0 z-30 border border-border/80 bg-background/95 backdrop-blur-sm md:bottom-0">
                                <div className="mx-auto max-w-7xl px-3 py-1.5 sm:px-6 sm:py-2">
                                    <div className="mobile-calm-card rounded-xl border border-border/70 bg-card/90 px-3 py-1.5 shadow-lg sm:px-4 sm:py-2">
                                        <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsMaterialExportOpen(true)}
                                                disabled={materialExportItems.length === 0}
                                                className="h-8 gap-2 text-xs sm:text-sm"
                                            >
                                                <Share2 className="h-3.5 w-3.5" />
                                                Materiaallijst delen
                                            </Button>
                                            <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                                                        <Package size={14} />
                                                    </div>
                                                    <h3 className="font-semibold text-foreground tracking-tight text-xs uppercase whitespace-nowrap">
                                                        Totaal offerte
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <span className="text-[11px] uppercase text-zinc-400 font-medium">
                                                        Totaal (excl. btw)
                                                    </span>
                                                    <span className="text-primary font-bold tracking-tight">
                                                        {formatCurrency(footerQuoteTotalExcl)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <span className="text-[11px] uppercase text-zinc-400 font-medium">
                                                        Totaal (incl. btw)
                                                    </span>
                                                    <span className="text-primary font-bold tracking-tight">
                                                        {formatCurrency(footerQuoteTotalIncl)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 sm:hidden">
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsMaterialExportOpen(true)}
                                                disabled={materialExportItems.length === 0}
                                                className="h-8 gap-1.5 px-2.5 text-[11px]"
                                            >
                                                <Share2 className="h-3.5 w-3.5" />
                                                Delen
                                            </Button>
                                            <div className="grid grid-cols-2 gap-3 text-right">
                                                <div className="leading-tight">
                                                    <div className="text-[10px] uppercase text-zinc-400 font-medium">Excl.</div>
                                                    <div className="text-sm font-bold text-primary">{formatCurrency(footerQuoteTotalExcl)}</div>
                                                </div>
                                                <div className="leading-tight">
                                                    <div className="text-[10px] uppercase text-zinc-400 font-medium">Incl.</div>
                                                    <div className="text-sm font-bold text-primary">{formatCurrency(footerQuoteTotalIncl)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Tabs>

                    <Sheet open={isMobileMoreActionsOpen} onOpenChange={setIsMobileMoreActionsOpen}>
                        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background sm:hidden">
                            <SheetHeader>
                                <SheetTitle>Meer acties</SheetTitle>
                            </SheetHeader>
                            <div className="grid gap-2 py-4">
                                <Button
                                    variant="outline"
                                    className="h-11 justify-start gap-2"
                                    onClick={() => {
                                        setIsMobileMoreActionsOpen(false);
                                        setIsWhatsAppModalOpen(true);
                                    }}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Versturen via WhatsApp
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 justify-start gap-2"
                                    onClick={() => {
                                        setIsMobileMoreActionsOpen(false);
                                        void handleDownloadPDF();
                                    }}
                                    disabled={!totals || loading || isGeneratingPDF}
                                >
                                    {isGeneratingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Download PDF
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 justify-start gap-2"
                                    onClick={() => {
                                        setIsMobileMoreActionsOpen(false);
                                        router.push(`/offertes/${id}/overzicht`);
                                    }}
                                >
                                    <PenTool className="h-4 w-4" />
                                    Naar calculatie
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 justify-start gap-2"
                                    onClick={() => {
                                        setIsMobileMoreActionsOpen(false);
                                        setIsPdfSettingsOpen(true);
                                    }}
                                >
                                    <Settings className="h-4 w-4" />
                                    PDF instellingen
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Dialog open={isPlanningTypeDialogOpen} onOpenChange={setIsPlanningTypeDialogOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Wat wil je inplannen?</DialogTitle>
                                <DialogDescription>
                                    Kies eerst of dit een werkbespreking of een klus is.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-2">
                                <Button
                                    variant="outline"
                                    className="justify-start border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/15"
                                    onClick={() => {
                                        setIsPlanningTypeDialogOpen(false);
                                        openPlanningWithType('werkbespreking');
                                    }}
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    Werkbespreking
                                </Button>
                                <Button
                                    variant="success"
                                    className="justify-start"
                                    onClick={() => {
                                        setIsPlanningTypeDialogOpen(false);
                                        openPlanningWithType('job');
                                    }}
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    Klus
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Sheet open={isMobileMoreSectionsOpen} onOpenChange={setIsMobileMoreSectionsOpen}>
                        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background sm:hidden">
                            <SheetHeader>
                                <SheetTitle>Meer onderdelen</SheetTitle>
                            </SheetHeader>
                            <div className="grid gap-2 py-4">
                                <Button
                                    variant={activeTab === 'werkbeschrijving' ? 'secondary' : 'outline'}
                                    className={cn('h-11 justify-start', showWerkbeschrijvingWarning && 'text-red-400')}
                                    onClick={() => {
                                        setActiveTab('werkbeschrijving');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Werkbeschrijving
                                    {showWerkbeschrijvingWarning && <AlertCircle size={12} className="ml-2 text-red-500" />}
                                </Button>
                                <Button
                                    variant={activeTab === 'nacalculatie' ? 'secondary' : 'outline'}
                                    className="h-11 justify-start"
                                    onClick={() => {
                                        setActiveTab('nacalculatie');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Nacalculatie
                                </Button>
                                <Button
                                    variant={activeTab === 'tekeningen' ? 'secondary' : 'outline'}
                                    className="h-11 justify-start"
                                    onClick={() => {
                                        setActiveTab('tekeningen');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Tekeningen
                                </Button>
                                <Button
                                    variant={activeTab === 'fotos' ? 'secondary' : 'outline'}
                                    className="h-11 justify-start"
                                    onClick={() => {
                                        setActiveTab('fotos');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Foto&apos;s
                                </Button>
                                <Button
                                    variant={activeTab === 'notities' ? 'secondary' : 'outline'}
                                    className="h-11 justify-start"
                                    onClick={() => {
                                        setActiveTab('notities');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Notities
                                </Button>
                                <Button
                                    variant={activeTab === 'algemene-voorwaarden' ? 'secondary' : 'outline'}
                                    className="h-11 justify-start"
                                    onClick={() => {
                                        setActiveTab('algemene-voorwaarden');
                                        setIsMobileMoreSectionsOpen(false);
                                    }}
                                >
                                    Algemene voorwaarden
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Dialog open={!!selectedPhoto} onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}>
                        <DialogContent className="w-[96vw] max-w-4xl border-border bg-background p-0">
                            <DialogHeader className="border-b border-border/60 px-4 py-3">
                                <DialogTitle className="line-clamp-1 text-sm">{selectedPhoto?.originalName || 'Foto'}</DialogTitle>
                            </DialogHeader>
                            {selectedPhoto && (
                                <div className="p-3 sm:p-4">
                                    <img
                                        src={selectedPhoto.downloadUrl}
                                        alt={selectedPhoto.originalName || 'Projectfoto'}
                                        className="max-h-[78vh] w-full rounded-md border border-border/60 object-contain"
                                    />
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                    </>
                )}

                {!error && !loading && activeTab !== 'materialen' && (
                    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:hidden">
                        <Button
                            variant="success"
                            className="h-12 w-full justify-center text-base font-semibold"
                            onClick={() => setIsSendModalOpen(true)}
                        >
                            <Mail className="mr-2 h-4 w-4" />
                            Versturen offerte
                        </Button>
                    </div>
                )}

                {isPdfFocusMode && (
                    <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm">
                        <div className="flex h-screen w-screen flex-col overflow-hidden">
                            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                                <div className="text-sm font-medium text-zinc-100">
                                    PDF Focusmodus
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="gap-2 border-white/20 bg-transparent text-zinc-100 hover:bg-white/10"
                                    onClick={() => setIsPdfFocusMode(false)}
                                >
                                    <X className="h-4 w-4" />
                                    Sluiten
                                </Button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
                                <PDFPreview
                                    pdfData={buildPDFData()}
                                    className="h-full border-white/10"
                                    contentClassName="h-full p-0"
                                    iframeClassName="h-full w-full rounded-none border-0"
                                    loadingHeightClassName="h-full"
                                />
                            </div>
                        </div>
                    </div>
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

            <SendQuoteWhatsAppModal
                isOpen={isWhatsAppModalOpen}
                onClose={() => setIsWhatsAppModalOpen(false)}
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
                onCreateShareableOffertePdfLink={createShareableOffertePdfLink}
            />

            {activeCategory && (
                <MaterialSelectionModal
                    open
                    onOpenChange={(open) => {
                        if (!open) setActiveCategory(null);
                    }}
                    existingMaterials={alleMaterialen}
                    onSelectExisting={handleSelectMaterial}
                    onMaterialAdded={handleSelectMaterial} // Handle custom created materials same way
                    defaultCategory="all"
                />
            )}

            <AlertDialog open={confirmResetToNieuwOpen} onOpenChange={setConfirmResetToNieuwOpen}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Starten met Nieuw?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Dit verwijdert de huidige materialen uit deze offerte en start zonder werkpakket.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-2">
                        <AlertDialogCancel className="rounded-xl">Annuleren</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                variant="destructiveSoft"
                                onClick={() => {
                                    setConfirmResetToNieuwOpen(false);
                                    void handleResetMaterialPackageToNieuw();
                                }}
                            >
                                Start nieuw
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <MaterialListExportDialog
                isOpen={isMaterialExportOpen}
                onClose={() => setIsMaterialExportOpen(false)}
                items={materialExportItems}
                meta={materialExportContext}
                suppliers={materialSuppliers}
                defaultSupplierId={defaultMaterialSupplierId}
                onUpdateSupplierContact={handleUpdateMaterialSupplierContact}
                onCreateSupplier={handleCreateMaterialSupplier}
                savedEmailTemplate={materialEmailTemplate}
                onSaveEmailTemplate={handleSaveMaterialEmailTemplate}
            />

            <Dialog open={isMaterialPackagePickerOpen} onOpenChange={setIsMaterialPackagePickerOpen}>
                <DialogContent className="w-[95vw] max-w-[1200px] h-[88vh] overflow-hidden flex flex-col">
                    <DialogHeader className="space-y-2">
                        <DialogTitle>Kies een werkpakket</DialogTitle>
                        <DialogDescription>
                            Selecteer een werkpakket of start direct zonder werkpakket.
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
                            variant="ghost"
                            onClick={() => setIsMaterialPackagePickerOpen(false)}
                        >
                            Terug
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setIsMaterialPackagePickerOpen(false);
                                openSaveMaterialPackageDialog();
                            }}
                        >
                            <Save className="h-4 w-4 mr-2" />
                            Opslaan als werkpakket
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
