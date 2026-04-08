'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

interface WorkDescriptionSectionEditorProps {
  title: string;
  rows: string[];
  placeholder: string;
  onChangeRow: (index: number, value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (index: number, direction: 'up' | 'down') => void;
}

export function WorkDescriptionSectionEditor({
  title,
  rows,
  placeholder,
  onChangeRow,
  onAddRow,
  onRemoveRow,
  onMoveRow,
}: WorkDescriptionSectionEditorProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-foreground">{title}</Label>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={onAddRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Stap toevoegen
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${title}-row-${index}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
            <Input
              value={row}
              onChange={(e) => onChangeRow(index, e.target.value)}
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
