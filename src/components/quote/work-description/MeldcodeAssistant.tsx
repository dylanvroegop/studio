'use client';

import { useMemo, useState } from 'react';
import { Check, ExternalLink, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  buildMeldcodeMaterialContextText,
  findMeldcodeCandidates,
  inferMeldcodeApplication,
  isInsulationMaterial,
  MELDCODE_APPLICATION_OPTIONS,
  type MeldcodeApplication,
  type MeldcodeMaterialContext,
  type MeldcodeResolution,
} from '@/lib/meldcode-context';

interface MeldcodeAssistantProps {
  materials: MeldcodeMaterialContext[];
  additionalContext: string;
  onApply: (materialKey: string, resolution: MeldcodeResolution) => void | Promise<void>;
}

function statusLabel(material: MeldcodeMaterialContext): string {
  if (material.meldcode) return `${material.meldcode}${material.meldcodeStatus === 'automatic' ? ' · automatisch' : ''}`;
  return 'Nog niet bepaald';
}

export function MeldcodeAssistant({ materials, additionalContext, onApply }: MeldcodeAssistantProps) {
  const insulationMaterials = useMemo(
    () => materials.filter((material) => isInsulationMaterial(material.name)),
    [materials],
  );
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);
  const selectedMaterial = insulationMaterials.find((material) => material.key === selectedMaterialKey) || null;
  const [application, setApplication] = useState<MeldcodeApplication>('onbekend');
  const [freeform, setFreeform] = useState('');
  const [resolution, setResolution] = useState<MeldcodeResolution | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openForMaterial = (material: MeldcodeMaterialContext) => {
    const inferred = inferMeldcodeApplication(additionalContext);
    setSelectedMaterialKey(material.key);
    setApplication(inferred.application);
    setFreeform('');
    setResolution(null);
  };

  const analyze = () => {
    if (!selectedMaterial) return;
    const context = buildMeldcodeMaterialContextText(selectedMaterial, [additionalContext, freeform].filter(Boolean).join('\n'));
    const freeformInference = freeform.trim() ? inferMeldcodeApplication(freeform) : null;
    const inferred = freeformInference && freeformInference.application !== 'onbekend'
      ? freeformInference
      : inferMeldcodeApplication(context, application);
    const candidates = findMeldcodeCandidates(selectedMaterial.name, inferred.application, context);
    setResolution({
      application: inferred.application,
      applicationLabel: MELDCODE_APPLICATION_OPTIONS.find((option) => option.value === inferred.application)?.label || 'Onbekend',
      context,
      status: candidates.length === 1 ? 'automatic' : 'unresolved',
      confidence: candidates.length === 1 ? inferred.confidence : 'low',
      candidates,
      selectedCandidate: candidates.length === 1 ? candidates[0] : undefined,
    });
  };

  const apply = async (candidate?: MeldcodeResolution['selectedCandidate']) => {
    if (!selectedMaterial || !resolution) return;
    setIsSaving(true);
    try {
      await onApply(selectedMaterial.key, {
        ...resolution,
        status: candidate ? 'confirmed' : 'unresolved',
        selectedCandidate: candidate,
      });
      setSelectedMaterialKey(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (insulationMaterials.length === 0) return null;

  return (
    <>
      <Card className="border-emerald-500/25 bg-emerald-500/[0.04]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Materiaalcontext &amp; meldcodes
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Deze isolatiematerialen komen uit de calculatie. Werk &amp; Levering gebruikt ze samen met de notities en omschrijving als context.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
            {additionalContext.trim()
              ? 'Context uit offerte, Werk & Levering en notities wordt meegenomen.'
              : 'Voeg eventueel in Werk & Levering of de notities toe waar de isolatie wordt toegepast.'}
          </div>
          {insulationMaterials.map((material) => (
            <div key={material.key} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{material.name}</div>
                <div className="text-xs text-muted-foreground">{material.quantity} {material.unit} · {statusLabel(material)}</div>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-2 self-start sm:self-auto" onClick={() => openForMaterial(material)}>
                <Search className="h-3.5 w-3.5" />
                Meldcode bepalen
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedMaterial)} onOpenChange={(open) => { if (!open) setSelectedMaterialKey(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Waar wordt deze isolatie toegepast?</DialogTitle>
            <DialogDescription>
              Kies een situatie of beschrijf het vrij. De bestaande offertecontext wordt automatisch meegenomen.
            </DialogDescription>
          </DialogHeader>

          {selectedMaterial && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Materiaal</div>
                <div className="mt-1 text-sm font-medium">{selectedMaterial.name}</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {MELDCODE_APPLICATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { setApplication(option.value); setResolution(null); }}
                    className={`rounded-lg border p-3 text-left transition-colors ${application === option.value ? 'border-emerald-500/70 bg-emerald-500/10' : 'border-border bg-card hover:bg-muted/40'}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {application === option.value && <Check className="h-4 w-4 text-emerald-400" />}
                      {option.label}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                  </button>
                ))}
              </div>

              <Textarea
                value={freeform}
                onChange={(event) => { setFreeform(event.target.value); setResolution(null); }}
                placeholder="Bijvoorbeeld: garage isoleren met PIR aan de buitenkant"
                rows={3}
              />

              {additionalContext.trim() && (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Gebruikte offertecontext</div>
                  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap">{additionalContext}</div>
                </div>
              )}

              <Button type="button" variant="success" className="gap-2" onClick={analyze}>
                <Search className="h-4 w-4" />
                Zoek meldcode
              </Button>

              {resolution && (
                <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-4">
                  <div>
                    <div className="text-sm font-medium">Interpretatie: {resolution.applicationLabel}</div>
                    <div className="text-xs text-muted-foreground">Zekerheid: {resolution.confidence}</div>
                  </div>
                  {resolution.candidates.length > 0 ? resolution.candidates.map((candidate) => (
                    <div key={candidate.meldcode} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{candidate.meldcode} · {candidate.product}</div>
                        <div className="text-xs text-muted-foreground">{candidate.toepassingLabel} · vanaf {candidate.minimaleDikteMm} mm</div>
                        <div className="mt-1 text-xs text-muted-foreground">{candidate.matchReason}</div>
                      </div>
                      <Button type="button" size="sm" variant="success" disabled={isSaving} onClick={() => { void apply(candidate); }}>
                        Gebruiken
                      </Button>
                    </div>
                  )) : (
                    <div className="space-y-3">
                      <p className="text-sm text-amber-100">Geen zekere match gevonden. De materiaalregel blijft behouden zonder meldcode.</p>
                      <Button type="button" variant="outline" disabled={isSaving} onClick={() => { void apply(); }}>
                        Opslaan zonder meldcode
                      </Button>
                    </div>
                  )}
                  {resolution.candidates.length > 0 && (
                    <a href={resolution.candidates[0].bronUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline">
                      Bekijk bron bij RVO <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSelectedMaterialKey(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
