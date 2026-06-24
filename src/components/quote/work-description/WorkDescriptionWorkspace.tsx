'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
  inferWorkDeliveryFinishLevel,
  isRemovedLegacyToggleText,
  sanitizeMaterialDescription,
  sanitizeWorkDeliveryScope,
  validateWorkDeliveryScope,
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
  isAutoSaving?: boolean;
  templateLabel?: string | null;
  onApplyTemplate?: () => void;
}

function rows(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
}

function removeRemovedLegacyRows(value: unknown): string[] {
  return rows(value).filter((line) => !isRemovedLegacyToggleText(line));
}

function ensureRows(value: string[]): string[] {
  return value.length > 0 ? value : [''];
}

function stripRemovedWorkDeliveryToggles(value: WorkDescriptionStructured): WorkDescriptionStructured {
  return {
    ...value,
    included: removeRemovedLegacyRows(value.included),
    excluded: removeRemovedLegacyRows(value.excluded),
    stucwerkInbegrepen: false,
    kitwerkInbegrepen: false,
    jobs: Array.isArray(value.jobs) && value.jobs.length > 0
      ? value.jobs.map((job) => ({
        ...job,
        included: removeRemovedLegacyRows(job.included),
        excluded: removeRemovedLegacyRows(job.excluded),
        stucwerkInbegrepen: false,
        kitwerkInbegrepen: false,
      }))
      : value.jobs,
  };
}

function hasRemovedWorkDeliveryToggles(value: WorkDescriptionStructured): boolean {
  return value.stucwerkInbegrepen === true
    || value.kitwerkInbegrepen === true
    || rows(value.included).some(isRemovedLegacyToggleText)
    || rows(value.excluded).some(isRemovedLegacyToggleText)
    || value.jobs.some((job) => (
      job.stucwerkInbegrepen === true
      || job.kitwerkInbegrepen === true
      || rows(job.included).some(isRemovedLegacyToggleText)
      || rows(job.excluded).some(isRemovedLegacyToggleText)
    ));
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
    plamuurwerkInbegrepen: value.plamuurwerkInbegrepen,
    kitwerkInbegrepen: value.kitwerkInbegrepen,
    steigerInbegrepen: value.steigerInbegrepen,
    sloopwerkInbegrepen: value.sloopwerkInbegrepen,
    nadenVullenInbegrepen: value.nadenVullenInbegrepen,
    nadenVullenAfwerkingsniveau: value.nadenVullenAfwerkingsniveau,
    schroefgatenPlamurenInbegrepen: value.schroefgatenPlamurenInbegrepen,
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
    plamuurwerkInbegrepen: active.plamuurwerkInbegrepen === true,
    kitwerkInbegrepen: active.kitwerkInbegrepen === true,
    steigerInbegrepen: active.steigerInbegrepen === true,
    sloopwerkInbegrepen: active.sloopwerkInbegrepen === true,
    nadenVullenInbegrepen: active.nadenVullenInbegrepen === true,
    nadenVullenAfwerkingsniveau: active.nadenVullenInbegrepen
      ? active.nadenVullenAfwerkingsniveau === 'schilderklaar' ? 'schilderklaar' : 'behangklaar'
      : undefined,
    schroefgatenPlamurenInbegrepen: active.schroefgatenPlamurenInbegrepen === true,
    electricalScope: active.electricalScope,
    finishLevel: active.finishLevel,
    customFinishDescription: active.customFinishDescription,
    jobs: nextJobs,
    activeJobIndex: index,
  };
}

