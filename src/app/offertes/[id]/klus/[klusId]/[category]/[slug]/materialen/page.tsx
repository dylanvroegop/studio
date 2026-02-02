/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// Components
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { DynamicMaterialGroup } from '@/components/DynamicMaterialGroup';
import { PersonalNotes } from '@/components/PersonalNotes';
import { WizardHeader } from '@/components/WizardHeader';
import { Textarea } from '@/components/ui/textarea';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent, JobComponentType, Job } from '@/lib/types';

import {
  ArrowLeft,
  Trash2,
  Settings,
  Save,
  ChevronDown,
  ChevronUp,
  Star,
  Loader2,
  Plus,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Calculator,
  Sparkles,
  Edit2,
  Box,
  AlertTriangle,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';

import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  deleteField,
  setDoc,
} from 'firebase/firestore';

import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import {
  JOB_REGISTRY,
  MATERIAL_CATEGORY_INFO,
  MaterialCategoryKey
} from '@/lib/job-registry';
import { COMPONENT_REGISTRY } from '@/lib/component-registry';

// ==================================
// HELPER FUNCTIONS
// ==================================

function sanitizeNlMoneyInput(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/[^\d,]/g, '');
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    const before = s.slice(0, firstComma + 1);
    const after = s.slice(firstComma + 1).replace(/,/g, '').slice(0, 2);
    s = before + after;
  }
  const [intPartRaw, decPartRaw] = s.split(',');
  const intDigits = (intPartRaw || '').replace(/^0+(?=\d)/, '');
  const intPart = intDigits === '' ? '0' : intDigits;
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (firstComma === -1) return withDots === '0' ? '' : withDots;
  return `${withDots},${decPartRaw || ''}`;
}

function parseNLMoneyToNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  // If raw is already a number, return it
  if (typeof raw === 'number') return raw;

  // Handle "9.3 p/m2" format - extract the first number
  const stringVal = String(raw);
  const match = stringVal.match(/^([\d.,]+)/);
  if (!match) return null;

  let s = match[1].replace(/\s/g, '').replace('€', '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    s = s.split(thousandSep).join('');
    s = decimalSep === ',' ? s.replace(',', '.') : s;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (hasComma) {
    s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (hasDot) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatNlMoneyFromNumber(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const fixed = n.toFixed(2);
  const [i, d] = fixed.split('.');
  const withDots = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${d}`;
}
const BLOCKLIST = ['isFavorite', 'sectionKey', 'quantity', '_raw', 'created_at', 'id'];

function cleanMaterialData(v: any) {
  if (!v) return null;
  const source = v._raw || v;
  const clean: any = {};
  Object.keys(source).forEach(prop => {
    if (BLOCKLIST.includes(prop)) return;
    const val = source[prop];
    if (val === null || val === undefined || val === '') return;
    clean[prop] = val;
  });
  if (!clean.materiaalnaam && v.materiaalnaam) clean.materiaalnaam = v.materiaalnaam;
  return Object.keys(clean).length > 0 ? clean : null;
}

function EuroInput({ id, value, onChange, placeholder = '0,00', disabled }: any) {
  const [focused, setFocused] = useState(false);
  const hasValue = (value ?? '').trim() !== '';
  return (
    <div className="relative">
      <span className={cn('pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm transition-colors', focused || hasValue ? 'text-foreground' : 'text-muted-foreground')}>€</span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(sanitizeNlMoneyInput(e.target.value))}
        placeholder={placeholder}
        className="pl-7"
      />
    </div>
  );
}

function maakId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString();
}

function bouwCustomGroupsUitFirestore(custommateriaal: any, alleMaterialen: any[]): any[] {
  if (!custommateriaal || typeof custommateriaal !== 'object') return [];
  const index = new Map<string, any>();
  for (const m of alleMaterialen || []) index.set(String(m.id), m);
  return Object.entries(custommateriaal)
    .sort(([, itemA]: any, [, itemB]: any) => (itemA.order ?? 9999) - (itemB.order ?? 9999))
    .map(([groupId, item]: any) => {
      const rowId = item?.id ? String(item.id) : null;
      let matchedMaterial = null;

      if (rowId) {
        // If we have an ID, try to find it in default materials
        const found = index.get(rowId);
        if (found) {
          matchedMaterial = found;
        } else {
          // Fallback: use the data saved in the custom object itself if available
          // ensuring we don't show "onbekend" unless we really have to
          matchedMaterial = {
            id: rowId,
            materiaalnaam: item.materiaalnaam || '(onbekend)',
            eenheid: item.eenheid || 'stuk',
            prijs: typeof item.prijs === 'number' ? item.prijs : 0,
            prijs_per_stuk: typeof item.prijs_per_stuk === 'number' ? item.prijs_per_stuk : 0,
            quantity: 1
          };
        }
      }

      return {
        id: groupId,
        title: item?.title || '',
        // Only include a material if we actually resolved one.
        // If rowId was null/empty, materials will be [], causing state to be "unselected"
        materials: matchedMaterial ? [matchedMaterial] : [],
      };
    });
}

function bouwCustommateriaalMapUitCustomGroups(customGroups: any[]) {
  const out: any = {};
  customGroups.forEach((group, index) => {
    const groupId = group?.id;
    const title = (group?.title || '').trim();
    // Allow saving if we have at least a groupId and title, even if no material is selected yet
    if (!groupId || !title) return;

    const material = (group?.materials?.[0] as any);
    const rowId = material?.id || material?.row_id || null; // Kept for logic, but will be stripped on save if needed

    out[groupId] = {
      // We keep rowId here to allow the helper to work, but the save logic dictates what goes to firestore
      id: rowId ? String(rowId) : null,
      materiaalnaam: material?.materiaalnaam || '',
      prijs: typeof material?.prijs === 'number' ? material.prijs : 0,
      prijs_per_stuk: typeof material?.prijs_per_stuk === 'number' ? material.prijs_per_stuk : 0,
      eenheid: material?.eenheid || '',
      title,
      order: index
    };
  });
  return out;
}

/**
 * Builds explicit strip array (stroken) for dagkant materials based on opening type.
 * - raamkozijn (window) = 4 stroken: 2x L-zijde (vertical), 2x B-zijde (horizontal)
 * - deurkozijn (door) = 3 stroken: 2x L-zijde (vertical), 1x B-zijde (top only, no bottom)
 * 
 * @param openingType - The type of opening ('window', 'raamkozijn', 'door', 'door-frame', etc.)
 * @param width - The width of the opening in mm (becomes length for B-sides)
 * @param height - The height of the opening in mm (becomes length for L-sides)
 * @param diepte - The depth of the dagkant in mm (becomes width for all strips)
 */
function buildDagkantStroken(openingType: string, width: number, height: number, diepte: number): Array<{ breedte: number; lengte: number; label: string }> {
  const stroken: Array<{ breedte: number; lengte: number; label: string }> = [];

  // Left side (L) - vertical
  stroken.push({ breedte: diepte, lengte: height, label: "L" });
  // Right side (L) - vertical
  stroken.push({ breedte: diepte, lengte: height, label: "L" });
  // Top side (B) - horizontal
  stroken.push({ breedte: diepte, lengte: width, label: "B" });

  // Bottom side (B) - only for windows, not for doors (doors have no bottom frame piece)
  const isWindow = openingType === 'window' || openingType === 'raamkozijn';
  if (isWindow) {
    stroken.push({ breedte: diepte, lengte: width, label: "B" });
  }

  return stroken;
}

function getMaterialLength(material: any): number | null {
  if (!material) return null;
  const val = material.lengte;

  // Try direct number (already in mm)
  if (typeof val === 'number') return val;

  // Try string with unit (e.g., "300cm" or "3000mm")
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '.').toLowerCase().trim();

    // Check for cm suffix - convert to mm
    if (cleaned.endsWith('cm')) {
      const num = parseFloat(cleaned.replace('cm', ''));
      if (!isNaN(num)) return num * 10; // cm to mm
    }

    // Check for mm suffix
    if (cleaned.endsWith('mm')) {
      const num = parseFloat(cleaned.replace('mm', ''));
      if (!isNaN(num)) return num;
    }

    // Try plain number (assume mm if large, cm if small)
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      return num < 100 ? num * 10 : num; // Assume cm if < 100
    }
  }

  // Fallback: parse from material name (e.g., "44x69mm 3000mm lang")
  const name = material.materiaalnaam || '';
  const mmMatch = name.match(/(\d{3,4})mm\s*lang/i) || name.match(/(\d{3,4})\s*mm/i);
  if (mmMatch) return parseInt(mmMatch[1], 10);

  // Check for cm in name, e.g. "300cm"
  const cmMatch = name.match(/(\d{3})\s*cm/i);
  if (cmMatch) return parseInt(cmMatch[1], 10) * 10;

  return null;
}

// ==================================
// STYLING CONSTANTS
// ==================================
const POSITIVE_BTN_SOFT = 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20';
const DESTRUCTIVE_BTN_SOFT = 'border border-red-500/50 bg-red-500/15 text-red-100 hover:bg-red-500/25 hover:border-red-500/65 focus-visible:ring-red-500 focus-visible:ring-offset-0';
const SELECT_ITEM_GREEN = 'text-foreground focus:bg-emerald-600/15 focus:text-foreground data-[highlighted]:bg-emerald-600/15 data-[highlighted]:text-foreground data-[state=checked]:bg-emerald-600/15 data-[state=checked]:text-foreground';
const TERUG_HOVER_RED = 'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';
const DIALOG_CLOSE_TAP = '[&_button[aria-label="Close"]]:h-11 [&_button[aria-label="Close"]]:w-11 [&_button[aria-label="Close"]]:p-0 [&_button[aria-label="Close"]]:opacity-100 [&_button[aria-label="Close"]]:hover:bg-muted/50 [&_button[aria-label="Close"]]:hover:text-foreground [&_button[aria-label="Close"]]:focus-visible:ring-0';

// ==================================
// MATERIAL ROW COMPONENT
// ==================================

interface MaterialRowProps {
  label: string;
  selected?: any;
  onClick: () => void;
  onRemove?: () => void;
  isCustom?: boolean;
  onEditTitle?: () => void;
  isSubSection?: boolean;
}

function MaterialRow({ label, selected, onClick, onRemove, isCustom, onEditTitle, isSubSection = false }: MaterialRowProps) {
  const [deleteConfOpen, setDeleteConfOpen] = useState(false);

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          "group relative flex flex-col sm:flex-row sm:items-center justify-between py-1.5 px-4 rounded-lg border transition-all gap-1 sm:gap-4 cursor-pointer",
          (selected && selected.materiaalnaam) ? "border-emerald-500/20 bg-emerald-500/5" : "border-border hover:bg-accent/40"
        )}
      >
        <div
          className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <span className={cn(
            "font-medium text-sm truncate",
            (selected && selected.materiaalnaam) ? "text-emerald-500" : "text-muted-foreground"
          )}>
            {label}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:justify-end">
            {(selected && selected.materiaalnaam) ? (
              <>
                <span className="text-xs font-medium text-emerald-500 break-words text-left sm:text-right leading-tight">
                  {selected.materiaalnaam}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
              </>
            ) : (
              <div className={cn(
                "flex items-center gap-1.5 text-xs shrink-0 ml-auto sm:ml-0 transition-colors",
                isSubSection
                  ? "text-muted-foreground/50 hover:text-muted-foreground/80"
                  : "text-emerald-600 hover:text-emerald-500 font-medium"
              )}>
                <Plus className={cn("h-3.5 w-3.5", isSubSection && "opacity-60")} />
                <span>{isSubSection ? '+ Toevoegen' : 'Materiaal toevoegen'}</span>
              </div>
            )}
          </div>

          {((selected && selected.materiaalnaam) || isCustom) && onRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteConfOpen(true);
              }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteConfOpen} onOpenChange={setDeleteConfOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{selected?.materiaalnaam}</strong> wilt verwijderen uit dit slot?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={(e) => { e.stopPropagation(); setDeleteConfOpen(false); }}>
              <Button variant="ghost">Annuleren</Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                if (onRemove) onRemove();
                setDeleteConfOpen(false);
              }}
              asChild
            >
              <Button variant="destructiveSoft">Verwijderen</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ==================================
// DIALOG COMPONENTS
// ==================================

function SavePresetDialog({ open, onOpenChange, onSave, jobTitel, presets, defaultName }: any) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const existingPreset = useMemo(() => {
    if (!name.trim()) return null;
    return presets.find((p: any) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  }, [name, presets]);

  useEffect(() => {
    if (open) {
      if (defaultName) {
        setName(defaultName);
        const p = presets.find((x: any) => x.name === defaultName);
        if (p) setIsDefault(p.isDefault);
      } else {
        setName('');
        setIsDefault(false);
      }
    }
  }, [open, defaultName, presets]);

  useEffect(() => { if (existingPreset) setIsDefault(existingPreset.isDefault); }, [existingPreset]);

  const handleSave = async () => {
    if (!name) return;
    setIsSaving(true);
    await onSave(name, isDefault, existingPreset?.id);
    setIsSaving(false);
    onOpenChange(false);
    setTimeout(() => { setName(''); setIsDefault(false); }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>{existingPreset ? 'Werkpakket bijwerken' : 'Werkpakket opslaan'}</DialogTitle>
          <DialogDescription>{existingPreset ? `Overschrijven: "${existingPreset.name}"` : `Opslaan voor ${jobTitel}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name">Naam *</Label>
            <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`bv. Standaard ${jobTitel}`} className={cn(existingPreset && "border-red-500/50 focus-visible:ring-red-500")} />
            {existingPreset && <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-2 rounded-md border border-red-500/20"><Settings className="h-4 w-4" /><span>Let op: naam bestaat al.</span></div>}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="default-preset" checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked as boolean)} className="border-emerald-600 data-[state=checked]:bg-emerald-600" />
            <Label htmlFor="default-preset">Maak standaard voor {jobTitel}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave} disabled={!name || isSaving} variant="outline" className={cn(existingPreset ? DESTRUCTIVE_BTN_SOFT : POSITIVE_BTN_SOFT)}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isSaving ? 'Bezig...' : existingPreset ? 'Overschrijven' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveComponentPresetDialog({ open, onOpenChange, componentType, existingPresets, onSave }: any) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const existingPreset = useMemo(() => {
    if (!name.trim()) return null;
    return (existingPresets || []).find((p: any) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  }, [name, existingPresets]);

  useEffect(() => { if (open) { setName(''); } }, [open]);

  const handleSave = async () => {
    if (!name) return;
    setIsSaving(true);
    await onSave(name);
    setIsSaving(false);
    onOpenChange(false);
  };

  const title = componentType ? (COMPONENT_REGISTRY[componentType]?.title || componentType) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>{existingPreset ? 'Werkpakket bijwerken' : 'Werkpakket opslaan'}</DialogTitle>
          <DialogDescription>{existingPreset ? `Overschrijven: "${existingPreset.name}"` : `Materialen opslaan voor ${title}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="comp-preset-name">Naam *</Label>
            <Input id="comp-preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`bv. Standaard ${title}`} className={cn(existingPreset && "border-red-500/50 focus-visible:ring-red-500")} />
            {existingPreset && <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-2 rounded-md border border-red-500/20"><Settings className="h-4 w-4" /><span>Let op: naam bestaat al. Wordt overschreven.</span></div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave} disabled={!name || isSaving} variant="outline" className={cn(existingPreset ? DESTRUCTIVE_BTN_SOFT : POSITIVE_BTN_SOFT)}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isSaving ? 'Bezig...' : existingPreset ? 'Overschrijven' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagePresetsDialog({ open, onOpenChange, presets, onDelete, onSetDefault }: any) {
  if (!presets || presets.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
          <DialogHeader><DialogTitle>Werkpakketten beheren</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm py-8 text-center">Geen werkpakketten gevonden.</p>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Sluiten</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
        <DialogHeader><DialogTitle>Werkpakketten beheren</DialogTitle><DialogDescription>Beheer uw opgeslagen presets.</DialogDescription></DialogHeader>
        <div className="py-4 space-y-2">
          {presets.map((preset: any) => (
            <div key={preset.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
              <span className="text-sm font-medium">{preset.name} {preset.isDefault && <span className="text-xs text-muted-foreground ml-2">(standaard)</span>}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onSetDefault(preset)} disabled={preset.isDefault} className="hover:bg-emerald-600/10"><Star className="mr-2 h-4 w-4" /> Standaard</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(preset)}><Trash2 className="mr-2 h-4 w-4" /> Verwijderen</Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Sluiten</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddExtraMaterialDialog({ open, onOpenChange, onAdd }: any) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
    }
  }, [open]);

  const handleAdd = () => {
    if (title.trim()) {
      onAdd(title.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-md w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>Extra materiaal toevoegen</DialogTitle>
          <DialogDescription>Geef het materiaal een naam</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <Label htmlFor="extra-material-title">Naam *</Label>
            <Input
              id="extra-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bv. Extra bevestigingsmateriaal"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdd();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button
            onClick={handleAdd}
            disabled={!title.trim()}
            variant="outline"
            className={cn(POSITIVE_BTN_SOFT)}
          >
            Toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================================
// MAIN COMPONENT
// ==================================

export default function GenericMaterialsPageRedesigned() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;

  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const materialSections = jobConfig?.materialSections || [];

  // Group sections by category
  const groupedSections = useMemo(() => {
    const groups: Record<string, any[]> = {};

    materialSections.forEach(section => {
      const cat = section.category || 'extra';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(section);
    });

    return groups;
  }, [materialSections]);

  const JOB_KEY = jobSlug;
  const JOB_TITEL = jobConfig?.title || 'Klus';

  // Calculate which component types are active for this job configuration


  // State
  const [isMounted, setIsMounted] = useState(false);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  const [isOpslaan, setIsOpslaan] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false); // ✅ Fix for race condition

  const [alleMaterialen, setAlleMaterialen] = useState<any[]>([]);
  const [isMaterialenLaden, setMaterialenLaden] = useState(true);
  const [foutMaterialen, setFoutMaterialen] = useState<string | null>(null);

  const [presets, setPresets] = useState<any[]>([]);
  const [gekozenPresetId, setGekozenPresetId] = useState<string>('default');
  const [isPresetsLaden, setPresetsLaden] = useState(true);

  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, any | undefined>>({});
  // extraMaterials state removed - unified into customGroups
  const [customGroups, setCustomGroups] = useState<any[]>([]);
  const [firestoreCustommateriaal, setFirestoreCustommateriaal] = useState<any | null>(null);

  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<any>({ mode: 'inschatting', percentage: null, fixedAmount: null });
  const [kleinVastBedragStr, setKleinVastBedragStr] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [hiddenCategories, setHiddenCategories] = useState<Record<string, boolean>>({});

  const [actieveSectie, setActieveSectie] = useState<string | null>(null);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<any | null>(null);
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [favorieten, setFavorieten] = useState<string[]>([]);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [addExtraMaterialOpen, setAddExtraMaterialOpen] = useState(false);
  const [newExtraMaterialTitle, setNewExtraMaterialTitle] = useState('');

  // Missing price dialog
  const [missingPriceItems, setMissingPriceItems] = useState<any[]>([]);
  const [showMissingPriceDialog, setShowMissingPriceDialog] = useState(false);
  const [pendingNavigateTo, setPendingNavigateTo] = useState<string | null>(null);
  const [missingPriceInputs, setMissingPriceInputs] = useState<Record<string, string>>({});
  const [missingPriceSaved, setMissingPriceSaved] = useState<Record<string, boolean>>({});
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [components, setComponents] = useState<JobComponent[]>([]);

  // Per-component werkpakket presets
  const [componentPresets, setComponentPresets] = useState<Record<string, any[]>>({});
  const [saveComponentPresetOpen, setSaveComponentPresetOpen] = useState(false);
  const [saveComponentPresetType, setSaveComponentPresetType] = useState<string | null>(null);
  const [saveComponentPresetCompId, setSaveComponentPresetCompId] = useState<string | null>(null);

  // Calculate which component types are active for this job configuration
  const activeComponentTypes = useMemo(() => {
    const types = new Set<string>();
    const categories = Object.keys(jobConfig?.categoryConfig || MATERIAL_CATEGORY_INFO);
    const isComplex = (jobSlug.includes('hsb') || jobSlug.includes('metalstud') || jobSlug.includes('wand') || jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('plat') || jobSlug.includes('kozijn') || jobSlug.includes('deur') || jobSlug.includes('boeiboord') || jobSlug.includes('afwerking'));
    const isCeiling = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');

    categories.forEach(key => {
      const k = key.toString();
      const lower = k.toLowerCase();

      let type: string | null = null;

      if (isComplex) {
        if (k === 'Kozijnen' || lower === 'kozijnen') type = 'kozijn';
        else if (k === 'Deuren' || lower === 'deuren') type = 'deur';
        else if (k === 'boeiboord' || lower === 'boeiboorden') type = 'boeiboord';
        else if (k === 'Koof') type = 'leidingkoof';
        else if (k === 'Installatie' || k === 'Schakelmateriaal') type = 'installatie';
        else if (k === 'Dagkant') type = 'dagkant';
        else if (k === 'Vensterbank') type = 'vensterbank';
      }

      if (isCeiling) {
        if (k === 'Toegang' || k === 'Vliering_Toegang' || lower.includes('vlizotrap') || lower.includes('toegang')) type = 'vlizotrap';
        else if (k === 'Koof') type = 'leidingkoof';
      }

      if (k === 'gips_afwerking' || lower.includes('gips')) type = 'gips';

      if (type) types.add(type);
    });

    return types;
  }, [jobConfig, categorySlug, jobSlug]);

  const orphanedComponents = components.filter(c => !c.type || !activeComponentTypes.has(c.type));

  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [variantPickerType, setVariantPickerType] = useState<JobComponentType | null>(null);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);

  const [klus, setKlus] = useState<Job | null>(null);
  const [notities, setNotities] = useState('');

  // === BEAM HEIGHT WARNING ===
  // Calculate warning when selected beam length is too close to wall height
  const beamHeightWarning = useMemo(() => {
    // Only relevant for wall jobs
    if (!jobSlug.includes('wand') && !jobSlug.includes('hsb') && !jobSlug.includes('metalstud')) {
      return null;
    }

    // Get wall height from maatwerk data
    const maatwerkKey = `${jobSlug}_maatwerk`;
    const maatwerkItems = (klus as any)?.[maatwerkKey] || [];
    if (!Array.isArray(maatwerkItems) || maatwerkItems.length === 0) return null;

    const wallHeight = maatwerkItems[0]?.hoogte;
    if (!wallHeight || typeof wallHeight !== 'number') return null;

    // Get selected beam material
    const staandersKeys = ['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'];
    let beamMaterial: any = null;
    for (const key of staandersKeys) {
      if (gekozenMaterialen[key]) {
        beamMaterial = gekozenMaterialen[key]._raw || gekozenMaterialen[key];
        break;
      }
    }
    if (!beamMaterial) return null;

    // Parse beam length from material
    const beamLength = (() => {
      const val = beamMaterial.lengte;

      // Try direct number (already in mm)
      if (typeof val === 'number') return val;

      // Try string with unit (e.g., "300cm" or "3000mm")
      if (typeof val === 'string') {
        const cleaned = val.replace(',', '.').toLowerCase().trim();

        // Check for cm suffix - convert to mm
        if (cleaned.endsWith('cm')) {
          const num = parseFloat(cleaned.replace('cm', ''));
          if (!isNaN(num)) return num * 10; // cm to mm
        }

        // Check for mm suffix
        if (cleaned.endsWith('mm')) {
          const num = parseFloat(cleaned.replace('mm', ''));
          if (!isNaN(num)) return num;
        }

        // Try plain number (assume mm if large, cm if small)
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          return num < 100 ? num * 10 : num; // Assume cm if < 100
        }
      }

      // Fallback: parse from material name (e.g., "44x69mm 3000mm lang")
      const name = beamMaterial.materiaalnaam || '';
      const mmMatch = name.match(/(\d{3,4})mm\s*lang/i);
      if (mmMatch) {
        return parseInt(mmMatch[1], 10);
      }

      return null;
    })();
    if (!beamLength) return null;

    // Calculate remaining space
    // Warn ONLY if beam is shorter than wall (too short)
    if (beamLength < wallHeight) {
      const missingLength = wallHeight - beamLength;
      return {
        wallHeight,
        beamLength,
        missingLength,
        isMsg: true,
        isTooShort: true,
        materialName: beamMaterial.materiaalnaam || 'Gekozen balk'
      };
    }

    return null;
  }, [jobSlug, klus, gekozenMaterialen]);



  const handleComponentMaterialSelect = (compId: string, sectionKey: string, material: any) => {
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      // Store materials in a generic internal selection array: { sectionKey, material }
      const current = (comp.materials || []) as any[];
      // Remove existing for this section
      const others = current.filter((m: any) => m.sectionKey !== sectionKey);
      return { ...comp, materials: [...others, { sectionKey, material }] };
    }));
  };

  const handleComponentMaterialRemove = (compId: string, sectionKey: string) => {
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      const current = (comp.materials || []) as any[];
      return { ...comp, materials: current.filter((m: any) => m.sectionKey !== sectionKey) };
    }));
  };

  // Component Deletion Confirmation
  const [componentDeleteId, setComponentDeleteId] = useState<string | null>(null);

  const handleComponentDelete = (compId: string) => {
    setComponents(prev => prev.filter(c => c.id !== compId));
  };

  const getPresetMaterialsForType = useCallback((type: JobComponentType) => {
    const activePreset = presets.find(p => p.id === gekozenPresetId);
    if (!activePreset) return [];

    // 1. Try component templates (saved components in werkpakket)
    if (activePreset.components) {
      const template = activePreset.components.find((c: any) => c.type === type);
      if (template?.materials) return template.materials;
      if (template?.materiaalKeuzes) {
        return Object.entries(template.materiaalKeuzes).map(([key, mat]) => ({
          sectionKey: key,
          material: mat
        }));
      }
    }

    // 2. Fallback: match from global slots using COMPONENT_REGISTRY defaultMaterials
    const config = COMPONENT_REGISTRY[type];
    if (config?.defaultMaterials && activePreset.slots && alleMaterialen.length) {
      const materials: any[] = [];
      for (const section of config.defaultMaterials) {
        const matId = activePreset.slots[section.key];
        if (matId) {
          const found = alleMaterialen.find((m: any) => m.id === matId);
          if (found) materials.push({ sectionKey: section.key, material: found });
        }
      }
      if (materials.length > 0) return materials;
    }

    return [];
  }, [presets, gekozenPresetId, alleMaterialen]);

  // Safeguard state
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [presetConfirmOpen, setPresetConfirmOpen] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);

  const userHeeftPresetGewijzigdRef = useRef(false);
  const isHydratingRef = useRef(true);
  const hasSavedConfigRef = useRef(false);
  const autoApplyDefaultPresetRef = useRef(false);

  useEffect(() => setIsMounted(true), []);

  // Load User Preferences (Hidden Categories)
  useEffect(() => {
    if (!user || !firestore) return;
    const loadUserPrefs = async () => {
      try {
        const ref = doc(firestore, 'users', user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.hidden_categories) {
            setHiddenCategories(prev => ({ ...prev, ...data.hidden_categories }));
          }
        }
      } catch (e) {
        console.error("Error loading user prefs", e);
      }
    };
    loadUserPrefs();
  }, [user, firestore]);

  // Fetch Materials
  const fetchMaterials = useCallback(async () => {
    // Determine token for API call
    if (!user) return; // Wait for user
    setMaterialenLaden(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/materialen/get', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Fout bij ophalen');
      }

      const materialenData = (json.data || []).map((m: any) => ({
        ...m, // Keep all raw fields
        _raw: m, // Store exact raw object for pristine saving
        id: m.row_id || m.id,
        // Map keys to match UI expectations while keeping originals
        prijs: typeof m.prijs === 'number' ? m.prijs : (typeof m.prijs_incl_btw === 'number' ? m.prijs_incl_btw : (parseNLMoneyToNumber(m.prijs || m.prijs_incl_btw) || 0)),
        prijs_per_stuk: typeof m.prijs === 'number' ? m.prijs : (typeof m.prijs_incl_btw === 'number' ? m.prijs_incl_btw : (parseNLMoneyToNumber(m.prijs || m.prijs_incl_btw) || 0)),
        // Map standard keys for UI filtering
        categorie: m.categorie || m.subsectie || 'Overig',
        subsectie: m.subsectie || m.categorie || 'Overig',
        leverancier: m.merk || m.leverancier,
      }));

      setAlleMaterialen(materialenData);
    } catch (err) {
      console.error("Fetch materials error:", err);
      setFoutMaterialen('Kon materialen niet laden.');
    } finally {
      setMaterialenLaden(false);
    }
  }, [user]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  // Fetch Presets
  useEffect(() => {
    if (!user || !firestore) return;
    const fetchPresets = async () => {
      setPresetsLaden(true);
      try {
        const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const fetched = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.jobType === JOB_KEY);
        setPresets(fetched);
      } catch (e) { console.error(e); } finally { setPresetsLaden(false); }
    };
    fetchPresets();
  }, [user, firestore, JOB_KEY]);

  // Fetch per-component werkpakket presets
  useEffect(() => {
    if (!user || !firestore) return;
    const fetchComponentPresets = async () => {
      try {
        const q = query(collection(firestore, 'component_presets'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const grouped: Record<string, any[]> = {};
        snap.docs.forEach(d => {
          const data = { id: d.id, ...d.data() };
          const type = (data as any).componentType;
          if (!type) return;
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(data);
        });
        setComponentPresets(grouped);
      } catch (e) { console.error('Error fetching component presets:', e); }
    };
    fetchComponentPresets();
  }, [user, firestore]);

  const handleSaveComponentPreset = async (presetName: string, componentType: string, compId: string) => {
    if (!user || !firestore) return;
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    const presetData: any = {
      userId: user.uid,
      componentType,
      name: presetName,
      materials: JSON.parse(JSON.stringify(comp.materials || [])),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    const existing = (componentPresets[componentType] || []).find(
      (p: any) => p.name.trim().toLowerCase() === presetName.trim().toLowerCase()
    );
    const docRef = existing ? doc(firestore, 'component_presets', existing.id) : doc(collection(firestore, 'component_presets'));
    if (existing) delete presetData.createdAt;
    await setDoc(docRef, presetData, { merge: true });
    const saved = { id: docRef.id, ...presetData };
    setComponentPresets(prev => {
      const list = (prev[componentType] || []).filter(p => p.id !== docRef.id);
      return { ...prev, [componentType]: [...list, saved] };
    });
    return saved;
  };

  const handleApplyComponentPreset = (presetId: string, componentType: string, compId: string) => {
    const preset = (componentPresets[componentType] || []).find((p: any) => p.id === presetId);
    if (!preset?.materials) return;
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      return { ...comp, materials: JSON.parse(JSON.stringify(preset.materials)) };
    }));
  };

  // Favorites
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    try {
      const saved = localStorage.getItem(`offertehulp:favorieten:${user.uid}`);
      if (saved) setFavorieten(JSON.parse(saved));
    } catch (e) { console.error(e); }
  }, [user]);

  const toggleFavoriet = useCallback((id: string) => {
    if (!user) return;
    setFavorieten((prev) => {
      let next;
      if (prev.includes(id)) next = prev.filter((fid) => fid !== id);
      else next = [...prev, id];
      localStorage.setItem(`offertehulp:favorieten:${user.uid}`, JSON.stringify(next));
      return next;
    });
  }, [user]);

  // Merge favorites into materials for the modal
  const enrichedMaterials = useMemo(() => {
    return alleMaterialen.map(m => ({
      ...m,
      isFavorite: favorieten.includes(m.id)
    }));
  }, [alleMaterialen, favorieten]);

  // Hydrate from Firestore
  useEffect(() => {
    if (!firestore || !quoteId || !klusId) return;
    const hydrate = async () => {
      setPaginaLaden(true);
      try {
        const snap = await getDoc(doc(firestore, 'quotes', quoteId));
        if (!snap.exists()) return;
        const data = snap.data();
        const klusNode = data?.klussen?.[klusId];


        if (klusNode) setKlus(klusNode as unknown as Job);

        const maatwerkNode = klusNode?.maatwerk;
        const materialenLijstNode = klusNode?.materialen?.materialen_lijst || {};

        // Reconstruct components from maatwerk.toevoegingen + materialen_lijst
        const toevoegingen = maatwerkNode?.toevoegingen || [];
        let currentComponents: JobComponent[];

        if (Array.isArray(toevoegingen) && toevoegingen.length > 0) {
          currentComponents = toevoegingen.map((t: any, idx: number) => {
            const compId = t.id || `toevoeging_${idx}`;

            // Reconstruct materials from materialen_lijst entries with comp_ prefix
            const compMaterials: any[] = [];
            Object.entries(materialenLijstNode).forEach(([key, entry]: [string, any]) => {
              if (key.startsWith(`comp_${compId}_`)) {
                compMaterials.push({
                  sectionKey: entry.sectionKey,
                  material: entry.material,
                });
              }
            });

            return {
              id: compId,
              type: t.type,
              label: t.label,
              measurements: t.afmetingen || {},
              materials: compMaterials,
              slug: t.slug,
            } as JobComponent;
          });
        } else if (Array.isArray(klusNode?.components) && klusNode.components.length > 0) {
          // Fallback: legacy components field for old data
          currentComponents = klusNode.components;
        } else {
          currentComponents = [];
        }

        // Sync Openings from Measurement Data
        const maatwerkItems = (maatwerkNode && typeof maatwerkNode === 'object' && !Array.isArray(maatwerkNode))
          ? (maatwerkNode.basis || maatwerkNode.items || [])
          : (klusNode?.[`${jobSlug}_maatwerk`] || (Array.isArray(maatwerkNode) ? maatwerkNode : []));
        if (Array.isArray(maatwerkItems)) {
          const openings = maatwerkItems.flatMap((item: any) => item.openings || []);

          const newComponents = [...currentComponents];
          let hasChanges = false;

          openings.forEach((op: any) => {
            if (!op.id) return;

            // Map types
            let compType: JobComponentType | null = null;
            let labelPrefix = 'Opening';
            let slug = 'zelfgemaakte-kozijnen'; // Default generic slug

            if (op.type === 'window') {
              compType = 'kozijn';
              labelPrefix = 'Raamkozijn';
              slug = 'zelfgemaakte-kozijnen';
            }
            else if (op.type === 'door-frame' || op.type === 'frame-inner' || op.type === 'frame-outer') {
              compType = 'kozijn';

              if (op.type === 'frame-inner') {
                labelPrefix = 'Binnenkozijn';
                // Map to the specific slug for inner frames. 
                // We use 'binnen-kozijn-hout' as a default timber frame for indoor
                slug = 'binnen-kozijn-hout';
              } else if (op.type === 'frame-outer') {
                labelPrefix = 'Buitenkozijn';
                slug = 'buiten-kozijn-hout';
              } else {
                labelPrefix = 'Deurkozijn';
                slug = 'zelfgemaakte-kozijnen';
              }
            }
            else if (op.type === 'door') {
              compType = 'deur';
              labelPrefix = 'Deur';
              slug = 'binnendeur-afhangen';
            }

            if (compType) {

              const existingIdx = newComponents.findIndex(c => c.id === op.id);

              // Robust dimension extraction
              const w = op.width || op.breedte || op.lengte || op.openingWidth || 0;
              const h = op.height || op.hoogte || op.openingHeight || 0;
              const dimensionLabel = `${w}x${h} mm`;

              if (existingIdx === -1) {
                // Create new
                newComponents.push({
                  id: op.id,
                  type: compType,
                  label: `${labelPrefix} - ${dimensionLabel}`,
                  measurements: { breedte: w, hoogte: h, lengte: w }, // Pre-fill
                  slug: slug,
                  meta: {
                    source: 'opening',
                    openingType: op.type,
                    dimensions: dimensionLabel,
                    width: w,
                    height: h
                  }
                });
                hasChanges = true;
              } else {
                // Update meta/label if needed (sync drift)
                const existing = newComponents[existingIdx];
                if (existing.label !== `${labelPrefix} - ${dimensionLabel}`) {
                  newComponents[existingIdx] = {
                    ...existing,
                    label: `${labelPrefix} - ${dimensionLabel}`,
                    meta: { ...existing.meta, dimensions: dimensionLabel, openingType: op.type, width: w, height: h }
                  };
                  hasChanges = true;
                }
              }

              // --- DAGKANT LOGIC ---
              const dagkantId = `${op.id}_dagkant`;
              const dagkantIdx = newComponents.findIndex(c => c.id === dagkantId);

              if (op.dagkanten) {
                // Should have a dagkant component
                const diepte = op.dagkantenDiepte || op.dagkantDiepte || 0;
                const stroken = buildDagkantStroken(op.type, w, h, diepte);

                if (dagkantIdx === -1) {
                  newComponents.push({
                    id: dagkantId,
                    type: 'dagkant',
                    label: `Dagkant ${labelPrefix} - ${dimensionLabel}`,
                    measurements: {
                      diepte,
                      stroken
                    },
                    slug: 'dagkanten',
                    meta: {
                      source: 'opening_dagkant',
                      parentId: op.id,
                      openingType: op.type,
                      dimensions: dimensionLabel
                    }
                  });
                  hasChanges = true;
                } else {
                  // Update existing dagkant - always sync measurements and stroken
                  const existing = newComponents[dagkantIdx];
                  const labelChanged = existing.label !== `Dagkant ${labelPrefix} - ${dimensionLabel}`;
                  const diepteChanged = existing.measurements?.diepte !== diepte;

                  if (labelChanged || diepteChanged) {
                    newComponents[dagkantIdx] = {
                      ...existing,
                      label: `Dagkant ${labelPrefix} - ${dimensionLabel}`,
                      measurements: {
                        diepte,
                        stroken
                      },
                      meta: { ...existing.meta, dimensions: dimensionLabel, openingType: op.type }
                    };
                    hasChanges = true;
                  }
                }
              } else {
                // Should NOT have a dagkant component
                if (dagkantIdx !== -1) {
                  newComponents.splice(dagkantIdx, 1);
                  hasChanges = true;
                }
              }
            }
          });

          if (hasChanges) currentComponents = newComponents;
        }

        setComponents(currentComponents);

        if (klusNode?.materialen) {
          const mat = klusNode.materialen;
          // Prefer new structure 'materialen_lijst'
          const materialenLijst = mat.materialen_lijst || {};

          // Separate standard selections from custom groups based on known section keys vs arbitrary keys
          // We can use the fact that custom groups usually have 'title' and 'order' saved, while standard ones don't (or don't need them)
          // OR simply: use the active sections logic to pick out standard ones.

          const newGekozen: Record<string, any> = {};
          const newCustomGroupsMap: Record<string, any> = {};

          // Helper to identify standard keys
          // We'll trust that standard keys are specific slugs (not uuids). 
          // But to be robust, let's look at the structure.
          // Custom items we saved have { title, order, ... }
          // Standard items { materiaalnaam, ... }

          // Fallback to old 'selections' and 'custommateriaal' if 'materialen_lijst' is empty/missing
          // (Legacy support for existing quotes)
          if (Object.keys(materialenLijst).length === 0 && (mat.selections || mat.custommateriaal)) {
            Object.assign(newGekozen, mat.selections || {});
            Object.assign(newCustomGroupsMap, mat.custommateriaal || {});

            // Legacy legacy support
            const legacyExtra = mat.extraMaterials || [];
            if (Array.isArray(legacyExtra) && legacyExtra.length > 0) {
              legacyExtra.forEach((m: any, idx: number) => {
                const gid = `legacy_${m.id}_${idx}`;
                newCustomGroupsMap[gid] = {
                  id: m.id,
                  title: m.materiaalnaam || 'Extra',
                  order: 9000 + idx
                };
              });
            }
          } else {
            // New structure distribution
            Object.entries(materialenLijst).forEach(([key, val]: [string, any]) => {
              // If it has a 'title' (Group title) and isn't just a material title, it's likely a custom group
              // Standard selections don't need 'title' saved (we know the section label).
              // Custom selections save 'title' as the Name of the group.
              // ALSO: Standard keys match the section slugs. Custom keys are UUIDs.
              // Let's assume keys starting with 'custom_' or being UUIDs are custom? 
              // Support for new nested structure with sectionKey
              if (val.material && val.sectionKey) {
                // It's a standard selection in the new format
                newGekozen[val.sectionKey] = val.material;
              }
              // Support for custom groups (check for title/order)
              else if (val.order !== undefined || val.title) {
                newCustomGroupsMap[key] = val;
              }
              // Fallback for legacy standard selections (flat structure)
              else {
                newGekozen[key] = val;
              }
            });
          }

          setGekozenMaterialen(newGekozen);
          setFirestoreCustommateriaal(newCustomGroupsMap);
          hasSavedConfigRef.current = true;
        }
        if (klusNode?.werkwijze?.workMethodId) setGekozenPresetId(klusNode.werkwijze.workMethodId);
        if (klusNode?.kleinMateriaal) setKleinMateriaalConfig(klusNode.kleinMateriaal);
        if (klusNode?.uiState?.collapsedSections) setCollapsedSections(klusNode.uiState.collapsedSections);

        // Auto-unhide categories if relevant components exist (Step Id: 181)
        let loadedHidden = klusNode?.uiState?.hiddenCategories || {};

        // If we are applying a preset later, that preset might hide things. 
        // But here we are just hydrating.

        currentComponents.forEach(comp => {
          let cat: string | null = null;
          if (comp.type === 'kozijn') cat = 'Kozijnen';
          else if (comp.type === 'deur') cat = 'Deuren';
          else if (comp.type === 'dagkant') cat = 'Dagkant';
          else if (comp.type === 'vensterbank') cat = 'Vensterbank';
          else if (comp.type === 'vlizotrap') cat = 'Toegang';

          if (cat) loadedHidden[cat] = false; // Force show
        });

        // Merge job-specific hidden states with any global preferences already loaded
        setHiddenCategories(prev => ({ ...prev, ...loadedHidden }));

        if (klusNode?.material_notities) setNotities(klusNode.material_notities);
        isHydratingRef.current = false;
      } catch (e) { console.error(e); }
      finally { setPaginaLaden(false); }
    };
    hydrate();
  }, [firestore, quoteId, klusId, jobSlug]);

  // Full Object Mapping
  useEffect(() => {
    if (!alleMaterialen.length || isHydratingRef.current) return;
    setGekozenMaterialen(prev => {
      const next: any = {};
      let changed = false;
      Object.keys(prev).forEach(k => {
        const val = prev[k];
        // Only try to link back if we have an ID.
        // If we don't have an ID (new clean format), we just use the preserved values.
        if (val && val.id && !val.materiaalnaam) {
          const found = alleMaterialen.find(m => m.id === val.id);
          if (found) { next[k] = found; changed = true; }
          else next[k] = val;
        } else {
          next[k] = val;
        }
      });
      return changed ? next : prev;
    });
  }, [alleMaterialen]);

  // Build Custom Groups
  useEffect(() => {
    if (isHydratingRef.current) return;
    if (!firestoreCustommateriaal) return;

    const hasBrokenItems = customGroups.some((g) =>
      g.materials.some((m: any) => m.materiaalnaam === '(onbekend)')
    );

    if (customGroups.length > 0 && !hasBrokenItems) return;

    const built = bouwCustomGroupsUitFirestore(firestoreCustommateriaal, alleMaterialen);
    setCustomGroups(built);
  }, [firestoreCustommateriaal, alleMaterialen, customGroups.length]);

  // Auto Preset
  useEffect(() => {
    if (isPaginaLaden || isPresetsLaden || !presets.length || userHeeftPresetGewijzigdRef.current || hasSavedConfigRef.current || gekozenPresetId !== 'default') return;
    if (customGroups.length > 0) return;

    const defaultPreset = presets.find((p) => p.isDefault) || presets.find((p) => (p.name || '').toLowerCase().includes('standaard'));
    if (defaultPreset) {
      autoApplyDefaultPresetRef.current = true;
      setGekozenPresetId(defaultPreset.id);
    }
  }, [isPresetsLaden, presets, gekozenPresetId, customGroups.length, isPaginaLaden]);


  // Apply Preset Logic
  useEffect(() => {
    if (gekozenPresetId === 'default') {
      if (userHeeftPresetGewijzigdRef.current) {
        setGekozenMaterialen({});
        setCollapsedSections({});
        setHiddenCategories({});
        // extraMaterials removed
        setCustomGroups([]);
        setFirestoreCustommateriaal(null);
        setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null });
        setComponents([]);
        setIsApplyingPreset(false); // Reset loading state
      }
      return;
    }
    if (!alleMaterialen.length) return;
    const preset = presets.find(p => p.id === gekozenPresetId);
    if (!preset) return;
    // Only apply if: user explicitly changed it OR hydrating is done + auto-apply triggers
    if (!userHeeftPresetGewijzigdRef.current && isHydratingRef.current === false && !autoApplyDefaultPresetRef.current) return;

    // ✅ Lock UI while applying
    setIsApplyingPreset(true);

    // Small timeout to allow UI to show loading state if needed, and ensure processing happens
    setTimeout(() => {
      const newSels: any = {};
      if (preset.slots) {
        Object.keys(preset.slots).forEach(key => {
          const matId = preset.slots[key];
          const found = alleMaterialen.find(m => m.id === matId);
          if (found) newSels[key] = found;
        });
      }
      setGekozenMaterialen(newSels);
      if (preset.collapsedSections) setCollapsedSections(preset.collapsedSections);

      // Handle components (Kozijnen, Deuren, etc.)
      // Merge preset components with existing ones (from measurements/openings)
      let finalComponents = [...components];
      if (preset.components && Array.isArray(preset.components) && preset.components.length > 0) {
        const existingIds = new Set(components.map(c => c.id));
        const existingTypes = new Set(components.map(c => c.type));
        const toAdd = preset.components.filter((pc: JobComponent) => {
          // Skip if exact ID already exists (e.g. re-applying same preset)
          if (existingIds.has(pc.id)) return false;
          // Skip if a component of this type already exists from measurements (opening-derived)
          // but only for types that are typically derived from openings (kozijn, deur, dagkant)
          const openingDerivedTypes = ['kozijn', 'deur', 'dagkant'];
          if (openingDerivedTypes.includes(pc.type) && existingTypes.has(pc.type)) return false;
          return true;
        }).map((pc: JobComponent) => {
          // Clear measurements so the user is forced to re-enter them for this job.
          // Preset defines WHAT components are needed, not the dimensions.
          const config = COMPONENT_REGISTRY[pc.type];
          const hasRequiredMeasurements = config?.measurements?.some((f: any) => !f.optional && f.type === 'number');
          if (hasRequiredMeasurements) {
            const cleared: JobComponent = {
              ...pc,
              id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2),
              measurements: {},
              [`measurements_${pc.type}`]: {},
            };
            return cleared;
          }
          return { ...pc, id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2) };
        });
        if (toAdd.length > 0) {
          finalComponents = [...finalComponents, ...toAdd];
          setComponents(finalComponents);
        }
      }

      // Calculate hidden categories - Ensure active component categories are visible
      const newHidden = preset.hiddenCategories ? { ...preset.hiddenCategories } : {};

      finalComponents.forEach(comp => {
        let cat: string | null = null;
        if (comp.type === 'kozijn') cat = 'Kozijnen';
        else if (comp.type === 'deur') cat = 'Deuren';
        else if (comp.type === 'dagkant') cat = 'Dagkant';
        else if (comp.type === 'vensterbank') cat = 'Vensterbank';
        else if (comp.type === 'vlizotrap') cat = 'Toegang';
        else if (comp.type === 'leidingkoof') cat = 'Koof';

        if (cat) newHidden[cat] = false; // Force show
      });

      setHiddenCategories(newHidden);


      // Unlock
      setIsApplyingPreset(false);
      autoApplyDefaultPresetRef.current = false; // Reset trigger
    }, 100);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gekozenPresetId, presets, alleMaterialen]); // intentionally exclude components to prevent infinite loop when resetting to 'default'


  // Fail-safe: Ensure categories with components are always visible
  // This overrides any preset trying to hide them
  useEffect(() => {
    if (components.length === 0) return;

    setHiddenCategories(prev => {
      const next = { ...prev };
      let changed = false;

      components.forEach(comp => {
        let cat: string | null = null;
        if (comp.type === 'kozijn') cat = 'Kozijnen';
        else if (comp.type === 'deur') cat = 'Deuren';
        else if (comp.type === 'dagkant') cat = 'Dagkant';
        else if (comp.type === 'vensterbank') cat = 'Vensterbank';
        else if (comp.type === 'vlizotrap') cat = 'Toegang';
        else if (comp.type === 'installatie') cat = 'Installatie';
        else if (comp.type === 'gips') cat = 'gips_afwerking';

        // If currently hidden (true), unhide it (false)
        if (cat && next[cat] === true) {
          next[cat] = false;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components]); // intentionally exclude hiddenCategories to prevent infinite loop

  // Handlers
  const onPresetChange = (val: string) => {
    // If user has manually selected materials (and it's not just the default empty state or same preset), warn them.
    const hasSelections = Object.keys(gekozenMaterialen).length > 0 || customGroups.length > 0;
    if (hasSelections && val !== gekozenPresetId) {
      setPendingPresetId(val);
      setPresetConfirmOpen(true);
    } else {
      applyPresetChange(val);
    }
  };

  const applyPresetChange = (val: string) => {
    setIsApplyingPreset(true); // Immediate lock to prevent race conditions
    userHeeftPresetGewijzigdRef.current = true;
    autoApplyDefaultPresetRef.current = false;
    setGekozenPresetId(val);
    setPresetConfirmOpen(false);
    setPendingPresetId(null);
  };

  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleCategoryVisibility = (categoryKey: string) => {
    setHiddenCategories(prev => {
      const nextHidden = !prev[categoryKey];
      const newState = { ...prev, [categoryKey]: nextHidden };

      // Persist to Firestore if user is logged in
      if (user && firestore) {
        const ref = doc(firestore, 'users', user.uid);
        setDoc(ref, {
          hidden_categories: { [categoryKey]: nextHidden }
        }, { merge: true }).catch(console.error);
      }

      return newState;
    });
  };
  const openMateriaalKiezer = (sectieKey: string, groupId: string | null = null) => { setActieveSectie(sectieKey); setActiveGroupId(groupId); setIsExtraModalOpen(true); };
  const handleMateriaalSelectie = (key: string, materiaal: any) => { setGekozenMaterialen(prev => ({ ...prev, [key]: materiaal })); };
  const handleMateriaalVerwijderen = (key: string) => { setGekozenMaterialen(prev => { const n = { ...prev }; delete n[key]; return n; }); };

  const suggestBetterBeam = useCallback((sectionKey: string) => {
    if (!beamHeightWarning || !alleMaterialen.length) return;

    const targetHeight = beamHeightWarning.wallHeight;
    const currentName = beamHeightWarning.materialName || '';

    // Heuristic: Extract "NNxNN" (dimensions) from current name to find similar beams
    const dimRegex = /(\d+)[xX](\d+)/;
    const match = currentName.match(dimRegex);
    let candidates = alleMaterialen;

    if (match) {
      const dimStr = match[0]; // e.g. "38x89"
      candidates = candidates.filter(m => (m.materiaalnaam || '').includes(dimStr));
    } else {
      // Fallback: if 'SLS' in name, filter for SLS
      if (currentName.toLowerCase().includes('sls')) {
        candidates = candidates.filter(m => (m.materiaalnaam || '').toLowerCase().includes('sls'));
      }
    }

    // Find valid lengths
    const validOptions = candidates.map(m => {
      const len = getMaterialLength(m);
      return { material: m, length: len };
    }).filter(item => item.length !== null && item.length >= targetHeight);

    // Sort: Smallest sufficient length first (best fit), then price
    validOptions.sort((a, b) => {
      const lenDiff = a.length! - b.length!;
      if (lenDiff !== 0) return lenDiff;
      // Price low to high
      const pA = typeof a.material.prijs === 'number' ? a.material.prijs : 0;
      const pB = typeof b.material.prijs === 'number' ? b.material.prijs : 0;
      return pA - pB;
    });

    const best = validOptions[0];

    if (best) {
      handleMateriaalSelectie(sectionKey, best.material);
      toast({
        title: "Balk aangepast",
        description: `Geselecteerd: ${best.material.materiaalnaam} (${best.length}mm)`,
        duration: 3000
      });
    } else {
      toast({
        variant: "destructive",
        title: "Geen geschikte balk gevonden",
        description: `Geen standaard balk gevonden langer dan ${targetHeight}mm.`,
        duration: 4000
      });
    }
  }, [beamHeightWarning, alleMaterialen, handleMateriaalSelectie, toast]);

  // --- RENDERERS ---

  const renderKleinMateriaalSectie = () => {
    const { mode, percentage, fixedAmount } = kleinMateriaalConfig;

    const isHidden = hiddenCategories['klein_materiaal'];

    // Calculate Summary Text
    let summaryText = null;
    if (mode === 'inschatting') summaryText = "Automatische Inschatting";
    else if (mode === 'percentage') summaryText = `Percentage: ${percentage ?? 0}%`;
    else if (mode === 'fixed') summaryText = `Vast bedrag: ${formatNlMoneyFromNumber(fixedAmount)}`;
    else if (mode === 'none') summaryText = "Geen klein materiaal";

    return (
      <div className="mt-8 rounded-xl border border-border/60 bg-card/30 overflow-hidden shadow-sm">
        {/* Header Section - Now Clickable/Toggleable */}
        <div
          onClick={() => toggleCategoryVisibility('klein_materiaal')}
          className="px-5 py-4 border-b border-border/50 bg-muted/20 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors group select-none"
        >
          <div className="flex-1">
            <h2 className={cn(
              "text-sm font-bold flex items-center gap-2 uppercase tracking-wide transition-colors",
              isHidden ? "text-muted-foreground" : "text-foreground"
            )}>
              <Calculator className={cn("h-4 w-4", isHidden ? "text-muted-foreground" : "text-emerald-500")} />
              Automatische Klein Materiaal Berekening
              {isHidden && summaryText && (
                <span className={cn(
                  "ml-3 text-[10px] px-2 py-0.5 rounded-full font-medium normal-case tracking-normal border animate-in fade-in slide-in-from-left-2",
                  mode === 'none'
                    ? "bg-muted text-muted-foreground border-border"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                )}>
                  Ingesteld: {summaryText}
                </span>
              )}
            </h2>
            {!isHidden && (
              <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-top-1">
                Dit dekt schroeven, pluggen, tape en ander klein bevestigingsmateriaal dat u niet individueel hoeft te specificeren.
              </p>
            )}
          </div>

          <div
            className="p-1.5 rounded-md text-muted-foreground group-hover:text-foreground transition-colors ml-4"
            title={isHidden ? "Toon sectie" : "Verberg sectie"}
          >
            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {/* Content Section - Conditionally Rendered */}
        {!isHidden && (
          <div className="p-5 space-y-6 animate-in slide-in-from-top-2 duration-200">

            {/* Recommended Option */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Aanbevolen</label>
              <div
                onClick={() => {
                  setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null });
                  setKleinVastBedragStr('');
                }}
                className={cn(
                  "relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer group",
                  mode === 'inschatting'
                    ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm"
                    : "border-border/60 hover:border-emerald-500/30 hover:bg-accent/40 bg-background/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 p-2 rounded-lg transition-colors",
                  mode === 'inschatting' ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground group-hover:text-emerald-500"
                )}>
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    Automatische Inschatting
                    {mode === 'inschatting' && <CheckCircle2 className="h-4 w-4 text-emerald-600 animate-in zoom-in-50 duration-200" />}
                  </div>

                  {/* Trust explanation - ONLY visible when selected */}
                  {mode === 'inschatting' ? (
                    <p className="text-xs text-muted-foreground/90 leading-relaxed animate-in fade-in slide-in-from-top-1">
                      Klein materiaal automatisch meeberekenen op basis van klusomvang.
                      <br /><span className="opacity-75">Zorgt voor een correcte dekking van kleinverbruik.</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
                      Automatisch klein materiaal en verbruiksartikelen meenemen.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Alternatives */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Handmatige Alternatieven</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKleinMateriaalConfig((p: any) => ({ ...p, mode: 'percentage' }))}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'percentage'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-border/60 bg-background/50 hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  Percentage
                </button>

                <button
                  type="button"
                  onClick={() => setKleinMateriaalConfig((p: any) => ({ ...p, mode: 'fixed' }))}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'fixed'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-border/60 bg-background/50 hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  Vast bedrag
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setKleinMateriaalConfig({ mode: 'none', percentage: null, fixedAmount: null });
                    setKleinVastBedragStr('');
                  }}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'none'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-transparent bg-transparent text-muted-foreground/70 hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  Geen
                </button>


                {/* Inline Inputs - Conditional Rendering */}
                {mode === 'percentage' && (
                  <div className="flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="relative w-24">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        className="pr-7 h-9 text-sm"
                        value={percentage ?? ''}
                        onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: e.target.value ? Number(e.target.value) : null })}
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground text-xs pointer-events-none">%</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">van materiaalkosten</span>
                  </div>
                )}

                {mode === 'fixed' && (
                  <div className="flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="w-32">
                      <EuroInput
                        id="km-fixed-input"
                        value={kleinVastBedragStr}
                        placeholder="0,00"
                        // autoFocus // Can be annoying if switching quickly, but helpful for immediate entry
                        onChange={(v: string) => {
                          setKleinVastBedragStr(v);
                          setKleinMateriaalConfig({ ...kleinMateriaalConfig, fixedAmount: parseNLMoneyToNumber(v) });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Percentage Clarification Text */}
              {mode === 'percentage' && (
                <p className="text-xs text-muted-foreground/80 leading-relaxed pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  Dit percentage wordt berekend over de <strong>totale materiaalkosten</strong> van deze klus (excl. arbeid & transport).
                </p>
              )}
            </div>

          </div>
        )}
      </div>
    );
  };

  const handleSavePreset = async (presetName: string, isDefault: boolean, existingId?: string) => {
    if (!user || !firestore) return;
    const slots: Record<string, string> = {};
    for (const key of Object.keys(gekozenMaterialen || {})) {
      const materiaal = (gekozenMaterialen as any)[key];
      if (materiaal?.id) slots[key] = materiaal.id;
    }
    // Also save component material selections into slots for werkpakket auto-fill
    for (const comp of components) {
      if (comp.materials) {
        for (const m of comp.materials as any[]) {
          if (m.sectionKey && m.material?.id && !slots[m.sectionKey]) {
            slots[m.sectionKey] = m.material.id;
          }
        }
      }
    }
    const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);
    const newPresetData: any = {
      userId: user.uid,
      jobType: JOB_KEY,
      name: presetName,
      isDefault,
      slots: slots,
      collapsedSections,
      hiddenCategories,
      kleinMateriaalConfig,
      custommateriaal: customMap,
      components: JSON.parse(JSON.stringify(components)), // FIX: Save components (kozijnen, deuren, etc.)
      updatedAt: serverTimestamp(),
    };
    if (!existingId) newPresetData.createdAt = serverTimestamp();
    const batch = writeBatch(firestore);
    if (isDefault) {
      const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid), where('jobType', '==', JOB_KEY), where('isDefault', '==', true));
      try { const qs = await getDocs(q); qs.forEach((d) => { if (d.id !== existingId) batch.update(d.ref, { isDefault: false }); }); } catch (e) { console.error("Error clearing defaults", e); }
    }
    const docRef = existingId ? doc(firestore, 'presets', existingId) : doc(collection(firestore, 'presets'));
    batch.set(docRef, newPresetData, { merge: true });
    try {
      await batch.commit();
      const action = existingId ? 'bijgewerkt' : 'opgeslagen';
      toast({ title: `Werkpakket ${action}`, description: `Werkpakket "${presetName}" is succesvol ${action}.` });
      const newPreset = { id: docRef.id, ...newPresetData };
      setPresets((prev) => {
        const filtered = prev.filter((p) => p.id !== docRef.id);
        const updatedList = filtered.map((p) => ({ ...p, isDefault: isDefault ? false : p.isDefault }));
        return [...updatedList, newPreset];
      });
      setGekozenPresetId(docRef.id);
    } catch (error: any) { console.error("Preset save error", error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkpakket niet opslaan.' }); }
  };

  const handleSetDefaultPreset = async (presetToSet: any) => {
    if (!user || !firestore || presetToSet.isDefault) return;
    const batch = writeBatch(firestore);
    const currentDefault = presets.find((p) => p.isDefault);
    if (currentDefault) batch.update(doc(firestore, 'presets', currentDefault.id), { isDefault: false });
    batch.update(doc(firestore, 'presets', presetToSet.id), { isDefault: true });
    try {
      await batch.commit();
      toast({ title: 'Standaard ingesteld', description: `"${presetToSet.name}" is nu het standaard werkpakket.` });
      setPresets((prev) => prev.map((p) => ({ ...p, isDefault: p.id === presetToSet.id })));
    } catch (error) { console.error('Fout bij instellen standaard werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon het standaard werkpakket niet instellen.' }); }
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete || !firestore) return;
    const docRef = doc(firestore, 'presets', presetToDelete.id);
    try {
      await deleteDoc(docRef);
      toast({ title: 'Werkpakket verwijderd', description: `Het werkpakket "${presetToDelete.name}" is verwijderd.` });
      setPresets((prev) => prev.filter((p) => p.id !== presetToDelete.id));
      if (gekozenPresetId === presetToDelete.id) setGekozenPresetId('default');
    } catch (error) { console.error('Fout bij verwijderen werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkpakket niet verwijderen.' }); }
    finally { setDeleteConfirmationOpen(false); setPresetToDelete(null); setManagePresetsModalOpen(false); }
  };

  const saveToFirestore = async (options: { navigateTo?: string, silent?: boolean } = {}) => {
    if (!user || !firestore) return;

    if (!options.silent) setIsOpslaan(true);
    else setIsAutosaving(true);

    try {
      // === UPDATE BEAM DIMENSIONS FROM STAANDERS & LIGGERS MATERIAL ===
      // Find the selected staanders & liggers material and update calculatedData.beams
      let updatedMaatwerkData: { key: string; items: any[] } | null = null;
      const staandersKeys = ['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'];
      let staandersMaterial: any = null;
      for (const key of staandersKeys) {
        if (gekozenMaterialen[key]) {
          staandersMaterial = gekozenMaterialen[key]._raw || gekozenMaterialen[key];
          break;
        }
      }

      // If we have a staanders material with dimensions, update the beams
      if (staandersMaterial) {
        // Parse dimensions from material (dikte = thickness, breedte = width)
        const parseDimension = (val: any): number | null => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const num = parseFloat(val.replace(',', '.'));
            return isNaN(num) ? null : num;
          }
          return null;
        };

        const dikte = parseDimension(staandersMaterial.dikte);
        const breedte = parseDimension(staandersMaterial.breedte);

        // If we have valid dimensions, update the beams in Firestore
        if ((dikte !== null || breedte !== null) && klus) {
          // Get the maatwerk key for this job
          const maatwerkKey = `${jobSlug}_maatwerk`;
          const maatwerkItems = (klus as any)?.[maatwerkKey] || [];

          if (Array.isArray(maatwerkItems) && maatwerkItems.length > 0) {
            const updatedMaatwerkItems = maatwerkItems.map((item: any) => {
              if (item.calculatedData?.beams && Array.isArray(item.calculatedData.beams)) {
                const updatedBeams = item.calculatedData.beams.map((beam: any) => ({
                  ...beam,
                  // wMm is width of beam (use breedte), keep original if not set
                  wMm: breedte ?? beam.wMm,
                  // Store dikte as reference
                  dikteMm: dikte ?? beam.dikteMm,
                  // Also store the material source for AI context
                  materialSource: staandersMaterial.materiaalnaam || 'selected material'
                }));
                return {
                  ...item,
                  calculatedData: {
                    ...item.calculatedData,
                    beams: updatedBeams
                  }
                };
              }
              return item;
            });

            // Store the updated maatwerk items for later use in updatePayload
            updatedMaatwerkData = { key: maatwerkKey, items: updatedMaatwerkItems };
          }
        }
      }
      // === END BEAM DIMENSION UPDATE ===

      // CLEANER SAVE STRUCTURE as requested:
      // 1. All materials in 'materialen_lijst' including custom ones.
      // 2. No flattening of components (they have their own list).
      // 3. No ID saved (supabase row_id).

      const materialenLijst: Record<string, any> = {};

      // 1. Unified Material Map Construction

      // A. Standard Selections (Base Job)
      Object.entries(gekozenMaterialen).forEach(([k, v]) => {
        if (k.startsWith('component_')) return;
        const cleaned = cleanMaterialData(v);
        if (cleaned) {
          materialenLijst[k] = {
            sectionKey: k,
            material: cleaned,
            context: JOB_TITEL
          };
        }
      });

      // B. Custom Groups (Extra Materials)
      const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);
      Object.entries(customMap).forEach(([gid, cm]: [string, any]) => {
        const cleaned = cleanMaterialData(cm);
        if (cleaned) {
          materialenLijst[gid] = {
            material: cleaned,
            title: cm.title,
            context: JOB_TITEL,
            type: 'custom_group'
          };
        }
      });

      // C. Component Materials (Rich Data & Labeled)
      // We both save them in the special list for AI AND keep them in the components for UI
      const mappedComponents = components.map(c => {
        const componentMaterials = (c.materials || []).map((m: any, idx: number) => {
          if (!m.material) return m;

          const cleaned = cleanMaterialData(m.material);
          if (cleaned) {
            // Push to main list for AI/Overview
            const globalKey = `comp_${c.id}_${m.sectionKey || idx}`;
            materialenLijst[globalKey] = {
              material: cleaned,
              sectionKey: m.sectionKey,
              context: c.label || c.type,
              type: 'component_material'
            };
          }

          return {
            sectionKey: m.sectionKey,
            material: cleaned
          };
        });

        return { ...c, materials: componentMaterials };
      });

      const maatwerkKey = `${jobSlug}_maatwerk`;
      const baseItems = updatedMaatwerkData ? updatedMaatwerkData.items : ((klus as any)?.[maatwerkKey] || (klus as any)?.maatwerk?.basis || (klus as any)?.maatwerk?.items || []);

      const updatePayload: any = {
        [`klussen.${klusId}.maatwerk`]: JSON.parse(JSON.stringify({
          basis: baseItems,
          toevoegingen: mappedComponents.map((c: any) => ({
            id: c.id,
            type: c.type,
            label: c.label,
            slug: c.slug,
            afmetingen: c.measurements || {}
          })),
          notities: notities ?? "",
          meta: (klus as any)?.maatwerk?.meta || undefined,
        })),
        [`klussen.${klusId}.components`]: deleteField(),
        [`klussen.${klusId}.materialen.jobKey`]: JOB_KEY,
        [`klussen.${klusId}.materialen.materialen_lijst`]: JSON.parse(JSON.stringify(materialenLijst)),
        [`klussen.${klusId}.materialen.savedByUid`]: user.uid,
        [`klussen.${klusId}.materialen.savedAt`]: serverTimestamp(),

        // CLEANUP: Removing old dirty/legacy fields
        [`klussen.${klusId}.${maatwerkKey}`]: deleteField(),
        [`klussen.${klusId}.materialen.selections`]: deleteField(),
        [`klussen.${klusId}.materialen.custommateriaal`]: deleteField(),
        [`klussen.${klusId}.materialen.extraMaterials`]: deleteField(),

        [`klussen.${klusId}.werkwijze`]: JSON.parse(JSON.stringify({
          workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
          savedByUid: user.uid
        })),
        [`klussen.${klusId}.uiState.collapsedSections`]: JSON.parse(JSON.stringify(collapsedSections ?? {})),
        [`klussen.${klusId}.uiState.hiddenCategories`]: JSON.parse(JSON.stringify(hiddenCategories ?? {})),
        [`klussen.${klusId}.material_notities`]: notities ?? "",
        [`klussen.${klusId}.updatedAt`]: serverTimestamp()
      };

      if (kleinMateriaalConfig.mode === 'none') {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = deleteField();
      } else {
        const cleanKlein: any = { mode: kleinMateriaalConfig.mode };
        if (kleinMateriaalConfig.mode === 'percentage' && kleinMateriaalConfig.percentage != null) {
          cleanKlein.percentage = kleinMateriaalConfig.percentage;
        } else if (kleinMateriaalConfig.mode === 'fixed' && kleinMateriaalConfig.fixedAmount != null) {
          cleanKlein.fixedAmount = kleinMateriaalConfig.fixedAmount;
        }
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = cleanKlein;
      }

      await updateDoc(doc(firestore, 'quotes', quoteId), updatePayload);

      if (options.navigateTo) {
        router.push(options.navigateTo);
      }

    } catch (e: any) {
      console.error(e);
      if (!options.silent) toast({ variant: 'destructive', title: "Fout bij opslaan", description: e.message });
    } finally {
      if (!options.silent) setIsOpslaan(false);
      else setIsAutosaving(false);
    }
  };

  // Autosave Effect
  useEffect(() => {
    if (!isMounted || isHydratingRef.current || isPaginaLaden) return;

    // Debounce save by 2 seconds
    const timer = setTimeout(() => {
      saveToFirestore({ silent: true });
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    gekozenMaterialen,
    // extraMaterials removed from deps
    customGroups,
    kleinMateriaalConfig,
    collapsedSections,
    hiddenCategories,

    gekozenPresetId,
    notities
  ]);

  const handleNext = async (e: React.MouseEvent) => {
    e.preventDefault();


    const hasMeasurements = jobConfig?.measurements && jobConfig.measurements.length > 0;
    const navigateTo = hasMeasurements
      ? `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`
      : `/offertes/${quoteId}/overzicht`;

    // Save to Firestore first (without navigation)
    await saveToFirestore({});

    // Collect all selected materials
    const allMaterials: any[] = [];
    const seenNames = new Set<string>();

    // 1. Standard selections from gekozenMaterialen
    Object.values(gekozenMaterialen).forEach((v: any) => {
      if (!v) return;
      const source = v._raw || v;
      const name = source.materiaalnaam || v.materiaalnaam;
      if (!name || seenNames.has(name)) return;
      seenNames.add(name);
      allMaterials.push(source);
    });

    // 2. Component materials
    components.forEach((comp) => {
      (comp.materials || []).forEach((m: any) => {
        const mat = m.material || m;
        const name = mat.materiaalnaam;
        if (!name || seenNames.has(name)) return;
        seenNames.add(name);
        allMaterials.push(mat);
      });
    });

    // Filter to those missing a price
    const missing = allMaterials.filter((m) => {
      const price = m.prijs_incl_btw ?? m.prijs ?? m.prijs_per_stuk ?? 0;
      const numPrice = typeof price === 'number' ? price : parseFloat(String(price)) || 0;
      return numPrice === 0;
    });

    if (missing.length > 0) {
      setMissingPriceItems(missing);
      setMissingPriceInputs({});
      setMissingPriceSaved({});
      setPendingNavigateTo(navigateTo);
      setShowMissingPriceDialog(true);
    } else {
      router.push(navigateTo);
    }
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    // Material page is now the first step after job selection — go back to category/job selection
    const hasOnlyOneItem = categoryConfig?.items?.length === 1;
    const backUrl = hasOnlyOneItem
      ? `/offertes/${quoteId}/klus/nieuw`
      : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`;
    saveToFirestore({ navigateTo: backUrl });
  };


  const handlePresetDeleteWrapper = (preset: any) => { setPresetToDelete(preset); setDeleteConfirmationOpen(true); };
  const handlePresetSetDefaultWrapper = (preset: any) => handleSetDefaultPreset(preset);

  // Page progress (not item completion)
  // This is the materials page, which is step 3 of 4 (after client info at 0%)
  // Client info (0%) -> Job selection (25%) -> Job details (50%) -> Materials (75%) -> Overview (100%)
  const pageProgress = 60;

  if (!isMounted) return null;

  return (
    <>
      <main className="relative min-h-screen bg-background flex flex-col">
        {/* HEADER - Consistent with other pages */}
        <WizardHeader
          title={JOB_TITEL}
          backLink={
            categoryConfig?.items?.length === 1
              ? `/offertes/${quoteId}/klus/nieuw`
              : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`
          }
          progress={pageProgress}
          quoteId={quoteId}
          rightContent={
            isPaginaLaden ? (
              <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
            ) : (
              <div className="flex items-center gap-2">
                <PersonalNotes quoteId={quoteId} context={`Materialen: ${JOB_TITEL}`} />
              </div>
            )
          }
        />

        {/* CONTENT */}
        <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full pb-6 space-y-6">
          {foutMaterialen && (<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{foutMaterialen}</div>)}

          {/* Helper: Main Job Measurements - REMOVED per user request */}

          {/* Preset Selector - Compact */}
          <div className="space-y-3 pb-8 mb-8 border-b border-border/60">
            <Label className="text-base font-semibold text-foreground/90">Kies Een Werkpakket</Label>
            <div className="flex items-center gap-2">
              <Select onValueChange={onPresetChange} value={gekozenPresetId} disabled={isPresetsLaden}>
                <SelectTrigger className="hover:bg-muted/40 h-10"><SelectValue placeholder="Kies..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem className={SELECT_ITEM_GREEN} value="default">Nieuw</SelectItem>
                  {presets.map(p => (<SelectItem className={SELECT_ITEM_GREEN} key={p.id} value={p.id}>{p.name} {p.isDefault ? '(standaard)' : ''}</SelectItem>))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setManagePresetsModalOpen(true)} disabled={presets.length === 0} className="h-10 w-10 rounded-xl shrink-0"><Settings className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Compact Checklist Structure */}
          <div className="space-y-6">
            {/* Use job-specific categoryConfig if available, otherwise fall back to MATERIAL_CATEGORY_INFO */}
            {(Object.entries(jobConfig?.categoryConfig || MATERIAL_CATEGORY_INFO) as [MaterialCategoryKey, any][])
              .sort(([keyA, a], [keyB, b]) => {
                // Check if this is a complex job with component injection sections
                const isComplexJob = (jobSlug.includes('hsb') || jobSlug.includes('metalstud') || jobSlug.includes('wand') || jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('plat'));
                const isCeilingJob = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');
                const isBoeiboordSection = (keyA === 'boeiboord' || (keyA as string).toLowerCase() === 'boeiboorden');
                const isVlizotrapSectionA = (keyA === 'Toegang' || keyA === 'Vliering_Toegang' || (keyA as string).toLowerCase().includes('vlizotrap') || (keyA as string).toLowerCase().includes('toegang'));
                const isVlizotrapSectionB = (keyB === 'Toegang' || keyB === 'Vliering_Toegang' || (keyB as string).toLowerCase().includes('vlizotrap') || (keyB as string).toLowerCase().includes('toegang'));

                const isAComponentSection = (isComplexJob && (
                  keyA === 'Kozijnen' || (keyA as string).toLowerCase() === 'kozijnen' ||
                  keyA === 'Deuren' || (keyA as string).toLowerCase() === 'deuren' ||
                  keyA === 'Koof' ||
                  (keyA === 'boeiboord' || (keyA as string).toLowerCase() === 'boeiboorden') ||
                  keyA === 'Installatie' || keyA === 'Schakelmateriaal' ||
                  keyA === 'Dagkant' || keyA === 'Vensterbank'
                )) || (isCeilingJob && (isVlizotrapSectionA || keyA === 'Koof' || keyA === 'Installatie' || keyA === 'Schakelmateriaal')) || (keyA === 'gips_afwerking');

                const isBComponentSection = (isComplexJob && (
                  keyB === 'Kozijnen' || (keyB as string).toLowerCase() === 'kozijnen' ||
                  keyB === 'Deuren' || (keyB as string).toLowerCase() === 'deuren' ||
                  keyB === 'Koof' ||
                  (keyB === 'boeiboord' || (keyB as string).toLowerCase() === 'boeiboorden') ||
                  keyB === 'Installatie' || keyB === 'Schakelmateriaal' ||
                  keyB === 'Dagkant' || keyB === 'Vensterbank'
                )) || (isCeilingJob && (isVlizotrapSectionB || keyB === 'Koof' || keyB === 'Installatie' || keyB === 'Schakelmateriaal')) || (keyB === 'gips_afwerking');

                // Push component sections to the end
                if (isAComponentSection && !isBComponentSection) return 1;
                if (!isAComponentSection && isBComponentSection) return -1;

                // Otherwise sort by order
                return a.order - b.order;
              })
              .map(([categoryKey, categoryInfo]) => {
                const sections = groupedSections[categoryKey] || [];
                if (sections.length === 0) return null;
                const isHidden = hiddenCategories[categoryKey];

                const isComplexJob = (jobSlug.includes('hsb') || jobSlug.includes('metalstud') || jobSlug.includes('wand') || jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('plat'));
                const isCeilingJob = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');
                const isKozijnenSection = (categoryKey === 'Kozijnen' || (categoryKey as string).toLowerCase() === 'kozijnen');
                const isDeurenSection = (categoryKey === 'Deuren' || (categoryKey as string).toLowerCase() === 'deuren');
                const isBoeiboordSection = (categoryKey === 'boeiboord' || (categoryKey as string).toLowerCase() === 'boeiboorden');
                const isVlizotrapSection = (categoryKey === 'Toegang' || categoryKey === 'Vliering_Toegang' || (categoryKey as string).toLowerCase().includes('vlizotrap') || (categoryKey as string).toLowerCase().includes('toegang'));
                const isLeidingkoofSection = categoryKey === 'Koof';
                const isInstallatieSection = categoryKey === 'Installatie' || categoryKey === 'Schakelmateriaal';
                const isDagkantSection = categoryKey === 'Dagkant';
                const isVensterbankSection = categoryKey === 'Vensterbank';
                const isGipsSection = categoryKey === 'gips_afwerking';

                let targetComponentType: JobComponentType | null = null;
                if (isKozijnenSection) targetComponentType = 'kozijn';
                else if (isDeurenSection) targetComponentType = 'deur';
                else if (isBoeiboordSection) targetComponentType = 'boeiboord';
                else if (isLeidingkoofSection) targetComponentType = 'leidingkoof';
                else if (isInstallatieSection) targetComponentType = 'installatie';
                else if (isDagkantSection) targetComponentType = 'dagkant';
                else if (isVensterbankSection) targetComponentType = 'vensterbank';
                else if (isVlizotrapSection) targetComponentType = 'vlizotrap';
                else if (isGipsSection) targetComponentType = 'gips';

                return (
                  <div key={categoryKey} className="space-y-2">
                    <div
                      onClick={(e) => {
                        if (targetComponentType) {
                          if (isHidden) toggleCategoryVisibility(categoryKey);

                          // Vlizotrap doesn't need measurements - add directly
                          if (targetComponentType === 'vlizotrap') {
                            const newVlizotrap = {
                              id: `vlizotrap-${Date.now()}`,
                              type: 'vlizotrap' as const,
                              label: 'Vlizotrap',
                              measurements: {},
                              materials: getPresetMaterialsForType('vlizotrap')
                            };
                            setComponents(prev => [...prev, newVlizotrap]);
                          } else if (targetComponentType === 'installatie') {
                            const newInstallatie = {
                              id: `installatie-${Date.now()}`,
                              type: 'installatie' as const,
                              label: 'Installatie & Elektra',
                              measurements: {},
                              materials: getPresetMaterialsForType('installatie')
                            };
                            setComponents(prev => [...prev, newInstallatie]);
                          } else if (targetComponentType === 'kozijn' || targetComponentType === 'deur' || targetComponentType === 'dagkant' || targetComponentType === 'vensterbank') {
                            // Automatically add if only one variant exists
                            let itemsForType: any[] = [];
                            if (targetComponentType === 'kozijn') itemsForType = JOB_REGISTRY.kozijnen.items;
                            else if (targetComponentType === 'deur') itemsForType = JOB_REGISTRY.deuren.items;
                            else if (targetComponentType === 'dagkant' || targetComponentType === 'vensterbank') {
                              itemsForType = JOB_REGISTRY.afwerkingen.items.filter(i => i.title.toLowerCase().includes(targetComponentType.toLowerCase()));
                            }

                            if (itemsForType.length === 1) {
                              const item = itemsForType[0];
                              const newItem = {
                                id: `${targetComponentType}-${Date.now()}`,
                                type: targetComponentType,
                                label: item.title,
                                slug: item.slug,
                                measurements: {},
                                materials: getPresetMaterialsForType(targetComponentType)
                              };
                              setComponents(prev => [...prev, newItem]);
                              toast({
                                title: "Onderdeel toegevoegd",
                                description: `${item.title} is toegevoegd aan de lijst.`,
                              });
                            } else {
                              setVariantPickerType(targetComponentType);
                              setVariantPickerOpen(true);
                            }
                          } else {
                            // Instant add for simple types
                            const config = COMPONENT_REGISTRY[targetComponentType];
                            const newItem = {
                              id: `${targetComponentType}-${Date.now()}`,
                              type: targetComponentType as any,
                              label: config?.title || targetComponentType,
                              measurements: {},
                              materials: getPresetMaterialsForType(targetComponentType as any)
                            };
                            setComponents(prev => [...prev, newItem]);
                          }
                        } else {
                          toggleCategoryVisibility(categoryKey);
                        }
                      }}
                      className="flex items-center justify-between px-3 py-3 -mx-4 hover:bg-muted/40 active:bg-muted/60 rounded-lg cursor-pointer transition-all group select-none border-l-2 border-b border-b-border/30 min-h-[44px] mt-2" style={{ borderLeftColor: '#4A5568' }}
                    >
                      {targetComponentType ? (
                        <div className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 font-medium w-full">
                          <Plus className="h-4 w-4" />
                          <span className="text-sm font-medium uppercase" style={{ letterSpacing: '0.05em' }}>{
                            targetComponentType === 'kozijn' ? 'Kozijn' :
                              (targetComponentType === 'deur' ? 'Deur' :
                                (targetComponentType === 'vlizotrap' ? 'Vlizotrap' :
                                  (targetComponentType === 'leidingkoof' ? 'Leidingkoof' :
                                    (targetComponentType === 'installatie' ? 'Installatie' :
                                      (targetComponentType === 'dagkant' ? 'Dagkant' :
                                        (targetComponentType === 'vensterbank' ? 'Vensterbank' :
                                          (targetComponentType === 'gips' ? 'Naden & Stucwerk' :
                                            'Boeiboord')))))))
                          } toevoegen</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <h2 className={cn(
                            "text-sm font-semibold uppercase transition-colors shrink-0",
                            isHidden ? "text-muted-foreground" : "text-foreground"
                          )} style={{ letterSpacing: '0.05em' }}>{categoryInfo.title}</h2>
                          {isHidden && (() => {
                            const filledSections = sections.filter((s: any) => gekozenMaterialen[s.key]?.materiaalnaam);
                            if (filledSections.length === 0) return null;
                            return filledSections.map((s: any) => (
                              <span key={s.key} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium normal-case tracking-normal truncate max-w-[180px] animate-in fade-in slide-in-from-left-2">
                                {gekozenMaterialen[s.key].materiaalnaam}
                              </span>
                            ));
                          })()}
                        </div>
                      )}

                      {(!targetComponentType || components.some(c => c.type === targetComponentType)) ? (
                        <div
                          className="p-1.5 rounded-md text-muted-foreground group-hover:text-foreground transition-colors"
                          title={isHidden ? "Toon categorie" : "Verberg categorie"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategoryVisibility(categoryKey);
                          }}
                        >
                          {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                      ) : (
                        <div className="p-1.5 w-7" /> /* Spacer for consistent height */
                      )}
                    </div>

                    {!isHidden && (
                      <div className="space-y-1.5">
                        {targetComponentType ? (
                          <div className="pl-0 sm:pl-2 space-y-8">

                            {/* Custom Rendering of Components with Expanded Materials */}
                            {components.filter(c => c.type === targetComponentType).map((comp, idx) => {
                              // Lookup variant config from registry via slug
                              let variantItem = null;
                              if (targetComponentType === 'kozijn') {
                                variantItem = comp.slug ? JOB_REGISTRY.kozijnen.items.find((i: any) => i.slug === comp.slug) : null;
                              } else if (targetComponentType === 'deur') {
                                variantItem = comp.slug ? JOB_REGISTRY.deuren.items.find((i: any) => i.slug === comp.slug) : null;
                              } else if (targetComponentType === 'dagkant') {
                                variantItem = comp.slug ? JOB_REGISTRY.afwerkingen.items.find((i: any) => i.slug === comp.slug) : null;
                              } else if (targetComponentType === 'vensterbank') {
                                variantItem = comp.slug ? JOB_REGISTRY.afwerkingen.items.find((i: any) => i.slug === comp.slug) : null;
                              }

                              let compSections = variantItem?.materialSections || COMPONENT_REGISTRY[comp.type]?.defaultMaterials || [];

                              // Custom Filtering based on opening type for Kozijnen
                              if (targetComponentType === 'kozijn' && comp.meta?.openingType) {
                                const type = comp.meta.openingType;
                                if (type === 'window' || type === 'raamkozijn') {
                                  // For windows: hide door specific fields
                                  compSections = compSections.filter((s: any) =>
                                    !['beslag', 'deurbeslag', 'deur_scharnieren', 'deur_sloten', 'deur_krukken'].some(k =>
                                      s.key.includes(k) || (s.category && s.category.toLowerCase().includes('deur'))
                                    )
                                  );
                                } else if (type === 'door-frame' || type === 'door' || type === 'deurkozijn') {
                                  // For doors: hide window specific fields (like specific glas details if needed, though doors can have glass)
                                  // But definitely show hinges/locks. 
                                  // Maybe hide 'raam' section if it exists (which implies opening window parts)
                                  compSections = compSections.filter((s: any) => s.key !== 'raam');
                                }
                              }

                              // ALL COMPONENTS: Simplified rendering (Vlizotrap Style)
                              // User requested uniform "clean list" style for everything, including Kozijnen/Deuren.
                              if (targetComponentType) {

                                return (
                                  <div key={comp.id} className="mt-2 space-y-1.5">
                                    {/* Header / Label with visual indicator */}
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                      <div className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                        comp.meta?.openingType === 'window' ? "bg-blue-400" :
                                          comp.meta?.openingType === 'door-frame' || comp.meta?.openingType === 'door' ? "bg-orange-400" : "bg-gray-400"
                                      )} />
                                      <span className="text-sm font-semibold text-foreground/90">{comp.label}</span>
                                    </div>

                                    {/* Werkpakket Selector - per component type */}
                                    {targetComponentType && (
                                      <div className="flex items-center gap-1.5 mb-3 p-2 rounded-lg bg-muted/20 border border-border/30">
                                        <div className="flex-1 space-y-1.5">
                                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Werkpakket
                                          </Label>
                                          <Select
                                            defaultValue="default"
                                            onValueChange={(val) => {
                                              if (val !== 'default') {
                                                handleApplyComponentPreset(val, targetComponentType, comp.id);
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="w-full bg-background/60 border-emerald-500/20 focus:ring-emerald-500/20 h-9">
                                              <div className="flex items-center gap-2">
                                                <Box className="w-4 h-4 text-emerald-500" />
                                                <SelectValue placeholder="Kies werkpakket" />
                                              </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem className={SELECT_ITEM_GREEN} value="default">Nieuw</SelectItem>
                                              {(componentPresets[targetComponentType] || []).map((p: any) => (
                                                <SelectItem className={SELECT_ITEM_GREEN} key={p.id} value={p.id}>{p.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-9 w-9 shrink-0 mt-5 text-muted-foreground hover:text-emerald-500"
                                          title="Opslaan als werkpakket"
                                          onClick={() => {
                                            setSaveComponentPresetType(targetComponentType);
                                            setSaveComponentPresetCompId(comp.id);
                                            setSaveComponentPresetOpen(true);
                                          }}
                                        >
                                          <Save className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}

                                    {/* Clean material list without sub-categories */}
                                    {compSections.map((section: any) => {
                                      const selectedForThis = (comp.materials || []).find((m: any) => m.sectionKey === section.key)?.material;

                                      return (
                                        <div key={section.key} className="relative group">
                                          <MaterialRow
                                            label={section.label}
                                            selected={selectedForThis}
                                            onClick={() => {
                                              setActiveComponentId(comp.id);
                                              setActieveSectie(section.key);
                                              setIsExtraModalOpen(true);
                                            }}
                                            onRemove={() => handleComponentMaterialRemove(comp.id, section.key)}
                                          />
                                        </div>
                                      );
                                    })}
                                    {/* Footer Actions: Edit (if applicable) & Delete */}
                                    <div className="flex justify-end pt-2 pb-1 gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-60 hover:opacity-100 transition-opacity"
                                        onClick={() => setComponentDeleteId(comp.id)}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />

                                        {comp.label || 'Onderdeel'} verwijderen
                                      </Button>
                                    </div>
                                  </div>
                                );
                              }


                              return null;
                            })}


                          </div>
                        ) : (
                          <>
                            {sections.map(section => (
                              <React.Fragment key={section.key}>
                                <MaterialRow
                                  label={section.label}
                                  selected={gekozenMaterialen[section.key]}
                                  onClick={() => openMateriaalKiezer(section.key)}
                                  onRemove={() => handleMateriaalVerwijderen(section.key)}
                                />
                                {/* Beam Height Warning - shows after staanders selection */}
                                {['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'].includes(section.key) && beamHeightWarning && (
                                  <div className="mx-1 mb-2 p-3 rounded-lg border bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-start gap-2.5">
                                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                                          {beamHeightWarning.isTooShort ? 'Balk te kort' : 'Controleer balkhoogte'}
                                        </p>
                                        <p className="text-xs text-amber-700/80 dark:text-amber-500/70 mt-0.5 leading-relaxed">
                                          De wandhoogte is <strong>{beamHeightWarning.wallHeight}mm</strong> en de gekozen balken zijn{' '}
                                          <strong>{beamHeightWarning.beamLength}mm</strong>.
                                          {beamHeightWarning.isTooShort && (
                                            <> Dit is <strong className="text-red-600">{beamHeightWarning.missingLength}mm te kort</strong>.</>
                                          )}
                                          {' '}Is dit correct?
                                        </p>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 bg-amber-100 border-amber-300 text-amber-900 hover:bg-emerald-100 hover:text-emerald-900 hover:border-emerald-300 transition-colors shrink-0"
                                        onClick={() => suggestBetterBeam(section.key)}
                                      >
                                        <Sparkles className="mr-2 h-3.5 w-3.5" />
                                        Balk aanpassen
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Orphaned Components (Debug/Cleanup) */}
            {orphanedComponents.length > 0 && (
              <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Trash2 className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-700">
                      Niet-toegewezen Onderdelen ({orphanedComponents.length})
                    </h3>
                  </div>
                  <p className="text-xs text-amber-600/80 leading-relaxed">
                    Deze onderdelen zijn opgeslagen maar horen niet bij de huidige klus-configuratie.
                    Verwijder ze om uw offerte schoon te houden.
                  </p>
                </div>

                <div className="space-y-2">
                  {orphanedComponents.map((comp) => (
                    <div key={comp.id} className="flex items-center justify-between p-3 rounded-lg border border-amber-200/50 bg-amber-50/50 hover:bg-amber-100/50 transition-colors group">
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-sm font-medium text-amber-900 truncate">{comp.label}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700/60 bg-amber-200/30 px-1.5 py-0.5 rounded">
                            {comp.type || 'ONBEKEND'}
                          </span>
                          <span className="text-[10px] text-amber-700/40 font-mono truncate max-w-[120px]">
                            ID: {comp.id}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setComponentDeleteId(comp.id)}
                        className="text-amber-600 hover:text-red-600 hover:bg-red-100/50 shrink-0 h-8"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Verwijderen
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extra Materials Category */}
            <div className="space-y-2">
              <div
                onClick={() => setAddExtraMaterialOpen(true)}
                className="flex items-center justify-between px-3 py-3 -mx-4 hover:bg-muted/40 active:bg-muted/60 rounded-lg cursor-pointer transition-all group select-none border-l-2 border-b border-b-border/30 min-h-[44px]"
                style={{ borderLeftColor: '#4A5568' }}
              >
                <div className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 font-medium w-full">
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium uppercase" style={{ letterSpacing: '0.05em' }}>Extra materiaal toevoegen</span>
                </div>
                <div className="p-1.5 w-7" /> {/* Spacer for consistent height */}
              </div>

              {/* Show added extra materials below */}
              {((groupedSections.extra || []).length > 0 || customGroups.length > 0) && (
                <div className="space-y-1.5">
                  {(groupedSections.extra || []).map(section => (
                    <MaterialRow
                      key={section.key}
                      label={section.label}
                      selected={gekozenMaterialen[section.key]}
                      onClick={() => openMateriaalKiezer(section.key)}
                      onRemove={() => handleMateriaalVerwijderen(section.key)}
                    />
                  ))}

                  {customGroups.map((group) => {
                    const material = group.materials[0];
                    return (
                      <MaterialRow
                        key={group.id}
                        label={group.title || 'Extra materiaal'}
                        selected={material}
                        onClick={() => { setActiveGroupId(group.id); setIsExtraModalOpen(true); }}
                        onRemove={() => setCustomGroups((prev) => prev.filter((g) => g.id !== group.id))}
                        isCustom
                        onEditTitle={() => setEditingTitleId(group.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* (Legacy Helper Removed) */}

          {/* Klein Material - Card style */}
          <div>
            {renderKleinMateriaalSectie()}
          </div>
        </div>
      </main>

      {/* Quote Notes Section - Persistent at bottom */}
      {/* Quote Notes Section - Persistent at bottom */}
      <div className="max-w-5xl mx-auto px-4 pb-24">
        {/* Public Job Notes Section - Matching Measurement Page Style */}
        <div className="space-y-3 pt-6 border-t border-white/5">
          <div>
            <h3 className="text-lg font-medium text-amber-500">Slimme Notities</h3>
            <p className="text-sm text-muted-foreground">Onze assistent begrijpt vrije tekst. Type simpelweg wat je extra nodig hebt en de geschatte prijs; wij voegen het toe aan de calculatie.</p>
          </div>
          <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl">
            <Textarea
              value={notities}
              onChange={(e) => setNotities(e.target.value)}
              placeholder="Bijv: '12 hoekankers voor €1,50 per stuk' of 'extra uurtje werk à €60,-"
              className="min-h-[120px] bg-black/20 border-white/10 focus-visible:ring-emerald-500/50 resize-y"
            />
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" disabled={isOpslaan || isApplyingPreset} onClick={handleBack}>
            Terug
          </Button>

          <Button
            variant="outline"
            disabled={isApplyingPreset}
            onClick={() => setSavePresetModalOpen(true)}
            className="gap-2"
          >
            Opslaan als werkpakket
            <Save className="h-4 w-4" />
          </Button>

          <Button
            type="submit"
            variant="success"
            disabled={isOpslaan || isApplyingPreset || isPaginaLaden}
            onClick={handleNext}
          >
            {isOpslaan ? 'Opslaan...' : isApplyingPreset ? 'Configuratie toepassen...' : 'Opslaan'}
          </Button>
        </div>
      </div >

      {/* MODALS */}
      < ManagePresetsDialog
        open={managePresetsModalOpen}
        onOpenChange={setManagePresetsModalOpen}
        presets={presets}
        onDelete={handlePresetDeleteWrapper}
        onSetDefault={handlePresetSetDefaultWrapper}
      />

      {/* Component Deletion Confirmation Dialog */}
      <AlertDialog open={!!componentDeleteId} onOpenChange={(open) => !open && setComponentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Onderdeel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{components.find(c => c.id === componentDeleteId)?.label}</strong> wilt verwijderen? Alle materialen in dit onderdeel gaan verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (componentDeleteId) {
                  handleComponentDelete(componentDeleteId);
                  setComponentDeleteId(null);
                }
              }}
              className={buttonVariants({ variant: "destructiveSoft" })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SavePresetDialog
        open={savePresetModalOpen}
        onOpenChange={setSavePresetModalOpen}
        onSave={handleSavePreset}
        jobTitel={JOB_TITEL}
        presets={presets}
        defaultName={gekozenPresetId !== 'default' ? presets.find(p => p.id === gekozenPresetId)?.name : ''}
      />

      {/* Per-component werkpakket save dialog */}
      <SaveComponentPresetDialog
        open={saveComponentPresetOpen}
        onOpenChange={setSaveComponentPresetOpen}
        componentType={saveComponentPresetType}
        existingPresets={saveComponentPresetType ? (componentPresets[saveComponentPresetType] || []) : []}
        onSave={async (name: string) => {
          if (!saveComponentPresetType || !saveComponentPresetCompId) return;
          const saved = await handleSaveComponentPreset(name, saveComponentPresetType, saveComponentPresetCompId);
          if (saved) {
            toast({ title: 'Werkpakket opgeslagen', description: `"${name}" is opgeslagen voor ${COMPONENT_REGISTRY[saveComponentPresetType]?.title || saveComponentPresetType}.` });
          }
        }}
      />

      <AddExtraMaterialDialog
        open={addExtraMaterialOpen}
        onOpenChange={setAddExtraMaterialOpen}
        onAdd={(title: string) => {
          setCustomGroups((prev) => [...prev, { id: maakId(), title, materials: [] }]);
        }}
      />

      <AlertDialog open={presetConfirmOpen} onOpenChange={setPresetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Werkpakket wisselen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt zelf materialen geselecteerd. Als je nu van werkpakket wisselt, worden deze <strong>overschreven</strong> en gaan je selecties verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPresetId(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPresetId) applyPresetChange(pendingPresetId);
              }}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Overschrijven
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Title Dialog */}
      <Dialog open={editingTitleId !== null} onOpenChange={(open) => !open && setEditingTitleId(null)}>
        <DialogContent className={cn('max-w-md w-full', DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>Naam wijzigen</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Naam *</Label>
              <Input
                id="edit-title"
                value={customGroups.find(g => g.id === editingTitleId)?.title || ''}
                onChange={(e) => {
                  setCustomGroups((prev) =>
                    prev.map((g) => g.id === editingTitleId ? { ...g, title: e.target.value } : g)
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTitleId(null);
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTitleId(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmationOpen} onOpenChange={setDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePreset}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MaterialSelectionModal
        open={isExtraModalOpen}
        onOpenChange={(open) => {
          setIsExtraModalOpen(open);
          if (!open) {
            setActiveComponentId(null);
            setActieveSectie(null);
            setActiveGroupId(null);
          }
        }}
        onUpdateWaste={(newWaste) => {
          if (activeComponentId && actieveSectie) {
            setComponents(prev => prev.map(c => {
              if (c.id !== activeComponentId) return c;
              const mats = c.materials || [];
              const idx = mats.findIndex((m: any) => m.sectionKey === actieveSectie);
              if (idx === -1) return c;
              const newMats = [...mats];
              newMats[idx] = { ...newMats[idx], material: { ...(newMats[idx].material as any), wastePercentage: newWaste } };
              return { ...c, materials: newMats };
            }));
          } else if (activeGroupId) {
            setCustomGroups(prev => prev.map(g => {
              if (g.id !== activeGroupId) return g;
              const mats = g.materials || [];
              if (mats.length === 0) return g;
              const newMats = [...mats];
              newMats[0] = { ...newMats[0], wastePercentage: newWaste };
              return { ...g, materials: newMats };
            }));
          } else if (actieveSectie) {
            setGekozenMaterialen(prev => {
              const current = prev[actieveSectie] || {};
              if (!current.materiaalnaam) return prev; // Don't create empty material object on close
              // Ensure we preserve existing properties
              return { ...prev, [actieveSectie]: { ...current, wastePercentage: newWaste, quantity: (current as any).quantity || 1 } };
            });
          }
        }}
        existingMaterials={enrichedMaterials}
        showFavorites={actieveSectie !== 'extra' && !activeGroupId}
        defaultCategory={(() => {
          if (!actieveSectie) return undefined;
          const raw = materialSections.find(s => s.key === actieveSectie)?.categoryFilter;
          if (!raw) return undefined;
          if (typeof raw === 'string' && raw.includes(',')) {
            return raw.split(',').map((s: string) => s.trim());
          }
          return raw;
        })()}

        // New Props
        categoryTitle={(() => {
          if (activeGroupId) return customGroups.find(g => g.id === activeGroupId)?.title || 'Extra materiaal';
          if (activeComponentId) {
            const comp = components.find(c => c.id === activeComponentId);
            if (comp) return `${comp.label} - ${actieveSectie || 'Materiaal'}`;
            return 'Onderdeel materiaal';
          }
          if (actieveSectie) {
            const s = materialSections.find(sec => sec.key === actieveSectie);
            return s?.label || actieveSectie;
          }
          return 'Kies materiaal';
        })()}
        initialWastePercentage={(() => {
          if (activeGroupId) {
            const group = customGroups.find(g => g.id === activeGroupId);
            return group?.materials?.[0]?.wastePercentage || 0;
          }
          if (activeComponentId && actieveSectie) {
            const comp = components.find(c => c.id === activeComponentId);
            const mat = comp?.materials?.find((m: any) => m.sectionKey === actieveSectie)?.material;
            return (mat as any)?.wastePercentage || 0;
          }
          if (actieveSectie) {
            return (gekozenMaterialen[actieveSectie] as any)?.wastePercentage || 0;
          }
          return 0;
        })()}

        onToggleFavorite={toggleFavoriet}
        onSelectExisting={(result: any) => {
          const mat = result.data || result;
          const converted: any = {
            ...mat,
            id: mat.id || mat.row_id,
            prijs: typeof mat.prijs === 'number' ? mat.prijs : (parseNLMoneyToNumber(mat.prijs) || 0),
            categorie: mat.subsectie || null,
            materiaalnaam: mat.materiaalnaam || '',
            eenheid: mat.eenheid || 'stuk',
            sort_order: null,
            quantity: 1,
            wastePercentage: result.wastePercentage ?? 0, // Persist waste
          };

          if (activeComponentId && actieveSectie) {
            handleComponentMaterialSelect(activeComponentId, actieveSectie, converted);
            setActiveComponentId(null);
            setActieveSectie(null);
          } else if (activeGroupId) {
            setCustomGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, materials: [converted] } : g));
            setActiveGroupId(null);
          } else if (actieveSectie) {
            handleMateriaalSelectie(actieveSectie, converted);
            setActieveSectie(null);
          }
          setIsExtraModalOpen(false);
        }}
        onMaterialAdded={(newMaterial: any) => {
          const converted: any = {
            ...newMaterial,
            id: newMaterial.id || newMaterial.row_id,
            prijs: typeof newMaterial.prijs === 'number' ? newMaterial.prijs : (parseNLMoneyToNumber(newMaterial.prijs) || 0),
            quantity: 1,
            wastePercentage: newMaterial.wastePercentage ?? 0, // Persist waste
          };
          if (activeComponentId && actieveSectie) {
            handleComponentMaterialSelect(activeComponentId, actieveSectie, converted);
            setActiveComponentId(null);
            setActieveSectie(null);
          } else if (activeGroupId) {
            setCustomGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, materials: [converted] } : g));
            setActiveGroupId(null);
          } else if (actieveSectie) {
            handleMateriaalSelectie(actieveSectie, converted);
            setActieveSectie(null);
          }
          setIsExtraModalOpen(false);
        }}
      />

      {/* Missing Price Dialog */}
      <Dialog open={showMissingPriceDialog} onOpenChange={(open) => {
        if (!open) {
          setShowMissingPriceDialog(false);
          setPendingNavigateTo(null);
        }
      }}>
        <DialogContent className={cn('max-w-2xl max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>Materialen zonder prijs</DialogTitle>
            <DialogDescription>
              De volgende materialen hebben nog geen prijs. Vul de prijs per stuk in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {missingPriceItems.map((item, idx) => {
              const name = item.materiaalnaam || `Materiaal ${idx + 1}`;
              return (
                <div key={name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-muted-foreground">€</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      className="w-24 h-9"
                      value={missingPriceInputs[name] ?? ''}
                      onChange={(e) => {
                        setMissingPriceInputs(prev => ({ ...prev, [name]: e.target.value }));
                        // Clear saved state if user changes value
                        if (missingPriceSaved[name]) {
                          setMissingPriceSaved(prev => ({ ...prev, [name]: false }));
                        }
                      }}
                      disabled={isSavingPrices}
                    />
                    {missingPriceSaved[name] && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={isSavingPrices}
              onClick={() => {
                setShowMissingPriceDialog(false);
                if (pendingNavigateTo) router.push(pendingNavigateTo);
              }}
            >
              Overslaan
            </Button>
            <Button
              variant="success"
              disabled={isSavingPrices}
              onClick={async () => {
                setIsSavingPrices(true);
                try {
                  const token = await user!.getIdToken();
                  const entriesToSave = Object.entries(missingPriceInputs).filter(
                    ([, val]) => val !== '' && parseFloat(val) > 0
                  );

                  for (const [materiaalnaam, prijs] of entriesToSave) {
                    try {
                      const res = await fetch('/api/materialen/update-price', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          materiaalnaam,
                          prijs_incl_btw: parseFloat(prijs),
                        }),
                      });
                      const json = await res.json();
                      if (json.ok) {
                        setMissingPriceSaved(prev => ({ ...prev, [materiaalnaam]: true }));
                        // Update local gekozenMaterialen state
                        setGekozenMaterialen(prev => {
                          const updated = { ...prev };
                          for (const [k, v] of Object.entries(updated)) {
                            if (!v) continue;
                            const source = (v as any)._raw || v;
                            if (source.materiaalnaam === materiaalnaam) {
                              const newVal = { ...v as any };
                              newVal.prijs_incl_btw = parseFloat(prijs);
                              if (newVal._raw) newVal._raw = { ...newVal._raw, prijs_incl_btw: parseFloat(prijs) };
                              updated[k] = newVal;
                            }
                          }
                          return updated;
                        });
                      }
                    } catch (err) {
                      console.error(`Failed to update price for ${materiaalnaam}:`, err);
                    }
                  }

                  setShowMissingPriceDialog(false);
                  if (pendingNavigateTo) router.push(pendingNavigateTo);
                } catch (err) {
                  console.error('Error saving prices:', err);
                  toast({ variant: 'destructive', title: 'Fout', description: 'Kon prijzen niet opslaan.' });
                } finally {
                  setIsSavingPrices(false);
                }
              }}
            >
              {isSavingPrices ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Opslaan...
                </>
              ) : (
                'Opslaan & Volgende'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW: Variant Selection Dialog */}
      <Dialog open={variantPickerOpen} onOpenChange={setVariantPickerOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Type {variantPickerType === 'kozijn' ? 'Kozijn' : (variantPickerType === 'deur' ? 'Deur' : 'Onderdeel')} kiezen</DialogTitle>
            <DialogDescription>
              Selecteer een variant om toe te voegen aan de lijst.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 py-4">
            {variantPickerType && (() => {
              let items: any[] = [];
              if (variantPickerType === 'kozijn') items = JOB_REGISTRY.kozijnen.items;
              else if (variantPickerType === 'deur') items = JOB_REGISTRY.deuren.items;
              else if (variantPickerType === 'dagkant' || variantPickerType === 'vensterbank') items = JOB_REGISTRY.afwerkingen.items;

              // Filter logic for dagkant/vensterbank specifically
              if (variantPickerType === 'dagkant' || variantPickerType === 'vensterbank') {
                items = items.filter(i => i.title.toLowerCase().includes(variantPickerType.toLowerCase()));
              }

              return items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => {
                    const newItem = {
                      id: `${variantPickerType}-${Date.now()}-${idx}`,
                      type: variantPickerType,
                      label: item.title,
                      slug: item.slug,
                      measurements: {},
                      materials: getPresetMaterialsForType(variantPickerType)
                    };
                    setComponents(prev => [...prev, newItem]);
                    setVariantPickerOpen(false);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium group-hover:text-emerald-500 transition-colors">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500" />
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerOpen(false)}>Annuleren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}