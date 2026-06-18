'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WorkDescriptionStructured, type WorkDescriptionJob } from '@/lib/quote-calculations';
import {
  DEFAULT_ELECTRICAL_SCOPE,
  enforceWorkDeliverySafety,
  getFinishLevelLabel,
  sanitizeMaterialDescription,
  validateWorkDeliveryScope,
  type FinishLevel,
} from '@/lib/work-delivery';
import { WorkDescriptionSectionEditor } from './WorkDescriptionSectionEditor';

type Mode = 'edit' | 'preview';
type AiAction = 'full' | 'uitvoering-only' | 'improve';
type RowKey = 'work_scope' | 'materials' | 'dimensions' | 'included' | 'excluded' | 'internal_notes';

interface WorkDescriptionWorkspaceProps {
  value: WorkDescriptionStructured;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onChange: (next: WorkDescriptionStructured) => void;
  onGenerate: (action: AiAction) => void;
  isGenerating: boolean;
  isAutoSaving: boolean;
  templateLabel?: string | null;
  onApplyTemplate?: () => void;
}

function rows(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
}

function ensureRows(value: string[]): string[] {
  return value.length > 0 ? value : [''];
}

function normalizeJobs(value: WorkDescriptionStructured): WorkDescriptionJob[] {
  if (value.jobs.length > 0) return value.jobs;
  return [{
    title: value.title,
    context: value.summary || value.context,
    summary: value.summary || value.context,
    work_scope: rows(value.work_scope),
    materials: rows(value.materials),
    dimensions: rows(value.dimensions),
    included: rows(value.included),
    excluded: rows(value.excluded),
    internal_notes: rows(value.internal_notes),
    afvalAfvoeren: value.afvalAfvoeren,
    schilderwerkInbegrepen: value.schilderwerkInbegrepen,
    stucwerkInbegrepen: value.stucwerkInbegrepen,
    electricalScope: value.electricalScope || { ...DEFAULT_ELECTRICAL_SCOPE },
    finishLevel: value.finishLevel || 'constructief_gereed',
    customFinishDescription: value.customFinishDescription,
    sections: value.sections,
    legacyNotes: value.legacyNotes || [],
  }];
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(Number.isFinite(index) ? Math.floor(index) : 0, Math.max(0, length - 1)));
}

function updateActiveJob(
  value: WorkDescriptionStructured,
  activeJobIndex: number,
  updater: (job: WorkDescriptionJob) => WorkDescriptionJob,
): WorkDescriptionStructured {
  const jobs = normalizeJobs(value);
  const index = clamp(activeJobIndex, jobs.length);
  const nextJobs = jobs.map((job, jobIndex) => jobIndex === index ? updater(job) : job);
  const active = nextJobs[index];
  return {
    ...value,
    title: active.title,
    context: active.summary,
    summary: active.summary,
    work_scope: [...active.work_scope],
    materials: [...active.materials],
    dimensions: [...active.dimensions],
    included: [...active.included],
    excluded: [...active.excluded],
    internal_notes: [...active.internal_notes],
    afvalAfvoeren: active.afvalAfvoeren === true,
    schilderwerkInbegrepen: active.schilderwerkInbegrepen === true,
    stucwerkInbegrepen: active.stucwerkInbegrepen === true,
    electricalScope: active.electricalScope,
    finishLevel: active.finishLevel,
    customFinishDescription: active.customFinishDescription,
    jobs: nextJobs,
    activeJobIndex: index,
  };
}

const FINISH_LEVELS: FinishLevel[] = [
  'constructief_gereed',
  'plaatmateriaal_gemonteerd',
  'sausklaar',
  'schilderklaar',
  'volledig_afgewerkt',
  'custom',
];

