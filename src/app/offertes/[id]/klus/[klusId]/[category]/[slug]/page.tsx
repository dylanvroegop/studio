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
  const isBoeiboord = categorySlug === 'boeiboorden' || (jobSlug && jobSlug.includes('boeiboord'));
  const isGevelbekleding = categorySlug === 'gevelbekleding' || (jobSlug && jobSlug.includes('gevelbekleding'));
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
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pendingDeleteOpening, setPendingDeleteOpening] = useState<{ itemIndex: number; openingIndex: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [kozijnhoutFrameThicknessMm, setKozijnhoutFrameThicknessMm] = useState<number | null>(null);
  const [tussenstijlThicknessMm, setTussenstijlThicknessMm] = useState<number | null>(null);
  const [hasTussenstijl, setHasTussenstijl] = useState(false);
  const prevVakIdsRef = useRef<Record<number, Set<string>>>({});
  const [manualVakkenOverride, setManualVakkenOverride] = useState<Record<number, boolean>>({});

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

  const applyCeilingBalkafstandDefault = (item: any, hasBalklaagMaterial: boolean) => {
    const isCeilingJob = jobSlug === 'plafond-houten-framework' || jobSlug === 'plafond-metalstud';
    if (!isCeilingJob || !hasBalklaagMaterial) return item;
    const current = item?.balkafstand;
    if (current === undefined || current === null || current === '') {
      return { ...item, balkafstand: 600 };
    }
    return item;
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
          const balklaagMaterial = findBalklaagMaterial(container);
          const kozijnhoutThickness = kozijnhoutMaterial ? parseDikteToMm(kozijnhoutMaterial?.dikte) : null;
          const tussenstijlThickness = tussenstijlMaterial ? parseDikteToMm(tussenstijlMaterial?.dikte) : null;
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
              let normalizedItem = sanitizeItemBySections(item);


              // Data Migration for HSB Voorzetwand
              if (jobSlug === 'hsb-voorzetwand') {

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
            const withCeilingDefault = withVlizotrap.map((item: any) =>
              applyCeilingBalkafstandDefault(item, !!balklaagMaterial)
            );
            setItems(withCeilingDefault);
          } else {
            const emptyItem = createEmptyItem();
            const withVlizotrap = vlizotrapMaterial
              ? syncVlizotrapOpening(emptyItem, vlizotrapMaterial)
              : emptyItem;
            const withCeilingDefault = applyCeilingBalkafstandDefault(withVlizotrap, !!balklaagMaterial);
            setItems([withCeilingDefault]);
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
    if (showKoofSection) newItem.koven = [];
    if (showDagkantSection) newItem.dagkanten = [];
    if (showVensterbankSection) newItem.vensterbanken = [];
    if (isMaatwerkKozijn) {
      newItem.vakken = [];
      newItem.tussenstijlen = [];
    }
    return sanitizeItemBySections(newItem);
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
                          return (
                            <div className="space-y-4">
                              <Label className="text-xs uppercase text-zinc-500 tracking-wider">Voorzijde</Label>
                              {fields.find(f => f.key === 'lengte') && (
                                <DynamicInput field={fields.find(f => f.key === 'lengte')!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}

                              {fields.find(f => f.key === 'lengte') && fields.find(f => f.key === 'hoogte') && (
                                <div className="flex justify-center -my-2 relative z-10">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-zinc-900 border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all shadow-md group/swap"
                                    onClick={() => handleSwapDimensions(index, 'lengte', 'hoogte')}
                                    disabled={disabledAll}
                                    title="Wissel afmetingen"
                                  >
                                    <ArrowDownUp className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}

                              {fields.find(f => f.key === 'hoogte') && (
                                <DynamicInput field={fields.find(f => f.key === 'hoogte')!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}

                              <div className="pt-2 border-t border-white/5" />
                              <Label className="text-xs uppercase text-zinc-500 tracking-wider">Onderzijde</Label>
                              {fields.find(f => f.key === 'lengte_onderzijde') && (
                                <DynamicInput field={fields.find(f => f.key === 'lengte_onderzijde')!} value={item.lengte_onderzijde} onChange={v => updateItem(index, 'lengte_onderzijde', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                              )}

                              {fields.find(f => f.key === 'lengte_onderzijde') && fields.find(f => f.key === 'breedte') && (
                                <div className="flex justify-center -my-2 relative z-10">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-zinc-900 border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all shadow-md group/swap"
                                    onClick={() => handleSwapDimensions(index, 'lengte_onderzijde', 'breedte')}
                                    disabled={disabledAll}
                                    title="Wissel afmetingen"
                                  >
                                    <ArrowDownUp className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}

                              {fields.find(f => f.key === 'breedte') && (
                                <DynamicInput field={fields.find(f => f.key === 'breedte')!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
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
                                  <Label className="text-xs">Spiegeling</Label>
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

                        const showLengte = !!fLengte;
                        const showHoogte = shape === 'rectangle' && !!fHoogte;
                        const showBreedte = shape === 'rectangle' && !!fBreedte;

                        return (
                          <div className="space-y-4">
                            {/* Roof Tile Specific Fields */}
                            {fields.find(f => f.key === 'aantal_pannen_breedte') && (
                              <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_breedte')!} value={item.aantal_pannen_breedte} onChange={v => updateItem(index, 'aantal_pannen_breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {fields.find(f => f.key === 'aantal_pannen_hoogte') && (
                              <DynamicInput field={fields.find(f => f.key === 'aantal_pannen_hoogte')!} value={item.aantal_pannen_hoogte} onChange={v => updateItem(index, 'aantal_pannen_hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}

                            {showLengte && (
                              <DynamicInput field={fLengte!} value={item.lengte} onChange={v => updateItem(index, 'lengte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}

                            {showLengte && (showHoogte || showBreedte) && (
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
                                  <ArrowDownUp className="h-4 w-4" />
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

                            {showHoogte && (
                              <DynamicInput field={fHoogte!} value={item.hoogte} onChange={v => updateItem(index, 'hoogte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
                            )}
                            {showBreedte && (
                              <DynamicInput field={fBreedte!} value={item.breedte} onChange={v => updateItem(index, 'breedte', v)} onKeyDown={handleKeyDown} disabled={disabledAll} />
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


                    {isSchutting && (
                      <>

                        {/* Paalafstand Card */}
                        {fields.find(f => f.key === 'paalafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`paalafstand-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Paalafstand</span>
                                {collapsedSections[`paalafstand-${index}`] !== false && item.paalafstand > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {item.paalafstand}mm
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-500">
                                {collapsedSections[`paalafstand-${index}`] !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </div>
                            </div>

                            {collapsedSections[`paalafstand-${index}`] === false && (
                              <div className="px-4 pb-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                                <div className="pt-2 border-t border-white/5 space-y-4">
                                  <DynamicInput
                                    field={fields.find(f => f.key === 'paalafstand')!}
                                    value={item.paalafstand}
                                    onChange={v => updateItem(index, 'paalafstand', v)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabledAll}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Betonband / Onderplaten Card */}
                        {fields.find(f => f.key === 'betonband_hoogte') && (
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
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : (jobSlug.includes('hellend-dak') ? 'Pan latten' : 'Latten')}
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

                    {/* Balken Section (Render FIRST for wanden/hsb, but NOT for Gevelbekleding/Boeiboord) */}
                    {!isCeilingCategory && !isGevelbekleding && !isBoeiboord && fields.find(f => f.key === 'balkafstand') && (
                      <BalkenSection
                        balkafstand={item.balkafstand}
                        startFromRight={item.startFromRight}
                        doubleEndBeams={item.doubleEndBeams}
                        doubleTopPlate={item.doubleTopPlate}
                        doubleBottomPlate={item.doubleBottomPlate}
                        surroundingBeams={item.surroundingBeams}
                        optionsConfig={specificJobConfig.balkenConfig?.options}
                        onUpdate={(key, val) => updateItem(index, key, val)}
                        isWallCategory={isWallCategory}
                        jobSlug={jobSlug}
                        // Collapse default: true (collapsed)
                        isCollapsed={collapsedSections[`balken-${index}`] !== false}
                        onToggleCollapsed={() => toggleCollapsed(`balken-${index}`)}
                      />
                    )}

                    {!isCeilingCategory && (
                      (() => {
                        const tengelSection = isGevelbekleding && fields.find(f => f.key === 'tengelafstand') && (
                          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
                              onClick={() => toggleCollapsed(`tengel-${index}`)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-200">Tengel latten</span>
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
                                      <button type="button" onClick={() => updateItem(index, 'startTengelFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startTengelFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        Boven
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startTengelFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startTengelFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
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
                                          item.tengel_orientation === 'vertical'
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
                                          (item.tengel_orientation === 'horizontal' || !item.tengel_orientation)
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
                                  {jobSlug === 'plafond-metalstud' ? 'Profielen' : (jobSlug.includes('hellend-dak') ? 'Pan latten' : 'Latten')}
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
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', false)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", !item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Links' : 'Boven'}
                                      </button>
                                      <button type="button" onClick={() => updateItem(index, 'startLattenFromBottom', true)} className={cn("flex-1 text-xs py-1.5 rounded transition-colors", item.startLattenFromBottom ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}>
                                        {isRoofCategory ? 'Rechts' : 'Onder'}
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
                                          Latten verticaal
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
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );

                        const balkenSection = fields.find(f => f.key === 'balkafstand') && (
                          <BalkenSection
                            balkafstand={item.balkafstand}
                            startFromRight={item.startFromRight}
                            doubleEndBeams={item.doubleEndBeams}
                            doubleTopPlate={item.doubleTopPlate}
                            doubleBottomPlate={item.doubleBottomPlate}
                            surroundingBeams={item.surroundingBeams}
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

                              {/* Seam Thickness (Moved to bottom) */}
                              {(() => {
                                const isTrespa = jobSlug.toLowerCase().includes('trespa');
                                const isRockpanel = jobSlug.toLowerCase().includes('rockpanel');
                                if (isTrespa || isRockpanel) {
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
                                }
                                return null;
                              })()}
                            </>
                          );
                        }

                        return (
                          <>
                            {tengelSection}
                            {lattenSection}
                          </>
                        );
                      })()
                    )}

                    {/* Koof Section */}
                    {showKoofSection && (
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
                    {showVensterbankSection && (
                      <VensterbankSection
                        vensterbanken={item.vensterbanken || []}
                        onAdd={() => onAddVensterbank(index)}
                        onDelete={(id) => onDeleteVensterbank(index, id)}
                        onUpdate={(id, updates) => onUpdateVensterbank(index, id, updates)}
                        isCollapsed={collapsedSections[`vensterbank-${index}`] === true}
                        onToggleCollapsed={() => toggleCollapsed(`vensterbank-${index}`, false)}
                        customTitle={isGevelbekleding ? 'Waterslagen' : 'Vensterbanken'}
                        customItemLabel={isGevelbekleding ? 'Waterslag' : 'Vensterbank'}
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

                    {/* Balken Section (non-ceiling, moved lower - ONLY for Gevelbekleding) */}
                    {!isCeilingCategory && isGevelbekleding && fields.find(f => f.key === 'balkafstand') && (
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
                    {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'tengelafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra's</h4>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                          {fields.filter(f => f.type !== 'textarea' && !f.group && !['lengte', 'breedte', 'hoogte', 'hoogteLinks', 'hoogteRechts', 'hoogteNok', 'aantal', 'aantal_pannen_breedte', 'aantal_pannen_hoogte', 'balkafstand', 'tengelafstand', 'latafstand', 'onderzijde_latafstand', 'lengte_onderzijde', 'dakrand_breedte', 'dakrand_hoogte', 'edge_top', 'edge_bottom', 'edge_left', 'edge_right', 'kopkanten', 'kopkant_breedte', 'kopkant_hoogte'].includes(f.key)).map(f => (
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
