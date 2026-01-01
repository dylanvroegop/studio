'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
// ✅ IMPORT THE NEW MODAL
import { MaterialSelectionModal, ExistingMaterial } from '@/components/MaterialSelectionModal';
import { DynamicMaterialGroup } from '@/components/DynamicMaterialGroup';
import Link from 'next/link';
import {
  ArrowLeft,
  Trash2,
  Settings,
  Save,
  ChevronDown,
  ChevronUp,
  Star,
  Loader2,
  Check,
  Plus,
  MoreHorizontal, // ✅ Added for the menu
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import type {
  Quote,
  Preset as PresetType,
  KleinMateriaalConfig,
  ExtraMaterial,
} from '@/lib/types';
import { getQuoteById } from '@/lib/data';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
// ✅ IMPORT DROPDOWN MENU
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// ==================================
// Styling helpers
// ==================================
const POSITIVE_BTN_SOFT =
  'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 ' +
  'hover:bg-emerald-500/25 hover:border-emerald-500/65 ' +
  'focus-visible:ring-emerald-500 focus-visible:ring-offset-0';

const SELECT_ITEM_GREEN =
  'text-foreground ' +
  'focus:bg-emerald-600/15 focus:text-foreground ' +
  'data-[highlighted]:bg-emerald-600/15 data-[highlighted]:text-foreground ' +
  'data-[state=checked]:bg-emerald-600/15 data-[state=checked]:text-foreground';

const SELECTED_MATERIAL_TEXT = 'text-emerald-400';
const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';

const TERUG_HOVER_RED =
  'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';

const SLUITEN_HOVER_RED =
  'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';

const DIALOG_CLOSE_TAP =
  '[&_button[aria-label="Close"]]:h-11 [&_button[aria-label="Close"]]:w-11 [&_button[aria-label="Close"]]:p-0 ' +
  '[&_button[aria-label="Close"]]:opacity-100 [&_button[aria-label="Close"]]:hover:bg-muted/50 [&_button[aria-label="Close"]]:hover:text-foreground ' +
  '[&_button[aria-label="Close"]]:focus-visible:ring-0 ' +
  '[&_button[aria-label="Close"]_svg]:h-6 [&_button[aria-label="Close"]_svg]:w-6 ' +
  '[&_button[aria-label="Sluiten"]]:h-11 [&_button[aria-label="Sluiten"]]:w-11 [&_button[aria-label="Sluiten"]]:p-0 ' +
  '[&_button[aria-label="Sluiten"]]:opacity-100 [&_button[aria-label="Sluiten"]]:hover:bg-muted/50 [&_button[aria-label="Sluiten"]]:hover:text-foreground ' +
  '[&_button[aria-label="Sluiten"]]:focus-visible:ring-0 ' +
  '[&_button[aria-label="Sluiten"]_svg]:h-6 [&_button[aria-label="Sluiten"]_svg]:w-6';

// ✅ Consistent Button Styling matching DynamicMaterialGroup
const TEKST_ACTIE_CLASSES = "inline-flex items-center gap-1 rounded-md px-2 py-2 min-h-[44px] bg-transparent hover:bg-transparent hover:text-inherit hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:pointer-events-none";

// ==================================
// ID helper (veilig)
// ==================================
const maakId = () =>
  typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ==================================
// NL nummer/€ helpers
// ==================================
function sanitizeNlMoneyInput(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/[^\d,]/g, '');

  const firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    const before = s.slice(0, firstComma + 1);
    const after = s
      .slice(firstComma + 1)
      .replace(/,/g, '')
      .slice(0, 2);
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

function EuroInput({
  id,
  value,
  onChange,
  placeholder = '0,00',
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = (value ?? '').trim() !== '';

  return (
    <div className="relative">
      <span
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm transition-colors',
          focused || hasValue ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        €
      </span>

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

// ==================================
// Definities
// ==================================
type Material = {
  row_id: string;
  id: string;
  materiaalnaam: string;
  categorie: string | null;
  eenheid: string;
  prijs: number | string | null;
  sort_order: number | null;
  user_id: string;
};

type MateriaalKeuze = Omit<Material, 'row_id' | 'user_id' | 'prijs'> & {
  prijs: number;
  id: string;
  quantity?: number;
};

type CustomGroup = {
    id: string;
    title: string;
    materials: MateriaalKeuze[];
};

const sectieSleutels = [
  'balkhout',
  'isolatie',
  'houten plaatmateriaal',
  'gips_fermacell',
  'naden_vullen',
  'naden_vullen_2',
  'afwerkplinten',
  'extra',
  'klein_materiaal',
] as const;

type SectieKey = (typeof sectieSleutels)[number];

type FirestoreMaterialenPayload = {
  jobKey?: string | null;
  jobType?: string | null;
  jobSlug?: string | null;
  selections?: Record<string, any>;
  extraMaterials?: any[];
  customGroups?: any[];
  savedByUid?: string | null;
  collapsedSections?: Record<string, boolean>;
};

type FirestoreWerkwijzePayload = {
  workMethodId?: string | null;
  presetLabel?: string | null;
  savedByUid?: string | null;
};

// Klein materiaal met "Geen"
type KleinMateriaalMode = 'percentage' | 'fixed' | 'none'| 'inschatting';
type KleinMateriaalConfigLocal = Omit<KleinMateriaalConfig, 'mode'> & { mode: KleinMateriaalMode };

// ==================================
// Modal Components
// ==================================
type SavePresetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (presetName: string, isDefault: boolean) => void;
  jobTitel: string;
};

function SavePresetDialog({ open, onOpenChange, onSave, jobTitel }: SavePresetDialogProps) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name) return;
    setIsSaving(true);
    await onSave(name, isDefault);
    setIsSaving(false);
    onOpenChange(false);
    setTimeout(() => {
      setName('');
      setIsDefault(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>Werkwijze opslaan</DialogTitle>
          <DialogDescription>Sla de huidige materiaalconfiguratie op voor later gebruik bij {jobTitel}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name">Naam werkwijze *</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`bv. Standaard ${jobTitel}`}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="default-preset"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked as boolean)}
              className="border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white focus-visible:ring-emerald-600"
            />
            <Label htmlFor="default-preset">Maak dit mijn standaard voor {jobTitel}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren

          </Button>
          <Button
            onClick={handleSave}
            disabled={!name || isSaving}
            variant="outline"
            className={cn(POSITIVE_BTN_SOFT)}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ManagePresetsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PresetType[];
  onDelete: (preset: PresetType) => void;
  onSetDefault: (preset: PresetType) => void;
};

function ManagePresetsDialog({ open, onOpenChange, presets, onDelete, onSetDefault }: ManagePresetsDialogProps) {
  if (!presets || presets.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>Werkwijzen beheren</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm py-8 text-center">Er zijn geen werkwijzen om te beheren.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className={cn(SLUITEN_HOVER_RED)}>
              Sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>Werkwijzen beheren</DialogTitle>
          <DialogDescription>Beheer hier uw opgeslagen werkwijzen voor dit klustype.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
              <span className="text-sm font-medium">
                {preset.name}
                {preset.isDefault && <span className="text-xs text-muted-foreground ml-2">(standaard)</span>}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetDefault(preset)}
                  disabled={preset.isDefault}
                  className={cn('hover:bg-emerald-600/10', ICON_BUTTON_NO_ORANGE)}
                >
                  <Star className="mr-2 h-4 w-4" />
                  Maak standaard
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onDelete(preset)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Verwijderen
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Sluiten
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

// ==================================
// Pagina
// ==================================
export default function HsbWandMaterialenPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;

  const JOB_KEY = 'hsb-voorzetwand';
  const JOB_TITEL = 'HSB Voorzetwand';

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  const [isOpslaan, setIsOpslaan] = useState(false);

  const [alleMaterialen, setAlleMaterialen] = useState<MateriaalKeuze[]>([]);
  const [isMaterialenLaden, setMaterialenLaden] = useState(true);
  const [foutMaterialen, setFoutMaterialen] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetType[]>([]);
  const [gekozenPresetId, setGekozenPresetId] = useState<string>('default');
  const [isPresetsLaden, setPresetsLaden] = useState(true);

  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, MateriaalKeuze | undefined>>({});
  const [extraMaterials, setExtraMaterials] = useState<ExtraMaterial[]>([]);
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);


  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<KleinMateriaalConfigLocal>({
    mode: 'percentage',
    percentage: null,
    fixedAmount: null,
  });

  const [kleinVastBedragStr, setKleinVastBedragStr] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [actieveSectie, setActieveSectie] = useState<SectieKey | null>(null);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<PresetType | null>(null);
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false);

  const [editExtra, setEditExtra] = useState<ExtraMaterial | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);


  const userHeeftPresetGewijzigdRef = useRef(false);
  const isHydratingRef = useRef(true);
  const hasSavedConfigRef = useRef(false);
  const autoApplyDefaultPresetRef = useRef(false);

  const toggleSection = (sectieSleutel: SectieKey) => {
    setCollapsedSections((prev) => ({ ...prev, [sectieSleutel]: !prev[sectieSleutel] }));
  };

  useEffect(() => {
    async function fetchQuote() {
      if (!quoteId) return;
      setPaginaLaden(true);
      const quoteData = await getQuoteById(quoteId);
      setQuote(quoteData || null);
      setPaginaLaden(false);
    }
    fetchQuote();
  }, [quoteId]);

  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);

  // ✅ REFACTORED: Fetch logic extracted to useCallback so we can reload it later
  const fetchMaterials = useCallback(async () => {
    if (!user?.uid) return;

    setMaterialenLaden(true);
    setFoutMaterialen(null);

    const { data, error } = await supabase.from('materialen').select('*').eq('gebruikerid', user.uid);

    if (error) {
      console.error('Fout bij ophalen Supabase materialen:', error);
      setFoutMaterialen('Kon materialen niet laden.');
      setAlleMaterialen([]);
      setMaterialenLaden(false);
      return;
    }

    const getCorrectPrice = (p: unknown): number => {
      if (p === null || p === undefined) return 0;
      if (typeof p === 'number') return Number.isFinite(p) ? p : 0;
      if (typeof p === 'string') {
        const parsed = parseNLMoneyToNumber(p);
        return parsed === null ? 0 : parsed;
      }
      return 0;
    };

    const materialenData = (data || []).map((m: any) => ({
      ...m,
      id: m.row_id ?? m.id,
      prijs: getCorrectPrice(m.prijs),
      categorie: m.subsectie ?? m.categorie ?? null,
    })) as MateriaalKeuze[];

    setAlleMaterialen(materialenData);
    setMaterialenLaden(false);
  }, [user?.uid]);

  // ✅ USE EFFECT: Calls the function above on mount
  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useEffect(() => {
    if (!user || !firestore) return;

    const fetchPresets = async () => {
      setPresetsLaden(true);
      const presetsRef = collection(firestore, 'presets');
      const q = query(presetsRef, where('userId', '==', user.uid));

      try {
        const querySnapshot = await getDocs(q);
        const fetched = querySnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as PresetType))
          .filter((p) => p.jobType === JOB_KEY);

        setPresets(fetched);
      } catch (_serverError) {
        const permissionError = new FirestorePermissionError({
          path: 'presets',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setFoutMaterialen('Kon werkwijzen niet laden vanwege permissieproblemen.');
      } finally {
        setPresetsLaden(false);
      }
    };

    fetchPresets();
  }, [user, firestore]);

  useEffect(() => {
    if (!firestore || !quoteId || !klusId) return;

    const hydrateFromDb = async () => {
      try {
        const ref = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data() as any;
        const klusNode = data?.klussen?.[klusId];

        const mat: FirestoreMaterialenPayload | undefined = klusNode?.materialen;
        const werkw: FirestoreWerkwijzePayload | undefined = klusNode?.werkwijze;
        const kmAny: any = klusNode?.kleinMateriaal;

        const rawSelections = mat?.selections && typeof mat.selections === 'object' ? mat.selections : {};
        const rawExtra = Array.isArray(mat?.extraMaterials) ? mat!.extraMaterials : [];
        const rawCustomGroups = Array.isArray(mat?.customGroups) ? mat!.customGroups : [];

        setCustomGroups(rawCustomGroups);


        const hasSelections = Object.keys(rawSelections || {}).length > 0;
        const hasExtra = Array.isArray(rawExtra) && rawExtra.length > 0;
        const hasKleinMateriaal = !!kmAny;
        const hasWerkwijze = !!werkw?.workMethodId;
        hasSavedConfigRef.current = hasSelections || hasExtra || hasKleinMateriaal || hasWerkwijze;

        const workMethodId = werkw?.workMethodId ?? null;
        setGekozenPresetId(workMethodId ? workMethodId : 'default');

        if (kmAny && typeof kmAny === 'object') {
          const mode: KleinMateriaalMode =
          kmAny.mode === 'none'
            ? 'none'
            : kmAny.mode === 'fixed'
              ? 'fixed'
              : kmAny.mode === 'inschatting'
                ? 'inschatting'
                : 'percentage';
        

          setKleinMateriaalConfig({
            mode,
            percentage: typeof kmAny.percentage === 'number' ? kmAny.percentage : null,
            fixedAmount: typeof kmAny.fixedAmount === 'number' && kmAny.fixedAmount > 0 ? kmAny.fixedAmount : null,
          });
        } else {
          setKleinMateriaalConfig({ mode: 'percentage', percentage: null, fixedAmount: null });
        }

        const rawCollapsed = (klusNode?.materialen?.collapsedSections || klusNode?.collapsedSections) ?? null;
        if (rawCollapsed && typeof rawCollapsed === 'object') {
          setCollapsedSections(rawCollapsed);
        }

        isHydratingRef.current = false;
      } catch (e) {
        console.error('Hydrate Firestore mislukt:', e);
        isHydratingRef.current = false;
      }
    };

    hydrateFromDb();
  }, [firestore, quoteId, klusId]);

  useEffect(() => {
    const n = kleinMateriaalConfig.fixedAmount ?? null;
    setKleinVastBedragStr(typeof n === 'number' && n > 0 ? formatNlMoneyFromNumber(n) : '');
  }, [kleinMateriaalConfig.fixedAmount]);

  // ✅ Mapping selections uit Firestore => alleen IDs in Firestore, hier terug mappen naar object
  useEffect(() => {
    if (!alleMaterialen || alleMaterialen.length === 0) return;

    const mapNow = async () => {
      if (!firestore || !quoteId || !klusId) return;

      try {
        const ref = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data() as any;
        const klusNode = data?.klussen?.[klusId];
        const mat: FirestoreMaterialenPayload | undefined = klusNode?.materialen;

        const selections = mat?.selections && typeof mat.selections === 'object' ? mat.selections : {};
        const extra = Array.isArray(mat?.extraMaterials) ? mat!.extraMaterials : [];

        const heeftSelections = Object.keys(selections || {}).length > 0;
        const heeftExtra = Array.isArray(extra) && extra.length > 0;

        if (!heeftSelections && !heeftExtra && !hasSavedConfigRef.current) return;

        const toegestaneKeys = new Set(sectieSleutels);
        const mapped: Record<string, MateriaalKeuze | undefined> = {};

        for (const [key, val] of Object.entries(selections)) {
          if (!toegestaneKeys.has(key as any)) continue;
          if (key === 'extra' || key === 'klein_materiaal') continue;

          // ondersteunt: {id}, {row_id}, of directe string id
          const id =
            (val as any)?.id ||
            (val as any)?.row_id ||
            (typeof val === 'string' ? val : null);

          if (!id) continue;

          const gevonden = alleMaterialen.find((m) => m.id === id);
          if (gevonden) mapped[key] = gevonden;
        }

        setGekozenMaterialen(mapped);

        const mappedExtra: ExtraMaterial[] = (extra || [])
          .map((m: any) => {
            const naam = m?.naam || m?.materiaalnaam || '';
            const eenheid = m?.eenheid || 'stuk';
            const prijsPerEenheid =
              typeof m?.prijsPerEenheid === 'number'
                ? m.prijsPerEenheid
                : typeof m?.prijs === 'number'
                  ? m.prijs
                  : 0;

                  return {
                    id: m?.id || maakId(),
                    naam,
                    eenheid,
                    prijsPerEenheid,
                    aantal: typeof m?.aantal === 'number' ? m.aantal : undefined,
                    usageDescription: m?.usageDescription ?? '',
                  
                    // ✅ belangrijk: behoud meetwaarden uit Firestore bij bewerken
                    lengte: typeof m?.lengte === 'number' ? m.lengte : undefined,
                    breedte: typeof m?.breedte === 'number' ? m.breedte : undefined,
                    hoogte: typeof m?.hoogte === 'number' ? m.hoogte : undefined,
                  } as ExtraMaterial;
                  
          })
          .filter((x) => x.naam);

        setExtraMaterials(mappedExtra);
      } catch (e) {
        console.error('Mapping selections mislukt:', e);
      }
    };

    mapNow();
  }, [alleMaterialen, firestore, quoteId, klusId]);

  useEffect(() => {
    if (isPresetsLaden) return;
    if (!presets || presets.length === 0) return;
    if (userHeeftPresetGewijzigdRef.current) return;
    if (isHydratingRef.current) return;
    if (hasSavedConfigRef.current) return;
    if (gekozenPresetId !== 'default') return;

    const defaultPreset =
      presets.find((p) => p.isDefault) ||
      presets.find((p) => (p.name || '').toLowerCase().includes('standaard'));

    if (!defaultPreset) return;

    autoApplyDefaultPresetRef.current = true;
    setGekozenPresetId(defaultPreset.id);
  }, [isPresetsLaden, presets, gekozenPresetId]);

  useEffect(() => {
    if (gekozenPresetId === 'default') {
      if (userHeeftPresetGewijzigdRef.current) {
        setGekozenMaterialen({});
        setCollapsedSections({});
        setExtraMaterials([]);
        setCustomGroups([]);
        setKleinMateriaalConfig({ mode: 'percentage', percentage: null, fixedAmount: null });
      }
      return;
    }

    if (!alleMaterialen || alleMaterialen.length === 0) return;

    const preset = presets.find((p) => p.id === gekozenPresetId);
    if (!preset) return;

    if (!userHeeftPresetGewijzigdRef.current && isHydratingRef.current === false && !autoApplyDefaultPresetRef.current) {
      return;
    }

    const nieuweGekozen: Record<string, MateriaalKeuze | undefined> = {};

    for (const key of sectieSleutels) {
      if (key === 'extra' || key === 'klein_materiaal') continue;
      const materiaalId = (preset as any).slots?.[key];
      if (!materiaalId) continue;

      const materiaal = alleMaterialen.find((m) => m.id === materiaalId);
      if (materiaal) nieuweGekozen[key] = materiaal;
    }

    setGekozenMaterialen(nieuweGekozen);
    setCollapsedSections((preset as any).collapsedSections || {});

    const kmPreset: any = (preset as any).kleinMateriaalConfig;
    if (kmPreset && typeof kmPreset === 'object') {
      const mode: KleinMateriaalMode =
  kmPreset.mode === 'none'
    ? 'none'
    : kmPreset.mode === 'fixed'
      ? 'fixed'
      : kmPreset.mode === 'inschatting'
        ? 'inschatting'
        : 'percentage';


      setKleinMateriaalConfig({
        mode,
        percentage: typeof kmPreset.percentage === 'number' ? kmPreset.percentage : null,
        fixedAmount: typeof kmPreset.fixedAmount === 'number' && kmPreset.fixedAmount > 0 ? kmPreset.fixedAmount : null,
      });
    } else {
      setKleinMateriaalConfig({ mode: 'percentage', percentage: null, fixedAmount: null });
    }

    if (autoApplyDefaultPresetRef.current) autoApplyDefaultPresetRef.current = false;
  }, [gekozenPresetId, presets, alleMaterialen]);

  const onPresetChange = (value: string) => {
    userHeeftPresetGewijzigdRef.current = true;
    autoApplyDefaultPresetRef.current = false;
    setGekozenPresetId(value);
  };

  // ---------------------------------------------------------
  // ✅ FAVORITES LOGIC (Moved from old modal to here)
  // ---------------------------------------------------------
  const [favorieten, setFavorieten] = useState<string[]>([]);
  
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    try {
      const saved = localStorage.getItem(`offertehulp:favorieten:${user.uid}`);
      if (saved) setFavorieten(JSON.parse(saved));
    } catch (e) {
      console.error("Kon favorieten niet laden", e);
    }
  }, [user]);

  const toggleFavoriet = useCallback((id: string) => {
    if (!user) return;
    setFavorieten(prev => {
      let next;
      if (prev.includes(id)) {
        next = prev.filter(fid => fid !== id);
      } else {
        next = [...prev, id];
      }
      localStorage.setItem(`offertehulp:favorieten:${user.uid}`, JSON.stringify(next));
      return next;
    });
  }, [user]);

  const subsectieMapping: Record<string, string> = {
    balkhout: 'Balkhout',
    isolatie: 'Isolatie',
    'houten plaatmateriaal': 'Houten plaatmateriaal',
    gips_fermacell: 'Gips / Fermacell',
    naden_vullen: 'Naden vullen',
    naden_vullen_2: 'Naden vullen',
    afwerkplinten: 'Afwerkplinten',
  };

  const filterMaterialenVoorSectie = useCallback(
    (sectieKey: SectieKey): MateriaalKeuze[] => {
      if (!alleMaterialen) return [];
      if (sectieKey === 'extra' || !!activeGroupId) return alleMaterialen;

      const subsectie = subsectieMapping[sectieKey];
      if (!subsectie) return alleMaterialen;

      return alleMaterialen.filter((m) => m.categorie === subsectie);
    },
    [alleMaterialen, activeGroupId]
  );

  const openMateriaalKiezer = (sectieSleutel: SectieKey, groupId: string | null = null) => {
    setActieveSectie(sectieSleutel);
    setActiveGroupId(groupId);
    setIsExtraModalOpen(true); // ✅ Always use the new modal
  };
  
  const handleMateriaalSelectie = (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => {
    // Logic for "Extra Material" (Global list)
    if (sectieSleutel === 'extra') {
      const newExtra: ExtraMaterial = {
        id: maakId(),
        naam: materiaal.materiaalnaam,
        eenheid: materiaal.eenheid as any,
        prijsPerEenheid: materiaal.prijs,
        usageDescription: '',
      };
      setExtraMaterials((prev) => [...prev, newExtra]);
      return;
    }

    // Logic for Standard Sections (e.g. Balkhout, Isolatie)
    setGekozenMaterialen((prev) => ({ ...prev, [sectieSleutel]: materiaal }));
  };

  const handleSelectForCustomGroup = (groupId: string, material: MateriaalKeuze) => {
    setCustomGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            materials: [...group.materials, { ...material, quantity: 1 }]
          };
        }
        return group;
      })
    );
};

  const handleAddExtraMateriaal = (materiaal: ExtraMaterial) => {
    setExtraMaterials((prev) => [...prev, materiaal]);
  };

  const handleUpdateExtraMateriaal = (materiaal: ExtraMaterial) => {
    setExtraMaterials((prev) => prev.map((m) => (m.id === materiaal.id ? materiaal : m)));
  };

  const handleRemoveExtraMaterial = (idToRemove: string) => {
    setExtraMaterials((prev) => prev.filter((m) => m.id !== idToRemove));
  };

  const handleMateriaalVerwijderen = (sectieSleutel: SectieKey) => {
    setGekozenMaterialen((prev) => {
      const next = { ...prev };
      delete (next as any)[sectieSleutel];
      return next;
    });
  };

  const handleSavePreset = async (presetName: string, isDefault: boolean) => {
    if (!user || !firestore) return;

    const slots: Record<string, string> = {};
    for (const key of Object.keys(gekozenMaterialen || {})) {
      const materiaal = (gekozenMaterialen as any)[key];
      if (materiaal?.id) slots[key] = materiaal.id;
    }

    const newPresetData: Omit<PresetType, 'id'> = {
      userId: user.uid,
      jobType: JOB_KEY,
      name: presetName,
      isDefault,
      slots: slots as any,
      collapsedSections,
      kleinMateriaalConfig: kleinMateriaalConfig as any,
      createdAt: serverTimestamp() as any,
    } as any;

    const batch = writeBatch(firestore);

    if (isDefault) {
      const q = query(
        collection(firestore, 'presets'),
        where('userId', '==', user.uid),
        where('jobType', '==', JOB_KEY),
        where('isDefault', '==', true)
      );

      try {
        const qs = await getDocs(q);
        qs.forEach((d) => batch.update(d.ref, { isDefault: false }));
      } catch (_serverError) {
        const permissionError = new FirestorePermissionError({
          path: `presets`,
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
      }
    }

    const newDocRef = doc(collection(firestore, 'presets'));
    batch.set(newDocRef, newPresetData as any);

    try {
      await batch.commit();
      toast({
        title: 'Werkwijze opgeslagen',
        description: `Werkwijze "${presetName}" is succesvol opgeslagen.`,
      });

      const newPreset = { id: newDocRef.id, ...(newPresetData as any) } as PresetType;

      setPresets((prev) => prev.map((p) => ({ ...p, isDefault: isDefault ? false : p.isDefault })).concat(newPreset));
      setGekozenPresetId(newDocRef.id);
    } catch (_serverError) {
      const permissionError = new FirestorePermissionError({
        path: newDocRef.path,
        operation: 'create',
        requestResourceData: newPresetData as any,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete || !firestore) return;

    const docRef = doc(firestore, 'presets', presetToDelete.id);

    try {
      await deleteDoc(docRef);
      toast({
        title: 'Werkwijze verwijderd',
        description: `De werkwijze "${presetToDelete.name}" is verwijderd.`,
      });

      setPresets((prev) => prev.filter((p) => p.id !== presetToDelete.id));
      if (gekozenPresetId === presetToDelete.id) setGekozenPresetId('default');
    } catch (error) {
      console.error('Fout bij verwijderen werkwijze:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon werkwijze niet verwijderen.',
      });
    } finally {
      setDeleteConfirmationOpen(false);
      setPresetToDelete(null);
      setManagePresetsModalOpen(false);
    }
  };

  const handleSetDefaultPreset = async (presetToSet: PresetType) => {
    if (!user || !firestore || presetToSet.isDefault) return;

    const batch = writeBatch(firestore);

    const currentDefault = presets.find((p) => p.isDefault);
    if (currentDefault) {
      batch.update(doc(firestore, 'presets', currentDefault.id), { isDefault: false });
    }

    batch.update(doc(firestore, 'presets', presetToSet.id), { isDefault: true });

    try {
      await batch.commit();
      toast({
        title: 'Standaard ingesteld',
        description: `"${presetToSet.name}" is nu de standaard werkwijze.`,
      });
      setPresets((prev) => prev.map((p) => ({ ...p, isDefault: p.id === presetToSet.id })));
    } catch (error) {
      console.error('Fout bij instellen standaard werkwijze:', error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kon de standaard werkwijze niet instellen.',
      });
    }
  };

  // ==================================
  // Completeness (UI-only)
  // ==================================
  const isMaterialenComplete = useMemo(() => {
    const heeftKeuze = (k: SectieKey) => !!gekozenMaterialen[k]?.id;

    const requiredKeys: SectieKey[] = [
      'balkhout',
      'isolatie',
      'houten plaatmateriaal',
      'gips_fermacell',
      'naden_vullen',
      'afwerkplinten',
    ];

    for (const k of requiredKeys) {
      if (k === 'naden_vullen') {
        if (!heeftKeuze('naden_vullen')) return false;
        if (!heeftKeuze('naden_vullen_2')) return false;
        continue;
      }
      if (!heeftKeuze(k)) return false;
    }

    return true;
  }, [gekozenMaterialen]);

  // ✅ HANDLER: When user created a BRAND NEW material in the modal
  const handleNewMaterialCreated = async () => {
    await fetchMaterials(); 
    toast({ 
      title: "Succes", 
      description: "Nieuw materiaal aangemaakt en toegevoegd aan uw bibliotheek." 
    });
  };

  // -------------------------------------------

  const handleNext = async () => {
    setIsOpslaan(true);

    try {
      if (!user || !firestore) {
        toast({ variant: 'destructive', title: 'Fout', description: 'U bent niet ingelogd.' });
        return;
      }

      if (!klusId) throw new Error('klusId ontbreekt in de URL.');

      const toegestaneKeys = new Set(sectieSleutels);

      // ✅ BELANGRIJK: Firestore payload klein houden => alleen {id} opslaan
      const schoneSelecties = Object.fromEntries(
        Object.entries(gekozenMaterialen || {})
          .filter(([k, v]: any) => {
            if (!toegestaneKeys.has(k as any)) return false;
            if (k === 'extra' || k === 'klein_materiaal') return false;
            if (!v || typeof v !== 'object') return false;
            if (!v.id) return false;
            return true;
          })
          .map(([k, v]: any) => [k, { id: v.id }])
      );

      const schoneExtra = Array.isArray(extraMaterials)
  ? extraMaterials
      .filter((m: any) => m && (m.naam || m.id))
      .map((m: any) => {
        const c: any = { ...m };

        // 2) haal lege/undefined velden weg (Firestore haat undefined)
        if (c.lengte === '' || c.lengte == null) delete c.lengte;
        if (c.breedte === '' || c.breedte == null) delete c.breedte;
        if (c.aantal === '' || c.aantal == null) delete c.aantal;

        return c;
      })
  : [];


      const ref = doc(firestore, 'quotes', quoteId);

      const werkwijzePayload: FirestoreWerkwijzePayload = {
        workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
        presetLabel: presets.find((p) => p.id === gekozenPresetId)?.name || null,
        savedByUid: user.uid,
      };

      const materialenPayload: FirestoreMaterialenPayload = {
        jobKey: JOB_KEY,
        jobType: 'wanden',
        jobSlug: JOB_KEY,
        selections: schoneSelecties,
        extraMaterials: schoneExtra,
        customGroups: customGroups,
        savedByUid: user.uid,
      };

      const updatePayload: any = {
        [`klussen.${klusId}.materialen`]: materialenPayload,
        [`klussen.${klusId}.werkwijze`]: werkwijzePayload,
      };
      
      if (kleinMateriaalConfig.mode === 'none') {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = deleteField();
      } else {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = {
          mode: kleinMateriaalConfig.mode,
          ...(kleinMateriaalConfig.mode === 'percentage'
            ? { percentage: kleinMateriaalConfig.percentage }
            : {}),
          ...(kleinMateriaalConfig.mode === 'fixed'
            ? { fixedAmount: kleinMateriaalConfig.fixedAmount }
            : {}),
        };
      }
      
      function stripUndefinedDiep(waarde: any): any {
        if (Array.isArray(waarde)) {
          return waarde.map(stripUndefinedDiep);
        }
      
        if (waarde && typeof waarde === 'object') {
          const schoon: any = {};
          for (const [k, v] of Object.entries(waarde)) {
            if (v === undefined) continue;
            schoon[k] = stripUndefinedDiep(v);
          }
          return schoon;
        }
      
        return waarde;
      }


      
// Quotes: UI state nooit opslaan
if (updatePayload?.materialen && 'collapsedSections' in updatePayload.materialen) {
  delete (updatePayload.materialen as any).collapsedSections;
}

const payloadSchoon: any = stripUndefinedDiep(updatePayload);

// Firestore deleteField() mag NOOIT door stripUndefinedDiep heen
await updateDoc(ref, {
  ...payloadSchoon,
  'materialen.collapsedSections': deleteField(),
});



      toast({ title: 'Materialen opgeslagen!' });
      router.push(`/offertes/${quoteId}/overzicht`);
    } catch (error: any) {
      console.error('SAVE ERROR:', error);
      toast({
        variant: 'destructive',
        title: 'Kon materialen niet opslaan',
        description: `Fout: ${error?.message || 'Onbekend'}`,
      });
    } finally {
      setIsOpslaan(false);
    }
  };

  const handleAddCustomGroup = () => {
    const newGroup: CustomGroup = {
      id: maakId(),
      title: '',
      materials: [],
    };
    setCustomGroups(prev => [...prev, newGroup]);
  };

  const handleUpdateCustomGroupTitle = (groupId: string, newTitle: string) => {
    setCustomGroups(prev =>
      prev.map(group => (group.id === groupId ? { ...group, title: newTitle } : group))
    );
  };

  const handleUpdateMaterialQuantity = (groupId: string, materialId: string, quantity: number) => {
    setCustomGroups(prev =>
      prev.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            materials: group.materials.map(mat =>
              mat.id === materialId ? { ...mat, quantity } : mat
            ),
          };
        }
        return group;
      })
    );
  };

  const handleRemoveMaterialFromGroup = (groupId: string, materialId: string) => {
    setCustomGroups(prev =>
      prev.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            materials: group.materials.filter(mat => mat.id !== materialId),
          };
        }
        return group;
      })
    );
  };

  const handleDeleteCustomGroup = (groupId: string) => {
    setCustomGroups(prev => prev.filter(group => group.id !== groupId));
  };

  // --- HELPER: Render Custom Material Groups ---
  const renderExtraMateriaalCompact = () => (
    <div className="space-y-4">
      {/* 1. Render Custom Cards */}
      {customGroups.map((group) => (
        <DynamicMaterialGroup
          key={group.id}
          id={group.id}
          title={group.title}
          materials={group.materials.map((m) => ({ ...m, quantity: m.quantity ?? 1 }))}
          onUpdateTitle={(val) =>
            setCustomGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, title: val } : g)))
          }
          onAddMaterial={() => {
            setActiveGroupId(group.id);
            setIsExtraModalOpen(true);
          }}
          onEditMaterial={() => {
            setActiveGroupId(group.id);
            setIsExtraModalOpen(true);
          }}
          onRemoveMaterial={(matId) =>
            setCustomGroups((prev) =>
              prev.map((g) => (g.id === group.id ? { ...g, materials: g.materials.filter((m: any) => m.id !== matId) } : g))
            )
          }
          onDeleteGroup={() => setCustomGroups((prev) => prev.filter((g) => g.id !== group.id))}
          onUpdateQuantity={(matId, qty) =>
            setCustomGroups((prev) =>
              prev.map((g) =>
                g.id === group.id
                  ? { ...g, materials: g.materials.map((m: any) => (m.id === matId ? { ...m, quantity: qty } : m)) }
                  : g
              )
            )
          }
        />
      ))}

      {/* 2. Container Card with "Add Group" Button */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <CardTitle className="text-lg">Extra materiaal</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-emerald-500 hover:text-emerald-400"
            onClick={() => setCustomGroups((prev) => [...prev, { id: crypto.randomUUID(), title: '', materials: [] }])}
          >
            <Plus className="h-4 w-4" />
            Materiaal toevoegen
          </Button>
        </CardHeader>
      </Card>
    </div>
  );

  // --- RENDER FUNCTION ---
  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];

    // ✅ 1. COLLAPSED STATE (Ghost/Transparent style)
    if (isCollapsed) {
      return (
        <div 
          className="group flex items-center justify-between rounded-lg border border-border/40 bg-muted/5 px-4 py-2 cursor-pointer transition-all hover:bg-muted/20 hover:border-border/60 hover:opacity-100 opacity-60"
          onClick={() => toggleSection(sectieSleutel)}
        >
          <div className="flex flex-col justify-center flex-1 min-w-0 mr-4">
             <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground truncate group-hover:text-foreground transition-colors">
                  {titel}
                </span>
                <span className="text-xs font-normal text-muted-foreground/50 hidden sm:inline-block">
                  · Niet van toepassing
                </span>
             </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
               <button
                type="button"
                className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground/70 group-hover:text-foreground")}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              
              {/* Dropdown Menu for Collapse State */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" onClick={(e) => e.stopPropagation()} className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground hover:text-foreground")}>
                        <MoreHorizontal className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {gekozenMateriaal && (
                        <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); handleMateriaalVerwijderen(sectieSleutel); }}
                            className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Verwijder materiaal</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem 
                        onClick={(e) => { e.stopPropagation(); toggleSection(sectieSleutel); }}
                        className="cursor-pointer flex items-center gap-2"
                    >
                        <ChevronDown className="h-4 w-4" />
                        <span>Openen</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
      );
    }

    // Special handler for the 'Extra Material' section
    if (sectieSleutel === 'extra') {
        return renderExtraMateriaalCompact();
    }

    const showRed = !gekozenMateriaal;

    // ✅ 2. EXPANDED STATE (Standard Card)
    return (
      <Card className={cn('transition-all', showRed && 'border-l-2 border-l-destructive')}>
        
        {/* HEADER: Title (18px) + Chevron + Menu */}
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg font-semibold tracking-tight">{titel}</CardTitle>
          </div>

          <div className="flex items-center gap-1">
             {/* Hide Icon */}
             <button type="button" onClick={() => toggleSection(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground")}>
                <ChevronUp className="h-5 w-5" />
             </button>
             
             {/* 3-Dots Menu (Next to Hide Icon) */}
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground hover:text-foreground")}>
                        <MoreHorizontal className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {gekozenMateriaal ? (
                        <DropdownMenuItem 
                            onClick={() => handleMateriaalVerwijderen(sectieSleutel)}
                            className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Verwijder materiaal</span>
                        </DropdownMenuItem>
                    ) : (
                        <div className="p-2 text-xs text-muted-foreground text-center">Geen opties</div>
                    )}
                    {/* ❌ SLUITEN OPTION REMOVED HERE ❌ */}
                </DropdownMenuContent>
             </DropdownMenu>
          </div>
        </CardHeader>

        {/* CONTENT */}
        <CardContent className="p-4 pt-0">
          <div className="border-t pt-4">
            {isMaterialenLaden ? (
              <div className="h-10 bg-muted/50 rounded animate-pulse" />
            ) : (
              <div className="flex items-center justify-between min-h-[40px]">
                <div>
                  {gekozenMateriaal ? (
                    <p className={cn('text-sm', SELECTED_MATERIAL_TEXT)}>{gekozenMateriaal.materiaalnaam}</p>
                  ) : (
                    <p className="text-sm text-destructive italic">Nog geen materiaal gekozen</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {gekozenMateriaal ? (
                    <button type="button" onClick={() => openMateriaalKiezer(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, "text-foreground/80 whitespace-nowrap")}>
                        <span>Wijzigen</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => openMateriaalKiezer(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, "text-emerald-500 whitespace-nowrap")}>
                        <Plus className="h-4 w-4" />
                        <span>Toevoegen</span>
                    </button>
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
    const sectieSleutel: SectieKey = 'klein_materiaal';
    const isCollapsed = !!collapsedSections[sectieSleutel];

    const isNone = kleinMateriaalConfig.mode === 'none';
    const isPercentage = kleinMateriaalConfig.mode === 'percentage';
    const isFixed = kleinMateriaalConfig.mode === 'fixed';
    const isInschatting = kleinMateriaalConfig.mode === 'inschatting';


    const p = (kleinMateriaalConfig as any)?.percentage;
    const percentageIsValid = typeof p === 'number' && Number.isFinite(p) && p > 0;

    const f = (kleinMateriaalConfig as any)?.fixedAmount;
    const fixedIsValid = typeof f === 'number' && Number.isFinite(f) && f > 0;

    const showPercentageError = isPercentage && !percentageIsValid;
    const showFixedError = isFixed && !fixedIsValid;

    if (isCollapsed) {
      return (
        <div 
          className="group flex items-center justify-between rounded-lg border border-border/40 bg-muted/5 px-4 py-2 cursor-pointer transition-all hover:bg-muted/20 hover:border-border/60 hover:opacity-100 opacity-60"
          onClick={() => toggleSection(sectieSleutel)}
        >
          <div className="flex flex-col justify-center flex-1 min-w-0 mr-4">
             <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground truncate group-hover:text-foreground transition-colors">
                  Klein materiaal
                </span>
                <span className="text-xs font-normal text-muted-foreground/50 hidden sm:inline-block">
                  · Niet van toepassing
                </span>
             </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
               <button
                type="button"
                className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground/70 group-hover:text-foreground")}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
          </div>
        </div>
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Klein materiaal</CardTitle>
          </div>

          <button type="button" onClick={() => toggleSection(sectieSleutel)} className={cn(TEKST_ACTIE_CLASSES, "text-muted-foreground")}>
            <ChevronUp className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <div className="border-t pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div
           
  className={cn(
    'p-4 rounded-lg border cursor-pointer space-y-2 transition-colors',
    kleinMateriaalConfig.mode === 'inschatting'
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : 'hover:border-muted-foreground/30 hover:bg-muted/20'
  )}
  onClick={() => {
    setKleinMateriaalConfig({
      mode: 'inschatting',
      percentage: null as any,
      fixedAmount: null,
    } as any);
    setKleinVastBedragStr('');
  }}
>
  <h4 className="font-semibold">Laat door ons inschatten</h4>
  <p className="text-sm text-muted-foreground">
    We schatten alleen de kosten voor klein materiaal. Hoofdmaterialen worden exact berekend.
  </p>
</div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer space-y-2 transition-colors',
                  isPercentage && percentageIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  isPercentage && !percentageIsValid && 'border-red-500/40 bg-red-500/10',
                  !isPercentage && 'hover:border-muted-foreground/30 hover:bg-muted/20'
                )}
                onClick={() =>
                  setKleinMateriaalConfig((prev) => ({
                    ...prev,
                    mode: 'percentage',
                    percentage: typeof prev.percentage === 'number' ? prev.percentage : null,
                  }))
                }
              >
                <h4 className="font-semibold">Percentage (%)</h4>
                <p className="text-sm text-muted-foreground">Reken een percentage van de totale materiaalkosten.</p>

                {isPercentage && (
                  <div className="pt-2 space-y-2">
                    <Label htmlFor="kleinMateriaalPercentage">Percentage</Label>
                    <div className="relative">
                      <Input
                        id="kleinMateriaalPercentage"
                        type="number"
                        step="0.1"
                        placeholder="0"
                        className="w-full pr-10"
                        value={(kleinMateriaalConfig as any).percentage ?? ''}
                        onChange={(e) =>
                          setKleinMateriaalConfig({
                            ...kleinMateriaalConfig,
                            mode: 'percentage',
                            percentage: e.target.value === '' ? null : Number(e.target.value),
                          } as any)
                        }
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground pointer-events-none">
                        %
                      </span>
                    </div>

                    {showPercentageError && (
                      <p className="text-xs text-red-300">Vul een percentage groter dan 0 in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer space-y-2 transition-colors',
                  isFixed && fixedIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  isFixed && !fixedIsValid && 'border-red-500/40 bg-red-500/10',
                  !isFixed && 'hover:border-muted-foreground/30 hover:bg-muted/20'
                )}
                onClick={() =>
                  setKleinMateriaalConfig((prev) => ({
                    ...prev,
                    mode: 'fixed',
                    fixedAmount: prev.fixedAmount ?? null,
                  }))
                }
              >
                <h4 className="font-semibold">Vast bedrag (€)</h4>
                <p className="text-sm text-muted-foreground">Voeg een vast bedrag toe voor kleine materialen.</p>

                {isFixed && (
                  <div className="pt-2 space-y-2">
                    <Label htmlFor="kleinMateriaalFixedAmount">Bedrag</Label>
                    <EuroInput
                      id="kleinMateriaalFixedAmount"
                      value={kleinVastBedragStr}
                      onChange={(v) => {
                        setKleinVastBedragStr(v);
                        const n = parseNLMoneyToNumber(v);
                        setKleinMateriaalConfig({
                          ...kleinMateriaalConfig,
                          mode: 'fixed',
                          fixedAmount: n === null ? null : n,
                        });
                      }}
                      placeholder="0,00"
                      disabled={isNone}
                    />

                    {showFixedError && (
                      <p className="text-xs text-red-300">Vul een bedrag groter dan 0 in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer space-y-2 transition-colors',
                  isNone ? 'border-emerald-500/40 bg-emerald-500/10' : 'hover:border-muted-foreground/30 hover:bg-muted/20'
                )}
                onClick={() => {
                  setKleinMateriaalConfig({ mode: 'none', percentage: null as any, fixedAmount: null } as any);
                  setKleinVastBedragStr('');
                }}
              >
                <h4 className="font-semibold">Geen</h4>
                <p className="text-sm text-muted-foreground">Geen klein materiaal kosten rekenen.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const progressValue = isMaterialenComplete ? 100 : 75;
  const progressKleur = isMaterialenComplete ? 'bg-emerald-600' : 'bg-primary';

  if (!isMounted) return null;

  return (
    <>
      <main className="flex flex-1 flex-col">
      <header className="border-b bg-background/80 backdrop-blur-xl">
  <div className="pt-3 sm:pt-4 px-4 pb-3 max-w-5xl mx-auto">
    <div className="flex items-center gap-3">
      <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-xl">
        <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden/hsb-voorzetwand`}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>

      <div className="flex-1 text-center">
        <div className="text-sm font-semibold">{JOB_TITEL}</div>

        <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: '80%' }}
          />
        </div>
      </div>

      <div className="w-11">
        {isPaginaLaden ? (
          <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
        ) : null}
      </div>
    </div>
  </div>
</header>


        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-2xl mx-auto w-full">
            {foutMaterialen ? (
              <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {foutMaterialen}
              </div>
            ) : null}

            <div className="mb-8 space-y-2">
              <Label htmlFor="preset-select">Gekozen werkwijze</Label>
              <div className="flex items-center gap-2">
                <Select onValueChange={onPresetChange} value={gekozenPresetId} disabled={isPresetsLaden}>
                  <SelectTrigger
                    id="preset-select"
                    className="hover:bg-muted/40 hover:text-foreground data-[state=open]:bg-muted/40 data-[state=open]:text-foreground"
                  >
                    <SelectValue placeholder="Kies een werkwijze..." />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem className={SELECT_ITEM_GREEN} value="default">
                      Nieuw
                    </SelectItem>
                    {presets.map((p) => (
                      <SelectItem className={SELECT_ITEM_GREEN} key={p.id} value={p.id}>
                        {p.name}
                        {p.isDefault ? ' (standaard)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setManagePresetsModalOpen(true)}
                  disabled={presets.length === 0}
                  aria-label="Beheer werkwijzen"
                  className={cn('h-11 w-11 rounded-xl', ICON_BUTTON_NO_ORANGE)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {renderSelectieRij('balkhout', 'Balkhout')}
              {renderSelectieRij('isolatie', 'Isolatie')}
              {renderSelectieRij('houten plaatmateriaal', 'Houten plaatmateriaal')}
              {renderSelectieRij('gips_fermacell', 'Gips / Fermacell')}
              
              {/* ✅ UPDATED: Split into two separate cards with Dutch titles */}
              {renderSelectieRij('naden_vullen', 'Naden vullen')}
              {renderSelectieRij('naden_vullen_2', 'Naden afwerken')}

              {renderSelectieRij('afwerkplinten', 'Afwerkplinten')}

             <div className="mt-8 space-y-6">
                {renderSelectieRij('extra', 'Extra materiaal')}
                {renderKleinMateriaalSectie()}
            </div>
            </div>

            <div className="mt-8">
            <Button
  variant="outline"
  onClick={() => setSavePresetModalOpen(true)}
  className={cn(
    'w-full transition-colors duration-150 ease-out',
    'hover:bg-emerald-500/14 hover:border-emerald-500/55 hover:text-emerald-100',
    'focus-visible:ring-emerald-500'
  )}
>
  <Save className="mr-2 h-4 w-4" />
  Huidige keuzes opslaan als werkwijze
</Button>

            </div>

            <div className="mt-8 flex justify-between items-center">
              <Button variant="outline" asChild className={cn(TERUG_HOVER_RED)}>
                <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden/hsb-voorzetwand`}>Terug</Link>
              </Button>

              <Button onClick={handleNext} disabled={isOpslaan} className={cn(POSITIVE_BTN_SOFT)}>
                {isOpslaan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isOpslaan ? 'Opslaan...' : 'Volgende'}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <ManagePresetsDialog
        open={managePresetsModalOpen}
        onOpenChange={setManagePresetsModalOpen}
        presets={presets}
        onDelete={(preset) => {
          setPresetToDelete(preset);
          setDeleteConfirmationOpen(true);
        }}
        onSetDefault={handleSetDefaultPreset}
      />

      <AlertDialog open={deleteConfirmationOpen} onOpenChange={setDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              U staat op het punt om de werkwijze "{presetToDelete?.name}" te verwijderen. Deze actie kan niet ongedaan
              worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(SLUITEN_HOVER_RED)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeletePreset()} className={buttonVariants({ variant: 'destructive' })}>
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
      />

      {/* --- NEW MODAL COMPONENT (Replaces the old one) --- */}
      {/* --- NEW MODAL COMPONENT --- */}
      <MaterialSelectionModal
        open={isExtraModalOpen}
        onOpenChange={setIsExtraModalOpen}
        
        showFavorites={actieveSectie !== 'extra' && !activeGroupId}
        // ✅ 1. PASS AUTO-FILTER
        // If we are in a standard section (not extra, not a group), use the mapping.
        defaultCategory={
            (actieveSectie && actieveSectie !== 'extra' && !activeGroupId)
            ? subsectieMapping[actieveSectie]
            : undefined
        }

        // ✅ 2. PASS FAVORITES STATUS
        existingMaterials={alleMaterialen.map((m) => ({ 
            ...m, 
            row_id: m.id,
            isFavorite: favorieten.includes(m.id) // Tell modal if it's a fav
        }))}

        // ✅ 3. HANDLE FAVORITE CLICK
        onToggleFavorite={toggleFavoriet}

        onSelectExisting={(result) => {
          const item = result.data || result;
          
          // 1. If adding to a Custom Group
          if (activeGroupId) {
             const newMat = {
                id: item.id || crypto.randomUUID(),
                materiaalnaam: item.materiaalnaam || item.naam || 'Naamloos',
                eenheid: item.eenheid || 'stuk',
                prijs: Number(item.prijs) || 0,
                quantity: 1,
                categorie: item.categorie ?? null,
                sort_order: null,
             };
             setCustomGroups((prev) =>
               prev.map((g) => 
                 g.id === activeGroupId 
                   ? { ...g, materials: [newMat] } 
                   : g
               )
             );
             setActiveGroupId(null);
          } 
          // 2. If adding to a Standard Section
          else if (actieveSectie && actieveSectie !== 'extra') {
             const chosenMaterial: MateriaalKeuze = {
                id: item.id || crypto.randomUUID(),
                materiaalnaam: item.materiaalnaam || item.naam || 'Naamloos',
                eenheid: item.eenheid || 'stuk',
                prijs: Number(item.prijs) || 0,
                categorie: item.categorie ?? null,
                quantity: 1,
                sort_order: null,
             };
             handleMateriaalSelectie(actieveSectie, chosenMaterial);
             setActieveSectie(null);
          }
          // 3. Fallback (Extra List)
          else {
             const newExtra = {
               id: maakId(),
               naam: item.materiaalnaam || item.naam,
               eenheid: item.eenheid,
               prijsPerEenheid: Number(item.prijs),
               usageDescription: '',
             };
             setExtraMaterials((prev: any) => [...prev, newExtra]);
          }

          setIsExtraModalOpen(false);
        }}

        onMaterialAdded={(newMaterial: any) => {
          fetchMaterials();
          
          if (activeGroupId && newMaterial) {
             const prijsValue = newMaterial.prijs ?? newMaterial.prijsPerEenheid ?? 0;
             const newMat = {
               id: newMaterial.id || crypto.randomUUID(),
               materiaalnaam: newMaterial.materiaalnaam || newMaterial.naam || 'Naamloos',
               eenheid: newMaterial.eenheid || 'stuk',
               prijs: Number(prijsValue) || 0,
               quantity: 1,
               categorie: newMaterial.categorie ?? null,
               sort_order: null, 
             };
             setCustomGroups((prev) =>
               prev.map((g) =>
                 g.id === activeGroupId
                   ? { ...g, materials: [newMat] }
                   : g
               )
             );
             setActiveGroupId(null);
             setIsExtraModalOpen(false);
          } else if (actieveSectie && actieveSectie !== 'extra' && newMaterial) {
             const chosenMaterial: MateriaalKeuze = {
                id: newMaterial.id || crypto.randomUUID(),
                materiaalnaam: newMaterial.materiaalnaam || newMaterial.naam || 'Naamloos',
                eenheid: newMaterial.eenheid || 'stuk',
                prijs: Number(newMaterial.prijs) || 0,
                categorie: newMaterial.categorie ?? null,
                quantity: 1,
                sort_order: null,
             };
             handleMateriaalSelectie(actieveSectie, chosenMaterial);
             setActieveSectie(null);
             setIsExtraModalOpen(false);
          }
        }}
      />
    </>
  );
}