export function WorkDescriptionWorkspace({
  value,
  mode,
  onModeChange,
  onChange,
  onGenerate,
  isGenerating,
  isAutoSaving,
}: WorkDescriptionWorkspaceProps) {
  const jobs = useMemo(() => normalizeJobs(value), [value]);
  const [activeIndexLocal, setActiveIndexLocal] = useState(value.activeJobIndex || 0);
  const activeIndex = clamp(activeIndexLocal, jobs.length);
  const activeJob = jobs[activeIndex];
  const validation = useMemo(() => validateWorkDeliveryScope(activeJob), [activeJob]);

  useEffect(() => {
    if (mode === 'preview') onModeChange('edit');
  }, [mode, onModeChange]);

  const changeJob = (index: number) => {
    setActiveIndexLocal(index);
    onChange(updateActiveJob(value, index, (job) => job));
  };

  const setField = <K extends keyof WorkDescriptionJob>(key: K, fieldValue: WorkDescriptionJob[K]) => {
    onChange(updateActiveJob(value, activeIndex, (job) => ({ ...job, [key]: fieldValue })));
  };

  const setSafetyField = <K extends 'afvalAfvoeren' | 'schilderwerkInbegrepen' | 'stucwerkInbegrepen' | 'electricalScope' | 'finishLevel' | 'customFinishDescription'>(
    key: K,
    fieldValue: WorkDescriptionJob[K],
  ) => {
    onChange(updateActiveJob(value, activeIndex, (job) => {
      const updated = {
        ...job,
        [key]: fieldValue,
        afvalAfvoeren: key === 'afvalAfvoeren' ? fieldValue === true : job.afvalAfvoeren === true,
        schilderwerkInbegrepen: key === 'schilderwerkInbegrepen' ? fieldValue === true : job.schilderwerkInbegrepen === true,
        stucwerkInbegrepen: key === 'stucwerkInbegrepen' ? fieldValue === true : job.stucwerkInbegrepen === true,
      };
      const safe = enforceWorkDeliverySafety(updated);
      return { ...updated, ...safe, context: safe.summary };
    }));
  };

  const changeRow = (key: RowKey, index: number, rowValue: string) => {
    const next = [...rows(activeJob[key])];
    next[index] = key === 'materials' ? sanitizeMaterialDescription(rowValue) : rowValue;
    setField(key, ensureRows(next));
  };

  const addRow = (key: RowKey) => setField(key, [...rows(activeJob[key]), '']);
  const removeRow = (key: RowKey, index: number) => setField(key, rows(activeJob[key]).filter((_, rowIndex) => rowIndex !== index));
  const moveRow = (key: RowKey, index: number, direction: 'up' | 'down') => {
    const next = [...rows(activeJob[key])];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setField(key, next);
  };

  const renderRows = (key: RowKey, title: string, placeholder: string) => (
    <WorkDescriptionSectionEditor
      title={title}
      rows={ensureRows(rows(activeJob[key]))}
      placeholder={placeholder}
      onChangeRow={(index, rowValue) => changeRow(key, index, rowValue)}
      onAddRow={() => addRow(key)}
      onRemoveRow={(index) => removeRow(key, index)}
      onMoveRow={(index, direction) => moveRow(key, index, direction)}
    />
  );

  return (
    <div className="space-y-4">
      {jobs.length > 1 ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-muted/20 p-2">
          {jobs.map((job, index) => (
            <Button key={`${job.title}-${index}`} type="button" size="sm" variant={index === activeIndex ? 'success' : 'outline'} onClick={() => changeJob(index)}>
              {job.title || `Klus ${index + 1}`}
            </Button>
          ))}
        </div>
      ) : null}

      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Werk &amp; Levering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!validation.valid ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Nog niet gereed voor PDF of versturen</div>
              <ul className="list-disc space-y-1 pl-5">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Titel</Label>
              <Input value={activeJob.title} onChange={(event) => setField('title', event.target.value)} placeholder="Bijv. Voorzetwand woonkamer" />
            </div>
            <div className="space-y-1">
              <Label>Afwerkingsniveau</Label>
              <select
                value={activeJob.finishLevel}
                onChange={(event) => setSafetyField('finishLevel', event.target.value as FinishLevel)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {FINISH_LEVELS.map((level) => <option key={level} value={level}>{getFinishLevelLabel(level)}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Korte omschrijving</Label>
            <Textarea value={activeJob.summary} onChange={(event) => setField('summary', event.target.value)} rows={2} placeholder="Beschrijf alleen het afgesproken eindresultaat." />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Afval afvoeren</Label><p className="text-xs text-muted-foreground">Alleen opnemen wanneer dit expliciet is overeengekomen.</p></div>
                <Switch checked={activeJob.afvalAfvoeren === true} onCheckedChange={(checked) => setSafetyField('afvalAfvoeren', checked)} />
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Schilderwerk inbegrepen</Label><p className="text-xs text-muted-foreground">Alleen opnemen wanneer dit expliciet is overeengekomen.</p></div>
                <Switch checked={activeJob.schilderwerkInbegrepen === true} onCheckedChange={(checked) => setSafetyField('schilderwerkInbegrepen', checked)} />
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Stucwerk inbegrepen</Label><p className="text-xs text-muted-foreground">Alleen opnemen wanneer dit expliciet is overeengekomen.</p></div>
                <Switch checked={activeJob.stucwerkInbegrepen === true} onCheckedChange={(checked) => setSafetyField('stucwerkInbegrepen', checked)} />
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Elektrawerk inbegrepen</Label><p className="text-xs text-muted-foreground">Alleen de hieronder vastgelegde onderdelen.</p></div>
                <Switch
                  checked={activeJob.electricalScope.enabled}
                  onCheckedChange={(enabled) => setSafetyField('electricalScope', { ...activeJob.electricalScope, enabled })}
                />
              </div>
            </div>
          </div>

          {activeJob.electricalScope.enabled ? (
            <div className="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2"><Label>Expliciete omschrijving elektrawerk</Label><Input value={activeJob.electricalScope.description} onChange={(event) => setField('electricalScope', { ...activeJob.electricalScope, description: event.target.value })} /></div>
              <div className="space-y-1"><Label>Maximale kabellengte (meter, optioneel)</Label><Input type="number" min="0" value={activeJob.electricalScope.maxLengthMeters ?? ''} onChange={(event) => setField('electricalScope', { ...activeJob.electricalScope, maxLengthMeters: event.target.value ? Number(event.target.value) : undefined })} /></div>
              <div className="space-y-1"><Label>Inbegrepen onderdelen, één per regel</Label><Textarea value={activeJob.electricalScope.includedItems.join('\n')} onChange={(event) => setField('electricalScope', { ...activeJob.electricalScope, includedItems: event.target.value.split('\n') })} /></div>
              <div className="space-y-1 md:col-span-2"><Label>Uitgesloten onderdelen, één per regel</Label><Textarea value={activeJob.electricalScope.excludedItems.join('\n')} onChange={(event) => setField('electricalScope', { ...activeJob.electricalScope, excludedItems: event.target.value.split('\n') })} /></div>
            </div>
          ) : null}

          {activeJob.finishLevel === 'custom' ? (
            <div className="space-y-1"><Label>Maatwerk afwerkingsniveau</Label><Input value={activeJob.customFinishDescription || ''} onChange={(event) => setField('customFinishDescription', event.target.value)} /></div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="success" size="sm" onClick={() => onGenerate('full')} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Genereer Werk &amp; Levering
            </Button>
            {isAutoSaving ? <span className="self-center text-xs text-muted-foreground">Opslaan...</span> : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {renderRows('work_scope', 'Werkzaamheden', 'Wat wordt commercieel geleverd, zonder uitvoeringsvolgorde')}
        {renderRows('dimensions', 'Maatvoering', 'Bijv. wand 4.200 x 2.600 mm')}
        {renderRows('included', 'Inbegrepen', 'Expliciet inbegrepen onderdeel')}
        {renderRows('excluded', 'Niet inbegrepen', 'Expliciete uitsluiting')}
      </div>

      <Card className="border-border bg-muted/10">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Interne werkinstructie</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">Alleen intern. Deze regels verschijnen niet in de klant-PDF.</p>
          {renderRows('internal_notes', 'Interne notities', 'Interne methode, aandachtspunt of oude werkbeschrijvingsregel')}
        </CardContent>
      </Card>
    </div>
  );
}
