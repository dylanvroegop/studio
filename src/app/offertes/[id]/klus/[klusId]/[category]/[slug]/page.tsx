'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle } from 'lucide-react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PersonalNotes } from '@/components/PersonalNotes';
import { cn } from '@/lib/utils'; 

import { useFirestore } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';

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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Get Config
  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const fields = jobConfig?.measurements || [];

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);

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
  const progressValue = 50;
  
  // Use custom label OR fallback to first word
  const itemLabel = jobConfig.measurementLabel || jobConfig.title.split(' ')[0] || 'Item';

  // ✅ Smart back button: skip category selection for single-item categories
  const hasOnlyOneItem = categoryConfig?.items?.length === 1;
  const backUrl = hasOnlyOneItem 
    ? `/offertes/${quoteId}/klus/nieuw`  // Go to main category page
    : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`; // Go to category selection

  return (
    <main className="relative min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
              <Link href={backUrl}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1">
              <div className="text-sm font-semibold text-center">{jobConfig.title}</div>
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted/40 mx-auto">
                  <div
                    className="h-full rounded-full bg-primary/65 transition-all"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
               <PersonalNotes quoteId={quoteId} />
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 max-w-5xl mx-auto pb-24">
        <div className="max-w-2xl mx-auto w-full">
          <form>
            <div className="space-y-6">
              {items.map((item, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{itemLabel} {index + 1}</CardTitle>
                      <CardDescription>Specificeer de details.</CardDescription>
                    </div>

                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0 -mr-2"
                        disabled={disabledAll}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Verwijder</span>
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {fields.slice(0, 2).map((field) => (
                         <DynamicInput 
                           key={field.key}
                           field={field}
                           value={item[field.key]}
                           onChange={(val) => updateItem(index, field.key, val)}
                           onKeyDown={handleKeyDown}
                           disabled={disabledAll}
                           className="col-span-1"
                         />
                      ))}
                    </div>

                    <div className="space-y-4">
                      {fields.slice(2).map((field) => (
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

            <Button
              type="button"
              variant="successGhost"
              onClick={addItem}
              disabled={disabledAll}
              className={cn('w-full mt-6 rounded-xl transition-colors')}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              {itemLabel} toevoegen
            </Button>

            <div className="mt-6 flex justify-between items-center">
              <Button variant="outline" asChild disabled={disabledAll}>
                 <Link href={backUrl}>Terug</Link>
              </Button>

              <Button
                type="submit"
                variant="success"
                disabled={disabledAll}
                onClick={handleSave}
              >
                {saving ? 'Opslaan...' : 'Volgende'}
              </Button>
            </div>
          </form>
        </div>
      </div>
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