/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search, Filter, ArrowLeft, ChevronDown, Star, Pencil, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { PriceImportRequestForm } from '@/components/PriceImportRequestForm';
import { cn } from '@/lib/utils';
import { reportOperationalError } from '@/lib/report-operational-error';

// Centralized logic for naming.
function constructFinalName(baseName: string): string {
  return (baseName || '').trim();
}

function parsePriceToNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
  if (typeof raw !== 'string') return null;

  let value = raw.trim();
  value = value.replace(/€/g, '').replace(/\s+/g, '');
  value = value.replace(/[^0-9.,-]/g, ''); // Keep only numbers, dots, commas, dashes
  if (!value) return null;

  // Handle European vs US number formats
  const hasDot = value.includes('.');
  const hasComma = value.includes(',');

  if (hasDot && hasComma) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    value = value.replace(',', '.');
  }

  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
}

function mergeSafetyAnswerIntoNaam(naam: string, antwoord: string): string {
  const cleanNaam = naam.trim();
  const cleanAntwoord = antwoord.trim();
  if (!cleanAntwoord) return cleanNaam;

  if (cleanNaam.toLowerCase().includes(cleanAntwoord.toLowerCase())) {
    return cleanNaam;
  }

  return `${cleanNaam} ${cleanAntwoord}`.replace(/\s+/g, ' ').trim();
}

function inferUnitFromQuestion(question: string): string {
  const q = (question || '').toLowerCase();
  if (!q) return '';

  const beforeOf = q.split(/\sof\s/)[0] || q;
  const unitMatch =
    beforeOf.match(/\b(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)\b/i) ||
    q.match(/\b(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)\b/i);

  return unitMatch?.[1]?.trim() || '';
}

function applySafetyUnit(answer: string, expectedUnit: string, question: string): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) return cleanAnswer;
  if (/[a-zA-Z]/.test(cleanAnswer)) return cleanAnswer;

  const unit = (expectedUnit || inferUnitFromQuestion(question)).trim();
  if (!unit) return cleanAnswer;

  if (/^\d+([.,]\d+)?$/.test(cleanAnswer)) {
    if (/^(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)$/i.test(unit)) {
      return `${cleanAnswer}${unit}`;
    }
    return `${cleanAnswer} ${unit}`;
  }

  return `${cleanAnswer} ${unit}`.replace(/\s+/g, ' ').trim();
}

function isVerbruikPerM2Question(question: string, expectedUnit: string): boolean {
  const q = `${question || ''} ${expectedUnit || ''}`.toLowerCase();
  if (!q.trim()) return false;

  const hasPerM2 = /(\/m2|\/m²|per\s*m2|per\s*m²|\bm2\b|\bm²\b)/i.test(q);
  const hasVerbruikWord = /(verbruik|consumptie|dosering|gebruik)/i.test(q);

  return hasPerM2 && hasVerbruikWord;
}

function parseVerbruikPerM2Answer(answer: string): number | null {
  const raw = (answer || '').trim().replace(/\u00a0/g, ' ');
  if (!raw) return null;

  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(6));
}

type SafetyQuestion = {
  key: string;
  targetField: string;
  question: string;
  expectedUnit: string;
  valueType: string;
};

function extractSafetyPrompt(input: unknown): { ready?: boolean; questions: SafetyQuestion[] } {
  if (input == null) return { questions: [] };

  let candidate: unknown = input;

  if (Array.isArray(candidate)) {
    candidate = candidate.find((item) => item && typeof item === 'object') ?? candidate[0];
  }

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { questions: [] };
    }
  }

  if (candidate && typeof candidate === 'object' && 'output' in (candidate as Record<string, unknown>)) {
    const output = (candidate as Record<string, unknown>).output;
    if (typeof output === 'string') {
      try {
        candidate = JSON.parse(output);
      } catch {
        candidate = output;
      }
    } else if (output && typeof output === 'object') {
      candidate = output;
    }
  }

  if (!candidate || typeof candidate !== 'object') return { questions: [] };

  const obj = candidate as Record<string, unknown>;
  const normalizeQuestion = (raw: unknown): SafetyQuestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const question = typeof row.question === 'string'
      ? row.question.trim()
      : (typeof row.vraag === 'string' ? row.vraag.trim() : '');
    if (!question) return null;

    const key = typeof row.key === 'string' && row.key.trim()
      ? row.key.trim()
      : (typeof row.code === 'string' && row.code.trim()
        ? row.code.trim()
        : 'naam_suffix');
    const expectedUnitRaw =
      row.expected_unit ??
      row.expectedUnit ??
      row.answer_unit ??
      row.answerUnit ??
      row.eenheid ??
      row.unit;
    const expectedUnit = typeof expectedUnitRaw === 'string' ? expectedUnitRaw.trim() : '';
    const targetField = typeof row.target_field === 'string' && row.target_field.trim()
      ? row.target_field.trim()
      : (typeof row.targetField === 'string' && row.targetField.trim()
        ? row.targetField.trim()
        : (key === 'verbruik_per_m2' ? 'verbruik_per_m2' : 'naam_suffix'));
    const valueType = typeof row.value_type === 'string' && row.value_type.trim()
      ? row.value_type.trim()
      : (typeof row.valueType === 'string' && row.valueType.trim() ? row.valueType.trim() : 'text');

    return { key, targetField, question, expectedUnit, valueType };
  };

  const questionsRaw = Array.isArray(obj.questions) ? obj.questions : [];
  const questions = questionsRaw
    .map((entry) => normalizeQuestion(entry))
    .filter((entry): entry is SafetyQuestion => Boolean(entry));

  if (questions.length === 0) {
    const legacyQuestion = normalizeQuestion({
      key: 'naam_suffix',
      target_field: 'naam_suffix',
      question: obj.question ?? obj.vraag,
      expected_unit: obj.expected_unit ?? obj.expectedUnit ?? obj.answer_unit ?? obj.answerUnit ?? obj.eenheid ?? obj.unit,
      value_type: 'text',
    });
    if (legacyQuestion) questions.push(legacyQuestion);
  }

  const ready = typeof obj.ready === 'boolean' ? obj.ready : undefined;
  return { ready, questions };
}

