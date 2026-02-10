/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { DashboardHeader } from '@/components/DashboardHeader';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Building2, Coins, FileText, HardHat, Plus, Trash2, Edit2, X, MoreHorizontal, CalendarDays, Users } from 'lucide-react';
import { UserSettings, DEFAULT_USER_SETTINGS, BouwplaatsItem } from '@/lib/types-settings';
import { useEmployees } from '@/hooks/useEmployees';
import { EMPLOYEE_COLORS } from '@/lib/types-planning';
import { LogoUpload } from '@/components/settings/LogoUpload';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { v4 as uuidv4 } from 'uuid'; // Ensure uuid is installed or use a simple random string generator if not available. I will use crypto.randomUUID for simplicity or a simple helper if uuid is not guaranteed. I'll use a simple Math.random fallback to avoid adding deps if I can't confirm. Actually, crypto.randomUUID() is widely supported in modern browsers.


export default function InstellingenPage() {
    const showEmployeesInSettings = false;
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();

    const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('bedrijf');
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

    const composeAddress = (straat: string, huisnummer: string): string =>
        `${straat || ''} ${huisnummer || ''}`.trim();

    const splitAddress = (rawAddress: string): { straat: string; huisnummer: string } => {
        const address = (rawAddress || '').trim();
        const match = address.match(/^(.*?)(?:\s+(\d+\S*))$/);
        if (!match) return { straat: address, huisnummer: '' };
        return {
            straat: (match[1] || '').trim(),
            huisnummer: (match[2] || '').trim(),
        };
    };

    const sanitizeForFirestore = <T,>(value: T): T => {
        // Firestore rejects `undefined` values in nested objects.
        // JSON roundtrip strips undefined while keeping strings/numbers/booleans.
        return JSON.parse(JSON.stringify(value));
    };

    // Bouwplaats CRUD State
    const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
    const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
    const [currentPackageName, setCurrentPackageName] = useState('');
    const [currentPackageItems, setCurrentPackageItems] = useState<BouwplaatsItem[]>([]);

    // Employee CRUD State
    const { employees, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
    const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
    const [employeeForm, setEmployeeForm] = useState({ name: '', email: '', phone: '', color: EMPLOYEE_COLORS[0] });

    const openPackageDialog = (pkg?: { id: string, naam: string, items: BouwplaatsItem[] }) => {
        if (pkg) {
            setEditingPackageId(pkg.id);
            setCurrentPackageName(pkg.naam);
            setCurrentPackageItems([...pkg.items]); // Deepish copy
        } else {
            setEditingPackageId(null);
            setCurrentPackageName('');
            setCurrentPackageItems([]);
        }
        setIsPackageDialogOpen(true);
    };

    const savePackage = () => {
        if (!currentPackageName.trim()) return;

        const newPackage = {
            id: editingPackageId || crypto.randomUUID(),
            naam: currentPackageName,
            items: currentPackageItems
        };

        setSettings(prev => {
            const existing = prev.bouwplaatsKostenPakketten || [];
            let updated;
            if (editingPackageId) {
                updated = existing.map(p => p.id === editingPackageId ? newPackage : p);
            } else {
                updated = [...existing, newPackage];
            }
            return { ...prev, bouwplaatsKostenPakketten: updated };
        });

        setIsPackageDialogOpen(false);
    };

    const deletePackage = (id: string) => {
        setSettings(prev => ({
            ...prev,
            bouwplaatsKostenPakketten: (prev.bouwplaatsKostenPakketten || []).filter(p => p.id !== id)
        }));
    };

    const addPackageItem = () => {
        setCurrentPackageItems(prev => [
            ...prev,
            { id: crypto.randomUUID(), naam: '', prijs: 0, per: 'week', isVast: false }
        ]);
    };

    const updatePackageItem = (id: string, field: keyof BouwplaatsItem, value: any) => {
        setCurrentPackageItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const removePackageItem = (id: string) => {
        setCurrentPackageItems(prev => prev.filter(item => item.id !== id));
    };

    // Fetch Settings & Business Data
    useEffect(() => {
        if (isUserLoading || !user || !firestore) return;

        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch User Settings
                const userDocRef = doc(firestore, 'users', user.uid);
                const userSnap = await getDoc(userDocRef);
                const userSettings = userSnap.exists() ? (userSnap.data().settings || {}) : {};

                // 2. Fetch Business Data (Registration info)
                const businessDocRef = doc(firestore, 'businesses', user.uid);
                const businessSnap = await getDoc(businessDocRef);
                const businessData = businessSnap.exists() ? businessSnap.data() : {};

                // 3. Merge: Defaults -> Business Data (Prefill) -> Saved Settings (Override)
                const merged = {
                    ...DEFAULT_USER_SETTINGS,
                    // Prefill from registration data if available
                    bedrijfsnaam: businessData.bedrijfsnaam || DEFAULT_USER_SETTINGS.bedrijfsnaam,
                    kvkNummer: businessData.kvkNummer || DEFAULT_USER_SETTINGS.kvkNummer,
                    btwNummer: businessData.btwNummer || DEFAULT_USER_SETTINGS.btwNummer,
                    email: businessData.email || DEFAULT_USER_SETTINGS.email,
                    telefoon: businessData.telefoon || DEFAULT_USER_SETTINGS.telefoon,

                    // Allow saved settings to override everything
                    ...userSettings
                };

                if (!merged.huisnummer && merged.adres) {
                    const split = splitAddress(merged.adres);
                    merged.adres = split.straat;
                    merged.huisnummer = split.huisnummer;
                }

                setSettings(merged);
                setLogoUrl(merged.logoUrl || null);
                setSignatureUrl(merged.signatureUrl || null);
            } catch (error) {
                console.error("Error fetching settings:", error);
                toast({ variant: 'destructive', title: 'Fout', description: 'Kon instellingen niet laden.' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, [user, firestore, isUserLoading]);

    // Save Settings
    const handleSave = async () => {
        if (!user || !firestore) return;
        setIsSaving(true);
        try {
            const docRef = doc(firestore, 'users', user.uid);
            const cleanSettings = sanitizeForFirestore(settings);

            // Mirror address to top-level bedrijfsgegevens for external tool compatibility
            await setDoc(docRef, {
                settings: cleanSettings,
                bedrijfsgegevens: {
                    adress: composeAddress(settings.adres, settings.huisnummer),
                    straat: settings.adres || '',
                    huisnummer: settings.huisnummer || '',
                    postcode: settings.postcode || '',
                    plaats: settings.plaats || ''
                }
            }, { merge: true });

            toast({ title: 'Opgeslagen', description: 'Uw instellingen zijn bijgewerkt.' });
            router.push('/dashboard');
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon instellingen niet opslaan.' });
        } finally {
            setIsSaving(false);
        }
    };

    // Helper for updating nested state
    const update = (key: keyof UserSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Helper for deep nested updates (e.g., standaardTransport.mode)
    const updateDeep = (parent: keyof UserSettings, key: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [parent]: {
                ...(prev[parent] as any),
                [key]: value
            }
        }));
    };

    // Handle logo change with auto-save
    const handleLogoChange = async (url: string | null) => {
        setLogoUrl(url);
        const updatedSettings = { ...settings, logoUrl: url || '' };
        setSettings(updatedSettings);

        // Auto-save to Firestore immediately
        if (user && firestore) {
            try {
                const docRef = doc(firestore, 'users', user.uid);
                const cleanSettings = sanitizeForFirestore(updatedSettings);

                // Mirror address to top-level bedrijfsgegevens for external tool compatibility
                await setDoc(docRef, {
                    settings: cleanSettings,
                    bedrijfsgegevens: {
                        adress: composeAddress(updatedSettings.adres, updatedSettings.huisnummer),
                        straat: updatedSettings.adres || '',
                        huisnummer: updatedSettings.huisnummer || '',
                        postcode: updatedSettings.postcode || '',
                        plaats: updatedSettings.plaats || ''
                    }
                }, { merge: true });

                toast({
                    title: url ? 'Logo opgeslagen' : 'Logo verwijderd',
                    description: url ? 'Uw logo is automatisch opgeslagen.' : 'Uw logo is verwijderd.'
                });
            } catch (error) {
                console.error("Error saving logo:", error);
                toast({
                    variant: 'destructive',
                    title: 'Fout',
                    description: 'Kon logo niet opslaan. Probeer het opnieuw.'
                });
            }
        }
    };

    // Handle signature change with auto-save
    const handleSignatureChange = async (url: string | null) => {
        setSignatureUrl(url);
        const updatedSettings = { ...settings, signatureUrl: url || '' };
        setSettings(updatedSettings);

        if (user && firestore) {
            try {
                const docRef = doc(firestore, 'users', user.uid);
                const cleanSettings = sanitizeForFirestore(updatedSettings);

                await setDoc(docRef, {
                    settings: cleanSettings,
                    bedrijfsgegevens: {
                        adress: composeAddress(updatedSettings.adres, updatedSettings.huisnummer),
                        straat: updatedSettings.adres || '',
                        huisnummer: updatedSettings.huisnummer || '',
                        postcode: updatedSettings.postcode || '',
                        plaats: updatedSettings.plaats || ''
                    }
                }, { merge: true });

                toast({
                    title: url ? 'Handtekening opgeslagen' : 'Handtekening verwijderd',
                    description: url ? 'Uw handtekening is automatisch opgeslagen.' : 'Uw handtekening is verwijderd.'
                });
            } catch (error) {
                console.error("Error saving signature:", error);
                toast({
                    variant: 'destructive',
                    title: 'Fout',
                    description: 'Kon handtekening niet opslaan. Probeer het opnieuw.'
                });
            }
        }
    };

    if (isUserLoading || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="app-shell min-h-screen bg-background pb-10">
            <AppNavigation />
            <DashboardHeader user={user} title="Instellingen" />

            <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">



                <div className="flex items-center justify-end mb-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        variant="success"
                        className="h-10 px-4 font-bold shadow-sm"
                    >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Opslaan
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 h-auto p-1">
                        <TabsTrigger value="bedrijf" className="py-2.5">
                            <Building2 className="mr-2 h-4 w-4" />
                            Bedrijfsgegevens
                        </TabsTrigger>
                        <TabsTrigger value="financieel" className="py-2.5">
                            <Coins className="mr-2 h-4 w-4" />
                            Calculatie-instellingen
                        </TabsTrigger>
                        <TabsTrigger value="offerte" className="py-2.5">
                            <FileText className="mr-2 h-4 w-4" />
                            Offerte Config
                        </TabsTrigger>
                        <TabsTrigger value="bouwplaats" className="py-2.5">
                            <HardHat className="mr-2 h-4 w-4" />
                            Bouwplaats
                        </TabsTrigger>
                        <TabsTrigger value="planning" className="py-2.5">
                            <CalendarDays className="mr-2 h-4 w-4" />
                            Planning
                        </TabsTrigger>
                    </TabsList>

                    {/* --- BEDRIJFSGEGEVENS --- */}
                    <TabsContent value="bedrijf" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Bedrijfsprofiel</CardTitle>
                                <CardDescription>Deze gegevens worden gebruikt op uw offertes en facturen.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Bedrijfsnaam</Label>
                                    <Input value={settings.bedrijfsnaam} onChange={e => update('bedrijfsnaam', e.target.value)} placeholder="bijv. De Vries Bouw" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Contactpersoon</Label>
                                    <Input value={settings.contactNaam} onChange={e => update('contactNaam', e.target.value)} placeholder="J. de Vries" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Straat</Label>
                                    <Input value={settings.adres} onChange={e => update('adres', e.target.value)} placeholder="2e verbindingstraat" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Huisnummer</Label>
                                    <Input value={settings.huisnummer} onChange={e => update('huisnummer', e.target.value)} placeholder="22" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Postcode</Label>
                                    <Input value={settings.postcode} onChange={e => update('postcode', e.target.value)} placeholder="1234 AB" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Plaats</Label>
                                    <Input value={settings.plaats} onChange={e => update('plaats', e.target.value)} placeholder="Amsterdam" />
                                </div>
                                <div className="space-y-2">
                                    <Label>KVK Nummer</Label>
                                    <Input value={settings.kvkNummer} onChange={e => update('kvkNummer', e.target.value)} placeholder="12345678" />
                                </div>
                                <div className="space-y-2">
                                    <Label>BTW Nummer</Label>
                                    <Input value={settings.btwNummer} onChange={e => update('btwNummer', e.target.value)} placeholder="NL123456789B01" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Bedrijfslogo</CardTitle>
                                <CardDescription>Dit logo wordt getoond op uw offertes en facturen.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {user && (
                                    <LogoUpload
                                        currentLogoUrl={logoUrl || undefined}
                                        userId={user.uid}
                                        onLogoChange={handleLogoChange}
                                    />
                                )}

                                {logoUrl && (
                                    <div className="space-y-2 pt-4 border-t">
                                        <Label htmlFor="logoScale">Logogrootte in PDF</Label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                id="logoScale"
                                                type="range"
                                                min="0.5"
                                                max="2"
                                                step="0.1"
                                                value={settings.logoScale || 1.0}
                                                onChange={e => update('logoScale', parseFloat(e.target.value))}
                                                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-sm font-semibold min-w-[60px] text-right">
                                                {Math.round((settings.logoScale || 1.0) * 100)}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Pas de grootte van het logo in de PDF aan (50% - 200%). Standaard is 100%.
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-3 pt-4 border-t">
                                    <div>
                                        <h4 className="text-sm font-semibold">Handtekening in PDF</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Deze handtekening wordt automatisch onderaan uw offerte-PDF geplaatst.
                                        </p>
                                    </div>

                                    {user && (
                                        <LogoUpload
                                            currentLogoUrl={signatureUrl || undefined}
                                            userId={user.uid}
                                            onLogoChange={handleSignatureChange}
                                            itemLabel="Handtekening"
                                            storageKey="signature"
                                            recommendedText="Aanbevolen: transparante PNG met brede verhouding (bijv. 600x200px)"
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Contact & Bank</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>E-mailadres</Label>
                                    <Input type="email" value={settings.email} onChange={e => update('email', e.target.value)} placeholder="bijv. info@bedrijf.nl" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Telefoonnummer</Label>
                                    <Input type="tel" value={settings.telefoon} onChange={e => update('telefoon', e.target.value)} placeholder="06-12345678" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Website</Label>
                                    <Input value={settings.website} onChange={e => update('website', e.target.value)} placeholder="https://..." />
                                </div>
                                <div className="space-y-2 md:col-span-2 border-t pt-4 mt-2">
                                    <h4 className="text-sm font-semibold mb-2">Bankgegevens</h4>
                                </div>
                                <div className="space-y-2">
                                    <Label>IBAN</Label>
                                    <Input value={settings.iban} onChange={e => update('iban', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Banknaam</Label>
                                    <Input value={settings.bankNaam} onChange={e => update('bankNaam', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>BIC / Swift</Label>
                                    <Input value={settings.bic} onChange={e => update('bic', e.target.value)} />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- FINANCIEEL --- */}
                    <TabsContent value="financieel" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Standaard Marges & Tarieven</CardTitle>
                                <CardDescription>Deze waarden worden automatisch ingevuld bij nieuwe offertes.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Winstmarge */}
                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Standaard Winstmarge</Label>
                                        <Select
                                            value={settings.standaardWinstMarge.mode}
                                            onValueChange={v => updateDeep('standaardWinstMarge', 'mode', v)}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                                <SelectItem value="fixed">Vast Bedrag (€)</SelectItem>
                                                <SelectItem value="none">Geen</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Waarde</Label>
                                        {settings.standaardWinstMarge.mode === 'percentage' && (
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    value={settings.standaardWinstMarge.percentage ?? ''}
                                                    onChange={e => updateDeep('standaardWinstMarge', 'percentage', Number(e.target.value))}
                                                />
                                                <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                                            </div>
                                        )}
                                        {settings.standaardWinstMarge.mode === 'fixed' && (
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                                                <Input
                                                    className="pl-7"
                                                    type="number"
                                                    value={settings.standaardWinstMarge.fixedAmount ?? ''}
                                                    onChange={e => updateDeep('standaardWinstMarge', 'fixedAmount', Number(e.target.value))}
                                                />
                                            </div>
                                        )}
                                        {settings.standaardWinstMarge.mode === 'none' && <Input disabled value="-" />}
                                    </div>
                                </div>

                                {/* Transport */}
                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Standaard Transport</Label>
                                        <Select
                                            value={settings.standaardTransport.mode}
                                            onValueChange={v => updateDeep('standaardTransport', 'mode', v)}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="perKm">Per Kilometer</SelectItem>
                                                <SelectItem value="fixed">Vast Bedrag</SelectItem>
                                                <SelectItem value="none">Geen</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>
                                            {settings.standaardTransport.mode === 'perKm' ? 'Prijs per KM' : 'Vast Bedrag'}
                                        </Label>
                                        {settings.standaardTransport.mode === 'perKm' && (
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                                                <Input
                                                    className="pl-7"
                                                    type="number"
                                                    step="0.01"
                                                    value={settings.standaardTransport.prijsPerKm ?? ''}
                                                    onChange={e => updateDeep('standaardTransport', 'prijsPerKm', Number(e.target.value))}
                                                />
                                            </div>
                                        )}
                                        {settings.standaardTransport.mode === 'fixed' && (
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                                                <Input
                                                    className="pl-7"
                                                    type="number"
                                                    value={settings.standaardTransport.vasteTransportkosten ?? ''}
                                                    onChange={e => updateDeep('standaardTransport', 'vasteTransportkosten', Number(e.target.value))}
                                                />
                                            </div>
                                        )}
                                        {settings.standaardTransport.mode === 'none' && <Input disabled value="-" />}
                                    </div>
                                </div>

                                {/* Uurtarief */}
                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Standaard Uurtarief</Label>
                                        <p className="text-xs text-muted-foreground">Basis uurtarief voor arbeidscalculaties.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tarief per uur (excl. BTW)</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                                            <Input
                                                className="pl-7"
                                                type="number"
                                                value={settings.standaardUurtarief ?? ''}
                                                onChange={e => update('standaardUurtarief', Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- OFFERTE CONFIG --- */}
                    <TabsContent value="offerte" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Configuratie</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Offertenummer Prefix</Label>
                                    <Input
                                        value={settings.offerteNummerPrefix}
                                        onChange={e => update('offerteNummerPrefix', e.target.value)}
                                        placeholder="bv. 2024-"
                                    />
                                    <p className="text-xs text-muted-foreground">Voorlooptekst voor elk offertenummer.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Startnummer</Label>
                                    <Input
                                        type="number"
                                        value={settings.offerteNummerStart}
                                        onChange={e => update('offerteNummerStart', Number(e.target.value))}
                                    />
                                    <p className="text-xs text-muted-foreground">Volgende nummer in de reeks.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Geldigheid (dagen)</Label>
                                    <Input
                                        type="number"
                                        value={settings.standaardGeldigheidDagen}
                                        onChange={e => update('standaardGeldigheidDagen', Number(e.target.value))}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Factuur Configuratie</CardTitle>
                                <CardDescription>Standaard instellingen voor nieuwe facturen.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Factuurnummer Prefix</Label>
                                    <Input
                                        value={settings.factuurNummerPrefix}
                                        onChange={e => update('factuurNummerPrefix', e.target.value)}
                                        placeholder="bv. 2024-"
                                    />
                                    <p className="text-xs text-muted-foreground">Voorlooptekst voor elk factuurnummer.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Startnummer</Label>
                                    <Input
                                        type="number"
                                        value={settings.factuurNummerStart}
                                        onChange={e => update('factuurNummerStart', Number(e.target.value))}
                                    />
                                    <p className="text-xs text-muted-foreground">Volgende nummer in de reeks.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Betaaltermijn (dagen)</Label>
                                    <Input
                                        type="number"
                                        value={settings.standaardBetaaltermijnDagen}
                                        onChange={e => update('standaardBetaaltermijnDagen', Number(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Standaard voorschot (%)</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={settings.standaardVoorschotPercentage}
                                            onChange={e => update('standaardVoorschotPercentage', Number(e.target.value))}
                                        />
                                        <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                                    </div>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Standaard Factuurtekst</Label>
                                    <Textarea
                                        rows={3}
                                        value={settings.standaardFactuurTekst}
                                        onChange={e => update('standaardFactuurTekst', e.target.value)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Standaard Teksten</CardTitle>
                                <CardDescription>Standaard inleiding en afsluiting voor nieuwe offertes.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Introductie Tekst</Label>
                                    <Textarea
                                        rows={4}
                                        value={settings.standaardIntroTekst}
                                        onChange={e => update('standaardIntroTekst', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Afsluitende Tekst</Label>
                                    <Textarea
                                        rows={4}
                                        value={settings.standaardSluitTekst}
                                        onChange={e => update('standaardSluitTekst', e.target.value)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- BOUWPLAATS --- */}
                    <TabsContent value="bouwplaats">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div>
                                    <CardTitle>Bouwplaatskosten Pakketten</CardTitle>
                                    <CardDescription>Maak standaard pakketten aan voor veelvoorkomende bouwplaatskosten.</CardDescription>
                                </div>
                                <Button onClick={() => openPackageDialog()} size="sm" variant="outline">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Nieuw Pakket
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-6">
                                {(settings.bouwplaatsKostenPakketten || []).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center bg-muted/10">
                                        <HardHat className="h-10 w-10 text-muted-foreground mb-4" />
                                        <p className="text-muted-foreground mb-4">Nog geen pakketten aangemaakt.</p>
                                        <Button onClick={() => openPackageDialog()} variant="outline">
                                            Start met aanmaken
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {settings.bouwplaatsKostenPakketten.map((pkg) => (
                                            <div key={pkg.id} className="group relative flex flex-col justify-between rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all">
                                                <div className="p-6">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <h3 className="font-semibold text-lg leading-none tracking-tight">{pkg.naam}</h3>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-4">{pkg.items.length} items</p>
                                                    <div className="space-y-1">
                                                        {pkg.items.slice(0, 3).map(item => (
                                                            <div key={item.id} className="text-sm flex justify-between">
                                                                <span className="text-muted-foreground truncate max-w-[70%]">{item.naam}</span>
                                                                <span className="font-medium">€{item.prijs}</span>
                                                            </div>
                                                        ))}
                                                        {pkg.items.length > 3 && (
                                                            <div className="text-xs text-muted-foreground pt-1">+ {pkg.items.length - 3} meer...</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="p-4 pt-0 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openPackageDialog(pkg)}>
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => deletePackage(pkg.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- PLANNING --- */}
                    <TabsContent value="planning" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Werkdag Instellingen</CardTitle>
                                <CardDescription>Standaard werktijden voor de planning.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Werkuren per dag</Label>
                                        <p className="text-xs text-muted-foreground">Standaard aantal uur per werkdag voor automatische planning.</p>
                                    </div>
                                    <div className="space-y-4">
                                        <Label>Uren per dag</Label>
                                        <Input
                                            type="number"
                                            value={settings.planningSettings?.defaultWorkdayHours ?? 8}
                                            onChange={e => updateDeep('planningSettings', 'defaultWorkdayHours', Number(e.target.value))}
                                        />
                                        <div className="space-y-2">
                                            <Label>Pauze (minuten)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={5}
                                                value={settings.planningSettings?.pauzeMinuten ?? ''}
                                                onChange={e => updateDeep('planningSettings', 'pauzeMinuten', e.target.value === '' ? undefined : Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Werktijden</Label>
                                        <p className="text-xs text-muted-foreground">Standaard start- en eindtijd.</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1 space-y-2">
                                            <Label>Start</Label>
                                            <Input
                                                type="time"
                                                value={settings.planningSettings?.defaultStartTime ?? '08:00'}
                                                onChange={e => updateDeep('planningSettings', 'defaultStartTime', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <Label>Eind</Label>
                                            <Input
                                                type="time"
                                                value={settings.planningSettings?.defaultEndTime ?? '17:00'}
                                                onChange={e => updateDeep('planningSettings', 'defaultEndTime', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Label className="font-semibold">Werkdagen</Label>
                                        <p className="text-xs text-muted-foreground">Selecteer welke dagen werkdagen zijn.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { day: 1, label: 'Ma' },
                                            { day: 2, label: 'Di' },
                                            { day: 3, label: 'Wo' },
                                            { day: 4, label: 'Do' },
                                            { day: 5, label: 'Vr' },
                                            { day: 6, label: 'Za' },
                                            { day: 7, label: 'Zo' },
                                        ].map(({ day, label }) => (
                                            <label key={day} className="flex items-center gap-2 cursor-pointer">
                                                <Checkbox
                                                    checked={(settings.planningSettings?.workDays ?? [1, 2, 3, 4, 5]).includes(day)}
                                                    onCheckedChange={(checked) => {
                                                        const current = settings.planningSettings?.workDays ?? [1, 2, 3, 4, 5];
                                                        const updated = checked
                                                            ? [...current, day].sort((a, b) => a - b)
                                                            : current.filter(d => d !== day);
                                                        updateDeep('planningSettings', 'workDays', updated);
                                                    }}
                                                />
                                                <span className="text-sm">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="space-y-1">
                                        <Label className="font-semibold">Automatisch opdelen</Label>
                                        <p className="text-xs text-muted-foreground">Splits grote klussen automatisch over meerdere werkdagen.</p>
                                    </div>
                                    <Switch
                                        checked={settings.planningSettings?.allowAutoSplit ?? true}
                                        onCheckedChange={(checked) => updateDeep('planningSettings', 'allowAutoSplit', checked)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {showEmployeesInSettings && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div>
                                    <CardTitle>Medewerkers</CardTitle>
                                    <CardDescription>Beheer je team voor de planning.</CardDescription>
                                </div>
                                <Button onClick={() => {
                                    setEditingEmployeeId(null);
                                    setEmployeeForm({ name: '', email: '', phone: '', color: EMPLOYEE_COLORS[employees.length % EMPLOYEE_COLORS.length] });
                                    setIsEmployeeDialogOpen(true);
                                }} size="sm" variant="outline">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Medewerker
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-6">
                                {employees.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center bg-muted/10">
                                        <Users className="h-10 w-10 text-muted-foreground mb-4" />
                                        <p className="text-muted-foreground mb-4">Nog geen medewerkers toegevoegd.</p>
                                        <Button onClick={() => {
                                            setEditingEmployeeId(null);
                                            setEmployeeForm({ name: '', email: '', phone: '', color: EMPLOYEE_COLORS[0] });
                                            setIsEmployeeDialogOpen(true);
                                        }} variant="outline">
                                            Voeg medewerker toe
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {employees.map((emp) => (
                                            <div key={emp.id} className="group flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div
                                                    className="w-4 h-4 rounded-full shrink-0"
                                                    style={{ backgroundColor: emp.color }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{emp.name}</p>
                                                    {emp.email && <p className="text-xs text-muted-foreground truncate">{emp.email}</p>}
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8"
                                                        onClick={() => {
                                                            setEditingEmployeeId(emp.id);
                                                            setEmployeeForm({
                                                                name: emp.name,
                                                                email: emp.email || '',
                                                                phone: emp.phone || '',
                                                                color: emp.color
                                                            });
                                                            setIsEmployeeDialogOpen(true);
                                                        }}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-destructive/70 hover:text-destructive"
                                                        onClick={() => deleteEmployee(emp.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        )}
                    </TabsContent>

                    {/* --- EMPLOYEE DIALOG --- */}
                    {showEmployeesInSettings && (
                    <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>{editingEmployeeId ? 'Medewerker Bewerken' : 'Nieuwe Medewerker'}</DialogTitle>
                                <DialogDescription>Voeg een teamlid toe aan de planning.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Naam *</Label>
                                    <Input
                                        placeholder="Volledige naam"
                                        value={employeeForm.name}
                                        onChange={e => setEmployeeForm(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>E-mail</Label>
                                    <Input
                                        type="email"
                                        placeholder="email@voorbeeld.nl"
                                        value={employeeForm.email}
                                        onChange={e => setEmployeeForm(prev => ({ ...prev, email: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Telefoon</Label>
                                    <Input
                                        type="tel"
                                        placeholder="06-12345678"
                                        value={employeeForm.phone}
                                        onChange={e => setEmployeeForm(prev => ({ ...prev, phone: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Kleur</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {EMPLOYEE_COLORS.map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                className={`w-8 h-8 rounded-full transition-all ${employeeForm.color === color ? 'ring-2 ring-offset-2 ring-offset-background ring-white scale-110' : 'hover:scale-105'}`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => setEmployeeForm(prev => ({ ...prev, color }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsEmployeeDialogOpen(false)}>Annuleren</Button>
                                <Button
                                    variant="success"
                                    disabled={!employeeForm.name.trim()}
                                    onClick={async () => {
                                        try {
                                            if (editingEmployeeId) {
                                                await updateEmployee(editingEmployeeId, {
                                                    name: employeeForm.name,
                                                    email: employeeForm.email,
                                                    phone: employeeForm.phone,
                                                    color: employeeForm.color
                                                });
                                            } else {
                                                await addEmployee({
                                                    name: employeeForm.name,
                                                    email: employeeForm.email,
                                                    phone: employeeForm.phone,
                                                    color: employeeForm.color
                                                });
                                            }
                                            setIsEmployeeDialogOpen(false);
                                            toast({ title: 'Opgeslagen', description: `Medewerker ${editingEmployeeId ? 'bijgewerkt' : 'toegevoegd'}.` });
                                        } catch (err) {
                                            console.error(err);
                                            toast({ variant: 'destructive', title: 'Fout', description: 'Kon medewerker niet opslaan.' });
                                        }
                                    }}
                                >
                                    Opslaan
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    )}

                    {/* --- PACKAGE DIALOG --- */}
                    <Dialog open={isPackageDialogOpen} onOpenChange={setIsPackageDialogOpen}>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                                <DialogTitle>{editingPackageId ? 'Pakket Bewerken' : 'Nieuw Pakket'}</DialogTitle>
                                <DialogDescription>Definieer een groep kostenposten die u in één keer kunt toevoegen.</DialogDescription>
                            </DialogHeader>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-4">
                                <div className="space-y-2">
                                    <Label>Pakket Naam</Label>
                                    <Input
                                        placeholder="bv. Steigerbouw Compleet"
                                        value={currentPackageName}
                                        onChange={e => setCurrentPackageName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label>Items in dit pakket</Label>
                                        <Button size="sm" variant="outline" onClick={addPackageItem}>
                                            <Plus className="mr-2 h-3 w-3" />
                                            Item Toevoegen
                                        </Button>
                                    </div>

                                    {currentPackageItems.length === 0 && (
                                        <div className="text-center py-8 border border-dashed rounded-lg text-sm text-muted-foreground">
                                            Nog geen items. Klik op toevoegen.
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {currentPackageItems.map((item, index) => (
                                            <div key={item.id} className="flex gap-2 items-start p-2 border rounded-md bg-secondary/10">
                                                <div className="flex-1 space-y-2">
                                                    <Input
                                                        placeholder="Item naam (bv. Huur steiger)"
                                                        className="h-8 text-sm"
                                                        value={item.naam}
                                                        onChange={e => updatePackageItem(item.id, 'naam', e.target.value)}
                                                    />
                                                    <div className="flex gap-2">
                                                        <div className="relative w-24">
                                                            <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">€</span>
                                                            <Input
                                                                type="number"
                                                                className="h-7 pl-6 text-xs"
                                                                value={item.prijs || ''}
                                                                onChange={e => updatePackageItem(item.id, 'prijs', Number(e.target.value))}
                                                            />
                                                        </div>
                                                        <Select value={item.per} onValueChange={v => updatePackageItem(item.id, 'per', v)}>
                                                            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="dag">p/dag</SelectItem>
                                                                <SelectItem value="week">p/week</SelectItem>
                                                                <SelectItem value="klus">Vast</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                                                    onClick={() => removePackageItem(item.id)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <DialogFooter className="pt-2 border-t mt-auto">
                                <Button variant="ghost" onClick={() => setIsPackageDialogOpen(false)}>Annuleren</Button>
                                <Button onClick={savePackage} disabled={!currentPackageName.trim()} variant="success">Opslaan</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                </Tabs>
            </div>
        </div>
    );
}
