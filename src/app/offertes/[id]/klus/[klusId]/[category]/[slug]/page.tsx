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
import { UnitToggle } from '@/context/MeasurementUnitContext';
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
          const savedItems = data.klussen?.[klusId]?.maatwerk;

          if (Array.isArray(savedItems) && savedItems.length > 0) {
            setItems(savedItems);
          } else {
            setItems([createEmptyItem()]);
          }

          const savedComponents = data.klussen?.[klusId]?.components;
          if (Array.isArray(savedComponents)) {
            setComponents(savedComponents);
          }
        }
      } catch (error) {
        console.error("Error loading measurements:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [quoteId, klusId, firestore]);

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
          [`klussen.${klusId}.maatwerk`]: cleanedItems,
          [`klussen.${klusId}.components`]: cleanedComponents,
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
        rightContent={<PersonalNotes quoteId={quoteId} context={`Metingen: ${jobConfig.title}`} />}
      />

      <div className="px-4 py-8 max-w-[1400px] mx-auto pb-32">
        <form>
          <div className="space-y-8">
            {items.map((item, index) => (
              <div key={index} className="group relative rounded-3xl border border-white/5 bg-card/40 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 overflow-hidden hover:shadow-emerald-900/10 transition-all duration-300">

                {/* Premium Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 border-b border-white/5 bg-white/[0.02]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-sm ring-1 ring-emerald-500/20">
                        {index + 1}
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-100 tracking-tight">{itemLabel}</h3>
                    </div>
                    <p className="text-sm text-zinc-400 pl-11">Configureer de afmetingen.</p>
                  </div>

                  <div className="flex items-center gap-3 pl-11 sm:pl-0">
                    <div className="inline-flex bg-black/20 p-1 rounded-xl border border-white/5 backdrop-blur-md">
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
                              "flex items-center justify-center h-8 w-8 sm:w-auto sm:px-3 text-xs font-medium transition-all rounded-lg",
                              isActive ? "bg-emerald-600/20 text-emerald-400 shadow-sm ring-1 ring-emerald-500/50" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                            )}
                            title={shapeOption.label}
                          >
                            {shapeOption.customIcon === 'L' ? <LIcon /> : shapeOption.customIcon === 'U' ? <UIcon /> : Icon ? <Icon className={cn("h-4 w-4", shapeOption.id === 'slope' && "-rotate-12")} /> : null}
                            <span className="hidden sm:inline sm:ml-2">{shapeOption.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <UnitToggle />
                    {index > 0 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setPendingDeleteIndex(index)} className="h-10 w-10 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10" disabled={disabledAll}>
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

                  {/* LEFT COLUMN: Inputs & Configuration (5 Cols) */}
                  <div className="lg:col-span-12 xl:col-span-5 space-y-8">

                    {/* 1. Main Dimensions */}
                    <div className="space-y-4">
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
                            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                              <div className="space-y-4">
                                <div className="space-y-2"><Label className="text-xs uppercase text-zinc-500">Deel 1</Label><MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateL('lengte1', String(val))} /><MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} /></div>
                              </div>
                              <div className="space-y-4">
                                <div className="space-y-2"><Label className="text-xs uppercase text-zinc-500">Deel 2</Label><MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateL('lengte2', String(val))} /><MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} /></div>
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
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-2"><Label className="text-xs">Deel 1</Label><MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateU('lengte1', String(val))} /><MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} /></div>
                                <div className="space-y-2"><Label className="text-xs">Deel 2</Label><MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateU('lengte2', String(val))} /><MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} /></div>
                                <div className="space-y-2"><Label className="text-xs">Deel 3</Label><MeasurementInput placeholder="L3" value={item.lengte3 || ''} onChange={(val) => updateU('lengte3', String(val))} /><MeasurementInput placeholder="H3" value={item.hoogte3 || ''} onChange={(val) => updateItem(index, 'hoogte3', val)} /></div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-4">
                            {fields.find(f => f.key === 'lengte') && (
                              <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            <div className="grid grid-cols-2 gap-4">
                              {shape === 'slope' && (
                                <><div className="space-y-2"><Label>H. Links</Label><MeasurementInput value={item.hoogteLinks} onChange={v => updateItem(index, 'hoogteLinks', v)} /></div>
                                  <div className="space-y-2"><Label>H. Rechts</Label><MeasurementInput value={item.hoogteRechts} onChange={v => updateItem(index, 'hoogteRechts', v)} /></div></>
                              )}
                              {shape === 'gable' && (
                                <><div className="space-y-2"><Label>H. Zijkant</Label><MeasurementInput value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} /></div>
                                  <div className="space-y-2"><Label>H. Nok</Label><MeasurementInput value={item.hoogteNok} onChange={v => updateItem(index, 'hoogteNok', v)} /></div></>
                              )}
                              {shape === 'rectangle' && fields.find(f => f.key === 'hoogte' || f.key === 'breedte') && (
                                <DynamicInput field={fields.find(f => f.key === 'hoogte' || f.key === 'breedte')!} value={item.hoogte || item.breedte} onChange={v => updateItem(index, fields.find(f => f.key === 'hoogte' || f.key === 'breedte')!.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 2. Secondary Fields (Material properties etc) */}
                    <div className="pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {fields.slice(2).filter(f => f.type !== 'textarea' && !['balkafstand', 'latafstand', 'dakrand_breedte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right'].includes(f.key)).map(f => (
                        <DynamicInput key={f.key} field={f} value={item[f.key]} onChange={v => updateItem(index, f.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                      ))}
                    </div>

                    {/* 3. Balken & Latten Configuration (RESTORED LOGIC) */}
                    {(fields.some(f => f.key === 'balkafstand') || fields.some(f => f.key === 'latafstand')) && (
                      <div className="pt-6 border-t border-white/5 space-y-6">
                        {/* Balken */}
                        {fields.find(f => f.key === 'balkafstand') && (
                          <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Balken Structuur</h4>
                            <DynamicInput field={fields.find(f => f.key === 'balkafstand')!} value={item.balkafstand} onChange={v => updateItem(index, 'balkafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs">Start</Label>
                                <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                  <button type="button" onClick={() => updateItem(index, 'startFromRight', false)} className={cn("flex-1 text-xs py-1 rounded transition-colors", !item.startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500")}>Links</button>
                                  <button type="button" onClick={() => updateItem(index, 'startFromRight', true)} className={cn("flex-1 text-xs py-1 rounded transition-colors", item.startFromRight ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500")}>Rechts</button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Opties</Label>
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between text-xs text-zinc-400">
                                    <span>Dubbele Eindbalk</span>
                                    <Switch checked={item.doubleEndBeams || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBeams', c)} className="scale-75 origin-right" />
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-zinc-400">
                                    <span>Kader (Rondom)</span>
                                    <Switch checked={item.surroundingBeams || false} onCheckedChange={(c) => updateItem(index, 'surroundingBeams', c)} className="scale-75 origin-right" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Latten */}
                        {fields.find(f => f.key === 'latafstand') && (
                          <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Latten Structuur</h4>
                            <DynamicInput field={fields.find(f => f.key === 'latafstand')!} value={item.latafstand} onChange={v => updateItem(index, 'latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs">Start</Label>
                                <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                  <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500")}>Boven</button>
                                  <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500")}>Onder</button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Opties</Label>
                                <div className="flex items-center justify-between text-xs text-zinc-400 mt-2">
                                  <span>Dubbele Eindlat</span>
                                  <Switch checked={item.doubleEndBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBattens', c)} className="scale-75 origin-right" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. OPENINGS SECTION (RESTORED LOGIC) */}
                    {showOpeningsSection && (
                      <div className="pt-6 border-t border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                            <CornerDownRight className="h-3 w-3" /> Openingen & Sparingen
                          </h4>
                        </div>

                        <div className="space-y-3">
                          {(item.openings || []).map((op: any, opIdx: number) => (
                            <div key={op.id || opIdx} className="p-4 rounded-xl bg-black/20 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-zinc-300">Opening {opIdx + 1}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-red-400"
                                  onClick={() => {
                                    const newOpenings = (item.openings || []).filter((_: any, i: number) => i !== opIdx);
                                    updateItem(index, 'openings', newOpenings);
                                  }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <select
                                    className="flex h-9 w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-1 text-sm transition-colors focus:border-emerald-500/50 outline-none"
                                    value={op.type}
                                    onChange={(e) => {
                                      const newOpenings = [...(item.openings || [])];
                                      newOpenings[opIdx] = { ...op, type: e.target.value };
                                      updateItem(index, 'openings', newOpenings);
                                    }}
                                  >
                                    {isWallCategory ? (
                                      <><option value="window">Kozijn</option><option value="door">Deur</option><option value="opening">Sparing</option><option value="other">Overig</option></>
                                    ) : isCeilingCategory || categorySlug === 'vloeren' ? (
                                      <><option value="opening">Sparing</option><option value="hatch">Luik</option><option value="pillar">Pilaar</option><option value="other">Overig</option></>
                                    ) : (
                                      <><option value="dakraam">Dakraam</option><option value="schoorsteen">Schoorsteen</option><option value="opening">Sparing</option><option value="other">Overig</option></>
                                    )}
                                  </select>
                                </div>

                                <div className="space-y-1"><Label className="text-xs text-zinc-500">Breedte</Label><MeasurementInput value={op.width} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, width: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                                <div className="space-y-1"><Label className="text-xs text-zinc-500">Hoogte/Lengte</Label><MeasurementInput value={op.height} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, height: v || 0 }; updateItem(index, 'openings', n); }} /></div>

                                <div className="space-y-1"><Label className="text-xs text-zinc-500">Van Links</Label><MeasurementInput value={op.fromLeft} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, fromLeft: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                                <div className="space-y-1"><Label className="text-xs text-zinc-500">Van Onder</Label><MeasurementInput value={op.fromBottom} onChange={(v) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, fromBottom: v || 0 }; updateItem(index, 'openings', n); }} /></div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <Label className="text-xs text-zinc-400">Raveelwerk Vereist</Label>
                                <Switch checked={op.requires_raveelwerk || false} onCheckedChange={(c) => { const n = [...(item.openings || [])]; n[opIdx] = { ...op, requires_raveelwerk: c }; updateItem(index, 'openings', n); }} className="scale-75" />
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const newOpening = {
                                id: crypto.randomUUID(),
                                type: isWallCategory ? 'window' : 'opening',
                                width: 600,
                                height: 600,
                                fromLeft: 1000,
                                fromBottom: 1000
                              };
                              updateItem(index, 'openings', [...(item.openings || []), newOpening]);
                            }}
                            className="w-full border-dashed border-zinc-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-400"
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Opening toevoegen
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 5. Text Area (Opmerkingen) */}
                    {fields.filter(f => f.type === 'textarea').map(f => (
                      <div key={f.key} className="pt-4 border-t border-white/5">
                        <DynamicInput field={f} value={item[f.key]} onChange={v => updateItem(index, f.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} className="w-full" />
                      </div>
                    ))}
                  </div>


                  {/* RIGHT COLUMN: Visualizer (7 Cols) */}
                  <div className="lg:col-span-12 xl:col-span-7">
                    <div className="xl:sticky xl:top-24 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          <Maximize2 className="h-3 w-3" /> Live Tekening
                        </h4>
                      </div>

                      <div
                        ref={(el) => { visualizerRefs.current[index] = el; }}
                        className="relative aspect-video w-full rounded-2xl border border-white/10 bg-[#09090b] overflow-hidden shadow-2xl flex items-center justify-center group-hover:border-emerald-500/20 transition-all duration-500"
                      >
                        {/* Unified Dot Pattern Background - FULL COVERAGE */}
                        <div
                          className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                          style={{
                            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                            backgroundSize: '24px 24px'
                          }}
                        />

                        {/* Inner Container for Drawing - Full Size, No Padding on Container */}
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

                        {/* Restore: Magnifier Button */}
                        <div className="absolute bottom-4 left-4 z-20">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-white transition-colors"
                                title="Vergroten"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 bg-[#09090b] border-white/10 overflow-hidden">
                              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                                <DialogTitle className="text-lg font-medium text-zinc-200">
                                  Technische Tekening: {itemLabel} {index + 1}
                                </DialogTitle>
                              </div>
                              <div className="flex-1 w-full h-full relative bg-[#09090b]">
                                {/* Dot Pattern for Fullscreen */}
                                <div
                                  className="absolute inset-0 z-0 opacity-[0.15]"
                                  style={{
                                    backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                                    backgroundSize: '32px 32px'
                                  }}
                                />
                                <div className="relative z-10 w-full h-full p-8 flex items-center justify-center">
                                  <VisualizerController
                                    category={categorySlug}
                                    slug={jobSlug}
                                    item={item}
                                    fields={fields}
                                    title={`${itemLabel} ${index + 1}`}
                                    isMagnifier={true}
                                    fitContainer={true}
                                    className="w-full h-full"
                                    onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                                    onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                                  />
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>



                      </div>
                    </div>
                  </div>

                </div>
              </div>
            ))}

            {items.length === 0 && <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-3xl bg-card/20"><p className="text-muted-foreground">Geen items.</p></div>}
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