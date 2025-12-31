'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Calculator, Package, Search, Library, Filter } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';

// --- HELPER FUNCTIONS & TYPES ---

export type ExistingMaterial = {
  row_id: string;
  materiaalnaam: string | null;
  prijs: number | string | null;
  eenheid: string | null;
  subsectie?: string | null;
  leverancier?: string | null;
  [key: string]: any; 
};

function parsePriceToNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
  if (typeof raw !== 'string') return null;

  let value = raw.trim();
  value = value.replace(/€/g, '').replace(/\s+/g, '');
  value = value.replace(/[^0-9.,-]/g, '');
  if (!value) return null;

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

function calculatePiecePrice(price: number, unit: string, L: string, B: string, maatUnit: string): number | null {
  const lengte = parseFloat(L.replace(',', '.'));
  const breedte = parseFloat(B.replace(',', '.'));
  if (isNaN(lengte) || isNaN(breedte)) return null;

  let areaM2 = 0;
  if (maatUnit === 'mm') areaM2 = (lengte * breedte) / 1000000;
  else if (maatUnit === 'cm') areaM2 = (lengte * breedte) / 10000;
  else areaM2 = lengte * breedte;

  if (unit === 'p/m2') return price * areaM2;
  if (unit === 'p/m1') {
    const lengthM1 = maatUnit === 'mm' ? lengte / 1000 : maatUnit === 'cm' ? lengte / 100 : lengte;
    return price * lengthM1;
  }
  return null;
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

const EENHEDEN: string[] = ['p/m1', 'p/m2', 'p/m3', 'stuk', 'doos', 'set'];
const MAAT_UNITS: string[] = ['mm', 'cm', 'm'];

function stripMaatSuffix(naam: string): string {
  return naam.replace(/\s+\d[\d\s.,x×-]*?(mm|cm|m)\s*$/i, '').trim();
}

function isMaatEenheid(eenheid: string): boolean {
  return eenheid === 'p/m1' || eenheid === 'p/m2' || eenheid === 'p/m3';
}

function buildMaatString(opts: {
  eenheid: string;
  maatUnit: string;
  lengte: string;
  breedte: string;
  derdeWaarde?: string;
}): string {
  const l = (opts.lengte || '').trim();
  const b = (opts.breedte || '').trim();
  const u = (opts.maatUnit || '').trim();
  if (!l || !b || !u) return '';

  const d = (opts.derdeWaarde || '').trim();
  if (!d) return '';

  return `${l} × ${b} × ${d}${u}`;
}

function buildMergedNaam(opts: {
  baseNaam: string;
  eenheid: string;
  maatUnit: string;
  lengte: string;
  breedte: string;
  derdeWaarde: string;
}): string {
  const base = stripMaatSuffix(opts.baseNaam.trim());
  const maat = buildMaatString({
    eenheid: opts.eenheid,
    maatUnit: opts.maatUnit,
    lengte: opts.lengte,
    breedte: opts.breedte,
    derdeWaarde: opts.derdeWaarde,
  });

  if (!maat) return base;
  return `${base} ${maat}`;
}

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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="number"      
        step="0.01"
        inputMode="decimal"
        className="pr-12"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </div>
    </div>
  );
}

async function haalFirebaseIdToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Niet ingelogd.');
  return await currentUser.getIdToken();
}

// --- MAIN COMPONENT ---

interface MaterialSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMaterials?: ExistingMaterial[];
  onSelectExisting?: (material: ExistingMaterial) => void;
  // Allow passing the new material back to the parent
onMaterialAdded?: (material: any) => void;
}

