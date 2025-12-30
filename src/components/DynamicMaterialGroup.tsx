'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// ✅ 1. Export this type so page.tsx can import it
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
    <Card className={cn('bg-zinc-900 border-zinc-800', isEmpty && 'border-l-4 border-red-500')}>
      <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
        <div className="flex items-center gap-2 flex-grow">
          <GripVertical className="h-5 w-5 text-zinc-600" />
          <Input
            value={title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            placeholder="Naam van groep..."
            className="border-none bg-transparent text-lg font-semibold text-white p-0 h-auto focus-visible:ring-0 placeholder:text-zinc-600"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onDeleteGroup} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 h-8 w-8">
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
          <div className="border-t border-zinc-800 pt-2 space-y-2">
            {materials.map((mat) => (
              <div key={mat.id} className="flex items-center justify-between gap-4 py-1">
                <span className="text-sm text-emerald-400 flex-grow truncate">{mat.materiaalnaam}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={mat.quantity}
                    onChange={(e) => onUpdateQuantity(mat.id, parseInt(e.target.value) || 1)}
                    className="h-8 w-20 text-center bg-zinc-950 border-zinc-700"
                  />
                  <span className="text-xs text-zinc-500 w-8">{mat.eenheid}</span>
                  <Button variant="ghost" size="icon" onClick={() => onRemoveMaterial(mat.id)} className="h-8 w-8 text-zinc-500 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={onAddMaterial} className="w-full mt-2 justify-start gap-2 text-zinc-400 hover:text-emerald-500">
              <Plus className="h-4 w-4" />
              Materiaal toevoegen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}