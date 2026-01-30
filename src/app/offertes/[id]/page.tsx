'use client';

import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useQuoteData } from '@/hooks/useQuoteData';
import { calculateQuoteTotals, QuoteSettings as QuoteCalculationSettings, KlantInformatie, formatCurrency, MaterialItem, generateWorkSummary } from '@/lib/quote-calculations';
import { ClientInfoCard } from '@/components/quote/ClientInfoCard';
import { CostSummaryCard } from '@/components/quote/CostSummaryCard';
import { WorkDescriptionCard } from '@/components/quote/WorkDescriptionCard';
import { MaterialEditor } from '@/components/quote/MaterialEditor';
import { LaborBreakdown } from '@/components/quote/LaborBreakdown';
import { PDFPreview } from '@/components/quote/PDFPreview';
import { QuoteSettings, QuotePDFSettings, defaultQuotePDFSettings } from '@/components/quote/QuoteSettings';
import { generateQuotePDF, PDFQuoteData } from '@/lib/generate-quote-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Euro, Package, Clock, FileText, MessageSquare, Download, Mail, ArrowLeft, Pencil } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Quote } from "@/lib/types";

export default function QuotePage() {
    const params = useParams();
    const id = params?.id as string;

    // Fetch calculation data from Supabase
    const { calculation, loading: calculationLoading, error: calculationError, updateDataJson } = useQuoteData(id);

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

    // Add state for materials
    const [materials, setMaterials] = useState<{
        groot: MaterialItem[];
        verbruik: MaterialItem[];
    }>({ groot: [], verbruik: [] });

    // Initialize state from calculation data (Supabase)
    useEffect(() => {
        if (calculation?.data_json) {
            // 1. Materials
            setMaterials({
                groot: calculation.data_json.grootmaterialen || [],
                verbruik: calculation.data_json.verbruiksartikelen || [],
            });

            // 2. Client Info (Prioritize Supabase data)
            if (calculation.data_json.klantinformatie) {
                console.log("Loading client info from calculation:", calculation.data_json.klantinformatie);
                // Ensure we map it correctly if needed, or assume it matches the interface
                // Quick normalization in case of missing fields
                const rawKi = calculation.data_json.klantinformatie as any;
                const normalizedKi: KlantInformatie = {
                    klanttype: rawKi.klanttype || 'Particulier',
                    voornaam: rawKi.voornaam || '',
                    achternaam: rawKi.achternaam || '',
                    bedrijfsnaam: rawKi.bedrijfsnaam,
                    emailadres: rawKi.emailadres || rawKi['e-mailadres'] || '', // Handle both keys
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

            // 3. Settings (Prioritize Supabase data)
            if (calculation.data_json.instellingen) {
                const rawInst = calculation.data_json.instellingen as any;
                const mappedSettings: QuoteCalculationSettings = {
                    btwTarief: rawInst.btwTarief || 21,
                    uurTariefExclBtw: rawInst.uurTariefExclBtw || rawInst.uurTarief || 50,
                    schattingUren: rawInst.schattingUren ?? false,
                    extras: {
                        transport: {
                            prijsPerKm: rawInst.extras?.transport?.prijsPerKm ?? rawInst.reiskosten_prijs_per_km ?? 0.30,
                            mode: rawInst.extras?.transport?.mode ?? (rawInst.reiskosten_type === 'vast' ? 'vast' : 'perKm')
                        },
                        winstMarge: {
                            percentage: rawInst.extras?.winstMarge?.percentage ?? rawInst.winstmarge_percentage ?? 10,
                            mode: rawInst.extras?.winstMarge?.mode ?? 'percentage'
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
                                mode: inst.reiskosten_type === 'vast' ? 'vast' : 'perKm'
                            },
                            winstMarge: {
                                percentage: inst.winstmarge_percentage || 10,
                                mode: 'percentage'
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

    // Handler for adding new material items
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
    const totals = calculation?.data_json && quoteSettings
        ? calculateQuoteTotals({
            ...calculation.data_json,
            grootmaterialen: materials.groot,
            verbruiksartikelen: materials.verbruik,
        }, quoteSettings)
        : null;

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
                naam: 'Your Company Name', // TODO: Make configurable
                adres: 'Building Street 123',
                postcode: '1234 AB',
                plaats: 'Amsterdam',
                telefoon: '06-12345678',
                email: 'info@yourcompany.com',
                kvk: '12345678',
                btw: 'NL123456789B01',
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
            werkbeschrijving: generateWorkSummary(calculation.data_json.werkbeschrijving, 800),
            werkbeschrijvingFull: calculation.data_json.werkbeschrijving || [],
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
            urenSpecificatie: calculation.data_json.uren_specificatie,
            totals: {
                ...totals,
                totaalUren: calculation.data_json.totaal_uren,
                uurTarief: quoteSettings.uurTariefExclBtw,
                btwPercentage: quoteSettings.btwTarief,
                margePercentage: quoteSettings.extras.winstMarge.percentage,
            },
            settings: pdfSettings,
        };
    };

    // Download handler
    const handleDownloadPDF = async () => {
        const pdfData = buildPDFData();
        if (!pdfData) return;

        try {
            const blob = await generateQuotePDF(pdfData);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Offerte-${(quote as any)?.offerteNummer || 'concept'}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF download failed:', err);
        }
    };

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
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-zinc-700">
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
                <Tabs defaultValue="overzicht" className="space-y-6">
                    <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-lg w-full sm:w-auto flex flex-wrap h-auto">
                        <TabsTrigger value="overzicht" className="flex-1 sm:flex-none items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                            <Euro size={16} /> Overzicht
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
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
                                            <Label htmlFor="estimate-mode" className="text-zinc-400 text-sm">Uren als schatting weergeven</Label>
                                            <Switch
                                                id="estimate-mode"
                                                checked={quoteSettings?.schattingUren || false}
                                                onCheckedChange={(checked) => {
                                                    if (!quoteSettings) return;
                                                    handleUpdateSettings({ ...quoteSettings, schattingUren: checked });
                                                }}
                                            />
                                        </div>
                                        <CostSummaryCard
                                            totals={totals}
                                            settings={quoteSettings}
                                            totalUren={calculation.data_json?.totaal_uren || 0}
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
                                <WorkDescriptionCard werkbeschrijving={calculation.data_json?.werkbeschrijving || []} />
                            </div>
                        )}
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
                                />
                                <MaterialEditor
                                    title="VERBRUIKSARTIKELEN"
                                    items={materials.verbruik}
                                    onUpdatePrice={handleUpdateVerbruiksartikel}
                                    onAddItem={(item) => handleAddItem('verbruik', item)}
                                    subtotal={verbruikSubtotal}
                                    vatRate={quoteSettings?.btwTarief}
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
                                urenSpecificatie={calculation.data_json.uren_specificatie || []}
                                totaalUren={calculation.data_json.totaal_uren || 0}
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
                                    if (!calculation) return;
                                    const updatedItems = [...(calculation.data_json.uren_specificatie || [])];
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
                        <QuoteSettings
                            settings={pdfSettings}
                            onChange={setPdfSettings}
                        />
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
        </div>
    );
}
