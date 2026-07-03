'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { capitalizeSentenceStarts } from '@/lib/text-formatting';

interface WorkDescriptionSectionEditorProps {
  title: string;
  rows: string[];
  placeholder: string;
  onChangeRow: (index: number, value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (index: number, direction: 'up' | 'down') => void;
  beforeRows?: ReactNode;
}

export function WorkDescriptionSectionEditor({
  title,
  rows,
  placeholder,
  onChangeRow,
  onAddRow,
  onRemoveRow,
  onMoveRow,
  beforeRows,
}: WorkDescriptionSectionEditorProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-foreground">{title}</Label>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={onAddRow} aria-label={`Stap toevoegen aan ${title}`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {beforeRows}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${title}-row-${index}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
            <Input
              value={row}
              onChange={(e) => onChangeRow(index, capitalizeSentenceStarts(e.target.value))}
              placeholder={placeholder}
              className="h-9"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMoveRow(index, 'up')}
              disabled={index === 0}
              aria-label="Verplaats omhoog"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMoveRow(index, 'down')}
              disabled={index === rows.length - 1}
              aria-label="Verplaats omlaag"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRemoveRow(index)}
              aria-label="Verwijder stap"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
