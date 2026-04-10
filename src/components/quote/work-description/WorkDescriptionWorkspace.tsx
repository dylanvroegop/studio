'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkDescriptionStructured } from '@/lib/quote-calculations';
import { Loader2, Sparkles } from 'lucide-react';
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
}: WorkDescriptionWorkspaceProps) {
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

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Werkbeschrijving</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
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
            </div>

            <div className="flex items-center gap-2">
              {templateLabel && onApplyTemplate ? (
                <Button type="button" variant="outline" size="sm" onClick={onApplyTemplate}>
                  Template toepassen ({templateLabel})
                </Button>
              ) : null}
              {isAutoSaving ? (
                <span className="text-xs text-muted-foreground">Opslaan...</span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI acties</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Button type="button" variant="success" onClick={() => onGenerate('full')} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Genereer volledige werkbeschrijving
          </Button>
          <Button type="button" variant="outline" onClick={() => onGenerate('uitvoering-only')} disabled={isGenerating}>
            Vul alleen uitvoering
          </Button>
          <Button type="button" variant="outline" onClick={() => onGenerate('improve')} disabled={isGenerating}>
            Verbeter bestaande tekst
          </Button>
        </CardContent>
      </Card>

      {mode === 'preview' ? (
        <WorkDescriptionPreview value={value} />
      ) : (
        <div className="space-y-3">
          <WorkDescriptionSectionEditor
            title="Voorbereiding"
            rows={ensureRows(value.sections.voorbereiding)}
            placeholder="Bijv. Werkplek afzetten en materialen controleren"
            onChangeRow={(index, rowValue) => updateSectionRow('voorbereiding', index, rowValue)}
            onAddRow={() => addSectionRow('voorbereiding')}
            onRemoveRow={(index) => removeSectionRow('voorbereiding', index)}
            onMoveRow={(index, direction) => moveSectionRow('voorbereiding', index, direction)}
          />
          <WorkDescriptionSectionEditor
            title="Uitvoering"
            rows={ensureRows(value.sections.uitvoering)}
            placeholder="Bijv. Isolatiemateriaal plaatsen volgens maatvoering"
            onChangeRow={(index, rowValue) => updateSectionRow('uitvoering', index, rowValue)}
            onAddRow={() => addSectionRow('uitvoering')}
            onRemoveRow={(index) => removeSectionRow('uitvoering', index)}
            onMoveRow={(index, direction) => moveSectionRow('uitvoering', index, direction)}
          />
          <WorkDescriptionSectionEditor
            title="Afwerking"
            rows={ensureRows(value.sections.afwerking)}
            placeholder="Bijv. Naden afwerken en werkplek schoon opleveren"
            onChangeRow={(index, rowValue) => updateSectionRow('afwerking', index, rowValue)}
            onAddRow={() => addSectionRow('afwerking')}
            onRemoveRow={(index) => removeSectionRow('afwerking', index)}
            onMoveRow={(index, direction) => moveSectionRow('afwerking', index, direction)}
          />
        </div>
      )}
    </div>
  );
}
