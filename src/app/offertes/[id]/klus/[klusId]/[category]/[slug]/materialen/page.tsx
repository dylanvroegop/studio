'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// ✅ Ensure these components exist in src/components/
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { DynamicMaterialGroup } from '@/components/DynamicMaterialGroup'; 
import { PersonalNotes } from '@/components/PersonalNotes';

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
  MoreHorizontal,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';
import { useUser, useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';

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
import { JOB_REGISTRY, MaterialSection } from '@/lib/job-registry';

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
// STYLING
// ==================================
const POSITIVE_BTN_SOFT = 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-500/65 focus-visible:ring-emerald-500 focus-visible:ring-offset-0';
const DESTRUCTIVE_BTN_SOFT = 'border border-red-500/50 bg-red-500/15 text-red-100 hover:bg-red-500/25 hover:border-red-500/65 focus-visible:ring-red-500 focus-visible:ring-offset-0';
const SELECT_ITEM_GREEN = 'text-foreground focus:bg-emerald-600/15 focus:text-foreground data-[highlighted]:bg-emerald-600/15 data-[highlighted]:text-foreground data-[state=checked]:bg-emerald-600/15 data-[state=checked]:text-foreground';
const SELECTED_MATERIAL_TEXT = 'text-emerald-400';
const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';
const TERUG_HOVER_RED = 'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';
const SLUITEN_HOVER_RED = 'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';
const DIALOG_CLOSE_TAP = '[&_button[aria-label="Close"]]:h-11 [&_button[aria-label="Close"]]:w-11 [&_button[aria-label="Close"]]:p-0 [&_button[aria-label="Close"]]:opacity-100 [&_button[aria-label="Close"]]:hover:bg-muted/50 [&_button[aria-label="Close"]]:hover:text-foreground [&_button[aria-label="Close"]]:focus-visible:ring-0 [&_button[aria-label="Close"]_svg]:h-6 [&_button[aria-label="Close"]_svg]:w-6 [&_button[aria-label="Sluiten"]]:h-11 [&_button[aria-label="Sluiten"]]:w-11 [&_button[aria-label="Sluiten"]]:p-0 [&_button[aria-label="Sluiten"]]:opacity-100 [&_button[aria-label="Sluiten"]]:hover:bg-muted/50 [&_button[aria-label="Sluiten"]]:hover:text-foreground [&_button[aria-label="Sluiten"]]:focus-visible:ring-0 [&_button[aria-label="Sluiten"]_svg]:h-6 [&_button[aria-label="Sluiten"]_svg]:w-6';
const TEKST_ACTIE_CLASSES = 'inline-flex items-center gap-1 rounded-md px-2 py-2 min-h-[44px] bg-transparent hover:bg-transparent hover:text-inherit hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:pointer-events-none';

// ==================================
// DIALOG COMPONENTS
// ==================================

function SavePresetDialog({ open, onOpenChange, onSave, jobTitel, presets, defaultName }: any) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const existingPreset = useMemo(() => {
    if (!name.trim()) return null;
    return presets.find((p:any) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  }, [name, presets]);

  useEffect(() => {
    if (open) {
      if (defaultName) {
        setName(defaultName);
        const p = presets.find((x:any) => x.name === defaultName);
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
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
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} className={cn(SLUITEN_HOVER_RED)}>Sluiten</Button></DialogFooter>
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
                <Button variant="ghost" size="sm" onClick={() => onSetDefault(preset)} disabled={preset.isDefault} className={cn('hover:bg-emerald-600/10', ICON_BUTTON_NO_ORANGE)}><Star className="mr-2 h-4 w-4" /> Standaard</Button>
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

// ==================================
// MAIN COMPONENT
// ==================================

export default function GenericMaterialsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;

  // 1. Get Config
  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const materialSections = jobConfig?.materialSections || [];

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

  // Dynamic Selections based on Registry Keys
  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, any | undefined>>({});
  const [extraMaterials, setExtraMaterials] = useState<any[]>([]);
  const [customGroups, setCustomGroups] = useState<any[]>([]);
  const [firestoreCustommateriaal, setFirestoreCustommateriaal] = useState<any | null>(null);

  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<any>({ mode: 'percentage', percentage: null, fixedAmount: null });
  const [kleinVastBedragStr, setKleinVastBedragStr] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [actieveSectie, setActieveSectie] = useState<string | null>(null); // Key of active section
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<any | null>(null);
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [favorieten, setFavorieten] = useState<string[]>([]);

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

  // Hydrate from Firestore
  useEffect(() => {
    if (!firestore || !quoteId || !klusId) return;
    const hydrate = async () => {
        setPaginaLaden(true);
        try {
            const snap = await getDoc(doc(firestore, 'quotes', quoteId));
            if(!snap.exists()) return;
            const data = snap.data();
            const klusNode = data?.klussen?.[klusId];
            
            if (klusNode?.materialen) {
                const mat = klusNode.materialen;
                // Map saved selections back to full objects
                const rawSels = mat.selections || {};
                // We need alleMaterialen loaded to map properly
                setGekozenMaterialen(rawSels); 
                setExtraMaterials(mat.extraMaterials || []);
                setFirestoreCustommateriaal(mat.custommateriaal || null);
                hasSavedConfigRef.current = true;
            }
            if (klusNode?.werkwijze?.workMethodId) setGekozenPresetId(klusNode.werkwijze.workMethodId);
            if (klusNode?.kleinMateriaal) setKleinMateriaalConfig(klusNode.kleinMateriaal);
            if (klusNode?.uiState?.collapsedSections) setCollapsedSections(klusNode.uiState.collapsedSections);
            isHydratingRef.current = false;
        } catch(e) { console.error(e); }
        finally { setPaginaLaden(false); }
    };
    hydrate();
  }, [firestore, quoteId, klusId]);

  // Full Object Mapping (Wait for materials)
  useEffect(() => {
      if(!alleMaterialen.length || isHydratingRef.current) return;
      setGekozenMaterialen(prev => {
          const next: any = {};
          let changed = false;
          Object.keys(prev).forEach(k => {
              const val = prev[k];
              if(val && val.id && !val.materiaalnaam) { // It's just an ID wrapper
                  const found = alleMaterialen.find(m => m.id === val.id);
                  if(found) { next[k] = found; changed = true; }
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

    // ✅ FIX: Check if we have items named EXACTLY '(onbekend)'
    // This matches what is written in Line 183 of your screenshot.
    const hasBrokenItems = customGroups.some((g) => 
        g.materials.some((m: any) => m.materiaalnaam === '(onbekend)')
    );

    // FIX: If groups exist AND they are valid (don't have 'onbekend'), stop here.
    // BUT: If hasBrokenItems is true, we ignore the length check and force a rebuild!
    if (customGroups.length > 0 && !hasBrokenItems) return;

    const built = bouwCustomGroupsUitFirestore(firestoreCustommateriaal, alleMaterialen);
    setCustomGroups(built);
  }, [firestoreCustommateriaal, alleMaterialen, customGroups.length]);

  // Auto Preset
  useEffect(() => {
    // 1. We added 'isPaginaLaden' to the checks and dependencies.
    // This ensures we wait until the initial load is 100% done before deciding to apply a default.
    if (isPaginaLaden || isPresetsLaden || !presets.length || userHeeftPresetGewijzigdRef.current || hasSavedConfigRef.current || gekozenPresetId !== 'default') return;
    
    // Safety check: don't overwrite if we somehow have custom groups already
    if (customGroups.length > 0) return;

    const defaultPreset = presets.find((p) => p.isDefault) || presets.find((p) => (p.name || '').toLowerCase().includes('standaard'));
    if (defaultPreset) {
      console.log("Applying Default Preset:", defaultPreset.name); // Debug log
      autoApplyDefaultPresetRef.current = true;
      setGekozenPresetId(defaultPreset.id);
    }
  }, [isPresetsLaden, presets, gekozenPresetId, customGroups.length, isPaginaLaden]); // <--- Added isPaginaLaden here

  // Apply Preset Logic
  useEffect(() => {
    if (gekozenPresetId === 'default') {
        if (userHeeftPresetGewijzigdRef.current) {
            setGekozenMaterialen({});
            setCollapsedSections({});
            setExtraMaterials([]);
            setCustomGroups([]);
            setFirestoreCustommateriaal(null);
            setKleinMateriaalConfig({ mode: 'percentage', percentage: null, fixedAmount: null });
        }
        return;
    }
    if (!alleMaterialen.length) return;
    const preset = presets.find(p => p.id === gekozenPresetId);
    if(!preset) return;
    if (!userHeeftPresetGewijzigdRef.current && isHydratingRef.current === false && !autoApplyDefaultPresetRef.current) return;

    // Apply
    const newSels: any = {};
    if(preset.slots) {
        Object.keys(preset.slots).forEach(key => {
            const matId = preset.slots[key];
            const found = alleMaterialen.find(m => m.id === matId);
            if(found) newSels[key] = found;
        });
    }
    setGekozenMaterialen(newSels);
    if(preset.collapsedSections) setCollapsedSections(preset.collapsedSections);
    if(preset.custommateriaal) setCustomGroups(bouwCustomGroupsUitFirestore(preset.custommateriaal, alleMaterialen));
    else setCustomGroups([]);
    if(preset.kleinMateriaalConfig) setKleinMateriaalConfig(preset.kleinMateriaalConfig);
    
    if (autoApplyDefaultPresetRef.current) autoApplyDefaultPresetRef.current = false;
  }, [gekozenPresetId, presets, alleMaterialen]);

  // Handlers
  const onPresetChange = (val: string) => { userHeeftPresetGewijzigdRef.current = true; autoApplyDefaultPresetRef.current = false; setGekozenPresetId(val); };
  const toggleSection = (key: string) => setCollapsedSections(prev => ({...prev, [key]: !prev[key]}));
  const openMateriaalKiezer = (sectieKey: string, groupId: string | null = null) => { setActieveSectie(sectieKey); setActiveGroupId(groupId); setIsExtraModalOpen(true); };
  const handleMateriaalSelectie = (key: string, materiaal: any) => { setGekozenMaterialen(prev => ({...prev, [key]: materiaal})); };
  const handleMateriaalVerwijderen = (key: string) => { setGekozenMaterialen(prev => { const n = {...prev}; delete n[key]; return n; }); };

  // --- RENDERERS ---

  const renderExtraMateriaalCompact = () => (
    <div className="space-y-4">
      {customGroups.map((group) => {
        const isExpanded = !collapsedSections[group.id];
        return (
          <DynamicMaterialGroup
            key={group.id}
            id={group.id}
            title={group.title}
            materials={group.materials.map((m:any) => ({ ...m, quantity: m.quantity ?? 1 }))}
            isExpanded={isExpanded}
            onToggle={(isOpen) => setCollapsedSections((prev: any) => ({ ...prev, [group.id]: !isOpen }))}
            onUpdateTitle={(val) => setCustomGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, title: val } : g)))}
            onAddMaterial={() => { setActiveGroupId(group.id); setIsExtraModalOpen(true); }}
            onEditMaterial={() => { setActiveGroupId(group.id); setIsExtraModalOpen(true); }}
            onRemoveMaterial={(matId) => setCustomGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, materials: g.materials.filter((m: any) => m.id !== matId) } : g)))}
            onDeleteGroup={() => setCustomGroups((prev) => prev.filter((g) => g.id !== group.id))}
            onUpdateQuantity={(matId, qty) => setCustomGroups((prev) => prev.map((g) => g.id === group.id ? { ...g, materials: g.materials.map((m: any) => m.id === matId ? { ...m, quantity: qty } : m) } : g))}
          />
        );
      })}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <CardTitle className="text-lg">Extra materiaal</CardTitle>
          <Button variant="ghost" size="sm" className="gap-2 text-emerald-500 hover:text-emerald-400" onClick={() => setCustomGroups((prev) => [...prev, { id: maakId(), title: '', materials: [] }])}>
            <Plus className="h-4 w-4" /> Groep toevoegen
          </Button>
        </CardHeader>
      </Card>
    </div>
  );

  // ✅ Fixed Logic to detect 'extra' key
  const renderSelectieRij = (sectieSleutel: string, titel: string) => {
    
    // 1. Intercept 'extra'
    if (sectieSleutel === 'extra') {
        return renderExtraMateriaalCompact();
    }

    // 2. Standard Logic
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];

    if (isCollapsed) {
        return (
            <div onClick={() => toggleSection(sectieSleutel)} className="group flex items-center justify-between rounded-lg border border-border/40 bg-muted/5 px-4 py-2 cursor-pointer transition-all hover:bg-muted/20 hover:border-border/60 hover:opacity-100 opacity-60">
                <div className="flex flex-col justify-center flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground truncate group-hover:text-foreground transition-colors">{titel}</span>
                        <span className="text-xs font-normal text-muted-foreground/50 hidden sm:inline-block">· Niet van toepassing</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button type="button" className={cn(TEKST_ACTIE_CLASSES, 'text-muted-foreground/70 group-hover:text-foreground')}><ChevronDown className="h-4 w-4" /></button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" onClick={(e) => e.stopPropagation()} className={cn(TEKST_ACTIE_CLASSES, 'text-muted-foreground hover:text-foreground')}><MoreHorizontal className="h-4 w-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {gekozenMateriaal && (<DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMateriaalVerwijderen(sectieSleutel); }} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2"><Trash2 className="h-4 w-4" /><span>Verwijder materiaal</span></DropdownMenuItem>)}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleSection(sectieSleutel); }} className="cursor-pointer flex items-center gap-2"><ChevronDown className="h-4 w-4" /><span>Openen</span></DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        );
    }

    const showRed = !gekozenMateriaal;
    return (
        <Card className={cn('transition-all', showRed && 'border-l-2 border-l-destructive')}>
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
                <div className="space-y-1.5"><CardTitle className="text-lg font-semibold tracking-tight">{titel}</CardTitle></div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => toggleSection(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, 'text-muted-foreground')}><ChevronUp className="h-5 w-5" /></button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className={cn(TEKST_ACTIE_CLASSES, 'text-muted-foreground hover:text-foreground')}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {gekozenMateriaal ? (<DropdownMenuItem onClick={() => handleMateriaalVerwijderen(sectieSleutel)} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2"><Trash2 className="h-4 w-4" /><span>Verwijder materiaal</span></DropdownMenuItem>) : (<div className="p-2 text-xs text-muted-foreground text-center">Geen opties</div>)}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="border-t pt-4">
                    {isMaterialenLaden ? (<div className="h-10 bg-muted/50 rounded animate-pulse" />) : (
                        <div className="flex items-center justify-between min-h-[40px]">
                            <div>{gekozenMateriaal ? (<p className={cn('text-sm', SELECTED_MATERIAL_TEXT)}>{gekozenMateriaal.materiaalnaam}</p>) : (<p className="text-sm text-destructive italic">Nog geen materiaal gekozen</p>)}</div>
                            <div className="flex items-center gap-2">
                                {gekozenMateriaal ? (
                                    <button type="button" onClick={() => openMateriaalKiezer(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, 'text-foreground/80 whitespace-nowrap')}><span>Wijzigen</span></button>
                                ) : (
                                    <button type="button" onClick={() => openMateriaalKiezer(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, 'text-emerald-500 whitespace-nowrap')}><Plus className="h-4 w-4" /><span>Toevoegen</span></button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
  };

  const renderKleinMateriaalSectie = () => {
      const isCollapsed = !!collapsedSections['klein_materiaal'];
      const { mode, percentage, fixedAmount } = kleinMateriaalConfig;
      
      const SelectionTile = ({ active, error, title, subtitle, onClick }: any) => (
        <div onClick={onClick} className={cn('flex flex-col items-center justify-center p-3 rounded-md border cursor-pointer transition-all text-center h-full', active && !error && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100', active && error && 'border-red-500/50 bg-red-500/10 text-red-100', !active && 'hover:bg-muted/20 hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground')}>
            <span className="font-semibold text-sm">{title}</span>{subtitle && <span className="text-[10px] opacity-70 mt-0.5">{subtitle}</span>}
        </div>
      );

      if (isCollapsed) {
          return (
            <div onClick={() => toggleSection('klein_materiaal')} className="group flex items-center justify-between rounded-lg border border-border/40 bg-muted/5 px-4 py-2 cursor-pointer transition-all opacity-60 hover:opacity-100">
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Klein materiaal</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          );
      }

      return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
                <CardTitle className="text-lg">Klein materiaal</CardTitle>
                <button type="button" onClick={() => toggleSection('klein_materiaal')} className={cn(TEKST_ACTIE_CLASSES, 'text-muted-foreground')}><ChevronUp className="h-5 w-5" /></button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="border-t pt-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SelectionTile active={mode === 'inschatting'} title="Inschatting" subtitle="Door ons berekend" onClick={() => { setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null }); setKleinVastBedragStr(''); }} />
                        <SelectionTile active={mode === 'percentage'} title="Percentage" subtitle="% van totaal" onClick={() => setKleinMateriaalConfig((p:any) => ({ ...p, mode: 'percentage' }))} />
                        <SelectionTile active={mode === 'fixed'} title="Vast bedrag" subtitle="Vaste toeslag" onClick={() => setKleinMateriaalConfig((p:any) => ({ ...p, mode: 'fixed' }))} />
                        <SelectionTile active={mode === 'none'} title="Geen" onClick={() => { setKleinMateriaalConfig({ mode: 'none', percentage: null, fixedAmount: null }); setKleinVastBedragStr(''); }} />
                    </div>
                    {mode === 'percentage' && (
                        <div className="flex items-center gap-3 max-w-xs animate-in fade-in slide-in-from-top-1">
                            <div className="relative w-full">
                                <Input type="number" step="0.1" placeholder="0" className="pr-8" value={percentage ?? ''} onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: e.target.value ? Number(e.target.value) : null })} />
                                <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
                            </div>
                        </div>
                    )}
                    {mode === 'fixed' && (
                        <div className="flex items-center gap-3 max-w-xs animate-in fade-in slide-in-from-top-1">
                            <EuroInput id="km-fixed" value={kleinVastBedragStr} placeholder="0,00" onChange={(v: string) => { setKleinVastBedragStr(v); setKleinMateriaalConfig({ ...kleinMateriaalConfig, fixedAmount: parseNLMoneyToNumber(v) }); }} />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
      );
  };

  // ✅ SAVE FUNCTIONS RESTORED
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

  const handleSave = async () => {
      setIsOpslaan(true);
      try {
          if (!user || !firestore) throw new Error("No connection");
          
          // Clean Selections
          const cleanSelections: Record<string, {id: string}> = {};
          Object.entries(gekozenMaterialen).forEach(([k, v]) => {
              if (v?.id) cleanSelections[k] = { id: v.id };
          });

          // Clean Extra
          const cleanExtra = extraMaterials.map((m: any) => ({ ...m, aantal: m.aantal || undefined })).filter(m => m.naam);

          // Custom Groups
          const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);

          // Build Update Object
          const updatePayload: any = {
              [`klussen.${klusId}.materialen`]: {
                  jobKey: JOB_KEY,
                  selections: cleanSelections,
                  extraMaterials: cleanExtra,
                  custommateriaal: customMap,
                  savedByUid: user.uid
              },
              [`klussen.${klusId}.werkwijze`]: {
                  workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
                  presetLabel: presets.find(p => p.id === gekozenPresetId)?.name || null,
                  savedByUid: user.uid
              },
              [`klussen.${klusId}.uiState.collapsedSections`]: collapsedSections,
              [`klussen.${klusId}.updatedAt`]: serverTimestamp()
          };

          if(kleinMateriaalConfig.mode === 'none') {
              updatePayload[`klussen.${klusId}.kleinMateriaal`] = deleteField();
          } else {
              updatePayload[`klussen.${klusId}.kleinMateriaal`] = kleinMateriaalConfig;
          }

          await updateDoc(doc(firestore, 'quotes', quoteId), updatePayload);
          
          toast({ title: "Opgeslagen!" });
          router.push(`/offertes/${quoteId}/overzicht`);

      } catch (e: any) {
          console.error(e);
          toast({ variant: 'destructive', title: "Fout bij opslaan", description: e.message });
      } finally {
          setIsOpslaan(false);
      }
  };

  const handlePresetDeleteWrapper = (preset: any) => { setPresetToDelete(preset); setDeleteConfirmationOpen(true); };
  const handlePresetSetDefaultWrapper = (preset: any) => handleSetDefaultPreset(preset);

  if(!isMounted) return null;

  return (
    <>
    <main className="flex flex-1 flex-col pb-20">
       {/* HEADER */}
       <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
              <Link href={`/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex-1 text-center">
               <div className="text-sm font-semibold">{JOB_TITEL}</div>
               <div className="mt-3 h-1.5 rounded-full bg-muted/40 mx-auto w-full"><div className="h-full rounded-full bg-primary/65" style={{width: '80%'}} /></div>
            </div>
            <div className="flex items-center justify-center">
                {isPaginaLaden ? (<div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />) : (<PersonalNotes quoteId={quoteId} />)}
            </div>
        </div>
       </header>

       {/* CONTENT */}
       <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
          {foutMaterialen && (<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{foutMaterialen}</div>)}

          {/* Preset Selector */}
          <div className="mb-8 space-y-2">
              <Label>Gekozen werkwijze</Label>
              <div className="flex items-center gap-2">
                  <Select onValueChange={onPresetChange} value={gekozenPresetId} disabled={isPresetsLaden}>
                      <SelectTrigger className="hover:bg-muted/40"><SelectValue placeholder="Kies..." /></SelectTrigger>
                      <SelectContent>
                          <SelectItem className={SELECT_ITEM_GREEN} value="default">Nieuw</SelectItem>
                          {presets.map(p => (<SelectItem className={SELECT_ITEM_GREEN} key={p.id} value={p.id}>{p.name} {p.isDefault ? '(standaard)' : ''}</SelectItem>))}
                      </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => setManagePresetsModalOpen(true)} disabled={presets.length === 0} className={cn('h-11 w-11 rounded-xl', ICON_BUTTON_NO_ORANGE)}><Settings className="h-4 w-4" /></Button>
              </div>
          </div>
          
          {/* Dynamic Sections Loop */}
          <div className="space-y-4">
             {materialSections.map(section => (
                 <div key={section.key}>{renderSelectieRij(section.key, section.label)}</div>
             ))}
             
             {/* Extra Material + Klein Material */}
             <div className="mt-8 space-y-6">
                {renderSelectieRij('extra', 'Extra materiaal')}
                {renderKleinMateriaalSectie()}
             </div>
          </div>

          <div className="mt-8">
             <Button variant="outline" onClick={() => setSavePresetModalOpen(true)} className="w-full hover:bg-emerald-500/14 hover:text-emerald-100 border-dashed"><Save className="mr-2 h-4 w-4" /> Huidige keuzes opslaan als werkwijze</Button>
          </div>

          <div className="flex justify-between items-center pt-8">
             <Button variant="outline" asChild className={cn(TERUG_HOVER_RED)}>
                <Link href={`/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`}>Terug</Link>
             </Button>
             <Button onClick={handleSave} disabled={isOpslaan} className={cn(POSITIVE_BTN_SOFT, "px-8")}>
                {isOpslaan ? <Loader2 className="animate-spin" /> : "Volgende"}
             </Button>
          </div>
       </div>
    </main>

    {/* MODALS */}
    <ManagePresetsDialog open={managePresetsModalOpen} onOpenChange={setManagePresetsModalOpen} presets={presets} onDelete={handlePresetDeleteWrapper} onSetDefault={handlePresetSetDefaultWrapper} />
    <SavePresetDialog open={savePresetModalOpen} onOpenChange={setSavePresetModalOpen} onSave={handleSavePreset} jobTitel={JOB_TITEL} presets={presets} defaultName={gekozenPresetId !== 'default' ? presets.find(p => p.id === gekozenPresetId)?.name : ''} />
    <AlertDialog open={deleteConfirmationOpen} onOpenChange={setDeleteConfirmationOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Weet u het zeker?</AlertDialogTitle><AlertDialogDescription>Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={handleDeletePreset} className={buttonVariants({ variant: 'destructive' })}>Verwijderen</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <MaterialSelectionModal 
        open={isExtraModalOpen} 
        onOpenChange={setIsExtraModalOpen}
        existingMaterials={alleMaterialen}
        showFavorites={actieveSectie !== 'extra' && !activeGroupId}
        defaultCategory={actieveSectie ? materialSections.find(s => s.key === actieveSectie)?.categoryFilter : undefined}
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

            if(activeGroupId) {
                setCustomGroups(prev => prev.map(g => g.id === activeGroupId ? {...g, materials: [converted]} : g));
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
            if(activeGroupId) {
                setCustomGroups(prev => prev.map(g => g.id === activeGroupId ? {...g, materials: [converted]} : g));
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