export function MaterialSelectionModal({ 
  open, 
  onOpenChange, 
  existingMaterials = [], 
  onSelectExisting,
  onMaterialAdded 
}: MaterialSelectionModalProps) {
  
  const [step, setStep] = useState<'choice' | 'search' | 'form'>('choice');
  const [savingCustom, setSavingCustom] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form State
  const [isCalculatie, setIsCalculatie] = useState<boolean>(true);
  const [customNaam, setCustomNaam] = useState<string>('');
  const [customEenheid, setCustomEenheid] = useState<string>('');
  const [customPrijs, setCustomPrijs] = useState<string>('');
  const [customSubsectie, setCustomSubsectie] = useState<string>('');
  const [customLeverancier, setCustomLeverancier] = useState<string>('');

  const [maatUnit, setMaatUnit] = useState<string>('mm');
  const [maatLengte, setMaatLengte] = useState<string>('');
  const [maatBreedte, setMaatBreedte] = useState<string>('');
  const [maatDikte, setMaatDikte] = useState<string>('');
  const [maatHoogte, setMaatHoogte] = useState<string>('');

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep('choice');
      setError(null);
      setSearchTerm('');
      setCategoryFilter('all');
      
      setCustomNaam('');
      setCustomEenheid('');
      setCustomPrijs('');
      setCustomSubsectie('');
      setCustomLeverancier('');
      setMaatUnit('mm');
      setMaatLengte('');
      setMaatBreedte('');
      setMaatDikte('');
      setMaatHoogte('');
    }
  }, [open]);

  useEffect(() => {
    if (customEenheid === 'p/m3') {
      setMaatDikte('');
    } else if (customEenheid === 'p/m1' || customEenheid === 'p/m2') {
      setMaatHoogte('');
    }
  }, [customEenheid]);

  // --- SEARCH LOGIC ---
  const uniqueCategories = useMemo(() => {
    const cats = new Set(existingMaterials.map(m => m.subsectie).filter(Boolean));
    return Array.from(cats).sort() as string[];
  }, [existingMaterials]);

  const filteredMaterials = useMemo(() => {
    let result = existingMaterials;

    // Filter by Category
    if (categoryFilter !== 'all') {
      result = result.filter(m => m.subsectie === categoryFilter);
    }

    // Filter by Search Term
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(m => (m.materiaalnaam || '').toLowerCase().includes(lower));
    } else {
      // Limit to 50 if no search term to prevent massive lists
      result = result.slice(0, 50);
    }
    return result;
  }, [existingMaterials, searchTerm, categoryFilter]);

  // --- FORM VALIDATION ---
  const isNaamOk = customNaam.trim().length > 0;
  const prijsNum = parsePriceToNumber(customPrijs);
  const isPrijsOk = prijsNum != null && prijsNum >= 0;
  const isEenheidOk = (customEenheid || '').trim().length > 0;
  const maatVereist = isMaatEenheid(customEenheid);

  const isMaatOk = useMemo(() => {
    if (!maatVereist) return true;
    const l = maatLengte.trim();
    const b = maatBreedte.trim();
    const u = maatUnit.trim();
    if (!l || !b || !u) return false;
    if (customEenheid === 'p/m3') return maatHoogte.trim().length > 0;
    return maatDikte.trim().length > 0;
  }, [maatVereist, maatLengte, maatBreedte, maatUnit, customEenheid, maatDikte, maatHoogte]);

  const canSaveCustom = useMemo(() => {
    const basisCheck = !savingCustom && isNaamOk && isPrijsOk && isEenheidOk;
    if (isCalculatie) return basisCheck && isMaatOk;
    return basisCheck;
  }, [savingCustom, isNaamOk, isPrijsOk, isEenheidOk, isMaatOk, isCalculatie]);

  const previewNaam = useMemo(() => {
    const base = (customNaam || '').trim() || '...';
    if (!maatVereist) return stripMaatSuffix(base);
    const derde = customEenheid === 'p/m3' ? maatHoogte : maatDikte;
    const merged = buildMergedNaam({
      baseNaam: base,
      eenheid: customEenheid,
      maatUnit,
      lengte: maatLengte,
      breedte: maatBreedte,
      derdeWaarde: derde,
    });
    return merged || stripMaatSuffix(base);
  }, [customNaam, maatVereist, customEenheid, maatUnit, maatLengte, maatBreedte, maatDikte, maatHoogte]);

  // --- SAVE ACTION ---
  const saveCustomMaterial = async () => {
    try {
      console.log("1. Save clicked"); // debug
      setError(null);

      // --- A. DEFINE VARIABLES (These were likely missing!) ---
      const naamRaw = customNaam.trim();
      if (!naamRaw) throw new Error('Materiaalnaam is verplicht.');

      const formattedName = naamRaw
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const prijsNumLocal = parsePriceToNumber(customPrijs);
      if (prijsNumLocal == null || prijsNumLocal < 0) throw new Error('Vul een geldige prijs in.');

      const eenheid = (customEenheid || '').trim();
      if (!eenheid) throw new Error('Kies een eenheid.');

      const maatUnitLocal = (maatUnit || 'mm').trim();
      const lengte = maatLengte.trim();
      const breedte = maatBreedte.trim();
      const dikte = maatDikte.trim();
      const hoogte = maatHoogte.trim();

      // --- B. VALIDATE ---
      if (isMaatEenheid(eenheid)) {
        if (!lengte || !breedte || !maatUnitLocal) throw new Error('Vul afmetingen in en kies mm/cm/m.');
        if (eenheid === 'p/m3' && !hoogte) throw new Error('Vul hoogte in.');
        if (eenheid !== 'p/m3' && !dikte) throw new Error('Vul dikte in.');
      }

      setSavingCustom(true);

      // --- C. BUILD PAYLOAD ---
      const payload: any = {
        materiaalnaam: formattedName,
        eenheid,
        prijs: prijsNumLocal,
        categorie: customSubsectie.trim() || 'Overig',
        leverancier: customLeverancier.trim() || null,
        unit: maatUnitLocal,
      };

      // Add dimensions if needed
      if (isMaatEenheid(eenheid)) {
        payload.lengte = lengte;
        payload.breedte = breedte;
        if (eenheid === 'p/m3') payload.hoogte = hoogte;
        else payload.dikte = dikte;
      }

      // --- D. OPTIMISTIC UPDATE (THE FIX) ---
      // We call this NOW, before any fetching.
      console.log("2. Calling onMaterialAdded with:", payload); // debug
      if (onMaterialAdded) {
         onMaterialAdded(payload);
      } else {
         console.warn("⚠️ onMaterialAdded prop is missing!");
      }

      // --- E. SAVE TO DB (Can fail without breaking UI) ---
      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/upsert', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        // We log the error but do NOT throw it to the user, 
        // because the item is already added to their screen.
        console.error("Background save failed:", json?.message || "Unknown error");
      }

    } catch (e: any) {
      console.error("Crash in saveCustomMaterial:", e);
      setError(e?.message || 'Onbekende fout.');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleSelectExisting = (m: ExistingMaterial) => {
    if (onSelectExisting) {
      onSelectExisting(m);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] w-full max-h-[80vh] flex flex-col p-0 overflow-hidden">
        
        {step === 'choice' && (
          <div className="p-8 h-full overflow-y-auto">
            <DialogHeader className="mb-6 text-center">
              <DialogTitle className="text-2xl font-bold text-white">Materiaal Kiezen</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Kies uit uw bibliotheek of maak een nieuw materiaal aan.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setStep('search')}
                className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 text-left transition-all hover:border-emerald-500 hover:bg-zinc-900"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20">
                  <Library className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-bold text-white group-hover:text-emerald-500 transition-colors">
                    Kies uit bibliotheek
                  </div>
                  <div className="text-sm text-zinc-500">
                    Zoek in {existingMaterials.length} bestaande materialen
                  </div>
                </div>
                <Search className="h-5 w-5 text-zinc-600 group-hover:text-emerald-500" />
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-zinc-800"></div>
                <span className="mx-4 shrink-0 text-xs text-zinc-600 uppercase font-bold tracking-wider">Of maak nieuw</span>
                <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCalculatie(true);
                    setStep('form');
                  }}
                  className="group flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                >
                  <div className="rounded-full bg-zinc-800 p-3 group-hover:bg-emerald-500/20 transition-colors">
                    <Calculator className="h-6 w-6 text-zinc-400 group-hover:text-emerald-500" />
                  </div>
                  <div>
                    <div className="font-bold text-white">Calculatie Product</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Maten verplicht</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCalculatie(false);
                    setStep('form');
                    setCustomEenheid('stuk');
                  }}
                  className="group flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                >
                  <div className="rounded-full bg-zinc-800 p-3 group-hover:bg-emerald-500/20 transition-colors">
                    <Package className="h-6 w-6 text-zinc-400 group-hover:text-emerald-500" />
                  </div>
                  <div>
                    <div className="font-bold text-white">Los Artikel</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Geen maten</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-500 hover:text-white">
                Annuleren
              </Button>
            </div>
          </div>
        )}

        {step === 'search' && (
          <div className="flex flex-col h-full overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex flex-row items-center justify-between shrink-0">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button 
                      onClick={() => setStep('choice')} 
                      className="text-zinc-400 hover:text-white text-xs flex items-center gap-1 transition-colors"
                  >
                      ← Terug
                  </button>
                </div>
                <DialogTitle className="text-xl font-bold text-white">Zoek materiaal</DialogTitle>
              </div>

              {/* Filter Dropdown in Header */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-900 border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-zinc-400" />
                    <SelectValue placeholder="Categorie" />
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">Alle categorieën</SelectItem>
                  {uniqueCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DialogHeader>

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                 <Input 
                   autoFocus
                   placeholder="Typ om te zoeken..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-9 bg-zinc-950 border-zinc-800 focus:ring-emerald-500 focus:border-emerald-500/50"
                 />
               </div>
            </div>

            <ScrollArea className="flex-1">
               {filteredMaterials.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-zinc-500 text-sm">Geen materialen gevonden.</p>
                    <Button variant="link" onClick={() => { setIsCalculatie(false); setStep('form'); }} className="text-emerald-500 mt-2">
                      Maak nieuw aan
                    </Button>
                 </div>
               ) : (
                 <ul className="divide-y divide-zinc-800/60">
                   {filteredMaterials.map((mat) => (
                     <li key={mat.row_id}>
                       <button
                         type="button"
                         onClick={() => handleSelectExisting(mat)}
                         className="w-full flex items-start gap-3 p-4 text-left hover:bg-zinc-800/40 transition-colors group"
                       >
                          <div className="flex-1 min-w-0">
                            {/* 1. Name */}
                            <div className="font-medium text-white group-hover:text-emerald-400 transition-colors truncate text-base">
                              {mat.materiaalnaam}
                            </div>
                            
                            {/* 2. Price and Unit (Stacked below name) */}
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-mono text-zinc-300">
                                    {formatEuro(parsePriceToNumber(mat.prijs))}
                                </span>
                                <span className="text-xs text-zinc-500 bg-zinc-900/50 px-1.5 py-0.5 rounded">
                                    {mat.eenheid}
                                </span>
                            </div>

                            {/* 3. Category / Supplier (Bottom line) */}
                            {(mat.subsectie || mat.leverancier) && (
                              <div className="text-xs text-zinc-500 mt-1 truncate">
                                {[mat.subsectie, mat.leverancier].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </div>
                       </button>
                     </li>
                   ))}
                 </ul>
               )}
            </ScrollArea>
          </div>
        )}

        {step === 'form' && (
          <div className="flex flex-col h-full overflow-y-auto">
             <DialogHeader className="px-6 pt-6 flex flex-row items-center gap-4 space-y-0 text-left border-b border-zinc-800 pb-6 shrink-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                {isCalculatie ? (
                  <Calculator className="h-6 w-6 text-emerald-500" />
                ) : (
                  <Package className="h-6 w-6 text-emerald-500" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-xl font-bold text-white leading-none">
                  Nieuw {isCalculatie ? 'Calculatie Product' : 'Los Artikel'}
                </DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm">
                  Vul de gegevens van het materiaal in.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="space-y-4 px-6 py-4 flex-1">
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
                  placeholder={isCalculatie ? "bijv. Gipsplaat AK" : "bijv. Keukenkraan chroom"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Eenheid *</div>
                  <Select value={customEenheid} onValueChange={setCustomEenheid}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies eenheid" />
                    </SelectTrigger>
                    <SelectContent>
                      {isCalculatie 
                        ? EENHEDEN.filter(e => e.includes('p/m') || e === 'stuk').map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))
                        : EENHEDEN.filter(e => !e.includes('p/m')).map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Prijs per eenheid (€) *</div>
                  <Input
                    value={customPrijs}
                    onChange={(e) => setCustomPrijs(e.target.value)}
                    type="number"  
                    step="0.01"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>

              {isCalculatie && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-inner">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white uppercase tracking-tight">Afmetingen *</div>
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Unit</div>
                      <Select value={maatUnit} onValueChange={setMaatUnit}>
                        <SelectTrigger className="h-7 w-[70px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAAT_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Lengte</div>
                      <InputMetSuffix value={maatLengte} onChange={setMaatLengte} suffix={maatUnit} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Breedte</div>
                      <InputMetSuffix value={maatBreedte} onChange={setMaatBreedte} suffix={maatUnit} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">
                        {customEenheid === 'p/m3' ? 'Hoogte' : 'Dikte'}
                      </div>
                      <InputMetSuffix
                        value={customEenheid === 'p/m3' ? maatHoogte : maatDikte}
                        onChange={customEenheid === 'p/m3' ? setMaatHoogte : setMaatDikte}
                        suffix={maatUnit}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="mt-3 text-[10px] italic text-muted-foreground">
                    Wordt opgeslagen als: <span className="font-semibold text-emerald-500">{previewNaam}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Categorie (optioneel)</div>
                  <Input
                    value={customSubsectie}
                    onChange={(e) => setCustomSubsectie(e.target.value)}
                    placeholder="Bijv. Balkhout"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Leverancier (optioneel)</div>
                  <Input
                    value={customLeverancier}
                    onChange={(e) => setCustomLeverancier(e.target.value)}
                    placeholder="Bijv. Bouwmaat"
                  />
                </div>
              </div>

              {/* Live Preview Bar */}
              {isPrijsOk && (isCalculatie ? isMaatOk : true) && customEenheid && (
                <div className="mx-0 mb-2 mt-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-destructive uppercase tracking-widest leading-none">Controle</span>
                      <span className="text-sm font-semibold text-white mt-1 italic whitespace-nowrap">
                        {previewNaam}
                      </span>
                    </div>
                  </div>

                  <div className="text-right ml-4">
                    <div className="text-lg font-black text-white leading-none">
                      {formatEuro(isCalculatie 
                        ? (calculatePiecePrice(prijsNum!, customEenheid, maatLengte, maatBreedte, maatUnit) ?? prijsNum)
                        : prijsNum
                      )}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-zinc-400 mt-1">
                      {isCalculatie ? 'Totaal per stuk' : `Per ${customEenheid}`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-muted/60 bg-muted/5 px-6 py-4 sm:justify-end gap-3 shrink-0">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setStep('choice')}
                className="h-11"
              >
                Vorige
              </Button>

              <Button
                type="button"
                variant="success"
                onClick={saveCustomMaterial}
                disabled={!canSaveCustom || savingCustom}
                className="h-11 gap-2 px-8 text-sm font-bold shadow-lg shadow-success/20"
              >
                {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Materiaal toevoegen
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}