'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MoreHorizontal, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';
const SELECTED_MATERIAL_TEXT = 'text-emerald-400';
const TEKST_ACTIE_CLASSES = "inline-flex items-center gap-1 rounded-md px-2 py-2 min-h-[44px] bg-transparent hover:bg-transparent hover:text-inherit hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:pointer-events-none";

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
  length?: number | string;
  width?: number | string;
  height?: number | string;
  thickness?: number | string;
  unit?: string;
  prijs_per_stuk?: number;
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

  // ✅ These props connect the component to the Page State
  isExpanded?: boolean;
  onToggle?: (newState: boolean) => void;
}

export function DynamicMaterialGroup({
  id,
  title,
  materials,
  onUpdateTitle,
  onAddMaterial,
  onEditMaterial,
  onRemoveMaterial,
  onDeleteGroup,
  onUpdateQuantity,
  isExpanded: controlledExpanded,
  onToggle,
}: DynamicMaterialGroupProps) {

  // Internal state fallback (in case parent doesn't provide control)
  const [internalExpanded, setInternalExpanded] = useState(true);

  // Use parent's state if provided, otherwise use internal
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = (newState: boolean) => {
    if (onToggle) {
      onToggle(newState); // ⚡️ THIS WAS MISSING: Tells page.tsx "I am closed"
    } else {
      setInternalExpanded(newState);
    }
  };

  const material = materials.length > 0 ? materials[0] : null;
  const hasMaterial = !!material;

  const getDisplayName = (mat: GroupMaterial) => {
    const baseName = mat.materiaalnaam;
    const length = mat.lengte || mat.length;
    const width = mat.breedte || mat.width;
    const thickness = mat.dikte || mat.thickness;
    const height = mat.hoogte || mat.height;

    if (length && width) {
      const u = mat.unit || 'mm';
      let dimensions = `${length} × ${width}`;
      if (thickness) dimensions += ` × ${thickness}`;
      else if (height) dimensions += ` × ${height}`;
      return `${baseName} ${dimensions}${u}`;
    }
    return baseName;
  };

  const handleTitleBlur = () => {
    if (!title) return;
    const capitalized = title.charAt(0).toUpperCase() + title.slice(1);
    if (capitalized !== title) onUpdateTitle(capitalized);
  };

  const ActionsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className={cn('h-11 w-11 text-muted-foreground hover:text-foreground', ICON_BUTTON_NO_ORANGE)}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasMaterial && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); if (material) onRemoveMaterial(material.id); }} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> <span>Verwijder materiaal</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteGroup(); }} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> <span>Verwijder groep</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!isExpanded) {
    return (
      <div
        className="group flex items-center justify-between rounded-lg border border-border/40 bg-muted/5 px-4 py-2 cursor-pointer transition-all hover:bg-muted/20 hover:border-border/60 hover:opacity-100 opacity-60"
        onClick={() => handleToggle(true)}
      >
        <div className="flex flex-col justify-center flex-1 min-w-0 mr-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground truncate group-hover:text-foreground transition-colors">
              {title || 'Naamloos'}
            </span>
            <span className="text-xs font-normal text-muted-foreground/50 hidden sm:inline-block">
              · Niet van toepassing
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className={cn('h-8 w-8 text-muted-foreground/70 group-hover:text-foreground', ICON_BUTTON_NO_ORANGE)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <ActionsMenu />
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('transition-all', !hasMaterial && 'border-l-2 border-l-destructive')}>
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Naam van groep..."
            style={{ fontSize: '18px' }}
            className="border-none shadow-none focus-visible:ring-0 px-0 h-auto py-0 font-semibold tracking-tight bg-transparent placeholder:text-muted-foreground/50 w-full !text-[18px]"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => handleToggle(false)} className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground")}>
            <ChevronUp className="h-5 w-5" />
          </button>
          <ActionsMenu />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="border-t pt-4">
          <div className="flex items-center justify-between min-h-[40px]">
            <div>
              {!hasMaterial ? (
                <p className="text-sm text-destructive">Nog geen materiaal gekozen</p>
              ) : (
                <span className={cn('text-sm font-medium', SELECTED_MATERIAL_TEXT)}>
                  {getDisplayName(material)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!hasMaterial ? (
                <button type="button" onClick={onAddMaterial} className={cn(TEKST_ACTIE_CLASSES, "text-emerald-500 whitespace-nowrap")}>
                  <Plus className="h-4 w-4" /> <span>Toevoegen</span>
                </button>
              ) : (
                <button type="button" onClick={onEditMaterial} className={cn(TEKST_ACTIE_CLASSES, "text-foreground/80 whitespace-nowrap")}>
                  <span>Wijzigen</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}