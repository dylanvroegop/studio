'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MateriaalKeuze } from '@/lib/types'; // Assuming this type is exported

interface DynamicMaterialGroupProps {
  id: string;
  title: string;
  materials: (MateriaalKeuze & { quantity: number })[];
  onUpdateTitle: (newTitle: string) => void;
  onAddMaterial: () => void;
  onUpdateQuantity: (materialId: string, quantity: number) => void;
  onRemoveMaterial: (materialId: string) => void;
  onDeleteGroup: () => void;
}

export function DynamicMaterialGroup({
  id,
  title,
  materials,
  onUpdateTitle,
  onAddMaterial,
  onUpdateQuantity,
  onRemoveMaterial,
  onDeleteGroup,
}: DynamicMaterialGroupProps) {
  const isEmpty = materials.length === 0;

  return (
    <Card className={cn('bg-zinc-900 border-zinc-800', isEmpty && 'border-l-4 border-red-500')}>
      <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
        <div className="flex items-center gap-2 flex-grow">
          <GripVertical className="h-5 w-5 text-zinc-600 cursor-grab" />
          <Input
            value={title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            placeholder="Naam van groep..."
            className="border-none bg-transparent text-lg font-semibold text-white focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDeleteGroup}
          className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isEmpty ? (
          <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
            <p className="text-sm text-red-500/90 italic">Nog geen materiaal gekozen</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddMaterial}
              className="gap-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
            >
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          </div>
        ) : (
          <div className="border-t border-zinc-800 pt-2">
            <ul className="space-y-2">
              {materials.map((mat) => (
                <li key={mat.id} className="flex items-center justify-between gap-4 py-1">
                  <span className="text-sm text-emerald-400 flex-grow truncate">{mat.materiaalnaam}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Input
                      type="number"
                      value={mat.quantity}
                      onChange={(e) => onUpdateQuantity(mat.id, parseInt(e.target.value, 10) || 1)}
                      className="h-8 w-20 text-center bg-zinc-950 border-zinc-700"
                      min="1"
                    />
                    <span className="text-xs text-zinc-500 w-8">{mat.eenheid}</span>
                     <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveMaterial(mat.id)}
                      className="h-8 w-8 text-zinc-500 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
             <Button
                variant="ghost"
                size="sm"
                onClick={onAddMaterial}
                className="w-full mt-2 justify-start gap-2 text-zinc-400 hover:text-emerald-500"
              >
                <Plus className="h-4 w-4" />
                Materiaal toevoegen
              </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
