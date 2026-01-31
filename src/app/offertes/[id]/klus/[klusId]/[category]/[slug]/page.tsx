/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle, Maximize2, Square, Slash, Triangle, CornerDownRight, ArrowDownToLine, Info, X, Search, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
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
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { MeasurementInput } from '@/components/MeasurementInput';

import { Switch } from '@/components/ui/switch';

import { useFirestore } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent } from '@/lib/types';
import { VisualizerController } from '@/components/visualizers/VisualizerController';
import { OpeningenSection } from '@/components/openingen/OpeningenSection';
import { BalkenSection } from '@/components/balken/BalkenSection';
import { getJobConfig } from '@/config/jobTypes/index';
import { DynamicInput } from '@/components/DynamicInput';

export default function GenericMeasurementPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;
  const specificJobConfig = getJobConfig(jobSlug);

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
  const isWallCategory = Boolean(categorySlug === 'wanden' || (jobSlug && (jobSlug.includes('voorzetwand') || jobSlug.includes('tussenwand') || jobSlug.includes('scheidingswand'))));
  const isCeilingCategory = Boolean(categorySlug === 'plafonds' || (jobSlug && jobSlug.includes('plafond')));
  const isRoofCategory = categorySlug === 'dakrenovatie' || (jobSlug && (jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('epdm')));
  const isBoeiboord = categorySlug === 'boeiboorden' || (jobSlug && jobSlug.includes('boeiboord'));
  const hasWallFields = fields.some(f => f.key === 'balkafstand');
  const showOpeningsSection = isWallCategory || hasWallFields || isCeilingCategory || isRoofCategory;

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [notities, setNotities] = useState(''); // New: Job Notes state
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pendingDeleteOpening, setPendingDeleteOpening] = useState<{ itemIndex: number; openingIndex: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(`collapsed-${klusId}`);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(`collapsed-${klusId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [klusId]);

  // 4. Load Data
  useEffect(() => {
    async function loadData() {
      if (!quoteId || !klusId || !firestore) return;

      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          const container = data.klussen?.[klusId] || {};
          const maatwerk = container.maatwerk;

          // 1. Try new structure, then specific slug key, then legacy 'maatwerk' array
          const savedItems = maatwerk?.items || container[`${jobSlug}_maatwerk`] || (Array.isArray(maatwerk) ? maatwerk : []);

          if (Array.isArray(savedItems) && savedItems.length > 0) {
            // Normalize openings: restore width/height from openingWidth/openingHeight if needed
            const normalizedItems = savedItems.map((item: any) => {
              if (item.openings && Array.isArray(item.openings)) {
                item.openings = item.openings.map((op: any) => {
                  const normalizedOpening = { ...op };
                  if (op.openingWidth !== undefined && op.width === undefined) {
                    normalizedOpening.width = op.openingWidth;
                  }
                  if (op.openingHeight !== undefined && op.height === undefined) {
                    normalizedOpening.height = op.openingHeight;
                  }
                  return normalizedOpening;
                });
              }
              return item;
            });
            setItems(normalizedItems);
          } else {
            setItems([createEmptyItem()]);
          }

          // 2. Load Components
          const savedComponents = maatwerk?.components || container.components;
          if (Array.isArray(savedComponents)) {
            setComponents(savedComponents);
          }

          // 3. Load Notities
          const savedNotities = maatwerk?.notities || container.maatwerk_notities;
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
      fields.some(f => f.type === 'number' && !f.optional && !item[f.key])
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

        // Prepare items
        const processedItems = (items || []).map((item: any) => {
          if (item.openings && Array.isArray(item.openings)) {
            item.openings = item.openings.map((op: any) => {
              const { width, height, ...rest } = op;
              return {
                ...rest,
                openingWidth: width,
                openingHeight: height
              };
            });
          }
          return item;
        });

        const rawMeta = {
          title: jobConfig.title,
          type: categorySlug,
          slug: jobSlug,
          description: jobConfig.description || ''
        };

        // Construct the single maatwerk object
        const maatwerkData = {
          items: processedItems,
          components: components,
          notities: notities,
          meta: rawMeta,
        };

        const updateData: Record<string, any> = {
          [`klussen.${klusId}.maatwerk`]: cleanFirestoreData(maatwerkData, { allowEmptyArrays: true }),
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
              <React.Fragment key={index}>
                {/* Item divider / label — only when multiple items */}
                {items.length > 1 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                      {itemLabel} {index + 1}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}
              <div className="flex flex-col lg:flex-row gap-6 items-start">

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

                      // Boeiboord: grouped Voorzijde / Onderzijde fields
                      if (isBoeiboord) {
                        return (
                          <div className="space-y-4">
                            <Label className="text-xs uppercase text-zinc-500 tracking-wider">Voorzijde</Label>
                            {fields.find(f => f.key === 'lengte') && (
                              <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'hoogte')!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            <div className="pt-2 border-t border-white/5" />
                            <Label className="text-xs uppercase text-zinc-500 tracking-wider">Onderzijde</Label>
                            {fields.find(f => f.key === 'lengte_onderzijde') && (
                              <DynamicInput field={fields.find(f => f.key === 'lengte_onderzijde')!} value={item.lengte_onderzijde} onChange={v => updateItem(index, 'lengte_onderzijde', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'breedte')!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}

                            {/* Kopkanten toggle */}
                            {fields.find(f => f.key === 'kopkanten') && (
                              <>
                                <div className="pt-2 border-t border-white/5" />
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs uppercase text-zinc-500 tracking-wider">Kopkanten</Label>
                                  <Switch checked={item.kopkanten || false} onCheckedChange={(c) => updateItem(index, 'kopkanten', c)} />
                                </div>
                                {item.kopkanten && (
                                  <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-2">
                                    {fields.find(f => f.key === 'kopkant_breedte') && (
                                      <DynamicInput field={fields.find(f => f.key === 'kopkant_breedte')!} value={item.kopkant_breedte} onChange={v => updateItem(index, 'kopkant_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                    )}
                                    {fields.find(f => f.key === 'kopkant_hoogte') && (
                                      <DynamicInput field={fields.find(f => f.key === 'kopkant_hoogte')!} value={item.kopkant_hoogte} onChange={v => updateItem(index, 'kopkant_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      }

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


                  {/* Openingen Section */}
                  {showOpeningsSection && (
                    <OpeningenSection
                      openings={item.openings || []}
                      onChange={(newOpenings) => updateItem(index, 'openings', newOpenings)}
                      constructionOptions={specificJobConfig.openingConfig.constructionOptions}
                      isWallCategory={isWallCategory}
                      isCeilingCategory={isCeilingCategory}
                      categorySlug={categorySlug}
                    />
                  )}

                  {/* Dakrand Configuration */}
                  {fields.find(f => f.key === 'dakrand_breedte') && (
                    <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                      <div
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                        onClick={() => toggleCollapsed(`dakrand-${index}`)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-zinc-200">Dakrand</span>
                          {collapsedSections[`dakrand-${index}`] && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              {item.dakrand_breedte ? `${item.dakrand_breedte}mm` : 'Ingesteld'}
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-500">
                          {collapsedSections[`dakrand-${index}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                      </div>

                      {!collapsedSections[`dakrand-${index}`] && (
                        <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                            {fields.find(f => f.key === 'dakrand_breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'dakrand_breedte')!} value={item.dakrand_breedte} onChange={(v) => updateItem(index, 'dakrand_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'dakrand_hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'dakrand_hoogte')!} value={item.dakrand_hoogte} onChange={(v) => updateItem(index, 'dakrand_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Balken Configuration */}
                  {fields.find(f => f.key === 'balkafstand') && (
                    <BalkenSection
                      balkafstand={item.balkafstand}
                      startFromRight={item.startFromRight}
                      doubleEndBeams={item.doubleEndBeams}
                      doubleTopPlate={item.doubleTopPlate}
                      doubleBottomPlate={item.doubleBottomPlate}
                      surroundingBeams={item.surroundingBeams}
                      optionsConfig={specificJobConfig.balkenConfig.options}
                      onUpdate={(key, val) => updateItem(index, key, val)}
                      isWallCategory={isWallCategory}
                      jobSlug={jobSlug}
                    />
                  )}

                  {/* Latten Configuration */}
                  {fields.find(f => f.key === 'latafstand') && (
                    <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                      <div
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                        onClick={() => toggleCollapsed(`latten-${index}`)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-zinc-200">Latten</span>
                          {collapsedSections[`latten-${index}`] && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              {item.latafstand}mm h.o.h
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-500">
                          {collapsedSections[`latten-${index}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                      </div>

                      {!collapsedSections[`latten-${index}`] && (
                        <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                          <div className="pt-2 border-t border-white/5 space-y-4">
                            <DynamicInput field={fields.find(f => f.key === 'latafstand')!} value={item.latafstand} onChange={v => updateItem(index, 'latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                            {fields.find(f => f.key === 'onderzijde_latafstand') && (
                              <DynamicInput field={fields.find(f => f.key === 'onderzijde_latafstand')!} value={item.onderzijde_latafstand} onChange={v => updateItem(index, 'onderzijde_latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}

                            <div className="space-y-3">
                              <Label className="text-xs">Startpositie</Label>
                              <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                  {isRoofCategory ? 'Links' : 'Boven'}
                                </button>
                                <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                  {isRoofCategory ? 'Rechts' : 'Onder'}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <Label className="text-xs">Opties</Label>
                              <div className="grid grid-cols-2 gap-2">
                                {isRoofCategory && (
                                  <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                    <Label className="text-[10px] text-zinc-400">Dbl. Beginlat</Label>
                                    <Switch checked={item.doubleStartBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleStartBattens', c)} className="scale-75 origin-right" />
                                  </div>
                                )}
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                  <Label className="text-[10px] text-zinc-400">Dbl. Eindlat</Label>
                                  <Switch checked={item.doubleEndBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBattens', c)} className="scale-75 origin-right" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Kopkanten Configuration (non-boeiboord — boeiboord renders inline) */}
                  {!isBoeiboord && fields.find(f => f.key === 'kopkanten') && (
                    <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between select-none">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-zinc-200">Kopkanten</span>
                        </div>
                        <Switch checked={item.kopkanten || false} onCheckedChange={(c) => updateItem(index, 'kopkanten', c)} />
                      </div>

                      {item.kopkanten && (
                        <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                            {fields.find(f => f.key === 'kopkant_breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'kopkant_breedte')!} value={item.kopkant_breedte} onChange={v => updateItem(index, 'kopkant_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'kopkant_hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'kopkant_hoogte')!} value={item.kopkant_hoogte} onChange={v => updateItem(index, 'kopkant_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extra Fields - NO SLICE, just filter out known keys */}
                  {fields.filter(f => f.type !== 'textarea' && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra's</h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                        {fields.filter(f => f.type !== 'textarea' && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).map(f => (
                          <DynamicInput key={f.key} field={f} value={item[f.key]} onChange={v => updateItem(index, f.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                        ))}
                      </div>
                    </div>
                  )}





                </div>

                {/* RIGHT/CENTER: DRAWING CANVAS - STICKY */}
                {isBoeiboord ? (
                  <div
                    ref={(el) => { visualizerRefs.current[index] = el; }}
                    className="flex-1 w-full lg:min-w-0 sticky top-24 self-start"
                  >
                    <VisualizerController
                      category={categorySlug}
                      slug={jobSlug}
                      item={item}
                      fields={fields}
                      title={`${itemLabel} ${index + 1}`}
                      isMagnifier={false}
                      fitContainer={false}
                      onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                      onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                      onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                    />
                  </div>
                ) : (
                  <div className="flex-1 w-full lg:min-w-0 bg-[#09090b] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative sticky top-24 self-start flex flex-col">
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
                          onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>
              </React.Fragment>
            ))}

            {items.length === 0 && <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-3xl bg-card/20"><p className="text-muted-foreground">Geen items.</p></div>}

            {/* Public Job Notes Section */}
            <div className="space-y-3 pt-6 border-t border-white/5">
              <div>
                <h3 className="text-lg font-medium text-amber-500">Slimme Notities</h3>
                <p className="text-sm text-muted-foreground">Onze assistent begrijpt bouwinstructies. Type simpelweg afwijkingen of details door; wij verwerken deze direct in de technische uitslag en constructie.</p>
              </div>
              <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl">
                <Textarea
                  value={notities}
                  onChange={(e) => setNotities(e.target.value)}
                  placeholder="Bijv. Extra versteviging inbouwen op 120cm hoogte voor montage van een zware wastafel."
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
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{itemLabel} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Weet je zeker dat je <strong>{itemLabel} {pendingDeleteIndex !== null ? pendingDeleteIndex + 1 : ''}</strong> wilt verwijderen?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={() => setPendingDeleteIndex(null)} className="rounded-xl"><Button variant="ghost">Annuleren</Button></AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDeleteIndex !== null) { removeItem(pendingDeleteIndex); setPendingDeleteIndex(null); } }} asChild><Button variant="destructiveSoft">Verwijderen</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Opening Delete Confirmation Dialog */}
      <AlertDialog open={pendingDeleteOpening !== null} onOpenChange={(open) => !open && setPendingDeleteOpening(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Opening verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>Opening {pendingDeleteOpening ? pendingDeleteOpening.openingIndex + 1 : ''}</strong> van {itemLabel} {pendingDeleteOpening ? pendingDeleteOpening.itemIndex + 1 : ''} wilt verwijderen? Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" onClick={() => setPendingDeleteOpening(null)}>
              Annuleren
            </AlertDialogCancel>
            <Button
              variant="destructiveSoft"
              onClick={() => {
                if (pendingDeleteOpening) {
                  const { itemIndex, openingIndex } = pendingDeleteOpening;
                  const currentItems = [...items];
                  const currentOpenings = [...(currentItems[itemIndex].openings || [])];
                  currentOpenings.splice(openingIndex, 1);
                  updateItem(itemIndex, 'openings', currentOpenings);
                  setPendingDeleteOpening(null);
                }
              }}
            >
              Verwijderen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
