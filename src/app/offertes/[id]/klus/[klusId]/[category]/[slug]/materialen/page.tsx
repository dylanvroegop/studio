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
          selected ? "border-emerald-500/20 bg-emerald-500/5" : "border-border hover:bg-accent/40"
        )}
      >
        <div
          className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <span className={cn(
            "font-medium text-sm truncate",
            selected ? "text-emerald-500" : "text-muted-foreground"
          )}>
            {label}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:justify-end">
            {selected ? (
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

          {(selected || isCustom) && onRemove && (
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
  const [components, setComponents] = useState<JobComponent[]>([]);

  // Calculate which component types are active for this job configuration
  const activeComponentTypes = useMemo(() => {
    const types = new Set<string>();
    const categories = Object.keys(jobConfig?.categoryConfig || MATERIAL_CATEGORY_INFO);
    const isComplex = (jobSlug.includes('hsb') || jobSlug.includes('metalstud') || jobSlug.includes('wand') || jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('plat'));
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

  const [kozijnenModalOpen, setKozijnenModalOpen] = useState(false);
  const [activeComponentType, setActiveComponentType] = useState<string | null>(null);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null); // For JobComponentsManager control

  const [klus, setKlus] = useState<Job | null>(null);
  const [notities, setNotities] = useState('');

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

  // Safeguard state
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [presetConfirmOpen, setPresetConfirmOpen] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);

  const userHeeftPresetGewijzigdRef = useRef(false);
  const isHydratingRef = useRef(true);
  const hasSavedConfigRef = useRef(false);
  const autoApplyDefaultPresetRef = useRef(false);

  useEffect(() => setIsMounted(true), []);

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

        if (klusNode?.components && Array.isArray(klusNode.components)) {
          setComponents(klusNode.components);
        }

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
        if (klusNode?.uiState?.hiddenCategories) setHiddenCategories(klusNode.uiState.hiddenCategories);
        if (klusNode?.notities) setNotities(klusNode.notities);
        isHydratingRef.current = false;
      } catch (e) { console.error(e); }
      finally { setPaginaLaden(false); }
    };
    hydrate();
  }, [firestore, quoteId, klusId]);

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
      if (preset.hiddenCategories) setHiddenCategories(preset.hiddenCategories); else setHiddenCategories({});
      if (preset.custommateriaal) setCustomGroups(bouwCustomGroupsUitFirestore(preset.custommateriaal, alleMaterialen));
      else setCustomGroups([]);
      if (preset.kleinMateriaalConfig) setKleinMateriaalConfig(preset.kleinMateriaalConfig);

      // FIX: Restore components (Kozijnen, Deuren, etc.) if present in preset
      if (preset.components && Array.isArray(preset.components)) {
        setComponents(preset.components);
      } else {
        setComponents([]);
      }

      // Unlock
      setIsApplyingPreset(false);
      autoApplyDefaultPresetRef.current = false; // Reset trigger
    }, 100);


    if (autoApplyDefaultPresetRef.current) autoApplyDefaultPresetRef.current = false;
  }, [gekozenPresetId, presets, alleMaterialen]);

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
  const toggleCategoryVisibility = (categoryKey: string) => setHiddenCategories(prev => ({ ...prev, [categoryKey]: !prev[categoryKey] }));
  const openMateriaalKiezer = (sectieKey: string, groupId: string | null = null) => { setActieveSectie(sectieKey); setActiveGroupId(groupId); setIsExtraModalOpen(true); };
  const handleMateriaalSelectie = (key: string, materiaal: any) => { setGekozenMaterialen(prev => ({ ...prev, [key]: materiaal })); };
  const handleMateriaalVerwijderen = (key: string) => { setGekozenMaterialen(prev => { const n = { ...prev }; delete n[key]; return n; }); };

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
      // CLEANER SAVE STRUCTURE as requested:
      // 1. All materials in 'materialen_lijst' including custom ones.
      // 2. No flattening of components (they have their own list).
      // 3. No ID saved (supabase row_id).

      const materialenLijst: Record<string, any> = {};

      const BLOCKLIST = ['isFavorite', 'sectionKey', 'quantity', '_raw', 'created_at'];

      // 1. Standard Selections
      Object.entries(gekozenMaterialen).forEach(([k, v]) => {
        if (k.startsWith('component_')) return; // Ignore legacy flat components
        if (v) {
          materialenLijst[k] = {
            sectionKey: k,
            material: (() => {
              // Priority: Use raw Supabase data if available to ensure exact DB fidelity
              const source = v._raw || v;
              const clean: any = {};

              Object.keys(source).forEach(prop => {
                if (BLOCKLIST.includes(prop)) return;
                const val = source[prop];
                // Skip null/undefined/empty string
                if (val === null || val === undefined || val === '') return;
                clean[prop] = val;
              });

              // Ensure name is set (fallback to UI name if raw name is missing, unlikely)
              if (!clean.materiaalnaam && v.materiaalnaam) clean.materiaalnaam = v.materiaalnaam;

              return clean;
            })()
          };
        }
      });

      // 2. Custom Groups (Merged into materialen_lijst)
      // We use the bouwCustommateriaalMapUitCustomGroups helper, but need to strip IDs
      // and ensure we keep 'title' and 'order' for reconstruction
      const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);
      Object.entries(customMap).forEach(([gid, cm]: [string, any]) => {
        materialenLijst[gid] = {
          // Flattened save for custom groups
          ...(() => {
            const clean: any = {};
            Object.keys(cm).forEach(prop => {
              if (BLOCKLIST.includes(prop)) return;
              const val = cm[prop];
              if (val !== null && val !== undefined && val !== '') clean[prop] = val;
            });
            return clean;
          })(),
          title: cm.title // Ensure title works for grouping
        };
      });

      const updatePayload: any = {
        // Deep clean components to remove metadata like 'aangemaakt_op', 'gebruikerid', etc.
        [`klussen.${klusId}.components`]: JSON.parse(JSON.stringify(components.map(c => ({
          ...c,
          materials: (c.materials || []).map((m: any) => {
            // Keep structure but clean the inner 'material' object
            if (!m.material) return m;

            // Format price: "9.3 p/m2"
            const rawPrice = typeof m.material.prijs === 'number' ? m.material.prijs : 0;
            const unit = m.material.eenheid || '';
            const formattedPrice = unit ? `${rawPrice} ${unit}` : rawPrice; // Use rawPrice number if no unit, or string if unit exists? User wants "9.3 p/m2" which is a string.

            return {
              sectionKey: m.sectionKey,
              material: {
                materiaalnaam: m.material.materiaalnaam || '',
                prijs: formattedPrice,
                // We keep 'prijs_per_stuk' just in case, but cleaned
                prijs_per_stuk: m.material.prijs_per_stuk || 0,
                // We remove id, row_id, etc.
              }
            };
          })
        })))),
        [`klussen.${klusId}.materialen.jobKey`]: JOB_KEY,

        // The new clean list
        [`klussen.${klusId}.materialen.materialen_lijst`]: JSON.parse(JSON.stringify(materialenLijst)),

        [`klussen.${klusId}.materialen.savedByUid`]: user.uid,
        [`klussen.${klusId}.materialen.savedAt`]: serverTimestamp(),

        // CLEANUP: Removing old dirty fields
        [`klussen.${klusId}.materialen.selections`]: deleteField(),
        [`klussen.${klusId}.materialen.custommateriaal`]: deleteField(),
        [`klussen.${klusId}.materialen.extraMaterials`]: deleteField(),

        [`klussen.${klusId}.werkwijze`]: JSON.parse(JSON.stringify({
          workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
          // presetLabel removed to prevent AI confusion (Solution 1)
          savedByUid: user.uid
        })),
        [`klussen.${klusId}.uiState.collapsedSections`]: collapsedSections,
        [`klussen.${klusId}.uiState.hiddenCategories`]: hiddenCategories,
        [`klussen.${klusId}.notities`]: notities,
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

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    saveToFirestore({ navigateTo: `/offertes/${quoteId}/overzicht` });
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    // If job has no measurements, skip measurement page and go to category selection
    const hasMeasurements = jobConfig?.measurements && jobConfig.measurements.length > 0;
    const backUrl = hasMeasurements
      ? `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`
      : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`;
    saveToFirestore({ navigateTo: backUrl });
  };


  const handlePresetDeleteWrapper = (preset: any) => { setPresetToDelete(preset); setDeleteConfirmationOpen(true); };
  const handlePresetSetDefaultWrapper = (preset: any) => handleSetDefaultPreset(preset);

  // Page progress (not item completion)
  // This is the materials page, which is step 3 of 4 (after client info at 0%)
  // Client info (0%) -> Job selection (25%) -> Job details (50%) -> Materials (75%) -> Overview (100%)
  const pageProgress = 80;

  if (!isMounted) return null;

  return (
    <>
      <main className="relative min-h-screen bg-background flex flex-col">
        {/* HEADER - Consistent with other pages */}
        <WizardHeader
          title={JOB_TITEL}
          backLink={
            (jobConfig?.measurements && jobConfig.measurements.length > 0)
              ? `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`
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
                if (isComplexJob) {
                  if (isKozijnenSection) targetComponentType = 'kozijn';
                  else if (isDeurenSection) targetComponentType = 'deur';
                  else if (isBoeiboordSection) targetComponentType = 'boeiboord';
                  else if (isLeidingkoofSection) targetComponentType = 'leidingkoof';
                  else if (isInstallatieSection) targetComponentType = 'installatie';
                  else if (isDagkantSection) targetComponentType = 'dagkant';
                  else if (isVensterbankSection) targetComponentType = 'vensterbank';
                }

                if (isCeilingJob) {
                  if (isVlizotrapSection) targetComponentType = 'vlizotrap';
                  else if (isLeidingkoofSection) targetComponentType = 'leidingkoof';
                }

                if (isGipsSection) targetComponentType = 'gips';

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
                              materiaalKeuzes: {}
                            };
                            setComponents(prev => [...prev, newVlizotrap]);
                          } else if (targetComponentType === 'installatie') {
                            const newInstallatie = {
                              id: `installatie-${Date.now()}`,
                              type: 'installatie' as const,
                              label: 'Installatie & Elektra',
                              measurements: {},
                              materiaalKeuzes: {}
                            };
                            setComponents(prev => [...prev, newInstallatie]);
                          } else if (targetComponentType === 'gips') {
                            const newGips = {
                              id: `gips-${Date.now()}`,
                              type: 'gips' as const,
                              label: 'Naden & Stucwerk',
                              measurements: {},
                              materiaalKeuzes: {}
                            };
                            setComponents(prev => [...prev, newGips]);
                          } else {
                            setActiveComponentType(targetComponentType);
                            setKozijnenModalOpen(true);
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
                        <h2 className={cn(
                          "text-sm font-semibold uppercase transition-colors",
                          isHidden ? "text-muted-foreground" : "text-foreground"
                        )} style={{ letterSpacing: '0.05em' }}>{categoryInfo.title}</h2>
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
                            {/* Manager purely for the "Add/Edit Dialog" functionality. We hide the list. */}
                            <JobComponentsManager
                              components={components}
                              onChange={setComponents}
                              limitToType={targetComponentType}
                              hideAddButton={true}
                              forceOpen={kozijnenModalOpen && activeComponentType === targetComponentType}
                              onOpenChange={(open) => {
                                setKozijnenModalOpen(open);
                                if (!open) {
                                  setEditingComponentId(null);
                                  setActiveComponentType(null);
                                }
                              }}
                              renderList={false}
                              externalEditingId={editingComponentId}
                              onEditingIdChange={setEditingComponentId}
                            />

                            {/* Custom Rendering of Components with Expanded Materials */}
                            {components.filter(c => c.type === targetComponentType).map((comp, idx) => {
                              // Lookup variant config from registry via slug
                              let variantItem = null;
                              if (targetComponentType === 'kozijn') {
                                variantItem = comp.slug ? JOB_REGISTRY.kozijnen.items.find((i: any) => i.slug === comp.slug) : null;
                              } else if (targetComponentType === 'deur') {
                                variantItem = comp.slug ? JOB_REGISTRY.deuren.items.find((i: any) => i.slug === comp.slug) : null;
                              }

                              const compSections = variantItem?.materialSections || COMPONENT_REGISTRY[comp.type]?.defaultMaterials || [];

                              // ALL COMPONENTS: Simplified rendering (Vlizotrap Style)
                              // User requested uniform "clean list" style for everything, including Kozijnen/Deuren.
                              if (targetComponentType) {
                                const measurements = (comp as any)[`measurements_${comp.type}`] || comp.measurements;
                                const hasMeasurements = measurements && Object.keys(measurements).length > 0;

                                return (
                                  <div key={comp.id} className="mt-2 space-y-1.5">
                                    {/* Werkwijze Selector - Inline (moved from popup) */}
                                    {(targetComponentType === 'kozijn' || targetComponentType === 'deur') && (
                                      <div className="space-y-1.5 mb-3 p-2 rounded-lg bg-muted/20 border border-border/30">
                                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                          Werkpakket
                                        </Label>
                                        <Select defaultValue="default">
                                          <SelectTrigger className="w-full bg-background/60 border-emerald-500/20 focus:ring-emerald-500/20 h-9">
                                            <div className="flex items-center gap-2">
                                              <Box className="w-4 h-4 text-emerald-500" />
                                              <SelectValue placeholder="Kies werkpakket" />
                                            </div>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="default">Nieuw</SelectItem>
                                            {/* TODO: Load saved presets for this component type */}
                                          </SelectContent>
                                        </Select>
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
                                      {hasMeasurements && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition-opacity"
                                          onClick={() => {
                                            setActiveComponentType(targetComponentType);
                                            setEditingComponentId(comp.id);
                                            setKozijnenModalOpen(true);
                                          }}
                                        >
                                          <Edit2 className="h-3 w-3 mr-1" />
                                          Wijzigen
                                        </Button>
                                      )}
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
                          sections.map(section => (
                            <MaterialRow
                              key={section.key}
                              label={section.label}
                              selected={gekozenMaterialen[section.key]}
                              onClick={() => openMateriaalKiezer(section.key)}
                              onRemove={() => handleMateriaalVerwijderen(section.key)}
                            />
                          ))
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
              // Ensure we preserve existing properties or create new object if empty
              return { ...prev, [actieveSectie]: { ...current, wastePercentage: newWaste, quantity: (current as any).quantity || 1 } };
            });
          }
        }}
        existingMaterials={enrichedMaterials}
        showFavorites={actieveSectie !== 'extra' && !activeGroupId && !activeComponentId}
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
    </>
  );
}