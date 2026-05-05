'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WorkDescriptionStructured, type WorkDescriptionJob, normalizeWerkbeschrijving } from '@/lib/quote-calculations';
import { Loader2, Sparkles } from 'lucide-react';
import { WorkDescriptionSectionEditor } from './WorkDescriptionSectionEditor';

type Mode = 'edit' | 'preview';
type AiAction = 'full' | 'uitvoering-only' | 'improve';
type SectionKey = keyof WorkDescriptionStructured['sections'];

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

function ensureRows(rows: string[]): string[] {
  return rows.length > 0 ? rows : [''];
}

function normalizeEditableRows(rows: unknown): string[] {
  if (Array.isArray(rows) && rows.every((row) => typeof row === 'string')) {
    return rows.map((row) => String(row ?? ''));
  }
  return normalizeWerkbeschrijving(rows || []);
}

const WASTE_REMOVAL_STEP = 'Vrijgekomen afval afvoeren en afvoeren conform afspraak.';

function isWasteRemovalRow(value: string): boolean {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('afval')
    && (normalized.includes('afvoer') || normalized.includes('meenem') || normalized.includes('take away'))
  );
}

function detectWasteRemovalFromJob(job: WorkDescriptionJob | undefined): boolean {
  if (!job) return false;
  if (typeof job.afvalAfvoeren === 'boolean') return job.afvalAfvoeren;
  return [
    ...(job.sections?.voorbereiding || []),
    ...(job.sections?.uitvoering || []),
    ...(job.sections?.afwerking || []),
  ].some(isWasteRemovalRow);
}

function normalizeJobs(value: WorkDescriptionStructured): WorkDescriptionJob[] {
  if (Array.isArray(value.jobs) && value.jobs.length > 0) {
    return value.jobs.map((job) => ({
      ...job,
      title: String(job?.title || ''),
      context: String(job?.context || ''),
      afvalAfvoeren: detectWasteRemovalFromJob(job),
      sections: {
        voorbereiding: normalizeEditableRows(job?.sections?.voorbereiding),
        uitvoering: normalizeEditableRows(job?.sections?.uitvoering),
        afwerking: normalizeEditableRows(job?.sections?.afwerking),
      },
      legacyNotes: normalizeEditableRows(job?.legacyNotes || []),
    }));
  }
  return [{
    title: value.title || '',
    context: value.context || '',
    afvalAfvoeren: [
      ...(normalizeEditableRows(value.sections?.voorbereiding)),
      ...(normalizeEditableRows(value.sections?.uitvoering)),
      ...(normalizeEditableRows(value.sections?.afwerking)),
    ].some(isWasteRemovalRow),
    sections: {
      voorbereiding: normalizeEditableRows(value.sections?.voorbereiding),
      uitvoering: normalizeEditableRows(value.sections?.uitvoering),
      afwerking: normalizeEditableRows(value.sections?.afwerking),
    },
    legacyNotes: normalizeEditableRows(value.legacyNotes || []),
  }];
}

function clampIndex(index: number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.floor(index), maxExclusive - 1));
}

function applyJobUpdate(
  value: WorkDescriptionStructured,
  activeJobIndex: number,
  updater: (job: WorkDescriptionJob) => WorkDescriptionJob
): WorkDescriptionStructured {
  const jobs = normalizeJobs(value);
  const clamped = clampIndex(activeJobIndex, jobs.length);
  const nextJobs = jobs.map((job, index) => (index === clamped ? updater(job) : job));
  const active = nextJobs[clamped];

  return {
    ...value,
    title: active?.title || '',
    context: active?.context || '',
    sections: {
      voorbereiding: [...(active?.sections.voorbereiding || [])],
      uitvoering: [...(active?.sections.uitvoering || [])],
      afwerking: [...(active?.sections.afwerking || [])],
    },
    legacyNotes: [...(active?.legacyNotes || [])],
    jobs: nextJobs,
    activeJobIndex: clamped,
  };
}

