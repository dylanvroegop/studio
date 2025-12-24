'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useRef,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Trash2,
  Settings,
  AlertTriangle,
  Save,
  ChevronUp,
  ChevronDown,
  Star,
  Loader2,
  Pencil,
  Check,
  Plus,
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
  CardDescription,
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
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';

// ==================================
// Styling helpers
// ==================================
const POSITIVE_BTN =
  'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600 focus-visible:ring-offset-0';

const SELECT_ITEM_GREEN =
  'text-foreground ' +
  'focus:bg-emerald-600/15 focus:text-foreground ' +
  'data-[highlighted]:bg-emerald-600/15 data-[highlighted]:text-foreground ' +
  'data-[state=checked]:bg-emerald-600/15 data-[state=checked]:text-foreground';

const SELECTED_MATERIAL_TEXT = 'text-emerald-400';
const ICON_BUTTON_NO_ORANGE = 'hover:bg-muted/50 hover:text-foreground focus-visible:ring-0';

const SELECT_TRIGGER_KEEP_WHITE =
  'text-foreground data-[state=open]:text-foreground data-[state=open]:bg-muted/40';

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

function formatEuroNl(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
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
// Clickable text acties
// ==================================
function TekstActie({
  onClick,
  children,
  className,
  disabled,
  ariaLabel,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-2 min-h-[44px] bg-transparent',
        'hover:bg-transparent hover:text-inherit hover:opacity-90',
        'active:opacity-80',
        'disabled:opacity-40 disabled:pointer-events-none',
        className
      )}
    >
      {children}
    </button>
  );
}

function ToevoegenActie({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <TekstActie
      onClick={onClick}
      className={cn('text-emerald-500 whitespace-nowrap inline-flex items-center gap-1', className)}
      ariaLabel="Toevoegen"
    >
      <Plus className="h-4 w-4" />
      <span>Toevoegen</span>
    </TekstActie>
  );
}

