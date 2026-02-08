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
import { Euro, Package, Clock, FileText, MessageSquare, Download, Mail, Settings, PenTool, CalendarDays, Eye, ReceiptText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Label } from '@/components/ui/label';
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

import { Quote } from "@/lib/types";

export default function QuotePage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();

    // Fetch calculation data from Supabase
    const { calculation, loading: calculationLoading, error: calculationError, updateDataJson } = useQuoteData(id);

    // Normalize calculation data
    const normalizedData = calculation?.data_json ? normalizeDataJson(calculation.data_json) : null;

    // Debug: Log calculation and normalized data
    console.log('🔄 [RENDER] Component rendering:', {
        has_calculation: !!calculation,
        raw_totaal: (calculation?.data_json as any)?.totaal_uren,
        normalized_totaal: normalizedData?.totaal_uren,
        data_is_array: Array.isArray(calculation?.data_json)
    });

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
    const [activeTab, setActiveTab] = useState('pdf');
    const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);

    const [materials, setMaterials] = useState<{
        groot: MaterialItem[];
        verbruik: MaterialItem[];
    }>({ groot: [], verbruik: [] });

    // Ref to track if we're currently updating materials to prevent race conditions
    const isUpdatingRef = useRef(false);

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

    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [voorschotIngeschakeld, setVoorschotIngeschakeld] = useState(false);
    const [voorschotPercentage, setVoorschotPercentage] = useState<number>(50);
    const [existingVoorschotInvoiceId, setExistingVoorschotInvoiceId] = useState<string | null>(null);

    // PDF Generation State
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [capturedDrawings, setCapturedDrawings] = useState<string[]>([]);
    const [isDrawingsReady, setIsDrawingsReady] = useState(false);
    const [pendingPDFAction, setPendingPDFAction] = useState<((images: string[]) => void) | null>(null);


    const [userProfile, setUserProfile] = useState<any>(null);
    const [businessData, setBusinessData] = useState<any>(null);

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
    }, [quote?.id]);

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
                    const materialenData = (json.data || []).map((m: any) => ({
                        ...m,
                        id: m.row_id || m.id,
                        // API already normalizes prijs to use prijs_incl_btw, so just use it directly
                        prijs: m.prijs ?? 0,
                        prijs_per_stuk: m.prijs ?? 0,
                        prijs_incl_btw: m.prijs_incl_btw ?? m.prijs ?? 0,
                        // Standardization for the modal
                        materiaalnaam: m.materiaalnaam || m.naam,
                        categorie: m.categorie || m.subsectie || 'Overig',
                    }));
                    setAlleMaterialen(materialenData);
                }
            } catch (err) {
                console.error("Error fetching materials:", err);
            }
        };
        fetchMaterials();
    }, [user, materialRefreshTrigger]);

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
                            prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? 0.30,
                            vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? 0,
                            mode: rawExtras?.transport?.mode ?? 'perKm'
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
                                prijsPerKm: inst.reiskosten_prijs_per_km || 0.30,
                                vasteTransportkosten: 0,
                                mode: inst.reiskosten_type === 'vast' ? 'vast' : 'perKm'
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
            console.log('📡 [API] Calling update-price:', { materiaalnaam, priceExclBtw, priceInclBtw, rowId });
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
            console.log('📡 [API] update-price response:', {
                ok: result.ok,
                status: response.status,
                rowsUpdated: result.data?.length,
                message: result.message
            });

            if (result.data && result.data[0]) {
                console.log('✅ [DATABASE] Material updated successfully:', {
                    materiaalnaam: result.data[0].materiaalnaam,
                    prijs_incl_btw: result.data[0].prijs_incl_btw,
                    eenheid: result.data[0].eenheid,
                    row_id: result.data[0].row_id
                });
                // Trigger material list refetch to show updated price
                setMaterialRefreshTrigger(prev => prev + 1);
            }

            if (!result.ok) {
                console.error('❌ [API] update-price failed:', result.message);
            }
        } catch (err) {
            console.error("❌ [API] Failed to update master price:", err);
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

    // Handler for updating grootmaterialen items
    const handleUpdateGrootItem = async (index: number, updates: Partial<MaterialItem>) => {
        console.log('🚀 [HANDLER] handleUpdateGrootItem called:', { index, updates, hasCalc: !!calculation });
        isUpdatingRef.current = true;

        try {
            const updated = [...materials.groot];
            const oldItem = updated[index];
            updated[index] = { ...updated[index], ...updates };
            setMaterials(prev => ({ ...prev, groot: updated }));
            console.log('✅ [HANDLER] Local state updated');

            if (calculation) {
                console.log('📤 [HANDLER] Has calculation, calling updateDataJson...');
                const root = unwrapRoot(calculation.data_json);
                await updateDataJson({
                    ...root,
                    grootmaterialen: updated,
                    verbruiksartikelen: materials.verbruik,
                });
                console.log('✅ [HANDLER] updateDataJson completed');
            } else {
                console.error('❌ [HANDLER] NO CALCULATION - cannot save!');
            }

            // Update master material price if changed
            if (updates.prijs_per_stuk !== undefined && updated[index].product && quoteSettings?.btwTarief) {
                console.log('💰 [MASTER] Updating master price:', {
                    product: updated[index].product,
                    prijs_excl: updates.prijs_per_stuk,
                    btw: quoteSettings.btwTarief,
                    row_id: updated[index].row_id
                });
                const priceExcl = updates.prijs_per_stuk;
                const priceIncl = priceExcl * (1 + (quoteSettings.btwTarief / 100));
                await updateMasterPrice(updated[index].product!, priceExcl, priceIncl, updated[index].row_id);
                setLastSyncedAt(new Date());
                console.log('✅ [MASTER] Price update complete');
            }

            // Update master material name if changed
            if (updates.product !== undefined && oldItem.product && updates.product !== oldItem.product) {
                console.log('📝 [MASTER] Updating master name:', {
                    oldName: oldItem.product,
                    newName: updates.product,
                    row_id: oldItem.row_id
                });
                const success = await updateMasterName(oldItem.product, updates.product, oldItem.row_id);
                if (success) {
                    setLastSyncedAt(new Date());
                    console.log('✅ [MASTER] Name updated');
                } else {
                    console.log('❌ [MASTER] Name update failed');
                }
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    // Handler for updating verbruiksartikelen items
    const handleUpdateVerbruiksItem = async (index: number, updates: Partial<MaterialItem>) => {
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

            // Update master material price if changed
            if (updates.prijs_per_stuk !== undefined && updated[index].product && quoteSettings?.btwTarief) {
                console.log('💰 [MASTER] Updating master price:', {
                    product: updated[index].product,
                    prijs_excl: updates.prijs_per_stuk,
                    btw: quoteSettings.btwTarief,
                    row_id: updated[index].row_id
                });
                const priceExcl = updates.prijs_per_stuk;
                const priceIncl = priceExcl * (1 + (quoteSettings.btwTarief / 100));
                await updateMasterPrice(updated[index].product!, priceExcl, priceIncl, updated[index].row_id);
                setLastSyncedAt(new Date());
                console.log('✅ [MASTER] Price update complete');
            }

            // Update master material name if changed
            if (updates.product !== undefined && oldItem.product && updates.product !== oldItem.product) {
                console.log('📝 [MASTER] Updating master name:', {
                    oldName: oldItem.product,
                    newName: updates.product,
                    row_id: oldItem.row_id
                });
                const success = await updateMasterName(oldItem.product, updates.product, oldItem.row_id);
                if (success) {
                    setLastSyncedAt(new Date());
                    console.log('✅ [MASTER] Name updated');
                } else {
                    console.log('❌ [MASTER] Name update failed');
                }
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    const handleAddItem = async (category: 'groot' | 'verbruik', item: MaterialItem) => {
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

    // Calculate subtotals for display
    const grootSubtotal = materials.groot.reduce(
        (sum, item) => sum + (item.prijs_per_stuk || 0) * item.aantal,
        0
    );
    const verbruikSubtotal = materials.verbruik.reduce(
        (sum, item) => sum + (item.prijs_per_stuk || 0) * item.aantal,
        0
    );

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
            await updateDataJson({
                ...calculation.data_json,
                instellingen: {
                    ...(calculation.data_json.instellingen as any),
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
            logoScale: userProfile?.settings?.logoScale || 1.0,
            bedrijf: {
                naam: (
                    userProfile?.settings?.bedrijfsnaam ||
                    businessData?.bedrijfsnaam ||
                    userProfile?.bedrijfsnaam ||
                    userProfile?.companyName ||
                    'Uw Bedrijfsnaam'
                ),
                adres: userProfile?.settings?.adres || businessData?.adres || userProfile?.adres || userProfile?.address || 'Straatnaam 123',
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
    const handleDownloadPDF = async () => {
        setCapturedDrawings([]);
        setIsDrawingsReady(false);
        setIsGeneratingPDF(true);
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
            } catch (err) {
                console.error("Error generating PDF:", err);
                alert("Er ging iets mis bij het genereren van de PDF.");
            } finally {
                setIsGeneratingPDF(false);
                setPendingPDFAction(null);
            }
        });
    };

    // Callback when drawings are captured
    const handleDrawingsCaptured = (images: string[]) => {
        // Always store the captured drawings for preview
        setCapturedDrawings(images);
        setIsDrawingsReady(true);

        if (pendingPDFAction) {
            pendingPDFAction(images);
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
            logoScale: userProfile?.settings?.logoScale || userProfile?.logoScale || 1.0,
            bedrijf: {
                naam: (
                    userProfile?.settings?.bedrijfsnaam ||
                    businessData?.bedrijfsnaam ||
                    userProfile?.bedrijfsnaam ||
                    userProfile?.companyName ||
                    'Mijn Bedrijf'
                ),
                adres: userProfile?.settings?.adres || businessData?.adres || userProfile?.adres || userProfile?.address || '',
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

    const loading = calculationLoading || firebaseLoading || isUserLoading;
    const error = calculationError || firebaseError;

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground">Laden...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
                <div className="text-red-400">Fout: {error}</div>
                <Button asChild variant="secondary"><Link href="/dashboard">Terug naar Dashboard</Link></Button>
            </div>
        );
    }

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
                        {/* Placeholder Actions */}
                        <button
                            onClick={handleDownloadPDF}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!totals}
                        >
                            <Download size={16} />
                            Download
                        </button>
                        <button
                            onClick={() => router.push(`/facturen/nieuw?quoteId=${encodeURIComponent(id)}`)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-card hover:bg-accent px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-border disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!totals}
                        >
                            <ReceiptText size={16} />
                            Maak factuur
                        </button>
                        <button
                            onClick={() => {
                                const params = new URLSearchParams({
                                    mode: 'schedule',
                                    quoteId: id,
                                    hours: String(normalizedData?.totaal_uren || 0),
                                    view: 'week'
                                });
                                router.push(`/planning?${params.toString()}`);
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-card hover:bg-accent px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-border"
                            disabled={!normalizedData?.totaal_uren}
                        >
                            <CalendarDays size={16} />
                            Inplannen
                        </button>
                        <button
                            onClick={() => setIsSendModalOpen(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-card hover:bg-accent px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-border"
                        >
                            <Mail size={16} />
                            Versturen
                        </button>

                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl p-4 pb-10 sm:p-6">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-1 rounded-lg w-full sm:w-auto">
                        <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap justify-start w-full sm:w-auto">
                            <TabsTrigger value="pdf" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                <FileText size={16} /> PDF Preview
                            </TabsTrigger>
                            <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                <Euro size={16} /> Overzicht
                            </TabsTrigger>
                            <TabsTrigger value="tekeningen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                <PenTool size={16} /> Tekeningen
                            </TabsTrigger>
                            <TabsTrigger value="materialen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                <Package size={16} /> Materialen
                            </TabsTrigger>
                            <TabsTrigger value="arbeid" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                                <Clock size={16} /> Arbeid
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
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>

                    {/* Overzicht Tab */}
                    <TabsContent value="overzicht" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!calculation?.data_json ? (
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
                                                await updateDataJson({
                                                    ...calculation.data_json,
                                                    totaal_uren: newHours,
                                                });
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Work Description */}
                                <WorkDescriptionCard werkbeschrijving={normalizedData?.werkbeschrijving || []} />

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
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="tekeningen" className="mt-6 space-y-6">
                        {quote && <DrawingsTab quote={quote} />}
                    </TabsContent>

                    {/* Materialen Tab */}
                    <TabsContent value="materialen" className="mt-6 space-y-6">
                        {!calculation?.data_json ? (
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

                                <MaterialEditor
                                    title="GROOTMATERIALEN"
                                    items={materials.groot}
                                    onUpdateItem={handleUpdateGrootItem}
                                    onRemoveItem={async () => { }}
                                    onAddItem={(item) => handleAddItem('groot', item)}
                                    subtotal={grootSubtotal}
                                    vatRate={quoteSettings?.btwTarief}
                                    onAddClick={() => setActiveCategory('groot')}
                                />
                                <MaterialEditor
                                    title="VERBRUIKSARTIKELEN"
                                    items={materials.verbruik}
                                    onUpdateItem={handleUpdateVerbruiksItem}
                                    onRemoveItem={async () => { }}
                                    onAddItem={(item) => handleAddItem('verbruik', item)}
                                    subtotal={verbruikSubtotal}
                                    vatRate={quoteSettings?.btwTarief}
                                    onAddClick={() => setActiveCategory('verbruik')}
                                />
                            </>
                        )}
                    </TabsContent>

                    {/* Arbeid Tab */}
                    <TabsContent value="arbeid" className="mt-6">
                        {!calculation?.data_json || !quoteSettings ? (
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
                                    console.log('⏰ [TOTAL UREN] Updating total hours:', { newHours });
                                    if (!calculation) return;
                                    const root = unwrapRoot(calculation.data_json);
                                    await updateDataJson({
                                        ...root,
                                        totaal_uren: newHours,
                                    });
                                    console.log('✅ [TOTAL UREN] Update complete');
                                }}
                                onUpdateItem={async (index, newHours) => {
                                    console.log('⏰ [UREN] Updating hours:', { index, newHours });
                                    if (!calculation || !normalizedData) return;
                                    const updatedItems = [...(normalizedData.uren_specificatie || [])];
                                    if (updatedItems[index]) {
                                        updatedItems[index] = { ...updatedItems[index], uren: newHours };

                                        // Recalculate total hours based on the new item value
                                        const newTotal = updatedItems.reduce((sum, item) => sum + (item.uren || 0), 0);

                                        console.log('📤 [UREN] Saving to Supabase...', { newTotal, items: updatedItems.length });
                                        const root = unwrapRoot(calculation.data_json);
                                        await updateDataJson({
                                            ...root,
                                            uren_specificatie: updatedItems,
                                            totaal_uren: newTotal
                                        });
                                        console.log('✅ [UREN] Saved successfully');
                                    }
                                }}
                            />
                        )}
                    </TabsContent>

                    {/* PDF Tab */}
                    <TabsContent value="pdf" className="mt-6 space-y-4">
                        {!isDrawingsReady ? (
                            <div className="bg-card rounded-lg border border-border p-12 text-center">
                                <div className="text-muted-foreground">PDF voorbereiden...</div>
                            </div>
                        ) : (
                            <PDFPreview
                                pdfData={buildPDFData()}
                                onDownload={handleDownloadPDF}
                            />
                        )}
                    </TabsContent>

                    {/* Notities Tab - Reusing logic could be added here involving firestore update or specific Notes component from elsewhere */}
                    <TabsContent value="notities" className="mt-6">
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
                    </TabsContent>
                </Tabs>

            </main>

            <SendQuoteModal
                isOpen={isSendModalOpen}
                onClose={() => setIsSendModalOpen(false)}
                klantInfo={klantInfo}
                offerteNummer={(quote as any)?.offerteNummer || 'CONCEPT'}
                werkbeschrijving={normalizedData?.werkbeschrijving}
                onDownloadPDF={handleDownloadPDF}
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

            {/* Hidden Drawing Generator - render when on PDF tab OR during download */}
            {(activeTab === 'pdf' || isGeneratingPDF) && quote && !isDrawingsReady && (
                <HiddenPDFDrawings
                    quote={quote}
                    onReady={handleDrawingsCaptured}
                />
            )}

        </div>

    );
}
