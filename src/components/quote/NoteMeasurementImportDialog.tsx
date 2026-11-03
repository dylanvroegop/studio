'use client';

import { useMemo, useState } from 'react';
import type { MeasurementField } from '@/lib/job-registry';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildNoteImportPatches, initialNoteImportChoices, noteImportFields, SKIP_NOTE_MEASUREMENT,
  type NoteImportChoice, type NoteImportPatch, type NoteImportRow,
} from '@/lib/note-measurement-import';

interface Props {
  rows: NoteImportRow[];
  fields: MeasurementField[];
  items: Record<string, unknown>[];
  itemLabel: string;
  onCancel: () => void;
  onApply: (patches: NoteImportPatch[]) => void;
}

export function NoteMeasurementImportDialog({ rows, fields, items, itemLabel, onCancel, onApply }: Props): JSX.Element {
  const targets = useMemo(() => noteImportFields(fields), [fields]);
  const [choices, setChoices] = useState(() => initialNoteImportChoices(rows, targets, items));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [showError, setShowError] = useState(false);
  const boeiboord = targets.some(field => field.key === 'lengte_onderzijde');
  const result = buildNoteImportPatches(rows, choices, targets, items.length);
  const replacements = result.patches.flatMap(patch => {
    if (!patch.target.startsWith('existing:')) return [];
    const index = Number(patch.target.split(':')[1]);
    return Object.entries(patch.values).flatMap(([key, value]) => {
      const previous = items[index]?.[key];
      return previous !== undefined && previous !== null && String(previous).trim() !== '' && String(previous) !== value
        ? [`${itemLabel} ${index + 1}: ${targets.find(field => field.key === key)?.label || key} ${previous} → ${value}`] : [];
    });
  });

  function updateChoice(rowId: string, update: Partial<NoteImportChoice>): void {
    setChoices(current => ({ ...current, [rowId]: { ...current[rowId], ...update } }));
    setReplaceExisting(false);
    setShowError(false);
  }

  function chooseSide(row: NoteImportRow, side: 'voorzijde' | 'onderzijde'): void {
    const mapping = { ...choices[row.id].fields };
    const crossDimensions = row.dimensions.filter(value => value.key === 'breedte' || value.key === 'hoogte');
    for (const dimension of row.dimensions) {
      if (dimension.key === 'lengte') mapping[dimension.key] = side === 'voorzijde' ? 'lengte' : 'lengte_onderzijde';
      if (crossDimensions.length === 1 && dimension === crossDimensions[0]) mapping[dimension.key] = side === 'voorzijde' ? 'hoogte' : 'breedte';
    }
    updateChoice(row.id, { fields: mapping });
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="shrink-0 pr-6 text-left">
          <DialogTitle>Maten koppelen aan calculatie</DialogTitle>
          <DialogDescription>Kies per regel het onderdeel en waar elke maat hoort. Bij opslaan worden de gekoppelde notitiematen bijgewerkt.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {rows.map((row, index) => {
            const choice = choices[row.id];
            const skipped = choice.target === SKIP_NOTE_MEASUREMENT;
            return (
              <section key={row.id} aria-label={`Maatregel ${index + 1}: ${row.title}`} className="space-y-3 rounded-lg border p-3">
                <div className="grid items-center gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{index + 1}. {row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.dimensions.map(value => `${value.label}: ${value.value} mm`).join(' · ')}</p>
                    {row.dimensions.length === 1 && <p className="text-xs text-amber-500">Er staat maar één maat in deze regel.</p>}
                  </div>
                  <Select value={choice.target} onValueChange={target => updateChoice(row.id, { target })}>
                    <SelectTrigger aria-label={`Onderdeel voor regel ${index + 1}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_NOTE_MEASUREMENT}>Regel niet gebruiken</SelectItem>
                      {items.map((item, itemIndex) => (
                        <SelectItem key={itemIndex} value={`existing:${itemIndex}`}>
                          {itemLabel} {itemIndex + 1} — bestaand{item.lengte ? ` (${item.lengte} mm)` : ''}
                        </SelectItem>
                      ))}
                      {rows.map((source, sourceIndex) => <SelectItem key={source.id} value={`new:${source.id}`}>Nieuw {itemLabel.toLowerCase()} — regel {sourceIndex + 1}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!skipped && <>
                  {boeiboord && <div className="flex flex-wrap gap-2" role="group" aria-label={`Zijde voor regel ${index + 1}`}>
                    <Button type="button" variant="outline" size="sm" onClick={() => chooseSide(row, 'voorzijde')}>Voorzijde</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => chooseSide(row, 'onderzijde')}>Onderzijde</Button>
                  </div>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {row.dimensions.map(dimension => <label key={dimension.key} className="min-w-0 space-y-1 text-xs">
                      <span>{dimension.label}: <strong>{dimension.value} mm</strong> →</span>
                      <Select value={choice.fields[dimension.key] || ''} onValueChange={field => updateChoice(row.id, { fields: { ...choice.fields, [dimension.key]: field } })}>
                        <SelectTrigger aria-label={`${dimension.label} van regel ${index + 1}`} className={!choice.fields[dimension.key] ? 'border-amber-500/60' : ''}>
                          <SelectValue placeholder="Kies het veld…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP_NOTE_MEASUREMENT}>Niet gebruiken</SelectItem>
                          {targets.map(field => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>)}
                  </div>
                </>}
              </section>
            );
          })}
          {replacements.length > 0 && <div className="space-y-2 rounded-lg border border-amber-500/50 p-3 text-sm">
            <p>Deze ingevulde maten worden vervangen:</p>
            <ul className="list-inside list-disc text-xs">{replacements.map((text, index) => <li key={index}>{text}</li>)}</ul>
            <label className="flex items-center gap-2"><Checkbox checked={replaceExisting} onCheckedChange={checked => setReplaceExisting(checked === true)} />Bestaande maten vervangen</label>
          </div>}
        </div>
        {showError && result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
        <DialogFooter className="shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
          <Button type="button" disabled={replacements.length > 0 && !replaceExisting} onClick={() => {
            if (result.error) { setShowError(true); return; }
            onApply(result.patches);
          }}>Maten overnemen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
