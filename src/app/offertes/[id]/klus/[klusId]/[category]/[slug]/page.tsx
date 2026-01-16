'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle, Maximize2, Square, Slash, Triangle, CornerDownRight, ArrowDownToLine, Info, X, Search } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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
import { useToast } from '@/hooks/use-toast';
import { PersonalNotes } from '@/components/PersonalNotes';
import { cn } from '@/lib/utils';

import { useFirestore } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent } from '@/lib/types';
import { WallStructureVisualizer } from '@/components/WallStructureVisualizer';

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

  // ✅ 1. Add the Mounted State (The Fix)
  const [isMounted, setIsMounted] = useState(false);
  const [showOpeningsTip, setShowOpeningsTip] = useState(true);
  const [isMagnifier, setIsMagnifier] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const checkTip = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user && firestore) {
          const prefRef = doc(firestore, 'user_preferences', user.uid);
          const snap = await getDoc(prefRef);
          if (snap.exists() && snap.data().hideOpeningsTip) {
            setShowOpeningsTip(false);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkTip();
  }, [firestore]);

  const dismissTip = async () => {
    setShowOpeningsTip(false);
    try {
      const auth = getAuth();
      if (auth.currentUser && firestore) {
        await setDoc(doc(firestore, 'user_preferences', auth.currentUser.uid), { hideOpeningsTip: true }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  };


  // 2. Get Config
  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const fields = jobConfig?.measurements || [];

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  // 4. Load Data
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
            // ✅ FIX: Use setItems directly instead of addItem()
            // addItem() appends (0 + 1 + 1 = 2). 
            // This forces it to be exactly 1 item.
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
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    ));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') e.preventDefault();
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firestore || !jobConfig) return;

    // Validation
    const hasEmptyFields = items.some(item =>
      fields.some(f => f.type === 'number' && !item[f.key])
    );

    if (hasEmptyFields) {
      toast({
        variant: "destructive",
        title: "Ontbrekende gegevens",
        description: "Vul a.u.b. alle verplichte velden in."
      });
      return;
    }

    setSaving(true);

    startTransition(async () => {
      try {
        const quoteRef = doc(firestore, 'quotes', quoteId);

        await updateDoc(quoteRef, {
          [`klussen.${klusId}.maatwerk`]: items,
          [`klussen.${klusId}.components`]: components,
          [`klussen.${klusId}.meta`]: {
            title: jobConfig.title,
            type: categorySlug,
            slug: jobSlug,
            description: jobConfig.description
          },
          [`klussen.${klusId}.updatedAt`]: serverTimestamp(),
        });

        router.push(`/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}/materialen`);

      } catch (error: any) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Opslaan mislukt',
          description: error.message,
        });
        setSaving(false);
      }
    });
  };

  // ✅ 5. Safety Check: If not mounted, render nothing (prevents crash)
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

  // Use custom label OR fallback to first word
  const itemLabel = jobConfig.measurementLabel || jobConfig.title.split(' ')[0] || 'Item';

  // ✅ Smart back button: skip category selection for single-item categories
  const hasOnlyOneItem = categoryConfig?.items?.length === 1;
  const backUrl = hasOnlyOneItem
    ? `/offertes/${quoteId}/klus/nieuw`  // Go to main category page
    : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`; // Go to category selection

  return (
    <main className="relative min-h-screen bg-background">
      <WizardHeader
        title={jobConfig.title}
        backLink={backUrl}
        progress={progressValue}
        quoteId={quoteId}
        rightContent={<PersonalNotes quoteId={quoteId} context={`Metingen: ${jobConfig.title}`} />}
      />

      <div className="px-4 py-6 max-w-5xl mx-auto pb-24">
        <div className="max-w-2xl mx-auto w-full">
          <form>
            <div className="space-y-6">
              {items.map((item, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                      <div>
                        <CardTitle className="text-xl">{itemLabel} {index + 1}</CardTitle>
                        <CardDescription>Specificeer de details.</CardDescription>
                      </div>

                      {/* Shape Selector - Moved here */}
                      <div className="inline-flex bg-muted/30 p-1 rounded-lg border border-border/50 self-start sm:self-center sm:ml-auto">
                        {[
                          { id: 'rectangle', icon: Square, label: 'Recht' },
                          { id: 'slope', icon: Slash, label: 'Schuin' },
                          { id: 'gable', icon: Triangle, label: 'Punt' },
                          { id: 'l-shape', icon: CornerDownRight, label: 'L-Vorm' },
                          { id: 'u-shape', icon: ArrowDownToLine, label: 'U-Vorm' }
                        ].map((shapeOption) => {
                          const currentShape = item.shape || 'rectangle';
                          const isActive = currentShape === shapeOption.id;
                          const Icon = shapeOption.icon;

                          return (
                            <button
                              key={shapeOption.id}
                              type="button"
                              onClick={() => updateItem(index, 'shape', shapeOption.id)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1 text-xs font-medium transition-all rounded-md",
                                isActive
                                  ? "bg-background text-emerald-500 shadow-sm ring-1 ring-emerald-500/50"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                              title={shapeOption.label}
                            >
                              <Icon className={cn("h-3.5 w-3.5", shapeOption.id === 'slope' && "-rotate-12")} />
                              <span className="hidden sm:inline">{shapeOption.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDeleteIndex(index)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2"
                        disabled={disabledAll}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Verwijder</span>
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-6">

                    {/* Variant Toggle (Top/Bottom) - Only for Slope and L-Shape */}
                    {(item.shape === 'slope' || item.shape === 'l-shape' || item.shape === 'u-shape') && (
                      <div className="flex justify-center -mt-2 mb-4">
                        <div className="inline-flex items-center p-1 bg-muted/50 rounded-lg border border-border/50">
                          <button
                            type="button"
                            onClick={() => updateItem(index, 'variant', 'top')}
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded-md transition-all",
                              (!item.variant || item.variant === 'top')
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {item.shape === 'slope' && "Schuinte Boven"}
                            {/* For L/U shapes "Boven" means the cutout/step is at the top? Or the shape is defined by top heights? 
                                  Standard L-Shape (Step Up/Down) varies the TOP height. Bottom is flat.
                                  "Boven" = Flat Bottom, Variable Top.
                              */}
                            {(item.shape === 'l-shape' || item.shape === 'u-shape') && "Variatie Boven"}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateItem(index, 'variant', 'bottom')}
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded-md transition-all",
                              item.variant === 'bottom'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {item.shape === 'slope' && "Schuinte Onder"}
                            {(item.shape === 'l-shape' || item.shape === 'u-shape') && "Variatie Onder"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* First row: Lengte & Hoogte(s) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Standard Lengte - Hidden for L-Shape */}
                      {(() => {
                        const shape = item.shape || 'rectangle';
                        if (shape === 'l-shape') return null;

                        return fields.filter(f => f.key === 'lengte').map(f => (
                          <DynamicInput
                            key={f.key}
                            field={f}
                            value={item[f.key]}
                            onChange={(val) => updateItem(index, f.key, val)}
                            onKeyDown={handleKeyDown}
                            disabled={disabledAll}
                          />
                        ));
                      })()}

                      {/* L-Shape Specific Inputs */
                        (() => {
                          const shape = item.shape || 'rectangle';
                          if (shape !== 'l-shape') return null;

                          // Helper to update L1 or L2 and recalc total length
                          const updateL = (key: 'lengte1' | 'lengte2', val: string) => {
                            const numVal = parseFloat(val) || 0;
                            const otherKey = key === 'lengte1' ? 'lengte2' : 'lengte1';
                            const otherVal = parseFloat(item[otherKey]) || 0;
                            const total = numVal + otherVal;

                            // Update both the specific field and the total length
                            setItems(prev => prev.map((it, i) =>
                              i === index ? { ...it, [key]: val, lengte: total } : it
                            ));
                          };

                          return (
                            <div className="contents">
                              {/* L1 & H1 */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`l1-${index}`}>Lengte 1 *</Label>
                                  <div className="relative">
                                    <Input
                                      id={`l1-${index}`}
                                      type="number"
                                      placeholder="3000"
                                      value={item.lengte1 || ''}
                                      onChange={(e) => updateL('lengte1', e.target.value)}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`h1-${index}`}>Hoogte 1 *</Label>
                                  <div className="relative">
                                    <Input
                                      id={`h1-${index}`}
                                      type="number"
                                      placeholder="2600"
                                      value={item.hoogte1 || ''}
                                      onChange={(e) => updateItem(index, 'hoogte1', e.target.value)}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                  </div>
                                </div>
                              </div>

                              {/* L2 & H2 */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`l2-${index}`}>Lengte 2 *</Label>
                                  <div className="relative">
                                    <Input
                                      id={`l2-${index}`}
                                      type="number"
                                      placeholder="2000"
                                      value={item.lengte2 || ''}
                                      onChange={(e) => updateL('lengte2', e.target.value)}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`h2-${index}`}>Hoogte 2 *</Label>
                                  <div className="relative">
                                    <Input
                                      id={`h2-${index}`}
                                      type="number"
                                      placeholder="1500"
                                      value={item.hoogte2 || ''}
                                      onChange={(e) => updateItem(index, 'hoogte2', e.target.value)}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      {/* U-Shape Inputs */}
                      {(() => {
                        const shape = item.shape || 'rectangle';
                        if (shape !== 'u-shape') return null;

                        // Helper for U-Shape total length
                        const updateU = (key: 'lengte1' | 'lengte2' | 'lengte3', val: string) => {
                          const numVal = parseFloat(val) || 0;
                          // Get others
                          const l1 = key === 'lengte1' ? numVal : (parseFloat(item.lengte1) || 0);
                          const l2 = key === 'lengte2' ? numVal : (parseFloat(item.lengte2) || 0);
                          const l3 = key === 'lengte3' ? numVal : (parseFloat(item.lengte3) || 0);

                          setItems(prev => prev.map((it, i) =>
                            i === index ? { ...it, [key]: val, lengte: l1 + l2 + l3 } : it
                          ));
                        };

                        return (
                          <div className="contents">
                            {/* L1 & H1 */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`ul1-${index}`}>Lengte 1 *</Label>
                                <div className="relative">
                                  <Input id={`ul1-${index}`} type="number" placeholder="1000" value={item.lengte1 || ''} onChange={(e) => updateU('lengte1', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`uh1-${index}`}>Hoogte 1 *</Label>
                                <div className="relative">
                                  <Input id={`uh1-${index}`} type="number" placeholder="2600" value={item.hoogte1 || ''} onChange={(e) => updateItem(index, 'hoogte1', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                            </div>
                            {/* L2 & H2 */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`ul2-${index}`}>Lengte 2 *</Label>
                                <div className="relative">
                                  <Input id={`ul2-${index}`} type="number" placeholder="1000" value={item.lengte2 || ''} onChange={(e) => updateU('lengte2', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`uh2-${index}`}>Hoogte 2 *</Label>
                                <div className="relative">
                                  <Input id={`uh2-${index}`} type="number" placeholder="1500" value={item.hoogte2 || ''} onChange={(e) => updateItem(index, 'hoogte2', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                            </div>
                            {/* L3 & H3 */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`ul3-${index}`}>Lengte 3 *</Label>
                                <div className="relative">
                                  <Input id={`ul3-${index}`} type="number" placeholder="1000" value={item.lengte3 || ''} onChange={(e) => updateU('lengte3', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`uh3-${index}`}>Hoogte 3 *</Label>
                                <div className="relative">
                                  <Input id={`uh3-${index}`} type="number" placeholder="2600" value={item.hoogte3 || ''} onChange={(e) => updateItem(index, 'hoogte3', e.target.value)} className="pr-8" />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Dynamic Height Inputs (if not L-shape which is handled above) */}
                      {(() => {
                        const shape = item.shape || 'rectangle';
                        if (shape === 'l-shape' || shape === 'u-shape') return null; // Already rendered inputs above

                        const hoogteField = fields.find(f => f.key === 'hoogte');

                        if (!hoogteField) return null;

                        if (shape === 'slope') {
                          return (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`hLeft-${index}`}>H. Links *</Label>
                                <div className="relative">
                                  <Input
                                    id={`hLeft-${index}`}
                                    type="number"
                                    placeholder="2600"
                                    value={item.hoogteLinks || ''}
                                    onChange={(e) => updateItem(index, 'hoogteLinks', e.target.value)}
                                    className="pr-8"
                                  />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`hRight-${index}`}>H. Rechts *</Label>
                                <div className="relative">
                                  <Input
                                    id={`hRight-${index}`}
                                    type="number"
                                    placeholder="1500"
                                    value={item.hoogteRechts || ''}
                                    onChange={(e) => updateItem(index, 'hoogteRechts', e.target.value)}
                                    className="pr-8"
                                  />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (shape === 'gable') {
                          return (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`hSide-${index}`}>H. Zijkant *</Label>
                                <div className="relative">
                                  <Input
                                    id={`hSide-${index}`}
                                    type="number"
                                    placeholder="2600" // Reuse standard 'hoogte' as side height often
                                    value={item.hoogte || ''}
                                    onChange={(e) => updateItem(index, 'hoogte', e.target.value)}
                                    className="pr-8"
                                  />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`hRidge-${index}`}>H. Nok *</Label>
                                <div className="relative">
                                  <Input
                                    id={`hRidge-${index}`}
                                    type="number"
                                    placeholder="4000"
                                    value={item.hoogteNok || ''}
                                    onChange={(e) => updateItem(index, 'hoogteNok', e.target.value)}
                                    className="pr-8"
                                  />
                                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Default Rectangle
                        return (
                          <DynamicInput
                            key={hoogteField.key}
                            field={hoogteField}
                            value={item[hoogteField.key]}
                            onChange={(val) => updateItem(index, hoogteField.key, val)}
                            onKeyDown={handleKeyDown}
                            disabled={disabledAll}
                          />
                        );
                      })()}
                    </div>

                    {/* Middle fields (balkafstand, etc.) - excluding textarea */}
                    <div className="space-y-4">
                      {fields.slice(2).filter(f => f.type !== 'textarea').map((field) => (
                        <div key={field.key} className="space-y-1">
                          <DynamicInput
                            field={field}
                            value={item[field.key]}
                            onChange={(val) => updateItem(index, field.key, val)}
                            onKeyDown={handleKeyDown}
                            disabled={disabledAll}
                            className="w-full"
                          />
                          {field.key === 'balkafstand' && (
                            <div className="flex items-center space-x-2 mt-2">
                              <button
                                type="button"
                                onClick={() => updateItem(index, 'startFromRight', !item.startFromRight)}
                                className={cn(
                                  "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2",
                                  item.startFromRight ? "bg-emerald-600" : "bg-zinc-700"
                                )}
                                role="switch"
                                aria-checked={item.startFromRight}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    item.startFromRight ? "translate-x-4" : "translate-x-0"
                                  )}
                                />
                              </button>
                              <Label onClick={() => updateItem(index, 'startFromRight', !item.startFromRight)} className="text-xs text-muted-foreground font-normal cursor-pointer select-none">
                                Startindeling vanaf rechts
                              </Label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>


                    {/* Wall Structure Visualizer - above opmerkingen */}
                    {fields.some(f => f.key === 'balkafstand') && (
                      <>
                        <WallStructureVisualizer
                          lengte={item['lengte'] || ''}
                          hoogte={item['hoogte'] || ''}
                          shape={item.shape || 'rectangle'}
                          hoogteLinks={item.hoogteLinks}
                          hoogteRechts={item.hoogteRechts}
                          hoogteNok={item.hoogteNok}
                          // L/U-Shape props
                          lengte1={item.lengte1}
                          hoogte1={item.hoogte1}
                          lengte2={item.lengte2}
                          hoogte2={item.hoogte2}
                          lengte3={item.lengte3}
                          hoogte3={item.hoogte3}
                          variant={item.variant || 'top'}

                          balkafstand={item['balkafstand'] || ''}
                          openings={item.openings || []}
                          startFromRight={item.startFromRight || false}
                          onOpeningsChange={(newOpenings) => updateItem(index, 'openings', newOpenings)}
                          isMagnifier={isMagnifier}
                          className="rounded-lg border border-border/30"
                        />

                        <div className="flex justify-between mt-2">
                          <Button
                            variant={isMagnifier ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "text-xs h-8",
                              isMagnifier ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" : "text-muted-foreground"
                            )}
                            onClick={() => setIsMagnifier(!isMagnifier)}
                            type="button"
                          >
                            <Search className="h-3 w-3 mr-2" />
                            Details vergroten
                          </Button>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8">
                                <Maximize2 className="h-3 w-3 mr-2" />
                                Tekening vergroten
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] w-full h-[85vh] flex flex-col p-0 bg-zinc-950/95 border-zinc-800 overflow-hidden">
                              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                                <DialogTitle className="text-lg font-medium text-zinc-200">
                                  Technische Tekening
                                </DialogTitle>
                              </div>
                              <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center bg-zinc-900/20 overflow-auto">
                                <div className="w-full h-full flex items-center justify-center">
                                  <WallStructureVisualizer
                                    lengte={item['lengte'] || ''}
                                    hoogte={item['hoogte'] || ''}
                                    shape={item.shape || 'rectangle'}
                                    hoogteLinks={item.hoogteLinks}
                                    hoogteRechts={item.hoogteRechts}
                                    hoogteNok={item.hoogteNok}
                                    // L-Shape props
                                    lengte1={item.lengte1}
                                    hoogte1={item.hoogte1}
                                    lengte2={item.lengte2}
                                    hoogte2={item.hoogte2}

                                    balkafstand={item['balkafstand'] || ''}
                                    openings={item.openings || []}
                                    // Also allow editing in expanded view
                                    onOpeningsChange={(newOpenings) => updateItem(index, 'openings', newOpenings)}
                                    fitContainer={true}
                                    isMagnifier={isMagnifier}
                                    startFromRight={item.startFromRight || false}
                                    className="w-full h-full"
                                  />
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {/* OPENINGS SECTION - Moved Here */}
                        <div className="mt-6 pt-6 border-t border-border/50 space-y-4">
                          {showOpeningsTip && (
                            <div className="flex items-start gap-3 bg-red-500/10 text-red-500 p-3 rounded-md text-sm relative animate-in fade-in slide-in-from-top-2">
                              <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
                              <p className="pr-6">Tip: Voor een basis materiaalberekening (platen/balken) is het detailleren van openingen vaak niet nodig. Het systeem rekent standaard met een dichte wand tenzij u hieronder details toevoegt.</p>
                              <button type="button" onClick={dismissTip} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                                <X className="h-4 w-4" />
                                <span className="sr-only">Sluiten</span>
                              </button>
                            </div>
                          )}

                          {(item.openings || []).map((op: any, opIdx: number) => (
                            <div key={op.id} className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-4 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">Opening {opIdx + 1}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    const newOpenings = (item.openings || []).filter((_: any, i: number) => i !== opIdx);
                                    updateItem(index, 'openings', newOpenings);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={op.type}
                                    onChange={(e) => {
                                      const newOpenings = [...(item.openings || [])];
                                      newOpenings[opIdx] = { ...op, type: e.target.value };
                                      updateItem(index, 'openings', newOpenings);
                                    }}
                                  >
                                    <option value="window">Raamkozijn</option>
                                    <option value="door">Deur</option>
                                    <option value="opening">Vrije sparing</option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Breedte</label>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={op.width}
                                        onChange={(e) => {
                                          const newOpenings = [...(item.openings || [])];
                                          newOpenings[opIdx] = { ...op, width: parseFloat(e.target.value) || 0 };
                                          updateItem(index, 'openings', newOpenings);
                                        }}
                                      />
                                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground leading-none">mm</span>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Hoogte</label>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={op.height}
                                        onChange={(e) => {
                                          const newOpenings = [...(item.openings || [])];
                                          newOpenings[opIdx] = { ...op, height: parseFloat(e.target.value) || 0 };
                                          updateItem(index, 'openings', newOpenings);
                                        }}
                                      />
                                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground leading-none">mm</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Van links</label>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={op.fromLeft}
                                        onChange={(e) => {
                                          const newOpenings = [...(item.openings || [])];
                                          newOpenings[opIdx] = { ...op, fromLeft: parseFloat(e.target.value) || 0 };
                                          updateItem(index, 'openings', newOpenings);
                                        }}
                                      />
                                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground leading-none">mm</span>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Van onder</label>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={op.fromBottom}
                                        onChange={(e) => {
                                          const newOpenings = [...(item.openings || [])];
                                          newOpenings[opIdx] = { ...op, fromBottom: parseFloat(e.target.value) || 0 };
                                          updateItem(index, 'openings', newOpenings);
                                        }}
                                      />
                                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground leading-none">mm</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newOpening = {
                                id: crypto.randomUUID(),
                                type: 'window',
                                width: 1000,
                                height: 1000,
                                fromLeft: 500,
                                fromBottom: 900
                              };
                              updateItem(index, 'openings', [...(item.openings || []), newOpening]);
                            }}
                            className="w-full sm:w-auto border-dashed"
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Opening toevoegen (Optioneel)
                          </Button>
                        </div>
                      </>
                    )}

                    {/* Textarea fields (opmerkingen) - at bottom */}
                    <div className="space-y-4">
                      {fields.filter(f => f.type === 'textarea').map((field) => (
                        <DynamicInput
                          key={field.key}
                          field={field}
                          value={item[field.key]}
                          onChange={(val) => updateItem(index, field.key, val)}
                          onKeyDown={handleKeyDown}
                          disabled={disabledAll}
                          className="w-full"
                        />
                      ))}
                    </div>

                  </CardContent>
                </Card>
              ))}
            </div>


          </form>
        </div>
      </div>


      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" asChild disabled={disabledAll}>
            <Link href={backUrl}>Terug</Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={addItem}
            disabled={disabledAll}
            className="text-emerald-500 border-emerald-500/50 hover:text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Extra {itemLabel} toevoegen
          </Button>

          <Button
            type="submit"
            variant="success"
            disabled={disabledAll}
            onClick={handleSave}
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      < AlertDialog open={pendingDeleteIndex !== null
      } onOpenChange={(open) => !open && setPendingDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{itemLabel} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{itemLabel} {pendingDeleteIndex !== null ? pendingDeleteIndex + 1 : ''}</strong> wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={() => setPendingDeleteIndex(null)}>
              <Button variant="ghost">Annuleren</Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteIndex !== null) {
                  removeItem(pendingDeleteIndex);
                  setPendingDeleteIndex(null);
                }
              }}
              asChild
            >
              <Button variant="destructiveSoft">Verwijderen</Button>
            </AlertDialogAction>
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
          <p className="text-xs text-muted-foreground">
            Optioneel. Alleen invullen bij bijzonderheden.
          </p>
          <Textarea
            id={field.key}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="resize-none"
            rows={3}
          />
        </div>
      ) : (
        <div className="relative">
          <Input
            id={field.key}
            type={field.type === 'number' ? 'number' : 'text'}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            className={field.suffix ? 'pr-10' : ''}
          />
          {field.suffix && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground text-sm">
              {field.suffix}
            </div>
          )}
        </div>
      )}

      {field.key === 'balkafstand' && (
        <p className="text-xs text-muted-foreground">Hart-op-hart afstand tussen de balken.</p>
      )}
    </div>
  );
}