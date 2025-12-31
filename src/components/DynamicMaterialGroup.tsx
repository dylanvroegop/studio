'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
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
  // Optional dimensions for display
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
  onDeleteGroup,
}: DynamicMaterialGroupProps) {
  // STRICT RULE: Only 1 material per card.
  const material = materials.length > 0 ? materials[0] : null;
  const hasMaterial = !!material;

  // Helper to construct the full name including measurements
  const getDisplayName = (mat: GroupMaterial) => {
    const baseName = mat.materiaalnaam;
    
    // Check if we have dimensions (Length & Width are required)
    if (mat.lengte && mat.breedte) {
       const u = mat.unit || 'mm';
       
       // Start with Length x Width
       let dimensions = `${mat.lengte}×${mat.breedte}`;

       // ✅ NEW: Check for Thickness (dikte) OR Height (hoogte) and append it
       if (mat.dikte) {
         dimensions += `×${mat.dikte}`;
       } else if (mat.hoogte) {
         dimensions += `×${mat.hoogte}`;
       }

       return `${baseName} ${dimensions}${u}`;
    }
    
    return baseName;
  };

  // Auto-capitalize title on blur
  const handleTitleBlur = () => {
    if (!title) return;
    const capitalized = title.charAt(0).toUpperCase() + title.slice(1);
    if (capitalized !== title) {
      onUpdateTitle(capitalized);
    }
  };

  return (
    <Card className={cn('transition-all', !hasMaterial && 'border-l-2 border-l-destructive')}>
      {/* HEADER */}
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2 flex-1">
            <Input
              value={title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              onBlur={handleTitleBlur}
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
          {!hasMaterial ? (
            /* EMPTY STATE: Show "Toevoegen" */
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
            /* FILLED STATE: Material Name + "Wijzigen" Button */
            <div className="flex items-center justify-between min-h-[40px]">
              <span className={cn('text-sm font-medium truncate', SELECTED_MATERIAL_TEXT)}>
                {getDisplayName(material)}
              </span>
              
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}