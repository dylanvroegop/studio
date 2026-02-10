/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Package, Search, Filter, ArrowLeft, ChevronDown, Star, Pencil } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
  existingMaterials?: ExistingMaterial[];
  onSelectExisting?: (material: ExistingMaterial) => void;
  onMaterialAdded?: (material: any) => void;
  defaultCategory?: string | string[];
  onToggleFavorite?: (id: string) => void;
  showFavorites?: boolean;
  categoryTitle?: string;
  initialWastePercentage?: number;
  onUpdateWaste?: (percentage: number) => void;
  selectedMaterialId?: string;
}

export function MaterialSelectionModal({
  open,
  onOpenChange,
  existingMaterials = [],
  onSelectExisting,
  onMaterialAdded,
  defaultCategory,
  onToggleFavorite,
  showFavorites = true,
  categoryTitle,
  initialWastePercentage = 0,
  onUpdateWaste,
  selectedMaterialId
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
  const [displayLimit, setDisplayLimit] = useState(50);

  // Edit State
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  // Form State
  const [customNaam, setCustomNaam] = useState<string>('');
  const [customEenheid, setCustomEenheid] = useState<string>('');
  const [customPrijs, setCustomPrijs] = useState<string>('');
  const [customSubsectie, setCustomSubsectie] = useState<string>('');
  const [customLeverancier, setCustomLeverancier] = useState<string>('');

  // --- AUTOCOMPLETE FOCUS STATES ---
  const [categorieDropdownOpen, setCategorieDropdownOpen] = useState(false);
  const [leverancierDropdownOpen, setLeverancierDropdownOpen] = useState(false);

  // --- RESET ON OPEN ---
  useEffect(() => {
    if (open) {
      // 1. Reset UI Flow
      setStep('search');
      setError(null);
      setSearchTerm('');
      setCategoryFilter(defaultCategory || 'all');
      setDisplayLimit(50);

      // 2. Reset Form Fields (CLEAN SLATE)
      setCustomNaam('');
      setCustomEenheid('');
      setCustomPrijs('');
      setCustomSubsectie('');
      setCustomLeverancier('');

      // 3. Reset Waste
      setWastePercentage(initialWastePercentage || 0);
      setIsEditingWaste(false);

      // 4. Reset Edit State
      setEditingMaterialId(null);
    }
  }, [open, defaultCategory, initialWastePercentage]);

  useEffect(() => {
    setDisplayLimit(50);
  }, [searchTerm, categoryFilter]);

  // --- SEARCH LOGIC ---

  // Order defined by src/lib/categorylist.md

  const uniqueCategories = useMemo(() => {
    const CATEGORY_ORDER = [
      "Vuren ruw", "Vuren geschaafd", "Ribben, sls, rachels", "Plinten & koplatten", "Hardhout geschaafd", "Merantie",
      "Vloer-rabat-vellingdelen", "Underlayment", "Interieur Platen", "Exterieur platen", "Deurbeslag", "Binnendeuren",
      "Buitendeuren", "Kozijnhout", "Montage kozijnen", "Metalstud profielen", "Gipsplaten", "Brandwerende platen", "(knauf) gipsproducten", "Rockpanel", "Kikern",
      "Glaswol", "Steenwol", "Pir", "Eps", "Xps", "Folieën", "Dpc", "Lood", "Loodvervanger", "Epdm folie", "Epdm benodigdheden",
      "Epdm afvoeren", "Dakrollen", "Asfaltsingels", "Betonpannen", "Gebakken pannen", "Flexim", "Bitumen golfplaten",
      "Polyester golfplaten", "Pvc golfplaten", "Vezelcement golfplaten", "Golfplaat afdichting en bevestiging", "Velux",
      "Keylite", "Lichtkoepels", "Daktoebehoren", "Ubbink"
    ];

    const cats = new Set(existingMaterials.map(m => m.subsectie).filter(Boolean));
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

  // Filtered autocomplete suggestions based on current input
  const filteredCategories = useMemo(() => {
    if (!customSubsectie.trim()) return uniqueCategories;
    const lower = customSubsectie.toLowerCase();
    return uniqueCategories.filter(cat => cat.toLowerCase().includes(lower));
  }, [uniqueCategories, customSubsectie]);

  const filteredLeveranciers = useMemo(() => {
    if (!customLeverancier.trim()) return uniqueLeveranciers;
    const lower = customLeverancier.toLowerCase();
    return uniqueLeveranciers.filter(lev => lev.toLowerCase().includes(lower));
  }, [uniqueLeveranciers, customLeverancier]);

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

  const allFilteredMaterials = useMemo(() => {
    let result = uniqueMaterials;

    if (categoryFilter !== 'all') {
      if (Array.isArray(categoryFilter)) {
        // Case-insensitive check for array
        const lowerFilters = categoryFilter.map(c => c.toLowerCase().trim());

        result = result.filter(m => {
          const sub = (m.subsectie || '').toLowerCase().trim();
          const cat = (m.categorie || '').toLowerCase().trim();

          // Check if ANY of the filter items match the material's subsection OR category
          // Logic: Material matches if its category CONTAINS the filter item OR filter item CONTAINS category
          // This handles cases like: Filter="Ribben" vs DB="Ribben, sls" -> Match
          // And: Filter="Isolatie materialen" vs DB="Isolatie" -> Match
          return lowerFilters.some(filterItem => {
            const matchesSub = sub.includes(filterItem) || filterItem.includes(sub);
            const matchesCat = cat.includes(filterItem) || filterItem.includes(cat);
            return matchesSub || matchesCat;
          });
        });
      } else {
        // Case-insensitive check for string
        const lowerFilter = categoryFilter.toLowerCase().trim();
        result = result.filter(m => {
          const sub = (m.subsectie || '').toLowerCase().trim();
          const cat = (m.categorie || '').toLowerCase().trim();

          const matchesSub = sub.includes(lowerFilter) || lowerFilter.includes(sub);
          const matchesCat = cat.includes(lowerFilter) || lowerFilter.includes(cat);
          return matchesSub || matchesCat;
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
  }, [uniqueMaterials, searchTerm, categoryFilter, selectedMaterialId]);

  const visibleMaterials = useMemo(() => {
    return allFilteredMaterials.slice(0, displayLimit);
  }, [allFilteredMaterials, displayLimit]);

  // --- FORM VALIDATION ---
  const isNaamOk = customNaam.trim().length > 0;
  const prijsNum = parsePriceToNumber(customPrijs);
  const isPrijsOk = prijsNum != null && prijsNum >= 0;
  const isEenheidOk = (customEenheid || '').trim().length > 0;

  const canSaveCustom = useMemo(() => {
    return !savingCustom && isNaamOk && isPrijsOk && isEenheidOk;
  }, [savingCustom, isNaamOk, isPrijsOk, isEenheidOk]);

  // --- PREVIEW NAME GENERATOR ---
  const previewNaam = useMemo(() => {
    return constructFinalName(customNaam);
  }, [customNaam]);

  // --- SAVE ACTION ---
  const saveCustomMaterial = async () => {
    try {
      setError(null);

      // 1. Validation
      const naamRaw = customNaam.trim();
      if (!naamRaw) throw new Error('Materiaalnaam is verplicht.');
      const baseName = naamRaw.charAt(0).toUpperCase() + naamRaw.slice(1);

      const prijsNumLocal = parsePriceToNumber(customPrijs);
      if (prijsNumLocal == null || prijsNumLocal < 0) throw new Error('Vul een geldige prijs in.');

      const eenheid = (customEenheid || '').trim();
      if (!eenheid) throw new Error('Kies een eenheid.');

      setSavingCustom(true);

      // 2. Generate the FINAL string using the shared helper
      const finalNameToSend = constructFinalName(baseName);

      // Calculate price per piece if possible
      const calculatedPiecePrice = prijsNumLocal;

      // 3. Prepare Payload
      const payload: any = {
        materiaalnaam: finalNameToSend,
        eenheid,
        prijs: prijsNumLocal, // Unit price
        prijs_per_stuk: calculatedPiecePrice, // Calculated piece price (same as unit price for simple items)
        categorie: customSubsectie.trim() || 'Overig',
        leverancier: customLeverancier.trim() || null,
        wastePercentage: wastePercentage || 0,
      };

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

      const row = Array.isArray(json.data) ? json.data[0] : json.data;
      const realId = row?.row_id || row?.id || json.id;

      // 5. Success Callback
      if (onMaterialAdded) {
        onMaterialAdded({
          ...payload,
          id: realId,
          row_id: realId,
          prijs: prijsNumLocal,
          prijs_per_stuk: calculatedPiecePrice,
        });
      }

      // Reset and close
      setEditingMaterialId(null);
      onOpenChange(false);

    } catch (e: any) {
      console.error("❌ Fout bij opslaan:", e);
      setError(e?.message || 'Onbekende fout.');
    } finally {
      setSavingCustom(false);
    }
  };

  const startEditing = (mat: ExistingMaterial, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMaterialId(mat.row_id);

    // Pre-fill form
    setCustomNaam(mat.materiaalnaam || '');
    setCustomEenheid(mat.eenheid || '');

    // Handle price formatting
    const price = parsePriceToNumber(mat.prijs_incl_btw ?? mat.prijs);
    setCustomPrijs(price !== null ? price.toString().replace('.', ',') : '');

    setCustomSubsectie(mat.categorie || mat.subsectie || '');
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

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && onUpdateWaste) {
      onUpdateWaste(wastePercentage);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[640px] w-full p-0 transition-all duration-200",
          step === 'search'
            ? "h-[85vh] flex flex-col overflow-hidden gap-0"
            : "h-auto block"
        )}
      >

        {/* === STEP 1: SEARCH & FILTER === */}
        {step === 'search' && (
          <>
            <div className="p-6 pb-2 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col gap-0.5">
                  <DialogTitle className="text-xl font-semibold">
                    {categoryTitle || 'Kies materiaal'}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    Selecteer een materiaal voor {categoryTitle ? categoryTitle.toLowerCase() : 'dit onderdeel'}
                  </p>
                </div>

                {/* Waste Percentage Inline Edit */}
                <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-md border border-border/50">
                  {isEditingWaste ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-muted-foreground pl-1">Afval:</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-6 w-14 text-xs px-1 py-0 bg-transparent border-emerald-500/50 focus-visible:ring-0 text-right font-medium"
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
                      <span className="text-xs text-muted-foreground pr-1">%</span>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingWaste(true)}
                      className="h-6 px-2 text-xs font-medium text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 gap-1.5"
                    >
                      <span>Afval: {wastePercentage}%</span>
                      <Pencil className="h-3 w-3 opacity-50" />
                    </Button>
                  )}
                </div>

                <DialogDescription className="sr-only">
                  Zoek en selecteer een materiaal uit de lijst of maak een nieuwe aan.
                </DialogDescription>
              </div>

              <div className="mb-4">
                <Button
                  onClick={() => {
                    setEditingMaterialId(null);
                    setCustomNaam('');
                    setCustomEenheid('');
                    setCustomPrijs('');
                    setCustomSubsectie('');
                    setCustomLeverancier('');
                    setStep('form');
                  }}
                  variant="outline"
                  className="w-full h-12 border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:bg-muted/10 hover:border-emerald-500/50 transition-all group"
                >
                  <Plus className="mr-2 h-4 w-4 group-hover:text-emerald-500 transition-colors" />
                  <span className="font-medium">Nieuw materiaal toevoegen</span>
                </Button>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoek op materiaalnaam..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-10 border-muted-foreground/20 focus-visible:ring-emerald-500/50"
                  />
                </div>

                <Select
                  value={Array.isArray(categoryFilter) ? 'custom_filter' : categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger className="w-full h-9 text-xs border-muted-foreground/20 bg-transparent">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Filter className="h-3 w-3" />
                      <span className="truncate max-w-[340px]">
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
            </div>

            <div className="flex-1 overflow-y-auto border-t">
              <ul className="divide-y divide-border">
                {visibleMaterials.map((mat) => (
                  <li key={mat.row_id} className="group border-b border-border/50 last:border-0">
                    <div className="w-full flex items-stretch">

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
                          {/* {(mat.subsectie || mat.leverancier) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {[mat.subsectie, mat.leverancier].filter(Boolean).join(' • ')}
                            </div>
                          )} */}
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div className="flex flex-col items-end">
                            {(() => {
                              // Check multiple price fields (different data sources use different field names)
                              const prijsPerStuk = parsePriceToNumber(mat.prijs_per_stuk);
                              const prijsInclBtw = parsePriceToNumber((mat as any).prijs_incl_btw);
                              const prijs = parsePriceToNumber(mat.prijs);

                              // Use the first non-null price we find
                              const finalPrice = prijsPerStuk ?? prijsInclBtw ?? prijs;
                              const eenheid = mat.eenheid || 'stuk';

                              return (
                                <>
                                  <div className="text-sm font-medium">
                                    {formatEuro(finalPrice)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    per {eenheid}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Eenheid *</div>
                  <Select value={customEenheid} onValueChange={setCustomEenheid}>
                    <SelectTrigger>
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
                  <div className="text-sm font-medium">Prijs per eenheid (€) *</div>
                  <Input
                    value={customPrijs}
                    onChange={(e) => {
                      // Allow numbers, commas, dots
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setCustomPrijs(val);
                    }}
                    onKeyDown={(e) => {
                      // Block 'e', 'E', '+', '-' 
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


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Categorie (optioneel)</div>
                  <div className="relative">
                    <Input
                      value={customSubsectie}
                      onChange={(e) => setCustomSubsectie(e.target.value)}
                      onFocus={() => setCategorieDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setCategorieDropdownOpen(false), 150)}
                      placeholder="Bijv. Balkhout"
                      autoComplete="off"
                      className={uniqueCategories.length > 0 ? "pr-10" : ""}
                    />
                    {uniqueCategories.length > 0 && (
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
                            onMouseDown={(e) => { e.preventDefault(); setCustomSubsectie(cat); setCategorieDropdownOpen(false); }}
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

              {/* CHECK BAR (RED) */}
              {/* RECEIPT PREVIEW CARD */}
              {isPrijsOk && customEenheid && (
                <div className="mx-0 mb-2 mt-6 flex items-center justify-between rounded-r-lg rounded-l-sm border border-border/50 bg-card/50 px-5 py-4 shadow-sm border-l-4 border-l-emerald-500 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                      <Package className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Voorvertoning</span>
                      <span className="text-base font-bold text-white mt-1.5 leading-tight">
                        {previewNaam}
                      </span>
                    </div>
                  </div>

                  <div className="text-right ml-6 shrink-0">
                    <div className="text-xl font-bold text-white leading-none tracking-tight">
                      {formatEuro(prijsNum)}
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground mt-1.5 uppercase tracking-wide">
                      Per {customEenheid}
                    </div>
                  </div>
                </div>
              )}
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
                onClick={saveCustomMaterial}
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
  );
}

// Helpers
const POSITIVE_BTN_SOFT =
  'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 ' +
  'hover:bg-emerald-500/25 hover:border-emerald-500/65 ' +
  'focus-visible:ring-emerald-500 focus-visible:ring-offset-0';
