/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState, useTransition, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PlusCircle, Trash2, AlertCircle, Maximize2, Square, Slash, Triangle, CornerDownRight, ArrowDownToLine, Info, X, Search, ChevronDown, ChevronUp, Eye, EyeOff, ArrowDownUp } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import html2canvas from 'html2canvas';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDoc } from '@/firebase/firestore/use-doc'; // Added useDoc import
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
import { KoofSection } from '@/components/koof/KoofSection';
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
  onDelete?: () => void;

  // UI State
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  disabled?: boolean;
  disableWidth?: boolean;
  disableHeight?: boolean;

  // Context
  displayHeight?: number; // fallback height for display
  displayWidth?: number; // fallback width for display
  allowDoor?: boolean;
}

interface DakpanWerkendeMaten {
  minBreedteMm: number | null;
  maxBreedteMm: number | null;
  minHoogteMm: number | null;
  maxHoogteMm: number | null;
}

type GevelProfielMode = 'hoek' | 'eind' | 'both';
type GevelProfielSideType = 'hoek' | 'eind';

interface GevelProfielState {
  mode: GevelProfielMode;
  links: GevelProfielSideType;
  rechts: GevelProfielSideType;
}

const HELLEND_DAK_SECTION_MULTIPLIERS: Record<string, number> = {
  constructieplaat: 2,
  folie_buiten: 2,
  tengels: 2,
  panlatten: 2,
  dakpannen: 2,
  gevelpannen: 2,
  nokvorsten: 1,
  ondervorst: 1,
  dakvoetprofiel: 2,
  ruiter: 1,
};

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
  onDelete,
  isCollapsed,
  onToggleCollapse,
  disabled,
  disableWidth,
  disableHeight,
  displayHeight,
  displayWidth,
  allowDoor = true
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
                  <SelectItem value="deur" disabled={!allowDoor}>Deur</SelectItem>
                  <SelectItem value="glas">Glas</SelectItem>
                  <SelectItem value="paneel">Paneel</SelectItem>
                  <SelectItem value="raamkozijn">Raamkozijn</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Breedte</Label>
              <MeasurementInput
                value={width !== undefined && width !== null ? width : ''}
                onChange={onWidthChange}
                disabled={disabled || disableWidth}
                placeholder={displayWidth && displayWidth > 0 ? String(Math.round(displayWidth)) : ''}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Hoogte</Label>
              <MeasurementInput
                value={height !== undefined && height !== null ? height : ''}
                onChange={onHeightChange}
                disabled={disabled || disableHeight}
                placeholder={displayHeight && displayHeight > 0 ? String(Math.round(displayHeight)) : ''}
              />
            </div>
          </div>

          {/* Deur/Raamkozijn Specifics (Draairichting) */}
          {(type === 'deur' || type === 'raamkozijn') && onUpdateFull && (
            <div className="pt-2 border-t border-white/5 space-y-3">
              {type === 'deur' && (
                <>
                  <Label className="text-xs">Positie (van buitenaf gezien)</Label>
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
                </>
              )}

              <Label className="text-xs">Draairichting</Label>
              <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => onUpdateFull({ doorSwing: 'left' })}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-colors",
                    doorSwing !== 'right' ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
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

          {/* Glas/Raamkozijn/Open/Paneel Specifics (Borstwering) */}
          {['glas', 'raamkozijn', 'open', 'paneel'].includes(type) && onUpdateFull && (
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

          {/* Delete Button */}
          {onDelete && (
            <div className="pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Verwijderen</span>
              </button>
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

  // Custom hook for user preferences
  const userDocRef = useMemo(() => user?.uid && firestore ? doc(firestore, 'users', user.uid) : null, [user?.uid, firestore]);
  const { data: userData } = useDoc(userDocRef);

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
  const isWallCategory = Boolean(
    categorySlug === 'wanden' ||
    categorySlug === 'gevelbekleding' ||
    (jobSlug && (jobSlug.includes('voorzetwand') || jobSlug.includes('tussenwand') || jobSlug.includes('scheidingswand') || jobSlug.includes('gevelbekleding')))
  );
  const isCeilingCategory = Boolean(categorySlug === 'plafonds' || (jobSlug && jobSlug.includes('plafond')));
  const isRoofCategory = categorySlug === 'dakrenovatie' || (jobSlug && (jobSlug.includes('dak') || jobSlug.includes('hellend') || jobSlug.includes('epdm')));
  const isHellendDak = !!jobSlug && jobSlug.includes('hellend-dak');
  const isGolfplaatDak = jobSlug === 'golfplaat-dak';
  const isEpdmDak = jobSlug === 'epdm-dakbedekking';
  const isBoeiboord = categorySlug === 'boeiboorden' || (jobSlug && jobSlug.includes('boeiboord'));
  const isVoorzetwandParity = !!jobSlug && (jobSlug.includes('hsb-voorzetwand') || jobSlug.includes('metalstud-voorzetwand'));
  const isNadenVullenJob = [
    'hsb-voorzetwand',
    'metalstud-voorzetwand',
    'hsb-tussenwand',
    'metalstud-tussenwand',
  ].includes(jobSlug);
  const isGevelbekleding = categorySlug === 'gevelbekleding' || (jobSlug && jobSlug.includes('gevelbekleding'));
  const isGevelbekledingKeralit = jobSlug === 'gevelbekleding-keralit';
  const isSchutting = categorySlug === 'schutting' || (jobSlug && jobSlug.includes('schutting'));
  const hasWallFields = fields.some(f => f.key === 'balkafstand');
  const showOpeningsSection = specificJobConfig.sections.includes('openingen');
  const showKoofSection = specificJobConfig.sections.includes('koof');
  const showVensterbankSection = specificJobConfig.sections.includes('vensterbanken');
  const showDagkantSection = specificJobConfig.sections.includes('dagkanten');
  const GLAS_MAATWERK_OFFSET_MM = 5;

  // 3. State: Array of Item Objects
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [notities, setNotities] = useState(''); // New: Job Notes state
  const [materialenLijstSnapshot, setMaterialenLijstSnapshot] = useState<Record<string, any>>({});
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pendingDeleteOpening, setPendingDeleteOpening] = useState<{ itemIndex: number; openingIndex: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [kozijnhoutFrameThicknessMm, setKozijnhoutFrameThicknessMm] = useState<number | null>(null);
  const [tussenstijlThicknessMm, setTussenstijlThicknessMm] = useState<number | null>(null);
  const [hasTussenstijl, setHasTussenstijl] = useState(false);
  const [dakpanWerkendeMaten, setDakpanWerkendeMaten] = useState<DakpanWerkendeMaten | null>(null);
  const prevVakIdsRef = useRef<Record<number, Set<string>>>({});
  const [manualVakkenOverride, setManualVakkenOverride] = useState<Record<number, boolean>>({});
  const [nadenDefaults, setNadenDefaults] = useState<{
    behangklaar: { vullen: string; afwerken: string };
    schilderklaar: { vullen: string; afwerken: string };
  }>({
    behangklaar: { vullen: '0,3', afwerken: '0,1' },
    schilderklaar: { vullen: '0,4', afwerken: '0,15' },
  });
  const hasFilledMaterialInSnapshotEntry = (entry: any): boolean => {
    if (!entry || typeof entry !== 'object') return false;
    const material = entry.material;
    if (!material || typeof material !== 'object') return false;
    const hasName = typeof material.materiaalnaam === 'string' && material.materiaalnaam.trim().length > 0;
    const hasRef = Boolean(material.id || material.row_id || material.material_ref_id);
    return hasName || hasRef;
  };
  const hasMaterialInSnapshotBySection = (
    snapshot: Record<string, any>,
    sectionKeys: string[],
    keywordHints: string[] = []
  ): boolean => {
    const normalizedKeys = new Set(sectionKeys.map((key) => key.toLowerCase()));
    const normalizedHints = keywordHints.map((hint) => hint.toLowerCase());
    return Object.values(snapshot || {}).some((entry: any) => {
      if (!entry || typeof entry !== 'object') return false;
      const sectionKey = String(entry.sectionKey || entry.material?.sectionKey || '').trim().toLowerCase();
      const sectionLabel = String(entry.sectionLabel || entry.label || entry.title || '').trim().toLowerCase();
      const contextLabel = String(entry.context || '').trim().toLowerCase();
      const materialName = String(entry.material?.materiaalnaam || '').trim().toLowerCase();
      const keyMatch = sectionKey.length > 0 && normalizedKeys.has(sectionKey);
      const hintMatch = normalizedHints.some((hint) =>
        sectionLabel.includes(hint) || materialName.includes(hint) || contextLabel.includes(hint)
      );
      if (!keyMatch && !hintMatch) return false;
      return hasFilledMaterialInSnapshotEntry(entry);
    });
  };
  const hasLoodMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(materialenLijstSnapshot, ['lood']);
  }, [materialenLijstSnapshot]);
  const hasDaktrimMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['daktrim', 'daktrim_hoeken'],
      ['daktrim']
    );
  }, [materialenLijstSnapshot]);
  const hasDakgootMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(materialenLijstSnapshot, ['dakgoot'], ['dakgoot']);
  }, [materialenLijstSnapshot]);
  const hasHwaMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(materialenLijstSnapshot, ['hwa'], [' hwa', 'afvoer']);
  }, [materialenLijstSnapshot]);
  const hasHwaUitloopMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(materialenLijstSnapshot, ['hwa_uitloop'], ['stadsuitloop', 'uitloop']);
  }, [materialenLijstSnapshot]);
  const hasNadenStucMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['gips_vuller', 'gips_finish'],
      ['voegenmiddel', 'finish pasta']
    );
  }, [materialenLijstSnapshot]);
  const hasOvergangsprofielMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['profielen_overgang'],
      ['overgangsprofiel', 'overgangsprofielen']
    );
  }, [materialenLijstSnapshot]);
  const hasEindprofielMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['profielen_eind'],
      ['eindprofiel', 'eindprofielen']
    );
  }, [materialenLijstSnapshot]);
  const hasStofdorpelMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['stofdorpel'],
      ['stofdorpel', 'drempel', 'dorpel']
    );
  }, [materialenLijstSnapshot]);
  const hasDeklattenMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['deklatten'],
      ['deklat', 'deklatten']
    );
  }, [materialenLijstSnapshot]);
  const hasOpsluitbandenMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['opsluitbanden'],
      ['opsluitband']
    );
  }, [materialenLijstSnapshot]);
  const hasSchuttingPoortMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['tuinpoort', 'stalen_frame'],
      ['tuinpoort', 'poortframe', 'stalen frame']
    );
  }, [materialenLijstSnapshot]);
  const hasGevelKoofMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['koof_regelwerk', 'koof_constructieplaat', 'koof_beplating', 'koof_afwerkplaat', 'koof_isolatie'],
      ['koof']
    );
  }, [materialenLijstSnapshot]);
  const hasGevelVensterbankMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['vensterbanken', 'vensterbank'],
      ['vensterbank']
    );
  }, [materialenLijstSnapshot]);
  const hasGevelDagkantMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['dagkanten', 'dagkantafwerking', 'dagkant_binnen', 'dagkant'],
      ['dagkant']
    );
  }, [materialenLijstSnapshot]);
  const hasGevelTengelMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['tengelwerk_basis', 'tengelwerk', 'tengels'],
      ['tengel', 'ventilatielat']
    );
  }, [materialenLijstSnapshot]);
  const hasGevelDaktrimMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['keralit_daktrim', 'daktrim'],
      ['daktrim']
    );
  }, [materialenLijstSnapshot]);
  const hasKozijnMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['kozijn_compleet', 'kozijn_element', 'deur_kozijn', 'glas', 'roosters'],
      ['kozijn', 'raamkozijn']
    );
  }, [materialenLijstSnapshot]);
  const hasDeurMaterialFromPreviousPage = useMemo(() => {
    return hasMaterialInSnapshotBySection(
      materialenLijstSnapshot,
      ['deur_blad', 'deur_scharnieren', 'deur_sloten', 'deur_krukken', 'deur_rooster'],
      ['deurblad']
    );
  }, [materialenLijstSnapshot]);
  const showKoofSectionInUI = showKoofSection && (!isGevelbekleding && !isNadenVullenJob || hasGevelKoofMaterialFromPreviousPage);
  const showVensterbankSectionInUI = showVensterbankSection && (!isGevelbekleding && !isNadenVullenJob || hasGevelVensterbankMaterialFromPreviousPage);
  const showDagkantSectionInUI = showDagkantSection && (!isGevelbekleding && !isNadenVullenJob || hasGevelDagkantMaterialFromPreviousPage);
  const showStucwerkSectionInUI = isNadenVullenJob && hasNadenStucMaterialFromPreviousPage;
  const showOpeningsSectionInUI = showOpeningsSection && (!isNadenVullenJob || hasKozijnMaterialFromPreviousPage || hasDeurMaterialFromPreviousPage);
  const floorProfileCountFields = useMemo(() => {
    if (jobSlug === 'massief-houten-vloer') {
      return [
        {
          fieldKey: 'deklatten_aantal',
          label: 'Deklatten',
          summaryLabel: 'deklatten',
          enabled: hasDeklattenMaterialFromPreviousPage,
        },
        {
          fieldKey: 'profielen_overgang_aantal',
          label: 'Overgangsprofielen',
          summaryLabel: 'overgang',
          enabled: hasOvergangsprofielMaterialFromPreviousPage,
        },
        {
          fieldKey: 'stofdorpel_aantal',
          label: 'Stofdorpel',
          summaryLabel: 'stofdorpel',
          enabled: hasStofdorpelMaterialFromPreviousPage,
        },
        {
          fieldKey: 'profielen_eind_aantal',
          label: 'Eindprofielen',
          summaryLabel: 'eind',
          enabled: hasEindprofielMaterialFromPreviousPage,
        },
      ];
    }

    if (jobSlug === 'laminaat-pvc') {
      return [
        {
          fieldKey: 'profielen_overgang_aantal',
          label: 'Overgangsprofielen',
          summaryLabel: 'overgang',
          enabled: hasOvergangsprofielMaterialFromPreviousPage,
        },
        {
          fieldKey: 'stofdorpel_aantal',
          label: 'Stofdorpel',
          summaryLabel: 'stofdorpel',
          enabled: hasStofdorpelMaterialFromPreviousPage,
        },
        {
          fieldKey: 'profielen_eind_aantal',
          label: 'Eindprofielen',
          summaryLabel: 'eind',
          enabled: hasEindprofielMaterialFromPreviousPage,
        },
      ];
    }

    return [];
  }, [
    jobSlug,
    hasDeklattenMaterialFromPreviousPage,
    hasOvergangsprofielMaterialFromPreviousPage,
    hasEindprofielMaterialFromPreviousPage,
    hasStofdorpelMaterialFromPreviousPage,
  ]);

  const epdmSideRows: Array<{
    side: 'top' | 'right' | 'bottom' | 'left';
    key: 'edge_top' | 'edge_right' | 'edge_bottom' | 'edge_left';
    sideLabel: string;
    directionLabel: string;
  }> = [
      { side: 'top', key: 'edge_top', sideLabel: 'Boven', directionLabel: 'Noord' },
      { side: 'right', key: 'edge_right', sideLabel: 'Rechts', directionLabel: 'Oost' },
      { side: 'bottom', key: 'edge_bottom', sideLabel: 'Onder', directionLabel: 'Zuid' },
      { side: 'left', key: 'edge_left', sideLabel: 'Links', directionLabel: 'West' },
    ];

  // Auto-open vak cards (always open)
  useEffect(() => {
    if (!isMaatwerkKozijn) return;
    setCollapsedSections(prev => {
      const next = { ...prev };
      items.forEach((item, itemIdx) => {
        const vakken = Array.isArray(item?.vakken) ? item.vakken : [];
        vakken.forEach((_: any, vakIdx: number) => {
          next[`vak-${itemIdx}-${vakIdx}`] = false;
        });
      });
      return next;
    });
  }, [items, isMaatwerkKozijn]);


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

  const parseMmValues = (raw: any): number[] => {
    if (raw === null || raw === undefined || raw === '') return [];
    if (typeof raw === 'number') return Number.isFinite(raw) ? [raw] : [];
    const s = String(raw).trim().toLowerCase();
    if (!s) return [];
    const unitMatch = s.match(/\b(mm|cm|m)\b/);
    const unit = unitMatch?.[1];
    const factor = unit === 'cm' ? 10 : unit === 'm' ? 1000 : 1;
    const parts = s.match(/[\d.,]+/g) || [];
    return parts
      .map(part => parseFloat(part.replace(',', '.')))
      .filter(n => Number.isFinite(n))
      .map(n => n * factor);
  };

  const buildRangeMm = (minRaw: any, maxRaw: any, fallbackRaw?: any): { min: number | null; max: number | null } => {
    let min = null as number | null;
    let max = null as number | null;

    const minValues = parseMmValues(minRaw);
    const maxValues = parseMmValues(maxRaw);
    const fallbackValues = parseMmValues(fallbackRaw);

    if (minValues.length > 0) min = Math.min(...minValues);
    if (maxValues.length > 0) max = Math.max(...maxValues);

    if (min === null && max === null && fallbackValues.length > 0) {
      min = Math.min(...fallbackValues);
      max = Math.max(...fallbackValues);
    }
    if (min === null && max !== null) min = max;
    if (max === null && min !== null) max = min;

    if (min !== null && max !== null && min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    return { min, max };
  };

  const resolveDakpanWerkendeMaten = (material: any): DakpanWerkendeMaten | null => {
    if (!material) return null;

    const breedteFallbackRaw =
      material?.werkende_breedte_maat ??
      material?.werkende_breedte_mm ??
      material?.werkende_breedte ??
      material?.werkend;

    const hoogteFallbackRaw =
      material?.werkende_hoogte_maat ??
      material?.werkende_hoogte_mm ??
      material?.werkende_lengte_mm ??
      material?.werkende_lengte ??
      material?.panlatafstand ??
      material?.latafstand;

    const breedteRange = buildRangeMm(
      material?.min_werkende_breedte_mm,
      material?.max_werkende_breedte_mm,
      breedteFallbackRaw
    );

    const hoogteRange = buildRangeMm(
      material?.min_werkende_hoogte_mm ?? material?.min_werkende_lengte_mm,
      material?.max_werkende_hoogte_mm ?? material?.max_werkende_lengte_mm,
      hoogteFallbackRaw
    );

    const hasAny =
      breedteRange.min !== null ||
      breedteRange.max !== null ||
      hoogteRange.min !== null ||
      hoogteRange.max !== null;

    if (!hasAny) return null;

    return {
      minBreedteMm: breedteRange.min,
      maxBreedteMm: breedteRange.max,
      minHoogteMm: hoogteRange.min,
      maxHoogteMm: hoogteRange.max,
    };
  };

  const isEmptyValue = (value: any): boolean =>
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

  const toPositiveNumber = (value: any): number | null => {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const normalizeGevelProfielMode = (
    value: any,
    fallback: GevelProfielMode = 'both'
  ): GevelProfielMode => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'hoek') return 'hoek';
    if (normalized === 'eind') return 'eind';
    if (normalized === 'both' || normalized === 'beide') return 'both';
    return fallback;
  };

  const normalizeGevelProfielSide = (
    value: any,
    fallback: GevelProfielSideType = 'hoek'
  ): GevelProfielSideType => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'eind') return 'eind';
    if (normalized === 'hoek') return 'hoek';
    return fallback;
  };

  const resolveGevelProfielState = (
    rawItem: any,
    fallbackMode: GevelProfielMode = 'both'
  ): GevelProfielState => {
    const mode = normalizeGevelProfielMode(rawItem?.gevel_profiel_mode, fallbackMode);
    if (mode === 'hoek') return { mode, links: 'hoek', rechts: 'hoek' };
    if (mode === 'eind') return { mode, links: 'eind', rechts: 'eind' };

    const links = normalizeGevelProfielSide(rawItem?.gevel_profiel_links, 'hoek');
    const rechts = normalizeGevelProfielSide(
      rawItem?.gevel_profiel_rechts,
      links === 'hoek' ? 'eind' : 'hoek'
    );

    if (links === rechts) {
      return {
        mode: 'both',
        links,
        rechts: links === 'hoek' ? 'eind' : 'hoek',
      };
    }

    return { mode: 'both', links, rechts };
  };

  const applyGevelProfielStateToItem = (item: any, state: GevelProfielState) => ({
    ...item,
    gevel_profiel_mode: state.mode,
    gevel_profiel_links: state.links,
    gevel_profiel_rechts: state.rechts,
  });

  const formatGevelProfielLabel = (side: GevelProfielSideType): string => (
    side === 'hoek' ? 'Hoek' : 'Eind'
  );

  const hasGevelProfielDimensionsReady = (item: any): boolean => {
    const lengteReady = toPositiveNumber(item?.lengte) !== null;
    const hoogteCandidates = [
      item?.hoogte,
      item?.breedte,
      item?.hoogteLinks,
      item?.hoogteRechts,
      item?.hoogte1,
      item?.hoogte2,
      item?.hoogte3,
      item?.hoogteNok,
    ];
    const hoogteReady = hoogteCandidates.some((candidate) => toPositiveNumber(candidate) !== null);
    return lengteReady && hoogteReady;
  };

  const isEpdmEdgeField = (key: string): key is 'edge_top' | 'edge_bottom' | 'edge_left' | 'edge_right' => (
    key === 'edge_top' || key === 'edge_bottom' || key === 'edge_left' || key === 'edge_right'
  );

  const normalizeEpdmEdgeValue = (
    value: any,
    fallback: 'free' | 'wall' = 'free'
  ): 'free' | 'wall' => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['wall', 'gevel', 'muur'].includes(normalized)) return 'wall';
    if (['free', 'vrij', 'vrijstaand'].includes(normalized)) return 'free';
    return fallback;
  };

  const epdmDefaultEdgeForKey = (key: 'edge_top' | 'edge_bottom' | 'edge_left' | 'edge_right'): 'free' | 'wall' => {
    return key === 'edge_top' ? 'wall' : 'free';
  };

  const toNonNegativeIntOrNull = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    const intVal = Math.floor(parsed);
    if (intVal < 0) return null;
    return intVal;
  };

  const sanitizeOptionalCountFields = (
    item: Record<string, any>,
    fieldsWithAvailability: Array<{ fieldKey: string; enabled: boolean }>
  ) => {
    fieldsWithAvailability.forEach(({ fieldKey, enabled }) => {
      if (!enabled) {
        delete item[fieldKey];
        return;
      }
      const parsed = toNonNegativeIntOrNull(item[fieldKey]);
      if (parsed === null) {
        delete item[fieldKey];
      } else {
        item[fieldKey] = parsed;
      }
    });
  };

  const parsePriceValue = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;

    let s = value.trim();
    if (!s) return null;
    s = s.replace(/€/g, '').replace(/\s+/g, '');
    s = s.replace(/[^0-9,.-]/g, '');
    if (!s) return null;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      s = s.replace(',', '.');
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const sanitizeMaterialenLijstEntryForFirestore = (entry: any): any => {
    if (!entry || typeof entry !== 'object') return entry;
    const nextEntry: any = { ...entry };
    if (!nextEntry.material || typeof nextEntry.material !== 'object') return nextEntry;

    const nextMaterial: any = { ...nextEntry.material };
    const excl =
      parsePriceValue(nextMaterial.prijs_excl_btw ?? nextMaterial.prijs ?? nextMaterial.prijs_per_stuk);
    const incl = parsePriceValue(nextMaterial.prijs_incl_btw);
    const resolvedExcl = excl ?? (incl != null ? Number((incl / 1.21).toFixed(2)) : null);

    if (resolvedExcl != null && resolvedExcl > 0) {
      nextMaterial.prijs_excl_btw = Number(resolvedExcl.toFixed(2));
    }

    // Canonical in Firestore: excl only.
    delete nextMaterial.prijs_incl_btw;
    nextEntry.material = nextMaterial;
    return nextEntry;
  };

  const isHalfAfstandEnabled = (value: any): boolean => {
    if (value === undefined || value === null || value === '') return true; // hellend-dak default
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value).trim().toLowerCase();
    if (['false', '0', 'nee', 'no'].includes(normalized)) return false;
    if (['true', '1', 'ja', 'yes'].includes(normalized)) return true;
    return Boolean(value);
  };

  const buildHellendDakMultipliers = (mirrorEnabled: boolean): Record<string, number> => {
    return Object.fromEntries(
      Object.entries(HELLEND_DAK_SECTION_MULTIPLIERS).map(([sectionKey, mirroredMultiplier]) => [
        sectionKey,
        mirrorEnabled ? mirroredMultiplier : 1,
      ])
    );
  };

  const applyHellendDakMultipliers = (sourceItem: any) => {
    if (!isHellendDak) return sourceItem;
    const mirrorEnabled = sourceItem?.hellend_dak_mirror === true;
    return {
      ...sourceItem,
      hellend_dak_multipliers: buildHellendDakMultipliers(mirrorEnabled),
    };
  };

  const toPositiveInt = (value: any): number | null => {
    const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const isMirrorEnabled = (value: any): boolean => {
    if (value === true || value === 1) return true;
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'ja';
  };

  const normalizeHellendDakEdge = (value: any): 'gevel' | 'buren' => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['gevel', 'vrij', 'free'].includes(normalized)) return 'gevel';
    if (['buren', 'muur', 'wall'].includes(normalized)) return 'buren';
    return 'buren';
  };

  const buildMergedHellendDakMultipliers = (sourceItems: any[]): Record<string, number> => {
    const mirrorEnabled = Array.isArray(sourceItems) && sourceItems.some((item) => isMirrorEnabled(item?.hellend_dak_mirror));
    const merged = buildHellendDakMultipliers(mirrorEnabled);

    if (!Array.isArray(sourceItems)) return merged;
    sourceItems.forEach((item) => {
      const map = item?.hellend_dak_multipliers;
      if (!map || typeof map !== 'object') return;
      Object.entries(map as Record<string, any>).forEach(([sectionKey, rawMultiplier]) => {
        const normalizedSectionKey = String(sectionKey || '').trim();
        const multiplier = toPositiveInt(rawMultiplier);
        if (!normalizedSectionKey || multiplier === null) return;
        const prev = toPositiveInt(merged[normalizedSectionKey]) ?? 1;
        if (multiplier > prev) {
          merged[normalizedSectionKey] = multiplier;
        }
      });
    });

    return merged;
  };

  const syncHellendDakMultipliersInMaterialenLijst = (
    sourceMaterialenLijst: Record<string, any>,
    multiplierMap: Record<string, number>
  ): Record<string, any> => {
    if (!sourceMaterialenLijst || typeof sourceMaterialenLijst !== 'object') return {};

    const synced: Record<string, any> = {};
    Object.entries(sourceMaterialenLijst).forEach(([entryKey, entryValue]) => {
      if (!entryValue || typeof entryValue !== 'object') {
        synced[entryKey] = entryValue;
        return;
      }

      const sectionKeyFromEntry = typeof entryValue.sectionKey === 'string' && entryValue.sectionKey.trim()
        ? entryValue.sectionKey.trim()
        : String(entryKey).split('__')[0].trim();
      const multiplier = toPositiveInt(multiplierMap[sectionKeyFromEntry]) ?? 1;

      const nextEntry: any = {
        ...entryValue,
        hellend_dak_multiplier: multiplier,
      };

      if (entryValue.material && typeof entryValue.material === 'object') {
        nextEntry.material = {
          ...entryValue.material,
          hellend_dak_multiplier: multiplier,
        };
      }

      synced[entryKey] = sanitizeMaterialenLijstEntryForFirestore(nextEntry);
    });

    return synced;
  };

  const applyHellendDakAutoCalculations = (
    sourceItem: any,
    options?: { onlyWhenEmpty?: boolean; syncLatafstand?: boolean }
  ) => {
    if (!isHellendDak) return sourceItem;
    const onlyWhenEmpty = options?.onlyWhenEmpty ?? false;
    const syncLatafstand = options?.syncLatafstand ?? true;
    const next = { ...sourceItem };

    const countBreedte = toPositiveNumber(next.aantal_pannen_breedte);
    const countHoogte = toPositiveNumber(next.aantal_pannen_hoogte);
    const werkendeBreedte = parseDimToMm(next.werkende_breedte_mm);
    const werkendeHoogte = parseDimToMm(next.werkende_hoogte_mm);
    const halfOffsetEnabled = isHalfAfstandEnabled(next.halfLatafstandFromBottom);
    const breedteHalfOffset = halfOffsetEnabled && werkendeBreedte ? (werkendeBreedte / 2) : 0;
    const hoogteHalfOffset = halfOffsetEnabled && werkendeHoogte ? (werkendeHoogte / 2) : 0;

    if (countBreedte && werkendeBreedte && (!onlyWhenEmpty || isEmptyValue(next.lengte))) {
      next.lengte = Math.max(0, Math.round((countBreedte * werkendeBreedte) - breedteHalfOffset));
    } else if (onlyWhenEmpty && countBreedte && werkendeBreedte && halfOffsetEnabled) {
      // Safe migration: adjust persisted legacy full-span values to half-offset formula.
      const currentLengte = parseDimToMm(next.lengte);
      const legacyFullLengte = Math.round(countBreedte * werkendeBreedte);
      if (currentLengte !== null && Math.round(currentLengte) === legacyFullLengte) {
        next.lengte = Math.max(0, Math.round((countBreedte * werkendeBreedte) - breedteHalfOffset));
      }
    }
    if (countHoogte && werkendeHoogte && (!onlyWhenEmpty || isEmptyValue(next.hoogte))) {
      next.hoogte = Math.max(0, Math.round((countHoogte * werkendeHoogte) - hoogteHalfOffset));
    } else if (onlyWhenEmpty && countHoogte && werkendeHoogte && halfOffsetEnabled) {
      // Safe migration: adjust persisted legacy full-span values to half-offset formula.
      const currentHoogte = parseDimToMm(next.hoogte);
      const legacyFullHoogte = Math.round(countHoogte * werkendeHoogte);
      if (currentHoogte !== null && Math.round(currentHoogte) === legacyFullHoogte) {
        next.hoogte = Math.max(0, Math.round((countHoogte * werkendeHoogte) - hoogteHalfOffset));
      }
    }
    if (syncLatafstand && werkendeHoogte && (!onlyWhenEmpty || isEmptyValue(next.latafstand))) {
      next.latafstand = Math.round(werkendeHoogte);
    }

    return next;
  };

  useEffect(() => {
    if (!isSchutting) return;
    if (hasOpsluitbandenMaterialFromPreviousPage) return;

    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const current = item?.betonband_hoogte;
        if (current === undefined || current === null || String(current).trim() === '') return item;
        changed = true;
        const cleaned = { ...item };
        delete cleaned.betonband_hoogte;
        return cleaned;
      });
      return changed ? next : prev;
    });
  }, [isSchutting, hasOpsluitbandenMaterialFromPreviousPage]);

  useEffect(() => {
    if (!isSchutting) return;
    if (!showOpeningsSection) return;

    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (!Array.isArray(item?.openings) || item.openings.length === 0) return item;
        let itemChanged = false;
        const normalizedOpenings = item.openings.map((opening: any) => {
          if (opening?.type === 'opening') return opening;
          changed = true;
          itemChanged = true;
          return { ...opening, type: 'opening' };
        });
        return itemChanged ? { ...item, openings: normalizedOpenings } : item;
      });
      return changed ? next : prev;
    });
  }, [isSchutting, showOpeningsSection]);

  useEffect(() => {
    if (!isSchutting) return;
    if (!showOpeningsSection) return;
    if (!hasSchuttingPoortMaterialFromPreviousPage) return;

    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const currentOpenings = Array.isArray(item?.openings) ? item.openings : [];
        if (currentOpenings.length > 0) return item;

        const parseNum = (value: any, fallback = 0) => (
          typeof value === 'number' ? value : parseFloat(String(value ?? '')) || fallback
        );
        const lengteMm = Math.max(0, parseNum(item?.lengte));
        const hoogteMm = Math.max(0, parseNum(item?.hoogte, 1800));
        const widthMm = Math.min(1000, lengteMm > 0 ? lengteMm : 1000);
        const fromLeftMm = Math.max(0, Math.round((lengteMm - widthMm) / 2));

        changed = true;
        return {
          ...item,
          openings: [{
            id: crypto.randomUUID(),
            type: 'opening',
            width: Math.round(widthMm),
            height: Math.round(hoogteMm),
            fromLeft: fromLeftMm,
            fromBottom: 0,
            autoSource: 'schutting_tuinpoort_material',
          }],
        };
      });

      return changed ? next : prev;
    });
  }, [isSchutting, showOpeningsSection, hasSchuttingPoortMaterialFromPreviousPage]);

  const applyHellendDakDefaultsFromDakpan = (sourceItem: any, maten: DakpanWerkendeMaten | null) => {
    if (!isHellendDak) return sourceItem;
    const next = { ...sourceItem };
    if (!maten) {
      return applyHellendDakMultipliers(next);
    }
    const defaultBreedte = maten.maxBreedteMm ?? maten.minBreedteMm;
    const defaultHoogte = maten.minHoogteMm !== null && maten.maxHoogteMm !== null
      ? (maten.minHoogteMm + maten.maxHoogteMm) / 2
      : (maten.maxHoogteMm ?? maten.minHoogteMm);

    if (defaultBreedte && isEmptyValue(next.werkende_breedte_mm)) {
      next.werkende_breedte_mm = Math.round(defaultBreedte);
    }
    if (defaultHoogte && isEmptyValue(next.werkende_hoogte_mm)) {
      next.werkende_hoogte_mm = Math.round(defaultHoogte);
    }

    const withAutoValues = applyHellendDakAutoCalculations(next, { onlyWhenEmpty: true, syncLatafstand: true });
    return applyHellendDakMultipliers(withAutoValues);
  };

  const applyGolfplaatDakverdelingAuto = (sourceItem: any, changedKey?: string) => {
    if (!isGolfplaatDak) return sourceItem;
    if (!sourceItem || typeof sourceItem !== 'object') return sourceItem;
    if (changedKey === 'tussenmuur') return sourceItem;

    const shouldRecompute =
      !changedKey ||
      changedKey === 'aantal_daken' ||
      changedKey === 'hoogte' ||
      changedKey === 'breedte';
    if (!shouldRecompute) return sourceItem;

    const next = { ...sourceItem };
    const dakCount = Math.max(1, Math.floor(toPositiveNumber(next.aantal_daken) ?? 1));
    const breedteMm = toPositiveNumber(next.hoogte ?? next.breedte);

    // On hydration, preserve explicit/manual value if already present.
    if (!changedKey && !isEmptyValue(next.tussenmuur)) {
      return next;
    }

    if (dakCount > 1 && breedteMm && breedteMm > 0) {
      next.tussenmuur = Math.round(breedteMm / dakCount);
    } else if (changedKey === 'aantal_daken' && dakCount <= 1) {
      next.tussenmuur = '';
    }

    return next;
  };

  const buildGolfplaatGordingLengte = (sourceItem: any): string | null => {
    if (!sourceItem || typeof sourceItem !== 'object') return null;

    const lengteMm = toPositiveNumber(sourceItem.lengte);
    const breedteMm = toPositiveNumber(sourceItem.breedte ?? sourceItem.hoogte);
    const balkafstandMm = toPositiveNumber(sourceItem.balkafstand);
    if (!lengteMm || !breedteMm || !balkafstandMm) return null;

    const includeTopBottom = Boolean(sourceItem.includeTopBottomGording);
    const interiorRows = Math.max(0, Math.ceil(lengteMm / balkafstandMm) - 1);
    const rows = interiorRows + (includeTopBottom ? 2 : 0);
    if (rows <= 0) return null;

    const tussenmuurMm = toPositiveNumber(sourceItem.tussenmuur_vanaf_links_maat ?? sourceItem.tussenmuur);
    if (tussenmuurMm && tussenmuurMm > 0 && tussenmuurMm < breedteMm) {
      const leftLen = Math.round(tussenmuurMm);
      const rightLen = Math.round(breedteMm - tussenmuurMm);
      if (leftLen > 0 && rightLen > 0) {
        if (leftLen === rightLen) {
          return `${rows * 2}x ${leftLen}mm`;
        }
        return `${rows}x ${leftLen}mm + ${rows}x ${rightLen}mm`;
      }
    }

    return `${rows}x ${Math.round(breedteMm)}mm`;
  };

  const formatWerkendeRange = (min: number | null, max: number | null): string | null => {
    if (min === null && max === null) return null;
    const minVal = min ?? max;
    const maxVal = max ?? min;
    if (minVal === null || maxVal === null) return null;
    const minRounded = Math.round(minVal);
    const maxRounded = Math.round(maxVal);
    if (minRounded === maxRounded) return `${minRounded}mm`;
    return `${minRounded}-${maxRounded}mm`;
  };

  const mergeLegacyBorstweringVakken = (vakken: any[]) => {
    if (!Array.isArray(vakken) || vakken.length === 0) return vakken;

    const grouped = new Map<number, any[]>();
    const loose: any[] = [];

    vakken.forEach((vak) => {
      const rawIndex = (vak && (vak.index ?? vak.vakIndex)) ?? null;
      const idx = typeof rawIndex === 'number'
        ? rawIndex
        : (rawIndex !== null && rawIndex !== undefined && rawIndex !== '' ? Number(rawIndex) : null);
      if (idx === null || Number.isNaN(idx)) {
        loose.push(vak);
        return;
      }
      const list = grouped.get(idx) || [];
      list.push(vak);
      grouped.set(idx, list);
    });

    const merged: any[] = [];
    const sponning = 17;
    const rawThickness = kozijnhoutFrameThicknessMm || 67;
    const transomThickness = Math.max(0, rawThickness - (2 * sponning));

    grouped.forEach((group) => {
      if (group.length <= 1) {
        merged.push(group[0]);
        return;
      }

      const paneel = group.find((v) => String(v?.type || '').toLowerCase() === 'paneel');
      const mainVak = group.find((v) => String(v?.type || '').toLowerCase() !== 'paneel');

      if (!paneel || !mainVak) {
        merged.push(...group);
        return;
      }

      const bwHeight = parseDimToMm(
        paneel?.paneel_hoogte_mm ?? paneel?.hoogte ?? paneel?.height ?? paneel?.paneel_hoogte ?? paneel?.paneelHeight
      );
      const mainHeight = parseDimToMm(
        mainVak?.glas_dagmaat_hoogte_mm ??
        mainVak?.raamkozijn_hoogte_mm ??
        mainVak?.paneel_hoogte_mm ??
        mainVak?.open_hoogte_mm ??
        mainVak?.vak_hoogte_mm ??
        mainVak?.hoogte ??
        mainVak?.height
      );

      const mergedVak = { ...mainVak };
      if (bwHeight !== null && bwHeight > 0) {
        mergedVak.hasBorstwering = true;
        mergedVak.borstweringHeight = bwHeight;
      }

      if (bwHeight !== null && bwHeight > 0 && mainHeight !== null && mainHeight > 0) {
        const restoredHeight = mainHeight + bwHeight + transomThickness;
        if (mergedVak.glas_dagmaat_hoogte_mm !== undefined) mergedVak.glas_dagmaat_hoogte_mm = restoredHeight;
        if (mergedVak.raamkozijn_hoogte_mm !== undefined) mergedVak.raamkozijn_hoogte_mm = restoredHeight;
        if (mergedVak.paneel_hoogte_mm !== undefined) mergedVak.paneel_hoogte_mm = restoredHeight;
        if (mergedVak.open_hoogte_mm !== undefined) mergedVak.open_hoogte_mm = restoredHeight;
        if (mergedVak.vak_hoogte_mm !== undefined) mergedVak.vak_hoogte_mm = restoredHeight;
        if (mergedVak.hoogte !== undefined) mergedVak.hoogte = restoredHeight;
        if (mergedVak.height !== undefined) mergedVak.height = restoredHeight;
        if (mergedVak.hoogte === undefined && mergedVak.height === undefined) mergedVak.hoogte = restoredHeight;
      }

      merged.push(mergedVak);
      group.forEach((v) => {
        if (v !== paneel && v !== mainVak) merged.push(v);
      });
    });

    return [...merged, ...loose];
  };

  const computeVakLayout = (item: any) => {
    const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
    const sponning = 17;
    const frameMm = Math.max(0, (kozijnhoutFrameThicknessMm || 0) - sponning);
    const tussenstijlMm = hasTussenstijl ? Math.max(0, ((tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm) || 0) - (2 * sponning)) : 0;
    const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
    const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));

    const vakken = Array.isArray(item.vakken) ? item.vakken : [];
    const doorInfo = getDoorVakInfo(item);
    const doorVakIndex = doorInfo.index;
    const doorWidthMm = doorInfo.width;
    const doorHeightMm = doorInfo.height;
    const hasDoor = doorHeightMm > 0;

    const rawPositions = Array.isArray(item.tussenstijlen) ? item.tussenstijlen.map(num).filter((v: number) => v > 0) : [];
    const layoutDoorLeft = true;
    const autoDoorPos = (hasDoor && hasTussenstijl && doorWidthMm > 0 && doorWidthMm < innerWidthMm)
      ? (layoutDoorLeft ? doorWidthMm : Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm))
      : null;

    let basePositions = rawPositions.length > 0 ? rawPositions : [];
    if (autoDoorPos !== null) {
      const eps = 1;
      basePositions = [autoDoorPos, ...basePositions.filter((p: number) => Math.abs(p - autoDoorPos) > eps)];
    }

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

    const hasColumns = hasTussenstijl && tussenstijlMm > 0;
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
    const colCount = Math.max(1, colWidths.length);

    const doorColIndex = layoutDoorLeft ? 0 : Math.max(0, colCount - 1);
    const doorRowCols = colCount > 1
      ? Array.from({ length: colCount }, (_, i) => i).filter(i => i !== doorColIndex)
      : [];

    const layoutVakken = doorVakIndex >= 0 ? vakken.filter((_: any, idx: number) => idx !== doorVakIndex) : vakken;

    const results = new Map<number, {
      displayWidth: number;
      displayHeight: number;
      rowIndex: number;
      colIndex: number;
      colCount: number;
      rowCount: number;
    }>();

    const doorRowSlots = hasDoor ? doorRowCols.length : 0;
    const nonDoorCount = layoutVakken.length;
    const rowCount = colCount > 0
      ? (hasDoor
        ? (doorRowSlots > 0 ? Math.ceil(Math.max(0, nonDoorCount - doorRowSlots) / colCount) + 1 : 1)
        : Math.ceil(Math.max(0, nonDoorCount) / colCount))
      : 0;

    vakken.forEach((vak: any, vakIdx: number) => {
      const isDoorVak = (doorVakIndex === vakIdx) || (String(vak?.type || '').toLowerCase() === 'deur');
      const layoutIndex = isDoorVak
        ? -1
        : (doorVakIndex >= 0 && vakIdx > doorVakIndex ? vakIdx - 1 : vakIdx);

      const rowIndex = isDoorVak
        ? 0
        : (hasDoor
          ? (layoutIndex < doorRowSlots ? 0 : Math.floor((layoutIndex - doorRowSlots) / colCount) + 1)
          : Math.floor(layoutIndex / colCount));

      const colIndex = isDoorVak
        ? (hasDoor ? doorColIndex : 0)
        : (hasDoor
          ? (layoutIndex < doorRowSlots ? doorRowCols[layoutIndex] : (layoutIndex - doorRowSlots) % colCount)
          : (layoutIndex % colCount));

      const rowStartIdx = hasDoor
        ? (rowIndex === 0 ? 0 : doorRowSlots + ((rowIndex - 1) * colCount))
        : (rowIndex * colCount);
      const rowEntries = hasDoor && rowIndex === 0
        ? layoutVakken.slice(0, doorRowSlots)
        : layoutVakken.slice(rowStartIdx, rowStartIdx + colCount);

      const rowHeight = rowIndex === 0 && hasDoor
        ? doorHeightMm
        : Math.max(...rowEntries.map((v: any) => num(v?.hoogte ?? v?.height)), 0);

      const horizontalBarHeight = (hasDoor && (doorHeightMm + frameMm) < innerHeightMm) ? frameMm : 0;
      const fallbackHeight = hasDoor ? Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight) : innerHeightMm;

      const displayHeight = isDoorVak
        ? (doorHeightMm > 0 ? doorHeightMm : innerHeightMm)
        : (rowIndex === 0 && hasDoor ? doorHeightMm : (rowHeight > 0 ? rowHeight : fallbackHeight));

      const displayWidth = isDoorVak
        ? (hasColumns ? (colWidths[doorColIndex] || innerWidthMm) : innerWidthMm)
        : (hasColumns ? (colWidths[colIndex] || innerWidthMm) : innerWidthMm);

      results.set(vakIdx, {
        displayWidth,
        displayHeight,
        rowIndex,
        colIndex,
        colCount,
        rowCount,
      });
    });

    let maxRow = -1;
    results.forEach((v) => {
      if (v.rowIndex > maxRow) maxRow = v.rowIndex;
    });
    const totalRows = maxRow >= 0 ? maxRow + 1 : 0;

    return {
      innerWidthMm,
      innerHeightMm,
      frameMm,
      tussenstijlMm,
      positions: tussenstijlPositions,
      layout: results,
      rowCount: totalRows,
    };
  };

  const buildTussenstijlenForSave = (item: any) => {
    const layout = computeVakLayout(item);
    const count = layout.positions.length;

    if (count <= 0 || layout.innerHeightMm <= 0) {
      return [];
    }

    return [{
      type: 'tussenstijl',
      aantal: count,
      lengte_mm: Math.round(layout.innerHeightMm),
      referentie: 'binnenmaat_hoogte',
      eenheid: 'mm',
    }];
  };

  const buildStijlenForSave = (item: any) => {
    const hoogteMm = parseDimToMm(item.hoogte);
    const breedteMm = parseDimToMm(item.breedte);
    const layout = computeVakLayout(item);

    if (!hoogteMm || !breedteMm) {
      return null;
    }

    const doorInfo = getDoorVakInfo(item);
    const hasDoor = doorInfo.height > 0;
    const hasTussendorpel = hasDoor && (doorInfo.height + layout.frameMm) < layout.innerHeightMm;
    const tussendorpelAantal = hasTussendorpel ? 1 : 0;
    const tussendorpelLengte = hasTussendorpel && layout.innerWidthMm > 0
      ? Math.round(layout.innerWidthMm)
      : null;

    return {
      zijstijl_lengte_mm: Math.round(hoogteMm),
      bovendorpel_lengte_mm: Math.round(breedteMm),
      onderdorpel_lengte_mm: Math.round(breedteMm),
      tussendorpel_lengte_mm: tussendorpelLengte,
      aantallen: {
        zijstijl: 2,
        bovendorpel: 1,
        onderdorpel: 1,
        tussendorpel: tussendorpelAantal,
      }
    };
  };

  const sanitizeItemBySections = (rawItem: any) => {
    const item = { ...rawItem };

    if (showOpeningsSection) {
      if (!Array.isArray(item.openings)) item.openings = [];
    } else {
      delete item.openings;
    }

    if (showKoofSection) {
      if (!Array.isArray(item.koven)) item.koven = [];
    } else {
      delete item.koven;
      delete item.koof_lengte;
      delete item.koof_hoogte;
      delete item.koof_diepte;
    }

    if (showDagkantSection) {
      if (!Array.isArray(item.dagkanten)) item.dagkanten = [];
    } else {
      delete item.dagkanten;
      delete item.dagkant_diepte;
      delete item.dagkant_lengte;
    }

    if (showVensterbankSection) {
      if (!Array.isArray(item.vensterbanken)) item.vensterbanken = [];
    } else {
      delete item.vensterbanken;
      delete item.vensterbank_diepte;
      delete item.vensterbank_lengte;
    }

    if (isMaatwerkKozijn) {
      delete item.openings;
      delete item.koven;
      delete item.dagkanten;
      delete item.vensterbanken;
      delete item.koof_lengte;
      delete item.koof_hoogte;
      delete item.koof_diepte;
      delete item.dagkant_diepte;
      delete item.dagkant_lengte;
      delete item.vensterbank_diepte;
      delete item.vensterbank_lengte;
    }

    if (isNadenVullenJob) {
      const hasNadenVerbruikValues =
        !isEmptyValue(item.naden_vullen_verbruik_per_m2) ||
        !isEmptyValue(item.naden_afwerken_verbruik_per_m2);
      const shouldAutoDefaultAfwerking = hasNadenStucMaterialFromPreviousPage || hasNadenVerbruikValues;
      const afwerking = typeof item.naden_vullen_afwerking === 'string'
        ? item.naden_vullen_afwerking.toLowerCase()
        : '';
      if (afwerking === 'behangklaar' || afwerking === 'schilderklaar') {
        item.naden_vullen_afwerking = afwerking;
      } else if (shouldAutoDefaultAfwerking) {
        item.naden_vullen_afwerking = 'schilderklaar';
      } else {
        delete item.naden_vullen_afwerking;
      }
    } else {
      delete item.naden_vullen_verbruik_per_m2;
      delete item.naden_afwerken_verbruik_per_m2;
      delete item.naden_vullen_afwerking;
    }

    if (isHellendDak) {
      item.edge_left = normalizeHellendDakEdge(item.edge_left);
      item.edge_right = normalizeHellendDakEdge(item.edge_right);
    }

    if (isEpdmDak) {
      item.edge_top = normalizeEpdmEdgeValue(item.edge_top, epdmDefaultEdgeForKey('edge_top'));
      item.edge_bottom = normalizeEpdmEdgeValue(item.edge_bottom, epdmDefaultEdgeForKey('edge_bottom'));
      item.edge_left = normalizeEpdmEdgeValue(item.edge_left, epdmDefaultEdgeForKey('edge_left'));
      item.edge_right = normalizeEpdmEdgeValue(item.edge_right, epdmDefaultEdgeForKey('edge_right'));
      item.dakrand_breedte = 50;

      const edgeBySide: Record<'top' | 'right' | 'bottom' | 'left', 'free' | 'wall'> = {
        top: item.edge_top,
        right: item.edge_right,
        bottom: item.edge_bottom,
        left: item.edge_left,
      };

      const hasExplicitLoodSides = ['top', 'right', 'bottom', 'left'].some((side) =>
        typeof item[`lood_${side}`] === 'boolean'
      );
      const legacyLoodValue = Boolean(item.lood_gevelzijde);
      ['top', 'right', 'bottom', 'left'].forEach((side) => {
        const sideKey = side as 'top' | 'right' | 'bottom' | 'left';
        const sideType = edgeBySide[sideKey];
        const loodKey = `lood_${side}`;
        const daktrimKey = `daktrim_${side}`;
        const dakgootKey = `dakgoot_${side}`;

        if (typeof item[loodKey] !== 'boolean') {
          if (hasExplicitLoodSides) {
            item[loodKey] = Boolean(item[loodKey]);
          } else {
            item[loodKey] = sideType === 'wall' ? legacyLoodValue : false;
          }
        }
        if (typeof item[daktrimKey] !== 'boolean') {
          item[daktrimKey] = false;
        }
        if (typeof item[dakgootKey] !== 'boolean') {
          item[dakgootKey] = false;
        }
        if (sideType !== 'free') {
          item[dakgootKey] = false;
        }
      });

      item.lood_gevelzijde = ['top', 'right', 'bottom', 'left'].some((side) => Boolean(item[`lood_${side}`]));
    }

    if (isGevelbekledingKeralit) {
      if (isEmptyValue(item.lengte) && !isEmptyValue(item.breedte)) {
        item.lengte = item.breedte;
      }
      if (!isEmptyValue(item.lengte)) {
        item.breedte = item.lengte;
      }

      item.keralit_panelen_afval_volgende_baan = Boolean(item.keralit_panelen_afval_volgende_baan);

      if (hasGevelDaktrimMaterialFromPreviousPage) {
        const daktrimLengte = toPositiveNumber(item.lengte ?? item.breedte);
        if (daktrimLengte !== null) {
          item.daktrim_lengte = Math.round(daktrimLengte);
        }
      } else {
        delete item.daktrim_lengte;
      }

      const profielState = resolveGevelProfielState(item, 'both');
      item.gevel_profiel_mode = profielState.mode;
      item.gevel_profiel_links = profielState.links;
      item.gevel_profiel_rechts = profielState.rechts;
    } else {
      delete item.gevel_profiel_mode;
      delete item.gevel_profiel_links;
      delete item.gevel_profiel_rechts;
      delete item.daktrim_lengte;
      delete item.keralit_panelen_afval_volgende_baan;
    }

    delete item.epdm_orientatie_startpositie;

    return item;
  };

  const enrichVakkenForSave = (item: any) => {
    const vakken = Array.isArray(item.vakken) ? item.vakken : [];
    const layoutData = computeVakLayout(item);
    const doorPosition = item.doorPosition ?? 'left';
    const doorSwing = item.doorSwing ?? 'left';

    return vakken.flatMap((vak: any, idx: number) => {
      const typeRaw = String(vak?.type || '').toLowerCase();
      const type = typeRaw || 'glas';
      const layout = layoutData.layout.get(idx);

      const explicitWidth = parseDimToMm(vak?.breedte ?? vak?.width ?? vak?.opening_breedte ?? vak?.openingWidth);
      const explicitHeight = parseDimToMm(vak?.hoogte ?? vak?.height ?? vak?.opening_hoogte ?? vak?.openingHeight);
      const doorFallbackWidth = (type === 'deur') ? parseDimToMm(item?.deur_breedte ?? item?.doorWidth ?? item?.door_breedte) : null;
      const doorFallbackHeight = (type === 'deur') ? parseDimToMm(item?.deur_hoogte ?? item?.doorHeight ?? item?.door_hoogte) : null;

      const widthMm = explicitWidth ?? doorFallbackWidth ?? (layout?.displayWidth ? Math.round(layout.displayWidth) : null);
      const heightMm = explicitHeight ?? doorFallbackHeight ?? (layout?.displayHeight ? Math.round(layout.displayHeight) : null);
      const cleaned: any = {
        id: vak?.id || crypto.randomUUID(),
        index: vak?.index ?? idx,
        type,
      };

      if (type === 'glas' && (widthMm !== null || heightMm !== null)) {
        const totalOffset = GLAS_MAATWERK_OFFSET_MM * 2;
        const gW = widthMm !== null ? Math.max(0, widthMm - totalOffset) : null;
        const gH = heightMm !== null ? Math.max(0, heightMm - totalOffset) : null;
        cleaned.glas_dagmaat_breedte_mm = widthMm ?? null;
        cleaned.glas_dagmaat_hoogte_mm = heightMm ?? null;
        cleaned.glasmaat_breedte_mm = gW;
        cleaned.glasmaat_hoogte_mm = gH;
        cleaned.glas_offset_per_zijde_mm = GLAS_MAATWERK_OFFSET_MM;
        cleaned.glas_offset_totaal_mm = totalOffset;
      } else if (type === 'deur' && (widthMm !== null || heightMm !== null)) {
        cleaned.deur_breedte_mm = widthMm ?? null;
        cleaned.deur_hoogte_mm = heightMm ?? null;
        cleaned.deur_positie = vak?.doorPosition ?? doorPosition;
        cleaned.deur_draairichting = vak?.doorSwing ?? doorSwing;
      } else if (type === 'paneel' && (widthMm !== null || heightMm !== null)) {
        cleaned.paneel_breedte_mm = widthMm ?? null;
        cleaned.paneel_hoogte_mm = heightMm ?? null;
      } else if (type === 'open' && (widthMm !== null || heightMm !== null)) {
        cleaned.open_breedte_mm = widthMm ?? null;
        cleaned.open_hoogte_mm = heightMm ?? null;
      } else if (type === 'raamkozijn' && (widthMm !== null || heightMm !== null)) {
        // Glasmaat calculation for Raamkozijn
        // Sparingsmaat (widthMm) - 2x (Raamhout(67) - Sponning(17)) - 2x 5mm (Glas offset)
        // = widthMm - 2x(50) - 2x(5) = widthMm - 100 - 10 = widthMm - 110mm
        const raamhoutWidth = 67;
        const sponning = 17;
        const visibleFrame = raamhoutWidth - sponning; // 50
        const glasOffset = 5;
        const totalDeduction = (2 * visibleFrame) + (2 * glasOffset); // 100 + 10 = 110

        const gW = widthMm !== null ? Math.max(0, widthMm - totalDeduction) : null;
        const gH = heightMm !== null ? Math.max(0, heightMm - totalDeduction) : null;

        cleaned.raamkozijn_breedte_mm = widthMm ?? null;
        cleaned.raamkozijn_hoogte_mm = heightMm ?? null;
        cleaned.glasmaat_breedte_mm = gW;
        cleaned.glasmaat_hoogte_mm = gH;
        cleaned.raamkozijn_positie = vak?.doorPosition ?? doorPosition;
        cleaned.raamkozijn_draairichting = vak?.doorSwing ?? doorSwing;
      } else if (widthMm !== null || heightMm !== null) {
        cleaned.vak_breedte_mm = widthMm ?? null;
        cleaned.vak_hoogte_mm = heightMm ?? null;
      }

      if (vak?.hasBorstwering !== undefined) cleaned.hasBorstwering = !!vak.hasBorstwering;
      if (vak?.borstweringHeight !== undefined && vak?.borstweringHeight !== null && vak?.borstweringHeight !== '') {
        const bh = parseDimToMm(vak.borstweringHeight);
        if (bh !== null) cleaned.borstweringHeight = bh;
      }

      if (cleaned.hasBorstwering && cleaned.borstweringHeight && heightMm !== null) {
        const bwHeight = Number(cleaned.borstweringHeight) || 0;
        if (bwHeight <= 0 || heightMm <= bwHeight) {
          delete cleaned.hasBorstwering;
          delete cleaned.borstweringHeight;
        } else {
          cleaned.borstweringHeight = bwHeight;
        }
      }

      return [cleaned];
    });
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

  const findBalklaagMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    let found: any = null;
    Object.values(materialenLijst).forEach((entry: any) => {
      if (!entry || !entry.material) return;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey;
      if (sectionKey === 'balklaag') found = entry.material;
    });
    return found;
  };

  const findDakpannenMaterial = (container: any) => {
    const materialenLijst = container?.materialen?.materialen_lijst || {};
    let found: any = null;
    Object.values(materialenLijst).forEach((entry: any) => {
      if (!entry || !entry.material) return;
      const sectionKey = entry.sectionKey || entry.material?.sectionKey;
      if (sectionKey === 'dakpannen' && !found) found = entry.material;
    });
    return found;
  };

  const applyCeilingBalkafstandDefault = (item: any, hasBalklaagMaterial: boolean) => {
    const isCeilingJob = jobSlug === 'plafond-houten-framework' || jobSlug === 'plafond-metalstud';
    if (!isCeilingJob || !hasBalklaagMaterial) return item;
    const current = item?.balkafstand;
    if (current === undefined || current === null || current === '') {
      return { ...item, balkafstand: 600 };
    }
    return item;
  };

  const applyVoorzetwandBalkafstandDefault = (item: any) => {
    const isVoorzetwand = jobSlug === 'hsb-voorzetwand' || jobSlug === 'metalstud-voorzetwand';
    if (!isVoorzetwand) return item;
    const current = item?.balkafstand;
    if (current === undefined || current === null || current === '') {
      return { ...item, balkafstand: 600 };
    }
    return item;
  };

  const applyGevelConstructieDefaults = (
    item: any,
    hasTengelMaterial: boolean,
    hasDaktrimMaterial: boolean = false
  ) => {
    if (!isGevelbekleding) return item;
    const next = { ...item };
    if (isGevelbekledingKeralit) {
      if (isEmptyValue(next.lengte) && !isEmptyValue(next.breedte)) {
        next.lengte = next.breedte;
      }
      if (!isEmptyValue(next.lengte)) {
        next.breedte = next.lengte;
      }
      if (isEmptyValue(next.keralit_panelen_afval_volgende_baan)) {
        next.keralit_panelen_afval_volgende_baan = false;
      }
    }
    if (isEmptyValue(next.startLattenFromBottom)) {
      next.startLattenFromBottom = true;
    }
    if (isEmptyValue(next.latten_orientation)) {
      next.latten_orientation = hasTengelMaterial ? 'horizontal' : 'vertical';
    }
    if (hasTengelMaterial) {
      if (isEmptyValue(next.tengelafstand)) {
        next.tengelafstand = 700;
      }
      if (isEmptyValue(next.tengel_orientation)) {
        next.tengel_orientation = 'vertical';
      }
      if (isEmptyValue(next.startTengelFromBottom)) {
        next.startTengelFromBottom = true;
      }
    }
    if (isGevelbekledingKeralit) {
      const profielState = resolveGevelProfielState(next, 'both');
      next.gevel_profiel_mode = profielState.mode;
      next.gevel_profiel_links = profielState.links;
      next.gevel_profiel_rechts = profielState.rechts;

      if (hasDaktrimMaterial) {
        const daktrimLengte = toPositiveNumber(next.lengte ?? next.breedte);
        if (daktrimLengte !== null) {
          next.daktrim_lengte = Math.round(daktrimLengte);
        } else if (isEmptyValue(next.daktrim_lengte)) {
          next.daktrim_lengte = '';
        }
      } else {
        delete next.daktrim_lengte;
      }
    } else {
      delete next.daktrim_lengte;
      delete next.keralit_panelen_afval_volgende_baan;
    }
    return next;
  };



  const syncVlizotrapOpening = (item: any, material: any) => {
    if (!showOpeningsSection) return item;
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
          const data = snap.data();
          const prefs = data.ui_preferences || {};
          setCollapsedSections(prev => ({ ...prev, ...prefs }));
          const md = data.measurement_defaults;
          if (md && typeof md === 'object') {
            setNadenDefaults(prev => ({
              behangklaar: {
                vullen: typeof md.naden_vullen_behangklaar === 'string' ? md.naden_vullen_behangklaar : prev.behangklaar.vullen,
                afwerken: typeof md.naden_afwerken_behangklaar === 'string' ? md.naden_afwerken_behangklaar : prev.behangklaar.afwerken,
              },
              schilderklaar: {
                vullen: typeof md.naden_vullen_schilderklaar === 'string' ? md.naden_vullen_schilderklaar : prev.schilderklaar.vullen,
                afwerken: typeof md.naden_afwerken_schilderklaar === 'string' ? md.naden_afwerken_schilderklaar : prev.schilderklaar.afwerken,
              },
            }));
          }
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
      setDakpanWerkendeMaten(null);

      try {
        const docRef = doc(firestore, 'quotes', quoteId);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          const container = data.klussen?.[klusId] || {};
          const materialenLijstInContainer = container?.materialen?.materialen_lijst || {};
          setMaterialenLijstSnapshot(materialenLijstInContainer);
          const hasNadenStucMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['gips_vuller', 'gips_finish'],
            ['voegenmiddel', 'finish pasta']
          );
          const hasLoodMaterialInContainer = hasMaterialInSnapshotBySection(materialenLijstInContainer, ['lood']);
          const hasDaktrimMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['daktrim', 'daktrim_hoeken'],
            ['daktrim']
          );
          const hasHwaMaterialInContainer = hasMaterialInSnapshotBySection(materialenLijstInContainer, ['hwa'], [' hwa', 'afvoer']);
          const hasHwaUitloopMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['hwa_uitloop'],
            ['stadsuitloop', 'uitloop']
          );
          const hasOvergangsprofielMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['profielen_overgang'],
            ['overgangsprofiel', 'overgangsprofielen']
          );
          const hasEindprofielMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['profielen_eind'],
            ['eindprofiel', 'eindprofielen']
          );
          const hasStofdorpelMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['stofdorpel'],
            ['stofdorpel', 'drempel', 'dorpel']
          );
          const hasDeklattenMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['deklatten'],
            ['deklat', 'deklatten']
          );
          const hasGevelTengelMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['tengelwerk_basis', 'tengelwerk', 'tengels'],
            ['tengel', 'ventilatielat']
          );
          const hasGevelDaktrimMaterialInContainer = hasMaterialInSnapshotBySection(
            materialenLijstInContainer,
            ['keralit_daktrim', 'daktrim'],
            ['daktrim']
          );
          const floorProfileCountFieldsInContainer: Array<{ fieldKey: string; enabled: boolean }> = [];
          if (jobSlug === 'massief-houten-vloer') {
            floorProfileCountFieldsInContainer.push(
              { fieldKey: 'deklatten_aantal', enabled: hasDeklattenMaterialInContainer },
              { fieldKey: 'profielen_overgang_aantal', enabled: hasOvergangsprofielMaterialInContainer },
              { fieldKey: 'profielen_eind_aantal', enabled: hasEindprofielMaterialInContainer },
              { fieldKey: 'stofdorpel_aantal', enabled: hasStofdorpelMaterialInContainer },
            );
          } else if (jobSlug === 'laminaat-pvc') {
            floorProfileCountFieldsInContainer.push(
              { fieldKey: 'profielen_overgang_aantal', enabled: hasOvergangsprofielMaterialInContainer },
              { fieldKey: 'profielen_eind_aantal', enabled: hasEindprofielMaterialInContainer },
              { fieldKey: 'stofdorpel_aantal', enabled: hasStofdorpelMaterialInContainer },
            );
          }
          const maatwerk = container.maatwerk;
          const vlizotrapMaterial = findVlizotrapMaterial(container);
          const kozijnhoutMaterial = isMaatwerkKozijn ? findKozijnhoutMaterial(container) : null;
          const tussenstijlMaterial = isMaatwerkKozijn ? findTussenstijlMaterial(container) : null;
          const balklaagMaterial = findBalklaagMaterial(container);
          const dakpannenMaterial = isHellendDak ? findDakpannenMaterial(container) : null;
          const dakpanMaten = isHellendDak ? resolveDakpanWerkendeMaten(dakpannenMaterial) : null;
          const kozijnhoutThickness = kozijnhoutMaterial ? parseDikteToMm(kozijnhoutMaterial?.dikte) : null;
          const tussenstijlThickness = tussenstijlMaterial ? parseDikteToMm(tussenstijlMaterial?.dikte) : null;
          setDakpanWerkendeMaten(dakpanMaten);
          if (isMaatwerkKozijn) {
            setKozijnhoutFrameThicknessMm(kozijnhoutThickness);
            setTussenstijlThicknessMm(tussenstijlThickness ?? kozijnhoutThickness);
            setHasTussenstijl(true);
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

              // Initialize/remove arrays based on job config
              const normalizedItem = sanitizeItemBySections(item);

              if (isEpdmDak) {
                if (hasHwaMaterialInContainer && isEmptyValue(normalizedItem.hwa_aantal)) {
                  normalizedItem.hwa_aantal = 1;
                }
                if (hasHwaUitloopMaterialInContainer && isEmptyValue(normalizedItem.hwa_uitloop_aantal)) {
                  normalizedItem.hwa_uitloop_aantal = 1;
                }
              }

              if (floorProfileCountFieldsInContainer.length > 0) {
                sanitizeOptionalCountFields(normalizedItem, floorProfileCountFieldsInContainer);
              }

              if (isGolfplaatDak) {
                // Persisted shape uses `breedte`, while the current form field key is `hoogte`.
                // Mirror into UI state so existing inputs keep showing the value.
                if (isEmptyValue(normalizedItem.hoogte) && !isEmptyValue(normalizedItem.breedte)) {
                  normalizedItem.hoogte = normalizedItem.breedte;
                }
                if (isEmptyValue(normalizedItem.tussenmuur) && !isEmptyValue(normalizedItem.tussenmuur_vanaf_links_maat)) {
                  normalizedItem.tussenmuur = normalizedItem.tussenmuur_vanaf_links_maat;
                }
              }


              // Data Migration for HSB Voorzetwand
              if (jobSlug === 'hsb-voorzetwand' || jobSlug === 'metalstud-voorzetwand') {

                // Move single objects to arrays if they exist
                if (normalizedItem.koof_lengte !== undefined && normalizedItem.koven.length === 0) {
                  normalizedItem.koven.push({
                    id: crypto.randomUUID(),
                    lengte: Number(normalizedItem.koof_lengte) || 0,
                    hoogte: Number(normalizedItem.koof_hoogte) || 0,
                    diepte: Number(normalizedItem.koof_diepte) || 0
                  });
                  delete normalizedItem.koof_lengte; delete normalizedItem.koof_hoogte; delete normalizedItem.koof_diepte;
                }

                if (normalizedItem.dagkant_diepte !== undefined && normalizedItem.dagkanten.length === 0) {
                  const firstOpening = normalizedItem.openings?.[0]?.id || null;
                  normalizedItem.dagkanten.push({
                    id: crypto.randomUUID(),
                    openingId: firstOpening,
                    diepte: Number(normalizedItem.dagkant_diepte) || 0
                  });
                  delete normalizedItem.dagkant_diepte; delete normalizedItem.dagkant_lengte;
                }

                if (normalizedItem.vensterbank_diepte !== undefined && normalizedItem.vensterbanken.length === 0) {
                  const firstOpening = normalizedItem.openings?.[0]?.id || null;
                  normalizedItem.vensterbanken.push({
                    id: crypto.randomUUID(),
                    openingId: firstOpening,
                    diepte: Number(normalizedItem.vensterbank_diepte) || 0,
                    uitstekLinks: 50,
                    uitstekRechts: 50
                  });
                  delete normalizedItem.vensterbank_diepte; delete normalizedItem.vensterbank_lengte;
                }
              }

              if (isMaatwerkKozijn) {
                const existingVakkenRaw = Array.isArray(normalizedItem.vakken) ? normalizedItem.vakken : [];
                const existingVakken = mergeLegacyBorstweringVakken(existingVakkenRaw);
                const migratedVakken: any[] = [];
                if (existingVakken.length > 0) {
                  migratedVakken.push(...existingVakken);
                } else {
                  // Check for legacy fields
                  if (normalizedItem.glas_breedte || normalizedItem.glas_hoogte) migratedVakken.push({ type: 'glas', breedte: normalizedItem.glas_breedte, hoogte: normalizedItem.glas_hoogte });
                  if (normalizedItem.paneel_breedte || normalizedItem.paneel_hoogte) migratedVakken.push({ type: 'paneel', breedte: normalizedItem.paneel_breedte, hoogte: normalizedItem.paneel_hoogte });
                  if (normalizedItem.open_breedte || normalizedItem.open_hoogte) migratedVakken.push({ type: 'open', breedte: normalizedItem.open_breedte, hoogte: normalizedItem.open_hoogte });

                  // Do not auto-generate vakken here; user adds them manually via "Vak toevoegen".
                }

                normalizedItem.vakken = migratedVakken.map((vak: any) => {
                  const rawType = String(vak.type || 'glas').toLowerCase();
                  const finalType = rawType || 'glas';
                  const doorPos = (finalType === 'deur')
                    ? (vak?.deur_positie ?? vak?.deur?.positie ?? vak?.door?.position ?? vak?.doorPosition ?? normalizedItem.doorPosition)
                    : undefined;
                  const doorSwing = (finalType === 'deur' || finalType === 'raamkozijn')
                    ? (vak?.deur_draairichting ?? vak?.deur?.draairichting ?? vak?.raamkozijn_draairichting ?? vak?.door?.swing ?? vak?.doorSwing ?? normalizedItem.doorSwing)
                    : undefined;
                  return {
                    id: vak.id || crypto.randomUUID(),
                    type: finalType,
                    breedte: (vak.breedte === '' ? undefined : (
                      vak?.glas_dagmaat_breedte_mm ??
                      vak?.glas?.dagmaat_breedte_mm ??
                      vak?.paneel_breedte_mm ??
                      vak?.open_breedte_mm ??
                      vak?.dagmaat?.breedte_mm ??
                      vak?.deur_breedte_mm ??
                      vak?.maat?.breedte_mm ??
                      vak?.vak_breedte_mm ??
                      vak?.raamkozijn_breedte_mm ??
                      vak?.opening?.breedte_mm ??
                      vak.breedte ?? vak.width
                    )),
                    hoogte: (vak.hoogte === '' ? undefined : (
                      vak?.glas_dagmaat_hoogte_mm ??
                      vak?.glas?.dagmaat_hoogte_mm ??
                      vak?.paneel_hoogte_mm ??
                      vak?.open_hoogte_mm ??
                      vak?.dagmaat?.hoogte_mm ??
                      vak?.deur_hoogte_mm ??
                      vak?.maat?.hoogte_mm ??
                      vak?.vak_hoogte_mm ??
                      vak?.raamkozijn_hoogte_mm ??
                      vak?.opening?.hoogte_mm ??
                      vak.hoogte ?? vak.height
                    )),
                    doorPosition: doorPos,
                    doorSwing: doorSwing,
                    hasBorstwering: vak?.hasBorstwering,
                    borstweringHeight: vak?.borstweringHeight
                  };
                });

                const existingStijlenRaw = Array.isArray(normalizedItem.tussenstijlen_posities)
                  ? normalizedItem.tussenstijlen_posities
                  : (Array.isArray(normalizedItem.tussenstijlen) ? normalizedItem.tussenstijlen : []);
                const existingStijlen = existingStijlenRaw
                  .map((v: any) => {
                    if (typeof v === 'object' && v !== null) {
                      return (v.positie_mm ?? v.positie) ?? (v.value ?? v.mm) ?? v.pos;
                    }
                    return v;
                  })
                  .map((v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? ''))))
                  .filter((v: any) => Number.isFinite(v));
                if (existingStijlen.length > 0) {
                  normalizedItem.tussenstijlen = existingStijlen;
                } else if (normalizedItem.tussenstijl_van_links) {
                  normalizedItem.tussenstijlen = [normalizedItem.tussenstijl_van_links];
                } else {
                  normalizedItem.tussenstijlen = [];
                }
              }

              return sanitizeItemBySections(normalizedItem);
            });
            const withVlizotrap = vlizotrapMaterial
              ? normalizedItems.map((item: any) => syncVlizotrapOpening(item, vlizotrapMaterial))
              : normalizedItems;
            const withBalkafstandDefaults = withVlizotrap.map((item: any) =>
              applyVoorzetwandBalkafstandDefault(applyCeilingBalkafstandDefault(item, !!balklaagMaterial))
            );
            const withGevelDefaults = withBalkafstandDefaults.map((item: any) =>
              applyGevelConstructieDefaults(item, hasGevelTengelMaterialInContainer, hasGevelDaktrimMaterialInContainer)
            );
            const withDakpanDefaults = withGevelDefaults.map((item: any) =>
              applyHellendDakDefaultsFromDakpan(item, dakpanMaten)
            );
            const withGolfplaatAuto = withDakpanDefaults.map((item: any) =>
              applyGolfplaatDakverdelingAuto(item)
            );
            setItems(withGolfplaatAuto);
          } else {
            const emptyItem = createEmptyItem({
              withNadenDefaults: hasNadenStucMaterialInContainer,
              epdmDefaults: {
                hasLoodMaterial: hasLoodMaterialInContainer,
                hasDaktrimMaterial: hasDaktrimMaterialInContainer,
                hasHwaMaterial: hasHwaMaterialInContainer,
                hasHwaUitloopMaterial: hasHwaUitloopMaterialInContainer,
              }
            });
            const withVlizotrap = vlizotrapMaterial
              ? syncVlizotrapOpening(emptyItem, vlizotrapMaterial)
              : emptyItem;
            const withBalkafstandDefaults = applyVoorzetwandBalkafstandDefault(
              applyCeilingBalkafstandDefault(withVlizotrap, !!balklaagMaterial)
            );
            const withGevelDefaults = applyGevelConstructieDefaults(
              withBalkafstandDefaults,
              hasGevelTengelMaterialInContainer,
              hasGevelDaktrimMaterialInContainer
            );
            const withDakpanDefaults = applyHellendDakDefaultsFromDakpan(withGevelDefaults, dakpanMaten);
            const withGolfplaatAuto = applyGolfplaatDakverdelingAuto(withDakpanDefaults);
            setItems([withGolfplaatAuto]);
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
        setDakpanWerkendeMaten(null);
        setMaterialenLijstSnapshot({});
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [quoteId, klusId, firestore, jobSlug]);

  const createEmptyItem = (options?: {
    withNadenDefaults?: boolean;
    epdmDefaults?: {
      hasLoodMaterial?: boolean;
      hasDaktrimMaterial?: boolean;
      hasHwaMaterial?: boolean;
      hasHwaUitloopMaterial?: boolean;
    };
  }) => {
    const newItem: Record<string, any> = {};
    fields.forEach(f => {
      newItem[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    });
    if (showKoofSection) newItem.koven = [];
    if (showDagkantSection) newItem.dagkanten = [];
    if (showVensterbankSection) newItem.vensterbanken = [];
    if (isMaatwerkKozijn) {
      newItem.vakken = [];
      newItem.tussenstijlen = [];
    }
    if (isNadenVullenJob) {
      const shouldSetNadenDefaults = options?.withNadenDefaults ?? hasNadenStucMaterialFromPreviousPage;
      const afwerkingDefault = 'schilderklaar';
      const afwerkingDefaults = nadenDefaults[afwerkingDefault];
      newItem.naden_vullen_verbruik_per_m2 = shouldSetNadenDefaults ? afwerkingDefaults.vullen : '';
      newItem.naden_afwerken_verbruik_per_m2 = shouldSetNadenDefaults ? afwerkingDefaults.afwerken : '';
      newItem.naden_vullen_afwerking = shouldSetNadenDefaults ? afwerkingDefault : '';
    }
    if (isEpdmDak) {
      newItem.edge_top = 'wall';
      newItem.edge_bottom = 'free';
      newItem.edge_left = 'free';
      newItem.edge_right = 'free';
      newItem.dakrand_breedte = 50;
      const hasLoodMaterial = options?.epdmDefaults?.hasLoodMaterial ?? hasLoodMaterialFromPreviousPage;
      const hasDaktrimMaterial = options?.epdmDefaults?.hasDaktrimMaterial ?? hasDaktrimMaterialFromPreviousPage;
      const hasHwaMaterial = options?.epdmDefaults?.hasHwaMaterial ?? hasHwaMaterialFromPreviousPage;
      const hasHwaUitloopMaterial = options?.epdmDefaults?.hasHwaUitloopMaterial ?? hasHwaUitloopMaterialFromPreviousPage;

      newItem.lood_top = hasLoodMaterial;
      newItem.lood_right = false;
      newItem.lood_bottom = false;
      newItem.lood_left = false;
      newItem.lood_gevelzijde = Boolean(newItem.lood_top || newItem.lood_right || newItem.lood_bottom || newItem.lood_left);

      newItem.daktrim_top = false;
      newItem.daktrim_right = hasDaktrimMaterial;
      newItem.daktrim_bottom = hasDaktrimMaterial;
      newItem.daktrim_left = hasDaktrimMaterial;

      newItem.dakgoot_top = false;
      newItem.dakgoot_right = false;
      newItem.dakgoot_bottom = false;
      newItem.dakgoot_left = false;

      if (hasHwaMaterial) newItem.hwa_aantal = 1;
      if (hasHwaUitloopMaterial) newItem.hwa_uitloop_aantal = 1;
    }
    const sanitized = sanitizeItemBySections(newItem);
    return applyHellendDakMultipliers(sanitized);
  };

  const addItem = () => {
    const withGevelDefaults = applyGevelConstructieDefaults(
      createEmptyItem(),
      hasGevelTengelMaterialFromPreviousPage,
      hasGevelDaktrimMaterialFromPreviousPage
    );
    const newItem = applyHellendDakDefaultsFromDakpan(withGevelDefaults, dakpanWerkendeMaten);
    setItems(prev => [...prev, newItem]);
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
      let newItem = { ...item, [key]: value };

      if (isGevelbekledingKeralit) {
        if (key === 'lengte') {
          newItem.breedte = value;
        } else if (key === 'breedte') {
          newItem.lengte = value;
        }
      }

      if (isEpdmDak && isEpdmEdgeField(key)) {
        const nextEpdmEdge = normalizeEpdmEdgeValue(value, epdmDefaultEdgeForKey(key));
        const side = key.replace('edge_', '') as 'top' | 'right' | 'bottom' | 'left';

        if (hasLoodMaterialFromPreviousPage) {
          newItem[`lood_${side}`] = nextEpdmEdge === 'wall';
        }
        if (hasDaktrimMaterialFromPreviousPage) {
          newItem[`daktrim_${side}`] = nextEpdmEdge === 'free';
        }
        if (hasDakgootMaterialFromPreviousPage && nextEpdmEdge !== 'free') {
          newItem[`dakgoot_${side}`] = false;
        }

        newItem.lood_gevelzijde = ['top', 'right', 'bottom', 'left'].some((s) => Boolean(newItem[`lood_${s}`]));
      }

      if (isEpdmDak && key.startsWith('lood_')) {
        const side = key.replace('lood_', '') as 'top' | 'right' | 'bottom' | 'left';
        const edgeKey = `edge_${side}` as 'edge_top' | 'edge_right' | 'edge_bottom' | 'edge_left';
        const edgeType = normalizeEpdmEdgeValue(newItem[edgeKey], epdmDefaultEdgeForKey(edgeKey));
        if (edgeType !== 'wall') {
          newItem[key] = false;
        }
        newItem.lood_gevelzijde = ['top', 'right', 'bottom', 'left'].some((s) => Boolean(newItem[`lood_${s}`]));
      }

      if (isEpdmDak && key.startsWith('daktrim_')) {
        const side = key.replace('daktrim_', '') as 'top' | 'right' | 'bottom' | 'left';
        const edgeKey = `edge_${side}` as 'edge_top' | 'edge_right' | 'edge_bottom' | 'edge_left';
        const edgeType = normalizeEpdmEdgeValue(newItem[edgeKey], epdmDefaultEdgeForKey(edgeKey));
        if (edgeType !== 'free') {
          newItem[key] = false;
        }
      }

      if (isEpdmDak && key.startsWith('dakgoot_')) {
        const side = key.replace('dakgoot_', '') as 'top' | 'right' | 'bottom' | 'left';
        const edgeKey = `edge_${side}` as 'edge_top' | 'edge_right' | 'edge_bottom' | 'edge_left';
        const edgeType = normalizeEpdmEdgeValue(newItem[edgeKey], epdmDefaultEdgeForKey(edgeKey));
        if (edgeType !== 'free') {
          newItem[key] = false;
        }
      }

      newItem = applyGolfplaatDakverdelingAuto(newItem, key);
      newItem = applyGevelConstructieDefaults(
        newItem,
        hasGevelTengelMaterialFromPreviousPage,
        hasGevelDaktrimMaterialFromPreviousPage
      );
      if (isHellendDak && ['aantal_pannen_breedte', 'aantal_pannen_hoogte', 'werkende_breedte_mm', 'werkende_hoogte_mm', 'halfLatafstandFromBottom'].includes(key)) {
        newItem = applyHellendDakAutoCalculations(newItem, { onlyWhenEmpty: false, syncLatafstand: true });
      }

      // Auto-switch naden verbruik when toggling afwerking
      if (isNadenVullenJob && key === 'naden_vullen_afwerking' && (value === 'behangklaar' || value === 'schilderklaar')) {
        const defaults = nadenDefaults[value as 'behangklaar' | 'schilderklaar'];
        newItem.naden_vullen_verbruik_per_m2 = defaults.vullen;
        newItem.naden_afwerken_verbruik_per_m2 = defaults.afwerken;
      }

      // Persist naden verbruik as new defaults in Firestore (per afwerking)
      if (isNadenVullenJob && (key === 'naden_vullen_verbruik_per_m2' || key === 'naden_afwerken_verbruik_per_m2')) {
        const trimmed = String(value ?? '').trim();
        const currentAfwerking = (newItem.naden_vullen_afwerking === 'behangklaar' || newItem.naden_vullen_afwerking === 'schilderklaar')
          ? newItem.naden_vullen_afwerking as 'behangklaar' | 'schilderklaar'
          : 'schilderklaar';
        if (trimmed.length > 0) {
          const isVullen = key === 'naden_vullen_verbruik_per_m2';
          setNadenDefaults(prev => ({
            ...prev,
            [currentAfwerking]: {
              ...prev[currentAfwerking],
              [isVullen ? 'vullen' : 'afwerken']: trimmed,
            },
          }));
          if (user && firestore) {
            const firestoreKey = isVullen ? `naden_vullen_${currentAfwerking}` : `naden_afwerken_${currentAfwerking}`;
            setDoc(doc(firestore, 'users', user.uid), {
              measurement_defaults: { [firestoreKey]: trimmed }
            }, { merge: true }).catch(err => console.error('Failed to save naden default:', err));
          }
        }
      }

      return applyHellendDakMultipliers(newItem);
    }));
  };

  const updateKeralitGevelProfielMode = (index: number, mode: GevelProfielMode) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const current = resolveGevelProfielState(item, 'both');
      if (mode === 'hoek') {
        return applyGevelProfielStateToItem(item, { mode: 'hoek', links: 'hoek', rechts: 'hoek' });
      }
      if (mode === 'eind') {
        return applyGevelProfielStateToItem(item, { mode: 'eind', links: 'eind', rechts: 'eind' });
      }
      const links = current.mode === 'both' ? current.links : 'hoek';
      const rechts = links === 'hoek' ? 'eind' : 'hoek';
      return applyGevelProfielStateToItem(item, { mode: 'both', links, rechts });
    }));
  };

  const updateKeralitGevelProfielSide = (
    index: number,
    side: 'links' | 'rechts',
    value: GevelProfielSideType
  ) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const opposite: GevelProfielSideType = value === 'hoek' ? 'eind' : 'hoek';
      const state: GevelProfielState = side === 'links'
        ? { mode: 'both', links: value, rechts: opposite }
        : { mode: 'both', links: opposite, rechts: value };
      return applyGevelProfielStateToItem(item, state);
    }));
  };

  const renderKeralitGevelProfielSection = (item: Record<string, any>, index: number) => {
    if (jobSlug !== 'gevelbekleding-keralit') return null;

    const profielState = resolveGevelProfielState(item, 'both');
    const profielSectionKey = `gevel-profiel-${index}`;
    const isCollapsed = collapsedSections[profielSectionKey] !== false;
    const isReady = hasGevelProfielDimensionsReady(item);
    const sideToggleButtonClass = "flex-1 text-xs py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    const summary = profielState.mode === 'both'
      ? `Links ${formatGevelProfielLabel(profielState.links)} • Rechts ${formatGevelProfielLabel(profielState.rechts)}`
      : `${formatGevelProfielLabel(profielState.links)} beide zijden`;

    const modeButtonClass = (
      active: boolean,
      tone: 'hoek' | 'eind' | 'both'
    ) => cn(
      "text-xs py-1.5 rounded transition-colors border",
      active
        ? tone === 'hoek'
          ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
          : tone === 'eind'
            ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        : "bg-black/20 text-zinc-400 border-white/10 hover:text-zinc-200"
    );

    return (
      <div className={cn("mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden", !isReady && "opacity-80")}>
        <div
          className={cn(
            "px-4 py-3 flex items-center justify-between select-none transition-colors",
            isReady ? "cursor-pointer hover:bg-white/5" : "cursor-not-allowed"
          )}
          onClick={() => {
            if (!isReady) return;
            toggleCollapsed(profielSectionKey);
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-200">Hoek/Eind profiel</span>
            {isCollapsed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                {summary}
              </span>
            )}
          </div>
          <div className="text-zinc-500">
            {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {!isReady && (
          <div className="px-4 pb-4 pt-0">
            <div className="pt-2 border-t border-white/5">
              <p className="text-[11px] text-zinc-500">Vul eerst de afmetingen in om dit te activeren.</p>
            </div>
          </div>
        )}

        {isReady && !isCollapsed && (
          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
            <div className="pt-2 border-t border-white/5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-zinc-500 tracking-wider">Profiel type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={modeButtonClass(profielState.mode === 'hoek', 'hoek')}
                    onClick={() => updateKeralitGevelProfielMode(index, 'hoek')}
                    disabled={disabledAll}
                  >
                    Hoekprofiel
                  </button>
                  <button
                    type="button"
                    className={modeButtonClass(profielState.mode === 'eind', 'eind')}
                    onClick={() => updateKeralitGevelProfielMode(index, 'eind')}
                    disabled={disabledAll}
                  >
                    Eindprofiel
                  </button>
                  <button
                    type="button"
                    className={modeButtonClass(profielState.mode === 'both', 'both')}
                    onClick={() => updateKeralitGevelProfielMode(index, 'both')}
                    disabled={disabledAll}
                  >
                    Beide
                  </button>
                </div>
              </div>

              {profielState.mode === 'both' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Links</Label>
                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => updateKeralitGevelProfielSide(index, 'links', 'hoek')}
                        disabled={disabledAll}
                        className={cn(
                          sideToggleButtonClass,
                          profielState.links === 'hoek'
                            ? "bg-orange-500/20 text-orange-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Hoek
                      </button>
                      <button
                        type="button"
                        onClick={() => updateKeralitGevelProfielSide(index, 'links', 'eind')}
                        disabled={disabledAll}
                        className={cn(
                          sideToggleButtonClass,
                          profielState.links === 'eind'
                            ? "bg-sky-500/20 text-sky-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Eind
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Rechts</Label>
                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => updateKeralitGevelProfielSide(index, 'rechts', 'hoek')}
                        disabled={disabledAll}
                        className={cn(
                          sideToggleButtonClass,
                          profielState.rechts === 'hoek'
                            ? "bg-orange-500/20 text-orange-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Hoek
                      </button>
                      <button
                        type="button"
                        onClick={() => updateKeralitGevelProfielSide(index, 'rechts', 'eind')}
                        disabled={disabledAll}
                        className={cn(
                          sideToggleButtonClass,
                          profielState.rechts === 'eind'
                            ? "bg-sky-500/20 text-sky-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Eind
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKeralitPanelenSection = (item: Record<string, any>, index: number) => {
    if (!isGevelbekledingKeralit) return null;

    const sectionKey = `keralit-panelen-${index}`;
    const isCollapsed = collapsedSections[sectionKey] !== false;
    const isReady = hasGevelProfielDimensionsReady(item);
    const gebruikAfvalVolgendeBaan = Boolean(item.keralit_panelen_afval_volgende_baan);
    const summary = gebruikAfvalVolgendeBaan
      ? 'Afval volgende baan: Aan'
      : 'Naadloos per baan: Aan';

    return (
      <div className={cn("mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden", !isReady && "opacity-80")}>
        <div
          className={cn(
            "px-4 py-3 flex items-center justify-between select-none transition-colors",
            isReady ? "cursor-pointer hover:bg-white/5" : "cursor-not-allowed"
          )}
          onClick={() => {
            if (!isReady) return;
            toggleCollapsed(sectionKey);
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-200">Keralit panelen</span>
            {isCollapsed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                {summary}
              </span>
            )}
          </div>
          <div className="text-zinc-500">
            {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {!isReady && (
          <div className="px-4 pb-4 pt-0">
            <div className="pt-2 border-t border-white/5">
              <p className="text-[11px] text-zinc-500">Vul eerst de afmetingen in om dit te activeren.</p>
            </div>
          </div>
        )}

        {isReady && !isCollapsed && (
          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
            <div className="pt-2 border-t border-white/5 space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-200">Afval gebruiken volgende baan</p>
                  <p className="text-[11px] text-zinc-500">Aan: restlengtes worden doorgezet naar de volgende baan.</p>
                </div>
                <Switch
                  checked={gebruikAfvalVolgendeBaan}
                  onCheckedChange={(checked) => updateItem(index, 'keralit_panelen_afval_volgende_baan', checked)}
                  disabled={disabledAll}
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                {gebruikAfvalVolgendeBaan
                  ? 'Doorlopende baanberekening met hergebruik van restlengtes.'
                  : 'Naadloos per baan: elke baan start met een volledige planklengte.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKeralitDaktrimSection = (item: Record<string, any>, index: number) => {
    if (!isGevelbekledingKeralit || !hasGevelDaktrimMaterialFromPreviousPage) return null;

    const sectionKey = `keralit-daktrim-${index}`;
    const isCollapsed = collapsedSections[sectionKey] !== false;
    const daktrimLengte = toPositiveNumber(item.daktrim_lengte ?? item.lengte ?? item.breedte);
    const summary = daktrimLengte !== null ? `${Math.round(daktrimLengte)}mm` : 'Niet ingevuld';
    const displayLength = daktrimLengte !== null ? String(Math.round(daktrimLengte)) : '';

    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
          onClick={() => toggleCollapsed(sectionKey)}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-200">Daktrim</span>
            {isCollapsed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                {summary}
              </span>
            )}
          </div>
          <div className="text-zinc-500">
            {isCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {!isCollapsed && (
          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
            <div className="pt-2 border-t border-white/5 space-y-2">
              <Label className="text-xs">Lengte</Label>
              <div className="relative">
                <Input
                  type="number"
                  className="bg-black/20 border-white/10 h-9 text-sm pr-10"
                  value={displayLength}
                  readOnly
                  disabled={disabledAll}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">mm</span>
              </div>
              <p className="text-[11px] text-zinc-500">Automatisch gevuld vanuit breedte.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTrespaNaadSection = (index: number) => {
    const isTrespa = jobSlug.toLowerCase().includes('trespa');
    const isRockpanel = jobSlug.toLowerCase().includes('rockpanel');
    if (!isTrespa && !isRockpanel) return null;

    const fieldKey = isTrespa ? 'trespa_seam_thickness' : 'rockpanel_seam_thickness';
    const label = isTrespa ? 'Trespa naad dikte' : 'Rockpanel naad dikte';
    const currentValue = userData?.[fieldKey] ?? 8;

    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
          onClick={() => toggleCollapsed(`trespa-${index}`)}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-200">{label}</span>
            {collapsedSections[`trespa-${index}`] !== false && currentValue > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                {currentValue}mm
              </span>
            )}
          </div>
          <div className="text-zinc-500">
            {collapsedSections[`trespa-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {collapsedSections[`trespa-${index}`] === false && (
          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
            <div className="pt-2 border-t border-white/5 space-y-2">
              <Label className="text-xs uppercase text-zinc-500 tracking-wider">Naad dikte</Label>
              <div className="relative">
                <Input
                  type="number"
                  className="bg-black/20 border-white/10 h-9 text-sm pr-8"
                  value={currentValue}
                  placeholder="8"
                  onChange={(e) => {
                    if (userDocRef) {
                      updateDoc(userDocRef, { [fieldKey]: Number(e.target.value) }).catch(console.error);
                    }
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">mm</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const createVak = (type: string) => ({
    id: crypto.randomUUID(),
    type,
    breedte: undefined,
    hoogte: undefined
  });

  const getDoorVakInfo = (item: any) => {
    const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
    const vakken = Array.isArray(item?.vakken) ? item.vakken : [];
    const idx = vakken.findIndex((v: any) => String(v?.type || '').toLowerCase() === 'deur');
    const fallbackWidth = num(item?.deur_breedte ?? item?.doorWidth ?? item?.door_breedte);
    const fallbackHeight = num(item?.deur_hoogte ?? item?.doorHeight ?? item?.door_hoogte);
    if (idx === -1) {
      return { index: -1, width: fallbackWidth, height: fallbackHeight };
    }
    const v = vakken[idx];
    const width = num(v?.breedte ?? v?.width ?? v?.deur_breedte_mm ?? fallbackWidth);
    const height = num(v?.hoogte ?? v?.height ?? v?.deur_hoogte_mm ?? fallbackHeight);
    return {
      index: idx,
      width,
      height
    };
  };

  const updateVak = (itemIdx: number, vakIdx: number, updates: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const vakken = Array.isArray(item.vakken) ? item.vakken : [];
      const next = vakken.map((vak: any, idx: number) => idx === vakIdx ? { ...vak, ...updates } : vak);
      return { ...item, vakken: next };
    }));
  };

  const addVak = (itemIdx: number) => {
    const defaultType = 'glas';
    const newVak = createVak(defaultType);
    setManualVakkenOverride(prev => ({ ...prev, [itemIdx]: true }));

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
    const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));
    const doorInfo = getDoorVakInfo(item);
    const doorWidthMm = doorInfo.width;
    const doorHeightMm = doorInfo.height;
    const hasDoor = doorHeightMm > 0;

    // Calculate columns
    const rawPositions = Array.isArray(item.tussenstijlen) ? item.tussenstijlen.map(num).filter((v: number) => v > 0) : [];
    const layoutDoorLeft = true;
    const autoDoorPos = (hasDoor && hasTussenstijl && doorWidthMm > 0 && doorWidthMm < innerWidthMm)
      ? (layoutDoorLeft ? doorWidthMm : Math.max(0, innerWidthMm - doorWidthMm - tussenstijlMm))
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

    const nonDoorVakken = Array.isArray(item.vakken)
      ? item.vakken.filter((v: any) => String(v?.type || '').toLowerCase() !== 'deur')
      : [];

    if (!hasDoor) {
      // Without door: one base row
      let expected = colCount;
      const rowEntries = nonDoorVakken.slice(0, colCount);
      const explicitHeights = rowEntries.map((v: any) => num(v?.hoogte)).filter((v: any) => v > 0);
      if (explicitHeights.length > 0) {
        const rowHeight = Math.min(...explicitHeights);
        const leftover = innerHeightMm - rowHeight;
        if (leftover > frameMm) expected += colCount;
      }
      return expected;
    }

    // With door: door row (colCount - 1 vakken) + bottom row (colCount vakken)
    const doorRowVakken = Math.max(0, colCount - 1);

    // Check if there's a bottom row
    const horizontalBarHeight = (doorHeightMm + frameMm) < innerHeightMm ? frameMm : 0;
    const bottomRowHeight = Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight);
    const hasBottomRow = bottomRowHeight > 0;
    let expected = doorRowVakken + (hasBottomRow ? colCount : 0);
    if (hasBottomRow) {
      const rowEntries = nonDoorVakken.slice(doorRowVakken, doorRowVakken + colCount);
      const explicitHeights = rowEntries.map((v: any) => num(v?.hoogte)).filter((v: any) => v > 0);
      if (explicitHeights.length > 0) {
        const rowHeight = Math.min(...explicitHeights);
        const leftover = bottomRowHeight - rowHeight;
        if (leftover > frameMm) expected += colCount;
      }
    }
    return expected;
  };

  // Auto-sync vakken to match layout (always keep vak cards aligned with drawing)
  useEffect(() => {
    if (!isMaatwerkKozijn || loading) return;

    setItems(prev => {
      let changed = false;
      const next = prev.map((item, itemIdx) => {
        if (manualVakkenOverride[itemIdx]) return item;
        const expected = calculateExpectedVakkenCount(item);
        const vakken = Array.isArray(item.vakken) ? [...item.vakken] : [];
        const isDoor = (v: any) => String(v?.type || '').toLowerCase() === 'deur';
        const nonDoor = vakken.filter(v => !isDoor(v));

        if (expected > nonDoor.length) {
          const toAdd = expected - nonDoor.length;
          const defaultType = 'glas';
          const newVakken = Array.from({ length: toAdd }, () => createVak(defaultType));
          // append new non-door vakken at end
          vakken.push(...newVakken);
          changed = true;
        }

        if (!changed) return item;
        return { ...item, vakken };
      });
      return changed ? next : prev;
    });
  }, [
    items.map((item, idx) => `${idx}-${item.breedte}-${item.hoogte}-${item.doorPosition}-${JSON.stringify(item.tussenstijlen)}-${JSON.stringify(item.vakken?.map((v: any) => v?.hoogte))}`).join(','),
    isMaatwerkKozijn,
    loading,
    hasTussenstijl,
    manualVakkenOverride,
    kozijnhoutFrameThicknessMm,
    tussenstijlThicknessMm
  ]);

  const removeVak = (itemIdx: number, vakIdx: number) => {
    setManualVakkenOverride(prev => ({ ...prev, [itemIdx]: true }));
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
    if (type === 'deur') return 'Deur';
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

  const handleSwapDimensions = (index: number, key1: string, key2: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [key1]: item[key2], [key2]: item[key1] };
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

  const onAddKoof = (itemIdx: number) => {
    const newKoof = { id: crypto.randomUUID(), lengte: '', hoogte: '', diepte: '' };
    const currentKofen = items[itemIdx].koven || [];
    updateItem(itemIdx, 'koven', [...currentKofen, newKoof]);
  };

  const onDeleteKoof = (itemIdx: number, id: string) => {
    const currentKofen = items[itemIdx].koven || [];
    updateItem(itemIdx, 'koven', currentKofen.filter((k: any) => k.id !== id));
  };

  const onUpdateKoof = (itemIdx: number, id: string, updates: any) => {
    const currentKofen = items[itemIdx].koven || [];
    updateItem(itemIdx, 'koven', currentKofen.map((k: any) => k.id === id ? { ...k, ...updates } : k));
  };

  const buildBoeiboordPanelen = (item: any) => {
    const toNum = (value: any) => {
      const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const lengteVoorzijde = toNum(item.lengte);
    const hoogteVoorzijde = toNum(item.hoogte);
    const lengteOnderzijde = toNum(item.lengte_onderzijde);
    const breedteOnderzijde = toNum(item.breedte);
    const mirrorCount = item.boeiboord_mirror ? 2 : 1;
    const boeiAngleDeg = toNum(item.boeiboord_angle);
    const boeiAngleRad = (boeiAngleDeg * Math.PI) / 180;
    const langeKant = Math.round((lengteVoorzijde + (hoogteVoorzijde * Math.tan(boeiAngleRad))) || 0);
    const korteKant = Math.round(lengteVoorzijde || 0);

    const panelen: Array<{
      id: string;
      zijde: 'voorzijde' | 'onderzijde';
      lengte: number;
      hoogte?: number;
      breedte?: number;
      label: string;
      measurements?: Array<{ label: string; waarde?: number; tekst?: string }>;
    }> = [];

    if (lengteVoorzijde > 0 && hoogteVoorzijde > 0) {
      for (let i = 0; i < mirrorCount; i += 1) {
        panelen.push({
          id: crypto.randomUUID(),
          zijde: 'voorzijde',
          lengte: lengteVoorzijde,
          hoogte: hoogteVoorzijde,
          label: `Voorzijde ${i + 1}`,
          measurements: [
            ...(langeKant > 0 ? [{ label: 'Lange kant', waarde: langeKant }] : []),
            ...(korteKant > 0 ? [{ label: 'Korte kant', waarde: korteKant }] : []),
            ...(boeiAngleDeg > 0 ? [{ label: 'Extra info', tekst: `1 kopkant schuin ${boeiAngleDeg} graden` }] : []),
          ],
        });
      }
    }

    if (lengteOnderzijde > 0 && breedteOnderzijde > 0) {
      for (let i = 0; i < mirrorCount; i += 1) {
        panelen.push({
          id: crypto.randomUUID(),
          zijde: 'onderzijde',
          lengte: lengteOnderzijde,
          breedte: breedteOnderzijde,
          label: mirrorCount > 1 ? `Onderzijde ${i + 1}` : 'Onderzijde',
        });
      }
    }

    return panelen;
  };

  const buildBoeiboordLattenSamenvatting = (item: any) => {
    const calc = item?.calculatedData;
    if (!calc) return null;

    const orientation = item?.latten_orientation === 'vertical' ? 'vertical' : 'horizontal';
    const mirrorMultiplier = item?.boeiboord_mirror ? 2 : 1;

    const toNum = (value: any) => {
      const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const formatMeters = (mm: number) => {
      const meters = mm / 1000;
      const rounded = Number.isFinite(meters) ? Number(meters.toFixed(2)) : 0;
      return `${rounded}m`;
    };

    const buildSummaryForSide = (sideKey: 'voorzijde' | 'onderzijde') => {
      const sideData = calc?.[sideKey];
      const latten = Array.isArray(sideData?.latten) ? sideData.latten : [];
      const map = new Map<number, number>();

      latten.forEach((lat: any) => {
        const w = toNum(lat?.wMm ?? lat?.w);
        const h = toNum(lat?.hMm ?? lat?.h);
        if (w <= 0 || h <= 0) return;

        const isHorizontal = w >= h;
        if (orientation === 'horizontal' && !isHorizontal) return;
        if (orientation === 'vertical' && isHorizontal) return;

        const lengthMm = orientation === 'horizontal' ? w : h;
        if (lengthMm <= 0) return;
        map.set(lengthMm, (map.get(lengthMm) ?? 0) + 1);
      });

      const items = Array.from(map.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([lengthMm, count]) => ({
          lengte_mm: lengthMm,
          aantal: count * mirrorMultiplier,
        }));

      const label = items.length > 0
        ? `Latten; ${items.map(i => `${i.aantal}x ${formatMeters(i.lengte_mm)}`).join(' + ')}`
        : undefined;

      if (items.length === 0) return null;
      return { zijde: sideKey, items, label };
    };

    const perZijde = [
      buildSummaryForSide('voorzijde'),
      buildSummaryForSide('onderzijde'),
    ].filter(Boolean) as Array<{ zijde: string; items: Array<{ lengte_mm: number; aantal: number }>; label?: string }>;

    const totalMap = new Map<number, number>();
    perZijde.forEach(side => {
      side.items.forEach(item => {
        totalMap.set(item.lengte_mm, (totalMap.get(item.lengte_mm) ?? 0) + item.aantal);
      });
    });

    const totaalItems = Array.from(totalMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([lengthMm, count]) => ({ lengte_mm: lengthMm, aantal: count }));

    const totaalLabel = totaalItems.length > 0
      ? `Latten; ${totaalItems.map(i => `${i.aantal}x ${formatMeters(i.lengte_mm)}`).join(' + ')}`
      : undefined;

    return {
      per_zijde: perZijde,
      totaal: { items: totaalItems, label: totaalLabel },
    };
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firestore || !jobConfig) return;

    const hasValue = (val: unknown) => val !== undefined && val !== null && String(val).trim() !== '';
    const isEitherOrHellendDakField = (fieldKey: string) =>
      isHellendDak && ['aantal_pannen_breedte', 'aantal_pannen_hoogte', 'lengte', 'hoogte'].includes(fieldKey);

    const hasEmptyFields = items.some(item =>
      fields.some(f => {
        if (f.type !== 'number' || f.optional) return false;
        if (isEitherOrHellendDakField(f.key)) return false;
        return !hasValue(item[f.key]);
      })
    );

    const hasInvalidHellendDakEitherOr = isHellendDak && items.some(item => {
      const hasPannenMaten = hasValue(item.aantal_pannen_breedte) && hasValue(item.aantal_pannen_hoogte);
      const hasMmMaten = hasValue(item.lengte) && hasValue(item.hoogte);
      return !hasPannenMaten && !hasMmMaten;
    });

    if (hasEmptyFields || hasInvalidHellendDakEitherOr) {
      toast({
        variant: "destructive",
        title: "Ontbrekende gegevens",
        description: hasInvalidHellendDakEitherOr
          ? "Vul óf beide pannen-aantallen in, óf zowel Lengte als Breedte."
          : "Vul a.u.b. alle verplichte velden in."
      });
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
          const processed = { ...item };

          // Specific handling for Maatwerk Kozijnen
          if (isMaatwerkKozijn) {
            // Ensure arrays are initialized so they are saved (even if empty)
            if (!processed.vakken) processed.vakken = [];
            if (!processed.tussenstijlen) processed.tussenstijlen = [];

            // Ensure numeric fields are stored as numbers
            if (processed.breedte) processed.breedte = Number(processed.breedte);
            if (processed.hoogte) processed.hoogte = Number(processed.hoogte);
            if (processed.deur_breedte) processed.deur_breedte = Number(processed.deur_breedte);
            if (processed.deur_hoogte) processed.deur_hoogte = Number(processed.deur_hoogte);

            // Normalize tussenstijlen values
            if (Array.isArray(processed.tussenstijlen)) {
              processed.tussenstijlen = processed.tussenstijlen
                .map((v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? ''))))
                .filter((v: any) => Number.isFinite(v));
            }

            // Enrich vakken with extra calculation data (dagmaat, glasmaat, etc.)
            processed.vakken = enrichVakkenForSave(processed);

            // Replace tussenstijlen with lengths/counts (position is not relevant for materials)
            const tussenstijlPosities = Array.isArray(processed.tussenstijlen) ? processed.tussenstijlen : [];
            processed.tussenstijlen_posities = tussenstijlPosities;
            processed.tussenstijlen = buildTussenstijlenForSave(processed);
            const stijlen = buildStijlenForSave(processed);
            if (stijlen) processed.stijlen = stijlen;
          }

          if (isGevelbekledingKeralit) {
            if (isEmptyValue(processed.lengte) && !isEmptyValue(processed.breedte)) {
              processed.lengte = processed.breedte;
            }
            if (!isEmptyValue(processed.lengte)) {
              processed.breedte = processed.lengte;
            }
            if (!isEmptyValue(processed.lengte)) {
              processed.lengte = Number(processed.lengte);
            }
            if (!isEmptyValue(processed.breedte)) {
              processed.breedte = Number(processed.breedte);
            }
            if (!isEmptyValue(processed.hoogte)) {
              processed.hoogte = Number(processed.hoogte);
            }

            processed.keralit_panelen_afval_volgende_baan = Boolean(processed.keralit_panelen_afval_volgende_baan);

            if (hasGevelDaktrimMaterialFromPreviousPage) {
              const daktrimLengte = toPositiveNumber(processed.lengte ?? processed.breedte);
              if (daktrimLengte !== null) {
                processed.daktrim_lengte = Math.round(daktrimLengte);
              } else {
                delete processed.daktrim_lengte;
              }
            } else {
              delete processed.daktrim_lengte;
            }
          }

          if (isBoeiboord) {
            const isTrespa = jobSlug.toLowerCase().includes('trespa');
            const isRockpanel = jobSlug.toLowerCase().includes('rockpanel');
            const seamThickness = isTrespa
              ? (userData?.trespa_seam_thickness ?? 8)
              : (isRockpanel ? (userData?.rockpanel_seam_thickness ?? 8) : 8);

            processed.boeiboord_panelen = buildBoeiboordPanelen(processed);
            processed.boeiboord_aantallen = {
              voorzijde: processed.boeiboord_mirror ? 2 : 1,
              onderzijde: processed.boeiboord_mirror ? 2 : 1,
            };
            processed['naad dikte tussen 2 platen kopkant'] = seamThickness;
            processed.latten_samenvatting = buildBoeiboordLattenSamenvatting(processed);
            processed.voorzijde_latafstand = processed.latafstand;
            delete processed.calculatedData;
            delete processed.boeiboord_orientation;
            delete processed.boeiboord_mirror;
            delete processed.boeiboord_angle;
            delete processed.lengte;
            delete processed.hoogte;
            delete processed.lengte_onderzijde;
            delete processed.breedte;
            delete processed.latafstand;

            if (!processed.kopkanten) {
              delete processed.kopkant_breedte;
              delete processed.kopkant_hoogte;
              delete processed.kopkanten;
            }
          }

          if (isHellendDak) {
            processed.hellend_dak_multipliers = buildHellendDakMultipliers(processed.hellend_dak_mirror === true);
          }

          if (isEpdmDak) {
            const allSides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
            const edgeBySide: Record<'top' | 'right' | 'bottom' | 'left', 'free' | 'wall'> = {
              top: normalizeEpdmEdgeValue(processed.edge_top, 'wall'),
              right: normalizeEpdmEdgeValue(processed.edge_right, 'free'),
              bottom: normalizeEpdmEdgeValue(processed.edge_bottom, 'free'),
              left: normalizeEpdmEdgeValue(processed.edge_left, 'free'),
            };

            processed.dakrand_breedte = 50;

            if (hasLoodMaterialFromPreviousPage) {
              allSides.forEach((side) => {
                const key = `lood_${side}`;
                processed[key] = edgeBySide[side] === 'wall' ? Boolean(processed[key]) : false;
              });
              processed.lood_gevelzijde = allSides.some((side) => Boolean(processed[`lood_${side}`]));
            } else {
              allSides.forEach((side) => delete processed[`lood_${side}`]);
              delete processed.lood_gevelzijde;
            }

            if (hasDaktrimMaterialFromPreviousPage) {
              allSides.forEach((side) => {
                const key = `daktrim_${side}`;
                processed[key] = edgeBySide[side] === 'free' ? Boolean(processed[key]) : false;
              });
            } else {
              allSides.forEach((side) => delete processed[`daktrim_${side}`]);
            }

            if (hasDakgootMaterialFromPreviousPage) {
              allSides.forEach((side) => {
                const key = `dakgoot_${side}`;
                processed[key] = edgeBySide[side] === 'free' ? Boolean(processed[key]) : false;
              });
            } else {
              allSides.forEach((side) => delete processed[`dakgoot_${side}`]);
            }

            if (hasHwaMaterialFromPreviousPage) {
              const hwaAantal = toNonNegativeIntOrNull(processed.hwa_aantal);
              if (hwaAantal === null) delete processed.hwa_aantal;
              else processed.hwa_aantal = hwaAantal;
            } else {
              delete processed.hwa_aantal;
            }

            if (hasHwaUitloopMaterialFromPreviousPage) {
              const hwaUitloopAantal = toNonNegativeIntOrNull(processed.hwa_uitloop_aantal);
              if (hwaUitloopAantal === null) delete processed.hwa_uitloop_aantal;
              else processed.hwa_uitloop_aantal = hwaUitloopAantal;
            } else {
              delete processed.hwa_uitloop_aantal;
            }

            const parseMm = (value: any): number => {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
              return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
            };
            const lengteMm = parseMm(processed.lengte);
            const hoogteMm = parseMm(processed.hoogte);
            const sideLengthMm: Record<'top' | 'right' | 'bottom' | 'left', number> = {
              top: lengteMm,
              right: hoogteMm,
              bottom: lengteMm,
              left: hoogteMm,
            };
            const sideDirection: Record<'top' | 'right' | 'bottom' | 'left', string> = {
              top: 'noord',
              right: 'oost',
              bottom: 'zuid',
              left: 'west',
            };
            const sideLabel: Record<'top' | 'right' | 'bottom' | 'left', string> = {
              top: 'boven',
              right: 'rechts',
              bottom: 'onder',
              left: 'links',
            };

            const randen = allSides.map((side) => {
              const lengthMm = sideLengthMm[side];
              const lengthM1 = Number((lengthMm / 1000).toFixed(3));
              return {
                side,
                richting: sideDirection[side],
                positie: sideLabel[side],
                type: edgeBySide[side],
                lengte_mm: lengthMm,
                lengte_m1: lengthM1,
                lood: Boolean(processed[`lood_${side}`]),
                daktrim: Boolean(processed[`daktrim_${side}`]),
                dakgoot: Boolean(processed[`dakgoot_${side}`]),
              };
            });
            const vrijeRanden = randen.filter((r) => r.type === 'free');
            const gevelRanden = randen.filter((r) => r.type === 'wall');
            const daktrimRanden = randen.filter((r) => r.daktrim);
            const loodRanden = randen.filter((r) => r.lood);
            const dakgootRanden = randen.filter((r) => r.dakgoot);

            const daktrimHoekenAuto =
              (Boolean(processed.daktrim_top) && Boolean(processed.daktrim_right) ? 1 : 0)
              + (Boolean(processed.daktrim_right) && Boolean(processed.daktrim_bottom) ? 1 : 0)
              + (Boolean(processed.daktrim_bottom) && Boolean(processed.daktrim_left) ? 1 : 0)
              + (Boolean(processed.daktrim_left) && Boolean(processed.daktrim_top) ? 1 : 0);

            processed.epdm_randen = randen;
            processed.epdm_randen_summary = {
              vrije_randen_m1: Number(vrijeRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
              gevel_randen_m1: Number(gevelRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
              daktrim_randen_m1: Number(daktrimRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
              lood_randen_m1: Number(loodRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
              dakgoot_randen_m1: Number(dakgootRanden.reduce((sum, row) => sum + row.lengte_m1, 0).toFixed(3)),
              daktrim_hoeken_auto: daktrimHoekenAuto,
              vrije_randen_detail: vrijeRanden.map((row) => `${row.richting}:${row.lengte_m1}m`),
              gevel_randen_detail: gevelRanden.map((row) => `${row.richting}:${row.lengte_m1}m`),
            };
          }

          if (isGolfplaatDak) {
            // Persist explicit boolean so backend/payload never sees "missing" when toggle was not touched.
            processed.includeTopBottomGording = Boolean(processed.includeTopBottomGording);
            // Current golfplaat gording layout is horizontal over the width.
            processed.gording_in_breedte = 'horizontaal';
            if (isEmptyValue(processed.breedte) && !isEmptyValue(processed.hoogte)) {
              processed.breedte = processed.hoogte;
            }
            if (isEmptyValue(processed.tussenmuur_vanaf_links_maat) && !isEmptyValue(processed.tussenmuur)) {
              processed.tussenmuur_vanaf_links_maat = processed.tussenmuur;
            }
            delete processed.hoogte;
            delete processed.tussenmuur;
            delete processed.aantal_daken;
            const gordingLengte = buildGolfplaatGordingLengte(processed);
            if (gordingLengte) processed.gording_lengte = gordingLengte;
            else delete processed.gording_lengte;
          }

          if (jobSlug === 'laminaat-pvc' || jobSlug === 'massief-houten-vloer') {
            sanitizeOptionalCountFields(processed, floorProfileCountFields);
          }

          if (processed.openings && Array.isArray(processed.openings)) {
            processed.openings = processed.openings.map((op: any) => {
              const { width, height, ...rest } = op;
              return {
                ...rest,
                openingWidth: width,
                openingHeight: height
              };
            });
          }

          return sanitizeItemBySections(processed);
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

        if (isHellendDak && Object.keys(materialenLijstSnapshot || {}).length > 0) {
          const mergedMultipliers = buildMergedHellendDakMultipliers(processedItems);
          const syncedMaterialenLijst = syncHellendDakMultipliersInMaterialenLijst(materialenLijstSnapshot, mergedMultipliers);
          if (Object.keys(syncedMaterialenLijst).length > 0) {
            updateData[`klussen.${klusId}.materialen.materialen_lijst`] = cleanFirestoreData(syncedMaterialenLijst, { allowEmptyArrays: true });
          }
        }

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

      <div className="px-4 py-8 max-w-[1400px] mx-auto pb-[280px]">
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
                            <div className="space-y-4">
                              <div className="space-y-3">
                                <Label className="text-xs uppercase text-white">Deel 1</Label>
                                <MeasurementInput placeholder="Bijv. 3000" value={item.lengte1 || ''} onChange={(val) => updateL('lengte1', String(val))} />
                                <MeasurementInput placeholder="Bijv. 2500" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                              </div>
                              <div className="space-y-3 pt-2">
                                <Label className="text-xs uppercase text-white">Deel 2</Label>
                                <MeasurementInput placeholder="Bijv. 2000" value={item.lengte2 || ''} onChange={(val) => updateL('lengte2', String(val))} />
                                <MeasurementInput placeholder="Bijv. 1500" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
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
                            <div className="space-y-4">
                              <div className="space-y-3">
                                <Label className="text-xs">Deel 1</Label>
                                <MeasurementInput placeholder="Bijv. 1500" value={item.lengte1 || ''} onChange={(val) => updateU('lengte1', String(val))} />
                                <MeasurementInput placeholder="Bijv. 2000" value={item.hoogte1 || ''} onChange={(val) => updateItem(index, 'hoogte1', val)} />
                              </div>
                              <div className="space-y-3 pt-2">
                                <Label className="text-xs">Deel 2</Label>
                                <MeasurementInput placeholder="Bijv. 2000" value={item.lengte2 || ''} onChange={(val) => updateU('lengte2', String(val))} />
                                <MeasurementInput placeholder="Bijv. 1200" value={item.hoogte2 || ''} onChange={(val) => updateItem(index, 'hoogte2', val)} />
                              </div>
                              <div className="space-y-3 pt-2">
                                <Label className="text-xs">Deel 3</Label>
                                <MeasurementInput placeholder="Bijv. 1500" value={item.lengte3 || ''} onChange={(val) => updateU('lengte3', String(val))} />
                                <MeasurementInput placeholder="Bijv. 2000" value={item.hoogte3 || ''} onChange={(val) => updateItem(index, 'hoogte3', val)} />
                              </div>
                            </div>
                          );
                        }

                        // Default: Rectangle, Slope, Gable

                        // Boeiboord: grouped Voorzijde / Onderzijde fields
                        if (isBoeiboord) {
                          const fLengte = fields.find(f => f.key === 'lengte');
                          const fHoogte = fields.find(f => f.key === 'hoogte');
                          const fLengteOnderzijde = fields.find(f => f.key === 'lengte_onderzijde');
                          const fBreedte = fields.find(f => f.key === 'breedte');

                          return (
                            <div className="space-y-4">
                              <Label className="text-xs uppercase text-white tracking-wider">Voorzijde</Label>
                              {fLengte && fHoogte ? (
                                <div className="grid grid-cols-2 gap-3 items-end">
                                  <DynamicInput
                                    field={fLengte}
                                    value={item.lengte}
                                    onChange={v => updateItem(index, 'lengte', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                    labelOverride="Lengte"
                                    labelClassName="text-white"
                                  />
                                  <DynamicInput
                                    field={fHoogte}
                                    value={item.hoogte}
                                    onChange={v => updateItem(index, 'hoogte', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                    labelOverride="Hoogte"
                                    labelClassName="text-white"
                                  />
                                </div>
                              ) : (
                                <>
                                  {fLengte && (
                                    <DynamicInput
                                      field={fLengte}
                                      value={item.lengte}
                                      onChange={v => updateItem(index, 'lengte', v)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                      labelOverride="Lengte"
                                      labelClassName="text-white"
                                    />
                                  )}
                                  {fHoogte && (
                                    <DynamicInput
                                      field={fHoogte}
                                      value={item.hoogte}
                                      onChange={v => updateItem(index, 'hoogte', v)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                      labelOverride="Hoogte"
                                      labelClassName="text-white"
                                    />
                                  )}
                                </>
                              )}

                              <div className="pt-2 border-t border-white/5" />
                              <Label className="text-xs uppercase text-white tracking-wider">Onderzijde</Label>
                              {fLengteOnderzijde && fBreedte ? (
                                <div className="grid grid-cols-2 gap-3 items-end">
                                  <DynamicInput
                                    field={fLengteOnderzijde}
                                    value={item.lengte_onderzijde}
                                    onChange={v => updateItem(index, 'lengte_onderzijde', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                    labelOverride="Lengte"
                                    labelClassName="text-white"
                                  />
                                  <DynamicInput
                                    field={fBreedte}
                                    value={item.breedte}
                                    onChange={v => updateItem(index, 'breedte', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                    labelOverride="Breedte"
                                    labelClassName="text-white"
                                  />
                                </div>
                              ) : (
                                <>
                                  {fLengteOnderzijde && (
                                    <DynamicInput
                                      field={fLengteOnderzijde}
                                      value={item.lengte_onderzijde}
                                      onChange={v => updateItem(index, 'lengte_onderzijde', v)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                      labelOverride="Lengte"
                                      labelClassName="text-white"
                                    />
                                  )}
                                  {fBreedte && (
                                    <DynamicInput
                                      field={fBreedte}
                                      value={item.breedte}
                                      onChange={v => updateItem(index, 'breedte', v)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                      labelOverride="Breedte"
                                      labelClassName="text-white"
                                    />
                                  )}
                                </>
                              )}

                              {/* Latten Orientation Options (inside Latten card) */}

                              {/* Boeiboord Orientation Options */}
                              <div className="pt-2 border-t border-white/5" />
                              <div className="space-y-3 pb-4 mb-4">
                                <Label className="text-xs uppercase text-zinc-500 tracking-wider">Boeiboord Richting</Label>
                                <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => updateItem(index, 'boeiboord_orientation', 'horizontal')}
                                    className={cn(
                                      "flex-1 text-xs py-1.5 rounded transition-colors",
                                      item.boeiboord_orientation !== 'slope'
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                  >
                                    Horizontaal (standaard)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateItem(index, 'boeiboord_orientation', 'slope');
                                      updateItem(index, 'boeiboord_mirror', true);
                                      if (item.boeiboord_angle === undefined || item.boeiboord_angle === null || item.boeiboord_angle === '') {
                                        updateItem(index, 'boeiboord_angle', 45);
                                      }
                                    }}
                                    className={cn(
                                      "flex-1 text-xs py-1.5 rounded transition-colors",
                                      item.boeiboord_orientation === 'slope'
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                  >
                                    Schuin (daklijn)
                                  </button>
                                </div>

                                {item.boeiboord_orientation === 'slope' && (
                                  <div className="space-y-2">
                                    <Label className="text-xs">Daklijn hoek</Label>
                                    <div className="relative">
                                      <Input
                                        type="number"
                                        className="bg-black/20 border-white/10 h-9 text-sm pr-8"
                                        value={item.boeiboord_angle ?? 45}
                                        placeholder="45"
                                        onChange={(e) => {
                                          const nextVal = e.target.value === '' ? '' : Number(e.target.value);
                                          updateItem(index, 'boeiboord_angle', nextVal);
                                        }}
                                      />
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">°</span>
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => updateItem(index, 'boeiboord_mirror', !item.boeiboord_mirror)}
                                    className={cn(
                                      "w-full text-xs py-1.5 rounded transition-colors border border-white/10",
                                      item.boeiboord_mirror
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-black/20 text-zinc-500 hover:text-zinc-300"
                                    )}
                                  >
                                    Dubbel gespiegeld (2x)
                                  </button>
                                </div>
                              </div>



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

                        // Default: Rectangle, Slope, Gable
                        const fLengte = fields.find(f => f.key === 'lengte');
                        const fHoogte = fields.find(f => f.key === 'hoogte');
                        const fBreedte = fields.find(f => f.key === 'breedte');
                        const fAantalPannenBreedte = fields.find(f => f.key === 'aantal_pannen_breedte');
                        const fAantalPannenHoogte = fields.find(f => f.key === 'aantal_pannen_hoogte');

                        const showLengte = !!fLengte;
                        const showHoogte = shape === 'rectangle' && !!fHoogte;
                        const showBreedte = shape === 'rectangle' && !!fBreedte;
                        const shouldSwapKeralitDimensionLabels = isGevelbekledingKeralit && !showBreedte;

                        const useSideBySideLengteHoogte = (isVoorzetwandParity || isHellendDak || isGevelbekleding || isSchutting) && showLengte && showHoogte;
                        const useSideBySideLengteBreedteGolfplaat = (isGolfplaatDak || isEpdmDak) && showLengte && showHoogte;
                        const useInlineLengteBreedte = !useSideBySideLengteHoogte && !useSideBySideLengteBreedteGolfplaat && showLengte && showBreedte;
                        const showSwapDimensions = !useSideBySideLengteHoogte && !useSideBySideLengteBreedteGolfplaat && showLengte && (showHoogte || showBreedte);
                        const useSideBySidePannenAfmetingen = isHellendDak && !!fAantalPannenBreedte && !!fAantalPannenHoogte;
                        const dakpanBreedteRange = formatWerkendeRange(dakpanWerkendeMaten?.minBreedteMm ?? null, dakpanWerkendeMaten?.maxBreedteMm ?? null);
                        const dakpanHoogteRange = formatWerkendeRange(dakpanWerkendeMaten?.minHoogteMm ?? null, dakpanWerkendeMaten?.maxHoogteMm ?? null);
                        const defaultWerkendeBreedte = dakpanWerkendeMaten?.maxBreedteMm ?? dakpanWerkendeMaten?.minBreedteMm ?? null;
                        const defaultWerkendeHoogte = dakpanWerkendeMaten?.minHoogteMm !== null && dakpanWerkendeMaten?.minHoogteMm !== undefined && dakpanWerkendeMaten?.maxHoogteMm !== null && dakpanWerkendeMaten?.maxHoogteMm !== undefined
                          ? ((dakpanWerkendeMaten.minHoogteMm + dakpanWerkendeMaten.maxHoogteMm) / 2)
                          : (dakpanWerkendeMaten?.maxHoogteMm ?? dakpanWerkendeMaten?.minHoogteMm ?? null);

                        const dakpanBreedteField = fAantalPannenBreedte ? (
                          <div className="space-y-2">
                            <DynamicInput
                              field={fAantalPannenBreedte}
                              value={item.aantal_pannen_breedte}
                              onChange={v => updateItem(index, 'aantal_pannen_breedte', v)}
                              onKeyDown={handleKeyDown}
                              disabled={disabledAll}
                            />
                            {isHellendDak && defaultWerkendeBreedte && (
                              <div className="space-y-1">
                                <Label className="text-[11px] text-zinc-500">Werkende breedte (mm)</Label>
                                {dakpanBreedteRange && (
                                  <p className="text-[11px] text-zinc-400">{dakpanBreedteRange}</p>
                                )}
                                <MeasurementInput
                                  placeholder={String(Math.round(defaultWerkendeBreedte))}
                                  value={item.werkende_breedte_mm}
                                  onChange={v => updateItem(index, 'werkende_breedte_mm', v)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                />
                              </div>
                            )}
                          </div>
                        ) : null;

                        const dakpanHoogteField = fAantalPannenHoogte ? (
                          <div className="space-y-2">
                            <DynamicInput
                              field={fAantalPannenHoogte}
                              value={item.aantal_pannen_hoogte}
                              onChange={v => updateItem(index, 'aantal_pannen_hoogte', v)}
                              onKeyDown={handleKeyDown}
                              disabled={disabledAll}
                            />
                            {isHellendDak && defaultWerkendeHoogte && (
                              <div className="space-y-1">
                                <Label className="text-[11px] text-zinc-500">Werkende hoogte (mm)</Label>
                                {dakpanHoogteRange && (
                                  <p className="text-[11px] text-zinc-400">{dakpanHoogteRange}</p>
                                )}
                                <MeasurementInput
                                  placeholder={String(Math.round(defaultWerkendeHoogte))}
                                  value={item.werkende_hoogte_mm}
                                  onChange={v => updateItem(index, 'werkende_hoogte_mm', v)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                />
                              </div>
                            )}
                          </div>
                        ) : null;

                        return (
                          <div className="space-y-4">
                            {/* Roof Tile Specific Fields */}
                            {useSideBySidePannenAfmetingen ? (
                              <div className="grid grid-cols-2 gap-3 items-start">
                                {dakpanBreedteField}
                                {dakpanHoogteField}
                              </div>
                            ) : (
                              <>
                                {dakpanBreedteField}
                                {dakpanHoogteField}
                              </>
                            )}

                            {(useSideBySideLengteHoogte || useSideBySideLengteBreedteGolfplaat) ? (
                              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-end">
                                <DynamicInput
                                  field={fLengte!}
                                  value={item.lengte}
                                  onChange={v => updateItem(index, 'lengte', v)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                  labelOverride={shouldSwapKeralitDimensionLabels ? 'Breedte' : undefined}
                                />
                                <div className="flex justify-center pb-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-zinc-900 border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all shadow-md group/swap"
                                    onClick={() => handleSwapDimensions(index, 'lengte', showBreedte ? 'breedte' : 'hoogte')}
                                    disabled={disabledAll}
                                    title="Wissel afmetingen"
                                  >
                                    <ArrowDownUp className="h-4 w-4 rotate-90" />
                                  </Button>
                                </div>
                                <DynamicInput
                                  field={showBreedte ? fBreedte! : fHoogte!}
                                  value={showBreedte ? item.breedte : item.hoogte}
                                  onChange={v => updateItem(index, showBreedte ? 'breedte' : 'hoogte', v)}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                  labelOverride={
                                    shouldSwapKeralitDimensionLabels
                                      ? 'Hoogte'
                                      : (!showBreedte && isGevelbekleding ? 'Breedte' : undefined)
                                  }
                                />
                              </div>
                            ) : useInlineLengteBreedte ? (
                              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-end">
                                <DynamicInput field={fLengte!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                                <div className="flex justify-center pb-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-zinc-900 border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all shadow-md group/swap"
                                    onClick={() => handleSwapDimensions(index, 'lengte', 'breedte')}
                                    disabled={disabledAll}
                                    title="Wissel afmetingen"
                                  >
                                    <ArrowDownUp className="h-4 w-4 rotate-90" />
                                  </Button>
                                </div>
                                <DynamicInput field={fBreedte!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              </div>
                            ) : showLengte && (
                              <DynamicInput field={fLengte!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}

                            {isHellendDak && (() => {
                              const edgeLeftValue = normalizeHellendDakEdge(item.edge_left);
                              const edgeRightValue = normalizeHellendDakEdge(item.edge_right);
                              const sideToggleButtonClass = "flex-1 text-xs py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

                              return (
                                <div className="space-y-3">
                                  <button
                                    type="button"
                                    onClick={() => updateItem(index, 'hellend_dak_mirror', !item.hellend_dak_mirror)}
                                    disabled={disabledAll}
                                    className={cn(
                                      "w-full text-xs py-1.5 rounded transition-colors border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed",
                                      item.hellend_dak_mirror
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-black/20 text-zinc-500 hover:text-zinc-300"
                                    )}
                                  >
                                    Dubbel gespiegeld (2x)
                                  </button>

                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Links</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'edge_left', 'buren')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            edgeLeftValue === 'buren'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Buren
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'edge_left', 'gevel')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            edgeLeftValue === 'gevel'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Vrij
                                        </button>
                                      </div>
                                    </div>

                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Rechts</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'edge_right', 'buren')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            edgeRightValue === 'buren'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Buren
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'edge_right', 'gevel')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            edgeRightValue === 'gevel'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Vrij
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {!useInlineLengteBreedte && showSwapDimensions && (
                              <div className="flex justify-center -my-2 relative z-10">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-zinc-900 border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all shadow-md group/swap"
                                  onClick={() => handleSwapDimensions(index, 'lengte', showBreedte ? 'breedte' : 'hoogte')}
                                  disabled={disabledAll}
                                  title="Wissel afmetingen"
                                >
                                  <ArrowDownUp className="h-4 w-4 rotate-90" />
                                </Button>
                              </div>
                            )}

                            {shape === 'slope' && (
                              <>
                                <div className="space-y-2"><Label>H. Links</Label><MeasurementInput placeholder="Bijv. 2500" value={item.hoogteLinks} onChange={v => updateItem(index, 'hoogteLinks', v)} /></div>
                                <div className="space-y-2"><Label>H. Rechts</Label><MeasurementInput placeholder="Bijv. 2500" value={item.hoogteRechts} onChange={v => updateItem(index, 'hoogteRechts', v)} /></div>
                              </>
                            )}
                            {shape === 'gable' && (
                              <>
                                <div className="space-y-2"><Label>H. Zijkant</Label><MeasurementInput placeholder="Bijv. 2500" value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} /></div>
                                <div className="space-y-2"><Label>H. Top</Label><MeasurementInput placeholder="Bijv. 3000" value={item.hoogteNok} onChange={v => updateItem(index, 'hoogteNok', v)} /></div>
                              </>
                            )}

                            {!useSideBySideLengteHoogte && !useSideBySideLengteBreedteGolfplaat && showHoogte && (
                              <DynamicInput field={fHoogte!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {!useInlineLengteBreedte && !useSideBySideLengteBreedteGolfplaat && showBreedte && (
                              <DynamicInput field={fBreedte!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Openingen Section */}
                    {showOpeningsSectionInUI && (
                      <OpeningenSection
                        openings={item.openings || []}
                        onChange={(newOpenings) => updateItem(index, 'openings', newOpenings)}
                        constructionOptions={specificJobConfig.openingConfig.constructionOptions}
                        addButtonLabel={isSchutting ? 'Tuinpoort toevoegen' : undefined}
                        defaultOpeningType={
                          isNadenVullenJob
                            ? (hasKozijnMaterialFromPreviousPage && !hasDeurMaterialFromPreviousPage ? 'frame-inner'
                              : !hasKozijnMaterialFromPreviousPage && hasDeurMaterialFromPreviousPage ? 'door'
                                : undefined)
                            : undefined
                        }
                        typeOptionsOverride={isSchutting ? [{ value: 'opening', label: 'Tuinpoort' }] : undefined}
                        createOpening={isSchutting ? (() => {
                          const parseNum = (value: any, fallback = 0) => (
                            typeof value === 'number' ? value : parseFloat(String(value ?? '')) || fallback
                          );
                          const lengteMm = Math.max(0, parseNum(item.lengte));
                          const hoogteMm = Math.max(0, parseNum(item.hoogte, 1800));
                          const widthMm = Math.min(1000, lengteMm > 0 ? lengteMm : 1000);
                          const fromLeftMm = Math.max(0, Math.round((lengteMm - widthMm) / 2));
                          return {
                            id: crypto.randomUUID(),
                            type: 'opening',
                            width: Math.round(widthMm),
                            height: Math.round(hoogteMm),
                            fromLeft: fromLeftMm,
                            fromBottom: 0,
                          };
                        }) : undefined}

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
                                    const tussenstijlMm = Math.max(0, ((tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm) || 0) - (2 * sponning));
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
                                          <MeasurementInput value={Math.round(autoDoorPos)} onChange={() => { }} disabled />
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
                                        const tussenstijlMm = Math.max(0, ((tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm) || 0) - (2 * sponning));
                                        const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                                        const doorInfo = getDoorVakInfo(item);
                                        const doorWidthMm = doorInfo.width;
                                        const isDoorLeft = item.doorPosition !== 'right';
                                        const existing = Array.isArray(item.tussenstijlen) ? item.tussenstijlen : [];
                                        let count = existing.length;
                                        if (tussenstijlMm <= 0 || innerWidthMm <= 0) return;
                                        const hasDoorSplit = doorInfo.height > 0 && doorWidthMm > 0;
                                        if (count === 0) {
                                          addTussenstijl(index);
                                          count = 1;
                                        }
                                        // remaining space after optional door split, accounting for all tussenstijlen
                                        const remaining = Math.max(0, innerWidthMm - (hasDoorSplit ? (doorWidthMm + tussenstijlMm) : 0) - (count * tussenstijlMm));
                                        const vakWidth = remaining / (count + 1);
                                        for (let i = 0; i < count; i++) {
                                          const pos = hasDoorSplit
                                            ? (isDoorLeft
                                              ? (doorWidthMm + tussenstijlMm + ((i + 1) * vakWidth) + (i * tussenstijlMm))
                                              : (((i + 1) * vakWidth) + (i * tussenstijlMm)))
                                            : (((i + 1) * vakWidth) + (i * tussenstijlMm));
                                          updateTussenstijl(index, i, Math.round(pos));
                                        }
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
                          const tussenstijlMm = hasTussenstijl ? Math.max(0, ((tussenstijlThicknessMm ?? kozijnhoutFrameThicknessMm) || 0) - (2 * sponning)) : 0;
                          const innerWidthMm = Math.max(0, num(item.breedte) - (2 * frameMm));
                          const innerHeightMm = Math.max(0, num(item.hoogte) - (2 * frameMm));
                          const doorInfo = getDoorVakInfo(item);
                          const doorVakIndex = doorInfo.index;
                          const doorWidthMm = doorInfo.width;
                          const doorHeightMm = doorInfo.height;
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
                          const autoDoorPos = (hasDoor && hasTussenstijl && doorWidthMm > 0 && doorWidthMm < innerWidthMm)
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

                          const layoutVakken = doorVakIndex >= 0 ? vakken.filter((_: any, idx: number) => idx !== doorVakIndex) : vakken;

                          return (
                            <>
                              {vakken.map((vak: any, vakIdx: number) => {
                                const isDoorVak = doorVakIndex === vakIdx;
                                const layoutIndex = isDoorVak
                                  ? -1
                                  : (doorVakIndex >= 0 && vakIdx > doorVakIndex ? vakIdx - 1 : vakIdx);
                                const vakTitle = `${vakTypeLabel(String(vak.type || 'glas'))} ${vakIdx + 1}`;

                                const doorRowSlots = hasDoor ? doorRowCols.length : 0;
                                const rowIndex = isDoorVak
                                  ? 0
                                  : (hasDoor
                                    ? (layoutIndex < doorRowSlots ? 0 : Math.floor((layoutIndex - doorRowSlots) / colCount) + 1)
                                    : Math.floor(layoutIndex / colCount));
                                const colIndex = isDoorVak
                                  ? (hasDoor ? doorColIndex : 0)
                                  : (hasDoor
                                    ? (layoutIndex < doorRowSlots ? doorRowCols[layoutIndex] : (layoutIndex - doorRowSlots) % colCount)
                                    : (layoutIndex % colCount));
                                const rowStartIdx = hasDoor
                                  ? (rowIndex === 0 ? 0 : doorRowSlots + ((rowIndex - 1) * colCount))
                                  : (rowIndex * colCount);
                                const rowEntries = hasDoor && rowIndex === 0
                                  ? layoutVakken.slice(0, doorRowSlots)
                                  : layoutVakken.slice(rowStartIdx, rowStartIdx + colCount);
                                const rowHeight = rowIndex === 0 && hasDoor
                                  ? doorHeightMm
                                  : Math.max(...rowEntries.map(v => num(v?.hoogte)), 0);

                                const horizontalBarHeight = (hasDoor && (doorHeightMm + frameMm) < innerHeightMm) ? frameMm : 0;
                                const fallbackHeight = hasDoor ? Math.max(0, innerHeightMm - doorHeightMm - horizontalBarHeight) : innerHeightMm;

                                const displayHeight = isDoorVak
                                  ? (doorHeightMm > 0 ? doorHeightMm : innerHeightMm)
                                  : (rowIndex === 0 && hasDoor ? doorHeightMm : (rowHeight > 0 ? rowHeight : fallbackHeight));
                                const displayWidth = isDoorVak
                                  ? (hasColumns ? (colWidths[doorColIndex] || innerWidthMm) : innerWidthMm)
                                  : (hasColumns ? (colWidths[colIndex] || innerWidthMm) : innerWidthMm);
                                // Use actual values for inputs; calculated values only as placeholders
                                const widthValue = (vak.breedte !== undefined && vak.breedte !== null)
                                  ? vak.breedte
                                  : (vak.width !== undefined && vak.width !== null)
                                    ? vak.width
                                    : (displayWidth > 0 ? Math.round(displayWidth) : '');
                                const heightValue = (vak.hoogte !== undefined && vak.hoogte !== null)
                                  ? vak.hoogte
                                  : (vak.height !== undefined && vak.height !== null)
                                    ? vak.height
                                    : (displayHeight > 0 ? Math.round(displayHeight) : '');
                                const handleHeightChange = (value: any) => {
                                  if (!isDoorVak && rowIndex > 0) {
                                    rowEntries.forEach((entry: any, idx: number) => {
                                      if (!entry) return;
                                      const targetIndex = layoutVakken.indexOf(entry);
                                      if (targetIndex >= 0) {
                                        const actualIndex = doorVakIndex >= 0 && targetIndex >= doorVakIndex ? targetIndex + 1 : targetIndex;
                                        updateVak(index, actualIndex, { hoogte: value, height: value });
                                      }
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
                                      type={vak.type || 'glas'}
                                      width={widthValue}
                                      height={heightValue}
                                      doorPosition={vak.doorPosition}
                                      doorSwing={vak.doorSwing}
                                      hasBorstwering={vak.hasBorstwering}
                                      borstweringHeight={vak.borstweringHeight}
                                      isCollapsed={collapsedSections[`vak-${index}-${vakIdx}`] === true}
                                      onToggleCollapse={() => toggleCollapsed(`vak-${index}-${vakIdx}`)}
                                      disabled={disabledAll}
                                      allowDoor={true}
                                      displayHeight={displayHeight}
                                      displayWidth={displayWidth}
                                      disableWidth={false}
                                      disableHeight={false}
                                      onDelete={() => removeVak(index, vakIdx)}

                                      onTypeChange={(t) => {
                                        setItems(prev => prev.map((it, i) => {
                                          if (i !== index) return it;
                                          const list = Array.isArray(it.vakken) ? it.vakken : [];
                                          const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
                                          let doorBreedte: any = it.deur_breedte;
                                          let doorHoogte: any = it.deur_hoogte;
                                          const next = list.map((v: any, idx: number) => {
                                            if (idx === vakIdx) {
                                              if (t === 'deur') {
                                                const currentBreedte = num(v.breedte ?? v.width);
                                                const currentHoogte = num(v.hoogte ?? v.height);
                                                const nextBreedte = currentBreedte > 0 ? (v.breedte ?? v.width) : 835;
                                                const nextHoogte = currentHoogte > 0 ? (v.hoogte ?? v.height) : 2025;
                                                doorBreedte = nextBreedte;
                                                doorHoogte = nextHoogte;
                                                return { ...v, type: t, breedte: nextBreedte, hoogte: nextHoogte };
                                              }
                                              return { ...v, type: t };
                                            }
                                            if (t === 'deur' && String(v?.type || '').toLowerCase() === 'deur') {
                                              return { ...v, type: 'open' };
                                            }
                                            return v;
                                          });
                                          const nextItem: any = { ...it, vakken: next };
                                          if (t === 'deur') {
                                            nextItem.deur_breedte = doorBreedte;
                                            nextItem.deur_hoogte = doorHoogte;
                                          }
                                          return nextItem;
                                        }));
                                      }}
                                      onWidthChange={(v) => {
                                        updateVak(index, vakIdx, { breedte: v, width: v });
                                        if (String(vak.type || '').toLowerCase() === 'deur') {
                                          updateItem(index, 'deur_breedte', v);
                                        }
                                      }}
                                      onHeightChange={(v) => {
                                        handleHeightChange(v);
                                        if (String(vak.type || '').toLowerCase() === 'deur') {
                                          updateItem(index, 'deur_hoogte', v);
                                        }
                                      }}
                                      onUpdateFull={(updates) => {
                                        updateVak(index, vakIdx, updates);
                                        if (String(vak.type || '').toLowerCase() === 'deur') {
                                          if (updates.doorPosition) updateItem(index, 'doorPosition', updates.doorPosition);
                                          if (updates.doorSwing) updateItem(index, 'doorSwing', updates.doorSwing);
                                        }
                                      }}
                                    />
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

                    {isEpdmDak && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const gevelCount = epdmSideRows.filter((row) =>
                            normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key)) === 'wall'
                          ).length;
                          const vrijstaandCount = 4 - gevelCount;

                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(`gevel-vrijstaand-${index}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">Gevel / vrijstaand</span>
                                  {collapsedSections[`gevel-vrijstaand-${index}`] !== false && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {`${gevelCount}x gevel • ${vrijstaandCount}x vrijstaand`}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {collapsedSections[`gevel-vrijstaand-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {collapsedSections[`gevel-vrijstaand-${index}`] === false && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-4">
                                    <div className="space-y-3">
                                      {epdmSideRows.map((row) => {
                                        const currentValue = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                                        return (
                                          <div key={row.key} className="space-y-1">
                                            <Label className="text-xs">{`${row.directionLabel} (${row.sideLabel})`}</Label>
                                            <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                              <button
                                                type="button"
                                                onClick={() => updateItem(index, row.key, 'wall')}
                                                className={cn(
                                                  "flex-1 text-xs py-1.5 rounded transition-colors",
                                                  currentValue === 'wall'
                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                                )}
                                              >
                                                Gevel
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => updateItem(index, row.key, 'free')}
                                                className={cn(
                                                  "flex-1 text-xs py-1.5 rounded transition-colors",
                                                  currentValue === 'free'
                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                                )}
                                              >
                                                Vrijstaand
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {isEpdmDak && hasLoodMaterialFromPreviousPage && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const enabledSummary = epdmSideRows
                            .filter((row) => {
                              const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                              return edgeType === 'wall' && Boolean(item[`lood_${row.side}`]);
                            })
                            .map((row) => `1x gevel ${row.directionLabel.toLowerCase()}`);
                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(`lood-${index}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">Lood</span>
                                  {collapsedSections[`lood-${index}`] !== false && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {enabledSummary.length > 0 ? enabledSummary.join(' • ') : '0x gevel'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {collapsedSections[`lood-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {collapsedSections[`lood-${index}`] === false && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-3">
                                    {epdmSideRows.map((row) => {
                                      const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                                      const isGevelSide = edgeType === 'wall';
                                      const checked = isGevelSide ? Boolean(item[`lood_${row.side}`]) : false;
                                      return (
                                        <div key={`lood-${row.side}`} className="flex items-center justify-between bg-black/20 p-3 rounded border border-white/5">
                                          <div className="space-y-1">
                                            <Label className="text-xs text-zinc-300">{`${row.directionLabel} (${row.sideLabel}) • ${isGevelSide ? 'Gevel' : 'Vrijstaand'}`}</Label>
                                            {!isGevelSide && <p className="text-[11px] text-zinc-500">Alleen op Gevel-zijde.</p>}
                                          </div>
                                          <Switch
                                            checked={checked}
                                            onCheckedChange={(checkedState) => updateItem(index, `lood_${row.side}`, checkedState)}
                                            disabled={disabledAll || !isGevelSide}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {isEpdmDak && hasDaktrimMaterialFromPreviousPage && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const enabledSummary = epdmSideRows
                            .filter((row) => {
                              const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                              return edgeType === 'free' && Boolean(item[`daktrim_${row.side}`]);
                            })
                            .map((row) => `1x vrijstaand ${row.directionLabel.toLowerCase()}`);
                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(`daktrim-${index}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">Daktrim</span>
                                  {collapsedSections[`daktrim-${index}`] !== false && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {enabledSummary.length > 0 ? enabledSummary.join(' • ') : '0x vrijstaand'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {collapsedSections[`daktrim-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {collapsedSections[`daktrim-${index}`] === false && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-3">
                                    {epdmSideRows.map((row) => {
                                      const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                                      const isVrijstaandSide = edgeType === 'free';
                                      const checked = isVrijstaandSide ? Boolean(item[`daktrim_${row.side}`]) : false;
                                      return (
                                        <div key={`daktrim-${row.side}`} className="flex items-center justify-between bg-black/20 p-3 rounded border border-white/5">
                                          <div className="space-y-1">
                                            <Label className="text-xs text-zinc-300">{`${row.directionLabel} (${row.sideLabel}) • ${isVrijstaandSide ? 'Vrijstaand' : 'Gevel'}`}</Label>
                                            {!isVrijstaandSide && <p className="text-[11px] text-zinc-500">Alleen op Vrijstaand-zijde.</p>}
                                          </div>
                                          <Switch
                                            checked={checked}
                                            onCheckedChange={(checkedState) => updateItem(index, `daktrim_${row.side}`, checkedState)}
                                            disabled={disabledAll || !isVrijstaandSide}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {isEpdmDak && hasDakgootMaterialFromPreviousPage && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const dakgootSummary = epdmSideRows
                            .filter((row) => {
                              const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                              return edgeType === 'free' && Boolean(item[`dakgoot_${row.side}`]);
                            })
                            .map((row) => `1x vrijstaand ${row.directionLabel.toLowerCase()}`);

                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(`dakgoot-${index}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">Dakgoot</span>
                                  {collapsedSections[`dakgoot-${index}`] !== false && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {dakgootSummary.length > 0 ? dakgootSummary.join(' • ') : '0x vrijstaand'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {collapsedSections[`dakgoot-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {collapsedSections[`dakgoot-${index}`] === false && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-3">
                                    {epdmSideRows.map((row) => {
                                      const edgeType = normalizeEpdmEdgeValue(item[row.key], epdmDefaultEdgeForKey(row.key));
                                      const isVrijstaandSide = edgeType === 'free';
                                      const checked = isVrijstaandSide ? Boolean(item[`dakgoot_${row.side}`]) : false;
                                      return (
                                        <div key={`dakgoot-${row.side}`} className="flex items-center justify-between bg-black/20 p-3 rounded border border-white/5">
                                          <div className="space-y-1">
                                            <Label className="text-xs text-zinc-300">{`Dakgoot ${row.directionLabel} (${row.sideLabel}) • ${isVrijstaandSide ? 'Vrijstaand' : 'Gevel'}`}</Label>
                                            {!isVrijstaandSide && <p className="text-[11px] text-zinc-500">Alleen op Vrijstaand-zijde.</p>}
                                          </div>
                                          <Switch
                                            checked={checked}
                                            onCheckedChange={(checkedState) => updateItem(index, `dakgoot_${row.side}`, checkedState)}
                                            disabled={disabledAll || !isVrijstaandSide}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {isEpdmDak && (hasHwaMaterialFromPreviousPage || hasHwaUitloopMaterialFromPreviousPage) && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const hwaCount = toNonNegativeIntOrNull(item.hwa_aantal) ?? 0;
                          const hwaUitloopCount = toNonNegativeIntOrNull(item.hwa_uitloop_aantal) ?? 0;
                          const summary: string[] = [];
                          if (hasHwaMaterialFromPreviousPage) summary.push(`${hwaCount}x hwa`);
                          if (hasHwaUitloopMaterialFromPreviousPage) summary.push(`${hwaUitloopCount}x stadsuitloop`);

                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(`hwa-stadsuitloop-${index}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">HWA & stadsuitloop</span>
                                  {collapsedSections[`hwa-stadsuitloop-${index}`] !== false && summary.length > 0 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {summary.join(' • ')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {collapsedSections[`hwa-stadsuitloop-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {collapsedSections[`hwa-stadsuitloop-${index}`] === false && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-3">
                                    {hasHwaMaterialFromPreviousPage && (
                                      <div className="space-y-2">
                                        <Label htmlFor={`hwa-aantal-${index}`} className="text-xs">HWA aantal</Label>
                                        <Input
                                          id={`hwa-aantal-${index}`}
                                          type="number"
                                          min={0}
                                          step={1}
                                          className="bg-black/20 border-white/10 h-9 text-sm"
                                          placeholder="Bijv. 1"
                                          value={item.hwa_aantal ?? ''}
                                          onChange={(e) => updateItem(index, 'hwa_aantal', e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          disabled={disabledAll}
                                        />
                                      </div>
                                    )}

                                    {hasHwaUitloopMaterialFromPreviousPage && (
                                      <div className="space-y-2">
                                        <Label htmlFor={`hwa-uitloop-aantal-${index}`} className="text-xs">Stadsuitloop aantal</Label>
                                        <Input
                                          id={`hwa-uitloop-aantal-${index}`}
                                          type="number"
                                          min={0}
                                          step={1}
                                          className="bg-black/20 border-white/10 h-9 text-sm"
                                          placeholder="Bijv. 1"
                                          value={item.hwa_uitloop_aantal ?? ''}
                                          onChange={(e) => updateItem(index, 'hwa_uitloop_aantal', e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          disabled={disabledAll}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}


                    {isSchutting && (
                      <>

                        {/* Paalafstand Card */}
                        {fields.find(f => f.key === 'paalafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`paalafstand-${index}`, false)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Paalafstand</span>
                                {collapsedSections[`paalafstand-${index}`] === true && item.paalafstand > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.paalafstand}mm
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`paalafstand-${index}`] === true ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`paalafstand-${index}`] !== true && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput
                                    field={fields.find(f => f.key === 'paalafstand')!}
                                    value={item.paalafstand}
                                    onChange={v => updateItem(index, 'paalafstand', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                  />

                                  <div className="space-y-3">
                                    <Label className="text-xs">Startpositie</Label>
                                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => updateItem(index, 'startFromRight', false)}
                                        className={cn(
                                          "flex-1 text-xs py-1.5 rounded transition-colors",
                                          !item.startFromRight
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                      >
                                        Links
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateItem(index, 'startFromRight', true)}
                                        className={cn(
                                          "flex-1 text-xs py-1.5 rounded transition-colors",
                                          item.startFromRight
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                      >
                                        Rechts
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Betonband / Onderplaten Card */}
                        {fields.find(f => f.key === 'betonband_hoogte') && hasOpsluitbandenMaterialFromPreviousPage && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`betonband-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Onderplaten (Beton)</span>
                                {collapsedSections[`betonband-${index}`] !== false && item.betonband_hoogte > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.betonband_hoogte}mm
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`betonband-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`betonband-${index}`] === false && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput
                                    field={fields.find(f => f.key === 'betonband_hoogte')!}
                                    value={item.betonband_hoogte}
                                    onChange={v => updateItem(index, 'betonband_hoogte', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
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
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : (jobSlug.includes('hellend-dak') ? 'Pan latten' : 'Regelwerk')}
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
                                        {isHellendDak ? 'Boven' : (isRoofCategory ? 'Links' : 'Boven')}
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isHellendDak ? 'Onder' : (isRoofCategory ? 'Rechts' : 'Onder')}
                                      </button>
                                    </div>
                                  </div>

                                  {(isBoeiboord || isGevelbekleding) && (
                                    <div className="space-y-3">
                                      <Label className="text-xs">Latten Richting</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'latten_orientation', 'vertical')}
                                          className={cn(
                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                            item.latten_orientation === 'vertical'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Verticaal
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'latten_orientation', 'horizontal')}
                                          className={cn(
                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                            (item.latten_orientation === 'horizontal' || !item.latten_orientation)
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Horizontaal
                                        </button>
                                      </div>
                                    </div>
                                  )}

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
                                      {isHellendDak && (
                                        <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                          <Label className="text-[10px] text-zinc-400">1e onderafstand 1/2</Label>
                                          <Switch checked={item.halfLatafstandFromBottom ?? true} onCheckedChange={(c) => updateItem(index, 'halfLatafstandFromBottom', c)} className="scale-75 origin-right" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Balken Configuration */}
                        {!isGevelbekleding && fields.find(f => f.key === 'balkafstand') && (
                          <BalkenSection
                            balkafstand={item.balkafstand}
                            startFromRight={item.startFromRight}
                            doubleEndBeams={item.doubleEndBeams}
                            doubleTopPlate={item.doubleTopPlate}
                            doubleBottomPlate={item.doubleBottomPlate}
                            surroundingBeams={item.surroundingBeams}
                            includeTopBottomGording={item.includeTopBottomGording}
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

                    {/* Balken Section (Render FIRST for wanden/hsb, but NOT for Gevelbekleding/Boeiboord) */}
                    {!isCeilingCategory && !isGevelbekleding && !isBoeiboord && fields.find(f => f.key === 'balkafstand') && (
                      <BalkenSection
                        balkafstand={item.balkafstand}
                        startFromRight={item.startFromRight}
                        doubleEndBeams={item.doubleEndBeams}
                        doubleTopPlate={item.doubleTopPlate}
                        doubleBottomPlate={item.doubleBottomPlate}
                        surroundingBeams={item.surroundingBeams}
                        includeTopBottomGording={item.includeTopBottomGording}
                        optionsConfig={specificJobConfig.balkenConfig?.options}
                        onUpdate={(key, val) => updateItem(index, key, val)}
                        isWallCategory={isWallCategory}
                        jobSlug={jobSlug}
                        // Collapse default: true (collapsed)
                        isCollapsed={collapsedSections[`balken-${index}`] !== false}
                        onToggleCollapsed={() => toggleCollapsed(`balken-${index}`)}
                      />
                    )}

                    {isGolfplaatDak && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <div
                          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                          onClick={() => toggleCollapsed(`dakverdeling-${index}`)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-200">Dakverdeling</span>
                            {collapsedSections[`dakverdeling-${index}`] !== false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                {item.tussenmuur
                                  ? `Tussenmuur ${item.tussenmuur}mm`
                                  : (item.aantal_daken && Number(item.aantal_daken) > 1
                                    ? `${item.aantal_daken} daken`
                                    : 'Geen verdeling')}
                              </span>
                            )}
                          </div>
                          <div className="text-zinc-500">
                            {collapsedSections[`dakverdeling-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </div>
                        </div>

                        {collapsedSections[`dakverdeling-${index}`] === false && (
                          <div className="px-4 pb-4 pt-0 space-y-3 animate-in slide-in-from-top-2">
                            <div className="pt-2 border-t border-white/5">
                              <p className="text-[11px] text-zinc-500">
                                Vul óf `Aantal daken` in voor gelijke verdeling, óf een exacte `Tussenmuur`.
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label htmlFor={`aantal-daken-${index}`} className="text-xs">Aantal daken / schuren</Label>
                                <Input
                                  id={`aantal-daken-${index}`}
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="bg-black/20 border-white/10 h-9 text-sm"
                                  placeholder="Bijv. 2"
                                  value={item.aantal_daken ?? ''}
                                  onChange={(e) => updateItem(index, 'aantal_daken', e.target.value === '' ? '' : Number(e.target.value))}
                                  onKeyDown={handleKeyDown}
                                  disabled={disabledAll}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`tussenmuur-${index}`} className="text-xs">Tussenmuur</Label>
                                <div className="relative">
                                  <Input
                                    id={`tussenmuur-${index}`}
                                    type="number"
                                    min={0}
                                    step={1}
                                    className="bg-black/20 border-white/10 h-9 text-sm pr-10"
                                    placeholder="Bijv. 3333"
                                    value={item.tussenmuur ?? ''}
                                    onChange={(e) => updateItem(index, 'tussenmuur', e.target.value === '' ? '' : Number(e.target.value))}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">mm</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!isCeilingCategory && (
                      (() => {
                        const defaultStartFromBottom = isGevelbekleding ? true : false;
                        const defaultLattenOrientation = isGevelbekleding
                          ? (hasGevelTengelMaterialFromPreviousPage ? 'horizontal' : 'vertical')
                          : 'horizontal';
                        const shouldShowGevelTengelSection = isGevelbekleding && hasGevelTengelMaterialFromPreviousPage;
                        const tengelSection = shouldShowGevelTengelSection && fields.find(f => f.key === 'tengelafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`tengel-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Ventilatielatten</span>
                                {collapsedSections[`tengel-${index}`] === true && item.tengelafstand > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.tengelafstand}mm h.o.h
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`tengel-${index}`] === true ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`tengel-${index}`] !== true && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput field={fields.find(f => f.key === 'tengelafstand')!} value={item.tengelafstand} onChange={v => updateItem(index, 'tengelafstand', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />

                                  <div className="space-y-3">
                                    <Label className="text-xs">Startpositie</Label>
                                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                      <button type="button" onClick={() => updateItem(index, 'startTengelFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !(item.startTengelFromBottom ?? defaultStartFromBottom) ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        Boven
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startTengelFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", (item.startTengelFromBottom ?? defaultStartFromBottom) ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        Onder
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-xs">Latten Richting</Label>
                                    <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => updateItem(index, 'tengel_orientation', 'vertical')}
                                        className={cn(
                                          "flex-1 text-xs py-1.5 rounded transition-colors",
                                          item.tengel_orientation !== 'horizontal'
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                      >
                                        Latten verticaal
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateItem(index, 'tengel_orientation', 'horizontal')}
                                        className={cn(
                                          "flex-1 text-xs py-1.5 rounded transition-colors",
                                          item.tengel_orientation === 'horizontal'
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                      >
                                        Latten horizontaal
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-xs">Opties</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                        <Label className="text-[10px] text-zinc-400">Dbl. Eindlat</Label>
                                        <Switch checked={item.doubleEndTengels || false} onCheckedChange={(c) => updateItem(index, 'doubleEndTengels', c)} className="scale-75 origin-right" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );

                        const lattenSection = fields.find(f => f.key === 'latafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`latten-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : (jobSlug.includes('hellend-dak') ? 'Pan latten' : 'Regelwerk')}
                                </span>
                                {/* Collapse default: true (collapsed) */}
                                {collapsedSections[`latten-${index}`] === true && item.latafstand > 0 && (
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
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !(item.startLattenFromBottom ?? defaultStartFromBottom) ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isHellendDak ? 'Boven' : (isRoofCategory ? 'Links' : 'Boven')}
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", (item.startLattenFromBottom ?? defaultStartFromBottom) ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isHellendDak ? 'Onder' : (isRoofCategory ? 'Rechts' : 'Onder')}
                                      </button>
                                    </div>
                                  </div>

                                  {(isBoeiboord || isGevelbekleding) && (
                                    <div className="space-y-3">
                                      <Label className="text-xs">Latten Richting</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'latten_orientation', 'vertical')}
                                          className={cn(
                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                            (item.latten_orientation ?? defaultLattenOrientation) === 'vertical'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Latten verticaal
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateItem(index, 'latten_orientation', 'horizontal')}
                                          className={cn(
                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                            (item.latten_orientation ?? defaultLattenOrientation) === 'horizontal'
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Latten horizontaal
                                        </button>
                                      </div>
                                    </div>
                                  )}

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
                                      {isHellendDak && (
                                        <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-white/5">
                                          <Label className="text-[10px] text-zinc-400">1e onderafstand 1/2</Label>
                                          <Switch checked={item.halfLatafstandFromBottom ?? true} onCheckedChange={(c) => updateItem(index, 'halfLatafstandFromBottom', c)} className="scale-75 origin-right" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );

                        const balkenSection = !isGevelbekleding && fields.find(f => f.key === 'balkafstand') && (
                          <BalkenSection
                            balkafstand={item.balkafstand}
                            startFromRight={item.startFromRight}
                            doubleEndBeams={item.doubleEndBeams}
                            doubleTopPlate={item.doubleTopPlate}
                            doubleBottomPlate={item.doubleBottomPlate}
                            surroundingBeams={item.surroundingBeams}
                            includeTopBottomGording={item.includeTopBottomGording}
                            optionsConfig={specificJobConfig.balkenConfig?.options}
                            onUpdate={(key, val) => updateItem(index, key, val)}
                            isWallCategory={isWallCategory}
                            jobSlug={jobSlug}
                            // Collapse default: true (collapsed)
                            isCollapsed={collapsedSections[`balken-${index}`] !== false}
                            onToggleCollapsed={() => toggleCollapsed(`balken-${index}`)}
                          />
                        );

                        if (isBoeiboord) {
                          return (
                            <>
                              {lattenSection}
                              {balkenSection}
                              {renderTrespaNaadSection(index)}
                            </>
                          );
                        }

                        return (
                          <>
                            {tengelSection}
                            {lattenSection}
                            {renderTrespaNaadSection(index)}
                            {renderKeralitPanelenSection(item, index)}
                            {renderKeralitGevelProfielSection(item, index)}
                            {renderKeralitDaktrimSection(item, index)}
                          </>
                        );
                      })()
                    )}

                    {/* Koof Section */}
                    {showKoofSectionInUI && (
                      <KoofSection
                        koven={item.koven || []}
                        onAdd={() => onAddKoof(index)}
                        onDelete={(id) => onDeleteKoof(index, id)}
                        onUpdate={(id, updates) => onUpdateKoof(index, id, updates)}
                        isCollapsed={collapsedSections[`koof-${index}`] === true}
                        onToggleCollapsed={() => toggleCollapsed(`koof-${index}`, false)}
                        wallLength={Number(item.lengte) || 0}
                        wallHeight={Number(item.hoogte) || 0}
                      />
                    )}

                    {/* Vensterbank Section */}
                    {showVensterbankSectionInUI && (
                      <VensterbankSection
                        vensterbanken={item.vensterbanken || []}
                        onAdd={() => onAddVensterbank(index)}
                        onDelete={(id) => onDeleteVensterbank(index, id)}
                        onUpdate={(id, updates) => onUpdateVensterbank(index, id, updates)}
                        isCollapsed={collapsedSections[`vensterbank-${index}`] === true}
                        onToggleCollapsed={() => toggleCollapsed(`vensterbank-${index}`, false)}
                        customTitle="Vensterbanken"
                        customItemLabel="Vensterbank"
                      />
                    )}

                    {/* Dagkant Section */}
                    {showDagkantSectionInUI && (
                      <DagkantSection
                        dagkanten={item.dagkanten || []}
                        onAdd={() => onAddDagkant(index)}
                        onDelete={(id) => onDeleteDagkant(index, id)}
                        onUpdate={(id, updates) => onUpdateDagkant(index, id, updates)}
                        isCollapsed={collapsedSections[`dagkant-${index}`] !== false}
                        onToggleCollapsed={() => toggleCollapsed(`dagkant-${index}`)}
                      />
                    )}

                    {showStucwerkSectionInUI && (() => {
                      const profielState = resolveGevelProfielState(item, 'both');
                      const sideToggleButtonClass = "flex-1 text-xs py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
                      const profielSummary = profielState.mode === 'both'
                        ? `Links ${formatGevelProfielLabel(profielState.links)} • Rechts ${formatGevelProfielLabel(profielState.rechts)}`
                        : `${formatGevelProfielLabel(profielState.links)} beide zijden`;
                      const modeButtonClass = (
                        active: boolean,
                        tone: 'hoek' | 'eind' | 'both'
                      ) => cn(
                        "text-xs py-1.5 rounded transition-colors border",
                        active
                          ? tone === 'hoek'
                            ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                            : tone === 'eind'
                              ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-black/20 text-zinc-400 border-white/10 hover:text-zinc-200"
                      );

                      return (
                        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                          <div
                            className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                            onClick={() => toggleCollapsed(`naden-vullen-${index}`)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-zinc-200">Stucwerk</span>
                              {collapsedSections[`naden-vullen-${index}`] !== false && (() => {
                                const hasNadenVerbruikValues =
                                  !isEmptyValue(item.naden_vullen_verbruik_per_m2) ||
                                  !isEmptyValue(item.naden_afwerken_verbruik_per_m2);
                                const hasAfwerkingChoice =
                                  item.naden_vullen_afwerking === 'behangklaar' ||
                                  item.naden_vullen_afwerking === 'schilderklaar';
                                const shouldShowBadge =
                                  hasNadenVerbruikValues ||
                                  (hasNadenStucMaterialFromPreviousPage && hasAfwerkingChoice);
                                if (!shouldShowBadge) return null;
                                return (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {hasNadenVerbruikValues
                                      ? 'Ingesteld'
                                      : (item.naden_vullen_afwerking === 'schilderklaar' ? 'Schilderklaar' : 'Behangklaar')}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="text-zinc-500">
                              {collapsedSections[`naden-vullen-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </div>
                          </div>

                          {collapsedSections[`naden-vullen-${index}`] === false && (
                            <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                              <div className="pt-2 border-t border-white/5 space-y-4">
                                {/* Hoek/Eind profiel — same UI as Keralit */}
                                <div className="space-y-1.5">
                                  <Label className="text-xs uppercase text-zinc-500 tracking-wider">Hoek/Eind profiel</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <button
                                      type="button"
                                      className={modeButtonClass(profielState.mode === 'hoek', 'hoek')}
                                      onClick={() => updateKeralitGevelProfielMode(index, 'hoek')}
                                      disabled={disabledAll}
                                    >
                                      Hoekprofiel
                                    </button>
                                    <button
                                      type="button"
                                      className={modeButtonClass(profielState.mode === 'eind', 'eind')}
                                      onClick={() => updateKeralitGevelProfielMode(index, 'eind')}
                                      disabled={disabledAll}
                                    >
                                      Eindprofiel
                                    </button>
                                    <button
                                      type="button"
                                      className={modeButtonClass(profielState.mode === 'both', 'both')}
                                      onClick={() => updateKeralitGevelProfielMode(index, 'both')}
                                      disabled={disabledAll}
                                    >
                                      Beide
                                    </button>
                                  </div>
                                </div>

                                {profielState.mode === 'both' && (
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Links</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateKeralitGevelProfielSide(index, 'links', 'hoek')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            profielState.links === 'hoek'
                                              ? "bg-orange-500/20 text-orange-300"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Hoek
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateKeralitGevelProfielSide(index, 'links', 'eind')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            profielState.links === 'eind'
                                              ? "bg-sky-500/20 text-sky-300"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Eind
                                        </button>
                                      </div>
                                    </div>

                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] uppercase text-zinc-500 tracking-wider">Rechts</Label>
                                      <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                        <button
                                          type="button"
                                          onClick={() => updateKeralitGevelProfielSide(index, 'rechts', 'hoek')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            profielState.rechts === 'hoek'
                                              ? "bg-orange-500/20 text-orange-300"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Hoek
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateKeralitGevelProfielSide(index, 'rechts', 'eind')}
                                          disabled={disabledAll}
                                          className={cn(
                                            sideToggleButtonClass,
                                            profielState.rechts === 'eind'
                                              ? "bg-sky-500/20 text-sky-300"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          )}
                                        >
                                          Eind
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Afwerking */}
                                <div className="space-y-2">
                                  <Label className="text-xs">Afwerking</Label>
                                  <div className="flex bg-black/20 rounded-md p-1 border border-white/10">
                                    <button
                                      type="button"
                                      onClick={() => updateItem(index, 'naden_vullen_afwerking', 'behangklaar')}
                                      className={cn(
                                        "flex-1 text-xs py-1.5 rounded transition-colors",
                                        item.naden_vullen_afwerking === 'behangklaar'
                                          ? "bg-emerald-500/20 text-emerald-400"
                                          : "text-zinc-500 hover:text-zinc-300"
                                      )}
                                    >
                                      Behangklaar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateItem(index, 'naden_vullen_afwerking', 'schilderklaar')}
                                      className={cn(
                                        "flex-1 text-xs py-1.5 rounded transition-colors",
                                        item.naden_vullen_afwerking === 'schilderklaar'
                                          ? "bg-emerald-500/20 text-emerald-400"
                                          : "text-zinc-500 hover:text-zinc-300"
                                      )}
                                    >
                                      Schilderklaar
                                    </button>
                                  </div>
                                </div>

                                {/* Naden verbruik */}
                                <div className="space-y-2">
                                  <Label htmlFor={`naden-vullen-verbruik-${index}`} className="text-xs">Naden vullen (verbruik kg/m²)</Label>
                                  <div className="relative">
                                    <Input
                                      id={`naden-vullen-verbruik-${index}`}
                                      type="text"
                                      inputMode="decimal"
                                      className="bg-black/20 border-white/10 h-9 text-sm pr-14"
                                      placeholder="Bijv. 0,4"
                                      value={item.naden_vullen_verbruik_per_m2 ?? ''}
                                      onChange={(e) => updateItem(index, 'naden_vullen_verbruik_per_m2', e.target.value)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">kg/m²</span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor={`naden-afwerken-verbruik-${index}`} className="text-xs">Naden afwerken (verbruik kg/m²)</Label>
                                  <div className="relative">
                                    <Input
                                      id={`naden-afwerken-verbruik-${index}`}
                                      type="text"
                                      inputMode="decimal"
                                      className="bg-black/20 border-white/10 h-9 text-sm pr-14"
                                      placeholder="Bijv. 0,1"
                                      value={item.naden_afwerken_verbruik_per_m2 ?? ''}
                                      onChange={(e) => updateItem(index, 'naden_afwerken_verbruik_per_m2', e.target.value)}
                                      onKeyDown={handleKeyDown}
                                      disabled={disabledAll}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">kg/m²</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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

                    {/* Lichtplaten Card */}
                    {isGolfplaatDak && fields.find(f => f.key === 'lichtplaten_aantal') && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <div
                          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                          onClick={() => toggleCollapsed(`lichtplaten-${index}`)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-200">Lichtplaten</span>
                            {collapsedSections[`lichtplaten-${index}`] !== false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                {item.lichtplaten_aantal ? `${item.lichtplaten_aantal} stuks` : 'Niet ingevuld'}
                              </span>
                            )}
                          </div>
                          <div className="text-zinc-500">
                            {collapsedSections[`lichtplaten-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </div>
                        </div>

                        {collapsedSections[`lichtplaten-${index}`] === false && (
                          <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                            <div className="pt-2 border-t border-white/5 space-y-2">
                              <Label htmlFor={`lichtplaten-aantal-${index}`} className="text-xs">Aantal</Label>
                              <Input
                                id={`lichtplaten-aantal-${index}`}
                                type="number"
                                min={0}
                                step={1}
                                className="bg-black/20 border-white/10 h-9 text-sm"
                                placeholder="Bijv. 2"
                                value={item.lichtplaten_aantal ?? ''}
                                onChange={(e) => updateItem(index, 'lichtplaten_aantal', e.target.value === '' ? '' : Number(e.target.value))}
                                onKeyDown={handleKeyDown}
                                disabled={disabledAll}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Vloer Profielen Aantallen Card */}
                    {(jobSlug === 'laminaat-pvc' || jobSlug === 'massief-houten-vloer') && floorProfileCountFields.some((f) => f.enabled) && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        {(() => {
                          const vloerProfielenCollapseKey = `vloer-profielen-${index}`;
                          const isVloerProfielenCollapsed = collapsedSections[vloerProfielenCollapseKey] ?? false;
                          const floorCardTitle = jobSlug === 'massief-houten-vloer' ? 'Afwerking' : 'Afwerkprofielen';
                          const summary = floorProfileCountFields
                            .filter((f) => f.enabled)
                            .map((f) => {
                              const count = toNonNegativeIntOrNull(item[f.fieldKey]);
                              return count === null ? null : `${count}x ${f.summaryLabel}`;
                            })
                            .filter(Boolean) as string[];

                          return (
                            <>
                              <div
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                                onClick={() => toggleCollapsed(vloerProfielenCollapseKey, false)}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-zinc-200">{floorCardTitle}</span>
                                  {isVloerProfielenCollapsed && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                      {summary.length > 0 ? summary.join(' • ') : 'Niet ingevuld'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-500">
                                  {isVloerProfielenCollapsed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                              </div>

                              {!isVloerProfielenCollapsed && (
                                <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                  <div className="pt-2 border-t border-white/5 space-y-3">
                                    {floorProfileCountFields.filter((f) => f.enabled).map((f) => (
                                      <div key={`${f.fieldKey}-${index}`} className="space-y-2">
                                        <Label htmlFor={`${f.fieldKey}-${index}`} className="text-xs">{`${f.label} aantal`}</Label>
                                        <Input
                                          id={`${f.fieldKey}-${index}`}
                                          type="number"
                                          min={0}
                                          step={1}
                                          className="bg-black/20 border-white/10 h-9 text-sm"
                                          placeholder="Bijv. 1"
                                          value={item[f.fieldKey] ?? ''}
                                          onChange={(e) => updateItem(index, f.fieldKey, e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          disabled={disabledAll}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
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
                    {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'aantal_daken', 'tussenmuur', 'tengelafstand', 'latafstand', 'onderzijde_latafstand', 'lichtplaten_aantal', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra's</h4>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                          {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'aantal_daken', 'tussenmuur', 'tengelafstand', 'latafstand', 'onderzijde_latafstand', 'lichtplaten_aantal', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).map(f => (
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
                        showOnderplaten={hasOpsluitbandenMaterialFromPreviousPage}
                        title={`${itemLabel} ${index + 1}`}
                        isMagnifier={false}
                        fitContainer={false}
                        frameThickness={isMaatwerkKozijn ? kozijnhoutFrameThicknessMm : undefined}
                        tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? tussenstijlThicknessMm : undefined}
                        tussenstijlOffset={item.tussenstijlen_posities}
                        raamhoutWidth={67}
                        vakken={item.vakken}
                        doorWidth={item.deur_breedte}
                        onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                        onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                        onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                        onKoofChange={(updated: any) => updateItem(index, 'koven', updated)}
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
                            showOnderplaten={hasOpsluitbandenMaterialFromPreviousPage}
                            title={`${itemLabel} ${index + 1}`}
                            isMagnifier={false}
                            fitContainer={true}
                            frameThickness={isMaatwerkKozijn ? kozijnhoutFrameThicknessMm : undefined}
                            tussenstijlThickness={isMaatwerkKozijn && hasTussenstijl ? tussenstijlThicknessMm : undefined}
                            tussenstijlOffset={isMaatwerkKozijn ? item.tussenstijl_van_links : undefined}
                            doorPosition={item.doorPosition}
                            doorSwing={item.doorSwing}
                            onOpeningsChange={(newOpenings: any) => updateItem(index, 'openings', newOpenings)}
                            onEdgeChange={(side: string, value: string) => updateItem(index, `edge_${side}`, value)}
                            onDataGenerated={(data: any) => updateItem(index, 'calculatedData', data)}
                            onKoofChange={(updated: any) => updateItem(index, 'koven', updated)}
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
