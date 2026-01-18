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

import { useFirestore } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent } from '@/lib/types';
// import { WallStructureVisualizer } from '@/components/WallStructureVisualizer'; // Replaced by Controller
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

  // Logic to determine if "Openings" (Windows/Doors/Sparingen) section is relevant
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

  const handleShapeChange = (index: number, newShape: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;

      // Create a new object to ensure React detects the change
      const newItem: Record<string, any> = {};

      // Copy all properties first
      Object.keys(item).forEach(key => {
        newItem[key] = item[key];
      });

      // Update shape
      newItem.shape = newShape;

      // Reset dimensions that don't make sense across shapes
      // We explicitly clear these to prevent confusion
      // NOTE: h.o.h. fields (balkafstand, latafstand) are NOT reset - they keep their values
      const dimensionsToReset = [
        'lengte', 'hoogte',
        'lengte1', 'lengte2', 'lengte3',
        'hoogte1', 'hoogte2', 'hoogte3',
        'hoogteLinks', 'hoogteRechts',
        'hoogteNok',
        'variant'
      ];

      dimensionsToReset.forEach(key => {
        newItem[key] = '';
      });

      return newItem;
    }));
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
        // Capture and upload visualization image
        let visualisatieUrl: string | null = null;

        // Get the first visualizer ref (primary visualization)
        const visualizerElement = visualizerRefs.current[0];

        if (visualizerElement) {
          try {
            // Capture the visualization container as a canvas
            const canvas = await html2canvas(visualizerElement, {
              backgroundColor: '#18181b', // Match the dark background
              scale: 2, // Higher resolution
              logging: false,
              useCORS: true,
              allowTaint: true,
            });

            // Convert canvas to blob
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Failed to create blob from canvas'));
              }, 'image/png', 0.95);
            });

            // Get the Firebase app from auth and initialize storage
            const auth = getAuth();
            const storage = getStorage(auth.app);

            // Create storage reference with path: visualisaties/${quoteId}/${klusId}.png
            const storageRef = ref(storage, `visualisaties/${quoteId}/${klusId}.png`);

            // Upload the blob
            await uploadBytes(storageRef, blob, {
              contentType: 'image/png',
            });

            // Get the download URL
            visualisatieUrl = await getDownloadURL(storageRef);

            console.log('Visualization uploaded successfully:', visualisatieUrl);
          } catch (uploadError) {
            console.error('Error capturing/uploading visualization:', uploadError);
            // Continue saving even if image upload fails
            toast({
              variant: "destructive",
              title: "Visualisatie upload mislukt",
              description: "De tekening kon niet worden opgeslagen, maar de gegevens worden wel bewaard."
            });
          }
        }

        const quoteRef = doc(firestore, 'quotes', quoteId);

        // Prepare update data
        const updateData: Record<string, any> = {
          [`klussen.${klusId}.maatwerk`]: items,
          [`klussen.${klusId}.components`]: components,
          [`klussen.${klusId}.meta`]: {
            title: jobConfig.title,
            type: categorySlug,
            slug: jobSlug,
            description: jobConfig.description
          },
          [`klussen.${klusId}.updatedAt`]: serverTimestamp(),
        };

        // Add visualisatieUrl if upload was successful
        if (visualisatieUrl) {
          updateData[`klussen.${klusId}.visualisatieUrl`] = visualisatieUrl;
        }

        await updateDoc(quoteRef, updateData);

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
        <div className="max-w-full mx-auto w-full">
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
                          { id: 'l-shape', icon: null, label: 'L-Vorm', customIcon: 'L' },
                          { id: 'u-shape', icon: null, label: 'U-Vorm', customIcon: 'U' }
                        ].map((shapeOption) => {
                          const currentShape = item.shape || 'rectangle';
                          const isActive = currentShape === shapeOption.id;
                          const Icon = shapeOption.icon;

                          // Custom L-shape icon (simple L)
                          const LShapeIcon = () => (
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 4 L6 18 L20 18" />
                            </svg>
                          );

                          // Custom U-shape icon (straight U)
                          const UShapeIcon = () => (
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 4 L4 18 L20 18 L20 4" />
                            </svg>
                          );

                          return (
                            <button
                              key={shapeOption.id}
                              type="button"
                              onClick={() => handleShapeChange(index, shapeOption.id)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1 text-xs font-medium transition-all rounded-md",
                                isActive
                                  ? "bg-background text-emerald-500 shadow-sm ring-1 ring-emerald-500/50"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                              title={shapeOption.label}
                            >
                              {shapeOption.customIcon === 'L' ? (
                                <LShapeIcon />
                              ) : shapeOption.customIcon === 'U' ? (
                                <UShapeIcon />
                              ) : Icon ? (
                                <Icon className={cn("h-3.5 w-3.5", shapeOption.id === 'slope' && "-rotate-12")} />
                              ) : null}
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

                      {/* Dynamic Height/Breedte Inputs (if not L-shape which is handled above) */}
                      {(() => {
                        const shape = item.shape || 'rectangle';
                        if (shape === 'l-shape' || shape === 'u-shape') return null; // Already rendered inputs above

                        // Look for 'hoogte' OR 'breedte' field (some job types use breedte instead)
                        const hoogteField = fields.find(f => f.key === 'hoogte') || fields.find(f => f.key === 'breedte');

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

                        // Default Rectangle - render the field (whether it's 'hoogte' or 'breedte')
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
                      {(() => {
                        const fieldsToRender = fields.slice(2).filter(f => f.type !== 'textarea' && !['balkafstand', 'latafstand', 'dakrand_breedte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right'].includes(f.key));

                        // Group adjacent fields with the same group property
                        const groupedFields = fieldsToRender.reduce((acc, field) => {
                          const lastGroup = acc[acc.length - 1];
                          if (field.group && lastGroup && lastGroup[0].group === field.group) {
                            lastGroup.push(field);
                          } else {
                            acc.push([field]);
                          }
                          return acc;
                        }, [] as typeof fields[]);

                        return groupedFields.map((group, groupIndex) => (
                          <div key={groupIndex} className={cn(group.length > 1 && "grid grid-cols-1 sm:grid-cols-2 gap-4")}>
                            {group.map(field => (
                              <div key={field.key} className="space-y-1">
                                <DynamicInput
                                  field={field}
                                  value={item[field.key]}
                                  onChange={(val) => updateItem(index, field.key, val)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                  className="w-full"
                                />

                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>


                    {/* Visualizer Controller with Overlay Controls */}
                    <div
                      ref={(el) => { visualizerRefs.current[index] = el; }}
                      className="relative group border rounded-lg overflow-hidden border-border/30 bg-secondary/5"
                    >
                      <VisualizerController
                        category={categorySlug}
                        slug={jobSlug}
                        item={item}
                        fields={fields}
                        title={`${itemLabel} ${index + 1}`}
                        isMagnifier={isMagnifier}
                        fitContainer={true}
                        gridLabel={(categorySlug === 'vloeren' || jobSlug.includes('vloer') || jobSlug.includes('vlonder') || jobSlug.includes('balklaag') || jobSlug.includes('vliering')) ? ' ' : undefined}
                        className="min-h-[400px]" // Ensure minimum height
                        onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                        onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                      />

                      {/* Floating Controls - Bottom Left */}
                      <div className="absolute bottom-3 left-3 flex gap-2 transition-opacity duration-200">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-8 w-8 bg-background/80 hover:bg-background backdrop-blur-sm border border-border/50 shadow-sm"
                              title="Vergroten"
                            >
                              <Maximize2 className="h-4 w-4 text-foreground" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[95vw] w-full h-[85vh] flex flex-col p-0 bg-zinc-950/95 border-zinc-800 overflow-hidden">
                            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                              <DialogTitle className="text-lg font-medium text-zinc-200">
                                Technische Tekening
                              </DialogTitle>
                            </div>
                            <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center bg-zinc-900/20 overflow-auto">
                              <div className="w-full h-full flex items-center justify-center relative">
                                <VisualizerController
                                  category={categorySlug}
                                  slug={jobSlug}
                                  item={item}
                                  fields={fields}
                                  title={`${itemLabel} ${index + 1}`}
                                  isMagnifier={isMagnifier}
                                  fitContainer={true}
                                  gridLabel={(categorySlug === 'vloeren' || jobSlug.includes('vloer') || jobSlug.includes('vlonder') || jobSlug.includes('balklaag') || jobSlug.includes('vliering')) ? ' ' : undefined}
                                  className="w-full h-full"
                                  onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                                  onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                                />
                                <div className="absolute bottom-4 right-4 flex flex-col items-end pointer-events-none select-none">
                                  {(categorySlug === 'vloeren' || jobSlug.includes('vloer') || jobSlug.includes('vlonder') || jobSlug.includes('balklaag') || jobSlug.includes('vliering')) && (
                                    <div className="text-[10px] sm:text-xs text-zinc-500/80 font-bold uppercase tracking-wider mb-0.5">
                                      Vloer vlak {index + 1}
                                    </div>
                                  )}
                                  <div className="text-[10px] sm:text-xs text-zinc-500 font-medium font-mono">
                                    {(() => {
                                      const shape = item.shape || 'rectangle';
                                      const L = parseFloat(String(item.lengte || 0));
                                      const H = parseFloat(String(item.hoogte || 0));

                                      let areaMm2 = 0;

                                      if (shape === 'rectangle') {
                                        areaMm2 = L * H;
                                      } else if (shape === 'slope') {
                                        const hL = parseFloat(String(item.hoogteLinks || 0));
                                        const hR = parseFloat(String(item.hoogteRechts || 0));
                                        const avgH = (hL + hR) / 2;
                                        areaMm2 = L * avgH;
                                      } else if (shape === 'gable') {
                                        const hNok = parseFloat(String(item.hoogteNok || 0));
                                        areaMm2 = L * ((H + hNok) / 2);
                                      } else if (shape === 'l-shape') {
                                        // Use stored values for L-Shape if available, or calc
                                        const l1 = parseFloat(String(item.lengte1 || 0));
                                        const h1 = parseFloat(String(item.hoogte1 || 0));
                                        const h2 = parseFloat(String(item.hoogte2 || 0));
                                        areaMm2 = (l1 * h1) + ((L - l1) * h2);
                                      } else if (shape === 'u-shape') {
                                        const l1 = parseFloat(String(item.lengte1 || 0));
                                        const l2 = parseFloat(String(item.lengte2 || 0));
                                        const h1 = parseFloat(String(item.hoogte1 || 0));
                                        const h2 = parseFloat(String(item.hoogte2 || 0));
                                        const h3 = parseFloat(String(item.hoogte3 || 0));
                                        areaMm2 = (l1 * h1) + (l2 * h2) + ((L - l1 - l2) * h3);
                                      } else {
                                        areaMm2 = L * H;
                                      }

                                      return (areaMm2 / 1000000).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()} m²
                                  </div>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {/* Floating Controls - Bottom Right (Area Helper) */}
                      {/* Floating Controls - Bottom Right (Area Helper) */}
                      <div className="absolute bottom-2 right-3 flex flex-col items-end pointer-events-none select-none">
                        {(categorySlug === 'vloeren' || jobSlug.includes('vloer') || jobSlug.includes('vlonder') || jobSlug.includes('balklaag') || jobSlug.includes('vliering')) && (
                          <div className="text-[10px] sm:text-xs text-muted-foreground/60 font-bold uppercase tracking-wider mb-0.5">
                            Vloer vlak {index + 1}
                          </div>
                        )}
                        <div className="text-[10px] sm:text-xs text-muted-foreground/50 font-medium font-mono">
                          {(() => {
                            const shape = item.shape || 'rectangle';
                            const L = parseFloat(String(item.lengte || 0));
                            const H = parseFloat(String(item.hoogte || 0));

                            let areaMm2 = 0;

                            if (shape === 'rectangle') {
                              areaMm2 = L * H;
                            } else if (shape === 'slope') {
                              const hL = parseFloat(String(item.hoogteLinks || 0));
                              const hR = parseFloat(String(item.hoogteRechts || 0));
                              const avgH = (hL + hR) / 2;
                              areaMm2 = L * avgH;
                            } else if (shape === 'gable') {
                              const hNok = parseFloat(String(item.hoogteNok || 0));
                              areaMm2 = L * ((H + hNok) / 2);
                            } else if (shape === 'l-shape') {
                              const l1 = parseFloat(String(item.lengte1 || 0));
                              const h1 = parseFloat(String(item.hoogte1 || 0));
                              const h2 = parseFloat(String(item.hoogte2 || 0));
                              areaMm2 = (l1 * h1) + ((L - l1) * h2);
                            } else if (shape === 'u-shape') {
                              const l1 = parseFloat(String(item.lengte1 || 0));
                              const l2 = parseFloat(String(item.lengte2 || 0));
                              const h1 = parseFloat(String(item.hoogte1 || 0));
                              const h2 = parseFloat(String(item.hoogte2 || 0));
                              const h3 = parseFloat(String(item.hoogte3 || 0));
                              areaMm2 = (l1 * h1) + (l2 * h2) + ((L - l1 - l2) * h3);
                            } else {
                              areaMm2 = L * H;
                            }

                            return (areaMm2 / 1000000).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          })()} m²
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mt-6">
                      {(() => {
                        const epdmFields = fields.filter(f => ['dakrand_breedte'].includes(f.key));

                        if (epdmFields.length === 0) return null;

                        // Reuse grouping logic
                        const groupedEpdm = epdmFields.reduce((acc, field) => {
                          const lastGroup = acc[acc.length - 1];
                          if (field.group && lastGroup && lastGroup[0].group === field.group) {
                            lastGroup.push(field);
                          } else {
                            acc.push([field]);
                          }
                          return acc;
                        }, [] as typeof fields[]);

                        return groupedEpdm.map((group, groupIndex) => (
                          <div key={`epdm-g-${groupIndex}`} className={cn(group.length > 1 && "grid grid-cols-1 sm:grid-cols-2 gap-4")}>
                            {group.map(field => (
                              <div key={field.key} className="space-y-1">
                                <DynamicInput
                                  field={field}
                                  value={item[field.key]}
                                  onChange={(val) => updateItem(index, field.key, val)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                  className="w-full"
                                />
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>

                    {/* Controls Moved Here */}
                    {/* Controls Moved Here */}
                    <div className="flex flex-col gap-6 mt-6 w-full max-w-4xl mx-auto">



                      {/* Grid for Balken & Latten */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Column 1: Balken (Vertical) */}
                        {fields.some(f => f.key === 'balkafstand') && (
                          <div className="flex flex-col gap-3">
                            {/* Input */}
                            {(() => {
                              const field = fields.find(f => f.key === 'balkafstand')!;
                              return (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <Label htmlFor={`balk-${index}`} className="text-sm font-medium text-foreground">{field.label}</Label>
                                  </div>
                                  <div className="relative">
                                    <Input
                                      id={`balk-${index}`}
                                      type="number"
                                      placeholder={field.placeholder}
                                      value={item[field.key]}
                                      onChange={(e) => updateItem(index, field.key, e.target.value)}
                                      disabled={disabledAll}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">mm</span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Startindeling Controls */}
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground block">Startindeling</span>
                              <div className="inline-flex w-full items-center p-1 bg-muted/50 rounded-lg border border-border/50">
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'startFromRight', false)}
                                  className={cn(
                                    "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
                                    !item.startFromRight
                                      ? "bg-background text-foreground shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Links
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'startFromRight', true)}
                                  className={cn(
                                    "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
                                    item.startFromRight
                                      ? "bg-background text-foreground shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Rechts
                                </button>
                              </div>
                            </div>

                            {/* Schuinte / Variant Controls (Moved Here) */}
                            {(item.shape === 'slope' || item.shape === 'l-shape' || item.shape === 'u-shape') && (
                              <div className="space-y-1.5 pt-2">
                                <span className="text-xs font-medium text-muted-foreground block">Schuinte</span>
                                <div className="inline-flex w-full items-center p-1 bg-muted/50 rounded-lg border border-border/50">
                                  <button
                                    type="button"
                                    onClick={() => updateItem(index, 'variant', 'top')}
                                    className={cn(
                                      "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
                                      (!item.variant || item.variant === 'top')
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    {item.shape === 'slope' && "Schuinte Boven"}
                                    {(item.shape === 'l-shape' || item.shape === 'u-shape') && "Variatie Boven"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateItem(index, 'variant', 'bottom')}
                                    className={cn(
                                      "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
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
                          </div>
                        )}

                        {/* Column 2: Latten (Horizontal) */}
                        {fields.some(f => f.key === 'latafstand') && (
                          <div className="flex flex-col gap-3">
                            {/* Input */}
                            {(() => {
                              const field = fields.find(f => f.key === 'latafstand')!;
                              return (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <Label htmlFor={`lat-${index}`} className="text-sm font-medium text-foreground">{field.label}</Label>
                                  </div>
                                  <div className="relative">
                                    <Input
                                      id={`lat-${index}`}
                                      type="number"
                                      placeholder={field.placeholder}
                                      value={item[field.key]}
                                      onChange={(e) => updateItem(index, field.key, e.target.value)}
                                      disabled={disabledAll}
                                      className="pr-8"
                                    />
                                    <span className="absolute right-3 top-2 text-sm text-muted-foreground">mm</span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Startindeling Controls */}
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground block">Startindeling</span>
                              <div className="inline-flex w-full items-center p-1 bg-muted/50 rounded-lg border border-border/50">
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'startLattenFromBottom', false)}
                                  className={cn(
                                    "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
                                    !item.startLattenFromBottom
                                      ? "bg-background text-foreground shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Boven
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'startLattenFromBottom', true)}
                                  className={cn(
                                    "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center",
                                    item.startLattenFromBottom
                                      ? "bg-background text-foreground shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Onder
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>


                    {/* OPENINGS SECTION - Moved Here */}
                    {showOpeningsSection && (
                      <div className="mt-6 pt-6 border-t border-border/50 space-y-4">
                        {showOpeningsTip && (
                          <div className="flex items-start gap-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 p-4 rounded-lg text-sm relative animate-in fade-in slide-in-from-top-2">
                            <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-sky-400" />
                            <div className="flex-1 pr-6">
                              <p className="font-medium text-sky-300 mb-1">Tip</p>
                              <p className="text-sky-200/90 leading-relaxed">
                                Voor een basis materiaalberekening (platen/balken) is het detailleren van openingen vaak niet nodig.
                                Het systeem rekent standaard met een dichte wand tenzij u hieronder details toevoegt.
                              </p>
                              <button
                                type="button"
                                onClick={dismissTip}
                                className="text-xs font-medium text-sky-400 hover:text-sky-300 underline mt-2 transition-colors"
                              >
                                Niet meer tonen
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowOpeningsTip(false)}
                              className="absolute top-2 right-2 text-sky-500/50 hover:text-sky-400 transition-colors"
                            >
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
                                  {isWallCategory ? (
                                    <>
                                      <option value="window">Kozijn</option>
                                      <option value="door">Deur</option>
                                      <option value="opening">Sparing</option>
                                      <option value="other">Overig</option>
                                    </>
                                  ) : (categorySlug === 'vloeren' || jobSlug.includes('vloer') || jobSlug.includes('vlonder') || jobSlug.includes('balklaag') || jobSlug.includes('vliering')) ? (
                                    <>
                                      <option value="opening">Sparing</option>
                                      <option value="pillar">Pilaar / Kolom</option>
                                      <option value="tree">Boom</option>
                                      <option value="hatch">Luik</option>
                                      <option value="other">Overig</option>
                                    </>
                                  ) : categorySlug === 'dakrenovatie' ? (
                                    <>
                                      <option value="dakraam">Dakraam</option>
                                      <option value="schoorsteen">Schoorsteen</option>
                                      <option value="opening">Sparing</option>
                                      <option value="other">Overig</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="opening">Sparing / Trapgat</option>
                                      <option value="Lichtkoepel">Lichtkoepel</option>
                                      <option value="hatch">Luik / Vlieringtrap</option>
                                      <option value="other">Overig</option>
                                    </>
                                  )}
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
                                  <label className="text-xs font-medium text-muted-foreground">Lengte</label>
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
                                  <label className="text-xs font-medium text-muted-foreground">Vanaf Links</label>
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
                                  <label className="text-xs font-medium text-muted-foreground">
                                    {isWallCategory ? 'Vanaf Vloer' : 'Vanaf Boven'}
                                  </label>
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
                              type: 'opening',
                              width: 600,
                              height: 600,
                              fromLeft: 1000,
                              fromBottom: 1000
                            };
                            updateItem(index, 'openings', [...(item.openings || []), newOpening]);
                          }}
                          className="w-full sm:w-auto border-dashed"
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Opening toevoegen (Optioneel)
                        </Button>
                      </div>
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
      </div >

      {/* Sticky Footer */}
      < div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50" >
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" asChild disabled={disabledAll}>
            <Link href={backUrl}>Terug</Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={addItem}
            disabled={disabledAll}
            className=""
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
      </div >

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
        </AlertDialogContent >
      </AlertDialog >
    </main >
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
      ) : field.type === 'select' ? (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={field.key}>
            <SelectValue placeholder={field.placeholder || "Selecteer..."} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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


    </div>
  );
}