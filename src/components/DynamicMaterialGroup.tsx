'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ==========================================
// Styling helpers
// ==========================================
const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';
const SELECTED_MATERIAL_TEXT = 'text-emerald-400';

export interface GroupMaterial {
  id: string;
  materiaalnaam: string;
  eenheid: string;
  quantity: number;
  prijs: number;
  lengte?: number | string;
  breedte?: number | string;
  hoogte?: number | string;
  dikte?: number | string;
  unit?: string;
}

interface DynamicMaterialGroupProps {
  id: string;
  title: string;
  materials: GroupMaterial[];
  onUpdateTitle: (val: string) => void;
  onAddMaterial: () => void;
  onEditMaterial?: () => void;
  onRemoveMaterial: (id: string) => void;
  onDeleteGroup: () => void;
  onUpdateQuantity?: (id: string, qty: number) => void;
}

export function DynamicMaterialGroup({
  title,
  materials,
  onUpdateTitle,
  onAddMaterial,
  onEditMaterial,
  onRemoveMaterial,
  onDeleteGroup,
}: DynamicMaterialGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // STRICT RULE: Only 1 material per card.
  const material = materials.length > 0 ? materials[0] : null;
  const hasMaterial = !!material;

  const getDisplayName = (mat: GroupMaterial) => {
    const baseName = mat.materiaalnaam;
    if (mat.lengte && mat.breedte) {
       const u = mat.unit || 'mm';
       let dimensions = `${mat.lengte}×${mat.breedte}`;
       if (mat.dikte) dimensions += `×${mat.dikte}`;
       else if (mat.hoogte) dimensions += `×${mat.hoogte}`;
       return `${baseName} ${dimensions}${u}`;
    }
    return baseName;
  };

  const handleTitleBlur = () => {
    if (!title) return;
    const capitalized = title.charAt(0).toUpperCase() + title.slice(1);
    if (capitalized !== title) {
      onUpdateTitle(capitalized);
    }
  };

  // ✅ 1. COLLAPSED STATE (No Trash Icon, "Niet van toepassing")
  if (!isExpanded) {
    return (
      <div 
        className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4 shadow-[inset_0_0_4px_rgba(0,0,0,0.35)] cursor-pointer transition-all"
        onClick={() => setIsExpanded(true)}
      >
        <p className="text-sm font-medium text-muted-foreground truncate flex-1">
          {title || 'Naamloos'} 
          <span className="font-normal ml-2">· Niet van toepassing</span>
        </p>

        <div className="flex items-center gap-1 shrink-0">
            {/* ONLY CHEVRON HERE */}
            <Button 
                variant="ghost" 
                size="icon"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }} 
                className="text-muted-foreground px-1 py-1 min-h-0 h-8 w-8 hover:bg-transparent hover:text-foreground"
            >
                <ChevronDown className="h-4 w-4" />
            </Button>
        </div>
      </div>
    );
  }

  // ✅ 2. EXPANDED STATE (Has Trash Icon to delete group)
  return (
    <Card className={cn('transition-all', !hasMaterial && 'border-l-2 border-l-destructive')}>
      {/* HEADER */}
      <CardHeader 
        className="flex flex-row items-center justify-between p-4 pb-3 cursor-pointer"
        onClick={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SVG' && (e.target as HTMLElement).tagName !== 'PATH') {
                setIsExpanded(false);
            }
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Naam van groep..."
              className="border-none shadow-none focus-visible:ring-0 px-0 h-auto text-lg font-semibold bg-transparent placeholder:text-muted-foreground/50 w-full"
            />
        </div>

        <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
              className={cn('h-8 w-8 text-muted-foreground', ICON_BUTTON_NO_ORANGE)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>

            {/* Trash icon is ONLY visible when expanded */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(); }}
              className={cn('h-8 w-8 text-muted-foreground hover:text-destructive', ICON_BUTTON_NO_ORANGE)}
              title="Verwijder groep"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
        </div>
      </CardHeader>

      {/* CONTENT */}
      <CardContent className="p-4 pt-0">
        <div className="border-t pt-4">
          {!hasMaterial ? (
            /* EMPTY STATE */
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
            /* FILLED STATE */
            <div className="flex items-center justify-between min-h-[40px]">
              <span className={cn('text-sm font-medium truncate', SELECTED_MATERIAL_TEXT)}>
                {getDisplayName(material)}
              </span>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveMaterial(material.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-transparent"
                  title="Verwijder materiaal"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  onClick={onEditMaterial}
                  className={cn(
                    "text-foreground/80 hover:text-foreground whitespace-nowrap inline-flex items-center gap-1 hover:bg-transparent px-2 h-8",
                    ICON_BUTTON_NO_ORANGE
                  )}
                >
                  Wijzigen
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}