function formatPriceInput(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

// Logic to show estimated price in the red check bar
// In 'Los Artikel' mode (per stuk/doos/etc), the price entered IS the price per piece.
function calculatePiecePrice(price: number): number | null {
  return price;
}

function formatEuro(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function normalizeFilterValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim();
}

function isLooseFilterMatch(haystackRaw: unknown, needleRaw: unknown): boolean {
  const haystack = normalizeFilterValue(haystackRaw);
  const needle = normalizeFilterValue(needleRaw);
  if (!haystack || !needle) return false;
  return haystack === needle || haystack.includes(needle) || needle.includes(haystack);
}

function getMaterialSubCategory(material: ExistingMaterial): string {
  const value =
    (material as any).subsectie ??
    (material as any).sub_categorie ??
    (material as any).subcategorie ??
    (material as any).subCategory ??
    (material as any).subsection ??
    null;
  return typeof value === 'string' ? value.trim() : '';
}

function getMaterialMainCategory(material: ExistingMaterial): string {
  const value =
    (material as any).categorie ??
    (material as any).main_categorie ??
    null;
  return typeof value === 'string' ? value.trim() : '';
}

// ==========================================
// 2. SUB-COMPONENTS
// ==========================================

function InputMetSuffix(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix: string;
}) {
  const { value, onChange, placeholder, suffix } = props;
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9.,]/g, '');
          onChange(val);
        }}
        onKeyDown={(e) => {
          if (['e', 'E', '+', '-'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        placeholder={placeholder}
        type="text"
        inputMode="decimal" // Better for mobile keyboards
        className="pr-12"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </div>
    </div>
  );
}

// ==========================================
// 3. TYPES & MAIN COMPONENT
// ==========================================

const EENHEDEN: string[] = ['m1', 'm2', 'p/m1', 'p/m2', 'p/m3', 'stuk', 'doos', 'set', 'koker', 'zak'];
const FAVORITE_SUBCATEGORY_FILTER = '__favorites__';


export type ExistingMaterial = {
  row_id: string;
  id: string;
  materiaalnaam: string | null;
  prijs: number | string | null;
  prijs_per_stuk?: number | string | null;
  eenheid: string | null;
  subsectie?: string | null;
  leverancier?: string | null;
  isFavorite?: boolean;
  wastePercentage?: number | null;
  order_id?: number | null;
  [key: string]: any;
};

interface MaterialSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId?: string;
  klusId?: string;
  existingMaterials?: ExistingMaterial[];
  onSelectExisting?: (material: ExistingMaterial) => void;
  onMaterialAdded?: (material: any) => void;
  onPendingMaterialQueued?: (payload: { clientId: string; placeholderMaterial: any; draftPayload: Record<string, unknown> }) => void;
  onPendingMaterialQuestion?: (payload: { clientId: string; questions: SafetyQuestion[]; draftPayload: Record<string, unknown> }) => void;
  onPendingMaterialResolved?: (payload: { clientId: string; material: any }) => void;
  onPendingMaterialFailed?: (payload: { clientId: string; error: string }) => void;
  defaultCategory?: string | string[];
  onToggleFavorite?: (id: string) => void;
  showFavorites?: boolean;
  categoryTitle?: string;
  initialWastePercentage?: number;
  onUpdateWaste?: (percentage: number) => void;
  selectedMaterialId?: string;
  onCategoryFilterChange?: (nextCategoryFilter: string | string[]) => void;
  nameContainsFilter?: string | string[];
}

export function MaterialSelectionModal({
  open,
  onOpenChange,
  quoteId,
  klusId,
  existingMaterials = [],
  onSelectExisting,
  onMaterialAdded,
  onPendingMaterialQueued,
  onPendingMaterialQuestion,
  onPendingMaterialResolved,
  onPendingMaterialFailed,
  defaultCategory,
  onToggleFavorite,
  showFavorites = true,
  categoryTitle,
  initialWastePercentage = 0,
  onUpdateWaste,
  selectedMaterialId,
  onCategoryFilterChange,
  nameContainsFilter
}: MaterialSelectionModalProps) {

  const [step, setStep] = useState<'search' | 'choice' | 'form'>('search');
  const [savingCustom, setSavingCustom] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Waste Percentage State
  const [wastePercentage, setWastePercentage] = useState<number>(initialWastePercentage || 0);
  const [isEditingWaste, setIsEditingWaste] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | string[]>('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState<string | string[]>('all');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [quickCategoryPickerOpen, setQuickCategoryPickerOpen] = useState(false);
  const [quickCategorySearchTerm, setQuickCategorySearchTerm] = useState('');
  const [priceImportDialogOpen, setPriceImportDialogOpen] = useState(false);
  const [favoriteSubCategories, setFavoriteSubCategories] = useState<string[]>([]);
  const [shouldApplyFavoriteOnOpen, setShouldApplyFavoriteOnOpen] = useState(false);
  const [shouldApplyDefaultSubCategoryOnOpen, setShouldApplyDefaultSubCategoryOnOpen] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);
  const quickCategoryPickerRef = useRef<HTMLDivElement | null>(null);

  // Edit State
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const showDevCopyButton = process.env.NODE_ENV === 'development';

  // Form State
  const [customNaam, setCustomNaam] = useState<string>('');
  const [customEenheid, setCustomEenheid] = useState<string>('');
  const [customPrijs, setCustomPrijs] = useState<string>('');
  const [customPrijsExclBtw, setCustomPrijsExclBtw] = useState<string>('');
  const [customCategorie, setCustomCategorie] = useState<string>('');
  const [customSubsectie, setCustomSubsectie] = useState<string>('');
  const [customLeverancier, setCustomLeverancier] = useState<string>('');
  const [safetyDialogOpen, setSafetyDialogOpen] = useState(false);
  const [safetyQuestion, setSafetyQuestion] = useState('');
  const [safetyExpectedUnit, setSafetyExpectedUnit] = useState('');
  const [safetyAnswer, setSafetyAnswer] = useState('');
  const [safetyAnswerError, setSafetyAnswerError] = useState<string | null>(null);

  // --- AUTOCOMPLETE FOCUS STATES ---
  const [categorieDropdownOpen, setCategorieDropdownOpen] = useState(false);
  const [subsectieDropdownOpen, setSubsectieDropdownOpen] = useState(false);
  const [leverancierDropdownOpen, setLeverancierDropdownOpen] = useState(false);

  const subCategoryPreferenceScope = useMemo(() => {
    const scopeRaw = categoryTitle || (Array.isArray(defaultCategory) ? defaultCategory.join(',') : defaultCategory) || 'default';
    return scopeRaw.toLowerCase().trim().replace(/\s+/g, '_');
  }, [categoryTitle, defaultCategory]);

  const favoriteSubCategoryKey = useMemo(() => {
    return `material_selection_modal_subcategory_favs_${subCategoryPreferenceScope}`;
  }, [categoryTitle, defaultCategory]);

  // --- RESET ON OPEN ---
  // --- RESET ON OPEN ---
  useEffect(() => {
    if (open) {
      console.log('[DEBUG] MaterialSelectionModal opened. existingMaterials count:', existingMaterials?.length);
      if (existingMaterials?.length > 0) {
        console.log('[DEBUG] First 3 materials:', existingMaterials.slice(0, 3));
      } else {
        console.log('[DEBUG] existingMaterials is empty or undefined');
      }

      const savedFavoritesRaw =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(favoriteSubCategoryKey)
          : null;
      const savedFavorites = (() => {
        if (!savedFavoritesRaw) return [];
        try {
          const parsed = JSON.parse(savedFavoritesRaw);
          return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') as string[] : [];
        } catch {
          return [];
        }
      })();

      // 1. Reset UI Flow
      setStep('search');
      setError(null);
      setSearchTerm('');
      setCategoryFilter(defaultCategory || 'all');
      setSubCategoryFilter([]);
      setCategorySearchTerm('');
      setCategoryPickerOpen(false);
      setQuickCategorySearchTerm('');
      setQuickCategoryPickerOpen(false);
      setPriceImportDialogOpen(false);
      setFavoriteSubCategories(savedFavorites);
      setShouldApplyFavoriteOnOpen(true);
      setShouldApplyDefaultSubCategoryOnOpen(true);
      setDisplayLimit(50);

      // 2. Reset Form Fields (CLEAN SLATE)
      setCustomNaam('');
      setCustomEenheid('stuk');
      setCustomPrijs('');
      setCustomPrijsExclBtw('');
      setCustomCategorie('');
      setCustomSubsectie('');
      setCustomLeverancier('');
      setSafetyDialogOpen(false);
      setSafetyQuestion('');
      setSafetyExpectedUnit('');
      setSafetyAnswer('');
      setSafetyAnswerError(null);

      // 3. Reset Waste
      setWastePercentage(initialWastePercentage || 0);
      setIsEditingWaste(false);

      // 4. Reset Edit State
      setEditingMaterialId(null);
    }
  }, [open, defaultCategory, initialWastePercentage, favoriteSubCategoryKey]);

  useEffect(() => {
    setDisplayLimit(50);
  }, [searchTerm, categoryFilter, subCategoryFilter]);

  // --- SEARCH LOGIC ---

  // Order defined by src/lib/categorylist.md

  const uniqueCategories = useMemo(() => {
    const CATEGORY_ORDER = [
      "Vuren ruw", "Vuren geschaafd", "Ribben, sls, rachels", "Plinten & koplatten", "Hardhout geschaafd", "Merantie",
      "Vloer-rabat-vellingdelen", "Underlayment", "Interieur Platen", "Exterieur platen", "Deurbeslag", "Binnendeuren",
      "Buitendeuren", "Kozijnhout", "Montage kozijnen", "Metalstud profielen", "Gipsplaten", "Brandwerende platen", "Stucwerk", "Rockpanel", "Kikern",
      "Glaswol", "Steenwol", "Pir", "Eps", "Xps", "Folieën", "Dpc", "Lood", "Loodvervanger", "Epdm folie", "Epdm benodigdheden",
      "Epdm afvoeren", "Dakrollen", "Asfaltsingels", "Betonpannen", "Gebakken pannen", "Flexim", "Bitumen golfplaten",
      "Polyester golfplaten", "Pvc golfplaten", "Vezelcement golfplaten", "Golfplaat afdichting en bevestiging", "Velux",
      "Keylite", "Lichtkoepels", "Daktoebehoren", "Ubbink"
    ];

    const cats = new Set(
      existingMaterials
        .map((m) => getMaterialMainCategory(m))
        .filter((value) => value.length > 0)
    );
    const list = Array.from(cats) as string[];

    return list.sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a);
      const idxB = CATEGORY_ORDER.indexOf(b);

      // Both in list -> sort by index
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      // Only A in list -> A comes first
      if (idxA !== -1) return -1;
      // Only B in list -> B comes first
      if (idxB !== -1) return 1;
      // Neither in list -> sort alphabetical
      return a.localeCompare(b);
    });
  }, [existingMaterials]);

  const uniqueLeveranciers = useMemo(() => {
    const levs = new Set(existingMaterials.map(m => m.leverancier).filter(Boolean));
    return Array.from(levs).sort() as string[];
  }, [existingMaterials]);

  const filteredSidebarCategories = useMemo(() => {
    const query = categorySearchTerm.trim().toLowerCase();
    const base = !query
      ? uniqueCategories
      : uniqueCategories.filter((cat) => cat.toLowerCase().includes(query));

    const selected = Array.isArray(categoryFilter)
      ? categoryFilter[0]
      : categoryFilter;

    if (
      selected &&
      selected !== 'all' &&
      !base.includes(selected) &&
      (!query || selected.toLowerCase().includes(query))
    ) {
      return [selected, ...base];
    }

    return base;
  }, [uniqueCategories, categorySearchTerm, categoryFilter]);

  const selectedCategoryLabel = useMemo(() => {
    if (Array.isArray(categoryFilter)) return categoryFilter.join(', ');
    if (categoryFilter === 'all') return 'Toon alles';
    return categoryFilter;
  }, [categoryFilter]);

  const selectedCategoryForNewMaterial = useMemo(() => {
    if (Array.isArray(categoryFilter)) return categoryFilter[0] || '';
    if (!categoryFilter || categoryFilter === 'all') return '';
    return categoryFilter;
  }, [categoryFilter]);

  const selectedSubCategoryForNewMaterial = useMemo(() => {
    const selected = subCategoryFilter === 'all'
      ? []
      : Array.isArray(subCategoryFilter)
        ? subCategoryFilter
        : [subCategoryFilter];

    const explicitSelections = selected.filter((value) => value !== FAVORITE_SUBCATEGORY_FILTER);
    if (explicitSelections.length === 1) return explicitSelections[0];
    return '';
  }, [subCategoryFilter]);

  const quickFilteredCategories = useMemo(() => {
    const query = quickCategorySearchTerm.trim().toLowerCase();
    const base = !query
      ? uniqueCategories
      : uniqueCategories.filter((cat) => cat.toLowerCase().includes(query));

    const selected = Array.isArray(categoryFilter)
      ? categoryFilter[0]
      : categoryFilter;

    if (
      selected &&
      selected !== 'all' &&
      !base.includes(selected) &&
      (!query || selected.toLowerCase().includes(query))
    ) {
      return [selected, ...base];
    }

    return base;
  }, [uniqueCategories, quickCategorySearchTerm, categoryFilter]);

  const formCategoryOptions = useMemo(() => {
    const options = new Set<string>(uniqueCategories);
    if (selectedCategoryForNewMaterial) {
      options.add(selectedCategoryForNewMaterial);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [uniqueCategories, selectedCategoryForNewMaterial]);

  const { normalizedNameContainsFilters, normalizedDefaultSubCategoryFilters } = useMemo(() => {
    const rawValues = Array.isArray(nameContainsFilter)
      ? nameContainsFilter
      : typeof nameContainsFilter === 'string'
        ? nameContainsFilter.split(',')
        : [];

    const normalizedValues = rawValues
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const nameFilters: string[] = [];
    const defaultSubCategoryFilters: string[] = [];

    normalizedValues.forEach((value) => {
      if (value.startsWith('subcat:')) {
        const parsed = value.replace(/^subcat:/, '').trim();
        if (parsed) defaultSubCategoryFilters.push(parsed);
        return;
      }
      if (value.startsWith('name:')) {
        const parsed = value.replace(/^name:/, '').trim();
        if (parsed) nameFilters.push(parsed);
        return;
      }

      // IMPORTANT:
      // Plain ultra filters (e.g. "osb") are "default subcategory picks" only.
      // They must NOT hard-filter the material list, otherwise users lose the
      // other subcategories (or see an empty list when there is no direct match).
      // Use `name:` when strict name/subcategory narrowing is explicitly needed.
      defaultSubCategoryFilters.push(value);
    });

    return {
      normalizedNameContainsFilters: nameFilters,
      normalizedDefaultSubCategoryFilters: defaultSubCategoryFilters,
    };
  }, [nameContainsFilter]);

  useEffect(() => {
    if (!open) return;
    setShouldApplyDefaultSubCategoryOnOpen(true);
  }, [open, normalizedDefaultSubCategoryFilters.join('|')]);

  const isSubCategorySelected = (subCategory: string): boolean => {
    if (subCategoryFilter === 'all') return false;
    return Array.isArray(subCategoryFilter) && subCategoryFilter.includes(subCategory);
  };

  const isAllSubCategoriesSelected = subCategoryFilter === 'all' || (Array.isArray(subCategoryFilter) && subCategoryFilter.length === 0);

  const isMultiSelectableSubCategory = (
    subCategory: string,
    allowPendingFavorite = false
  ): boolean => {
    if (subCategory === FAVORITE_SUBCATEGORY_FILTER) return true;
    return favoriteSubCategories.includes(subCategory) || allowPendingFavorite;
  };

  const toggleSubCategorySelection = (
    subCategory: string,
    allowPendingFavorite = false
  ): void => {
    const current = subCategoryFilter === 'all'
      ? []
      : Array.isArray(subCategoryFilter)
        ? subCategoryFilter
        : [subCategoryFilter];

    if (current.includes(subCategory)) {
      const next = current.filter((item) => item !== subCategory);
      setSubCategoryFilter(next.length > 0 ? next : 'all');
      return;
    }

    const canUseMultiSelect = isMultiSelectableSubCategory(subCategory, allowPendingFavorite);
    if (!canUseMultiSelect) {
      setSubCategoryFilter([subCategory]);
      return;
    }

    const currentSupportsMultiSelect = current.every((item) => isMultiSelectableSubCategory(item));
    if (!currentSupportsMultiSelect) {
      setSubCategoryFilter([subCategory]);
      return;
    }

    setSubCategoryFilter([...current, subCategory]);
  };

  const toggleFavoriteSubCategory = (subCategory: string): void => {
    const isCurrentlyFavorite = favoriteSubCategories.includes(subCategory);
    if (isCurrentlyFavorite) {
      setFavoriteSubCategories((prev) => prev.filter((item) => item !== subCategory));
      if (isSubCategorySelected(subCategory)) {
        toggleSubCategorySelection(subCategory);
      }
      return;
    }

    setFavoriteSubCategories((prev) => [...prev, subCategory]);
    if (!isSubCategorySelected(subCategory)) {
      toggleSubCategorySelection(subCategory, true);
    }
  };

  // Filtered autocomplete suggestions based on current input
  const formSubsectionOptions = useMemo(() => {
    const options = new Set<string>();
    const normalizedFormCategory = normalizeFilterValue(customCategorie);
    const normalizedSelectedCategory = normalizeFilterValue(selectedCategoryForNewMaterial);

    const sourceMaterials = normalizedFormCategory
      ? existingMaterials.filter((material) =>
        isLooseFilterMatch(getMaterialMainCategory(material), normalizedFormCategory)
      )
      : normalizedSelectedCategory
        ? existingMaterials.filter((material) =>
          isLooseFilterMatch(getMaterialMainCategory(material), normalizedSelectedCategory)
        )
        : existingMaterials;

    sourceMaterials.forEach((material) => {
      const subCategory = getMaterialSubCategory(material);
      if (subCategory) options.add(subCategory);
    });

    if (selectedSubCategoryForNewMaterial) {
      options.add(selectedSubCategoryForNewMaterial);
    }

    return Array.from(options).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [existingMaterials, customCategorie, selectedCategoryForNewMaterial, selectedSubCategoryForNewMaterial]);

  const filteredCategories = useMemo(() => {
    if (!customCategorie.trim()) return formCategoryOptions;
    const lower = customCategorie.toLowerCase();
    return formCategoryOptions.filter(cat => cat.toLowerCase().includes(lower));
  }, [formCategoryOptions, customCategorie]);

  const filteredSubsecties = useMemo(() => {
    if (!customSubsectie.trim()) return formSubsectionOptions;
    const lower = customSubsectie.toLowerCase();
    return formSubsectionOptions.filter((sub) => sub.toLowerCase().includes(lower));
  }, [formSubsectionOptions, customSubsectie]);

  const filteredLeveranciers = useMemo(() => {
    if (!customLeverancier.trim()) return uniqueLeveranciers;
    const lower = customLeverancier.toLowerCase();
    return uniqueLeveranciers.filter(lev => lev.toLowerCase().includes(lower));
  }, [uniqueLeveranciers, customLeverancier]);

  const applyCategoryFilter = useCallback((
    nextCategoryFilter: string | string[],
    options?: { persist?: boolean; closeQuickPicker?: boolean }
  ) => {
    setCategoryFilter(nextCategoryFilter);
    setSubCategoryFilter('all');
    if (options?.persist) {
      onCategoryFilterChange?.(nextCategoryFilter);
    }
    if (options?.closeQuickPicker) {
      setQuickCategorySearchTerm('');
      setQuickCategoryPickerOpen(false);
    }
  }, [onCategoryFilterChange]);

  useEffect(() => {
    if (!quickCategoryPickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!quickCategoryPickerRef.current) return;
      if (!quickCategoryPickerRef.current.contains(event.target as Node)) {
        setQuickCategoryPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [quickCategoryPickerOpen]);

  // Pre-process: Deduplicate materials by name, prioritizing those with prices
  const uniqueMaterials = useMemo(() => {
    const map = new Map<string, ExistingMaterial>();

    existingMaterials.forEach(mat => {
      const name = (mat.materiaalnaam || '').trim();
      if (!name) return;

      const existing = map.get(name);
      if (!existing) {
        map.set(name, mat);
        return;
      }

      // Logic to decide if 'mat' is better than 'existing'

      const priceEx = parsePriceToNumber(existing.prijs) || 0;
      const priceMat = parsePriceToNumber(mat.prijs) || 0;

      const pricePieceEx = parsePriceToNumber(existing.prijs_per_stuk) || 0;
      const pricePieceMat = parsePriceToNumber(mat.prijs_per_stuk) || 0;

      const hasPriceEx = priceEx > 0 || pricePieceEx > 0;
      const hasPriceMat = priceMat > 0 || pricePieceMat > 0;

      // 1. If new one has price and old one doesn't -> swap
      if (hasPriceMat && !hasPriceEx) {
        map.set(name, mat);
        return;
      }

      // 2. If both have price (or neither), prefer the one with a set unit
      if (hasPriceMat === hasPriceEx) {
        if (!existing.eenheid && mat.eenheid) {
          map.set(name, mat);
        }
      }
    });

    return Array.from(map.values());
  }, [existingMaterials]);

  const materialsAfterCategoryFilter = useMemo(() => {
    let result = uniqueMaterials;

    if (categoryFilter !== 'all') {
      if (Array.isArray(categoryFilter)) {
        const lowerFilters = categoryFilter.map(normalizeFilterValue).filter(Boolean);
        result = result.filter((m) => {
          const mainCategory = getMaterialMainCategory(m);
          return lowerFilters.some((filterItem) => isLooseFilterMatch(mainCategory, filterItem));
        });
      } else {
        const lowerFilter = normalizeFilterValue(categoryFilter);
        result = result.filter((m) => {
          const mainCategory = getMaterialMainCategory(m);
          return isLooseFilterMatch(mainCategory, lowerFilter);
        });
      }
    }

    if (normalizedNameContainsFilters.length > 0) {
      result = result.filter((m) => {
        const materialName = m.materiaalnaam || '';
        const materialSubCategory = getMaterialSubCategory(m);
        return normalizedNameContainsFilters.some((needle) => (
          isLooseFilterMatch(materialName, needle) || isLooseFilterMatch(materialSubCategory, needle)
        ));
      });
    }

    return result;
  }, [uniqueMaterials, categoryFilter, normalizedNameContainsFilters]);

  const availableSubCategories = useMemo(() => {
    const unique = new Set<string>();
    materialsAfterCategoryFilter.forEach((m) => {
      const subCat = getMaterialSubCategory(m);
      if (subCat) unique.add(subCat);
    });
    return Array.from(unique).sort((a, b) => {
      const aIsOverig = a.toLowerCase() === 'overig';
      const bIsOverig = b.toLowerCase() === 'overig';
      if (aIsOverig && !bIsOverig) return 1;
      if (!aIsOverig && bIsOverig) return -1;
      return a.localeCompare(b, 'nl');
    });
  }, [materialsAfterCategoryFilter]);

  const subCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    materialsAfterCategoryFilter.forEach((m) => {
      const subCat = getMaterialSubCategory(m);
      if (!subCat) return;
      counts.set(subCat, (counts.get(subCat) || 0) + 1);
    });
    return counts;
  }, [materialsAfterCategoryFilter]);

  const favoriteMaterialsCount = useMemo(() => {
    return materialsAfterCategoryFilter.filter((m) => m.isFavorite).length;
  }, [materialsAfterCategoryFilter]);

  useEffect(() => {
    if (subCategoryFilter === 'all') return;
    if (!Array.isArray(subCategoryFilter)) return;
    const valid = subCategoryFilter.filter((subCat) => (
      subCat === FAVORITE_SUBCATEGORY_FILTER || availableSubCategories.includes(subCat)
    ));
    if (valid.length !== subCategoryFilter.length) {
      setSubCategoryFilter(valid.length > 0 ? valid : 'all');
    }
  }, [availableSubCategories, subCategoryFilter]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    window.localStorage.setItem(favoriteSubCategoryKey, JSON.stringify(favoriteSubCategories));
  }, [open, favoriteSubCategories, favoriteSubCategoryKey]);

  useEffect(() => {
    if (!open || !shouldApplyFavoriteOnOpen) return;
    if (normalizedDefaultSubCategoryFilters.length > 0) {
      setShouldApplyFavoriteOnOpen(false);
      return;
    }
    if (!favoriteSubCategories.length) {
      setShouldApplyFavoriteOnOpen(false);
      return;
    }
    const favoritesToApply = availableSubCategories.filter((subCat) =>
      favoriteSubCategories.includes(subCat)
    );
    if (favoritesToApply.length > 0) {
      setSubCategoryFilter(favoritesToApply);
    }
    setShouldApplyFavoriteOnOpen(false);
  }, [open, shouldApplyFavoriteOnOpen, favoriteSubCategories, availableSubCategories, normalizedDefaultSubCategoryFilters]);

  useEffect(() => {
    if (!open || !shouldApplyDefaultSubCategoryOnOpen) return;
    if (normalizedDefaultSubCategoryFilters.length === 0) {
      setShouldApplyDefaultSubCategoryOnOpen(false);
      return;
    }
    if (availableSubCategories.length === 0) return;

    const matches = availableSubCategories.filter((subCategory) => {
      return normalizedDefaultSubCategoryFilters.some((needle) => {
        return isLooseFilterMatch(subCategory, needle);
      });
    });

    if (matches.length > 0) {
      setSubCategoryFilter(matches);
      setShouldApplyFavoriteOnOpen(false);
    }
    setShouldApplyDefaultSubCategoryOnOpen(false);
  }, [open, shouldApplyDefaultSubCategoryOnOpen, normalizedDefaultSubCategoryFilters, availableSubCategories]);

  const allFilteredMaterials = useMemo(() => {
    let result = materialsAfterCategoryFilter;

    if (subCategoryFilter !== 'all') {
      const selectedSubCategories = Array.isArray(subCategoryFilter)
        ? subCategoryFilter
        : [subCategoryFilter];
      const shouldFilterFavorites = selectedSubCategories.includes(FAVORITE_SUBCATEGORY_FILTER);
      const regularSubCategories = selectedSubCategories.filter(
        (subCategory) => subCategory !== FAVORITE_SUBCATEGORY_FILTER
      );
      const lowerSubCategories = regularSubCategories
        .map(normalizeFilterValue)
        .filter(Boolean);

      if (shouldFilterFavorites || lowerSubCategories.length > 0) {
        result = result.filter((m) => {
          const matchesFavorite = shouldFilterFavorites && Boolean(m.isFavorite);

          const matchesSubCategory = lowerSubCategories.length > 0
            ? (() => {
              const matSubCategory = normalizeFilterValue(getMaterialSubCategory(m));
              if (!matSubCategory) return false;
              return lowerSubCategories.some((lowerSubCategory) => (
                matSubCategory === lowerSubCategory
              ));
            })()
            : false;

          return matchesFavorite || matchesSubCategory;
        });
      }
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(m => (m.materiaalnaam || '').toLowerCase().includes(lower));
    }

    return result.sort((a, b) => {
      // 1. Currently selected material ALWAYS first
      if (selectedMaterialId) {
        if (a.row_id === selectedMaterialId) return -1;
        if (b.row_id === selectedMaterialId) return 1;
      }
      // 2. Favorites first
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      // 3. Then by order_id (if available)
      const orderA = a.order_id ?? 999999;
      const orderB = b.order_id ?? 999999;
      return orderA - orderB;
    });
  }, [materialsAfterCategoryFilter, searchTerm, subCategoryFilter, selectedMaterialId]);

  const visibleMaterials = useMemo(() => {
    return allFilteredMaterials.slice(0, displayLimit);
  }, [allFilteredMaterials, displayLimit]);

  // --- FORM VALIDATION ---
  const isNaamOk = customNaam.trim().length > 0;
  const prijsNum = parsePriceToNumber(customPrijs);
  const isPrijsOk = prijsNum != null && prijsNum >= 0;
  const isEenheidOk = (customEenheid || '').trim().length > 0;

  const handleInclPriceChange = (raw: string) => {
    const val = raw.replace(/[^0-9.,]/g, '');
    setCustomPrijs(val);

    const incl = parsePriceToNumber(val);
    if (incl == null) {
      setCustomPrijsExclBtw('');
      return;
    }

    const excl = Number((incl / 1.21).toFixed(2));
    setCustomPrijsExclBtw(formatPriceInput(excl));
  };

  const handleExclPriceChange = (raw: string) => {
    const val = raw.replace(/[^0-9.,]/g, '');
    setCustomPrijsExclBtw(val);

    const excl = parsePriceToNumber(val);
    if (excl == null) {
      setCustomPrijs('');
      return;
    }

    const incl = Number((excl * 1.21).toFixed(2));
    setCustomPrijs(formatPriceInput(incl));
  };

  const canSaveCustom = useMemo(() => {
    return !savingCustom && isNaamOk && isPrijsOk && isEenheidOk;
  }, [savingCustom, isNaamOk, isPrijsOk, isEenheidOk]);

  // --- SAVE ACTION ---
  const saveCustomMaterial = async (
    safetyAnswerOverride?: string,
    options?: { backgroundClientId?: string }
  ) => {
    const shouldRunInBackground =
      !editingMaterialId &&
      typeof onPendingMaterialQueued === 'function';
    const backgroundClientId =
      shouldRunInBackground
        ? (options?.backgroundClientId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString()))
        : null;
    try {
      setError(null);

      // 1. Validation
      const safetyAnswerFinal = (safetyAnswerOverride || '').trim();
      const isVerbruikQuestion =
        safetyAnswerFinal.length > 0 &&
        isVerbruikPerM2Question(safetyQuestion, safetyExpectedUnit);
      const verbruikPerM2Value =
        isVerbruikQuestion
          ? parseVerbruikPerM2Answer(safetyAnswerFinal)
          : null;
      if (isVerbruikQuestion && verbruikPerM2Value === null) {
        throw new Error('Vul verbruik per m² in als getal, bijv. 0,3.');
      }

      const naamRaw = mergeSafetyAnswerIntoNaam(
        customNaam.trim(),
        isVerbruikQuestion ? '' : safetyAnswerFinal
      );
      if (!naamRaw) throw new Error('Materiaalnaam is verplicht.');
      const baseName = naamRaw.charAt(0).toUpperCase() + naamRaw.slice(1);

      const prijsNumLocal = parsePriceToNumber(customPrijs);
      if (prijsNumLocal == null || prijsNumLocal < 0) throw new Error('Vul een geldige prijs in.');
      const prijsExclBtwLocal = parsePriceToNumber(customPrijsExclBtw) ?? Number((prijsNumLocal / 1.21).toFixed(2));

      const eenheid = (customEenheid || '').trim();
      if (!eenheid) throw new Error('Kies een eenheid.');

      if (!shouldRunInBackground) {
        setSavingCustom(true);
      }

      // 2. Generate the FINAL string using the shared helper
      const finalNameToSend = constructFinalName(baseName);

      // Calculate price per piece if possible
      const calculatedPiecePrice = prijsNumLocal;

      // 3. Prepare Payload
      const payload: any = {
        materiaalnaam: finalNameToSend,
        eenheid,
        prijs: prijsNumLocal, // Unit price
        prijs_excl_btw: prijsExclBtwLocal,
        prijs_incl_btw: prijsNumLocal,
        prijs_per_stuk: calculatedPiecePrice, // Calculated piece price (same as unit price for simple items)
      };
      if (safetyAnswerFinal) {
        payload.safety_confirmed = true;
        payload.safety_answer = safetyAnswerFinal;
        if (safetyExpectedUnit.trim()) {
          payload.expected_unit = safetyExpectedUnit.trim();
        }
        if (verbruikPerM2Value !== null) {
          payload.verbruik_per_m2 = verbruikPerM2Value;
        }
      }
      const categorie = customCategorie.trim();
      const subsectie = customSubsectie.trim();
      const leverancier = customLeverancier.trim();
      if (categorie) payload.categorie = categorie;
      if (subsectie) payload.subsectie = subsectie;
      if (leverancier) payload.leverancier = leverancier;
      if (shouldRunInBackground && backgroundClientId) {
        payload.pending_id = backgroundClientId;
        if (quoteId) payload.quote_id = quoteId;
        if (klusId) payload.klus_id = klusId;
      }

      if (shouldRunInBackground && backgroundClientId) {
        const placeholderMaterial = {
          ...payload,
          id: `pending_${backgroundClientId}`,
          row_id: `pending_${backgroundClientId}`,
          pending_material_id: backgroundClientId,
          pending_material_state: 'analyzing',
          wastePercentage: wastePercentage || 0,
        };
        onPendingMaterialQueued({
          clientId: backgroundClientId,
          placeholderMaterial,
          draftPayload: payload,
        });
        onOpenChange(false);
      }

      // 4. API Call
      // (Assuming `haalFirebaseIdToken` is available globally or imported)
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Niet ingelogd.');
      const token = await currentUser.getIdToken();

      // Include ID if editing
      if (editingMaterialId) {
        payload.row_id = editingMaterialId;
      }

      const res = await fetch('/api/materialen/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Opslaan mislukt");

      const parsedN8n = extractSafetyPrompt(json?.n8n);
      const parsedData = extractSafetyPrompt(json?.data);
      const questions = parsedData.questions.length > 0 ? parsedData.questions : parsedN8n.questions;
      const shouldAskSafetyQuestion = parsedN8n.ready === false || parsedData.ready === false;

      if (shouldAskSafetyQuestion && questions.length > 0) {
        if (shouldRunInBackground && backgroundClientId) {
          onPendingMaterialQuestion?.({
            clientId: backgroundClientId,
            questions,
            draftPayload: payload,
          });
          return;
        }
        const firstQuestion = questions[0];
        setSafetyQuestion(firstQuestion.question);
        setSafetyExpectedUnit(firstQuestion.expectedUnit);
        setSafetyAnswer('');
        setSafetyAnswerError(null);
        setSafetyDialogOpen(true);
        if (!isVerbruikQuestion) {
          setCustomNaam((prev) => mergeSafetyAnswerIntoNaam(prev, safetyAnswerOverride || ''));
        }
        return;
      }

      const row = Array.isArray(json.data) ? json.data[0] : json.data;
      const realId = row?.row_id || row?.id || json.id;

      // 5. Success Callback
      if (!shouldRunInBackground && onMaterialAdded) {
        const mergedRow = row && typeof row === 'object'
          ? { ...payload, ...row }
          : payload;
        const resolvedExclPrice =
          parsePriceToNumber((mergedRow as any).prijs_excl_btw ?? (mergedRow as any).prijs) ??
          prijsNumLocal;
        const resolvedPiecePrice =
          parsePriceToNumber((mergedRow as any).prijs_per_stuk ?? (mergedRow as any).prijs_excl_btw ?? (mergedRow as any).prijs) ??
          calculatedPiecePrice;
        onMaterialAdded({
          ...mergedRow,
          id: realId || (mergedRow as any).id,
          row_id: realId || (mergedRow as any).row_id,
          prijs: resolvedExclPrice,
          prijs_per_stuk: resolvedPiecePrice,
          wastePercentage: wastePercentage || 0,
        });
      }

      if (shouldRunInBackground && backgroundClientId) {
        const mergedRow = row && typeof row === 'object'
          ? { ...payload, ...row }
          : payload;
        const resolvedExclPrice =
          parsePriceToNumber((mergedRow as any).prijs_excl_btw ?? (mergedRow as any).prijs) ??
          prijsNumLocal;
        const resolvedPiecePrice =
          parsePriceToNumber((mergedRow as any).prijs_per_stuk ?? (mergedRow as any).prijs_excl_btw ?? (mergedRow as any).prijs) ??
          calculatedPiecePrice;
        onPendingMaterialResolved?.({
          clientId: backgroundClientId,
          material: {
            ...mergedRow,
            id: realId || (mergedRow as any).id,
            row_id: realId || (mergedRow as any).row_id,
            prijs: resolvedExclPrice,
            prijs_per_stuk: resolvedPiecePrice,
            wastePercentage: wastePercentage || 0,
          },
        });
        return;
      }

      // Reset and close
      setEditingMaterialId(null);
      onOpenChange(false);

    } catch (e: any) {
      console.error("❌ Fout bij opslaan:", e);
      void reportOperationalError({
        source: 'material_selection_upsert',
        title: 'Aanmaken materiaal mislukt',
        message: e?.message || 'Onbekende fout.',
        severity: 'critical',
        context: {
          editingMaterialId: editingMaterialId ?? null,
          backgroundMode: shouldRunInBackground,
          backgroundClientId: backgroundClientId ?? null,
        },
      });
      if (shouldRunInBackground && backgroundClientId) {
        onPendingMaterialFailed?.({
          clientId: backgroundClientId,
          error: e?.message || 'Onbekende fout.',
        });
        return;
      }
      setError(e?.message || 'Onbekende fout.');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleSafetyConfirm = () => {
    const answer = safetyAnswer.trim();
    if (!answer) {
      setSafetyAnswerError('Vul eerst een antwoord in.');
      return;
    }

    const answerWithUnit = applySafetyUnit(answer, safetyExpectedUnit, safetyQuestion);
    const isVerbruikQuestion = isVerbruikPerM2Question(safetyQuestion, safetyExpectedUnit);
    if (isVerbruikQuestion && parseVerbruikPerM2Answer(answerWithUnit) === null) {
      setSafetyAnswerError('Vul verbruik per m² in als getal, bijv. 0,3.');
      return;
    }

    setSafetyAnswerError(null);
    setSafetyDialogOpen(false);
    if (!isVerbruikQuestion) {
      setCustomNaam((prev) => mergeSafetyAnswerIntoNaam(prev, answerWithUnit));
    }
    void saveCustomMaterial(answerWithUnit);
  };

  const startEditing = (mat: ExistingMaterial, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMaterialId(mat.row_id);

    // Pre-fill form
    setCustomNaam(mat.materiaalnaam || '');
    setCustomEenheid(mat.eenheid || '');

    // Handle price formatting (both incl. and excl. btw)
    const priceIncl = parsePriceToNumber((mat as any).prijs_incl_btw ?? mat.prijs);
    const priceExcl =
      parsePriceToNumber((mat as any).prijs_excl_btw) ??
      (priceIncl != null ? Number((priceIncl / 1.21).toFixed(2)) : null);

    setCustomPrijs(formatPriceInput(priceIncl));
    setCustomPrijsExclBtw(formatPriceInput(priceExcl));

    setCustomCategorie(mat.categorie || '');
    setCustomSubsectie(mat.subsectie || (mat as any).sub_categorie || '');
    setCustomLeverancier(mat.leverancier || '');

    setStep('form');
  };

  const handleSelectExisting = (m: ExistingMaterial) => {
    if (onSelectExisting) {
      onSelectExisting({
        ...m,
        wastePercentage: wastePercentage // Pass currently configured waste
      });
      onOpenChange(false);
    }
  };

  const copyMaterialName = async (name: string): Promise<void> => {
    const materialName = (name || '').trim();
    if (!materialName || typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(materialName);
    } catch (error) {
      console.error('Kon materiaalnaam niet kopieren:', error);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && onUpdateWaste) {
      onUpdateWaste(wastePercentage);
    }
    onOpenChange(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "w-[95vw] p-0 transition-all duration-200",
            step === 'search'
              ? "max-w-[1200px] h-[88vh] flex flex-col overflow-hidden gap-0"
              : "sm:max-w-[640px] h-auto block"
          )}
        >

          {/* === STEP 1: SEARCH & FILTER === */}
          {step === 'search' && (
            <>
              <div className="flex-1 min-h-0 border-t grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="hidden lg:flex flex-col border-r border-border/60 min-h-0">
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Filters</p>
                  </div>
                  <div className="p-2 border-b border-border/60">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Categorie</div>
                    <button
                      type="button"
                      onClick={() => setCategoryPickerOpen((prev) => !prev)}
                      className="w-full h-9 rounded-md border border-muted-foreground/25 px-2.5 text-xs text-left flex items-center justify-between text-muted-foreground hover:text-foreground hover:border-emerald-500/40 transition-colors"
                    >
                      <span className="truncate pr-2">{selectedCategoryLabel}</span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", categoryPickerOpen && "rotate-180")} />
                    </button>

                    {categoryPickerOpen && (
                      <div className="mt-2 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
                          <Input
                            value={categorySearchTerm}
                            onChange={(e) => {
                              setCategorySearchTerm(e.target.value);
                              if (!categoryPickerOpen) setCategoryPickerOpen(true);
                            }}
                            placeholder="Zoek categorie..."
                            className="h-8 pl-8 text-xs border-muted-foreground/20"
                          />
                        </div>
                        <div className="max-h-[190px] overflow-y-auto space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              applyCategoryFilter('all');
                              setCategorySearchTerm('');
                              setCategoryPickerOpen(false);
                            }}
                            className={cn(
                              "w-full rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors",
                              categoryFilter === 'all'
                                ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                                : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                            )}
                          >
                            Toon alles
                          </button>
                          {filteredSidebarCategories.map((cat) => {
                            const selected = Array.isArray(categoryFilter)
                              ? categoryFilter.includes(cat)
                              : categoryFilter === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  applyCategoryFilter(cat);
                                  setCategorySearchTerm('');
                                  setCategoryPickerOpen(false);
                                }}
                                className={cn(
                                  "w-full rounded-md border px-2.5 py-1.5 text-xs text-left leading-5 transition-colors",
                                  selected
                                    ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                                    : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                                )}
                              >
                                {cat}
                              </button>
                            );
                          })}
                          {filteredSidebarCategories.length === 0 && (
                            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                              Geen categorie gevonden.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Subcategorie</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setSubCategoryFilter('all')}
                      className={cn(
                        "w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        isAllSubCategoriesSelected
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                          : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                      )}
                    >
                      <span>Alles</span>
                      <span className="text-[10px] opacity-70">{materialsAfterCategoryFilter.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSubCategorySelection(FAVORITE_SUBCATEGORY_FILTER)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        isSubCategorySelected(FAVORITE_SUBCATEGORY_FILTER)
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                          : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        Favorieten
                      </span>
                      <span className="text-[10px] opacity-70">{favoriteMaterialsCount}</span>
                    </button>
                    {availableSubCategories.map((subCat) => {
                      const isFavoriteSubCategory = favoriteSubCategories.includes(subCat);
                      return (
                        <div key={subCat} className="w-full flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={isFavoriteSubCategory ? `Verwijder favoriet ${subCat}` : `Maak favoriet ${subCat}`}
                            title={isFavoriteSubCategory ? 'Favoriet verwijderen' : 'Favoriet maken'}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoriteSubCategory(subCat);
                            }}
                            className="h-7 w-7 shrink-0 rounded-md border border-muted-foreground/25 flex items-center justify-center hover:border-emerald-500/50 hover:bg-muted/40 transition-colors"
                          >
                            <Star className={cn("h-3.5 w-3.5", isFavoriteSubCategory ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSubCategorySelection(subCat)}
                            className={cn(
                              "flex-1 flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors",
                              isSubCategorySelected(subCat)
                                ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                                : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                            )}
                          >
                            <span className="truncate pr-2">{subCat}</span>
                            <span className="text-[10px] opacity-70 shrink-0">{subCategoryCounts.get(subCat) || 0}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </aside>

                <div className="flex flex-col min-h-0">
                  <div className="p-6 pb-3 border-b border-border/60 shrink-0">
                    <div className="flex items-start justify-between mb-4 gap-3">
                      <div className="flex flex-col gap-0.5">
                        <DialogTitle className="text-xl font-semibold">
                          {categoryTitle || 'Kies materiaal'}
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                          Selecteer een materiaal voor {categoryTitle ? categoryTitle.toLowerCase() : 'dit onderdeel'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative hidden lg:block" ref={quickCategoryPickerRef}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setQuickCategoryPickerOpen((prev) => !prev);
                            }}
                            className="h-8 px-2.5 gap-2 border-emerald-500/45 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/20 hover:border-emerald-400"
                            title="Standaard categorie aanpassen voor dit onderdeel"
                          >
                            <Filter className="h-3.5 w-3.5" />
                            <span className="max-w-[220px] truncate text-xs font-semibold">{selectedCategoryLabel}</span>
                            <Pencil className="h-3 w-3 opacity-70" />
                          </Button>

                          {quickCategoryPickerOpen && (
                            <div className="absolute right-0 top-full mt-2 z-50 w-[300px] rounded-lg border border-emerald-500/30 bg-background/95 shadow-2xl backdrop-blur p-2 space-y-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
                                Kies standaard categorie
                              </div>
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
                                <Input
                                  value={quickCategorySearchTerm}
                                  onChange={(e) => setQuickCategorySearchTerm(e.target.value)}
                                  placeholder="Zoek categorie..."
                                  className="h-8 pl-8 text-xs border-muted-foreground/20"
                                />
                              </div>
                              <div className="max-h-[220px] overflow-y-auto space-y-1">
                                <button
                                  type="button"
                                  onClick={() => applyCategoryFilter('all', { persist: true, closeQuickPicker: true })}
                                  className={cn(
                                    "w-full rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors",
                                    categoryFilter === 'all'
                                      ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                                      : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                                  )}
                                >
                                  Toon alles
                                </button>
                                {quickFilteredCategories.map((cat) => {
                                  const selected = Array.isArray(categoryFilter)
                                    ? categoryFilter.includes(cat)
                                    : categoryFilter === cat;
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => applyCategoryFilter(cat, { persist: true, closeQuickPicker: true })}
                                      className={cn(
                                        "w-full rounded-md border px-2.5 py-1.5 text-xs text-left leading-5 transition-colors",
                                        selected
                                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                                          : "border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                                      )}
                                    >
                                      {cat}
                                    </button>
                                  );
                                })}
                                {quickFilteredCategories.length === 0 && (
                                  <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                                    Geen categorie gevonden.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuickCategoryPickerOpen(false);
                            setPriceImportDialogOpen(true);
                          }}
                          className="hidden h-8 px-2.5 text-xs gap-2 border border-amber-400/45 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20 lg:inline-flex"
                        >
                          Prijs import aanvragen
                        </Button>

                        {isEditingWaste ? (
                          <div className="flex items-center gap-1 rounded-md border border-sky-400/50 bg-sky-500/15 px-2 py-1">
                            <span className="text-xs font-semibold text-sky-100 uppercase tracking-wide">Afval</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              className="h-6 w-14 text-xs px-1 py-0 bg-background/30 border-sky-300/50 focus-visible:ring-0 text-right font-medium"
                              value={wastePercentage.toString()}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0) setWastePercentage(val);
                                else if (e.target.value === '') setWastePercentage(0);
                              }}
                              onBlur={() => {
                                setIsEditingWaste(false);
                                if (onUpdateWaste) onUpdateWaste(wastePercentage);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setIsEditingWaste(false);
                                  if (onUpdateWaste) onUpdateWaste(wastePercentage);
                                }
                              }}
                            />
                            <span className="text-xs text-sky-100 pr-1">%</span>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditingWaste(true)}
                            className="h-8 px-2.5 text-xs gap-2 border border-sky-400/45 bg-sky-500/12 text-sky-100 hover:bg-sky-500/20"
                          >
                            <Pencil className="h-3.5 w-3.5 opacity-80" />
                            <span className="font-semibold uppercase tracking-wide">Afval</span>
                            <span className="font-bold">{wastePercentage}%</span>
                          </Button>
                        )}
                      </div>

                      <DialogDescription className="sr-only">
                        Zoek en selecteer een materiaal uit de lijst of maak een nieuwe aan.
                      </DialogDescription>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Zoek op materiaalnaam..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9 h-10 border-muted-foreground/20 focus-visible:ring-emerald-500/50"
                        />
                      </div>

                      <div className="lg:hidden">
                        <Select
                          value={Array.isArray(categoryFilter) ? 'custom_filter' : categoryFilter}
                          onValueChange={(value) => {
                            applyCategoryFilter(value);
                          }}
                        >
                          <SelectTrigger className="w-full h-10 text-xs border-muted-foreground/20 bg-transparent">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Filter className="h-3 w-3" />
                              <span className="truncate max-w-[220px]">
                                {Array.isArray(categoryFilter)
                                  ? categoryFilter.join(', ')
                                  : categoryFilter === 'all'
                                    ? 'Filter op categorie...'
                                    : categoryFilter}
                              </span>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toon alles</SelectItem>
                            {Array.isArray(categoryFilter) && (
                              <SelectItem value="custom_filter" className="hidden">Geselecteerde Groep</SelectItem>
                            )}
                            {uniqueCategories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        onClick={() => {
                          setEditingMaterialId(null);
                          setCustomNaam('');
                          setCustomEenheid('stuk');
                          setCustomPrijs('');
                          setCustomPrijsExclBtw('');
                          setCustomCategorie(selectedCategoryForNewMaterial || '');
                          setCustomSubsectie(selectedSubCategoryForNewMaterial || '');
                          setCustomLeverancier('');
                          setStep('form');
                        }}
                        variant="outline"
                        className="h-10 px-3 border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:bg-muted/10 hover:border-emerald-500/50 shrink-0"
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Nieuw
                      </Button>
                    </div>
                  </div>

                  {availableSubCategories.length > 0 && (
                    <div className="lg:hidden border-b border-border/60 px-2 py-2 overflow-x-auto">
                      <div className="flex items-center gap-1.5 min-w-max">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSubCategoryFilter('all')}
                          className={cn(
                            "h-7 px-2 text-[11px] transition-colors",
                            isAllSubCategoriesSelected
                              ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400"
                              : "border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                          )}
                        >
                          Alles
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleSubCategorySelection(FAVORITE_SUBCATEGORY_FILTER)}
                          className={cn(
                            "h-7 px-2 text-[11px] transition-colors",
                            isSubCategorySelected(FAVORITE_SUBCATEGORY_FILTER)
                              ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400"
                              : "border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                          )}
                        >
                          <Star className="mr-1 h-3 w-3 fill-yellow-400 text-yellow-400" />
                          Favorieten
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {favoriteMaterialsCount}
                          </span>
                        </Button>
                        {availableSubCategories.map((subCat) => (
                          <Button
                            key={subCat}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSubCategorySelection(subCat)}
                            className={cn(
                              "h-7 px-2 text-[11px] max-w-full transition-colors",
                              isSubCategorySelected(subCat)
                                ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400"
                                : "border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
                            )}
                          >
                            <span className="truncate">{subCat}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {subCategoryCounts.get(subCat) || 0}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto">
                    <ul className="divide-y divide-border">
                      {visibleMaterials.map((mat) => (
                        <li key={mat.row_id} className="group border-b border-border/50 last:border-0">
                          <div className="w-full flex items-stretch">

                            {/* DEV: COPY MATERIAL NAME */}
                            {showDevCopyButton && (
                              <div className="flex items-center justify-center px-3 border-r border-border/30 hover:bg-muted/50 transition-colors">
                                <button
                                  type="button"
                                  aria-label={`Kopieer materiaalnaam ${mat.materiaalnaam || ''}`}
                                  title="Dev: kopieer materiaalnaam"
                                  className="text-muted-foreground/50 hover:text-foreground focus:outline-none transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void copyMaterialName(mat.materiaalnaam || '');
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                              </div>
                            )}

                            {/* FAVORITE */}
                            {showFavorites && (
                              <div
                                className="flex items-center justify-center px-4 border-r border-border/30 hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onToggleFavorite) onToggleFavorite(mat.id);
                                }}
                              >
                                <button
                                  type="button"
                                  className="text-muted-foreground/30 hover:text-yellow-400 focus:outline-none transition-colors"
                                >
                                  <Star className={cn("h-4 w-4", mat.isFavorite ? "fill-yellow-400 text-yellow-400" : "")} />
                                </button>
                              </div>
                            )}

                            {/* CONTENT */}
                            <div
                              className={cn(
                                "flex-1 flex items-center justify-between gap-3 p-4 cursor-pointer transition-colors",
                                mat.row_id === selectedMaterialId
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20"
                                  : "hover:bg-muted/50"
                              )}
                              onClick={() => handleSelectExisting(mat)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className={cn(
                                  "font-medium transition-colors break-words whitespace-normal text-sm",
                                  mat.row_id === selectedMaterialId
                                    ? "text-emerald-600"
                                    : "text-foreground group-hover:text-emerald-600"
                                )}>
                                  {mat.materiaalnaam}
                                  {mat.row_id === selectedMaterialId && (
                                    <span className="ml-2 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                      Huidig
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex items-center gap-3">
                                <div className="flex flex-col items-end">
                                  {(() => {
                                    // Show EXCL. BTW in list: prefer DB field, then derive as fallback.
                                    const prijsExclBtw = parsePriceToNumber((mat as any).prijs_excl_btw);
                                    const prijsInclBtw = parsePriceToNumber((mat as any).prijs_incl_btw);
                                    const prijs = parsePriceToNumber(mat.prijs);
                                    const derivedExcl = prijsInclBtw != null ? Number((prijsInclBtw / 1.21).toFixed(2)) : null;

                                    const finalPrice = prijsExclBtw ?? derivedExcl ?? prijs;
                                    const eenheid = mat.eenheid || 'stuk';

                                    return (
                                      <>
                                        <div className="text-sm font-medium">
                                          {formatEuro(finalPrice)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          per {eenheid} excl. btw
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
                                  onClick={(e) => startEditing(mat, e)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}

                      {visibleMaterials.length < allFilteredMaterials.length && (
                        <li className="p-4 flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisplayLimit(prev => prev + 50)}
                            className="w-full text-muted-foreground"
                          >
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Meer laden
                          </Button>
                        </li>
                      )}

                      {allFilteredMaterials.length === 0 && (
                        <li className="p-8 text-center text-muted-foreground text-sm">
                          Geen materialen gevonden.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t p-3 bg-muted/5 flex justify-between items-center sm:justify-between">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
                  Annuleren
                </Button>
              </DialogFooter>
            </>
          )}

          {/* === STEP 2: FORM === */}
          {step === 'form' && (
            <div className="flex flex-col">
              <DialogHeader className="px-6 pt-6 flex flex-row items-center gap-4 space-y-0 text-left border-b border-zinc-800 pb-6 shrink-0 bg-background">
                <Button size="icon" variant="ghost" className="-ml-2 h-8 w-8" onClick={() => setStep('search')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col gap-1">
                  <DialogTitle className="text-xl font-bold text-white leading-none">
                    {editingMaterialId ? 'Bewerk Materiaal' : 'Nieuw Materiaal'}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-400 text-sm">
                    {editingMaterialId ? 'Pas de gegevens van het materiaal aan.' : 'Vul de gegevens van het materiaal in.'}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="space-y-4 px-6 py-4">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Materiaalnaam *</div>
                  <Input
                    value={customNaam}
                    onChange={(e) => setCustomNaam(e.target.value)}
                    onBlur={() => {
                      if (customNaam.trim()) {
                        const capitalized = customNaam.charAt(0).toUpperCase() + customNaam.slice(1);
                        setCustomNaam(capitalized);
                      }
                    }}
                    placeholder="bijv. Keukenkraan chroom"
                  />
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Prijs per eenheid
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[130px_1fr_1fr] gap-3 items-end">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Eenheid *</div>
                      <Select value={customEenheid} onValueChange={setCustomEenheid}>
                        <SelectTrigger className="h-10 text-xs">
                          <SelectValue placeholder="Kies" />
                        </SelectTrigger>
                        <SelectContent>
                          {EENHEDEN.filter(e => !e.includes('p/m')).map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Excl. btw</div>
                      <Input
                        value={customPrijsExclBtw}
                        onChange={(e) => handleExclPriceChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (['e', 'E', '+', '-'].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Incl. btw *</div>
                      <Input
                        value={customPrijs}
                        onChange={(e) => handleInclPriceChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (['e', 'E', '+', '-'].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Vul incl. of excl. in; het andere veld wordt automatisch bijgewerkt.
                  </div>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Categorie (optioneel)</div>
                    <div className="relative">
                      <Input
                        value={customCategorie}
                        onChange={(e) => setCustomCategorie(e.target.value)}
                        onFocus={() => setCategorieDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setCategorieDropdownOpen(false), 150)}
                        placeholder="Bijv. Balkhout"
                        autoComplete="off"
                        className={formCategoryOptions.length > 0 ? "pr-10" : ""}
                      />
                      {formCategoryOptions.length > 0 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setCategorieDropdownOpen(!categorieDropdownOpen); }}
                          className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                      {categorieDropdownOpen && filteredCategories.length > 0 && (
                        <div className="absolute z-50 bottom-full left-0 right-0 mb-1 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                          {filteredCategories.map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); setCustomCategorie(cat); setCategorieDropdownOpen(false); }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Subsectie (optioneel)</div>
                    <div className="relative">
                      <Input
                        value={customSubsectie}
                        onChange={(e) => setCustomSubsectie(e.target.value)}
                        onFocus={() => setSubsectieDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setSubsectieDropdownOpen(false), 150)}
                        placeholder="Bijv. Ribben"
                        autoComplete="off"
                        className={formSubsectionOptions.length > 0 ? "pr-10" : ""}
                      />
                      {formSubsectionOptions.length > 0 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setSubsectieDropdownOpen(!subsectieDropdownOpen); }}
                          className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                      {subsectieDropdownOpen && filteredSubsecties.length > 0 && (
                        <div className="absolute z-50 bottom-full left-0 right-0 mb-1 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                          {filteredSubsecties.map((subsectie) => (
                            <button
                              key={subsectie}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); setCustomSubsectie(subsectie); setSubsectieDropdownOpen(false); }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {subsectie}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Leverancier (optioneel)</div>
                    <div className="relative">
                      <Input
                        value={customLeverancier}
                        onChange={(e) => setCustomLeverancier(e.target.value)}
                        onFocus={() => setLeverancierDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setLeverancierDropdownOpen(false), 150)}
                        placeholder="Bijv. Bouwmaat"
                        autoComplete="off"
                        className={uniqueLeveranciers.length > 0 ? "pr-10" : ""}
                      />
                      {uniqueLeveranciers.length > 0 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setLeverancierDropdownOpen(!leverancierDropdownOpen); }}
                          className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                      {leverancierDropdownOpen && filteredLeveranciers.length > 0 && (
                        <div className="absolute z-50 bottom-full left-0 right-0 mb-1 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                          {filteredLeveranciers.map(lev => (
                            <button
                              key={lev}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); setCustomLeverancier(lev); setLeverancierDropdownOpen(false); }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {lev}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              <DialogFooter className="border-t border-muted/60 bg-muted/5 px-6 py-4 sm:justify-end gap-3 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('search')}
                  className="h-11"
                >
                  Vorige
                </Button>
                <Button
                  type="button"
                  className={cn("h-11 gap-2 px-8 text-sm font-bold shadow-lg", POSITIVE_BTN_SOFT)}
                  onClick={() => void saveCustomMaterial()}
                  disabled={!canSaveCustom || savingCustom}
                >
                  {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingMaterialId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />)}
                  {editingMaterialId ? "Opslaan" : "Materiaal toevoegen"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={safetyDialogOpen}
        onOpenChange={(nextOpen) => {
          setSafetyDialogOpen(nextOpen);
          if (!nextOpen) {
            setSafetyExpectedUnit('');
            setSafetyAnswer('');
            setSafetyAnswerError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Controle voordat je opslaat</AlertDialogTitle>
            <AlertDialogDescription>
              {safetyQuestion || 'Vul extra productinformatie in (zoals 750ml, 5L of 25kg).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Input
              value={safetyAnswer}
              onChange={(e) => {
                setSafetyAnswer(e.target.value);
                if (safetyAnswerError) setSafetyAnswerError(null);
              }}
              placeholder="Bijv. 750ml, 5 liter, 25kg"
              autoFocus
            />
            {safetyAnswerError ? (
              <p className="text-sm text-destructive">{safetyAnswerError}</p>
            ) : (
              <div className="space-y-1">
                {safetyExpectedUnit ? (
                  <p className="text-xs text-muted-foreground">
                    Verwachte eenheid: <span className="font-semibold">{safetyExpectedUnit}</span>
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Dit antwoord wordt toegevoegd aan de materiaalnaam en daarna opnieuw opgeslagen.
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Terug</Button>
            </AlertDialogCancel>
            <Button
              type="button"
              className={cn("h-11 gap-2 px-8 text-sm font-bold shadow-lg", POSITIVE_BTN_SOFT)}
              onClick={handleSafetyConfirm}
            >
              Aanvullen en opslaan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={priceImportDialogOpen} onOpenChange={setPriceImportDialogOpen}>
        <DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Prijs import aanvragen</DialogTitle>
            <DialogDescription>
              Dien je aanvraag in zonder de materialenlijst te verlaten.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-4">
            <PriceImportRequestForm
              className="border-0 bg-transparent p-0"
              onSuccess={() => {
                setPriceImportDialogOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helpers
const POSITIVE_BTN_SOFT =
  'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 ' +
  'hover:bg-emerald-500/25 hover:border-emerald-500/65 ' +
  'focus-visible:ring-emerald-500 focus-visible:ring-offset-0';
