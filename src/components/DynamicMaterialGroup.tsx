'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Pencil, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// ==========================================
// Styles extracted from page.tsx to match perfectly
// ==========================================
const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';
const SELECTED_MATERIAL_TEXT = 'text-emerald-400';

export interface GroupMaterial {
  id: string;
  materiaalnaam: string;
  eenheid: string;
  quantity: number;
  prijs: number;
}

interface DynamicMaterialGroupProps {
  id: string;
  title: string;
  materials: GroupMaterial[];
  onUpdateTitle: (val: string) => void;
  onAddMaterial: () => void;
  onRemoveMaterial: (id: string) => void;
  onDeleteGroup: () => void;
  onUpdateQuantity: (id: string, qty: number) => void;
}

export function DynamicMaterialGroup({
  title,
  materials,
  onUpdateTitle,
  onAddMaterial,
  onRemoveMaterial,
  onDeleteGroup,
  onUpdateQuantity,
}: DynamicMaterialGroupProps) {
  const isEmpty = materials.length === 0;

  return (
    <Card className={cn('transition-all', isEmpty && 'border-l-2 border-l-destructive')}>
      {/* HEADER: Matches standard cards, but with an editable Input for the title */}
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2 flex-1">
            {/* We use an Input here but styled to look like CardTitle */}
            <Input
              value={title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              placeholder="Naam van groep..."
              className="border-none shadow-none focus-visible:ring-0 px-0 h-auto text-lg font-semibold bg-transparent placeholder:text-muted-foreground/50 w-full"
            />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onDeleteGroup}
          className={cn('h-8 w-8 text-muted-foreground hover:text-destructive', ICON_BUTTON_NO_ORANGE)}
          title="Verwijder groep"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        <div className="border-t pt-4">
          {isEmpty ? (
            /* EMPTY STATE: Matches "Nog geen materiaal gekozen" style */
            <div className="flex items-center justify-between min-h-[40px]">
              <div>
                <p className="text-sm text-destructive italic">Nog geen materiaal gekozen</p>
              </div>
              <div>
                <Button
                    variant="ghost"
                    onClick={onAddMaterial}
                    className="text-emerald-500 whitespace-nowrap inline-flex items-center gap-1 hover:bg-transparent hover:text-emerald-600 hover:opacity-90 px-2 py-2 h-auto"
                >
                    <Plus className="h-4 w-4" />
                    <span>Toevoegen</span>
                </Button>
              </div>
            </div>
          ) : (
            /* LIST STATE */
            <div className="space-y-4">
              {materials.map((mat) => (
                <div key={mat.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-h-[40px]">
                  
                  {/* Left: Name and Unit */}
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', SELECTED_MATERIAL_TEXT)}>
                      {mat.materiaalnaam}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {mat.eenheid}
                    </p>
                  </div>

                  {/* Right: Controls (Qty + Remove) */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Aantal:</span>
                        <Input
                            type="number"
                            min={0}
                            value={mat.quantity}
                            onChange={(e) => onUpdateQuantity(mat.id, parseInt(e.target.value) || 0)}
                            className="h-8 w-20 text-center"
                        />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveMaterial(mat.id)}
                      className={cn(
                        'h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-transparent',
                        ICON_BUTTON_NO_ORANGE
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {/* "Add another" button at the bottom of the list */}
              <div className="flex justify-end pt-2">
                 <Button
                    variant="ghost"
                    onClick={onAddMaterial}
                    size="sm"
                    className="text-muted-foreground/80 whitespace-nowrap inline-flex items-center gap-1 hover:bg-muted/50 px-2"
                >
                    <Plus className="h-3 w-3" />
                    <span>Nog een materiaal</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}