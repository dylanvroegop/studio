'use client';

import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useQuoteData } from '@/hooks/useQuoteData';
import { calculateQuoteTotals, QuoteSettings as QuoteCalculationSettings, KlantInformatie, formatCurrency, MaterialItem, generateWorkSummary, normalizeWerkbeschrijving, normalizeDataJson } from '@/lib/quote-calculations';
import { ClientInfoCard } from '@/components/quote/ClientInfoCard';
import { CostSummaryCard } from '@/components/quote/CostSummaryCard';
import { WorkDescriptionCard } from '@/components/quote/WorkDescriptionCard';
import { MaterialEditor } from '@/components/quote/MaterialEditor';
import { LaborBreakdown } from '@/components/quote/LaborBreakdown';
import { PDFPreview } from '@/components/quote/PDFPreview';
import { QuoteSettings, QuotePDFSettings, defaultQuotePDFSettings } from '@/components/quote/QuoteSettings';
import { generateQuotePDF, PDFQuoteData } from '@/lib/generate-quote-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Euro, Package, Clock, FileText, MessageSquare, Download, Mail, ArrowLeft, Pencil, Settings, PenTool, CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SendQuoteModal } from '@/components/quote/SendQuoteModal';
import { DrawingsTab } from '@/components/quote/DrawingsTab';
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { HiddenPDFDrawings } from '@/components/quote/HiddenPDFDrawings';
import { ScheduleModal } from '@/components/planning/ScheduleModal';
import { useEmployees } from '@/hooks/useEmployees';
import { DEFAULT_PLANNING_SETTINGS, PlanningSettings } from '@/lib/types-planning';

import { Quote } from "@/lib/types";

