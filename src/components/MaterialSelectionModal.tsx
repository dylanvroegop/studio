'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Calculator, Package, Search, Filter, ArrowLeft, ChevronDown, X } from 'lucide-react';
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
  onMaterialAdded?: (material: any) => void;
}

export function MaterialSelectionModal({ 
  open, 
  onOpenChange, 
  existingMaterials = [], 
  onSelectExisting,
  onMaterialAdded 
}: MaterialSelectionModalProps) {
  
  const [step, setStep] = useState<'search' | 'choice' | 'form'>('search');
  const [savingCustom, setSavingCustom] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [displayLimit, setDisplayLimit] = useState(50);

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

  useEffect(() => {
    if (open) {
      setStep('search'); 
      setError(null);
      setSearchTerm('');
      setCategoryFilter('all');
      setDisplayLimit(50);
      
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
    setDisplayLimit(50);
  }, [searchTerm, categoryFilter]);

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

  const allFilteredMaterials = useMemo(() => {
    let result = existingMaterials;

    if (categoryFilter !== 'all') {
      result = result.filter(m => m.subsectie === categoryFilter);
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(m => (m.materiaalnaam || '').toLowerCase().includes(lower));
    }
    
    return result;
  }, [existingMaterials, searchTerm, categoryFilter]);

  const visibleMaterials = useMemo(() => {
    return allFilteredMaterials.slice(0, displayLimit);
  }, [allFilteredMaterials, displayLimit]);

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
    const merged = buildMergedNaam({
      baseNaam: base,
      eenheid: customEenheid,
      maatUnit,
      lengte: maatLengte,
      breedte: maatBreedte,
      derdeWaarde: customEenheid === 'p/m3' ? maatHoogte : maatDikte,
    });
    return merged || stripMaatSuffix(base);
  }, [customNaam, maatVereist, customEenheid, maatUnit, maatLengte, maatBreedte, maatDikte, maatHoogte]);

  // --- SAVE ACTION ---
  const saveCustomMaterial = async () => {
    try {
      setError(null);
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

      if (isMaatEenheid(eenheid)) {
        if (!lengte || !breedte || !maatUnitLocal) throw new Error('Vul afmetingen in en kies mm/cm/m.');
        if (eenheid === 'p/m3' && !hoogte) throw new Error('Vul hoogte in.');
        if (eenheid !== 'p/m3' && !dikte) throw new Error('Vul dikte in.');
      }

      setSavingCustom(true);
      const payload: any = {
        materiaalnaam: stripMaatSuffix(formattedName), 
        eenheid,
        prijs: prijsNumLocal,
        categorie: customSubsectie.trim() || 'Overig',
        leverancier: customLeverancier.trim() || null,
        unit: maatUnitLocal,
      };

      if (isMaatEenheid(eenheid)) {
        payload.lengte = lengte;
        payload.breedte = breedte;
        if (eenheid === 'p/m3') payload.hoogte = hoogte;
        else payload.dikte = dikte;
      }
      
      if (onMaterialAdded) onMaterialAdded(payload);

      const token = await haalFirebaseIdToken();
      const res = await fetch('/api/materialen/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) console.error("Background save failed:", json?.message);
    } catch (e: any) {
      console.error("❌ Fout:", e);
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
      <DialogContent 
        className={cn(
          "sm:max-w-[640px] w-full p-0 transition-all duration-200", 
          step === 'search' 
            ? "h-[85vh] flex flex-col overflow-hidden" 
            : "h-auto block" 
        )}
      >
        
        {/* === STEP 1: SEARCH === */}
        {step === 'search' && (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <DialogHeader className="px-4 py-4 border-b shrink-0 flex flex-row items-center justify-between">
              <DialogTitle className="text-lg font-semibold">Kies materiaal</DialogTitle>
            </DialogHeader>

            {/* ✅ SEPARATE SECTION: NEW MATERIAL (Distinct Style) */}
            <div className="p-4 bg-muted/10 border-b space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Of maak nieuw</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => { setIsCalculatie(true); setStep('form'); }} 
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:border-emerald-500 hover:bg-emerald-500/5 transition-all group text-left shadow-sm"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                            <Calculator className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground group-hover:text-emerald-500">Calculatie</span>
                            <span className="text-[10px] text-muted-foreground">Maten verplicht</span>
                        </div>
                    </button>

                    <button 
                        onClick={() => { setIsCalculatie(false); setStep('form'); }} 
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:border-emerald-500 hover:bg-emerald-500/5 transition-all group text-left shadow-sm"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                            <Package className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground group-hover:text-emerald-500">Los Artikel</span>
                            <span className="text-[10px] text-muted-foreground">Geen maten</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* ✅ SEPARATE SECTION: SEARCH & FILTER */}
            <div className="p-4 border-b shrink-0 bg-background space-y-4">
               {/* Search Bar */}
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input 
                   autoFocus
                   placeholder="Zoek op materiaalnaam..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-9 h-10"
                 />
               </div>

               {/* Filter Bar */}
               <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full h-10 bg-muted/30 border-input hover:bg-muted/50 transition-all text-left font-normal text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground w-full">
                      <Filter className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">
                        {categoryFilter === 'all' ? 'Filter op categorie...' : categoryFilter}
                      </span>
                      {categoryFilter !== 'all' && (
                        <div 
                          className="p-1 hover:bg-muted-foreground/20 rounded-full cursor-pointer z-10"
                          onClick={(e) => {
                             e.stopPropagation();
                             setCategoryFilter('all');
                          }}
                        >
                            <X className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all" className="font-semibold text-muted-foreground">Toon alles</SelectItem>
                    {uniqueCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>

            <div className="flex-1 overflow-y-auto">
               <ul className="divide-y divide-border">
                 {visibleMaterials.map((mat) => (
                   <li key={mat.row_id}>
                     <button
                       type="button"
                       onClick={() => handleSelectExisting(mat)}
                       className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 transition-colors group"
                     >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground group-hover:text-emerald-600 transition-colors break-words whitespace-normal">
                            {mat.materiaalnaam}
                          </div>
                          {(mat.subsectie || mat.leverancier) && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {[mat.subsectie, mat.leverancier].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                             <div className="text-sm font-medium">
                                  {formatEuro(parsePriceToNumber(mat.prijs))}
                             </div>
                             <div className="text-xs text-muted-foreground">
                                  per {mat.eenheid}
                             </div>
                        </div>
                     </button>
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
            
             <DialogFooter className="border-t p-2 sm:justify-between shrink-0 bg-muted/5">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                  Annuleren
                </Button>
             </DialogFooter>
          </div>
        )}

        {/* === STEP 2: CHOICE === */}
        {step === 'choice' && (
            <div className="p-8 flex flex-col gap-8">
                <DialogHeader className="text-center shrink-0">
                    <DialogTitle className="text-2xl font-bold text-white">Wat voor materiaal voegt u toe?</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Kies het type product om het juiste formulier te openen.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => {
                        setIsCalculatie(true);
                        setStep('form');
                        }}
                        className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                    >
                        <div className="rounded-full bg-zinc-800 p-4 group-hover:bg-emerald-500/20 transition-colors">
                        <Calculator className="h-8 w-8 text-zinc-400 group-hover:text-emerald-500" />
                        </div>
                        <div>
                        <div className="text-lg font-bold text-white">Calculatie Product</div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Voor wanden, vloeren en rachels. <br /> Maten zijn <strong>verplicht</strong>.
                        </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                        setIsCalculatie(false);
                        setStep('form');
                        setCustomEenheid('stuk');
                        }}
                        className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                    >
                        <div className="rounded-full bg-zinc-800 p-4 group-hover:bg-emerald-500/20 transition-colors">
                        <Package className="h-8 w-8 text-zinc-400 group-hover:text-emerald-500" />
                        </div>
                        <div>
                        <div className="text-lg font-bold text-white">Los Artikel</div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Voor kranen, verf of lijm. <br /> Geen afmetingen nodig.
                        </div>
                        </div>
                    </button>
                </div>

                <div className="flex justify-center shrink-0">
                    <Button variant="ghost" onClick={() => setStep('search')} className="text-zinc-500 hover:text-white">
                        Terug naar zoeken
                    </Button>
                </div>
            </div>
        )}

        {/* === STEP 3: FORM === */}
        {step === 'form' && (
          <div className="flex flex-col">
             <DialogHeader className="px-6 pt-6 flex flex-row items-center gap-4 space-y-0 text-left border-b border-zinc-800 pb-6 shrink-0 bg-background">
               <Button size="icon" variant="ghost" className="-ml-2 h-8 w-8" onClick={() => setStep('search')}>
                  <ArrowLeft className="h-4 w-4" />
               </Button>
               <div className="flex flex-col gap-1">
                 <DialogTitle className="text-xl font-bold text-white leading-none">
                   Nieuw {isCalculatie ? 'Calculatie Product' : 'Los Artikel'}
                 </DialogTitle>
                 <DialogDescription className="text-zinc-400 text-sm">
                   Vul de gegevens van het materiaal in.
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
                  placeholder={isCalculatie ? "bijv. Gipsplaat AK" : "bijv. Keukenkraan chroom"}
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

               {/* CHECK BAR */}
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
                onClick={() => setStep('search')}
                className="h-11"
              >
                Vorige
              </Button>
              <Button
                type="button"
                variant="success"
                className="h-11 gap-2 px-8 text-sm font-bold shadow-lg shadow-success/20"
                onClick={saveCustomMaterial}
                disabled={!canSaveCustom || savingCustom}
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