export function WorkDescriptionWorkspace({
  value,
  mode,
  onModeChange,
  onChange,
  onGenerate,
  isGenerating,
  isAutoSaving,
}: WorkDescriptionWorkspaceProps) {
  const showDevTools = process.env.NODE_ENV === 'development';
  const jobs = useMemo(() => normalizeJobs(value), [value]);
  const [activeJobIndexLocal, setActiveJobIndexLocal] = useState<number>(() => clampIndex(value.activeJobIndex ?? 0, jobs.length));
  const activeJobIndex = clampIndex(activeJobIndexLocal, jobs.length);
  const activeJob = jobs[activeJobIndex];
  const showJobTabs = jobs.length > 1;

  useEffect(() => {
    setActiveJobIndexLocal((prev) => clampIndex(value.activeJobIndex ?? prev, jobs.length));
  }, [value.activeJobIndex, jobs.length]);

  useEffect(() => {
    if (mode === 'preview') onModeChange('edit');
  }, [mode, onModeChange]);

  useEffect(() => {
    const isEnabled = Boolean(activeJob?.afvalAfvoeren);
    if (!isEnabled) return;
    const afwerkingRows = activeJob?.sections?.afwerking || [];
    const hasWasteRow = afwerkingRows.some(isWasteRemovalRow);
    if (hasWasteRow) return;

    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        ...job.sections,
        afwerking: ensureRows([...(job.sections?.afwerking || []), WASTE_REMOVAL_STEP]),
      },
    })));
  }, [activeJob?.afvalAfvoeren, activeJob?.sections?.afwerking, activeJobIndex, onChange, value]);

  const setActiveJobIndex = (nextIndex: number) => {
    const clamped = clampIndex(nextIndex, jobs.length);
    setActiveJobIndexLocal(clamped);
    onChange({
      ...value,
      title: jobs[clamped]?.title || '',
      context: jobs[clamped]?.context || '',
      sections: {
        voorbereiding: [...(jobs[clamped]?.sections.voorbereiding || [])],
        uitvoering: [...(jobs[clamped]?.sections.uitvoering || [])],
        afwerking: [...(jobs[clamped]?.sections.afwerking || [])],
      },
      legacyNotes: [...(jobs[clamped]?.legacyNotes || [])],
      jobs,
      activeJobIndex: clamped,
    });
  };

  const updateSectionRow = (section: SectionKey, index: number, rowValue: string) => {
    const currentRows = [...(activeJob?.sections?.[section] || [])];
    currentRows[index] = rowValue;
    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        ...job.sections,
        [section]: ensureRows(currentRows),
      },
    })));
  };

  const addSectionRow = (section: SectionKey) => {
    const currentRows = [...(activeJob?.sections?.[section] || []), ''];
    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        ...job.sections,
        [section]: ensureRows(currentRows),
      },
    })));
  };

  const removeSectionRow = (section: SectionKey, index: number) => {
    const currentRows = (activeJob?.sections?.[section] || []).filter((_, rowIndex) => rowIndex !== index);
    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        ...job.sections,
        [section]: ensureRows(currentRows),
      },
    })));
  };

  const moveSectionRow = (section: SectionKey, index: number, direction: 'up' | 'down') => {
    const rows = [...(activeJob?.sections?.[section] || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    const temp = rows[index];
    rows[index] = rows[targetIndex];
    rows[targetIndex] = temp;

    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        ...job.sections,
        [section]: ensureRows(rows),
      },
    })));
  };

  const clearAllSectionsKeepTitleAndContext = () => {
    onChange(applyJobUpdate(value, activeJobIndex, (job) => ({
      ...job,
      sections: {
        voorbereiding: [],
        uitvoering: [],
        afwerking: [],
      },
      legacyNotes: [],
    })));
  };

  const setWasteRemoval = (enabled: boolean) => {
    onChange(applyJobUpdate(value, activeJobIndex, (job) => {
      const afwerkingRows = [...(job.sections?.afwerking || [])];
      const withoutWasteRows = afwerkingRows.filter((row) => !isWasteRemovalRow(row));
      const nextAfwerking = enabled ? [...withoutWasteRows, WASTE_REMOVAL_STEP] : withoutWasteRows;
      return {
        ...job,
        afvalAfvoeren: enabled,
        sections: {
          ...job.sections,
          afwerking: ensureRows(nextAfwerking),
        },
      };
    }));
  };

  return (
    <div className="space-y-4">
      {showJobTabs ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-2">
          <div className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground">Klussen</div>
          <div className="flex flex-wrap gap-1.5">
            {jobs.map((job, index) => {
              const isActive = index === activeJobIndex;
              return (
                <button
                  key={`work-job-tab-${index}`}
                  type="button"
                  onClick={() => setActiveJobIndex(index)}
                  className={[
                    'inline-flex max-w-full items-center rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100 shadow-[inset_0_-2px_0_rgba(52,211,153,0.65)]'
                      : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground',
                  ].join(' ')}
                >
                  <span className="truncate">{job.title.trim() || `Klus ${index + 1}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Card className="border border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Werkbeschrijving</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hoofdtitel</Label>
              <Input
                value={activeJob?.title || ''}
                onChange={(e) => onChange(applyJobUpdate(value, activeJobIndex, (job) => ({ ...job, title: e.target.value })))}
                placeholder="Bijv. Dakisolatie woning"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Korte context / samenvatting (optioneel)</Label>
              <Input
                value={activeJob?.context || ''}
                onChange={(e) => onChange(applyJobUpdate(value, activeJobIndex, (job) => ({ ...job, context: e.target.value })))}
                placeholder="Bijv. renovatie zolderverdieping"
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="afval-afvoeren-toggle" className="text-sm font-medium text-foreground">
                  Afval afvoeren
                </Label>
                <p className="text-xs text-muted-foreground">Bij Ja wordt automatisch een afvoer-stap toegevoegd in Afwerking.</p>
              </div>
              <Switch
                id="afval-afvoeren-toggle"
                checked={detectWasteRemovalFromJob(activeJob)}
                onCheckedChange={setWasteRemoval}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div />

            <div className="flex items-center gap-2">
              <Button type="button" variant="success" size="sm" onClick={() => onGenerate('full')} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Genereer werkbeschrijving
              </Button>
              {showDevTools ? (
                <Button
                  type="button"
                  variant="destructiveSoft"
                  size="sm"
                  onClick={clearAllSectionsKeepTitleAndContext}
                  disabled={isGenerating}
                >
                  Dev: wis stappen
                </Button>
              ) : null}
              {isAutoSaving ? (
                <span className="text-xs text-muted-foreground">Opslaan...</span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <WorkDescriptionSectionEditor
          title="Voorbereiding"
          rows={ensureRows(activeJob?.sections?.voorbereiding || [])}
          placeholder="Bijv. Materiaal aanvoeren en werkplek voorbereiden"
          onChangeRow={(index, rowValue) => updateSectionRow('voorbereiding', index, rowValue)}
          onAddRow={() => addSectionRow('voorbereiding')}
          onRemoveRow={(index) => removeSectionRow('voorbereiding', index)}
          onMoveRow={(index, direction) => moveSectionRow('voorbereiding', index, direction)}
        />
        <WorkDescriptionSectionEditor
          title="Uitvoering"
          rows={ensureRows(activeJob?.sections?.uitvoering || [])}
          placeholder="Bijv. Isolatiemateriaal plaatsen volgens maatvoering"
          onChangeRow={(index, rowValue) => updateSectionRow('uitvoering', index, rowValue)}
          onAddRow={() => addSectionRow('uitvoering')}
          onRemoveRow={(index) => removeSectionRow('uitvoering', index)}
          onMoveRow={(index, direction) => moveSectionRow('uitvoering', index, direction)}
        />
        <WorkDescriptionSectionEditor
          title="Afwerking"
          rows={ensureRows(activeJob?.sections?.afwerking || [])}
          placeholder="Bijv. Naden afwerken en werkplek schoon opleveren"
          onChangeRow={(index, rowValue) => updateSectionRow('afwerking', index, rowValue)}
          onAddRow={() => addSectionRow('afwerking')}
          onRemoveRow={(index) => removeSectionRow('afwerking', index)}
          onMoveRow={(index, direction) => moveSectionRow('afwerking', index, direction)}
        />
      </div>
    </div>
  );
}
