/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle, Maximize2, Square, Slash, Triangle, CornerDownRight, ArrowDownToLine, Info, X, Search, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import html2canvas from 'html2canvas';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { PersonalNotes } from '@/components/PersonalNotes';
import { cn } from '@/lib/utils';
import { cleanFirestoreData } from '@/lib/clean-firestore';
import { MeasurementInput } from '@/components/MeasurementInput';

import { Switch } from '@/components/ui/switch';

import { useFirestore, useUser } from '@/firebase';
import { JOB_REGISTRY, MeasurementField } from '@/lib/job-registry';
import { WizardHeader } from '@/components/WizardHeader';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { JobComponent } from '@/lib/types';
import { VisualizerController } from '@/components/visualizers/VisualizerController';
import { OpeningenSection } from '@/components/openingen/OpeningenSection';
import { BalkenSection } from '@/components/balken/BalkenSection';
import { LeidingkoofSection } from '@/components/leidingkoof/LeidingkoofSection';
import { VensterbankSection } from '@/components/vensterbank/VensterbankSection';
import { DagkantSection } from '@/components/dagkant/DagkantSection';
import { getJobConfig } from '@/config/jobTypes/index';
import { DynamicInput } from '@/components/DynamicInput';


interface VakInputCardProps {
  index: number; // For uniqueness in collapse keys
  title: string;
  type: string;
  width: number | string;
  height: number | string;
  // Specifics
  doorPosition?: 'left' | 'right';
  doorSwing?: 'left' | 'right'; // Deur draairichting
  hasBorstwering?: boolean;
  borstweringHeight?: number | string;

  // Callbacks
  onTypeChange?: (type: string) => void;
  onWidthChange: (val: string | number) => void;
  onHeightChange: (val: string | number) => void;
  onUpdateFull?: (updates: any) => void; // Generic update used for complex props

  // UI State
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  disabled?: boolean;
  disableWidth?: boolean;
  disableHeight?: boolean;

  // Context
  displayHeight?: number; // fallback height for display
  displayWidth?: number; // fallback width for display
}