export default function QuotePage() {
    const params = useParams();
    const id = params?.id as string;

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
    const [activeTab, setActiveTab] = useState('overzicht');

    const [materials, setMaterials] = useState<{
        groot: MaterialItem[];
        verbruik: MaterialItem[];
    }>({ groot: [], verbruik: [] });

    // State for Material Selection Modal
    const [alleMaterialen, setAlleMaterialen] = useState<any[]>([]);
    const [activeCategory, setActiveCategory] = useState<'groot' | 'verbruik' | null>(null);

    const [isSendModalOpen, setIsSendModalOpen] = useState(false);

    // Planning Modal State
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [planningSettings, setPlanningSettings] = useState<PlanningSettings>(DEFAULT_PLANNING_SETTINGS);
    const { employees } = useEmployees();

    // PDF Generation State
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [capturedDrawings, setCapturedDrawings] = useState<string[]>([]);
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

    // Fetch Materials for Modal
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
                        prijs: typeof m.prijs === 'number' ? m.prijs : (typeof m.prijs_incl_btw === 'number' ? m.prijs_incl_btw : 0),
                        prijs_per_stuk: typeof m.prijs === 'number' ? m.prijs : (typeof m.prijs_incl_btw === 'number' ? m.prijs_incl_btw : 0),
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
    }, [user]);

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
    const updateMasterPrice = async (materiaalnaam: string, priceInclBtw: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            await fetch('/api/materialen/update-price', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    materiaalnaam,
                    prijs_incl_btw: priceInclBtw
                })
            });
        } catch (err) {
            console.error("Failed to update master price:", err);
        }
    };

    // Handler for updating grootmaterialen prices
    const handleUpdateGrootMateriaal = async (index: number, price: number) => {
        const updated = [...materials.groot];
        updated[index] = { ...updated[index], prijs_per_stuk: price };
        setMaterials(prev => ({ ...prev, groot: updated }));

        // Save to Supabase (Quote Data)
        if (calculation) {
            await updateDataJson({
                ...calculation.data_json,
                grootmaterialen: updated,
            });
        }

        // Save to Supabase (Master Data - main_material_list)
        if (updated[index].product && quoteSettings?.btwTarief) {
            const priceIncl = price * (1 + (quoteSettings.btwTarief / 100));
            const priceInclString = priceIncl.toFixed(2);
            await updateMasterPrice(updated[index].product!, priceInclString);
        }
    };

    // Handler for updating verbruiksartikelen prices
    const handleUpdateVerbruiksartikel = async (index: number, price: number) => {
        const updated = [...materials.verbruik];
        updated[index] = { ...updated[index], prijs_per_stuk: price };
        setMaterials(prev => ({ ...prev, verbruik: updated }));

        // Save to Supabase (Quote Data)
        if (calculation) {
            await updateDataJson({
                ...calculation.data_json,
                verbruiksartikelen: updated,
            });
        }

        // Save to Supabase (Master Data - main_material_list)
        if (updated[index].product && quoteSettings?.btwTarief) {
            const priceIncl = price * (1 + (quoteSettings.btwTarief / 100));
            const priceInclString = priceIncl.toFixed(2);
            await updateMasterPrice(updated[index].product!, priceInclString);
        }
    };

    const handleAddItem = async (category: 'groot' | 'verbruik', item: MaterialItem) => {
        const listKey = category === 'groot' ? 'groot' : 'verbruik';
        const jsonKey = category === 'groot' ? 'grootmaterialen' : 'verbruiksartikelen';

        const updated = [...materials[listKey], item];
        setMaterials(prev => ({ ...prev, [listKey]: updated }));

        // Save to Supabase
        if (calculation) {
            await updateDataJson({
                ...calculation.data_json,
                [jsonKey]: updated,
            });
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
            bedrijf: {
                naam: userProfile?.bedrijfsnaam || userProfile?.companyName || 'Uw Bedrijfsnaam',
                adres: userProfile?.adres || userProfile?.address || 'Straatnaam 123',
                postcode: userProfile?.postcode || userProfile?.zipcode || '1234 AB',
                plaats: userProfile?.plaats || userProfile?.city || 'Plaats',
                telefoon: userProfile?.telefoon || userProfile?.phone || '06-12345678',
                email: userProfile?.email || user?.email || 'email@voorbeeld.nl',
                kvk: userProfile?.kvk || '12345678',
                btw: userProfile?.btw || 'NL123456789B01',
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
        };
    };

    // Updated PDF Download Handler
    const handleDownloadPDF = async () => {
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
            bedrijf: {
                naam: userProfile?.bedrijfsnaam || userProfile?.companyName || businessData?.bedrijfsnaam || 'Mijn Bedrijf',
                adres: businessData?.adres || '',
                postcode: businessData?.postcode || '',
                plaats: businessData?.plaats || '',
                telefoon: businessData?.telefoon || '',
                email: businessData?.email || user?.email || '',
                kvk: businessData?.kvk || '',
                btw: businessData?.btw || '',
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

    // Old handleDownloadPDF removed to fix duplicate declaration.
    // The new one is defined above at line ~523.

    const loading = calculationLoading || firebaseLoading || isUserLoading;
    const error = calculationError || firebaseError;

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-zinc-400">Laden...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
                <div className="text-red-400">Fout: {error}</div>
                <Button asChild variant="secondary"><Link href="/dashboard">Terug naar Dashboard</Link></Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500/30">
            {/* Header */}
            <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Button asChild variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                            <Link href="/dashboard"><ArrowLeft size={20} /></Link>
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <span>{(quote as any)?.offerteNummer || 'Concept Offerte'}</span>
                                {quote?.titel && <span className="text-zinc-500 font-normal hidden sm:inline">• {quote.titel}</span>}
                            </h1>
                            {klantInfo && (
                                <p className="text-zinc-400 text-sm">
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
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
                            disabled={!normalizedData?.totaal_uren}
                        >
                            <CalendarDays size={16} />
                            Inplannen
                        </button>
                        <button
                            onClick={() => setIsSendModalOpen(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
                        >
                            <Mail size={16} />
                            Versturen
                        </button>

                        <Button asChild variant="secondary" className="gap-2 h-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-100 shadow-sm">
                            <Link href={`/offertes/${id}/klus`}>
                                <Pencil className="w-4 h-4" />
                                <span className="hidden sm:inline">Bewerken</span>
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-4 sm:p-6 pb-24">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900 border border-zinc-800 p-1 rounded-lg w-full sm:w-auto">
                        <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap justify-start w-full sm:w-auto">
                            <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <Euro size={16} /> Overzicht
                            </TabsTrigger>
                            <TabsTrigger value="tekeningen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <PenTool size={16} /> Tekeningen
                            </TabsTrigger>
                            <TabsTrigger value="materialen" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <Package size={16} /> Materialen
                            </TabsTrigger>
                            <TabsTrigger value="arbeid" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <Clock size={16} /> Arbeid
                            </TabsTrigger>
                            <TabsTrigger value="pdf" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <FileText size={16} /> PDF Preview
                            </TabsTrigger>
                            <TabsTrigger value="notities" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                                <MessageSquare size={16} /> Notities
                            </TabsTrigger>
                        </TabsList>

                        {activeTab === 'pdf' && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white mr-1">
                                        <Settings size={16} className="mr-2" /> PDF Instellingen
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 bg-zinc-900 border-zinc-800 p-0" align="end">
                                    <QuoteSettings
                                        settings={pdfSettings}
                                        onChange={handlePdfSettingsChange}
                                        variant="flat"
                                    />
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>

                    {/* Overzicht Tab */}
                    <TabsContent value="overzicht" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!calculation?.data_json ? (
                            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-12 text-center">
                                <Package size={48} className="mx-auto text-zinc-600 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-300 mb-2">Nog geen calculatie</h3>
                                <p className="text-zinc-500">
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
                                            totalUren={normalizedData?.totaal_uren || 0}
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
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="tekeningen" className="mt-6 space-y-6">
                        {quote && <DrawingsTab quote={quote} />}
                    </TabsContent>

                    {/* Materialen Tab */}
                    <TabsContent value="materialen" className="mt-6 space-y-6">
                        {!calculation?.data_json ? (
                            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-12 text-center">
                                <Package size={48} className="mx-auto text-zinc-600 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-300 mb-2">Nog geen materialen</h3>
                                <p className="text-zinc-500">
                                    De materiaalstaat wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                </p>
                            </div>
                        ) : (
                            <>
                                <MaterialEditor
                                    title="GROOTMATERIALEN"
                                    items={materials.groot}
                                    onUpdatePrice={handleUpdateGrootMateriaal}
                                    onAddItem={(item) => handleAddItem('groot', item)}
                                    subtotal={grootSubtotal}
                                    vatRate={quoteSettings?.btwTarief}
                                    onAddClick={() => setActiveCategory('groot')}
                                />
                                <MaterialEditor
                                    title="VERBRUIKSARTIKELEN"
                                    items={materials.verbruik}
                                    onUpdatePrice={handleUpdateVerbruiksartikel}
                                    onAddItem={(item) => handleAddItem('verbruik', item)}
                                    subtotal={verbruikSubtotal}
                                    vatRate={quoteSettings?.btwTarief}
                                    onAddClick={() => setActiveCategory('verbruik')}
                                />

                                {/* Total materials summary */}
                                <div className="bg-zinc-800 rounded-lg p-4 flex justify-between items-center">
                                    <span className="text-zinc-300">Totaal materialen</span>
                                    <span className="text-xl font-bold text-emerald-400">
                                        {formatCurrency(grootSubtotal + verbruikSubtotal)}
                                    </span>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* Arbeid Tab */}
                    <TabsContent value="arbeid" className="mt-6">
                        {!calculation?.data_json || !quoteSettings ? (
                            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-12 text-center">
                                <Clock size={48} className="mx-auto text-zinc-600 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-300 mb-2">Nog geen uren</h3>
                                <p className="text-zinc-500">
                                    De urenspecificatie wordt automatisch gegenereerd zodra de calculatie is voltooid.
                                </p>
                            </div>
                        ) : (
                            <LaborBreakdown
                                urenSpecificatie={normalizedData?.uren_specificatie || []}
                                totaalUren={normalizedData?.totaal_uren || 0}
                                uurTarief={quoteSettings?.uurTariefExclBtw || 0}
                                onUpdateHourlyRate={(newRate) => {
                                    if (!quoteSettings) return;
                                    handleUpdateSettings({ ...quoteSettings, uurTariefExclBtw: newRate });
                                }}
                                onUpdateTotalHours={async (newHours) => {
                                    if (!calculation) return;
                                    await updateDataJson({
                                        ...calculation.data_json,
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

                                        await updateDataJson({
                                            ...calculation.data_json,
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
                        <PDFPreview
                            pdfData={buildPDFData()}
                            onDownload={handleDownloadPDF}
                        />
                    </TabsContent>

                    {/* Notities Tab - Reusing logic could be added here involving firestore update or specific Notes component from elsewhere */}
                    <TabsContent value="notities" className="mt-6">
                        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
                            <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 relative">
                                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" /> Veldnotities
                                </h3>
                                {/*  Ideally we would iterate over jobs to show all notes, or show quote level notes. 
                                     The original code showed activeJob.notities. 
                                     Since we don't have activeJob selector here yet (simplified view), 
                                     we might just show a placeholder or aggregates.
                                 */}
                                <p className="text-zinc-500 italic">Notities functionaliteit wordt bijgewerkt.</p>
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
                bedrijfsnaam={userProfile?.bedrijfsnaam || userProfile?.companyName || businessData?.bedrijfsnaam || ''}
                afzenderNaam={businessData?.contactNaam || user?.displayName || userProfile?.naam || ''}
                korteTitel={normalizedData?.korteTitel}
                korteBeschrijving={normalizedData?.korteBeschrijving}
            />

            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                employees={employees}
                planningSettings={planningSettings}
                preselectedQuote={quote ? { id: quote.id, titel: quote.titel, klantinformatie: quote.klantinformatie as any, offerteNummer: (quote as any).offerteNummer } : undefined}
                preselectedHours={normalizedData?.totaal_uren}
            />

            <MaterialSelectionModal
                open={!!activeCategory}
                onOpenChange={(open) => !open && setActiveCategory(null)}
                existingMaterials={alleMaterialen}
                onSelectExisting={handleSelectMaterial}
                onMaterialAdded={handleSelectMaterial} // Handle custom created materials same way
                defaultCategory="all"
            />

            {/* Hidden Drawing Generator */}
            {isGeneratingPDF && quote && (
                <HiddenPDFDrawings
                    quote={quote}
                    onReady={handleDrawingsCaptured}
                />
            )}
        </div>

    );
}