function WijzigenActie({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <TekstActie
      onClick={onClick}
      className={cn('text-foreground/80 whitespace-nowrap inline-flex items-center gap-1', className)}
      ariaLabel="Wijzigen"
    >
      <span>Wijzigen</span>
    </TekstActie>
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
  savedByUid?: string | null;
  collapsedSections?: Record<string, boolean>;
};

type FirestoreWerkwijzePayload = {
  workMethodId?: string | null;
  presetLabel?: string | null;
  savedByUid?: string | null;
};

// Klein materiaal met "Geen"
type KleinMateriaalMode = 'percentage' | 'fixed' | 'none';
type KleinMateriaalConfigLocal = Omit<KleinMateriaalConfig, 'mode'> & { mode: KleinMateriaalMode };

// ==================================
// Header stap punt
// ==================================
function StapPunt({
  index,
  label,
  actief,
  klaar,
  fout,
}: {
  index: number;
  label: string;
  actief?: boolean;
  klaar?: boolean;
  fout?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 transition-colors',
          klaar
            ? 'bg-emerald-600/15 ring-emerald-600/35 text-emerald-400'
            : fout
              ? 'bg-destructive/15 ring-destructive/35 text-destructive'
              : actief
                ? 'bg-primary/10 ring-primary/25 text-primary'
                : 'bg-muted/35 ring-border text-muted-foreground'
        )}
      >
        {klaar ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="text-xs font-semibold">{index}</span>}
      </div>
      <div
        className={cn(
          'truncate text-xs',
          klaar
            ? 'text-emerald-200/90'
            : fout
              ? 'text-destructive'
              : actief
                ? 'text-foreground/85'
                : 'text-muted-foreground'
        )}
      >
        {label}
      </div>
    </div>
  );
}

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
          <Button onClick={handleSave} disabled={!name || isSaving} className={cn(POSITIVE_BTN)}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className={cn(SLUITEN_HOVER_RED)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================================
// MateriaalKiezer Modal
// ==================================
type MateriaalKiezerModalProps = {
  open: boolean;
  sectieSleutel: SectieKey;
  geselecteerdMateriaalId?: string;
  onSluiten: () => void;
  onSelecteren: (sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => void;
  onAddExtra: (materiaal: ExtraMaterial) => void;
  onUpdateExtra: (materiaal: ExtraMaterial) => void;
  materialen: MateriaalKeuze[];
  editExtra?: ExtraMaterial | null;
};

const MateriaalKiezerModal = forwardRef<HTMLDivElement, MateriaalKiezerModalProps>(
  (
    {
      open,
      sectieSleutel,
      geselecteerdMateriaalId,
      onSluiten,
      onSelecteren,
      materialen: initialMaterials,
      onAddExtra,
      onUpdateExtra,
      editExtra,
    },
    _ref
  ) => {
    const { user } = useUser();
    const { toast } = useToast();

    const isExtraMateriaal = sectieSleutel === 'extra';
    const isEditMode = !!editExtra;

    const [zoekterm, setZoekterm] = useState('');
    const [activeTab, setActiveTab] = useState<'eigen' | 'lijst'>('lijst');
    const [favorieten, setFavorieten] = useState<string[]>([]);

    const FAVORITES_LIMIT = 5000;

    const laadFavorieten = useCallback((uid: string): string[] => {
      if (typeof window === 'undefined') return [];
      try {
        const favs = localStorage.getItem(`offertehulp:favorieten:${uid}`);
        return favs ? JSON.parse(favs) : [];
      } catch {
        return [];
      }
    }, []);

    const bewaarFavorieten = useCallback((uid: string, ids: string[]) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(`offertehulp:favorieten:${uid}`, JSON.stringify(ids));
      } catch {}
    }, []);

    const isFavoriet = useCallback((id: string) => favorieten.includes(id), [favorieten]);

    const toggleFavoriet = useCallback(
      (id: string) => {
        if (!user) return;
        const current = laadFavorieten(user.uid);
        let next: string[];

        if (current.includes(id)) next = current.filter((x) => x !== id);
        else {
          if (current.length >= FAVORITES_LIMIT) {
            toast({
              variant: 'destructive',
              title: 'Limiet bereikt',
              description: `U kunt maximaal ${FAVORITES_LIMIT} favorieten opslaan.`,
            });
            return;
          }
          next = [...current, id];
        }

        bewaarFavorieten(user.uid, next);
        setFavorieten(next);
      },
      [user, laadFavorieten, bewaarFavorieten, toast]
    );

    useEffect(() => {
      if (user) setFavorieten(laadFavorieten(user.uid));
      else setFavorieten([]);
    }, [user, laadFavorieten]);

    const [eigenNaam, setEigenNaam] = useState('');
    const [eigenEenheid, setEigenEenheid] = useState<string>('');
    const [eigenPrijs, setEigenPrijs] = useState('');
    const [usageDescription, setUsageDescription] = useState('');
    const [aantal, setAantal] = useState<number | undefined>();

    const [lengte, setLengte] = useState('');
    const [breedte, setBreedte] = useState('');
    const [hoogte, setHoogte] = useState('');

    const [formErrors, setFormErrors] = useState({
      naam: '',
      eenheid: '',
      prijs: '',
      usageDescription: '',
    });

    const requiresDescription = ['doos', 'set'].includes(eigenEenheid);

    useEffect(() => {
      if (!open) return;

      setZoekterm('');

      if (isExtraMateriaal) setActiveTab('eigen');
      else setActiveTab('lijst');

      if (isExtraMateriaal && editExtra) {
        setEigenNaam(editExtra.naam || '');
        setEigenEenheid((editExtra.eenheid as any) || '');
        setEigenPrijs(formatNlMoneyFromNumber(editExtra.prijsPerEenheid ?? null));
        setUsageDescription(editExtra.usageDescription || '');
        setAantal(editExtra.aantal ?? undefined);
      } else {
        setEigenNaam('');
        setEigenEenheid('');
        setEigenPrijs('');
        setUsageDescription('');
        setAantal(undefined);
      }

      setLengte('');
      setBreedte('');
      setHoogte('');
      setFormErrors({ naam: '', eenheid: '', prijs: '', usageDescription: '' });
    }, [open, isExtraMateriaal, editExtra]);

    const gefilterdeMaterialen = useMemo(() => {
      let filtered = initialMaterials;

      if (zoekterm) {
        filtered = filtered.filter((m) =>
          (m.materiaalnaam || '').toLowerCase().includes(zoekterm.toLowerCase())
        );
      }

      const favorieteResultaten = filtered.filter((m) => isFavoriet(m.id));
      const overigeResultaten = filtered.filter((m) => !isFavoriet(m.id));

      return { favorieteResultaten, overigeResultaten };
    }, [zoekterm, initialMaterials, isFavoriet]);

    if (!open) return null;

    const handleSelect = (materiaal: MateriaalKeuze) => {
      if (isExtraMateriaal) {
        const newExtra: ExtraMaterial = {
          id: maakId(),
          naam: materiaal.materiaalnaam,
          eenheid: materiaal.eenheid as any,
          prijsPerEenheid: materiaal.prijs,
          usageDescription: '',
        };
        onAddExtra(newExtra);
        onSluiten();
        return;
      }

      onSelecteren(sectieSleutel, materiaal);
      onSluiten();
    };

    const handleSaveEigen = () => {
      const errors = { naam: '', eenheid: '', prijs: '', usageDescription: '' };
      let hasError = false;

      if (!eigenNaam.trim()) {
        errors.naam = 'Naam is verplicht';
        hasError = true;
      }
      if (!eigenEenheid) {
        errors.eenheid = 'Eenheid is verplicht';
        hasError = true;
      }

      const prijsNum = parseNLMoneyToNumber(eigenPrijs);
      if (prijsNum === null || prijsNum < 0) {
        errors.prijs = 'Geldige prijs is verplicht';
        hasError = true;
      }

      if (requiresDescription && !usageDescription.trim()) {
        errors.usageDescription = 'Beschrijf kort waar dit materiaal voor gebruikt wordt.';
        hasError = true;
      }

      setFormErrors(errors);
      if (hasError || prijsNum === null) return;

      const payload: ExtraMaterial = {
        id: editExtra?.id || maakId(),
        naam: eigenNaam.trim(),
        eenheid: eigenEenheid as any,
        prijsPerEenheid: prijsNum,
        aantal,
        usageDescription: requiresDescription ? usageDescription.trim() : '',
      };

      if (isEditMode) onUpdateExtra(payload);
      else onAddExtra(payload);

      onSluiten();
    };

    const eenheidLabel: Record<string, string> = {
      m1: 'Prijs per meter (€)',
      m2: 'Prijs per m² (€)',
      m3: 'Prijs per m³ (€)',
      stuk: 'Prijs per stuk (€)',
      doos: 'Prijs per doos (€)',
      set: 'Prijs per set (€)',
    };

    const renderMaterialList = (materials: MateriaalKeuze[]) =>
      materials.map((materiaal) => (
        <li
          key={materiaal.id}
          onClick={() => handleSelect(materiaal)}
          className={cn(
            'relative flex w-full cursor-pointer items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors',
            geselecteerdMateriaalId === materiaal.id && 'bg-emerald-600/10'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-11 w-11 flex-shrink-0 rounded-full', ICON_BUTTON_NO_ORANGE, 'hover:bg-muted/50')}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriet(materiaal.id);
            }}
          >
            <Star
              className={cn(
                'h-5 w-5',
                isFavoriet(materiaal.id)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            />
          </Button>

          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'font-medium break-words leading-tight',
                geselecteerdMateriaalId === materiaal.id && 'font-semibold'
              )}
            >
              {materiaal.materiaalnaam}
            </p>

            {/* ✅ één formatter (nl-NL) => komma in UI */}
            <p className="text-xs text-muted-foreground mt-1">
              {formatEuroNl(materiaal.prijs)} • {materiaal.eenheid}
            </p>

            {materiaal.categorie && <p className="text-xs text-muted-foreground">{materiaal.categorie}</p>}
          </div>
        </li>
      ));

    const dialogClass = cn(
      'max-w-2xl w-full',
      isExtraMateriaal && activeTab === 'eigen' ? '' : 'max-h-[85vh] overflow-y-auto'
    );

    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onSluiten();
        }}
      >
        <DialogContent className={cn(dialogClass, DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>
              {isExtraMateriaal
                ? isEditMode
                  ? 'Extra materiaal bewerken'
                  : 'Kies materiaal voor: Extra Materiaal'
                : 'Kies materiaal'}
            </DialogTitle>
            {isExtraMateriaal ? (
              <DialogDescription>Voeg extra materiaal toe of kies uit uw lijst.</DialogDescription>
            ) : null}
          </DialogHeader>

          {isExtraMateriaal ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="eigen">Eigen materiaal toevoegen</TabsTrigger>
                <TabsTrigger value="lijst">Uit lijst kiezen</TabsTrigger>
              </TabsList>

              <TabsContent value="eigen" className="pt-4 space-y-4">
                <div className="space-y-2 px-1">
                  <Label htmlFor="eigen-naam">Materiaalnaam *</Label>
                  <Input id="eigen-naam" value={eigenNaam} onChange={(e) => setEigenNaam(e.target.value)} />
                  {formErrors.naam && <p className="text-sm text-destructive">{formErrors.naam}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
                  <div className="space-y-2">
                    <Label htmlFor="eigen-eenheid">Eenheid *</Label>
                    <Select value={eigenEenheid} onValueChange={setEigenEenheid}>
                      <SelectTrigger id="eigen-eenheid" className={cn(SELECT_TRIGGER_KEEP_WHITE)}>
                        <SelectValue placeholder="Kies eenheid" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className={SELECT_ITEM_GREEN} value="m1">m¹</SelectItem>
                        <SelectItem className={SELECT_ITEM_GREEN} value="m2">m²</SelectItem>
                        <SelectItem className={SELECT_ITEM_GREEN} value="m3">m³</SelectItem>
                        <SelectItem className={SELECT_ITEM_GREEN} value="stuk">stuk</SelectItem>
                        <SelectItem className={SELECT_ITEM_GREEN} value="doos">doos</SelectItem>
                        <SelectItem className={SELECT_ITEM_GREEN} value="set">set</SelectItem>
                      </SelectContent>
                    </Select>
                    {formErrors.eenheid && <p className="text-sm text-destructive">{formErrors.eenheid}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eigen-prijs">{eenheidLabel[eigenEenheid] || 'Prijs per eenheid (€)'} *</Label>
                    <EuroInput id="eigen-prijs" value={eigenPrijs} onChange={setEigenPrijs} placeholder="0,00" />
                    {formErrors.prijs && <p className="text-sm text-destructive">{formErrors.prijs}</p>}
                  </div>
                </div>

                <div className="mt-2 text-xs text-amber-400 p-3 bg-amber-950/80 border border-amber-900 rounded-md flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Controleer uw invoer.</span>
                    <br />
                    Een verkeerde eenheid kan leiden tot een foutieve offerteberekening.
                  </div>
                </div>

                {eigenEenheid === 'm1' && (
                  <div className="space-y-2 px-1">
                    <Label>Lengte (m)</Label>
                    <Input type="number" value={lengte} onChange={(e) => setLengte(e.target.value)} />
                  </div>
                )}
                {eigenEenheid === 'm2' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
                    <div className="space-y-2">
                      <Label>Lengte (m)</Label>
                      <Input type="number" value={lengte} onChange={(e) => setLengte(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Breedte (m)</Label>
                      <Input type="number" value={breedte} onChange={(e) => setBreedte(e.target.value)} />
                    </div>
                  </div>
                )}
                {eigenEenheid === 'm3' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-1">
                    <div className="space-y-2">
                      <Label>Lengte (m)</Label>
                      <Input type="number" value={lengte} onChange={(e) => setLengte(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Breedte (m)</Label>
                      <Input type="number" value={breedte} onChange={(e) => setBreedte(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Hoogte (m)</Label>
                      <Input type="number" value={hoogte} onChange={(e) => setHoogte(e.target.value)} />
                    </div>
                  </div>
                )}

                {(eigenEenheid === 'stuk' || eigenEenheid === 'doos' || eigenEenheid === 'set') && (
                  <div className="space-y-2 px-1">
                    <Label>Aantal</Label>
                    <Input
                      type="number"
                      value={aantal ?? ''}
                      onChange={(e) => setAantal(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                    />
                  </div>
                )}

                {requiresDescription && (
                  <div className="space-y-2 px-1">
                    <Label htmlFor="usage-description">Beschrijving (gebruik) *</Label>
                    <Textarea
                      id="usage-description"
                      value={usageDescription}
                      onChange={(e) => setUsageDescription(e.target.value)}
                      placeholder="Waar wordt dit materiaal voor gebruikt?"
                    />
                    {formErrors.usageDescription && (
                      <p className="text-sm text-destructive">{formErrors.usageDescription}</p>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="lijst" className="pt-4">
                <div className="flex flex-col gap-2 border-b pb-4">
                  <Input
                    type="text"
                    placeholder="Zoek op materiaalnaam..."
                    value={zoekterm}
                    onChange={(e) => setZoekterm(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="mt-4">
                  <ul className="divide-y divide-border">
                    {gefilterdeMaterialen.favorieteResultaten.length > 0 && (
                      <>
                        {renderMaterialList(gefilterdeMaterialen.favorieteResultaten)}
                        {gefilterdeMaterialen.overigeResultaten.length > 0 && (
                          <li className="py-2">
                            <Separator />
                          </li>
                        )}
                      </>
                    )}

                    {renderMaterialList(gefilterdeMaterialen.overigeResultaten)}

                    {initialMaterials.length === 0 && (
                      <li className="p-8 text-center text-muted-foreground">
                        Geen materialen gevonden die voldoen aan de criteria.
                      </li>
                    )}
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="mt-4">
              <div className="flex flex-col gap-2 border-b pb-4">
                <Input
                  type="text"
                  placeholder="Zoek op materiaalnaam..."
                  value={zoekterm}
                  onChange={(e) => setZoekterm(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="mt-4">
                <ul className="divide-y divide-border">
                  {gefilterdeMaterialen.favorieteResultaten.length > 0 && (
                    <>
                      {renderMaterialList(gefilterdeMaterialen.favorieteResultaten)}
                      {gefilterdeMaterialen.overigeResultaten.length > 0 && (
                        <li className="py-2">
                          <Separator />
                        </li>
                      )}
                    </>
                  )}

                  {renderMaterialList(gefilterdeMaterialen.overigeResultaten)}

                  {initialMaterials.length === 0 && (
                    <li className="p-8 text-center text-muted-foreground">
                      Geen materialen gevonden die voldoen aan de criteria.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={onSluiten} className={cn(SLUITEN_HOVER_RED)}>
              Annuleren
            </Button>

            {isExtraMateriaal && activeTab === 'eigen' && (
              <Button onClick={handleSaveEigen} className={cn(POSITIVE_BTN)}>
                {isEditMode ? 'Opslaan' : 'Materiaal toevoegen'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

MateriaalKiezerModal.displayName = 'MateriaalKiezerModal';

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

  // ✅ Supabase materialen ophalen + prijs normaliseren naar number
  useEffect(() => {
    if (!user?.uid) return;

    const fetchMaterials = async () => {
      setMaterialenLaden(true);
      setFoutMaterialen(null);

      // LET OP: hier filter je op 'gebruikerid' (moet echt zo heten in je tabel)
      const { data, error } = await supabase.from('materialen').select('*').eq('gebruikerid', user.uid);

      if (error) {
        console.error('Fout bij ophalen Supabase materialen:', error);
        setFoutMaterialen('Kon materialen niet laden.');
        setAlleMaterialen([]);
        setMaterialenLaden(false);
        return;
      }

      // Sanity check (alleen console) — helpt als kolomnamen ooit anders blijken
      if ((data || []).length && !(data![0] as any).row_id) {
        console.warn('Supabase: verwacht row_id maar niet gevonden. Kolommen:', Object.keys(data![0] as any));
      }

      const getCorrectPrice = (p: unknown): number => {
        if (p === null || p === undefined) return 0;

        if (typeof p === 'number') return Number.isFinite(p) ? p : 0;

        if (typeof p === 'string') {
          const parsed = parseNLMoneyToNumber(p);
          if (parsed === null) {
            console.warn('Ongeldige prijs string uit DB:', p);
            return 0;
          }
          return parsed;
        }

        console.warn('Onverwacht prijs type uit DB:', typeof p, p);
        return 0;
      };

      const materialenData = (data || []).map((m: any) => ({
        ...m,
        id: m.row_id ?? m.id, // ✅ fallback als je ooit id ipv row_id hebt
        prijs: getCorrectPrice(m.prijs),
        categorie: m.subsectie ?? m.categorie ?? null,
      })) as MateriaalKeuze[];

      setAlleMaterialen(materialenData);
      setMaterialenLaden(false);
    };

    fetchMaterials();
  }, [user?.uid]);

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

        const hasSelections = Object.keys(rawSelections || {}).length > 0;
        const hasExtra = Array.isArray(rawExtra) && rawExtra.length > 0;
        const hasKleinMateriaal = !!kmAny;
        const hasWerkwijze = !!werkw?.workMethodId;
        hasSavedConfigRef.current = hasSelections || hasExtra || hasKleinMateriaal || hasWerkwijze;

        const workMethodId = werkw?.workMethodId ?? null;
        setGekozenPresetId(workMethodId ? workMethodId : 'default');

        if (kmAny && typeof kmAny === 'object') {
          const mode: KleinMateriaalMode =
            kmAny.mode === 'none' ? 'none' : kmAny.mode === 'fixed' ? 'fixed' : 'percentage';

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
              aantal: m?.aantal ?? undefined,
              usageDescription: m?.usageDescription ?? '',
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
        kmPreset.mode === 'none' ? 'none' : kmPreset.mode === 'fixed' ? 'fixed' : 'percentage';

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
      if (sectieKey === 'extra') return alleMaterialen;

      const subsectie = subsectieMapping[sectieKey];
      if (!subsectie) return alleMaterialen;

      return alleMaterialen.filter((m) => m.categorie === subsectie);
    },
    [alleMaterialen]
  );

  const openMateriaalKiezer = (sectieSleutel: SectieKey) => {
    setActieveSectie(sectieSleutel);
  };

  const sluitMateriaalKiezer = () => {
    setActieveSectie(null);
    setEditExtra(null);
  };

  const handleMateriaalSelectie = (_sectieSleutel: SectieKey, materiaal: MateriaalKeuze) => {
    if (_sectieSleutel === 'extra') {
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

    setGekozenMaterialen((prev) => ({ ...prev, [_sectieSleutel]: materiaal }));
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
        ? extraMaterials.filter((m: any) => m && (m.id || m.naam))
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
        savedByUid: user.uid,
        collapsedSections,
      };

      await updateDoc(ref, {
        [`klussen.${klusId}.materialen`]: materialenPayload,
        [`klussen.${klusId}.werkwijze`]: werkwijzePayload,
        [`klussen.${klusId}.kleinMateriaal`]: (kleinMateriaalConfig as any) ?? null,
      } as any);

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

  const renderSelectieRij = (sectieSleutel: SectieKey, titel: string) => {
    const gekozenMateriaal = gekozenMaterialen[sectieSleutel];
    const isCollapsed = collapsedSections[sectieSleutel];

    if (isCollapsed) {
      return (
        <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4 shadow-[inset_0_0_4px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-medium text-muted-foreground">
            {titel} <span className="font-normal ml-2">· Niet van toepassing</span>
          </p>

          <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground px-1 py-1 min-h-0">
            <ChevronDown className="h-4 w-4" />
          </TekstActie>
        </div>
      );
    }

    if (sectieSleutel === 'naden_vullen') {
      const gekozen1 = gekozenMaterialen['naden_vullen'];
      const gekozen2 = gekozenMaterialen['naden_vullen_2'];

      const isOk = !!gekozen1 && !!gekozen2;
      const showRed = !isOk;

      return (
        <Card className={cn(showRed && 'border-l-2 border-l-destructive')}>
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">{titel}</CardTitle>
            </div>

            <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground">
              <ChevronUp className="h-5 w-5" />
            </TekstActie>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            <div className="border-t pt-4">
              <div className="flex items-center justify-between min-h-[40px]">
                <div>
                  <p className={cn('text-sm', gekozen1 ? SELECTED_MATERIAL_TEXT : 'text-destructive')}>
                    {gekozen1 ? gekozen1.materiaalnaam : 'Nog geen materiaal gekozen'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {gekozen1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMateriaalVerwijderen('naden_vullen')}
                      className={cn(
                        'h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-transparent',
                        ICON_BUTTON_NO_ORANGE
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}

                  {gekozen1 ? (
                    <WijzigenActie onClick={() => openMateriaalKiezer('naden_vullen')} />
                  ) : (
                    <ToevoegenActie onClick={() => openMateriaalKiezer('naden_vullen')} />
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between min-h-[40px]">
                <div>
                  <p className={cn('text-sm', gekozen2 ? SELECTED_MATERIAL_TEXT : 'text-destructive')}>
                    {gekozen2 ? gekozen2.materiaalnaam : 'Nog geen materiaal gekozen'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {gekozen2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMateriaalVerwijderen('naden_vullen_2')}
                      className={cn(
                        'h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-transparent',
                        ICON_BUTTON_NO_ORANGE
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}

                  {gekozen2 ? (
                    <WijzigenActie onClick={() => openMateriaalKiezer('naden_vullen_2')} />
                  ) : (
                    <ToevoegenActie onClick={() => openMateriaalKiezer('naden_vullen_2')} />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (sectieSleutel === 'naden_vullen_2') return null;

    if (sectieSleutel === 'extra') {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">{titel}</CardTitle>
            </div>

            <div className="flex items-center gap-2">
              <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground">
                <ChevronUp className="h-5 w-5" />
              </TekstActie>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            <div className="border-t pt-4">
              {extraMaterials.length === 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground italic">Nog geen extra materiaal toegevoegd</p>

                  <ToevoegenActie
                    onClick={() => {
                      setEditExtra(null);
                      openMateriaalKiezer('extra');
                    }}
                  />
                </div>
              ) : (
                <ul className="space-y-3">
                  {extraMaterials.map((mat) => (
                    <li key={mat.id} className="flex items-start justify-between text-sm">
                      <div className="min-w-0">
                        {/* ✅ GEEN toFixed => nl-NL formatter => komma */}
                        <p className="font-medium break-words">
                          {mat.naam} – {formatEuroNl(mat.prijsPerEenheid)} / {mat.eenheid}
                        </p>
                        {typeof (mat as any).aantal === 'number' ? (
                          <p className="text-xs text-muted-foreground">Aantal: {(mat as any).aantal}</p>
                        ) : null}
                        {(mat as any).usageDescription ? (
                          <p className="text-xs text-muted-foreground">{(mat as any).usageDescription}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <TekstActie
                          onClick={() => {
                            setEditExtra(mat);
                            openMateriaalKiezer('extra');
                          }}
                          className="text-foreground/80"
                        >
                          <Pencil className="h-4 w-4" />
                          Bewerken
                        </TekstActie>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveExtraMaterial(mat.id)}
                          className={cn(
                            'h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-transparent',
                            ICON_BUTTON_NO_ORANGE
                          )}
                          aria-label="Verwijder extra materiaal"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    const showRed = !gekozenMateriaal;

    return (
      <Card className={cn(showRed && 'border-l-2 border-l-destructive')}>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">{titel}</CardTitle>
          </div>

          <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground">
            <ChevronUp className="h-5 w-5" />
          </TekstActie>
        </CardHeader>

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
                  {gekozenMateriaal && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMateriaalVerwijderen(sectieSleutel)}
                      className={cn(
                        'h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-transparent',
                        ICON_BUTTON_NO_ORANGE
                      )}
                      aria-label="Verwijder materiaal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}

                  {gekozenMateriaal ? (
                    <WijzigenActie onClick={() => openMateriaalKiezer(sectieSleutel)} />
                  ) : (
                    <ToevoegenActie onClick={() => openMateriaalKiezer(sectieSleutel)} />
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

    const p = (kleinMateriaalConfig as any)?.percentage;
    const percentageIsValid = typeof p === 'number' && Number.isFinite(p) && p > 0;

    const f = (kleinMateriaalConfig as any)?.fixedAmount;
    const fixedIsValid = typeof f === 'number' && Number.isFinite(f) && f > 0;

    const showPercentageError = isPercentage && !percentageIsValid;
    const showFixedError = isFixed && !fixedIsValid;

    if (isCollapsed) {
      return (
        <div className="flex items-center justify-between rounded-lg border bg-card text-card-foreground p-4 shadow-[inset_0_0_4px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-medium text-muted-foreground">
            Klein materiaal <span className="font-normal ml-2">· Niet van toepassing</span>
          </p>

          <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground px-1 py-1 min-h-0">
            <ChevronDown className="h-4 w-4" />
          </TekstActie>
        </div>
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Klein materiaal</CardTitle>
          </div>

          <TekstActie onClick={() => toggleSection(sectieSleutel)} className="text-muted-foreground">
            <ChevronUp className="h-5 w-5" />
          </TekstActie>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <div className="border-t pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className={cn('h-full rounded-full transition-all', progressKleur)} style={{ width: `${progressValue}%` }} />
                </div>

              <div className="w-11">{isPaginaLaden ? <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" /> : null}</div>
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
              {renderSelectieRij('naden_vullen', 'Naden vullen')}
              {renderSelectieRij('afwerkplinten', 'Afwerkplinten')}
              {renderSelectieRij('extra', 'Extra materiaal')}
              {renderKleinMateriaalSectie()}
            </div>

            <div className="mt-8">
              <Button
                variant="outline"
                onClick={() => setSavePresetModalOpen(true)}
                className={cn(
                  'w-full',
                  'hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
                  'focus-visible:ring-emerald-600'
                )}
              >
                <Save className="mr-2 h-4 w-4" /> Huidige keuzes opslaan als werkwijze
              </Button>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <Button variant="outline" asChild className={cn(TERUG_HOVER_RED)}>
                <Link href={`/offertes/${quoteId}/klus/${klusId}/wanden/hsb-voorzetwand`}>Terug</Link>
              </Button>

              <Button onClick={handleNext} disabled={isOpslaan} className={cn(POSITIVE_BTN)}>
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

      <MateriaalKiezerModal
        open={!!actieveSectie}
        sectieSleutel={actieveSectie as SectieKey}
        geselecteerdMateriaalId={
          actieveSectie && actieveSectie !== 'extra' ? gekozenMaterialen[actieveSectie]?.id : undefined
        }
        onSluiten={sluitMateriaalKiezer}
        onSelecteren={handleMateriaalSelectie}
        onAddExtra={handleAddExtraMateriaal}
        onUpdateExtra={handleUpdateExtraMateriaal}
        editExtra={editExtra}
        materialen={actieveSectie ? filterMaterialenVoorSectie(actieveSectie) : []}
      />
    </>
  );
}