function VakInputCard({
  index,
  title,
  type,
  width,
  height,
  doorPosition,
  doorSwing,
  hasBorstwering,
  borstweringHeight,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onUpdateFull,
  isCollapsed,
  onToggleCollapse,
  disabled,
  disableWidth,
  disableHeight,
  displayHeight,
  displayWidth
}: VakInputCardProps) {
  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">{title}</span>
          {/* Badge? */}
        </div>
        <div className="text-zinc-500">
          {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
          <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-3">
            {/* Type Dropdown */}
            <div className="col-span-2">
              <Label className="text-xs mb-1.5 block">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => onTypeChange && onTypeChange(v)}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs bg-black/20 border-white/10">
                  <SelectValue placeholder="Selecteer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deur">Deur</SelectItem>
                  <SelectItem value="glas">Glas</SelectItem>
                  <SelectItem value="paneel">Paneel</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Breedte</Label>
              <MeasurementInput
                value={width !== undefined && width !== '' ? width : (displayWidth && displayWidth > 0 ? Math.round(displayWidth) : '')}
                onChange={onWidthChange}
                disabled={disabled || disableWidth}
                placeholder={displayWidth && displayWidth > 0 ? String(Math.round(displayWidth)) : ''}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Hoogte</Label>
              <MeasurementInput
                value={height !== undefined && height !== '' ? height : (displayHeight && displayHeight > 0 ? Math.round(displayHeight) : '')}
                onChange={onHeightChange}
                disabled={disabled || disableHeight}
                placeholder={displayHeight && displayHeight > 0 ? String(Math.round(displayHeight)) : ''}
              />
            </div>
          </div>

          {/* Door Specifics */}
          {type === 'deur' && onUpdateFull && (
            <div className="space-y-3 pt-3 border-t border-white/5">
              <Label className="text-xs">Startpositie</Label>
              <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => onUpdateFull({ doorPosition: 'left' })}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-colors",
                    doorPosition !== 'right' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Links
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateFull({ doorPosition: 'right' })}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-colors",
                    doorPosition === 'right' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Rechts
                </button>
              </div>
              
              <Label className="text-xs">Draairichting</Label>
              <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => onUpdateFull({ doorSwing: 'left' })}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-colors",
                    doorSwing === 'left' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Links draaiend
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateFull({ doorSwing: 'right' })}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-colors",
                    doorSwing === 'right' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Rechts draaiend
                </button>
              </div>
            </div>
          )}

          {/* Glas Specifics (Borstwering) */}
          {type === 'glas' && onUpdateFull && (
            <div className="pt-2 border-t border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Borstwering</Label>
                <Switch
                  checked={!!hasBorstwering}
                  onCheckedChange={(checked) => onUpdateFull({ hasBorstwering: checked })}
                  disabled={disabled}
                />
              </div>
              {hasBorstwering && (
                <div className="space-y-2">
                  <Label className="text-xs">Hoogte (mm)</Label>
                  <MeasurementInput
                    value={borstweringHeight}
                    onChange={(v) => onUpdateFull({ borstweringHeight: v })}
                    disabled={disabled}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GenericMeasurementPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;
  const isMaatwerkKozijn = jobSlug === 'maatwerk-kozijnen';
  const specificJobConfig = getJobConfig(jobSlug);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Refs for capturing visualizations
  const visualizerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ✅ 1. Add the Mounted State
  const [isMounted, setIsMounted] = useState(false);
  const [isMagnifier, setIsMagnifier] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Get Config
  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const fields = jobConfig?.measurements || [];

  // Logic to determine if "Openings" section is relevant
  const isWallCategory = Boolean(categorySlug === 'wanden' || (jobSlug && (jobSlug.includes('voorzetwand') || jobSlug.includes('tussenwand') || jobSlug.includes('scheidingswand'))));
  const isCeilingCategory = Boolean(categorySlug === 'plafonds' || (jobSlug && jobSlug.includes('plafond')));
  const isRoofCategory = categorySlug === 'dakrenovatie' || (jobSlug && (jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('epdm')));
  const isBoeiboord = categorySlug === 'boeiboorden' || (jobSlug && jobSlug.includes('boeiboord'));
  const hasWallFields = fields.some(f => f.key === 'balkafstand');
  const showOpeningsSection = specificJobConfig.sections.includes('openingen');
  const showLeidingkoofSection = specificJobConfig.sections.includes('leidingkoof');
  const showVensterbankSection = specificJobConfig.sections.includes('vensterbanken');
  const showDagkantSection = specificJobConfig.sections.includes('dagkanten');

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [notities, setNotities] = useState(''); // New: Job Notes state
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pendingDeleteOpening, setPendingDeleteOpening] = useState<{ itemIndex: number; openingIndex: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [kozijnhoutFrameThicknessMm, setKozijnhoutFrameThicknessMm] = useState<number | null>(null);
  const [tussenstijlThicknessMm, setTussenstijlThicknessMm] = useState<number | null>(null);
  const [hasTussenstijl, setHasTussenstijl] = useState(false);

  // Initialize collapsed state for vakken - only set to expanded (false) if not already defined
  useEffect(() => {
    if (!isMaatwerkKozijn) return;
    setCollapsedSections(prev => {
      const next = { ...prev };
      items.forEach((item, itemIdx) => {
        const vakken = Array.isArray(item?.vakken) ? item.vakken : [];
        vakken.forEach((_: any, vakIdx: number) => {
          const key = `vak-${itemIdx}-${vakIdx}`;
          // Only set default if not already defined (undefined = not set yet)
          if (next[key] === undefined) {
            next[key] = false; // false = expanded/open
          }
        });
        // Also initialize the door card if not already set
        const deurKey = `vak-deur-${itemIdx}`;
        if (next[deurKey] === undefined) {
          next[deurKey] = false; // false = expanded/open
        }
      });
      return next;
    });
  }, [items, isMaatwerkKozijn]);
  const [hasGlas, setHasGlas] = useState(false);

  const parseDimToMm = (raw: any): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim().toLowerCase();
    const match = s.match(/([\d.,]+)\s*(mm|cm|m)?/i);
    if (!match) return null;
    const num = parseFloat(match[1].replace(',', '.'));
    if (!Number.isFinite(num)) return null;
    const unit = match[2];
    if (unit === 'cm') return num * 10;
    if (unit === 'm') return num * 1000;
    return num;
  };

  const parseDikteToMm = (raw: any): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim().toLowerCase();
    if (s.includes('x')) {
      const unitMatch = s.match(/\b(mm|cm|m)\b/);
      const unit = unitMatch?.[1];
      const nums = s.match(/[\d.,]+/g)?.map(n => parseFloat(n.replace(',', '.'))).filter(n => Number.isFinite(n));
      if (nums && nums.length > 0) {
        const val = Math.min(...nums);
        if (unit === 'cm') return val * 10;
        if (unit === 'm') return val * 1000;
        return val;
      }
    }
    return parseDimToMm(raw);
  };

  const findVlizotrapMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    let found: any = null;
    Object.values(materialenLijst).forEach((entry: any) => {
      if (!entry || !entry.material) return;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey;
      const categorie = entry.material?.categorie;
      const naam = entry.material?.materiaalnaam || '';
      const keyMatch = sectionKey === 'trap' || sectionKey === 'vlizotrap' || sectionKey === 'vlizotrap_unit';
      const catMatch = typeof categorie === 'string' && categorie.toLowerCase().includes('vlieringtrap');
      const nameMatch = typeof naam === 'string' && naam.toLowerCase().includes('vlizotrap');
      if (keyMatch || catMatch || nameMatch) found = entry.material;
    });
    return found;
  };

  const findKozijnhoutMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    let found: any = null;
    Object.values(materialenLijst).forEach((entry: any) => {
      if (!entry || !entry.material) return;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey;
      if (sectionKey === 'kozijnhout_buiten') found = entry.material;
    });
    return found;
  };

  const findTussenstijlMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    let found: any = null;
    Object.values(materialenLijst).forEach((entry: any) => {
      if (!entry || !entry.material) return;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey;
      if (sectionKey === 'tussenstijl') found = entry.material;
    });
    return found;
  };

  const hasGlasMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    return Object.values(materialenLijst).some((entry: any) => {
      if (!entry || !entry.material) return false;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey || '';
      if (typeof sectionKey === 'string' && sectionKey.toLowerCase().includes('glas')) return true;
      const categorie = entry.material?.categorie;
      if (typeof categorie === 'string' && categorie.toLowerCase().includes('glas')) return true;
      return false;
    });
  };

  const syncVlizotrapOpening = (item: any, material: any) => {
    const openings = Array.isArray(item.openings) ? [...item.openings] : [];
    const autoIndex = openings.findIndex((op: any) => op?.autoSource === 'vlizotrap_material');
    const widthMm = parseDimToMm(material?.breedte);
    const heightMm = parseDimToMm(material?.lengte);

    if (!material || !widthMm || !heightMm) {
      if (autoIndex !== -1) openings.splice(autoIndex, 1);
      return { ...item, openings };
    }

    if (autoIndex === -1) {
      const len = Number(item.lengte) || 0;
      const br = Number(item.breedte) || 0;
      const fromLeft = len > 0 ? Math.max(0, (len - widthMm) / 2) : 0;
      const fromBottom = br > 0 ? Math.max(0, (br - heightMm) / 2) : 0;
      openings.push({
        id: crypto.randomUUID(),
        type: 'vlizotrap',
        width: widthMm,
        height: heightMm,
        fromLeft,
        fromBottom,
        autoSource: 'vlizotrap_material',
        sourceMaterialId: material?.row_id || material?.id || null,
      });
    } else {
      const existing = openings[autoIndex];
      openings[autoIndex] = {
        ...existing,
        type: 'vlizotrap',
        width: widthMm,
        height: heightMm,
        autoSource: 'vlizotrap_material',
        sourceMaterialId: material?.row_id || material?.id || existing?.sourceMaterialId || null,
      };
    }

    return { ...item, openings };
  };

  // Sync with Firestore preferences
  useEffect(() => {
    if (!user || !firestore) return;
    const fetchPrefs = async () => {
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const prefs = snap.data().ui_preferences || {};
          setCollapsedSections(prev => ({ ...prev, ...prefs }));
        }
      } catch (err) {
        console.error("Error fetching preferences:", err);
      }
    };
    fetchPrefs();
  }, [user, firestore]);

  const toggleCollapsed = useCallback((key: string, defaultCollapsed = true) => {
    setCollapsedSections(prev => {
      // Logic: if undefined, it means it's in its' default state
      const currentIsCollapsed = prev[key] === undefined ? defaultCollapsed : prev[key];
      const nextVal = !currentIsCollapsed;
      const next = { ...prev, [key]: nextVal };

      // Persist to Firestore instantly
      if (user && firestore) {
        const userRef = doc(firestore, 'users', user.uid);
        // Using setDoc with merge: true for instant, granular updates
        setDoc(userRef, {
          ui_preferences: { [key]: nextVal }
        }, { merge: true }).catch(err => {
          console.error("Failed to sync UI preference:", err);
        });
      }

      return next;
    });
  }, [user, firestore]);

  // 4. Load Data
  useEffect(() => {
    async function loadData() {
      if (!quoteId || !klusId || !firestore) return;

      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          const container = data.klussen?.[klusId] || {};
          const maatwerk = container.maatwerk;
          const vlizotrapMaterial = findVlizotrapMaterial(container);
          const kozijnhoutMaterial = isMaatwerkKozijn ? findKozijnhoutMaterial(container) : null;
          const tussenstijlMaterial = isMaatwerkKozijn ? findTussenstijlMaterial(container) : null;
          const kozijnhoutThickness = kozijnhoutMaterial ? parseDikteToMm(kozijnhoutMaterial?.dikte) : null;
          const tussenstijlThickness = tussenstijlMaterial ? parseDikteToMm(tussenstijlMaterial?.dikte) : null;
          const glasSelected = isMaatwerkKozijn ? hasGlasMaterial(container) : false;

          if (isMaatwerkKozijn) {
            setKozijnhoutFrameThicknessMm(kozijnhoutThickness);
            setTussenstijlThicknessMm(tussenstijlThickness ?? kozijnhoutThickness);
            setHasTussenstijl(Boolean(tussenstijlMaterial));
            setHasGlas(glasSelected);
          }

          // 1. Try new structure, then specific slug key, then legacy 'maatwerk' array
          const savedItems = maatwerk?.basis || maatwerk?.items || container[`${jobSlug}_maatwerk`] || (Array.isArray(maatwerk) ? maatwerk : []);

          if (Array.isArray(savedItems) && savedItems.length > 0) {
            // Normalize openings: restore width/height from openingWidth/openingHeight if needed
            const normalizedItems = savedItems.map((item: any) => {
              if (item.openings && Array.isArray(item.openings)) {
                item.openings = item.openings.map((op: any) => {
                  const normalizedOpening = { ...op };
                  if (!normalizedOpening.id) normalizedOpening.id = crypto.randomUUID();
                  if (op.openingWidth !== undefined && op.width === undefined) {
                    normalizedOpening.width = op.openingWidth;
                  }
                  if (op.openingHeight !== undefined && op.height === undefined) {
                    normalizedOpening.height = op.openingHeight;
                  }
                  return normalizedOpening;
                });
              }

              // Initialize arrays for all items
              if (!item.leidingkofen) item.leidingkofen = [];
              if (!item.dagkanten) item.dagkanten = [];
              if (!item.vensterbanken) item.vensterbanken = [];

              // Data Migration for HSB Voorzetwand
              if (jobSlug === 'hsb-voorzetwand') {

                // Move single objects to arrays if they exist
                if (item.koof_lengte !== undefined && item.leidingkofen.length === 0) {
                  item.leidingkofen.push({
                    id: crypto.randomUUID(),
                    lengte: Number(item.koof_lengte) || 0,
                    hoogte: Number(item.koof_hoogte) || 0,
                    diepte: Number(item.koof_diepte) || 0
                  });
                  delete item.koof_lengte; delete item.koof_hoogte; delete item.koof_diepte;
                }

                if (item.dagkant_diepte !== undefined && item.dagkanten.length === 0) {
                  const firstOpening = item.openings?.[0]?.id || null;
                  item.dagkanten.push({
                    id: crypto.randomUUID(),
                    openingId: firstOpening,
                    diepte: Number(item.dagkant_diepte) || 0
                  });
                  delete item.dagkant_diepte; delete item.dagkant_lengte;
                }

                if (item.vensterbank_diepte !== undefined && item.vensterbanken.length === 0) {
                  const firstOpening = item.openings?.[0]?.id || null;
                  item.vensterbanken.push({
                    id: crypto.randomUUID(),
                    openingId: firstOpening,
                    diepte: Number(item.vensterbank_diepte) || 0,
                    uitstekLinks: 50,
                    uitstekRechts: 50
                  });
                  delete item.vensterbank_diepte; delete item.vensterbank_lengte;
                }
              }

              if (isMaatwerkKozijn) {
                const existingVakken = Array.isArray(item.vakken) ? item.vakken : [];
                const migratedVakken: any[] = [];
                if (existingVakken.length > 0) {
                  migratedVakken.push(...existingVakken);
                } else {
                  // Check for legacy fields
                  if (item.glas_breedte || item.glas_hoogte) migratedVakken.push({ type: 'glas', breedte: item.glas_breedte, hoogte: item.glas_hoogte });
                  if (item.paneel_breedte || item.paneel_hoogte) migratedVakken.push({ type: 'paneel', breedte: item.paneel_breedte, hoogte: item.paneel_hoogte });
                  if (item.open_breedte || item.open_hoogte) migratedVakken.push({ type: 'open', breedte: item.open_breedte, hoogte: item.open_hoogte });
                  
                  // Auto-generate vakken based on layout if none exist and dimensions are set
                  if (migratedVakken.length === 0 && item.breedte && item.hoogte) {
                    const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
                    const sponning = 17;
                    const frameMm = Math.max(0, (kozijnhoutThickness || 0) - sponning);
                    const tussenstijlMm = tussenstijlMaterial ? Math.max(0, ((tussenstijlThickness ?? kozijnhoutThickness) || 0) - (2 * sponning)) : 0;
                    const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                    const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));
                    const doorWidthMm = num(item.deur_breedte);
                    const doorHeightMm = num(item.deur_hoogte);
                    const hasDoor = doorHeightMm > 0;
                    const hasTussenstijl = tussenstijlMm > 0;
                    
                    // Calculate column layout
                    const tussenstijlen = Array.isArray(item.tussenstijlen) ? item.tussenstijlen.map(num).filter((v: number) => v > 0) : [];
                    const isDoorLeft = item.doorPosition !== 'right';
                    const autoDoorPos = (hasTussenstijl && doorWidthMm > 0 && doorWidthMm < innerWidthMm)
                      ? (isDoorLeft ? doorWidthMm : Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm))
                      : null;
                    
                    let basePositions = [...tussenstijlen];
                    if (autoDoorPos !== null) {
                      const eps = 1;
                      basePositions = [autoDoorPos, ...basePositions.filter((p: number) => Math.abs(p - autoDoorPos) > eps)];
                    }
                    
                    // Calculate columns
                    const positions = hasTussenstijl 
                      ? basePositions.sort((a: number, b: number) => a - b).map((p: number) => Math.min(Math.max(0, p), Math.max(0, innerWidthMm - tussenstijlMm)))
                      : [];
                    
                    const colWidths: number[] = [];
                    let cursor = 0;
                    positions.forEach((pos: number) => {
                      colWidths.push(Math.max(0, pos - cursor));
                      cursor = pos + tussenstijlMm;
                    });
                    colWidths.push(Math.max(0, innerWidthMm - cursor));
                    const colCount = colWidths.length || 1;
                    
                    // Generate vakken
                    const doorColIndex = isDoorLeft ? 0 : Math.max(0, colCount - 1);
                    const doorRowSlots = hasDoor && colCount > 1
                      ? Array.from({ length: colCount }, (_, i) => i).filter(i => i !== doorColIndex)
                      : [];
                    
                    // Calculate row heights
                    const horizontalBarHeight = (hasDoor && (doorHeightMm + frameMm) < innerHeightMm) ? frameMm : 0;
                    const bottomRowHeight = hasDoor ? Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight) : 0;
                    
                    // Add door row vakken (excluding door column)
                    if (hasDoor && colCount > 1) {
                      doorRowSlots.forEach((colIdx: number) => {
                        const width = colWidths[colIdx] || 0;
                        if (width > 0) {
                          migratedVakken.push({
                            type: glasSelected ? 'glas' : 'open',
                            breedte: Math.round(width),
                            hoogte: Math.round(doorHeightMm)
                          });
                        }
                      });
                    }
                    
                    // Add bottom row vakken (all columns)
                    if (bottomRowHeight > 0) {
                      for (let colIdx = 0; colIdx < colCount; colIdx++) {
                        const width = colWidths[colIdx] || 0;
                        if (width > 0) {
                          migratedVakken.push({
                            type: glasSelected ? 'glas' : 'open',
                            breedte: Math.round(width),
                            hoogte: Math.round(bottomRowHeight)
                          });
                        }
                      }
                    }
                    
                    // If no door and no tussenstijl, create one big vak
                    if (!hasDoor && colCount === 1 && migratedVakken.length === 0) {
                      migratedVakken.push({
                        type: glasSelected ? 'glas' : 'open',
                        breedte: Math.round(innerWidthMm),
                        hoogte: Math.round(innerHeightMm)
                      });
                    }
                  }
                }

                item.vakken = migratedVakken.map((vak: any) => ({
                  id: vak.id || crypto.randomUUID(),
                  type: (vak.type === 'glas' && !glasSelected) ? 'open' : (vak.type || 'open'),
                  breedte: vak.breedte ?? vak.width ?? '',
                  hoogte: vak.hoogte ?? vak.height ?? ''
                }));

                const existingStijlen = Array.isArray(item.tussenstijlen) ? item.tussenstijlen : [];
                if (existingStijlen.length > 0) {
                  item.tussenstijlen = existingStijlen;
                } else if (item.tussenstijl_van_links) {
                  item.tussenstijlen = [item.tussenstijl_van_links];
                } else {
                  item.tussenstijlen = [];
                }
              }

              return item;
            });
            const withVlizotrap = vlizotrapMaterial
              ? normalizedItems.map((item: any) => syncVlizotrapOpening(item, vlizotrapMaterial))
              : normalizedItems;
            setItems(withVlizotrap);
          } else {
            const emptyItem = createEmptyItem();
            const withVlizotrap = vlizotrapMaterial
              ? syncVlizotrapOpening(emptyItem, vlizotrapMaterial)
              : emptyItem;
            setItems([withVlizotrap]);
          }

          // 2. Load Components
          const savedComponents = maatwerk?.toevoegingen || maatwerk?.components || container.components;
          if (Array.isArray(savedComponents)) {
            setComponents(savedComponents);
          }

          // 3. Load Notities
          const savedNotities = maatwerk?.notities || container.maatwerk_notities;
          if (savedNotities) {
            setNotities(savedNotities);
          }
        }
      } catch (error) {
        console.error("Error loading measurements:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [quoteId, klusId, firestore, jobSlug]);

  const createEmptyItem = () => {
    const newItem: Record<string, any> = {};
    fields.forEach(f => {
      newItem[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    });
    newItem.leidingkofen = [];
    newItem.dagkanten = [];
    newItem.vensterbanken = [];
    if (isMaatwerkKozijn) {
      newItem.vakken = [];
      newItem.tussenstijlen = [];
    }
    return newItem;
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Kan niet verwijderen',
        description: 'Er moet minimaal één item overblijven.',
      });
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, key: string, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [key]: value };
      return newItem;
    }));
  };

  const createVak = (type: string) => ({
    id: crypto.randomUUID(),
    type,
    breedte: '',
    hoogte: ''
  });

  const updateVak = (itemIdx: number, vakIdx: number, updates: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const vakken = Array.isArray(item.vakken) ? item.vakken : [];
      const next = vakken.map((vak: any, idx: number) => idx === vakIdx ? { ...vak, ...updates } : vak);
      return { ...item, vakken: next };
    }));
  };

  const addVak = (itemIdx: number) => {
    const defaultType = hasGlas ? 'glas' : 'open';
    const newVak = createVak(defaultType);
    
    setItems(prev => {
      const item = prev[itemIdx];
      const vakken = Array.isArray(item?.vakken) ? item.vakken : [];
      const newVakIdx = vakken.length;
      
      // Set the new vak to be expanded (using the correct index)
      setCollapsedSections(prevCollapsed => ({
        ...prevCollapsed,
        [`vak-${itemIdx}-${newVakIdx}`]: false // false = expanded
      }));
      
      return prev.map((it, i) => {
        if (i !== itemIdx) return it;
        return { ...it, vakken: [...vakken, newVak] };
      });
    });
  };

  // Helper to calculate expected vakken count based on layout
  const calculateExpectedVakkenCount = (item: any): number => {
    if (!item || !item.breedte || !item.hoogte) return 0;
    
    const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
    const sponning = 17;
    const frameMm = Math.max(0, (kozijnhoutFrameThicknessMm || 0) - sponning);
    const tussenstijlMm = hasTussenstijl ? Math.max(0, ((tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm) || 0) - (2 * sponning)) : 0;
    const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
    const doorHeightMm = num(item.deur_hoogte);
    const hasDoor = doorHeightMm > 0;
    
    // Calculate columns
    const rawPositions = Array.isArray(item.tussenstijlen) ? item.tussenstijlen.map(num).filter((v: number) => v > 0) : [];
    const isDoorLeft = item.doorPosition !== 'right';
    const autoDoorPos = (hasTussenstijl && num(item.deur_breedte) > 0 && num(item.deur_breedte) < innerWidthMm)
      ? (isDoorLeft ? num(item.deur_breedte) : Math.max(0, innerWidthMm - num(item.deur_breedte) - tussenstijlMm))
      : null;
    
    let basePositions = [...rawPositions];
    if (autoDoorPos !== null) {
      const eps = 1;
      basePositions = [autoDoorPos, ...basePositions.filter((p: number) => Math.abs(p - autoDoorPos) > eps)];
    }
    
    const positions = hasTussenstijl 
      ? basePositions.sort((a: number, b: number) => a - b).map((p: number) => Math.min(Math.max(0, p), Math.max(0, innerWidthMm - tussenstijlMm)))
      : [];
    
    const colCount = positions.length + 1;
    
    if (!hasDoor) {
      // Without door: just one row with all columns
      return colCount;
    }
    
    // With door: door row (colCount - 1 vakken) + bottom row (colCount vakken)
    const doorColIndex = isDoorLeft ? 0 : Math.max(0, colCount - 1);
    const doorRowVakken = Math.max(0, colCount - 1);
    
    // Check if there's a bottom row
    const horizontalBarHeight = (doorHeightMm + frameMm) < (num(item.hoogte) - (2 * frameMm)) ? frameMm : 0;
    const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));
    const bottomRowHeight = Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight);
    const hasBottomRow = bottomRowHeight > 0;
    
    return doorRowVakken + (hasBottomRow ? colCount : 0);
  };

  // Auto-sync vakken when layout changes (tussenstijlen, dimensions)
  useEffect(() => {
    if (!isMaatwerkKozijn || loading) return;
    
    items.forEach((item, itemIdx) => {
      const expectedCount = calculateExpectedVakkenCount(item);
      const currentVakken = Array.isArray(item.vakken) ? item.vakken : [];
      
      if (expectedCount > currentVakken.length) {
        // Need to add more vakken
        const toAdd = expectedCount - currentVakken.length;
        const defaultType = hasGlas ? 'glas' : 'open';
        const newVakken = Array.from({ length: toAdd }, () => createVak(defaultType));
        
        // Set new vakken to be expanded
        const newCollapsedState: Record<string, boolean> = {};
        for (let i = 0; i < toAdd; i++) {
          newCollapsedState[`vak-${itemIdx}-${currentVakken.length + i}`] = false;
        }
        setCollapsedSections(prev => ({ ...prev, ...newCollapsedState }));
        
        // Update item with new vakken
        setItems(prev => prev.map((it, i) => {
          if (i !== itemIdx) return it;
          return { ...it, vakken: [...currentVakken, ...newVakken] };
        }));
      }
    });
  }, [items.map((item, idx) => `${idx}-${item.breedte}-${item.hoogte}-${item.deur_breedte}-${item.deur_hoogte}-${item.doorPosition}-${JSON.stringify(item.tussenstijlen)}`).join(','), isMaatwerkKozijn, loading, hasGlas, hasTussenstijl, kozijnhoutFrameThicknessMm, tussenstijlThicknessMm]);

  const removeVak = (itemIdx: number, vakIdx: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const vakken = Array.isArray(item.vakken) ? item.vakken : [];
      return { ...item, vakken: vakken.filter((_: any, idx: number) => idx !== vakIdx) };
    }));
  };

  const addTussenstijl = (itemIdx: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const tussenstijlen = Array.isArray(item.tussenstijlen) ? item.tussenstijlen : [];
      return { ...item, tussenstijlen: [...tussenstijlen, ''] };
    }));
  };

  const updateTussenstijl = (itemIdx: number, stijlIdx: number, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const tussenstijlen = Array.isArray(item.tussenstijlen) ? item.tussenstijlen : [];
      const next = tussenstijlen.map((v: any, idx: number) => idx === stijlIdx ? value : v);
      return { ...item, tussenstijlen: next };
    }));
  };

  const removeTussenstijl = (itemIdx: number, stijlIdx: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const tussenstijlen = Array.isArray(item.tussenstijlen) ? item.tussenstijlen : [];
      return { ...item, tussenstijlen: tussenstijlen.filter((_: any, idx: number) => idx !== stijlIdx) };
    }));
  };

  const vakTypeLabel = (type: string) => {
    if (type === 'glas') return 'Glas';
    if (type === 'paneel') return 'Paneel';
    if (type === 'open') return 'Open';
    return 'Vak';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') e.preventDefault();
  };

  const handleShapeChange = (index: number, newShape: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newItem: Record<string, any> = { ...item };
      newItem.shape = newShape;

      const dimensionsToReset = [
        'lengte', 'hoogte', 'breedte',
        'lengte1', 'lengte2', 'lengte3',
        'hoogte1', 'hoogte2', 'hoogte3',
        'hoogteLinks', 'hoogteRechts',
        'hoogteNok',
      ];
      dimensionsToReset.forEach(key => newItem[key] = '');
      return newItem;
    }));
  };

  // Linked Item Handlers
  const onAddDagkant = (itemIdx: number, openingId?: string) => {
    const opening = openingId ? items[itemIdx].openings?.find((op: any) => op.id === openingId) : null;
    const hasVensterbank = openingId ? (items[itemIdx].vensterbanken || []).some((v: any) => v.openingId === openingId) : false;
    const initialLengte = opening ? (opening.height * 2 + opening.width * (hasVensterbank ? 1 : 2)) : '';
    const newDagkant = { id: crypto.randomUUID(), openingId: openingId || null, diepte: '', lengte: initialLengte };
    const currentDagkanten = items[itemIdx].dagkanten || [];
    updateItem(itemIdx, 'dagkanten', [...currentDagkanten, newDagkant]);
  };

  const onDeleteDagkant = (itemIdx: number, id: string) => {
    const currentDagkanten = items[itemIdx].dagkanten || [];
    updateItem(itemIdx, 'dagkanten', currentDagkanten.filter((d: any) => d.id !== id));
  };

  const onUpdateDagkant = (itemIdx: number, id: string, updates: any) => {
    const currentDagkanten = items[itemIdx].dagkanten || [];
    updateItem(itemIdx, 'dagkanten', currentDagkanten.map((d: any) => d.id === id ? { ...d, ...updates } : d));
  };

  const onAddVensterbank = (itemIdx: number, openingId?: string) => {
    const opening = openingId ? items[itemIdx].openings?.find((op: any) => op.id === openingId) : null;
    const initialLengte = opening ? opening.width : '';
    const newVensterbank = { id: crypto.randomUUID(), openingId: openingId || null, diepte: '', uitstekLinks: '', uitstekRechts: '', lengte: initialLengte };
    const currentVensterbanken = items[itemIdx].vensterbanken || [];
    updateItem(itemIdx, 'vensterbanken', [...currentVensterbanken, newVensterbank]);
    // Recalculate linked dagkant: vensterbank covers bottom, so 3 sides
    if (openingId && opening) {
      const currentDagkanten = items[itemIdx].dagkanten || [];
      const linkedDagkant = currentDagkanten.find((d: any) => d.openingId === openingId);
      if (linkedDagkant) {
        const newLengte = opening.height * 2 + opening.width;
        updateItem(itemIdx, 'dagkanten', currentDagkanten.map((d: any) => d.id === linkedDagkant.id ? { ...d, lengte: newLengte } : d));
      }
    }
  };

  const onDeleteVensterbank = (itemIdx: number, id: string) => {
    const currentVensterbanken = items[itemIdx].vensterbanken || [];
    const removedVb = currentVensterbanken.find((v: any) => v.id === id);
    updateItem(itemIdx, 'vensterbanken', currentVensterbanken.filter((v: any) => v.id !== id));
    // Recalculate linked dagkant: no vensterbank, back to 4 sides
    if (removedVb?.openingId) {
      const opening = items[itemIdx].openings?.find((op: any) => op.id === removedVb.openingId);
      if (opening) {
        const currentDagkanten = items[itemIdx].dagkanten || [];
        const linkedDagkant = currentDagkanten.find((d: any) => d.openingId === removedVb.openingId);
        if (linkedDagkant) {
          const newLengte = opening.height * 2 + opening.width * 2;
          updateItem(itemIdx, 'dagkanten', currentDagkanten.map((d: any) => d.id === linkedDagkant.id ? { ...d, lengte: newLengte } : d));
        }
      }
    }
  };

  const onUpdateVensterbank = (itemIdx: number, id: string, updates: any) => {
    const currentVensterbanken = items[itemIdx].vensterbanken || [];
    updateItem(itemIdx, 'vensterbanken', currentVensterbanken.map((v: any) => v.id === id ? { ...v, ...updates } : v));
  };

  const onAddLeidingkoof = (itemIdx: number) => {
    const newKoof = { id: crypto.randomUUID(), lengte: '', hoogte: '', diepte: '' };
    const currentKofen = items[itemIdx].leidingkofen || [];
    updateItem(itemIdx, 'leidingkofen', [...currentKofen, newKoof]);
  };

  const onDeleteLeidingkoof = (itemIdx: number, id: string) => {
    const currentKofen = items[itemIdx].leidingkofen || [];
    updateItem(itemIdx, 'leidingkofen', currentKofen.filter((k: any) => k.id !== id));
  };

  const onUpdateLeidingkoof = (itemIdx: number, id: string, updates: any) => {
    const currentKofen = items[itemIdx].leidingkofen || [];
    updateItem(itemIdx, 'leidingkofen', currentKofen.map((k: any) => k.id === id ? { ...k, ...updates } : k));
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firestore || !jobConfig) return;

    const hasEmptyFields = items.some(item =>
      fields.some(f => f.type === 'number' && !f.optional && !item[f.key])
    );

    if (hasEmptyFields) {
      toast({ variant: "destructive", title: "Ontbrekende gegevens", description: "Vul a.u.b. alle verplichte velden in." });
      return;
    }

    setSaving(true);
    startTransition(async () => {
      try {
        let visualisatieUrl: string | null = null;
        const visualizerElement = visualizerRefs.current[0];

        if (visualizerElement) {
          try {
            const canvas = await html2canvas(visualizerElement, {
              backgroundColor: '#18181b',
              scale: 2,
              logging: false,
              useCORS: true,
              allowTaint: true,
            });
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png', 0.95);
            });
            const auth = getAuth();
            const storage = getStorage(auth.app);
            const storageRef = ref(storage, `visualisaties/${quoteId}/${klusId}.png`);
            await uploadBytes(storageRef, blob, { contentType: 'image/png' });
            visualisatieUrl = await getDownloadURL(storageRef);
          } catch (uploadError) {
            console.error('Error capturing visualization:', uploadError);
          }
        }

        const quoteRef = doc(firestore, 'quotes', quoteId);

        // Prepare items
        const processedItems = (items || []).map((item: any) => {
          if (item.openings && Array.isArray(item.openings)) {
            item.openings = item.openings.map((op: any) => {
              const { width, height, ...rest } = op;
              return {
                ...rest,
                openingWidth: width,
                openingHeight: height
              };
            });
          }
          return item;
        });

        const rawMeta = {
          title: jobConfig.title,
          type: categorySlug,
          slug: jobSlug,
          description: jobConfig.description || ''
        };

        const maatwerkKey = `${jobSlug}_maatwerk`;
        const updateData: Record<string, any> = {
          [`klussen.${klusId}.maatwerk`]: cleanFirestoreData({
            basis: processedItems,
            toevoegingen: components.map(c => ({
              id: c.id,
              type: c.type,
              label: c.label,
              slug: c.slug,
              afmetingen: c.measurements || {}
            })),
            notities: notities,
            meta: rawMeta,
          }, { allowEmptyArrays: true }),
          [`klussen.${klusId}.components`]: deleteField(),
          [`klussen.${klusId}.updatedAt`]: serverTimestamp(),

          // CLEANUP: Remove old slug-specific key
          [`klussen.${klusId}.${maatwerkKey}`]: deleteField(),
        };

        if (visualisatieUrl) {
          updateData[`klussen.${klusId}.visualisatieUrl`] = visualisatieUrl;
        }

        await updateDoc(quoteRef, updateData);
        router.push(`/offertes/${quoteId}/overzicht`);

      } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Opslaan mislukt', description: error.message });
        setSaving(false);
      }
    });
  };

  if (!isMounted) return null;

  if (!categoryConfig || !jobConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Klus configuratie niet gevonden</h1>
        <Button variant="outline" onClick={() => router.back()}>Ga terug</Button>
      </div>
    );
  }

  const disabledAll = saving || isPending || loading;
  const progressValue = 80;
  const itemLabel = jobConfig.measurementLabel || jobConfig.title.split(' ')[0] || 'Item';
  const backUrl = `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}/materialen`;

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <WizardHeader
        title={jobConfig.title}
        backLink={backUrl}
        progress={progressValue}
        quoteId={quoteId}
        rightContent={<PersonalNotes quoteId={quoteId} jobId={klusId} context={`Metingen: ${jobConfig.title}`} />}
      />

      <div className="px-4 py-8 max-w-[1400px] mx-auto pb-32">
        <form>
          <div className="space-y-8">
            {items.map((item, index) => (
              <React.Fragment key={index}>
                {/* Item divider / label — only when multiple items */}
                {items.length > 1 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                      {itemLabel} {index + 1}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}
                <div className="flex flex-col lg:flex-row gap-6 items-start">

                  {/* LEFT SIDEBAR - SETTINGS */}
                  <div className="w-full lg:w-[340px] shrink-0 space-y-6">

                    {/* Item Header Card */}
                    {/* Item Header Card */}
                    <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Vorm</Label>
                          {index > 0 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => setPendingDeleteIndex(index)} className="h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-red-500/10" disabled={disabledAll}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-1 p-1 bg-black/20 rounded-xl border border-white/5">
                          {[
                            { id: 'rectangle', icon: Square, label: 'Recht' },
                            { id: 'slope', icon: Slash, label: 'Schuin' },
                            { id: 'gable', icon: Triangle, label: 'Punt' },
                            { id: 'l-shape', icon: null, label: 'L', customIcon: 'L' },
                            { id: 'u-shape', icon: null, label: 'U', customIcon: 'U' }
                          ].map((shapeOption) => {
                            const currentShape = item.shape || 'rectangle';
                            const isActive = currentShape === shapeOption.id;
                            const Icon = shapeOption.icon;
                            const LIcon = () => <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 L6 18 L20 18" /></svg>;
                            const UIcon = () => <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4 L4 18 L20 18 L20 4" /></svg>;

                            return (
                              <button
                                key={shapeOption.id}
                                type="button"
                                onClick={() => handleShapeChange(index, shapeOption.id)}
                                className={cn(
                                  "flex items-center justify-center h-8 w-full transition-all rounded-lg",
                                  isActive ? "bg-emerald-600/20 text-emerald-400 shadow-sm ring-1 ring-emerald-500/50" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                )}
                                title={shapeOption.label}
                              >
                                {shapeOption.customIcon === 'L' ? <LIcon /> : shapeOption.customIcon === 'U' ? <UIcon /> : Icon ? <Icon className={cn("h-4 w-4", shapeOption.id === 'slope' && "-rotate-12")} /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Dimensions Section */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Afmetingen</h4>
                      {(() => {
                        const shape = item.shape || 'rectangle';

                        if (shape === 'l-shape') {
                          const updateL = (key: 'lengte1' | 'lengte2', val: string) => {
                            const numVal = parseFloat(val) || 0;
                            const otherKey = key === 'lengte1' ? 'lengte2' : 'lengte1';
                            const otherVal = parseFloat(item[otherKey]) || 0;
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, [key]: val, lengte: numVal + otherVal } : it));
                          };
                          return (
                            <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                              <div className="space-y-3">
                                <Label className="text-xs uppercase text-zinc-500">Deel 1</Label>
                                <MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateL('lengte1', String(val))} />
                                <MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                              </div>
                              <div className="space-y-3 pt-2 border-t border-white/5">
                                <Label className="text-xs uppercase text-zinc-500">Deel 2</Label>
                                <MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateL('lengte2', String(val))} />
                                <MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
                              </div>
                            </div>
                          );
                        }

                        if (shape === 'u-shape') {
                          const updateU = (key: 'lengte1' | 'lengte2' | 'lengte3', val: string) => {
                            const numVal = parseFloat(val) || 0;
                            const l1 = key === 'lengte1' ? numVal : (parseFloat(item.lengte1) || 0);
                            const l2 = key === 'lengte2' ? numVal : (parseFloat(item.lengte2) || 0);
                            const l3 = key === 'lengte3' ? numVal : (parseFloat(item.lengte3) || 0);
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, [key]: val, lengte: l1 + l2 + l3 } : it));
                          };
                          return (
                            <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                              <div className="space-y-3">
                                <Label className="text-xs">Deel 1</Label>
                                <MeasurementInput placeholder="L1" value={item.lengte1 || ''} onChange={(val) => updateU('lengte1', String(val))} />
                                <MeasurementInput placeholder="H1" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                              </div>
                              <div className="space-y-3 pt-2 border-t border-white/5">
                                <Label className="text-xs">Deel 2</Label>
                                <MeasurementInput placeholder="L2" value={item.lengte2 || ''} onChange={(val) => updateU('lengte2', String(val))} />
                                <MeasurementInput placeholder="H2" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
                              </div>
                              <div className="space-y-3 pt-2 border-t border-white/5">
                                <Label className="text-xs">Deel 3</Label>
                                <MeasurementInput placeholder="L3" value={item.lengte3 || ''} onChange={(val) => updateU('lengte3', String(val))} />
                                <MeasurementInput placeholder="H3" value={item.hoogte3 || ''} onChange={(val) => updateItem(index, 'hoogte3', val)} />
                              </div>
                            </div>
                          );
                        }

                        // Default: Rectangle, Slope, Gable

                        // Boeiboord: grouped Voorzijde / Onderzijde fields
                        if (isBoeiboord) {
                          return (
                            <div className="space-y-4">
                              <Label className="text-xs uppercase text-zinc-500 tracking-wider">Voorzijde</Label>
                              {fields.find(f => f.key === 'lengte') && (
                                <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                              {fields.find(f => f.key === 'hoogte') && (
                                <DynamicInput field={fields.find(f => f.key === 'hoogte')!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                              <div className="pt-2 border-t border-white/5" />
                              <Label className="text-xs uppercase text-zinc-500 tracking-wider">Onderzijde</Label>
                              {fields.find(f => f.key === 'lengte_onderzijde') && (
                                <DynamicInput field={fields.find(f => f.key === 'lengte_onderzijde')!} value={item.lengte_onderzijde} onChange={v => updateItem(index, 'lengte_onderzijde', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                              {fields.find(f => f.key === 'breedte') && (
                                <DynamicInput field={fields.find(f => f.key === 'breedte')!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}

                              {/* Kopkanten toggle */}
                              {fields.find(f => f.key === 'kopkanten') && (
                                <>
                                  <div className="pt-2 border-t border-white/5" />
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs uppercase text-zinc-500 tracking-wider">Kopkanten</Label>
                                    <Switch checked={item.kopkanten || false} onCheckedChange={(c) => updateItem(index, 'kopkanten', c)} />
                                  </div>
                                  {item.kopkanten && (
                                    <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-2">
                                      {fields.find(f => f.key === 'kopkant_breedte') && (
                                        <DynamicInput field={fields.find(f => f.key === 'kopkant_breedte')!} value={item.kopkant_breedte} onChange={v => updateItem(index, 'kopkant_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                      )}
                                      {fields.find(f => f.key === 'kopkant_hoogte') && (
                                        <DynamicInput field={fields.find(f => f.key === 'kopkant_hoogte')!} value={item.kopkant_hoogte} onChange={v => updateItem(index, 'kopkant_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-4">
                            {/* Roof Tile Specific Fields */}
                            {fields.find(f => f.key === 'aantal_pannen_breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_breedte')!} value={item.aantal_pannen_breedte} onChange={v => updateItem(index, 'aantal_pannen_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'aantal_pannen_hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_hoogte')!} value={item.aantal_pannen_hoogte} onChange={v => updateItem(index, 'aantal_pannen_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'lengte') && (
                              <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {shape === 'slope' && (
                              <>
                                <div className="space-y-2"><Label>H. Links</Label><MeasurementInput value={item.hoogteLinks} onChange={v => updateItem(index, 'hoogteLinks', v)} /></div>
                                <div className="space-y-2"><Label>H. Rechts</Label><MeasurementInput value={item.hoogteRechts} onChange={v => updateItem(index, 'hoogteRechts', v)} /></div>
                              </>
                            )}
                            {shape === 'gable' && (
                              <>
                                <div className="space-y-2"><Label>H. Zijkant</Label><MeasurementInput value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} /></div>
                                <div className="space-y-2"><Label>H. Nok</Label><MeasurementInput value={item.hoogteNok} onChange={v => updateItem(index, 'hoogteNok', v)} /></div>
                              </>
                            )}
                            {shape === 'rectangle' && fields.find(f => f.key === 'hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'hoogte')!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {shape === 'rectangle' && fields.find(f => f.key === 'breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'breedte')!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                          </div>
                        );
                      })()}
                    </div>


                    {/* Openingen Section */}
                    {showOpeningsSection && (
                      <OpeningenSection
                        openings={item.openings || []}
                        onChange={(newOpenings) => updateItem(index, 'openings', newOpenings)}
                        constructionOptions={specificJobConfig.openingConfig.constructionOptions}

                        dagkanten={item.dagkanten || []}
                        vensterbanken={item.vensterbanken || []}
                        onAddDagkant={(opId) => onAddDagkant(index, opId)}
                        onDeleteDagkant={(id) => onDeleteDagkant(index, id)}
                        onUpdateDagkant={(id, updates) => onUpdateDagkant(index, id, updates)}
                        onAddVensterbank={(opId) => onAddVensterbank(index, opId)}
                        onDeleteVensterbank={(id) => onDeleteVensterbank(index, id)}
                        onUpdateVensterbank={(id, updates) => onUpdateVensterbank(index, id, updates)}

                        isWallCategory={isWallCategory}
                        isCeilingCategory={isCeilingCategory}
                        categorySlug={categorySlug}
                      />
                    )}

                    {/* Vak Cards (maatwerk kozijnen) */}
                    {isMaatwerkKozijn && (
                      <>
                        {hasTussenstijl && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`tussenstijlen-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Tussenstijlen</span>
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`tussenstijlen-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>
                            {collapsedSections[`tussenstijlen-${index}`] === false && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-3">
                                  {(() => {
                                    const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
                                    const sponning = 17;
                                    const frameMm = Math.max(0, (kozijnhoutFrameThicknessMm || 0) - sponning);
                                    const tussenstijlMm = Math.max(0, (tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm || 0) - (2 * sponning));
                                    const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                                    const doorWidthMm = num(item.deur_breedte);
                                    const isDoorLeft = item.doorPosition !== 'right';
                                    const autoDoorPos = (doorWidthMm > 0 && doorWidthMm < innerWidthMm)
                                      ? (isDoorLeft ? doorWidthMm : Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm))
                                      : null;

                                    if (autoDoorPos === null) return null;
                                    return (
                                      <div className="flex items-end gap-3">
                                        <div className="flex-1 space-y-2">
                                          <Label className="text-xs">Tussenstijl deur</Label>
                                          <MeasurementInput value={Math.round(autoDoorPos)} onChange={() => {}} disabled />
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {(Array.isArray(item.tussenstijlen) ? item.tussenstijlen : []).map((v: any, stijlIdx: number) => (
                                    <div key={`tussenstijl-${index}-${stijlIdx}`} className="flex items-end gap-3">
                                      <div className="flex-1 space-y-2">
                                        <Label className="text-xs">Tussenstijl {stijlIdx + 1} positie (mm)</Label>
                                        <MeasurementInput value={v} onChange={(val) => updateTussenstijl(index, stijlIdx, val)} disabled={disabledAll} />
                                      </div>
                                      <button
                                        type="button"
                                        className="text-zinc-500 hover:text-red-400 transition-colors mb-1"
                                        onClick={() => removeTussenstijl(index, stijlIdx)}
                                        disabled={disabledAll}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                  {Array.isArray(item.tussenstijlen) && item.tussenstijlen.length > 0 && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
                                        const sponning = 17;
                                        const frameMm = Math.max(0, (kozijnhoutFrameThicknessMm || 0) - sponning);
                                        const tussenstijlMm = Math.max(0, (tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm || 0) - (2 * sponning));
                                        const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                                        const doorWidthMm = num(item.deur_breedte);
                                        const isDoorLeft = item.doorPosition !== 'right';
                                        if (tussenstijlMm <= 0 || innerWidthMm <= 0 || doorWidthMm <= 0) return;
                                        const remaining = Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm);
                                        const half = Math.max(0, (remaining - tussenstijlMm) / 2);
                                        const pos = isDoorLeft
                                          ? (doorWidthMm + tussenstijlMm + half)
                                          : half;
                                        updateTussenstijl(index, 0, Math.round(pos));
                                      }}
                                      disabled={disabledAll}
                                    >
                                      Zet in het midden
                                    </Button>
                                  )}
                                  <Button type="button" variant="secondary" size="sm" onClick={() => addTussenstijl(index)} disabled={disabledAll}>
                                    <PlusCircle className="h-4 w-4 mr-2" />
                                    Tussenstijl toevoegen
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Deur */}
                        {(() => {
                          const vakken = Array.isArray(item.vakken) ? item.vakken : [];
                          const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
                          const sponning = 17;
                          const frameMm = Math.max(0, (kozijnhoutFrameThicknessMm || 0) - sponning);
                          const tussenstijlMm = hasTussenstijl ? Math.max(0, (tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm || 0) - (2 * sponning)) : 0;
                          const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                          const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));
                          const doorWidthMm = num(item.deur_breedte);
                          const doorHeightMm = num(item.deur_hoogte);
                          const hasDoor = doorHeightMm > 0;
                          const hasColumns = hasTussenstijl && tussenstijlMm > 0;
                          const normalizePositions = (positions: number[]) => {
                            const maxPos = Math.max(0, innerWidthMm - tussenstijlMm);
                            const sorted = positions
                              .map(p => Math.min(Math.max(0, p), maxPos))
                              .sort((a, b) => a - b);
                            const clamped: number[] = [];
                            let cursor = 0;
                            sorted.forEach(pos => {
                              const next = Math.max(cursor, pos);
                              const clampedPos = Math.min(next, maxPos);
                              clamped.push(clampedPos);
                              cursor = clampedPos + tussenstijlMm;
                            });
                            return clamped;
                          };
                          const rawPositions = Array.isArray(item.tussenstijlen) ? item.tussenstijlen.map(num).filter(v => v > 0) : [];
                          let basePositions = rawPositions.length > 0 ? rawPositions : [];
                          const isDoorLeft = item.doorPosition !== 'right';
                          const autoDoorPos = (hasTussenstijl && doorWidthMm > 0 && doorWidthMm < innerWidthMm)
                            ? (isDoorLeft ? doorWidthMm : Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm))
                            : null;
                          if (autoDoorPos !== null) {
                            const eps = 1;
                            const withoutDup = basePositions.filter(p => Math.abs(p - autoDoorPos) > eps);
                            basePositions = [autoDoorPos, ...withoutDup];
                          }
                          const tussenstijlPositions = hasColumns ? normalizePositions(basePositions) : [];
                          const colStarts: number[] = [];
                          const colWidths: number[] = [];
                          let cursor = 0;
                          tussenstijlPositions.forEach(pos => {
                            colStarts.push(cursor);
                            colWidths.push(Math.max(0, pos - cursor));
                            cursor = pos + tussenstijlMm;
                          });
                          colStarts.push(cursor);
                          colWidths.push(Math.max(0, innerWidthMm - cursor));
                          const colCount = colWidths.length;
                          const doorColIndex = (item.doorPosition === 'right') ? Math.max(0, colCount - 1) : 0;
                          const doorRowCols = colCount > 1
                            ? Array.from({ length: colCount }, (_, i) => i).filter(i => i !== doorColIndex)
                            : [];

                          return (
                            <>
                              {/* Slot 1: Deur */}
                              <VakInputCard
                                index={-1}
                                title="Deur 1"
                                type="deur"
                                width={item.deur_breedte}
                                height={item.deur_hoogte}
                                doorPosition={item.doorPosition}
                                doorSwing={item.doorSwing}
                                isCollapsed={collapsedSections[`vak-deur-${index}`] === true}
                                onToggleCollapse={() => toggleCollapsed(`vak-deur-${index}`)}
                                disabled={disabledAll}
                                displayHeight={innerHeightMm}
                                onWidthChange={(v) => updateItem(index, 'deur_breedte', v)}
                                onHeightChange={(v) => updateItem(index, 'deur_hoogte', v)}
                                onUpdateFull={(updates) => {
                                  if (updates.doorPosition) updateItem(index, 'doorPosition', updates.doorPosition);
                                  if (updates.doorSwing) updateItem(index, 'doorSwing', updates.doorSwing);
                                }}
                              />

                              {/* Slot 2+: Vakken */}
                              {vakken.map((vak: any, vakIdx: number) => {
                                const vakTitle = `${vak.type ? vak.type.charAt(0).toUpperCase() + vak.type.slice(1) : 'Vak'} ${vakIdx + 2}`;

                                const doorRowSlots = hasDoor ? doorRowCols.length : 0;
                                const rowIndex = hasDoor
                                  ? (vakIdx < doorRowSlots ? 0 : Math.floor((vakIdx - doorRowSlots) / colCount) + 1)
                                  : Math.floor(vakIdx / colCount);
                                const colIndex = hasDoor
                                  ? (vakIdx < doorRowSlots ? doorRowCols[vakIdx] : (vakIdx - doorRowSlots) % colCount)
                                  : (vakIdx % colCount);
                                const rowStartIdx = hasDoor
                                  ? (rowIndex === 0 ? 0 : doorRowSlots + ((rowIndex - 1) * colCount))
                                  : (rowIndex * colCount);
                                const rowEntries = hasDoor && rowIndex === 0
                                  ? vakken.slice(0, doorRowSlots)
                                  : vakken.slice(rowStartIdx, rowStartIdx + colCount);
                                const rowHeight = rowIndex === 0 && hasDoor
                                  ? doorHeightMm
                                  : Math.max(...rowEntries.map(v => num(v?.hoogte)), 0);

                                const horizontalBarHeight = (hasDoor && (doorHeightMm + frameMm) < innerHeightMm) ? frameMm : 0;
                                const fallbackHeight = hasDoor ? Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight) : innerHeightMm;

                                const displayHeight = rowIndex === 0 && hasDoor ? doorHeightMm : (rowHeight > 0 ? rowHeight : fallbackHeight);
                                const displayWidth = hasColumns ? (colWidths[colIndex] || innerWidthMm) : (num(vak.breedte) || innerWidthMm);
                                // Fields are always editable now - show calculated values as placeholders
                                const widthValue = vak.breedte ?? vak.width ?? (displayWidth > 0 ? Math.round(displayWidth) : '');
                                const heightValue = vak.hoogte ?? vak.height ?? (displayHeight > 0 ? Math.round(displayHeight) : '');
                                const handleHeightChange = (value: any) => {
                                  if (rowIndex > 0) {
                                    rowEntries.forEach((entry: any, idx: number) => {
                                      if (!entry) return;
                                      updateVak(index, rowStartIdx + idx, { hoogte: value, height: value });
                                    });
                                  } else {
                                    updateVak(index, vakIdx, { hoogte: value, height: value });
                                  }
                                };

                                return (
                                  <div key={vak.id || `vak-${vakIdx}`} className="relative group">
                                    <VakInputCard
                                      index={vakIdx}
                                      title={vakTitle}
                                      type={vak.type || (hasGlas ? 'glas' : 'open')}
                                      width={widthValue}
                                      height={heightValue}
                                      hasBorstwering={vak.hasBorstwering}
                                      borstweringHeight={vak.borstweringHeight}
                                      isCollapsed={collapsedSections[`vak-${index}-${vakIdx}`] === true}
                                      onToggleCollapse={() => toggleCollapsed(`vak-${index}-${vakIdx}`)}
                                      disabled={disabledAll}
                                      displayHeight={displayHeight}
                                      displayWidth={displayWidth}
                                      disableWidth={false}
                                      disableHeight={false}

                                      onTypeChange={(t) => updateVak(index, vakIdx, { type: t })}
                                      onWidthChange={(v) => updateVak(index, vakIdx, { breedte: v, width: v })}
                                      onHeightChange={handleHeightChange}
                                      onUpdateFull={(updates) => updateVak(index, vakIdx, updates)}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="absolute top-8 right-12 h-6 w-6 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 z-10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeVak(index, vakIdx);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                              <div className="mt-4">
                                <Button type="button" variant="secondary" size="sm" onClick={() => addVak(index)} disabled={disabledAll}>
                                  <PlusCircle className="h-4 w-4 mr-2" />
                                  Vak toevoegen
                                </Button>
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}

                    {/* Dakrand Configuration */}
                    {fields.find(f => f.key === 'dakrand_breedte') && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <div
                          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                          onClick={() => toggleCollapsed(`dakrand-${index}`)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-200">Dakrand</span>
                            {/* Collapse default: true (collapsed) */}
                            {collapsedSections[`dakrand-${index}`] !== false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                {item.dakrand_breedte ? `${item.dakrand_breedte}mm` : 'Ingesteld'}
                              </span>
                            )}
                          </div>
                          <div className="text-zinc-500">
                            {collapsedSections[`dakrand-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </div>
                        </div>

                        {collapsedSections[`dakrand-${index}`] === false && (
                          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                              {fields.find(f => f.key === 'dakrand_breedte') && (
                                <DynamicInput field={fields.find(f => f.key === 'dakrand_breedte')!} value={item.dakrand_breedte} onChange={(v) => updateItem(index, 'dakrand_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                              {fields.find(f => f.key === 'dakrand_hoogte') && (
                                <DynamicInput field={fields.find(f => f.key === 'dakrand_hoogte')!} value={item.dakrand_hoogte} onChange={(v) => updateItem(index, 'dakrand_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isCeilingCategory && (
                      <>
                        {/* Latten / Profielen Configuration */}
                        {fields.find(f => f.key === 'latafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`latten-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : 'Latten'}
                                </span>
                                {/* Collapse default: true (collapsed) */}
                                {collapsedSections[`latten-${index}`] === true && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.latafstand}mm h.o.h
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`latten-${index}`] === true ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`latten-${index}`] !== true && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput field={fields.find(f => f.key === 'latafstand')!} value={item.latafstand} onChange={v => updateItem(index, 'latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                                  {fields.find(f => f.key === 'onderzijde_latafstand') && (
                                    <DynamicInput field={fields.find(f => f.key === 'onderzijde_latafstand')!} value={item.onderzijde_latafstand} onChange={v => updateItem(index, 'onderzijde_latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                  )}

                                  <div className="space-y-3">
                                    <Label className="text-xs">Startpositie</Label>
                                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Links' : 'Boven'}
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Rechts' : 'Onder'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-xs">Opties</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {isRoofCategory && (
                                        <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                          <Label className="text-[10px] text-zinc-400">Dbl. Beginlat</Label>
                                          <Switch checked={item.doubleStartBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleStartBattens', c)} className="scale-75 origin-right" />
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                        <Label className="text-[10px] text-zinc-400">Dbl. Eindlat</Label>
                                        <Switch checked={item.doubleEndBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBattens', c)} className="scale-75 origin-right" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Balken Configuration */}
                        {fields.find(f => f.key === 'balkafstand') && (
                          <BalkenSection
                            balkafstand={item.balkafstand}
                            startFromRight={item.startFromRight}
                            doubleEndBeams={item.doubleEndBeams}
                            doubleTopPlate={item.doubleTopPlate}
                            doubleBottomPlate={item.doubleBottomPlate}
                            surroundingBeams={item.surroundingBeams}
                            optionsConfig={specificJobConfig.balkenConfig.options}
                            onUpdate={(key, val) => updateItem(index, key, val)}
                            isWallCategory={isWallCategory}
                            jobSlug={jobSlug}
                            // Collapse default: true (collapsed)
                            isCollapsed={collapsedSections[`balken-${index}`] !== false}
                            onToggleCollapsed={() => toggleCollapsed(`balken-${index}`)}
                          />
                        )}
                      </>
                    )}

                    {!isCeilingCategory && (
                      <>
                        {/* Balken Configuration */}
                        {fields.find(f => f.key === 'balkafstand') && (
                          <BalkenSection
                            balkafstand={item.balkafstand}
                            startFromRight={item.startFromRight}
                            doubleEndBeams={item.doubleEndBeams}
                            doubleTopPlate={item.doubleTopPlate}
                            doubleBottomPlate={item.doubleBottomPlate}
                            surroundingBeams={item.surroundingBeams}
                            optionsConfig={specificJobConfig.balkenConfig.options}
                            onUpdate={(key, val) => updateItem(index, key, val)}
                            isWallCategory={isWallCategory}
                            jobSlug={jobSlug}
                            // Collapse default: true (collapsed)
                            isCollapsed={collapsedSections[`balken-${index}`] === true}
                            onToggleCollapsed={() => toggleCollapsed(`balken-${index}`)}
                          />
                        )}

                        {/* Latten Configuration */}
                        {fields.find(f => f.key === 'latafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`latten-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : 'Latten'}
                                </span>
                                {/* Collapse default: true (collapsed) */}
                                {collapsedSections[`latten-${index}`] === true && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.latafstand}mm h.o.h
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`latten-${index}`] === true ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`latten-${index}`] !== true && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput field={fields.find(f => f.key === 'latafstand')!} value={item.latafstand} onChange={v => updateItem(index, 'latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                                  {fields.find(f => f.key === 'onderzijde_latafstand') && (
                                    <DynamicInput field={fields.find(f => f.key === 'onderzijde_latafstand')!} value={item.onderzijde_latafstand} onChange={v => updateItem(index, 'onderzijde_latafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                  )}

                                  <div className="space-y-3">
                                    <Label className="text-xs">Startpositie</Label>
                                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Links' : 'Boven'}
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Rechts' : 'Onder'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-xs">Opties</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {isRoofCategory && (
                                        <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                          <Label className="text-[10px] text-zinc-400">Dbl. Beginlat</Label>
                                          <Switch checked={item.doubleStartBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleStartBattens', c)} className="scale-75 origin-right" />
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                        <Label className="text-[10px] text-zinc-400">Dbl. Eindlat</Label>
                                        <Switch checked={item.doubleEndBattens || false} onCheckedChange={(c) => updateItem(index, 'doubleEndBattens', c)} className="scale-75 origin-right" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Leidingkoof Section */}
                    {showLeidingkoofSection && (
                      <LeidingkoofSection
                        leidingkofen={item.leidingkofen || []}
                        onAdd={() => onAddLeidingkoof(index)}
                        onDelete={(id) => onDeleteLeidingkoof(index, id)}
                        onUpdate={(id, updates) => onUpdateLeidingkoof(index, id, updates)}
                        isCollapsed={collapsedSections[`koof-${index}`] === true}
                        onToggleCollapsed={() => toggleCollapsed(`koof-${index}`, false)}
                        wallLength={Number(item.lengte) || 0}
                        wallHeight={Number(item.hoogte) || 0}
                      />
                    )}

                    {/* Vensterbank Section */}
                    {showVensterbankSection && (
                      <VensterbankSection
                        vensterbanken={item.vensterbanken || []}
                        onAdd={() => onAddVensterbank(index)}
                        onDelete={(id) => onDeleteVensterbank(index, id)}
                        onUpdate={(id, updates) => onUpdateVensterbank(index, id, updates)}
                        isCollapsed={collapsedSections[`vensterbank-${index}`] === true}
                        onToggleCollapsed={() => toggleCollapsed(`vensterbank-${index}`, false)}
                      />
                    )}

                    {/* Dagkant Section */}
                    {showDagkantSection && (
                      <DagkantSection
                        dagkanten={item.dagkanten || []}
                        onAdd={() => onAddDagkant(index)}
                        onDelete={(id) => onDeleteDagkant(index, id)}
                        onUpdate={(id, updates) => onUpdateDagkant(index, id, updates)}
                        isCollapsed={collapsedSections[`dagkant-${index}`] !== false}
                        onToggleCollapsed={() => toggleCollapsed(`dagkant-${index}`)}
                      />
                    )}

                    {/* Kopkanten Configuration (non-boeiboord — boeiboord renders inline) */}
                    {!isBoeiboord && fields.find(f => f.key === 'kopkanten') && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between select-none">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-200">Kopkanten</span>
                          </div>
                          <Switch checked={item.kopkanten || false} onCheckedChange={(c) => updateItem(index, 'kopkanten', c)} />
                        </div>

                        {item.kopkanten && (
                          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                              {fields.find(f => f.key === 'kopkant_breedte') && (
                                <DynamicInput field={fields.find(f => f.key === 'kopkant_breedte')!} value={item.kopkant_breedte} onChange={v => updateItem(index, 'kopkant_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                              {fields.find(f => f.key === 'kopkant_hoogte') && (
                                <DynamicInput field={fields.find(f => f.key === 'kopkant_hoogte')!} value={item.kopkant_hoogte} onChange={v => updateItem(index, 'kopkant_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Aantal Card */}
                    {fields.find(f => f.key === 'aantal') && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <div
                          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                          onClick={() => toggleCollapsed(`aantal-${index}`)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-200">Aantal</span>
                            {collapsedSections[`aantal-${index}`] !== false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                {item.aantal ?? 1} stuks
                              </span>
                            )}
                          </div>
                          <div className="text-zinc-500">
                            {collapsedSections[`aantal-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </div>
                        </div>

                        {collapsedSections[`aantal-${index}`] === false && (
                          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                            <div className="pt-2 border-t border-white/5">
                              <DynamicInput
                                field={fields.find(f => f.key === 'aantal')!}
                                value={item.aantal}
                                onChange={v => updateItem(index, 'aantal', v)}
                                onKeyDown={handleKeyDown}
                                disabled={disabledAll}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Extra Fields - NO SLICE, just filter out known keys and grouped fields */}
                    {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra's</h4>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                          {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).map(f => (
                            <DynamicInput key={f.key} field={f} value={item[f.key]} onChange={v => updateItem(index, f.key, v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                          ))}
                        </div>
                      </div>
                    )}





                  </div>

                  {/* RIGHT/CENTER: DRAWING CANVAS - STICKY */}
                  {isBoeiboord ? (
                    <div
                      ref={(el) => { visualizerRefs.current[index] = el; }}
                      className="flex-1 w-full lg:min-w-0 sticky top-24 self-start"
                    >
                      <VisualizerController
                        category={categorySlug}
                        slug={jobSlug}
                        item={item}
                        fields={fields}
                        title={`${itemLabel} ${index + 1}`}
                        isMagnifier={false}
                        fitContainer={false}
                        frameThickness={isMaatwerkKozijn ? kozijnhoutFrameThicknessMm : undefined}
                        tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? tussenstijlThicknessMm : undefined}
                        tussenstijlOffset={isMaatwerkKozijn ? item.tussenstijl_van_links : undefined}
                        showGlas={isMaatwerkKozijn && hasGlas}
                        doorPosition={item.doorPosition}
                        doorSwing={item.doorSwing}
                        onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                        onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                        onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                        onLeidingkoofChange={(updated: any) => updateItem(index, 'leidingkofen', updated)}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 w-full lg:min-w-0 bg-[#09090b] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative sticky top-24 self-start flex flex-col">
                      {/* Canvas Container */}
                      <div
                        ref={(el) => { visualizerRefs.current[index] = el; }}
                        className="relative w-full flex-1 flex items-center justify-center bg-[#09090b]"
                      >
                        {/* Dot Pattern Background */}
                        <div
                          className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                          style={{
                            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                            backgroundSize: '24px 24px'
                          }}
                        />

                        {/* Drawing */}
                        <div className="relative z-10 w-full h-full flex items-center justify-center">
                          <VisualizerController
                            category={categorySlug}
                            slug={jobSlug}
                            item={item}
                            fields={fields}
                            title={`${itemLabel} ${index + 1}`}
                            isMagnifier={false}
                            fitContainer={true}
                            frameThickness={isMaatwerkKozijn ? kozijnhoutFrameThicknessMm : undefined}
                            tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? tussenstijlThicknessMm : undefined}
                            tussenstijlOffset={isMaatwerkKozijn ? item.tussenstijl_van_links : undefined}
                            showGlas={isMaatwerkKozijn && hasGlas}
                            doorPosition={item.doorPosition}
                            doorSwing={item.doorSwing}
                            onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                            onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                            onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                            onLeidingkoofChange={(updated: any) => updateItem(index, 'leidingkofen', updated)}
                            className="w-full h-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </React.Fragment>
            ))}

            {items.length === 0 && <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-3xl bg-card/20"><p className="text-muted-foreground">Geen items.</p></div>}

            {/* Public Job Notes Section */}
            <div className="space-y-3 pt-6 border-t border-white/5">
              <div>
                <h3 className="text-lg font-medium text-amber-500">Slimme Notities</h3>
                <p className="text-sm text-muted-foreground">Onze assistent begrijpt bouwinstructies. Type simpelweg afwijkingen of details door; wij verwerken deze direct in de technische uitslag en constructie.</p>
              </div>
              <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl">
                <Textarea
                  value={notities}
                  onChange={(e) => setNotities(e.target.value)}
                  placeholder="Bijv. Extra versteviging inbouwen op 120cm hoogte voor montage van een zware wastafel."
                  className="min-h-[120px] bg-black/20 border-white/10 focus-visible:ring-emerald-500/50 resize-y"
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Button variant="outline" asChild disabled={disabledAll}><Link href={backUrl}>Terug</Link></Button>
          <Button type="button" variant="outline" onClick={addItem} disabled={disabledAll}><PlusCircle className="mr-2 h-4 w-4" />Extra {itemLabel} toevoegen</Button>
          <Button type="submit" variant="success" disabled={disabledAll} onClick={handleSave}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        </div>
      </div>

      <AlertDialog open={pendingDeleteIndex !== null} onOpenChange={(open) => !open && setPendingDeleteIndex(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{itemLabel} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Weet je zeker dat je <strong>{itemLabel} {pendingDeleteIndex !== null ? pendingDeleteIndex + 1 : ''}</strong> wilt verwijderen?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={() => setPendingDeleteIndex(null)} className="rounded-xl"><Button variant="ghost">Annuleren</Button></AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDeleteIndex !== null) { removeItem(pendingDeleteIndex); setPendingDeleteIndex(null); } }} asChild><Button variant="destructiveSoft">Verwijderen</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Opening Delete Confirmation Dialog */}
      <AlertDialog open={pendingDeleteOpening !== null} onOpenChange={(open) => !open && setPendingDeleteOpening(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Opening verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>Opening {pendingDeleteOpening ? pendingDeleteOpening.openingIndex + 1 : ''}</strong> van {itemLabel} {pendingDeleteOpening ? pendingDeleteOpening.itemIndex + 1 : ''} wilt verwijderen? Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" onClick={() => setPendingDeleteOpening(null)}>
              Annuleren
            </AlertDialogCancel>
            <Button
              variant="destructiveSoft"
              onClick={() => {
                if (pendingDeleteOpening) {
                  const { itemIndex, openingIndex } = pendingDeleteOpening;
                  const currentItems = [...items];
                  const currentOpenings = [...(currentItems[itemIndex].openings || [])];
                  currentOpenings.splice(openingIndex, 1);
                  updateItem(itemIndex, 'openings', currentOpenings);
                  setPendingDeleteOpening(null);
                }
              }}
            >
              Verwijderen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
