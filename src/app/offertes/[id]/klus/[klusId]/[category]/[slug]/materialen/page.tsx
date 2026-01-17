'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// Components
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { DynamicMaterialGroup } from '@/components/DynamicMaterialGroup';
import { PersonalNotes } from '@/components/PersonalNotes';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent, Job } from '@/lib/types';

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

function parseNLMoneyToNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/\s/g, '').replace('€', '');
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
      const rowId = String(item?.id || '');
      const gevonden = index.get(rowId);
      return {
        id: groupId,
        title: item?.title || '',
        materials: [gevonden ?? { id: rowId, materiaalnaam: '(onbekend)', eenheid: 'stuk', prijs: 0, quantity: 1 }].filter(Boolean),
      };
    });
}

function bouwCustommateriaalMapUitCustomGroups(customGroups: any[]) {
  const out: any = {};
  customGroups.forEach((group, index) => {
    const groupId = group?.id;
    const title = (group?.title || '').trim();
    const rowId = (group?.materials?.[0] as any)?.id || (group?.materials?.[0] as any)?.row_id || null;
    if (!groupId || !title || !rowId) return;
    out[groupId] = { id: String(rowId), title, order: index };
  });
  return out;
}

// ==================================
// STYLING CONSTANTS
// ==================================
const POSITIVE_BTN_SOFT = 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-500/65 focus-visible:ring-emerald-500 focus-visible:ring-offset-0';
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
          "group relative flex flex-col sm:flex-row sm:items-center justify-between py-3 px-4 rounded-lg border transition-all gap-1 sm:gap-4 cursor-pointer",
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
                <span className="text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-md break-words text-left sm:text-right leading-tight">
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

          {selected && onRemove && (
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
          <DialogTitle>{existingPreset ? 'Werkwijze bijwerken' : 'Werkwijze opslaan'}</DialogTitle>
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
          <DialogHeader><DialogTitle>Werkwijzen beheren</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm py-8 text-center">Geen werkwijzen gevonden.</p>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Sluiten</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
        <DialogHeader><DialogTitle>Werkwijzen beheren</DialogTitle><DialogDescription>Beheer uw opgeslagen presets.</DialogDescription></DialogHeader>
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

  // State
  const [isMounted, setIsMounted] = useState(false);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  const [isOpslaan, setIsOpslaan] = useState(false);

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
  const [kozijnenModalOpen, setKozijnenModalOpen] = useState(false);
  const [activeComponentType, setActiveComponentType] = useState<string | null>(null);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null); // For JobComponentsManager control
  const [klus, setKlus] = useState<Job | null>(null);

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
    if (!user?.uid) return;
    setMaterialenLaden(true);
    const { data, error } = await supabase.from('materialen').select('*').eq('gebruikerid', user.uid).range(0, 4999);
    if (error) { setFoutMaterialen('Kon materialen niet laden.'); setMaterialenLaden(false); return; }
    const materialenData = (data || []).map((m: any) => ({
      ...m,
      id: m.row_id ?? m.id,
      prijs: typeof m.prijs === 'number' ? m.prijs : (parseNLMoneyToNumber(m.prijs) || 0),
      categorie: m.subsectie ?? m.categorie ?? null,
    }));
    setAlleMaterialen(materialenData);
    setMaterialenLaden(false);
  }, [user?.uid]);

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
          const rawSels = mat.selections || {};
          setGekozenMaterialen(rawSels);

          // Legacy migration: merge extraMaterials into custommateriaal if needed
          let mergedCustom = mat.custommateriaal || {};
          const legacyExtra = mat.extraMaterials || [];
          if (Array.isArray(legacyExtra) && legacyExtra.length > 0) {
            const hasExisting = Object.keys(mergedCustom).length > 0;
            legacyExtra.forEach((m: any, idx: number) => {
              if (m && m.id) {
                // Create a pseudo-group for each legacy item
                const gid = `legacy_migrated_${m.id}_${idx}_${Date.now()}`;
                mergedCustom[gid] = {
                  id: m.id,
                  title: m.materiaalnaam || m.naam || 'Extra materiaal',
                  order: (hasExisting ? 2000 : 0) + idx
                };
              }
            });
          }
          setFirestoreCustommateriaal(mergedCustom);
          hasSavedConfigRef.current = true;
        }
        if (klusNode?.werkwijze?.workMethodId) setGekozenPresetId(klusNode.werkwijze.workMethodId);
        if (klusNode?.kleinMateriaal) setKleinMateriaalConfig(klusNode.kleinMateriaal);
        if (klusNode?.uiState?.collapsedSections) setCollapsedSections(klusNode.uiState.collapsedSections);
        if (klusNode?.uiState?.hiddenCategories) setHiddenCategories(klusNode.uiState.hiddenCategories);
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
      }
      return;
    }
    if (!alleMaterialen.length) return;
    const preset = presets.find(p => p.id === gekozenPresetId);
    if (!preset) return;
    if (!userHeeftPresetGewijzigdRef.current && isHydratingRef.current === false && !autoApplyDefaultPresetRef.current) return;

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

    return (
      <div className="mt-8 rounded-xl border border-border/60 bg-card/30 overflow-hidden shadow-sm">
        {/* Header Section */}
        <div className="px-5 py-4 border-b border-border/50 bg-muted/20">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
            <Calculator className="h-4 w-4 text-emerald-500" />
            Automatische Klein Materiaal Berekening
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            Dit dekt schroeven, pluggen, tape en ander klein bevestigingsmateriaal dat u niet individueel hoeft te specificeren.
          </p>
        </div>

        {/* Content Section */}
        <div className="p-5 space-y-6">

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
      toast({ title: `Werkwijze ${action}`, description: `Werkwijze "${presetName}" is succesvol ${action}.` });
      const newPreset = { id: docRef.id, ...newPresetData };
      setPresets((prev) => {
        const filtered = prev.filter((p) => p.id !== docRef.id);
        const updatedList = filtered.map((p) => ({ ...p, isDefault: isDefault ? false : p.isDefault }));
        return [...updatedList, newPreset];
      });
      setGekozenPresetId(docRef.id);
    } catch (error: any) { console.error("Preset save error", error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkwijze niet opslaan.' }); }
  };

  const handleSetDefaultPreset = async (presetToSet: any) => {
    if (!user || !firestore || presetToSet.isDefault) return;
    const batch = writeBatch(firestore);
    const currentDefault = presets.find((p) => p.isDefault);
    if (currentDefault) batch.update(doc(firestore, 'presets', currentDefault.id), { isDefault: false });
    batch.update(doc(firestore, 'presets', presetToSet.id), { isDefault: true });
    try {
      await batch.commit();
      toast({ title: 'Standaard ingesteld', description: `"${presetToSet.name}" is nu de standaard werkwijze.` });
      setPresets((prev) => prev.map((p) => ({ ...p, isDefault: p.id === presetToSet.id })));
    } catch (error) { console.error('Fout bij instellen standaard werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon de standaard werkwijze niet instellen.' }); }
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete || !firestore) return;
    const docRef = doc(firestore, 'presets', presetToDelete.id);
    try {
      await deleteDoc(docRef);
      toast({ title: 'Werkwijze verwijderd', description: `De werkwijze "${presetToDelete.name}" is verwijderd.` });
      setPresets((prev) => prev.filter((p) => p.id !== presetToDelete.id));
      if (gekozenPresetId === presetToDelete.id) setGekozenPresetId('default');
    } catch (error) { console.error('Fout bij verwijderen werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkwijze niet verwijderen.' }); }
    finally { setDeleteConfirmationOpen(false); setPresetToDelete(null); setManagePresetsModalOpen(false); }
  };

  const saveToFirestore = async (options: { navigateTo?: string, silent?: boolean } = {}) => {
    if (!user || !firestore) return;

    if (!options.silent) setIsOpslaan(true);
    else setIsAutosaving(true);

    try {
      const cleanSelections: Record<string, { id: string }> = {};
      Object.entries(gekozenMaterialen).forEach(([k, v]) => {
        if (v?.id) cleanSelections[k] = { id: v.id };
      });

      const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);

      const updatePayload: any = {
        // Use dot notation for materialen subfields to allow deleteField() to work
        [`klussen.${klusId}.components`]: components,
        [`klussen.${klusId}.materialen.jobKey`]: JOB_KEY,
        [`klussen.${klusId}.materialen.selections`]: cleanSelections,
        [`klussen.${klusId}.materialen.custommateriaal`]: customMap,
        [`klussen.${klusId}.materialen.savedByUid`]: user.uid,
        // Delete legacy field at top level (required by Firestore)
        [`klussen.${klusId}.materialen.extraMaterials`]: deleteField(),
        [`klussen.${klusId}.werkwijze`]: {
          workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
          presetLabel: presets.find(p => p.id === gekozenPresetId)?.name || null,
          savedByUid: user.uid
        },
        [`klussen.${klusId}.uiState.collapsedSections`]: collapsedSections,
        [`klussen.${klusId}.uiState.hiddenCategories`]: hiddenCategories,
        [`klussen.${klusId}.updatedAt`]: serverTimestamp()
      };

      if (kleinMateriaalConfig.mode === 'none') {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = deleteField();
      } else {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = kleinMateriaalConfig;
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
    gekozenPresetId
  ]);

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    saveToFirestore({ navigateTo: `/offertes/${quoteId}/overzicht` });
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    saveToFirestore({ navigateTo: `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}` });
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
          backLink={`/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`}
          progress={pageProgress}
          quoteId={quoteId}
          rightContent={
            isPaginaLaden ? (
              <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
            ) : (
              <div className="flex items-center gap-2">
                {isAutosaving && <span className="text-xs text-muted-foreground animate-pulse">Opslaan...</span>}
                <PersonalNotes quoteId={quoteId} context={`Materialen: ${JOB_TITEL}`} />
              </div>
            )
          }
        />

        {/* CONTENT */}
        <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full pb-24 space-y-6">
          {foutMaterialen && (<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{foutMaterialen}</div>)}

          {/* Helper: Main Job Measurements */}
          {(() => {
            if (!klus) return null;

            const knownKeys: Record<string, string> = {
              'lengte': 'Lengte', 'lengteMm': 'Lengte',
              'breedte': 'Breedte', 'breedteMm': 'Breedte',
              'hoogte': 'Hoogte', 'hoogteMm': 'Hoogte',
              'diepte': 'Diepte', 'diepteMm': 'Diepte',
              'aantal': 'Aantal',
              'balkafstand': 'Balkafstand',
              'latafstand': 'Latafstand'
            };

            // Logic to group measurements
            const groups: { title?: string, items: { key: string, label: string, value: any }[] }[] = [];

            // 1. Top Level & Measurements Object (Generic)
            const genericItems: { key: string, label: string, value: any }[] = [];

            // Top level
            for (const [key, label] of Object.entries(knownKeys)) {
              if ((klus as any)[key] && (klus as any)[key] !== 0) {
                genericItems.push({ key, label, value: (klus as any)[key] });
              }
            }
            // Measurements object
            if ((klus as any).measurements) {
              Object.entries((klus as any).measurements).forEach(([k, v]) => {
                if (k === 'notities' || !v) return;
                if (typeof v === 'object') return; // Skip complex objects
                const label = knownKeys[k] || k;
                if (!genericItems.find(e => e.label === label)) {
                  genericItems.push({ key: k, label, value: v });
                }
              });
            }
            if (genericItems.length > 0) groups.push({ items: genericItems });

            // 2. Maatwerk (Grouped)
            if ((klus as any).maatwerk) {
              Object.entries((klus as any).maatwerk).forEach(([k, v]) => {
                if (k === 'notities' || !v) return;

                if (typeof v === 'object' && v !== null) {
                  // Nested group (e.g. Wand 1)
                  const groupItems: any[] = [];
                  Object.entries(v).forEach(([subK, subV]) => {
                    if (subK === 'notities' || !subV) return;
                    if (typeof subV === 'object') return; // Skip complex objects (openings array, etc.)
                    const subLabel = knownKeys[subK] || (subK.charAt(0).toUpperCase() + subK.slice(1));
                    groupItems.push({ key: subK, label: subLabel, value: subV });
                  });

                  if (groupItems.length > 0) {
                    // Format title: "wand_1" -> "Wand 1"
                    let title = k.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    groups.push({ title, items: groupItems });
                  }
                } else {
                  // Direct value case -> Add to generic items if exists, or create new group
                  const label = knownKeys[k] || (k.charAt(0).toUpperCase() + k.slice(1));
                  if (groups.length === 0) groups.push({ items: [] });
                  // Add to first group (typically generic)
                  // Check for duplicates
                  if (!groups[0].items.find(e => e.key === k)) {
                    groups[0].items.push({ key: k, label, value: v });
                  }
                }
              });
            }

            if (groups.length === 0) return null;

            return (
              <div className="flex flex-col gap-2 px-1 -mb-2">
                {groups.map((group, idx) => {
                  let displayTitle = group.title;
                  // If title is just a number (like "0"), format it as "Wand 1"
                  if (displayTitle && /^\d+$/.test(displayTitle)) {
                    const catItem = JOB_REGISTRY[params.category as any]?.items.find((i: any) => i.slug === params.slug);
                    const label = catItem?.measurementLabel || 'Onderdeel';
                    displayTitle = `${label} ${parseInt(displayTitle) + 1}`;
                  }

                  return (
                    <div key={idx} className="flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1 flex items-center gap-1">
                        {idx === 0 && <Box className="w-3 h-3" />}
                        {displayTitle || 'Metingen'}:
                      </span>
                      {group.items.map((e) => {
                        const isMm = ['Lengte', 'Breedte', 'Hoogte', 'Diepte', 'Balkafstand', 'Latafstand'].includes(e.label);
                        const valStr = String(e.value);
                        const showSuffix = isMm && /^\d+(\.\d+)?$/.test(valStr);
                        return (
                          <span key={e.key} className="text-[10px] font-medium bg-muted/50 border px-1.5 py-0.5 rounded text-foreground/70">
                            {e.label}: <span className="text-foreground">{e.value}</span>{showSuffix ? 'mm' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )
                })}
              </div>
            );
          })()}

          {/* Preset Selector - Compact */}
          <div className="space-y-3 pb-8 mb-8 border-b border-border/60">
            <Label className="text-base font-semibold text-foreground/90">Kies Een Werkwijze</Label>
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
                  isBoeiboordSection
                )) || (isCeilingJob && isVlizotrapSectionA);

                const isBComponentSection = (isComplexJob && (
                  keyB === 'Kozijnen' || (keyB as string).toLowerCase() === 'kozijnen' ||
                  keyB === 'Deuren' || (keyB as string).toLowerCase() === 'deuren' ||
                  (keyB === 'boeiboord' || (keyB as string).toLowerCase() === 'boeiboorden')
                )) || (isCeilingJob && isVlizotrapSectionB);

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

                const targetComponentType = (isComplexJob && isKozijnenSection) ? 'kozijn' :
                  ((isComplexJob && isDeurenSection) ? 'deur' :
                    ((isComplexJob && isBoeiboordSection) ? 'boeiboord' :
                      ((isCeilingJob && isVlizotrapSection) ? 'vlizotrap' : null)));

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
                          <span className="text-sm font-medium uppercase" style={{ letterSpacing: '0.05em' }}>{targetComponentType === 'kozijn' ? 'Kozijn' : (targetComponentType === 'deur' ? 'Deur' : (targetComponentType === 'vlizotrap' ? 'Vlizotrap' : 'Boeiboord'))} toevoegen</span>
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

                              let sectionMap: { key: string; label: string }[] = [];

                              if (variantItem?.categoryConfig) {
                                // Dynamic loading from job-registry
                                sectionMap = Object.entries(variantItem.categoryConfig)
                                  .sort(([, a]: any, [, b]: any) => a.order - b.order)
                                  .map(([key, config]: any) => ({
                                    key: key,
                                    label: config.title
                                  }));
                              } else {
                                // Fallback defaults
                                sectionMap = targetComponentType === 'kozijn' ? [
                                  { key: 'hout', label: 'Kozijnhout' },
                                  { key: 'beslag', label: 'Hang- & Sluitwerk' },
                                  { key: 'glas', label: 'Glas & Beglazing' },
                                  { key: 'afwerking', label: 'Afwerking' },
                                  { key: 'Stalen kozijn', label: 'Stalen Kozijn' }
                                ] : (targetComponentType === 'deur' ? [
                                  { key: 'Deuren', label: 'Deur' },
                                  { key: 'deurbeslag', label: 'Beslag' },
                                  { key: 'glas', label: 'Glas' },
                                  { key: 'tochtstrips', label: 'Tochtwering' },
                                  { key: 'ventilatie', label: 'Ventilatie' }
                                ] : (targetComponentType === 'vlizotrap' ? [
                                  { key: 'hout', label: 'Raveling & Hout' },
                                  { key: 'basis', label: 'Vlizotrap & Luik' },
                                  { key: 'afwerking', label: 'Afwerking' }
                                ] : [
                                  // Fallback for Boeiboorden or others
                                  { key: 'beplating', label: 'Beplating' },
                                  { key: 'afwerking', label: 'Afwerking' }
                                ]));
                              }

                              return (
                                <div key={comp.id} className="mt-6 mb-4 group pl-4 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderLeft: '2px solid rgb(16, 185, 129)' }}>
                                  {/* Component Header - Anchor Style */}
                                  <div className="flex items-center justify-between py-3 px-4 -ml-4 mb-3 border-b border-b-border/20" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                    <div className="flex items-center gap-4">
                                      <h3 className="text-sm font-semibold uppercase flex items-center gap-2 text-foreground" style={{ letterSpacing: '0.05em' }}>
                                        <Box className="h-4 w-4 text-emerald-500" />
                                        <span>{comp.label}</span>
                                      </h3>

                                      <div className="hidden sm:flex items-center gap-2">
                                        {Object.entries(comp.measurements || {}).filter(([k]) => k !== 'subtitle' && k !== '_variantMode').map(([k, v]) => (
                                          <span key={k} className="text-[10px] bg-muted/60 border border-border/50 px-1.5 py-0.5 rounded text-muted-foreground">
                                            {k}: <span className="text-foreground">{v as any}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 hover:bg-background/80"
                                        onClick={() => {
                                          setActiveComponentType(targetComponentType);
                                          setEditingComponentId(comp.id);
                                          setKozijnenModalOpen(true);
                                        }}
                                        title="Afmetingen wijzigen"
                                      >
                                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleComponentDelete(comp.id)} title="Onderdeel verwijderen">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Material Sections for this Component */}
                                  <div className="space-y-6">
                                    {/* Group by Category Mapping */}
                                    {sectionMap.map(catConfig => {
                                      const sectionsForCat = compSections.filter((s: any) =>
                                        (s.category || 'hout').toLowerCase() === catConfig.key.toLowerCase()
                                      );

                                      if (sectionsForCat.length === 0) return null;

                                      return (
                                        <div key={catConfig.key}>
                                          <div className="flex items-center justify-between py-2 select-none mb-2 mt-4">
                                            <h4 className="text-xs font-medium tracking-wide text-foreground/70">
                                              {catConfig.label}
                                            </h4>
                                          </div>
                                          <div className="space-y-1.5">
                                            {sectionsForCat.map((section: any) => {
                                              const selectedForThis = (comp.materials || []).find((m: any) => m.sectionKey === section.key)?.material;

                                              return (
                                                <MaterialRow
                                                  key={section.key}
                                                  label={section.label}
                                                  selected={selectedForThis}
                                                  isSubSection={true}
                                                  onClick={() => {
                                                    // Open modal in context of this component
                                                    setActiveComponentId(comp.id);
                                                    setActieveSectie(section.key);
                                                    setIsExtraModalOpen(true);
                                                  }}
                                                  onRemove={() => handleComponentMaterialRemove(comp.id, section.key)}
                                                />
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
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
          <div className="pb-24">
            {renderKleinMateriaalSectie()}
          </div>
        </div>
      </main>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" disabled={isOpslaan} onClick={handleBack}>
            Terug
          </Button>

          <Button
            variant="outline"
            onClick={() => setSavePresetModalOpen(true)}
            className="gap-2"
          >
            Opslaan als werkwijze
            <Save className="h-4 w-4" />
          </Button>

          <Button
            type="submit"
            variant="success"
            disabled={isOpslaan}
            onClick={handleNext}
          >
            {isOpslaan ? 'Opslaan...' : 'Volgende'}
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
            <AlertDialogTitle>Werkwijze wisselen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt zelf materialen geselecteerd. Als je nu van werkwijze wisselt, worden deze <strong>overschreven</strong> en gaan je selecties verloren.
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
        onOpenChange={setIsExtraModalOpen}
        existingMaterials={enrichedMaterials}
        showFavorites={actieveSectie !== 'extra' && !activeGroupId && !activeComponentId}
        defaultCategory={actieveSectie ? materialSections.find(s => s.key === actieveSectie)?.categoryFilter : undefined} // Note: For components, we might want to pass category too?
        onToggleFavorite={toggleFavoriet}
        onSelectExisting={(result: any) => {
          const mat = result.data || result;
          const converted: any = {
            ...mat,
            id: mat.id || mat.row_id,
            prijs: typeof mat.prijs === 'number' ? mat.prijs : 0,
            categorie: mat.subsectie || null,
            materiaalnaam: mat.materiaalnaam || '',
            eenheid: mat.eenheid || 'stuk',
            sort_order: null,
            quantity: 1
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
            prijs: typeof newMaterial.prijs === 'number' ? newMaterial.prijs : 0,
            quantity: 1
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