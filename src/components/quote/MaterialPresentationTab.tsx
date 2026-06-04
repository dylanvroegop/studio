'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Plus, Sparkles, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import type { MaterialPresentation } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MaterialPresentationTabProps {
  items: MaterialPresentation[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<MaterialPresentation>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onUploadImage: (id: string, field: 'product' | 'specs', file: File) => Promise<void>;
  onAnalyze: (id: string) => Promise<void>;
  uploadingKey: string | null;
  analyzingId: string | null;
}

function FieldTextarea({
  id,
  label,
  value,
  rows = 4,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

export function MaterialPresentationTab({
  items,
  onAdd,
  onChange,
  onDelete,
  onMove,
  onUploadImage,
  onAnalyze,
  uploadingKey,
  analyzingId,
}: MaterialPresentationTabProps) {
  const productInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const specsInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addKeyProperty = (item: MaterialPresentation) => {
    onChange(item.id, { keyProperties: [...item.keyProperties, ''] });
  };

  const updateKeyProperty = (item: MaterialPresentation, index: number, value: string) => {
    onChange(item.id, {
      keyProperties: item.keyProperties.map((property, propertyIndex) => (
        propertyIndex === index ? value : property
      )),
    });
  };

  const removeKeyProperty = (item: MaterialPresentation, index: number) => {
    onChange(item.id, {
      keyProperties: item.keyProperties.filter((_, propertyIndex) => propertyIndex !== index),
    });
  };

  const addSpecification = (item: MaterialPresentation) => {
    onChange(item.id, {
      visibleSpecifications: [...item.visibleSpecifications, { label: '', value: '' }],
    });
  };

  const updateSpecification = (
    item: MaterialPresentation,
    index: number,
    field: 'label' | 'value',
    value: string,
  ) => {
    onChange(item.id, {
      visibleSpecifications: item.visibleSpecifications.map((specification, specificationIndex) => (
        specificationIndex === index ? { ...specification, [field]: value } : specification
      )),
    });
  };

  const removeSpecification = (item: MaterialPresentation, index: number) => {
    onChange(item.id, {
      visibleSpecifications: item.visibleSpecifications.filter((_, specificationIndex) => specificationIndex !== index),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Materiaalpresentatie</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Leg per zichtbaar of kwaliteitsbepalend materiaal vast wat de klant mag zien in de offerte.
          </p>
        </div>
        <Button type="button" onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Materiaal toevoegen
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <ImageIcon className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
          <h3 className="text-base font-medium text-foreground">Nog geen materiaalpresentaties</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Voeg een kaart toe, upload product- en specificatiebeelden en laat AI een klantvriendelijke tekst voorstellen.
          </p>
          <Button type="button" onClick={onAdd} className="mt-5 gap-2">
            <Plus className="h-4 w-4" />
            Eerste materiaal toevoegen
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => {
            const isAnalyzing = analyzingId === item.id;
            const productUploadKey = `${item.id}:product`;
            const specsUploadKey = `${item.id}:specs`;
            const canAnalyze = Boolean(item.productImageUrl || item.specsImageUrl);

            return (
              <section key={item.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Materiaal {index + 1}
                    </p>
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {item.title || 'Nieuwe materiaalpresentatie'}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Omhoog"
                      aria-label="Materiaal omhoog"
                      disabled={index === 0}
                      onClick={() => onMove(item.id, 'up')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Omlaag"
                      aria-label="Materiaal omlaag"
                      disabled={index === items.length - 1}
                      onClick={() => onMove(item.id, 'down')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={!canAnalyze || isAnalyzing}
                      onClick={() => { void onAnalyze(item.id); }}
                    >
                      {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      AI analyseren
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Verwijderen"
                      aria-label="Materiaal verwijderen"
                      onClick={() => setDeleteId(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-5 p-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-border bg-background">
                      <div className="aspect-[4/3] bg-muted/60">
                        {item.productImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.productImageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="border-t border-border p-2">
                        <input
                          ref={(node) => { productInputs.current[item.id] = node; }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void onUploadImage(item.id, 'product', file);
                            event.currentTarget.value = '';
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          disabled={uploadingKey === productUploadKey}
                          onClick={() => productInputs.current[item.id]?.click()}
                        >
                          {uploadingKey === productUploadKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          Upload productafbeelding
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={(node) => { specsInputs.current[item.id] = node; }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onUploadImage(item.id, 'specs', file);
                        event.currentTarget.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={uploadingKey === specsUploadKey}
                      onClick={() => specsInputs.current[item.id]?.click()}
                    >
                      {uploadingKey === specsUploadKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Upload specificaties
                    </Button>
                    {item.specsImageUrl ? (
                      <p className="text-xs text-emerald-300">Specificatiebeeld is toegevoegd.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Specificatiebeeld is optioneel, maar verbetert de AI-analyse.</p>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`material-title-${item.id}`}>Titel</Label>
                        <Input
                          id={`material-title-${item.id}`}
                          value={item.title}
                          onChange={(event) => onChange(item.id, { title: event.target.value })}
                          placeholder="Bijv. Kunststof boeidelen antraciet"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`material-application-${item.id}`}>Toepassing</Label>
                        <Input
                          id={`material-application-${item.id}`}
                          value={item.application}
                          onChange={(event) => onChange(item.id, { application: event.target.value })}
                          placeholder="Bijv. Afwerking van de dakrand"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <FieldTextarea
                        id={`material-description-${item.id}`}
                        label="Klantomschrijving"
                        value={item.clientDescription}
                        onChange={(value) => onChange(item.id, { clientDescription: value })}
                      />
                      <FieldTextarea
                        id={`material-why-${item.id}`}
                        label="Waarom gekozen?"
                        value={item.whyChosen}
                        onChange={(value) => onChange(item.id, { whyChosen: value })}
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Eigenschappen</Label>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => addKeyProperty(item)}>
                            <Plus className="h-3.5 w-3.5" />
                            Eigenschap
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {item.keyProperties.map((property, propertyIndex) => (
                            <div key={`${item.id}-property-${propertyIndex}`} className="flex gap-2">
                              <Input
                                value={property}
                                onChange={(event) => updateKeyProperty(item, propertyIndex, event.target.value)}
                                placeholder="Bijv. Onderhoudsarm"
                              />
                              <Button type="button" variant="outline" size="icon" onClick={() => removeKeyProperty(item, propertyIndex)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {item.keyProperties.length === 0 && (
                            <p className="text-xs text-muted-foreground">Nog geen eigenschappen toegevoegd.</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Zichtbare specificaties</Label>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => addSpecification(item)}>
                            <Plus className="h-3.5 w-3.5" />
                            Specificatie
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {item.visibleSpecifications.map((specification, specificationIndex) => (
                            <div key={`${item.id}-spec-${specificationIndex}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-2">
                              <Input
                                value={specification.label}
                                onChange={(event) => updateSpecification(item, specificationIndex, 'label', event.target.value)}
                                placeholder="Kleur"
                              />
                              <Input
                                value={specification.value}
                                onChange={(event) => updateSpecification(item, specificationIndex, 'value', event.target.value)}
                                placeholder="Antraciet"
                              />
                              <Button type="button" variant="outline" size="icon" onClick={() => removeSpecification(item, specificationIndex)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {item.visibleSpecifications.length === 0 && (
                            <p className="text-xs text-muted-foreground">Nog geen specificaties toegevoegd.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
                      {[
                        ['showInQuote', 'Toon in offerte'],
                        ['showProductImage', 'Toon afbeelding'],
                        ['showTechnicalDetails', 'Toon technische details'],
                        ['allowEquivalentAlternative', 'Gelijkwaardig alternatief toegestaan na overleg'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                          <span className={cn(key === 'showInQuote' && 'font-medium')}>{label}</span>
                          <Switch
                            checked={Boolean(item[key as keyof MaterialPresentation])}
                            onCheckedChange={(checked) => onChange(item.id, { [key]: checked } as Partial<MaterialPresentation>)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Materiaalpresentatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze kaart wordt uit de offerte verwijderd. Geüploade afbeeldingen worden waar mogelijk ook uit opslag verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
