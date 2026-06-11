'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type WerkbeschrijvingJob, WorkDescriptionStructured } from '@/lib/quote-calculations';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { WorkDescriptionPreview } from './WorkDescriptionPreview';
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
  jobs?: WerkbeschrijvingJob[] | null;
  onJobsChange?: (jobs: WerkbeschrijvingJob[]) => void;
}

function ensureRows(rows: string[]): string[] {
  return rows.length > 0 ? rows : [''];
}

function updateSectionRows(
  value: WorkDescriptionStructured,
  section: SectionKey,
  rows: string[]
): WorkDescriptionStructured {
  return {
    ...value,
    sections: {
      ...value.sections,
      [section]: ensureRows(rows),
    },
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
  templateLabel,
  onApplyTemplate,
  jobs,
  onJobsChange,
}: WorkDescriptionWorkspaceProps) {
  const showDevTools = process.env.NODE_ENV === 'development';
  const [activeJobIndex, setActiveJobIndex] = useState(0);

  const updateSectionRow = (section: SectionKey, index: number, rowValue: string) => {
    const currentRows = [...value.sections[section]];
    currentRows[index] = rowValue;
    onChange(updateSectionRows(value, section, currentRows));
  };

  const addSectionRow = (section: SectionKey) => {
    const currentRows = [...value.sections[section], ''];
    onChange(updateSectionRows(value, section, currentRows));
  };

  const removeSectionRow = (section: SectionKey, index: number) => {
    const currentRows = value.sections[section].filter((_, rowIndex) => rowIndex !== index);
    onChange(updateSectionRows(value, section, currentRows));
  };

  const moveSectionRow = (section: SectionKey, index: number, direction: 'up' | 'down') => {
    const rows = [...value.sections[section]];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    const temp = rows[index];
    rows[index] = rows[targetIndex];
    rows[targetIndex] = temp;

    onChange(updateSectionRows(value, section, rows));
  };

  const clearAllSectionsKeepTitleAndContext = () => {
    onChange({
      ...value,
      sections: {
        voorbereiding: [],
        uitvoering: [],
        afwerking: [],
      },
      legacyNotes: [],
    });
  };

  // Multi-job helpers
  const updateJobRow = (jobIndex: number, stepIndex: number, rowValue: string) => {
    if (!jobs || !onJobsChange) return;
    const updated = jobs.map((job, i) => {
      if (i !== jobIndex) return job;
      const steps = [...job.werkbeschrijving];
      steps[stepIndex] = rowValue;
      return { ...job, werkbeschrijving: steps };
    });
    onJobsChange(updated);
  };

  const addJobRow = (jobIndex: number) => {
    if (!jobs || !onJobsChange) return;
    const updated = jobs.map((job, i) => {
      if (i !== jobIndex) return job;
      return { ...job, werkbeschrijving: [...job.werkbeschrijving, ''] };
    });
    onJobsChange(updated);
  };

  const removeJobRow = (jobIndex: number, stepIndex: number) => {
    if (!jobs || !onJobsChange) return;
    const updated = jobs.map((job, i) => {
      if (i !== jobIndex) return job;
      return { ...job, werkbeschrijving: job.werkbeschrijving.filter((_, si) => si !== stepIndex) };
    });
    onJobsChange(updated);
  };

  const moveJobRow = (jobIndex: number, stepIndex: number, direction: 'up' | 'down') => {
    if (!jobs || !onJobsChange) return;
    const updated = jobs.map((job, i) => {
      if (i !== jobIndex) return job;
      const steps = [...job.werkbeschrijving];
      const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
      if (targetIndex < 0 || targetIndex >= steps.length) return job;
      const temp = steps[stepIndex];
      steps[stepIndex] = steps[targetIndex];
      steps[targetIndex] = temp;
      return { ...job, werkbeschrijving: steps };
    });
    onJobsChange(updated);
  };

  const isMultiJob = jobs && jobs.length > 1;
  const safeActiveJobIndex = isMultiJob ? Math.min(activeJobIndex, jobs.length - 1) : 0;
  const activeJob = isMultiJob ? jobs[safeActiveJobIndex] : null;

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Werkbeschrijving</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isMultiJob && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hoofdtitel</Label>
                <Input
                  value={value.title}
                  onChange={(e) => onChange({ ...value, title: e.target.value })}
                  placeholder="Bijv. Dakisolatie woning"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Korte context / samenvatting (optioneel)</Label>
                <Input
                  value={value.context}
                  onChange={(e) => onChange({ ...value, context: e.target.value })}
                  placeholder="Bijv. renovatie zolderverdieping"
                  className="h-9"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isMultiJob && (
                <>
                  <Button
                    type="button"
                    variant={mode === 'edit' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => onModeChange('edit')}
                  >
                    Bewerken
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'preview' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => onModeChange('preview')}
                  >
                    Preview
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="success" size="sm" onClick={() => onGenerate('full')} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Genereer werkbeschrijving
              </Button>
              {!isMultiJob && templateLabel && onApplyTemplate ? (
                <Button type="button" variant="outline" size="sm" onClick={onApplyTemplate}>
                  Template toepassen ({templateLabel})
                </Button>
              ) : null}
              {!isMultiJob && showDevTools ? (
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

      {isMultiJob ? (
        <div className="space-y-4">
          {/* Job tab switcher */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {jobs.map((job, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveJobIndex(index)}
                className={[
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  safeActiveJobIndex === index
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {job.korteTitel || `Klus ${index + 1}`}
              </button>
            ))}
          </div>

          {/* Active job content */}
          {activeJob && (
            <div className="space-y-3">
              {activeJob.korteBeschrijving && (
                <Card className="border border-border bg-card/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm text-muted-foreground italic">{activeJob.korteBeschrijving}</p>
                  </CardContent>
                </Card>
              )}
              <WorkDescriptionSectionEditor
                title="Stappen"
                rows={ensureRows(activeJob.werkbeschrijving)}
                placeholder="Bijv. Materiaal plaatsen volgens maatvoering"
                onChangeRow={(index, rowValue) => updateJobRow(safeActiveJobIndex, index, rowValue)}
                onAddRow={() => addJobRow(safeActiveJobIndex)}
                onRemoveRow={(index) => removeJobRow(safeActiveJobIndex, index)}
                onMoveRow={(index, direction) => moveJobRow(safeActiveJobIndex, index, direction)}
              />
            </div>
          )}
        </div>
      ) : mode === 'preview' ? (
        <WorkDescriptionPreview value={value} />
      ) : (
        <div className="space-y-3">
          <WorkDescriptionSectionEditor
            title="Uitvoering"
            rows={ensureRows(value.sections.uitvoering)}
            placeholder="Bijv. Isolatiemateriaal plaatsen volgens maatvoering"
            onChangeRow={(index, rowValue) => updateSectionRow('uitvoering', index, rowValue)}
            onAddRow={() => addSectionRow('uitvoering')}
            onRemoveRow={(index) => removeSectionRow('uitvoering', index)}
            onMoveRow={(index, direction) => moveSectionRow('uitvoering', index, direction)}
          />
        </div>
      )}
    </div>
  );
}
