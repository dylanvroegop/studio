/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState, useTransition, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle, Maximize2, Square, Slash, Triangle, CornerDownRight, ArrowDownToLine, Info, X, Search } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import html2canvas from 'html2canvas';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { PersonalNotes } from '@/components/PersonalNotes';
import { cn } from '@/lib/utils';
import { MeasurementInput } from '@/components/MeasurementInput';

import { Switch } from '@/components/ui/switch';

import { useFirestore } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent } from '@/lib/types';
import { VisualizerController } from '@/components/visualizers/VisualizerController';

export default function GenericMeasurementPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Refs for capturing visualizations
  const visualizerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ✅ 1. Add the Mounted State
  const [isMounted, setIsMounted] = useState(false);
  const [isMagnifier, setIsMagnifier] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Get Config
  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const fields = jobConfig?.measurements || [];

  // Logic to determine if "Openings" section is relevant
  const isWallCategory = categorySlug === 'wanden' || (jobSlug && (jobSlug.includes('voorzetwand') || jobSlug.includes('tussenwand') || jobSlug.includes('scheidingswand')));
  const isCeilingCategory = categorySlug === 'plafonds' || (jobSlug && jobSlug.includes('plafond'));
  const isRoofCategory = categorySlug === 'dakrenovatie' || (jobSlug && (jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('epdm')));
  const hasWallFields = fields.some(f => f.key === 'balkafstand');
  const showOpeningsSection = isWallCategory || hasWallFields || isCeilingCategory || isRoofCategory;

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [notities, setNotities] = useState(''); // New: Job Notes state
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  // 4. Load Data
  useEffect(() => {
    async function loadData() {
      if (!quoteId || !klusId || !firestore) return;

      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          // Try specific slug key first, then fallback to legacy 'maatwerk'
          const savedItems = data.klussen?.[klusId]?.[`${jobSlug}_maatwerk`] || data.klussen?.[klusId]?.maatwerk;

          if (Array.isArray(savedItems) && savedItems.length > 0) {
            setItems(savedItems);
          } else {
            setItems([createEmptyItem()]);
          }

          const savedComponents = data.klussen?.[klusId]?.components;
          if (Array.isArray(savedComponents)) {
            setComponents(savedComponents);
          }

          const savedNotities = data.klussen?.[klusId]?.notities;
          if (savedNotities) {
            setNotities(savedNotities);
          }
        }
      } catch (error) {
        console.error("Error loading measurements:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [quoteId, klusId, firestore, jobSlug]);

  const createEmptyItem = () => {
    const newItem: Record<string, any> = {};
    fields.forEach(f => {
      newItem[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    });
    return newItem;
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Kan niet verwijderen',
        description: 'Er moet minimaal één item overblijven.',
      });
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, key: string, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [key]: value };
      return newItem;
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') e.preventDefault();
  };

  const handleShapeChange = (index: number, newShape: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newItem: Record<string, any> = {};
      Object.keys(item).forEach(key => newItem[key] = item[key]);
      newItem.shape = newShape;

      const dimensionsToReset = [
        'lengte', 'hoogte', 'breedte',
        'lengte1', 'lengte2', 'lengte3',
        'hoogte1', 'hoogte2', 'hoogte3',
        'hoogteLinks', 'hoogteRechts',
        'hoogteNok',
        'variant'
      ];
      dimensionsToReset.forEach(key => newItem[key] = '');
      return newItem;
    }));
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firestore || !jobConfig) return;

    const hasEmptyFields = items.some(item =>
      fields.some(f => f.type === 'number' && !item[f.key])
    );

    if (hasEmptyFields) {
      toast({ variant: "destructive", title: "Ontbrekende gegevens", description: "Vul a.u.b. alle verplichte velden in." });
      return;
    }

    setSaving(true);
    startTransition(async () => {
      try {
        let visualisatieUrl: string | null = null;
        const visualizerElement = visualizerRefs.current[0];

        if (visualizerElement) {
          try {
            const canvas = await html2canvas(visualizerElement, {
              backgroundColor: '#18181b',
              scale: 2,
              logging: false,
              useCORS: true,
              allowTaint: true,
            });
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png', 0.95);
            });
            const auth = getAuth();
            const storage = getStorage(auth.app);
            const storageRef = ref(storage, `visualisaties/${quoteId}/${klusId}.png`);
            await uploadBytes(storageRef, blob, { contentType: 'image/png' });
            visualisatieUrl = await getDownloadURL(storageRef);
          } catch (uploadError) {
            console.error('Error capturing visualization:', uploadError);
          }
        }

        const quoteRef = doc(firestore, 'quotes', quoteId);
        const cleanData = (data: any) => data === undefined ? null : JSON.parse(JSON.stringify(data));

        const cleanedItems = cleanData(items) || [];
        const cleanedComponents = cleanData(components) || [];
        const rawMeta = { title: jobConfig.title, type: categorySlug, slug: jobSlug, description: jobConfig.description || '' };
        const cleanedMeta = cleanData(rawMeta);

        const updateData: Record<string, any> = {
          // Use specific key for this job type/slug to avoid collisions
          [`klussen.${klusId}.${jobSlug}_maatwerk`]: cleanedItems,
          // Clear legacy key to avoid confusion (optional, but good for cleanup if we want to migrate fully)
          // For now, let's keep it or just overwrite the new one. 
          // Actually, let's explicitely NOT save to 'maatwerk' anymore. 
          // But if we want to "migrate", we might want to delete the old one?
          // Let's just write to the new key. 

          [`klussen.${klusId}.components`]: cleanedComponents,
          [`klussen.${klusId}.notities`]: notities, // Save Public Notes
          [`klussen.${klusId}.meta`]: cleanedMeta,
          [`klussen.${klusId}.updatedAt`]: serverTimestamp(),
        };

        if (visualisatieUrl) {
          updateData[`klussen.${klusId}.visualisatieUrl`] = visualisatieUrl;
        }

        await updateDoc(quoteRef, updateData);
        router.push(`/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}/materialen`);

      } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Opslaan mislukt', description: error.message });
        setSaving(false);
      }
    });
  };

  if (!isMounted) return null;

  if (!categoryConfig || !jobConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Klus configuratie niet gevonden</h1>
        <Button variant="outline" onClick={() => router.back()}>Ga terug</Button>
      </div>
    );
  }

  const disabledAll = saving || isPending || loading;
  const progressValue = 60;
  const itemLabel = jobConfig.measurementLabel || jobConfig.title.split(' ')[0] || 'Item';
  const hasOnlyOneItem = categoryConfig?.items?.length === 1;
  const backUrl = hasOnlyOneItem
    ? `/offertes/${quoteId}/klus/nieuw`
    : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`;

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <WizardHeader
        title={jobConfig.title}
        backLink={backUrl}
        progress={progressValue}
        quoteId={quoteId}
        rightContent={<PersonalNotes quoteId={quoteId} jobId={klusId} context={`Metingen: ${jobConfig.title}`} />}
      />

      <div className="px-4 py-8 max-w-[1400px] mx-auto pb-32">
        <form>
          <div className="space-y-8">
            {items.map((item, index) => (
              <div key={index} className="flex flex-col lg:flex-row gap-6 items-start">

                {/* LEFT SIDEBAR - SETTINGS */}
                <div className="w-full lg:w-[340px] shrink-0 space-y-6">

                  {/* Item Header Card */}
                  {/* Item Header Card */}
                  <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Vorm</Label>
                        {index > 0 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setPendingDeleteIndex(index)} className="h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-red-500/10" disabled={disabledAll}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 p-1 bg-black/20 rounded-xl border border-white/5">
                        {[
                          { id: 'rectangle', icon: Square, label: 'Recht' },
                          { id: 'slope', icon: Slash, label: 'Schuin' },
                          { id: 'gable', icon: Triangle, label: 'Punt' },
                          { id: 'l-shape', icon: null, label: 'L', customIcon: 'L' },
                          { id: 'u-shape', icon: null, label: 'U', customIcon: 'U' }
                        ].map((shapeOption) => {
                          const currentShape = item.shape || 'rectangle';
                          const isActive = currentShape === shapeOption.id;
                          const Icon = shapeOption.icon;
                          const LIcon = () => <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 L6 18 L20 18" /></svg>;
                          const UIcon = () => <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4 L4 18 L20 18 L20 4" /></svg>;

                          return (
                            <button
                              key={shapeOption.id}
                              type="button"
                              onClick={() => handleShapeChange(index, shapeOption.id)}
                              className={cn(
                                "flex items-center justify-center h-8 w-full transition-all rounded-lg",
                                isActive ? "bg-emerald-600/20 text-emerald-400 shadow-sm ring-1 ring-emerald-500/50" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                              )}
                              title={shapeOption.label}
                            >
                              {shapeOption.customIcon === 'L' ? <LIcon /> : shapeOption.customIcon === 'U' ? <UIcon /> : Icon ? <Icon className={cn("h-4 w-4", shapeOption.id === 'slope' && "-rotate-12")} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Dimensions Section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Afmetingen</h4>
                    {(() => {
                      const shape = item.shape || 'rectangle';

                      if (shape === 'l-shape') {
                        const updateL = (key: 'lengte1' | 'lengte2', val: string) => {
                          const numVal = parseFloat(val) || 0;
                          const otherKey = key === 'lengte1' ? 'lengte2' : 'lengte1';
                          const otherVal = parseFloat(item[otherKey]) || 0;
                          setItems(prev => prev.map((it, i) => i === index ? { ...it, [key]: val, lengte: numVal + otherVal } : it));
                        };
                        return (
                          <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                            <div className="space-y-3">
                              <Label className="text-xs uppercase text-zinc-500">Deel 1</Label>
                              <MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateL('lengte1', String(val))} />
                              <MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                            </div>
                            <div className="space-y-3 pt-2 border-t border-white/5">
                              <Label className="text-xs uppercase text-zinc-500">Deel 2</Label>
                              <MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateL('lengte2', String(val))} />
                              <MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
                            </div>
                          </div>
                        );
                      }

                      if (shape === 'u-shape') {
                        const updateU = (key: 'lengte1' | 'lengte2' | 'lengte3', val: string) => {
                          const numVal = parseFloat(val) || 0;
                          const l1 = key === 'lengte1' ? numVal : (parseFloat(item.lengte1) || 0);
                          const l2 = key === 'lengte2' ? numVal : (parseFloat(item.lengte2) || 0);
                          const l3 = key === 'lengte3' ? numVal : (parseFloat(item.lengte3) || 0);
                          setItems(prev => prev.map((it, i) => i === index ? { ...it, [key]: val, lengte: l1 + l2 + l3 } : it));
                        };
                        return (
                          <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                            <div className="space-y-3">
                              <Label className="text-xs">Deel 1</Label>
                              <MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateU('lengte1', String(val))} />
                              <MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                            </div>
                            <div className="space-y-3 pt-2 border-t border-white/5">
                              <Label className="text-xs">Deel 2</Label>
                              <MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateU('lengte2', String(val))} />
                              <MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
                            </div>
                            <div className="space-y-3 pt-2 border-t border-white/5">
                              <Label className="text-xs">Deel 3</Label>
                              <MeasurementInput placeholder="L3" value={item.lengte3 || ''} onChange={(val) => updateU('lengte3', String(val))} />
                              <MeasurementInput placeholder="H3" value={item.hoogte3 || ''} onChange={(val) => updateItem(index, 'hoogte3', val)} />
                            </div>
                          </div>
                        );
                      }

                      // Default: Rectangle, Slope, Gable
                      return (
                        <div className="space-y-4">
                          {/* Roof Tile Specific Fields */}
                          {fields.find(f => f.key === 'aantal_pannen_breedte') && (
                            <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_breedte')!} value={item.aantal_pannen_breedte} onChange={v => updateItem(index, 'aantal_pannen_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                          {fields.find(f => f.key === 'aantal_pannen_hoogte') && (
                            <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_hoogte')!} value={item.aantal_pannen_hoogte} onChange={v => updateItem(index, 'aantal_pannen_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                          {fields.find(f => f.key === 'lengte') && (
                            <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                          {shape === 'slope' && (
                            <>
                              <div className="space-y-2"><Label>H. Links</Label><MeasurementInput value={item.hoogteLinks} onChange={v => updateItem(index, 'hoogteLinks', v)} /></div>
                              <div className="space-y-2"><Label>H. Rechts</Label><MeasurementInput value={item.hoogteRechts} onChange={v => updateItem(index, 'hoogteRechts', v)} /></div>
                            </>
                          )}
                          {shape === 'gable' && (
                            <>
                              <div className="space-y-2"><Label>H. Zijkant</Label><MeasurementInput value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} /></div>
                              <div className="space-y-2"><Label>H. Nok</Label><MeasurementInput value={item.hoogteNok} onChange={v => updateItem(index, 'hoogteNok', v)} /></div>
                            </>
                          )}
                          {shape === 'rectangle' && fields.find(f => f.key === 'hoogte' || f.key === 'breedte') && (
                            <DynamicInput field={fields.find(f => f.key === 'hoogte' || f.key === 'breedte')!} value={item.hoogte || item.breedte} onChange={v => updateItem(index, fields.find(f => f.key === 'hoogte' || f.key === 'breedte')!.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                        </div>
                      );
                    })()}
                  </div>


                  {/* Openings Section */}
                  {showOpeningsSection && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Openingen & Sparingen</h4>

                      </div>

                      <div className="space-y-3">
                        {(item.openings || []).map((op: any, opIdx: number) => (
                          <div key={op.id || opIdx} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-300">Opening {opIdx + 1}</span>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-red-400"
                                onClick={() => {
                                  const newOpenings = (item.openings || []).filter((_: any, i: number) => i !== opIdx);
                                  updateItem(index, 'openings', newOpenings);
                                }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="space-y-3">
                              <div className="w-full">
                                <Select
                                  value={op.type}
                                  onValueChange={(value) => {
                                    const newOpenings = [...(item.openings || [])];
                                    let w = op.width;
                                    let h = op.height;

                                    // Apply sizing defaults when type changes
                                    if (value === 'window') { w = 1000; h = 1000; }
                                    else if (value === 'door-frame') { w = 918; h = 2059; }
                                    else if (value === 'door') { w = 830; h = 2015; }
                                    else if (value === 'opening') { w = 1000; h = 1000; }

                                    newOpenings[opIdx] = { ...op, type: value, width: w, height: h };
                                    updateItem(index, 'openings', newOpenings);
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full bg-zinc-900/50 border-white/10">
                                    <SelectValue placeholder="Type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {isWallCategory ? (
                                      <>
                                        <SelectItem value="window">Raamkozijn</SelectItem>
                                        <SelectItem value="door-frame">Deurkozijn</SelectItem>
                                        <SelectItem value="door">Deur</SelectItem>
                                        <SelectItem value="opening">Sparing</SelectItem>
                                        <SelectItem value="other">Overig</SelectItem>
                                      </>
                                    ) : isCeilingCategory || categorySlug === 'vloeren' ? (
                                      <>
                                        <SelectItem value="opening">Sparing</SelectItem>
                                        <SelectItem value="hatch">Luik</SelectItem>
                                        <SelectItem value="pillar">Pilaar</SelectItem>
                                        <SelectItem value="other">Overig</SelectItem>
                                      </>
                                    ) : (
                                      <>
                                        <SelectItem value="dakraam">Dakraam</SelectItem>
                                        <SelectItem value="schoorsteen">Schoorsteen</SelectItem>
                                        <SelectItem value="opening">Sparing</SelectItem>
                                        <SelectItem value="other">Overig</SelectItem>
                                      </>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-[10px] uppercase text-zinc-500">Breedte</Label><MeasurementInput className="h-8 text-sm" value={op.width} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, width: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                                <div className="space-y-1"><Label className="text-[10px] uppercase text-zinc-500">Hoogte</Label><MeasurementInput className="h-8 text-sm" value={op.height} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, height: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-[10px] uppercase text-zinc-500">V. Links</Label><MeasurementInput className="h-8 text-sm" value={op.fromLeft} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, fromLeft: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                                <div className="space-y-1"><Label className="text-[10px] uppercase text-zinc-500">V. Onder</Label><MeasurementInput className="h-8 text-sm" value={op.fromBottom} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, fromBottom: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                              </div>

                              {/* HSB Construction Logic */}
                              {isWallCategory && (
                                <div className="space-y-3 pt-2 border-t border-white/5">
                                  <Label className="text-[10px] uppercase text-zinc-500 font-bold">Constructie</Label>
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                                    <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                      <Label className="text-[10px] text-zinc-400">Dbl. Stijl (L)</Label>
                                      <Switch
                                        checked={op.dubbeleStijlLinks || false}
                                        onCheckedChange={(c) => {
                                          const n = [...(item.openings || [])];
                                          n[opIdx] = { ...op, dubbeleStijlLinks: c };
                                          updateItem(index, 'openings', n);
                                        }}
                                        className="scale-75 origin-right"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                      <Label className="text-[10px] text-zinc-400">Dbl. Stijl (R)</Label>
                                      <Switch
                                        checked={op.dubbeleStijlRechts || false}
                                        onCheckedChange={(c) => {
                                          const n = [...(item.openings || [])];
                                          n[opIdx] = { ...op, dubbeleStijlRechts: c };
                                          updateItem(index, 'openings', n);
                                        }}
                                        className="scale-75 origin-right"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                      <Label className="text-[10px] text-zinc-400">Trimmer</Label>
                                      <Switch
                                        checked={op.trimmer || false}
                                        onCheckedChange={(c) => {
                                          const n = [...(item.openings || [])];
                                          n[opIdx] = { ...op, trimmer: c };
                                          updateItem(index, 'openings', n);
                                        }}
                                        className="scale-75 origin-right"
                                      />
                                    </div>
                                    <div className="space-y-0.5">
                                      <Label className="text-[10px] text-zinc-400">Header (mm)</Label>
                                      <MeasurementInput
                                        className="h-6 text-xs"
                                        value={op.headerDikte}
                                        placeholder="Standaard"
                                        onChange={(v) => {
                                          const n = [...(item.openings || [])];
                                          n[opIdx] = { ...op, headerDikte: v || 0 };
                                          updateItem(index, 'openings', n);
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Onderdorpel Logic for Doors */}
                              {(op.type === 'door' || op.type === 'door-frame') && (
                                <div className="space-y-3 pt-2 border-t border-white/5">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs text-zinc-400">Onderdorpel</Label>
                                    <Switch
                                      checked={op.onderdorpel || false}
                                      onCheckedChange={(c) => {
                                        const n = [...(item.openings || [])];
                                        n[opIdx] = { ...op, onderdorpel: c, onderdorpelDikte: c ? 20 : 0 }; // Default 20mm
                                        updateItem(index, 'openings', n);
                                      }}
                                      className="scale-75 origin-right"
                                    />
                                  </div>
                                  {op.onderdorpel && (
                                    <div className="space-y-1 animation-in slide-in-from-top-1 fade-in duration-200">
                                      <Label className="text-[10px] uppercase text-zinc-500">Dikte (mm)</Label>
                                      <MeasurementInput
                                        className="h-8 text-sm"
                                        value={op.onderdorpelDikte}
                                        onChange={(v) => {
                                          const n = [...(item.openings || [])];
                                          n[opIdx] = { ...op, onderdorpelDikte: v || 0 };
                                          updateItem(index, 'openings', n);
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const newOpening = {
                              id: crypto.randomUUID(),
                              type: isWallCategory ? 'window' : 'opening',
                              width: isWallCategory ? 1000 : 600,
                              height: isWallCategory ? 1000 : 600,
                              fromLeft: 1000,
                              fromBottom: 1000
                            };
                            updateItem(index, 'openings', [...(item.openings || []), newOpening]);
                          }}
                          className="w-full py-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-zinc-500 hover:text-emerald-400 transition-all font-medium text-xs"
                        >
                          <PlusCircle className="h-4 w-4" />
                          <span>Opening Toevoegen</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Dakrand Configuration */}
                  {fields.find(f => f.key === 'dakrand_breedte') && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dakrand Structuur</h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          {fields.find(f => f.key === 'dakrand_breedte') && (
                            <DynamicInput field={fields.find(f => f.key === 'dakrand_breedte')!} value={item.dakrand_breedte} onChange={(v) => updateItem(index, 'dakrand_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                          {fields.find(f => f.key === 'dakrand_hoogte') && (
                            <DynamicInput field={fields.find(f => f.key === 'dakrand_hoogte')!} value={item.dakrand_hoogte} onChange={(v) => updateItem(index, 'dakrand_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Balken Configuration */}
                  {fields.find(f => f.key === 'balkafstand') && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Balken Structuur</h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                        <DynamicInput field={fields.find(f => f.key === 'balkafstand')!} value={item.balkafstand} onChange={v => updateItem(index, 'balkafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                        <div className="space-y-3">
                          <Label className="text-xs">Startpositie</Label>
                          <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                            <button type="button" onClick={() => updateItem(index, 'startFromRight', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>Links</button>
                            <button type="button" onClick={() => updateItem(index, 'startFromRight', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>Rechts</button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs">Opties</Label>
                          <div className="space-y-2 bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between text-xs text-zinc-400">
                              <span>Dubbele Eindbalk</span>
                              <Switch checked={item.doubleEndBeams || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBeams', c)} className="scale-75 origin-right" />
                            </div>
                            {!jobSlug.includes('hellend-dak') && !isWallCategory && (
                              <div className="flex items-center justify-between text-xs text-zinc-400">
                                <span>Kader (Rondom)</span>
                                <Switch checked={item.surroundingBeams || false} onCheckedChange={(c) => updateItem(index, 'surroundingBeams', c)} className="scale-75 origin-right" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Latten Configuration */}
                  {fields.find(f => f.key === 'latafstand') && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Latten Structuur</h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                        <DynamicInput field={fields.find(f => f.key === 'latafstand')!} value={item.latafstand} onChange={v => updateItem(index, 'latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                        <div className="space-y-3">
                          <Label className="text-xs">Startpositie</Label>
                          <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                            <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>Boven</button>
                            <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>Onder</button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs">Opties</Label>
                          <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between text-xs text-zinc-400">
                              <span>Dubbele Eindlat</span>
                              <Switch checked={item.doubleEndBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBattens', c)} className="scale-75 origin-right" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Extra Fields - NO SLICE, just filter out known keys */}
                  {fields.filter(f => f.type !== 'textarea' && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right'].includes(f.key)).length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra's</h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                        {fields.filter(f => f.type !== 'textarea' && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right'].includes(f.key)).map(f => (
                          <DynamicInput key={f.key} field={f} value={item[f.key]} onChange={v => updateItem(index, f.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                        ))}
                      </div>
                    </div>
                  )}





                </div>

                {/* RIGHT/CENTER: DRAWING CANVAS - STICKY */}
                <div className="flex-1 w-full lg:min-w-0 bg-[#09090b] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative sticky top-24 self-start flex flex-col">
                  {/* Toolbar */}



                  {/* Canvas Container */}
                  <div
                    ref={(el) => { visualizerRefs.current[index] = el; }}
                    className="relative w-full flex-1 flex items-center justify-center bg-[#09090b]"
                  >
                    {/* Dot Pattern Background */}
                    <div
                      className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                      style={{
                        backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                        backgroundSize: '24px 24px'
                      }}
                    />

                    {/* Drawing */}
                    <div className="relative z-10 w-full h-full flex items-center justify-center">
                      <VisualizerController
                        category={categorySlug}
                        slug={jobSlug}
                        item={item}
                        fields={fields}
                        title={`${itemLabel} ${index + 1}`}
                        isMagnifier={false}
                        fitContainer={true}
                        onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                        onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                </div>

              </div>
            ))}

            {items.length === 0 && <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-3xl bg-card/20"><p className="text-muted-foreground">Geen items.</p></div>}

            {/* Public Job Notes Section */}
            <div className="space-y-3 pt-6 border-t border-white/5">
              <div>
                <h3 className="text-lg font-medium text-foreground">Slimme Notities</h3>
                <p className="text-sm text-muted-foreground">Onze assistent begrijpt vrije tekst. Type simpelweg wat je extra nodig hebt en de geschatte prijs; wij voegen het toe aan de calculatie.</p>
              </div>
              <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl">
                <Textarea
                  value={notities}
                  onChange={(e) => setNotities(e.target.value)}
                  placeholder={`Bijv.