export function LegacyWorkDescriptionWorkspace({
  value,
  mode,
  onModeChange,
  onChange,
  onGenerate,
  isGenerating,
}: WorkDescriptionWorkspaceProps) {
  const cleanedValue = useMemo(() => stripRemovedWorkDeliveryToggles(value), [value]);
  const jobs = useMemo(() => normalizeJobs(cleanedValue), [cleanedValue]);
  const [activeIndexLocal, setActiveIndexLocal] = useState(value.activeJobIndex || 0);
  const activeIndex = clamp(activeIndexLocal, jobs.length);
  const activeJob = jobs[activeIndex];
  const automaticFinishLevel = useMemo(() => inferWorkDeliveryFinishLevel(activeJob), [activeJob]);
  const validation = useMemo(() => validateWorkDeliveryScope(activeJob), [activeJob]);

  useEffect(() => {
    if (mode === 'preview') onModeChange('edit');
  }, [mode, onModeChange]);

  useEffect(() => {
    if (hasRemovedWorkDeliveryToggles(value)) onChange(cleanedValue);
  }, [cleanedValue, onChange, value]);

  useEffect(() => {
    if (activeJob.finishLevel === automaticFinishLevel) return;
    onChange(updateActiveJob(cleanedValue, activeIndex, (job) => ({ ...job, finishLevel: automaticFinishLevel })));
  }, [activeIndex, activeJob.finishLevel, automaticFinishLevel, cleanedValue, onChange]);

  const changeJob = (index: number) => {
    setActiveIndexLocal(index);
    onChange(updateActiveJob(cleanedValue, index, (job) => job));
  };

  const setField = <K extends keyof WorkDescriptionJob>(key: K, fieldValue: WorkDescriptionJob[K]) => {
    onChange(updateActiveJob(cleanedValue, activeIndex, (job) => {
      const updated = { ...job, [key]: fieldValue };
      if (key !== 'summary') return updated;
      const summary = String(fieldValue ?? '').trim();
      return {
        ...updated,
        context: summary,
        summary,
        work_scope: summary ? [summary] : [],
      };
    }));
  };

  const setSafetyField = <K extends 'afvalAfvoeren' | 'schilderwerkInbegrepen' | 'stucwerkInbegrepen' | 'plamuurwerkInbegrepen' | 'kitwerkInbegrepen' | 'steigerInbegrepen' | 'sloopwerkInbegrepen' | 'nadenVullenInbegrepen' | 'schroefgatenPlamurenInbegrepen' | 'electricalScope'>(
    key: K,
    fieldValue: WorkDescriptionJob[K],
  ) => {
    onChange(updateActiveJob(cleanedValue, activeIndex, (job) => {
      const updated = {
        ...job,
        [key]: fieldValue,
        afvalAfvoeren: key === 'afvalAfvoeren' ? fieldValue === true : job.afvalAfvoeren === true,
        schilderwerkInbegrepen: key === 'schilderwerkInbegrepen' ? fieldValue === true : job.schilderwerkInbegrepen === true,
        stucwerkInbegrepen: key === 'stucwerkInbegrepen' ? fieldValue === true : job.stucwerkInbegrepen === true,
        plamuurwerkInbegrepen: key === 'plamuurwerkInbegrepen' ? fieldValue === true : job.plamuurwerkInbegrepen === true,
        kitwerkInbegrepen: key === 'kitwerkInbegrepen' ? fieldValue === true : job.kitwerkInbegrepen === true,
        steigerInbegrepen: key === 'steigerInbegrepen' ? fieldValue === true : job.steigerInbegrepen === true,
        sloopwerkInbegrepen: key === 'sloopwerkInbegrepen' ? fieldValue === true : job.sloopwerkInbegrepen === true,
        nadenVullenInbegrepen: key === 'nadenVullenInbegrepen' ? fieldValue === true : job.nadenVullenInbegrepen === true,
        schroefgatenPlamurenInbegrepen: key === 'schroefgatenPlamurenInbegrepen' ? fieldValue === true : job.schroefgatenPlamurenInbegrepen === true,
      };
      const safe = enforceWorkDeliverySafety(sanitizeWorkDeliveryScope(updated));
      return { ...updated, ...safe, context: safe.summary };
    }));
  };

  const setNadenVullenLevel = (level: 'behangklaar' | 'schilderklaar', checked: boolean) => {
    onChange(updateActiveJob(cleanedValue, activeIndex, (job) => {
      const updated = {
        ...job,
        nadenVullenInbegrepen: checked,
        nadenVullenAfwerkingsniveau: checked ? level : undefined,
      };
      const safe = enforceWorkDeliverySafety(sanitizeWorkDeliveryScope(updated));
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

  const renderRows = (key: RowKey, title: string, placeholder: string, beforeRows?: ReactNode) => (
    <WorkDescriptionSectionEditor
      title={title}
      rows={ensureRows(rows(activeJob[key]))}
      placeholder={placeholder}
      onChangeRow={(index, rowValue) => changeRow(key, index, rowValue)}
      onAddRow={() => addRow(key)}
      onRemoveRow={(index) => removeRow(key, index)}
      onMoveRow={(index, direction) => moveRow(key, index, direction)}
      beforeRows={beforeRows}
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="success" size="sm" onClick={() => onGenerate('full')} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Genereer
            </Button>
          </div>

          {!validation.valid ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Nog niet gereed voor PDF of versturen</div>
              <ul className="list-disc space-y-1 pl-5">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Afval afvoeren</Label>
              <Switch checked={activeJob.afvalAfvoeren === true} onCheckedChange={(checked) => setSafetyField('afvalAfvoeren', checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Schilderwerk</Label>
              <Switch checked={activeJob.schilderwerkInbegrepen === true} onCheckedChange={(checked) => setSafetyField('schilderwerkInbegrepen', checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Plamuurwerk</Label>
              <Switch checked={activeJob.plamuurwerkInbegrepen === true} onCheckedChange={(checked) => setSafetyField('plamuurwerkInbegrepen', checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Steiger</Label>
              <Switch checked={activeJob.steigerInbegrepen === true} onCheckedChange={(checked) => setSafetyField('steigerInbegrepen', checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Sloopwerk</Label>
              <Switch checked={activeJob.sloopwerkInbegrepen === true} onCheckedChange={(checked) => setSafetyField('sloopwerkInbegrepen', checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Naden vullen – Behangklaar</Label>
              <Switch
                checked={activeJob.nadenVullenInbegrepen === true && activeJob.nadenVullenAfwerkingsniveau !== 'schilderklaar'}
                onCheckedChange={(checked) => setNadenVullenLevel('behangklaar', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Naden vullen – Schilderklaar</Label>
              <Switch
                checked={activeJob.nadenVullenInbegrepen === true && activeJob.nadenVullenAfwerkingsniveau === 'schilderklaar'}
                onCheckedChange={(checked) => setNadenVullenLevel('schilderklaar', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Elektrawerk</Label>
              <Switch
                checked={activeJob.electricalScope.enabled}
                onCheckedChange={(enabled) => setSafetyField('electricalScope', { ...activeJob.electricalScope, enabled })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Schroefgaten plamuren</Label>
              <Switch checked={activeJob.schroefgatenPlamurenInbegrepen === true} onCheckedChange={(checked) => setSafetyField('schroefgatenPlamurenInbegrepen', checked)} />
            </div>
          </div>

        </CardContent>
      </Card>

      <div className="space-y-3">
        {renderRows('work_scope', 'Werkzaamheden', 'Wat wordt commercieel geleverd, zonder uitvoeringsvolgorde', (
          <div className="space-y-3 border-b border-border/70 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Titel</Label>
                <Input value={activeJob.title} onChange={(event) => setField('title', event.target.value)} placeholder="Bijv. Voorzetwand woonkamer" />
              </div>
              <div className="space-y-1">
                <Label>Afwerkingsniveau</Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">{getFinishLevelLabel(automaticFinishLevel)}</div>
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
          </div>
        ))}
        {renderRows('dimensions', 'Maatvoering', 'Bijv. wand 4.200 x 2.600 mm')}
        {renderRows('included', 'Inbegrepen', 'Expliciet inbegrepen onderdeel')}
        {renderRows('excluded', 'Niet inbegrepen', 'Expliciete uitsluiting')}
      </div>

    </div>
  );
}

export function WorkDescriptionWorkspace({
  value,
  mode,
  onModeChange,
  onChange,
  onGenerate,
  isGenerating,
}: WorkDescriptionWorkspaceProps) {
  const cleanedValue = useMemo(() => stripRemovedWorkDeliveryToggles(value), [value]);
  const jobs = useMemo(() => normalizeJobs(cleanedValue), [cleanedValue]);
  const combinedForFinish = useMemo(() => ({
    ...cleanedValue,
    work_scope: jobs.flatMap((job) => job.work_scope),
  }), [cleanedValue, jobs]);
  const automaticFinishLevel = useMemo(() => inferWorkDeliveryFinishLevel(combinedForFinish), [combinedForFinish]);
  const validation = useMemo(() => validateWorkDeliveryScope({
    ...cleanedValue,
    work_scope: jobs.flatMap((job) => job.work_scope),
  }), [cleanedValue, jobs]);

  useEffect(() => {
    if (mode === 'preview') onModeChange('edit');
  }, [mode, onModeChange]);

  useEffect(() => {
    if (hasRemovedWorkDeliveryToggles(value)) onChange(cleanedValue);
  }, [cleanedValue, onChange, value]);

  useEffect(() => {
    if (cleanedValue.finishLevel === automaticFinishLevel) return;
    onChange({ ...cleanedValue, finishLevel: automaticFinishLevel });
  }, [automaticFinishLevel, cleanedValue, onChange]);

  const setRootField = <K extends keyof WorkDescriptionStructured>(key: K, fieldValue: WorkDescriptionStructured[K]) => {
    if (key === 'summary') {
      const summary = String(fieldValue ?? '').trim();
      const activeIndex = Math.max(0, Math.min(cleanedValue.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
      const nextJobs = jobs.length > 0
        ? jobs.map((job, index) => index === activeIndex
          ? {
              ...job,
              context: summary,
              summary,
              work_scope: summary ? [summary] : [],
            }
          : job)
        : cleanedValue.jobs;
      onChange({
        ...cleanedValue,
        context: summary,
        summary,
        work_scope: summary ? [summary] : [],
        jobs: nextJobs,
      });
      return;
    }
    onChange({ ...cleanedValue, [key]: fieldValue });
  };

  const setSafetyField = (key: 'afvalAfvoeren' | 'schilderwerkInbegrepen' | 'stucwerkInbegrepen' | 'plamuurwerkInbegrepen' | 'kitwerkInbegrepen' | 'steigerInbegrepen' | 'sloopwerkInbegrepen' | 'nadenVullenInbegrepen' | 'schroefgatenPlamurenInbegrepen', checked: boolean) => {
    const safe = enforceWorkDeliverySafety({ ...cleanedValue, [key]: checked });
    onChange({ ...cleanedValue, ...safe, jobs });
  };

  const setNadenVullenLevel = (level: 'behangklaar' | 'schilderklaar', checked: boolean) => {
    const safe = enforceWorkDeliverySafety({
      ...cleanedValue,
      nadenVullenInbegrepen: checked,
      nadenVullenAfwerkingsniveau: checked ? level : undefined,
    });
    onChange({ ...cleanedValue, ...safe, jobs });
  };

  const setElectricalEnabled = (enabled: boolean) => {
    const safe = enforceWorkDeliverySafety({
      ...cleanedValue,
      electricalScope: { ...cleanedValue.electricalScope, enabled },
    });
    onChange({ ...cleanedValue, ...safe, jobs });
  };

  const updateJob = (jobIndex: number, updater: (job: WorkDescriptionJob) => WorkDescriptionJob) => {
    const nextJobs = jobs.map((job, index) => index === jobIndex ? updater(job) : job);
    onChange({ ...cleanedValue, jobs: nextJobs });
  };

  const updateJobWorkText = (jobIndex: number, text: string) => {
    const workScope = text.trim() ? [text] : [];
    const nextJobs = jobs.map((job, index) => index === jobIndex
      ? {
          ...job,
          context: text,
          summary: text,
          work_scope: workScope,
        }
      : job);
    const activeIndex = Math.max(0, Math.min(cleanedValue.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
    onChange({
      ...cleanedValue,
      ...(jobIndex === activeIndex
        ? {
            context: text,
            summary: text,
            work_scope: workScope,
          }
        : {}),
      jobs: nextJobs,
    });
  };

  const renderJobRows = (job: WorkDescriptionJob, jobIndex: number, key: 'work_scope' | 'dimensions', title: string, placeholder: string) => (
    <WorkDescriptionSectionEditor
      title={title}
      rows={ensureRows(rows(job[key]))}
      placeholder={placeholder}
      onChangeRow={(rowIndex, rowValue) => updateJob(jobIndex, (current) => {
        const next = [...rows(current[key])];
        next[rowIndex] = rowValue;
        return { ...current, [key]: ensureRows(next) };
      })}
      onAddRow={() => updateJob(jobIndex, (current) => ({ ...current, [key]: [...rows(current[key]), ''] }))}
      onRemoveRow={(rowIndex) => updateJob(jobIndex, (current) => ({ ...current, [key]: rows(current[key]).filter((_, index) => index !== rowIndex) }))}
      onMoveRow={(rowIndex, direction) => updateJob(jobIndex, (current) => {
        const next = [...rows(current[key])];
        const target = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
        if (target < 0 || target >= next.length) return current;
        [next[rowIndex], next[target]] = [next[target], next[rowIndex]];
        return { ...current, [key]: next };
      })}
    />
  );

  const renderWorkScopeParagraph = (job: WorkDescriptionJob, jobIndex: number) => (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card/80 p-4">
      <Label className="text-sm font-semibold text-foreground">Werkzaamheden</Label>
      <Textarea
        value={rows(job.work_scope).join('\n\n')}
        onChange={(event) => updateJobWorkText(jobIndex, event.target.value)}
        placeholder="Beschrijf de werkzaamheden voor deze klus"
        rows={6}
        className="min-h-40"
      />
    </div>
  );

  const renderGlobalRows = (key: 'included' | 'excluded', title: string, placeholder: string) => (
    <WorkDescriptionSectionEditor
      title={title}
      rows={ensureRows(rows(cleanedValue[key]))}
      placeholder={placeholder}
      onChangeRow={(index, rowValue) => {
        const next = [...rows(cleanedValue[key])];
        next[index] = rowValue;
        setRootField(key, ensureRows(next));
      }}
      onAddRow={() => setRootField(key, [...rows(cleanedValue[key]), ''])}
      onRemoveRow={(index) => setRootField(key, rows(cleanedValue[key]).filter((_, rowIndex) => rowIndex !== index))}
      onMoveRow={(index, direction) => {
        const next = [...rows(cleanedValue[key])];
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setRootField(key, next);
      }}
    />
  );

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3"><CardTitle className="text-base">Werk &amp; Levering</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="success" size="sm" onClick={() => onGenerate('full')} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Genereer
            </Button>
          </div>
          {!validation.valid ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Nog niet gereed voor PDF of versturen</div>
              <ul className="list-disc space-y-1 pl-5">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['afvalAfvoeren', 'Afval afvoeren'], ['schilderwerkInbegrepen', 'Schilderwerk'],
              ['plamuurwerkInbegrepen', 'Plamuurwerk'], ['steigerInbegrepen', 'Steiger'],
              ['sloopwerkInbegrepen', 'Sloopwerk'],
              ['schroefgatenPlamurenInbegrepen', 'Schroefgaten plamuren'],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <Label>{label}</Label><Switch checked={cleanedValue[key] === true} onCheckedChange={(checked) => setSafetyField(key, checked)} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Naden vullen – Behangklaar</Label>
              <Switch
                checked={cleanedValue.nadenVullenInbegrepen === true && cleanedValue.nadenVullenAfwerkingsniveau !== 'schilderklaar'}
                onCheckedChange={(checked) => setNadenVullenLevel('behangklaar', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Naden vullen – Schilderklaar</Label>
              <Switch
                checked={cleanedValue.nadenVullenInbegrepen === true && cleanedValue.nadenVullenAfwerkingsniveau === 'schilderklaar'}
                onCheckedChange={(checked) => setNadenVullenLevel('schilderklaar', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <Label>Elektrawerk</Label>
              <Switch
                checked={cleanedValue.electricalScope.enabled}
                onCheckedChange={setElectricalEnabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/50">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2">
          <div className="space-y-1"><Label>Titel</Label><Input value={cleanedValue.title} onChange={(event) => setRootField('title', event.target.value)} /></div>
          <div className="space-y-1"><Label>Afwerkingsniveau</Label><div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">{getFinishLevelLabel(automaticFinishLevel)}</div></div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {jobs.map((job, jobIndex) => (
          <Card key={`${job.title}-${jobIndex}`} className="border-border bg-card/40">
            <CardContent className="space-y-4">
              {renderWorkScopeParagraph(job, jobIndex)}
              {renderJobRows(job, jobIndex, 'dimensions', 'Maatvoering', 'Bijv. Lengte = 4.200 mm | Hoogte = 2.600 mm')}
            </CardContent>
          </Card>
        ))}
      </div>

      {renderGlobalRows('included', 'Inbegrepen', 'Expliciet inbegrepen onderdeel')}
      {renderGlobalRows('excluded', 'Niet inbegrepen', 'Expliciete uitsluiting')}
    </div>
  );
}