- Gebruik tellerkoppers 8x140 voor boven wand vast zetten.
doos 50 st kost 25 euro.
- Gebruik bij tussenstaanders bathoeken van 45x45 in het midden voor versteviging.
prijs kost ongeveer 30 cent per stuk.`}
                  className="min-h-[120px] bg-black/20 border-white/10 focus-visible:ring-emerald-500/50 resize-y"
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" asChild disabled={disabledAll}><Link href={backUrl}>Terug</Link></Button>
          <Button type="button" variant="outline" onClick={addItem} disabled={disabledAll}><PlusCircle className="mr-2 h-4 w-4" />Extra {itemLabel} toevoegen</Button>
          <Button type="submit" variant="success" disabled={disabledAll} onClick={handleSave}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        </div>
      </div>

      <AlertDialog open={pendingDeleteIndex !== null} onOpenChange={(open) => !open && setPendingDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{itemLabel} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Weet je zeker dat je <strong>{itemLabel} {pendingDeleteIndex !== null ? pendingDeleteIndex + 1 : ''}</strong> wilt verwijderen?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={() => setPendingDeleteIndex(null)}><Button variant="ghost">Annuleren</Button></AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDeleteIndex !== null) { removeItem(pendingDeleteIndex); setPendingDeleteIndex(null); } }} asChild><Button variant="destructiveSoft">Verwijderen</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DynamicInput({
  field,
  value,
  onChange,
  onKeyDown,
  disabled,
  className
}: {
  field: MeasurementField;
  value: any;
  onChange: (val: any) => void;
  onKeyDown: any;
  disabled: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={field.key}>
        {field.label}
        {field.type === 'number' && ' *'}
      </Label>

      {field.type === 'textarea' ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Optioneel. Alleen invullen bij bijzonderheden.</p>
          <Textarea id={field.key} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="resize-none" rows={3} />
        </div>
      ) : field.type === 'select' ? (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={field.key}><SelectValue placeholder={field.placeholder || "Selecteer..."} /></SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <MeasurementInput id={field.key} placeholder={field.placeholder} value={value} onChange={(val: string | number) => onChange(val)} onKeyDown={onKeyDown} disabled={disabled} className={field.suffix ? 'pr-10' : ''} />
      )}
    </div>
  );
}