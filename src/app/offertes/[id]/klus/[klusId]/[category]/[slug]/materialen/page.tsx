/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// Components
import { MaterialSelectionModal } from '@/components/MaterialSelectionModal';
import { DynamicMaterialGroup } from '@/components/DynamicMaterialGroup';
import { PersonalNotes } from '@/components/PersonalNotes';
import { WizardHeader } from '@/components/WizardHeader';
import { Textarea } from '@/components/ui/textarea';
import { JobComponentsManager } from '@/components/JobComponentsManager';
import { MaterialListExportDialog } from '@/components/quote/MaterialListExportDialog';
import { JobComponent, JobComponentType, Job } from '@/lib/types';

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
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Calculator,
  Sparkles,
  Edit2,
  Box,
  AlertTriangle,
  PlusCircle,
  Minus,
  Search,
  Share2,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { getMaterialRule, KLUS_REGELS_STATIC_VERSION } from '@/lib/klus-regels-static';
import { reportOperationalError } from '@/lib/report-operational-error';
import { useUser, useFirestore } from '@/firebase';

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
  setDoc,
  FieldPath,
} from 'firebase/firestore';

import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import {
  JOB_REGISTRY,
  MATERIAL_CATEGORY_INFO,
  MaterialCategoryKey
} from '@/lib/job-registry';
import { COMPONENT_REGISTRY } from '@/lib/component-registry';
import { getJobConfig, getPresetCompatibleJobTypes, getPresetGroup, getPresetKey, resolvePresetJobTypeAlias } from '@/config/jobTypes/index';
import type { MaterialListExportItem, MaterialListExportMeta } from '@/lib/material-list-export';
import type { LeverancierContact } from '@/lib/types-settings';
import { normalizeLeverancierContactList, pickDefaultLeverancierId } from '@/lib/types-settings';

// ==================================
// CONSTANTS
// ==================================

const EENHEDEN: string[] = ['m1', 'm2', 'p/m1', 'p/m2', 'p/m3', 'stuk', 'doos', 'set', 'koker', 'zak'];

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

function parseNLMoneyToNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  // If raw is already a number, return it
  if (typeof raw === 'number') return raw;

  // Handle "9.3 p/m2" format - extract the first number
  const stringVal = String(raw);
  const match = stringVal.match(/^([\d.,]+)/);
  if (!match) return null;

  let s = match[1].replace(/\s/g, '').replace('€', '');
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

function mergeSafetyAnswerIntoNaam(naam: string, antwoord: string): string {
  const cleanNaam = (naam || '').trim();
  const cleanAntwoord = (antwoord || '').trim();
  if (!cleanAntwoord) return cleanNaam;
  if (cleanNaam.toLowerCase().includes(cleanAntwoord.toLowerCase())) return cleanNaam;
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
  const cleanAnswer = (answer || '').trim();
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

interface PendingSafetyQuestion {
  key: string;
  targetField: string;
  question: string;
  expectedUnit: string;
  valueType: string;
  answer: string;
}

function normalizePendingQuestions(
  rawQuestions: unknown,
  fallback?: { question?: string; expectedUnit?: string; answer?: string; key?: string; targetField?: string; valueType?: string }
): PendingSafetyQuestion[] {
  const clean = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const normalize = (raw: unknown): PendingSafetyQuestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const question =
      clean(row.question ?? row.vraag) ??
      '';
    if (!question) return null;

    const key =
      clean(row.key ?? row.code ?? row.id) ??
      fallback?.key ??
      'naam_suffix';
    const expectedUnit =
      clean(
        row.expected_unit ??
        row.expectedUnit ??
        row.answer_unit ??
        row.answerUnit ??
        row.eenheid ??
        row.unit
      ) ??
      fallback?.expectedUnit ??
      '';
    const targetField =
      clean(row.target_field ?? row.targetField) ??
      fallback?.targetField ??
      (key === 'verbruik_per_m2' ? 'verbruik_per_m2' : 'naam_suffix');
    const valueType =
      clean(row.value_type ?? row.valueType) ??
      fallback?.valueType ??
      'text';
    const answer =
      clean(row.answer) ??
      clean(fallback?.answer) ??
      '';

    return {
      key,
      targetField,
      question,
      expectedUnit,
      valueType,
      answer,
    };
  };

  const list = Array.isArray(rawQuestions)
    ? rawQuestions.map((entry) => normalize(entry)).filter((entry): entry is PendingSafetyQuestion => Boolean(entry))
    : [];

  if (list.length > 0) return list;

  const legacy = normalize({
    key: fallback?.key ?? 'naam_suffix',
    target_field: fallback?.targetField ?? 'naam_suffix',
    question: fallback?.question ?? '',
    expected_unit: fallback?.expectedUnit ?? '',
    value_type: fallback?.valueType ?? 'text',
    answer: fallback?.answer ?? '',
  });

  return legacy ? [legacy] : [];
}
const BLOCKLIST = [
  'isFavorite',
  'sectionKey',
  'quantity',
  '_raw',
  'created_at',
  'id',
  'wastePercentage',
  'savedAt',
  'updatedAt',
  'saved_at',
  'updated_at',
  'savedByUid',
  'gebruikerid',
  'row_id',
  'order_id',
  'prijs_incl_btw',
  'prijs',
  'prijs_per_stuk',
  'hellend_dak_multiplier',
  'hellend_dak_multipliers',
  'boeiboord_multiplier',
  'boeiboord_multipliers',
];
const DEFAULT_WASTE_PERCENTAGE = 10;
const ZERO_WASTE_PATTERNS = [
  // Golfplaat-dak sections that should default to 0% afval.
  /(golfplaten?|lichtplaten?|nokstukken?|hoekstukken?|zijstukken?|dakgoot|hwa[_\s-]?afvoer)/i,
  /(\bdeur\b|deuren|binnendeur|buitendeur)/i,
  /(scharnier|scharnieren|slot|sluit|meerpuntsluiting|cilinderslot|hang[_\\s-]?sluit|beslag|kruk|greep|paumelle)/i,
  /(kozijn|kozijnhout|stelkozijn|kozijnelement|raamkozijn|raamhout|stalen_kozijn)/i,
  /(glas|glaslat|glaslatten|glaslatten_klik)/i,
  /(rooster|roosters|ventilatieprofiel|ventilatierooster)/i,
  /(waterslag|raamdorpel|dorpel|onderdorpel|binnendorpel)/i,
  /(vlizotrap|trapboom|trapaal|traphek|trapneus|trapleuning|leuning|trap\b)/i,
  /(schuifdeur|rails|paneel|komgreep|greep)/i,
  /(kraan|meubelbeslag|beslag)/i,
  /(hwa|afvoer|afval)/i,
];

function isTrespaHplGevelplaatSection(
  sectionKey: string | null,
  label?: string,
  context?: string,
  materialName?: string
): boolean {
  if (String(sectionKey || '').toLowerCase() !== 'gevelplaat') return false;
  const haystack = `${label || ''} ${context || ''} ${materialName || ''}`.toLowerCase();
  return /\b(trespa|hpl|volkern)\b/.test(haystack);
}

function isKeralitEindOfHoekprofielSection(
  sectionKey: string | null,
  label?: string,
  context?: string,
  materialName?: string
): boolean {
  const normalizedSectionKey = String(sectionKey || '').toLowerCase().trim();
  if (normalizedSectionKey === 'keralit_eindprofiel' || normalizedSectionKey === 'keralit_hoekprofiel') {
    return true;
  }
  const haystack = `${label || ''} ${context || ''} ${materialName || ''}`.toLowerCase();
  return /\bkeralit\b/.test(haystack) && /\b(eindprofiel|hoekprofiel)\b/.test(haystack);
}

function isSchuttingTuinpoortSection(
  sectionKey: string | null,
  label?: string,
  context?: string,
  materialName?: string
): boolean {
  const normalizedSectionKey = String(sectionKey || '').toLowerCase().trim();
  if (normalizedSectionKey === 'tuinpoort') return true;
  const haystack = `${label || ''} ${context || ''} ${materialName || ''}`.toLowerCase();
  return /\btuinpoort\b/.test(haystack) && /\bschutting\b/.test(haystack);
}

function isDakraamZeroWasteSection(
  sectionKey: string | null,
  label?: string,
  context?: string,
  materialName?: string
): boolean {
  const normalizedSectionKey = String(sectionKey || '').toLowerCase().trim();
  if (normalizedSectionKey === 'vensterset_compleet' || normalizedSectionKey === 'venster_los' || normalizedSectionKey === 'gootstuk') {
    return true;
  }
  const haystack = `${label || ''} ${context || ''} ${materialName || ''}`.toLowerCase();
  return (
    /\bdakraam\b/.test(haystack)
    || /\bdakraam set\b/.test(haystack)
    || /\bgootstukken?\b/.test(haystack)
  );
}

function normalizeSavedWastePercentage(
  wastePercentage: number,
  sectionKey: string | null,
  label?: string,
  context?: string,
  materialName?: string
): number {
  // Legacy quotes often saved the old default (10%) for Trespa/HPL gevelplaten.
  // This section now uses layout-based plate nesting, so default should be 0%.
  if (
    wastePercentage === DEFAULT_WASTE_PERCENTAGE
    && isTrespaHplGevelplaatSection(sectionKey, label, context, materialName)
  ) {
    return 0;
  }
  if (
    wastePercentage === DEFAULT_WASTE_PERCENTAGE
    && isKeralitEindOfHoekprofielSection(sectionKey, label, context, materialName)
  ) {
    return 0;
  }
  if (
    wastePercentage === DEFAULT_WASTE_PERCENTAGE
    && isSchuttingTuinpoortSection(sectionKey, label, context, materialName)
  ) {
    return 0;
  }
  if (
    wastePercentage === DEFAULT_WASTE_PERCENTAGE
    && isDakraamZeroWasteSection(sectionKey, label, context, materialName)
  ) {
    return 0;
  }
  return wastePercentage;
}

function getDefaultWastePercentage(sectionKey: string | null, label?: string, context?: string): number {
  const haystack = `${sectionKey || ''} ${label || ''} ${context || ''}`.toLowerCase();
  const sectionAndLabel = `${sectionKey || ''} ${label || ''}`.toLowerCase();
  const isEpdmDaktrimHoeken =
    (sectionKey === 'daktrim_hoeken' || /daktrim[\s_-]*hoek/.test(sectionAndLabel))
    && /epdm/.test(haystack);
  if (isEpdmDaktrimHoeken) return 0;
  if (isTrespaHplGevelplaatSection(sectionKey, label, context)) return 0;
  if (isKeralitEindOfHoekprofielSection(sectionKey, label, context)) return 0;
  if (isSchuttingTuinpoortSection(sectionKey, label, context)) return 0;
  if (isDakraamZeroWasteSection(sectionKey, label, context)) return 0;
  if (ZERO_WASTE_PATTERNS.some((pattern) => pattern.test(haystack))) return 0;
  return DEFAULT_WASTE_PERCENTAGE;
}

const NOTES_PLACEHOLDER_MESSAGES = [
  "Bijv: 2x extra balken 50x70 toevoegen",
  "Bijv: Check prijs voor eiken plaat 18 mm",
  "Bijv: Optie 'olie-afwerking' toevoegen",
  "Bijv: Alternatief: vuren i.p.v. eiken",
  "Bijv: Klant wil extra schroeven opnemen",
] as const;

const NOTES_PLACEHOLDER_TYPING_MS = 48;
const NOTES_PLACEHOLDER_DELETE_MS = 26;
const NOTES_PLACEHOLDER_HOLD_MS = 1100;
const NOTES_PLACEHOLDER_START_DELAY_MS = 350;

function cleanMaterialData(v: any) {
  if (!v) return null;
  const source = { ...(v._raw || {}), ...v };
  const clean: any = {};
  Object.keys(source).forEach(prop => {
    if (BLOCKLIST.includes(prop)) return;
    const val = source[prop];
    if (val === null || val === undefined || val === '') return;
    clean[prop] = val;
  });
  if (!clean.materiaalnaam && v.materiaalnaam) clean.materiaalnaam = v.materiaalnaam;
  // Preserve material ID for preset references (use field not in blocklist)
  const matId = v.id || v.row_id || source.id || source.row_id;
  if (matId) clean.material_ref_id = matId;
  return Object.keys(clean).length > 0 ? clean : null;
}

function normalizeMaterialId(value: any): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function getMaterialIdCandidates(material: any): string[] {
  const source = material?._raw || {};
  const ids = new Set<string>();

  [
    material?.id,
    material?.row_id,
    material?.material_ref_id,
    source?.id,
    source?.row_id,
    source?.material_ref_id,
  ].forEach((candidate) => {
    const normalized = normalizeMaterialId(candidate);
    if (normalized) ids.add(normalized);
  });

  return Array.from(ids);
}

function normalizeMaterialName(value: any): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizePresetIdentity(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeEpdmDaktrimSectionKeyForSave(
  jobSlug: string,
  sectionKey: string | null | undefined,
  material: any
): string | null {
  if (String(jobSlug || '').toLowerCase() !== 'epdm-dakbedekking') return sectionKey ?? null;
  const materialName = String(material?.materiaalnaam || '').toLowerCase();
  if (!materialName.includes('daktrim')) return sectionKey ?? null;

  const hasCornerHint =
    materialName.includes('hoekstuk')
    || materialName.includes('hoekstukken')
    || /\bhoek\b/.test(materialName)
    || /\bhoeken\b/.test(materialName);

  if (sectionKey === 'daktrim' && hasCornerHint) return 'daktrim_hoeken';
  if (sectionKey === 'daktrim_hoeken' && !hasCornerHint) return 'daktrim';
  if (!sectionKey) return hasCornerHint ? 'daktrim_hoeken' : 'daktrim';
  return sectionKey;
}

function isGevelbekledingJobType(jobType: string): boolean {
  return String(jobType || '').toLowerCase().startsWith('gevelbekleding-');
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

function getMissingPriceItemKey(item: any, idx?: number): string {
  return String(item?.row_id || item?.material_ref_id || item?.id || item?.materiaalnaam || `idx-${idx ?? 0}`);
}

function mergeMaterialForPriceCheck(material: any): any {
  const raw = material?._raw || {};
  return {
    ...raw,
    ...material,
    row_id: material?.row_id ?? raw.row_id,
    material_ref_id: material?.material_ref_id ?? raw.material_ref_id,
    id: material?.id ?? raw.id,
    materiaalnaam: material?.materiaalnaam ?? raw.materiaalnaam,
  };
}

function getExclPriceFromMaterial(material: any): number | null {
  if (!material) return null;

  const exclCandidates = [
    material.prijs_excl_btw,
    material.prijs_per_stuk,
    material.prijs,
    material._raw?.prijs_excl_btw,
    material._raw?.prijs_per_stuk,
    material._raw?.prijs,
  ];
  for (const c of exclCandidates) {
    const n = parseNLMoneyToNumber(c);
    if (typeof n === 'number' && n > 0) return n;
  }

  // Fallback for legacy/catalog rows that still only contain incl. btw.
  const inclCandidates = [material.prijs_incl_btw, material._raw?.prijs_incl_btw];
  for (const c of inclCandidates) {
    const incl = parseNLMoneyToNumber(c);
    if (typeof incl === 'number' && incl > 0) {
      return Number((incl / 1.21).toFixed(2));
    }
  }

  return null;
}

function getPositivePriceFromMaterial(material: any): number | null {
  const excl = getExclPriceFromMaterial(material);
  if (typeof excl === 'number' && excl > 0) return excl;
  return null;
}

function bouwCustomGroupsUitFirestore(custommateriaal: any, alleMaterialen: any[]): any[] {
  if (!custommateriaal || typeof custommateriaal !== 'object') return [];
  const index = new Map<string, any>();
  for (const m of alleMaterialen || []) {
    getMaterialIdCandidates(m).forEach((id) => {
      if (!index.has(id)) index.set(id, m);
    });
  }
  return Object.entries(custommateriaal)
    .sort(([, itemA]: any, [, itemB]: any) => (itemA.order ?? 9999) - (itemB.order ?? 9999))
    .map(([groupId, item]: any) => {
      const rowId = item?.id ? String(item.id) : null;
      let matchedMaterial = null;

      if (rowId) {
        // If we have an ID, try to find it in default materials
        const found = index.get(rowId);
        if (found) {
          matchedMaterial = found;
        } else {
          // Fallback: use the data saved in the custom object itself if available
          // ensuring we don't show "onbekend" unless we really have to
          matchedMaterial = {
            id: rowId,
            materiaalnaam: item.materiaalnaam || '(onbekend)',
            eenheid: item.eenheid || 'stuk',
            prijs: typeof item.prijs === 'number' ? item.prijs : 0,
            prijs_per_stuk: typeof item.prijs_per_stuk === 'number' ? item.prijs_per_stuk : 0,
            quantity: 1
          };
        }
      }

      return {
        id: groupId,
        title: item?.title || '',
        // Only include a material if we actually resolved one.
        // If rowId was null/empty, materials will be [], causing state to be "unselected"
        materials: matchedMaterial ? [matchedMaterial] : [],
      };
    });
}

function bouwCustommateriaalMapUitCustomGroups(customGroups: any[]) {
  const out: any = {};
  customGroups.forEach((group, index) => {
    const groupId = group?.id;
    const title = (group?.title || '').trim();
    // Allow saving if we have at least a groupId and title, even if no material is selected yet
    if (!groupId || !title) return;

    const material = (group?.materials?.[0] as any);
    const rowId = material?.id || material?.row_id || null; // Kept for logic, but will be stripped on save if needed

    out[groupId] = {
      // We keep rowId here to allow the helper to work, but the save logic dictates what goes to firestore
      id: rowId ? String(rowId) : null,
      materiaalnaam: material?.materiaalnaam || '',
      prijs: typeof material?.prijs === 'number' ? material.prijs : 0,
      prijs_per_stuk: typeof material?.prijs_per_stuk === 'number' ? material.prijs_per_stuk : 0,
      eenheid: material?.eenheid || '',
      title,
      order: index
    };
  });
  return out;
}

function getMaterialLength(material: any): number | null {
  if (!material) return null;
  const val = material.lengte;

  // Try direct number (already in mm)
  if (typeof val === 'number') return val;

  // Try string with unit (e.g., "300cm" or "3000mm")
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '.').toLowerCase().trim();

    // Check for cm suffix - convert to mm
    if (cleaned.endsWith('cm')) {
      const num = parseFloat(cleaned.replace('cm', ''));
      if (!isNaN(num)) return num * 10; // cm to mm
    }

    // Check for mm suffix
    if (cleaned.endsWith('mm')) {
      const num = parseFloat(cleaned.replace('mm', ''));
      if (!isNaN(num)) return num;
    }

    // Try plain number (assume mm if large, cm if small)
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      return num < 100 ? num * 10 : num; // Assume cm if < 100
    }
  }

  // Fallback: parse from material name (e.g., "44x69mm 3000mm lang")
  const name = material.materiaalnaam || '';
  const mmMatch = name.match(/(\d{3,4})mm\s*lang/i) || name.match(/(\d{3,4})\s*mm/i);
  if (mmMatch) return parseInt(mmMatch[1], 10);

  // Check for cm in name, e.g. "300cm"
  const cmMatch = name.match(/(\d{3})\s*cm/i);
  if (cmMatch) return parseInt(cmMatch[1], 10) * 10;

  return null;
}

// ==================================
// STYLING CONSTANTS
// ==================================
const POSITIVE_BTN_SOFT = 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20';
const DESTRUCTIVE_BTN_SOFT = 'border border-red-500/50 bg-red-500/15 text-red-100 hover:bg-red-500/25 hover:border-red-500/65 focus-visible:ring-red-500 focus-visible:ring-offset-0';
const SELECT_ITEM_GREEN = 'text-foreground focus:bg-emerald-600/15 focus:text-foreground data-[highlighted]:bg-emerald-600/15 data-[highlighted]:text-foreground data-[state=checked]:bg-emerald-600/15 data-[state=checked]:text-foreground';
const TERUG_HOVER_RED = 'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:ring-destructive';
const DIALOG_CLOSE_TAP = '[&_button[aria-label="Close"]]:h-11 [&_button[aria-label="Close"]]:w-11 [&_button[aria-label="Close"]]:p-0 [&_button[aria-label="Close"]]:opacity-100 [&_button[aria-label="Close"]]:hover:bg-muted/50 [&_button[aria-label="Close"]]:hover:text-foreground [&_button[aria-label="Close"]]:focus-visible:ring-0';

// ==================================
// MATERIAL ROW COMPONENT
// ==================================

interface MaterialRowProps {
  label: string;
  selected?: any;
  onClick: () => void;
  onRemove?: () => void;
  isCustom?: boolean;
  onEditTitle?: () => void;
  isSubSection?: boolean;
}

function MaterialRow({ label, selected, onClick, onRemove, isCustom, onEditTitle, isSubSection = false }: MaterialRowProps) {
  const [deleteConfOpen, setDeleteConfOpen] = useState(false);

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          "group relative flex flex-col sm:flex-row sm:items-center justify-between py-1.5 px-4 rounded-lg border transition-all gap-1 sm:gap-4 cursor-pointer",
          (selected && selected.materiaalnaam) ? "border-emerald-500/20 bg-emerald-500/5" : "border-border hover:bg-accent/40"
        )}
      >
        <div
          className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <span className={cn(
            "font-medium text-sm truncate",
            (selected && selected.materiaalnaam) ? "text-emerald-500" : "text-muted-foreground"
          )}>
            {label}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:justify-end">
            {(selected && selected.materiaalnaam) ? (
              <>
                <span className="text-xs font-medium text-emerald-500 break-words text-left sm:text-right leading-tight">
                  {selected.materiaalnaam}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
              </>
            ) : (
              <div className={cn(
                "flex items-center gap-1.5 text-xs shrink-0 ml-auto sm:ml-0 transition-colors",
                isSubSection
                  ? "text-muted-foreground/50 hover:text-muted-foreground/80"
                  : "text-emerald-600 hover:text-emerald-500 font-medium"
              )}>
                <Plus className={cn("h-3.5 w-3.5", isSubSection && "opacity-60")} />
                <span>{isSubSection ? '+ Toevoegen' : 'Materiaal toevoegen'}</span>
              </div>
            )}
          </div>

          {((selected && selected.materiaalnaam) || isCustom) && onRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteConfOpen(true);
              }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteConfOpen} onOpenChange={setDeleteConfOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{selected?.materiaalnaam}</strong> wilt verwijderen uit dit slot?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild onClick={(e) => { e.stopPropagation(); setDeleteConfOpen(false); }}>
              <Button variant="ghost">Annuleren</Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                if (onRemove) onRemove();
                setDeleteConfOpen(false);
              }}
              asChild
            >
              <Button variant="destructiveSoft">Verwijderen</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ==================================
// MULTI-ENTRY MATERIAL SLOT
// ==================================

interface MultiEntryEntry {
  id: string;
  material: any;
  aantal: number;
}

interface MultiEntrySlotData {
  _multiEntry: true;
  entries: MultiEntryEntry[];
}

interface PendingSafetyItem {
  id: string;
  status: 'analyzing' | 'needs_answer' | 'saving' | 'error';
  question: string;
  expectedUnit: string;
  answer: string;
  questions: PendingSafetyQuestion[];
  error?: string | null;
  draftPayload: Record<string, unknown>;
}

function isMultiEntrySlot(val: any): val is MultiEntrySlotData {
  return val && val._multiEntry === true && Array.isArray(val.entries);
}

function MultiEntryMaterialSlot({
  sectionLabel,
  sectionKey,
  slotData,
  maxEntries,
  onAddEntry,
  onEditEntry,
  onRemoveEntry,
  onUpdateAantal,
}: {
  sectionLabel: string;
  sectionKey: string;
  slotData: MultiEntrySlotData | null;
  maxEntries?: number | null;
  onAddEntry: () => void;
  onEditEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onUpdateAantal: (entryId: string, aantal: number) => void;
}) {
  const entries = slotData?.entries || [];
  const maxAllowedEntries =
    typeof maxEntries === 'number' && Number.isFinite(maxEntries) && maxEntries > 0
      ? Math.max(1, Math.floor(maxEntries))
      : null;
  const canAddEntry = maxAllowedEntries === null || entries.length < maxAllowedEntries;
  const [deleteConfId, setDeleteConfId] = useState<string | null>(null);
  const [aantalDrafts, setAantalDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const validIds = new Set(entries.map((entry) => entry.id));
    setAantalDrafts((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([entryId, draft]) => {
        if (validIds.has(entryId)) {
          next[entryId] = draft;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [entries]);

  const handleAantalDraftChange = useCallback((entryId: string, rawValue: string) => {
    if (!/^\d*$/.test(rawValue)) return;
    setAantalDrafts((prev) => ({ ...prev, [entryId]: rawValue }));
  }, []);

  const commitAantalDraft = useCallback((entryId: string) => {
    setAantalDrafts((prev) => {
      const draft = prev[entryId];
      if (draft === undefined) return prev;

      const parsed = draft.trim() === '' ? 0 : parseInt(draft, 10);
      const safeAantal = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      onUpdateAantal(entryId, safeAantal);

      const { [entryId]: _removed, ...rest } = prev;
      return rest;
    });
  }, [onUpdateAantal]);

  const getAantalValueForEntry = useCallback((entryId: string, fallbackAantal: number) => {
    const draft = aantalDrafts[entryId];
    if (draft === undefined) return fallbackAantal;
    const parsed = draft.trim() === '' ? 0 : parseInt(draft, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackAantal;
  }, [aantalDrafts]);

  const applyAantalValue = useCallback((entryId: string, nextAantal: number) => {
    const safeAantal = Number.isFinite(nextAantal) && nextAantal >= 0
      ? Math.max(0, Math.round(nextAantal))
      : 0;
    setAantalDrafts((prev) => {
      if (prev[entryId] === undefined) return prev;
      const { [entryId]: _removed, ...rest } = prev;
      return rest;
    });
    onUpdateAantal(entryId, safeAantal);
  }, [onUpdateAantal]);

  const adjustAantal = useCallback((entryId: string, fallbackAantal: number, delta: number) => {
    const currentValue = getAantalValueForEntry(entryId, fallbackAantal);
    applyAantalValue(entryId, currentValue + delta);
  }, [applyAantalValue, getAantalValueForEntry]);

  if (entries.length === 0) {
    return (
      <div
        onClick={canAddEntry ? onAddEntry : undefined}
        className={cn(
          "group relative flex items-center justify-between py-1.5 px-4 rounded-lg border border-border transition-all",
          canAddEntry ? "hover:bg-accent/40 cursor-pointer" : "opacity-70 cursor-not-allowed"
        )}
      >
        <span className="font-medium text-sm text-muted-foreground">{sectionLabel}</span>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-500 font-medium">
          <Plus className="h-3.5 w-3.5" />
          <span>Materiaal toevoegen</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => (
        <React.Fragment key={entry.id}>
          <div
            onClick={() => onEditEntry(entry.id)}
            className="group relative flex flex-col sm:flex-row sm:items-center justify-between py-1.5 px-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 transition-all gap-1 sm:gap-4 cursor-pointer"
          >
            <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
              <span className="font-medium text-sm text-emerald-500 truncate">
                {entry.material?.materiaalnaam || sectionLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 border-emerald-500/30 bg-background/70 hover:bg-emerald-500/10 touch-manipulation"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    adjustAantal(entry.id, typeof entry.aantal === 'number' ? entry.aantal : 0, -1);
                  }}
                  aria-label="Aantal verlagen"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={aantalDrafts[entry.id] ?? String(typeof entry.aantal === 'number' ? entry.aantal : 0)}
                  onChange={(e) => handleAantalDraftChange(entry.id, e.target.value)}
                  onBlur={() => commitAantalDraft(entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  className="h-9 sm:h-8 w-16 text-sm text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 border-emerald-500/30 bg-background/70 hover:bg-emerald-500/10 touch-manipulation"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    adjustAantal(entry.id, typeof entry.aantal === 'number' ? entry.aantal : 0, 1);
                  }}
                  aria-label="Aantal verhogen"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">stuks</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteConfId(entry.id);
                }}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <AlertDialog open={deleteConfId === entry.id} onOpenChange={(open) => { if (!open) setDeleteConfId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je <strong>{entry.material?.materiaalnaam}</strong> wilt verwijderen?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild onClick={(e) => { e.stopPropagation(); setDeleteConfId(null); }}>
                  <Button variant="ghost">Annuleren</Button>
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEntry(entry.id);
                    setDeleteConfId(null);
                  }}
                  asChild
                >
                  <Button variant="destructiveSoft">Verwijderen</Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </React.Fragment>
      ))}

      {canAddEntry && (
        <div
          onClick={onAddEntry}
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer"
        >
          <PlusCircle className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-500">{sectionLabel} toevoegen</span>
        </div>
      )}
    </div>
  );
}

// ==================================
// DIALOG COMPONENTS
// ==================================

function SavePresetDialog({ open, onOpenChange, onSave, jobTitel, presets, defaultName }: any) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasInitializedForOpenRef = useRef(false);
  const existingPreset = useMemo(() => {
    if (!name.trim()) return null;
    return presets.find((p: any) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  }, [name, presets]);

  useEffect(() => {
    if (!open) {
      hasInitializedForOpenRef.current = false;
      return;
    }
    if (hasInitializedForOpenRef.current) return;

    if (defaultName) {
      setName(defaultName);
      const p = presets.find((x: any) => x.name === defaultName);
      if (p) setIsDefault(p.isDefault);
    } else {
      setName('');
      setIsDefault(false);
    }
    hasInitializedForOpenRef.current = true;
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
          <DialogTitle>{existingPreset ? 'Werkpakket bijwerken' : 'Werkpakket opslaan'}</DialogTitle>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave} disabled={!name || isSaving} variant="outline" className={cn(existingPreset ? DESTRUCTIVE_BTN_SOFT : POSITIVE_BTN_SOFT)}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isSaving ? 'Bezig...' : existingPreset ? 'Overschrijven' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveComponentPresetDialog({ open, onOpenChange, componentType, existingPresets, onSave }: any) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const existingPreset = useMemo(() => {
    if (!name.trim()) return null;
    return (existingPresets || []).find((p: any) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  }, [name, existingPresets]);

  useEffect(() => { if (open) { setName(''); } }, [open]);

  const handleSave = async () => {
    if (!name) return;
    setIsSaving(true);
    await onSave(name);
    setIsSaving(false);
    onOpenChange(false);
  };

  const title = componentType ? (COMPONENT_REGISTRY[componentType]?.title || componentType) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>{existingPreset ? 'Werkpakket bijwerken' : 'Werkpakket opslaan'}</DialogTitle>
          <DialogDescription>{existingPreset ? `Overschrijven: "${existingPreset.name}"` : `Materialen opslaan voor ${title}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="comp-preset-name">Naam *</Label>
            <Input id="comp-preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`bv. Standaard ${title}`} className={cn(existingPreset && "border-red-500/50 focus-visible:ring-red-500")} />
            {existingPreset && <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-2 rounded-md border border-red-500/20"><Settings className="h-4 w-4" /><span>Let op: naam bestaat al. Wordt overschreven.</span></div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
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
          <DialogHeader><DialogTitle>Werkpakketten beheren</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm py-8 text-center">Geen werkpakketten gevonden.</p>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Sluiten</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg w-full max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
        <DialogHeader><DialogTitle>Werkpakketten beheren</DialogTitle><DialogDescription>Beheer uw opgeslagen presets.</DialogDescription></DialogHeader>
        <div className="py-4 space-y-2">
          {presets.map((preset: any) => (
            <div key={preset.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
              <span className="text-sm font-medium">{preset.name} {preset.isDefault && <span className="text-xs text-muted-foreground ml-2">(standaard)</span>}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onSetDefault(preset)} disabled={preset.isDefault} className="hover:bg-emerald-600/10"><Star className="mr-2 h-4 w-4" /> Standaard</Button>
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

function AddExtraMaterialDialog({ open, onOpenChange, onAdd }: any) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
    }
  }, [open]);

  const handleAdd = () => {
    if (title.trim()) {
      onAdd(title.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-md w-full', DIALOG_CLOSE_TAP)}>
        <DialogHeader>
          <DialogTitle>Extra materiaal toevoegen</DialogTitle>
          <DialogDescription>Geef het materiaal een naam</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <Label htmlFor="extra-material-title">Naam *</Label>
            <Input
              id="extra-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bv. Extra bevestigingsmateriaal"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdd();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button
            onClick={handleAdd}
            disabled={!title.trim()}
            variant="outline"
            className={cn(POSITIVE_BTN_SOFT)}
          >
            Toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================================
// MAIN COMPONENT
// ==================================

export default function GenericMaterialsPageRedesigned() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const quoteId = params.id as string;
  const klusId = params.klusId as string;
  const categorySlug = params.category as string;
  const jobSlug = params.slug as string;
  const isSchuttingHoutJob = categorySlug === 'schutting' && jobSlug === 'schutting-hout';
  const isGevelbekledingJob = categorySlug === 'gevelbekleding' || jobSlug.includes('gevelbekleding');
  const specificJobConfig = getJobConfig(jobSlug);
  const showOpeningsSection = specificJobConfig.sections.includes('openingen');

  const categoryConfig = JOB_REGISTRY[categorySlug];
  const jobConfig = categoryConfig?.items.find((item) => item.slug === jobSlug);
  const materialSections = useMemo(() => {
    const baseSections = jobConfig?.materialSections || [];
    if (!isSchuttingHoutJob) return baseSections;
    return baseSections.filter((section: any) => section.key !== 'kozijnbalken');
  }, [jobConfig, isSchuttingHoutJob]);

  // Group sections by category
  const groupedSections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const seenByCategory: Record<string, Set<string>> = {};

    materialSections.forEach(section => {
      const cat = section.category || 'extra';
      if (!seenByCategory[cat]) seenByCategory[cat] = new Set<string>();
      if (seenByCategory[cat].has(section.key)) return;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(section);
      seenByCategory[cat].add(section.key);
    });

    return groups;
  }, [materialSections]);

  const JOB_KEY = jobSlug;
  const JOB_TITEL = jobConfig?.title || 'Klus';

  const PRESET_GROUP = useMemo(() => getPresetGroup(JOB_KEY), [JOB_KEY]);
  const PRESET_KEY = useMemo(() => getPresetKey(JOB_KEY), [JOB_KEY]);
  const PRESET_COMPATIBLE_JOB_TYPES = useMemo(() => getPresetCompatibleJobTypes(JOB_KEY), [JOB_KEY]);
  const PRESET_KEY_NORMALIZED = useMemo(() => normalizePresetIdentity(PRESET_KEY), [PRESET_KEY]);
  const PRESET_COMPATIBLE_JOB_TYPES_SET = useMemo(
    () => new Set(PRESET_COMPATIBLE_JOB_TYPES.map((value) => normalizePresetIdentity(value))),
    [PRESET_COMPATIBLE_JOB_TYPES]
  );

  const isPresetCompatible = useCallback((preset: any) => {
    const presetGroup = normalizePresetIdentity(preset?.presetGroup);
    if (presetGroup && presetGroup === PRESET_KEY_NORMALIZED) return true;

    const rawPresetJobType = String(preset?.jobType || '').trim();
    if (!rawPresetJobType) return false;

    const canonicalPresetJobType = normalizePresetIdentity(resolvePresetJobTypeAlias(rawPresetJobType));
    if (canonicalPresetJobType && PRESET_COMPATIBLE_JOB_TYPES_SET.has(canonicalPresetJobType)) return true;

    const presetJobType = normalizePresetIdentity(rawPresetJobType);
    return PRESET_COMPATIBLE_JOB_TYPES_SET.has(presetJobType);
  }, [PRESET_COMPATIBLE_JOB_TYPES_SET, PRESET_KEY_NORMALIZED]);

  const mapPresetSlotsForJob = useCallback((slots: Record<string, string> | undefined, currentJobType: string) => {
    if (!slots) return slots;
    const next = { ...slots };

    const isVoorzetwand = currentJobType === 'hsb-voorzetwand' || currentJobType === 'metalstud-voorzetwand';
    const isTussenwand = currentJobType === 'hsb-tussenwand';
    const isGevelbekleding = isGevelbekledingJobType(currentJobType);

    if (isTussenwand) {
      if (slots.constructieplaat && !slots.constructieplaat_1) next.constructieplaat_1 = slots.constructieplaat;
      if (slots.constructieplaat && !slots.constructieplaat_2) next.constructieplaat_2 = slots.constructieplaat;
      if (slots.afwerkplaat && !slots.afwerkplaat_1) next.afwerkplaat_1 = slots.afwerkplaat;
      if (slots.afwerkplaat && !slots.afwerkplaat_2) next.afwerkplaat_2 = slots.afwerkplaat;
    }

    if (isVoorzetwand) {
      if (!slots.constructieplaat) {
        const fallback = slots.constructieplaat_1 || slots.constructieplaat_2;
        if (fallback) next.constructieplaat = fallback;
      }
      if (!slots.afwerkplaat) {
        const fallback = slots.afwerkplaat_1 || slots.afwerkplaat_2 || slots.beplating_1 || slots.beplating_2 || slots.beplating;
        if (fallback) next.afwerkplaat = fallback;
      }

      delete next.constructieplaat_1;
      delete next.constructieplaat_2;
      delete next.afwerkplaat_1;
      delete next.afwerkplaat_2;
      delete next.beplating_1;
      delete next.beplating_2;
      delete next.beplating;
    }

    if (isGevelbekleding) {
      const legacyTengel = next.tengelwerk || next.tengels;
      const legacyRachel = next.rachelwerk || next.rachels;
      const legacyCombined = next.regelwerk_basis;

      if (!next.tengelwerk_basis) {
        const fallback = legacyTengel || legacyCombined;
        if (fallback) next.tengelwerk_basis = fallback;
      }

      if (!next.rachelwerk_basis) {
        const fallback = legacyRachel || legacyCombined;
        if (fallback) next.rachelwerk_basis = fallback;
      }

      delete next.regelwerk_basis;
      delete next.tengelwerk;
      delete next.tengels;
      delete next.rachelwerk;
      delete next.rachels;
    }

    return next;
  }, []);

  const normalizeSelectedMaterialsForJob = useCallback((
    selected: Record<string, any>,
    currentJobType: string,
    options?: { forcePresetAantalOne?: boolean }
  ) => {
    const next = { ...selected };
    const forcePresetAantalOne = options?.forcePresetAantalOne === true;

    const isVoorzetwand = currentJobType === 'hsb-voorzetwand' || currentJobType === 'metalstud-voorzetwand';
    const isTussenwand = currentJobType === 'hsb-tussenwand';
    const isVlieringMaken = currentJobType === 'vliering-maken';
    const isGevelbekleding = isGevelbekledingJobType(currentJobType);
    const multiEntrySectionKeys = new Set(
      (materialSections || [])
        .filter((section) => section.multiEntry)
        .map((section) => section.key)
    );

    if (isTussenwand) {
      if (next.constructieplaat && !next.constructieplaat_1) next.constructieplaat_1 = next.constructieplaat;
      if (next.constructieplaat && !next.constructieplaat_2) next.constructieplaat_2 = next.constructieplaat;
      if (next.afwerkplaat && !next.afwerkplaat_1) next.afwerkplaat_1 = next.afwerkplaat;
      if (next.afwerkplaat && !next.afwerkplaat_2) next.afwerkplaat_2 = next.afwerkplaat;

      if (next.constructieplaat_1 && !next.constructieplaat_2) next.constructieplaat_2 = next.constructieplaat_1;
      if (next.constructieplaat_2 && !next.constructieplaat_1) next.constructieplaat_1 = next.constructieplaat_2;
      if (next.afwerkplaat_1 && !next.afwerkplaat_2) next.afwerkplaat_2 = next.afwerkplaat_1;
      if (next.afwerkplaat_2 && !next.afwerkplaat_1) next.afwerkplaat_1 = next.afwerkplaat_2;
    }

    if (isVoorzetwand) {
      if (!next.constructieplaat) next.constructieplaat = next.constructieplaat_1 || next.constructieplaat_2;
      if (!next.afwerkplaat) next.afwerkplaat = next.afwerkplaat_1 || next.afwerkplaat_2 || next.beplating_1 || next.beplating_2 || next.beplating;

      delete next.constructieplaat_1;
      delete next.constructieplaat_2;
      delete next.afwerkplaat_1;
      delete next.afwerkplaat_2;
      delete next.beplating_1;
      delete next.beplating_2;
      delete next.beplating;
    }

    if (isVlieringMaken) {
      const legacyConstructieBalken = next.constructie_balken || next.vloerbalken || next.randbalken || next.muurplaat;
      if (legacyConstructieBalken) {
        next.constructie_balken = legacyConstructieBalken;
      }

      delete next.vloerbalken;
      delete next.randbalken;
      delete next.muurplaat;
    }

    if (isGevelbekleding) {
      const legacyTengel = next.tengelwerk || next.tengels;
      const legacyRachel = next.rachelwerk || next.rachels;
      const legacyCombined = next.regelwerk_basis;

      if (!next.tengelwerk_basis) {
        const fallback = legacyTengel || legacyCombined;
        if (fallback) next.tengelwerk_basis = fallback;
      }

      if (!next.rachelwerk_basis) {
        const fallback = legacyRachel || legacyCombined;
        if (fallback) next.rachelwerk_basis = fallback;
      }

      delete next.regelwerk_basis;
      delete next.tengelwerk;
      delete next.tengels;
      delete next.rachelwerk;
      delete next.rachels;
    }

    // Backward compatibility: when a section switched to multi-entry,
    // convert existing single-value selections into one entry row.
    multiEntrySectionKeys.forEach((sectionKey) => {
      const value = next[sectionKey];
      if (!value || isMultiEntrySlot(value)) return;
      if (typeof value !== 'object' || Array.isArray(value)) return;

      const rawAantal = Number((value as any).aantal);
      const legacyAantal = forcePresetAantalOne
        ? 1
        : (Number.isFinite(rawAantal) && rawAantal > 0 ? Math.max(1, Math.round(rawAantal)) : 1);
      const fallbackId = `${sectionKey}__legacy`;
      const generatedId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : fallbackId;

      next[sectionKey] = {
        _multiEntry: true,
        entries: [
          {
            id: generatedId,
            material: value,
            aantal: legacyAantal,
          }
        ],
      } as MultiEntrySlotData;
    });

    return next;
  }, [materialSections]);

  // Calculate which component types are active for this job configuration


  // State
  const [isMounted, setIsMounted] = useState(false);
  const [isPaginaLaden, setPaginaLaden] = useState(true);
  const [isOpslaan, setIsOpslaan] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false); // ✅ Fix for race condition

  const [alleMaterialen, setAlleMaterialen] = useState<any[]>([]);
  const [isMaterialenLaden, setMaterialenLaden] = useState(true);
  const [foutMaterialen, setFoutMaterialen] = useState<string | null>(null);

  const [presets, setPresets] = useState<any[]>([]);
  const [gekozenPresetId, setGekozenPresetId] = useState<string>('default');
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [presetPickerSearch, setPresetPickerSearch] = useState('');
  const [isPresetsLaden, setPresetsLaden] = useState(false);
  const [hasLoadedPresetsOnce, setHasLoadedPresetsOnce] = useState(false);

  const [gekozenMaterialen, setGekozenMaterialen] = useState<Record<string, any | undefined>>({});
  const [wasteByEntryKey, setWasteByEntryKey] = useState<Record<string, number>>({});
  const [sectionCategoryOverrides, setSectionCategoryOverrides] = useState<Record<string, string | string[]>>({});
  // extraMaterials state removed - unified into customGroups
  const [customGroups, setCustomGroups] = useState<any[]>([]);
  const [firestoreCustommateriaal, setFirestoreCustommateriaal] = useState<any | null>(null);

  const [kleinMateriaalConfig, setKleinMateriaalConfig] = useState<any>({ mode: 'inschatting', percentage: null, fixedAmount: null });
  const [kleinVastBedragStr, setKleinVastBedragStr] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [hiddenCategories, setHiddenCategories] = useState<Record<string, boolean>>({});

  const [actieveSectie, setActieveSectie] = useState<string | null>(null);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<any | null>(null);
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [favorieten, setFavorieten] = useState<string[]>([]);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [addExtraMaterialOpen, setAddExtraMaterialOpen] = useState(false);
  const [newExtraMaterialTitle, setNewExtraMaterialTitle] = useState('');
  const [isMaterialExportOpen, setIsMaterialExportOpen] = useState(false);
  const [materialExportMeta, setMaterialExportMeta] = useState<MaterialListExportMeta>({
    offerteNummer: '',
    klantNaam: '',
  });
  const [materialSuppliers, setMaterialSuppliers] = useState<LeverancierContact[]>([]);
  const [defaultMaterialSupplierId, setDefaultMaterialSupplierId] = useState('');

  // Missing price dialog
  const [missingPriceItems, setMissingPriceItems] = useState<any[]>([]);
  const [showMissingPriceDialog, setShowMissingPriceDialog] = useState(false);
  const [pendingNavigateTo, setPendingNavigateTo] = useState<string | null>(null);
  const [missingPriceInputsExcl, setMissingPriceInputsExcl] = useState<Record<string, string>>({});
  const [missingPriceInputsIncl, setMissingPriceInputsIncl] = useState<Record<string, string>>({});
  const [missingPriceEenheden, setMissingPriceEenheden] = useState<Record<string, string>>({});
  const [missingPriceSaved, setMissingPriceSaved] = useState<Record<string, boolean>>({});
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [pendingSafetyItems, setPendingSafetyItems] = useState<PendingSafetyItem[]>([]);
  const [components, setComponents] = useState<JobComponent[]>([]);

  const materialByAnyId = useMemo(() => {
    const map = new Map<string, any>();
    (alleMaterialen || []).forEach((materiaal: any) => {
      getMaterialIdCandidates(materiaal).forEach((id) => {
        if (!map.has(id)) map.set(id, materiaal);
      });
    });
    return map;
  }, [alleMaterialen]);

  const findMaterialByAnyId = useCallback((id: any) => {
    const normalized = normalizeMaterialId(id);
    if (!normalized) return null;
    return materialByAnyId.get(normalized) || null;
  }, [materialByAnyId]);

  const materialByName = useMemo(() => {
    const map = new Map<string, any>();
    (alleMaterialen || []).forEach((materiaal: any) => {
      const nameCandidates = [
        normalizeMaterialName(materiaal?.materiaalnaam),
        normalizeMaterialName(materiaal?._raw?.materiaalnaam),
      ].filter(Boolean) as string[];

      nameCandidates.forEach((name) => {
        if (!map.has(name)) map.set(name, materiaal);
      });
    });
    return map;
  }, [alleMaterialen]);

  // Multi-entry material slots state
  // When set, the modal adds/replaces a specific entry in a multiEntry slot
  const [activeMultiEntryKey, setActiveMultiEntryKey] = useState<string | null>(null); // section.key
  const [activeMultiEntryId, setActiveMultiEntryId] = useState<string | null>(null); // entry id (null = adding new)
  const [activeSectionMeta, setActiveSectionMeta] = useState<{ key: string; label?: string; categoryFilter?: string | string[]; categoryUltraFilter?: string } | null>(null);

  // Per-component werkpakket presets
  const [componentPresets, setComponentPresets] = useState<Record<string, any[]>>({});
  const [componentPresetSelection, setComponentPresetSelection] = useState<Record<string, string>>({});
  const [saveComponentPresetOpen, setSaveComponentPresetOpen] = useState(false);
  const [saveComponentPresetType, setSaveComponentPresetType] = useState<string | null>(null);
  const [saveComponentPresetCompId, setSaveComponentPresetCompId] = useState<string | null>(null);
  const userHeeftPresetGewijzigdRef = useRef(false);
  const isHydratingRef = useRef(true);
  const hasSavedConfigRef = useRef(false);
  const autoApplyDefaultPresetRef = useRef(false);
  const userHiddenPrefsRef = useRef<Record<string, boolean> | null>(null); // Store loaded user prefs to prevent race condition
  const hasAttemptedPresetSlotRepairRef = useRef(false);
  const lastPresetLoadIssueKeyRef = useRef<string | null>(null);

  const defaultPresetCandidate = useMemo(() => (
    presets.find((p) => p.isDefault) || presets.find((p) => (p.name || '').toLowerCase().includes('standaard')) || null
  ), [presets]);

  const hasAnyMaterialSelections = useMemo(() => {
    return Object.keys(gekozenMaterialen || {}).length > 0 || customGroups.length > 0;
  }, [gekozenMaterialen, customGroups.length]);

  const isPresetNotReadyForSave = useMemo(() => {
    if (isPaginaLaden || isMaterialenLaden || !hasLoadedPresetsOnce || isPresetsLaden || isApplyingPreset) return true;

    const shouldAutoApplyDefaultPreset =
      !!defaultPresetCandidate &&
      gekozenPresetId === 'default' &&
      customGroups.length === 0 &&
      !userHeeftPresetGewijzigdRef.current &&
      !hasSavedConfigRef.current;

    const hasSelectedPreset = gekozenPresetId !== 'default' && presets.some((p) => p.id === gekozenPresetId);
    const shouldApplySelectedPresetFromWorkMethod =
      hasSelectedPreset &&
      !userHeeftPresetGewijzigdRef.current &&
      !hasSavedConfigRef.current &&
      !hasAnyMaterialSelections;

    return shouldAutoApplyDefaultPreset || shouldApplySelectedPresetFromWorkMethod;
  }, [
    isPaginaLaden,
    isMaterialenLaden,
    hasLoadedPresetsOnce,
    isPresetsLaden,
    isApplyingPreset,
    defaultPresetCandidate,
    gekozenPresetId,
    customGroups.length,
    presets,
    hasAnyMaterialSelections,
  ]);

  const normalizeCategoryFilter = (raw?: string | string[]) => {
    if (!raw) return undefined;
    if (typeof raw === 'string' && raw.includes(',')) {
      return raw.split(',').map((s: string) => s.trim());
    }
    return raw;
  };

  const activeSectionCategoryOverride = useMemo(() => {
    if (!actieveSectie) return undefined;
    return sectionCategoryOverrides[actieveSectie];
  }, [actieveSectie, sectionCategoryOverrides]);

  const memoizedDefaultCategory = useMemo(() => {
    if (!actieveSectie) return undefined;
    if (activeSectionCategoryOverride) return normalizeCategoryFilter(activeSectionCategoryOverride);
    if (isSchuttingHoutJob) return 'Tuinhout';

    // 1) Primary: exact key match in current job-registry sections
    const byKey = materialSections.find((s) => s.key === actieveSectie)?.categoryFilter;
    if (byKey) return normalizeCategoryFilter(byKey);

    // 2) If this is a component section, prefer a 1:1 label match in current job-registry
    if (activeSectionMeta?.label) {
      const wanted = activeSectionMeta.label.toLowerCase().trim();
      const byLabel = materialSections.find(
        (s) => (s.label || '').toLowerCase().trim() === wanted
      )?.categoryFilter;
      if (byLabel) return normalizeCategoryFilter(byLabel);
    }

    // 3) Fallback to the component section's own categoryFilter
    return normalizeCategoryFilter(activeSectionMeta?.categoryFilter);
  }, [actieveSectie, materialSections, activeSectionMeta, activeSectionCategoryOverride, isSchuttingHoutJob]);

  const handleModalCategoryFilterChange = useCallback((nextCategoryFilter: string | string[]) => {
    if (!actieveSectie) return;
    setSectionCategoryOverrides((prev) => {
      const next = { ...prev };
      const shouldReset =
        nextCategoryFilter === 'all'
        || (Array.isArray(nextCategoryFilter) && nextCategoryFilter.length === 0);

      if (shouldReset) {
        if (!(actieveSectie in next)) return prev;
        delete next[actieveSectie];
        return next;
      }

      next[actieveSectie] = nextCategoryFilter;
      return next;
    });
  }, [actieveSectie]);

  const normalizeComponentType = (type: string | null | undefined): string | null => {
    if (!type) return null;
    return type;
  };

  // Calculate which component types are active for this job configuration
  const activeComponentTypes = useMemo(() => {
    const types = new Set<string>();
    const categories = Object.keys(jobConfig?.categoryConfig || MATERIAL_CATEGORY_INFO);
    const isComplex = (
      jobSlug.includes('hsb')
      || jobSlug.includes('metalstud')
      || jobSlug.includes('wand')
      || jobSlug.includes('dak')
      || jobSlug.includes('hellend')
      || jobSlug.includes('plat')
      || jobSlug.includes('kozijn')
      || jobSlug.includes('deur')
      || jobSlug.includes('boeiboord')
      || jobSlug.includes('afwerking')
      || jobSlug.includes('gevelbekleding')
      || categorySlug === 'gevelbekleding'
    );
    const isCeiling = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');

    categories.forEach(key => {
      const k = key.toString();
      const lower = k.toLowerCase();

      let type: string | null = null;

      if (isComplex) {
        if (k === 'Kozijnen' || lower === 'kozijnen') type = 'kozijn';
        else if (k === 'Deuren' || lower === 'deuren') type = 'deur';
        else if (k === 'boeiboord' || lower === 'boeiboorden') type = 'boeiboord';
        else if (k === 'Koof') type = 'koof';
        else if (k === 'Installatie' || k === 'Schakelmateriaal') type = 'installatie';
        else if (k === 'Dagkant' || lower === 'dagkant') type = 'dagkant';
        else if (k === 'Vensterbank' || lower === 'vensterbank') {
          type = isGevelbekledingJob ? 'waterslag' : 'vensterbank';
        }
        else if (k === 'daktrim' || lower === 'daktrim') type = 'daktrim';
      }

      if (isCeiling) {
        if (k === 'Toegang' || k === 'Vliering_Toegang' || lower.includes('vlizotrap') || lower.includes('toegang')) type = 'vlizotrap';
        else if (k === 'Koof') type = 'koof';
        else if (lower.includes('plafond') || lower.includes('vliering')) type = 'plafond';

        // Always allow plafond for ceiling jobs, even if not explicitly in categories (as it might be added via "extra" logic)
        types.add('plafond');
      }

      if (k === 'gips_afwerking' || lower.includes('gips')) type = 'gips';

      if (type) types.add(type);
    });

    return types;
  }, [jobConfig, categorySlug, jobSlug]);

  const sectionLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    (materialSections || []).forEach((s: any) => {
      if (s?.key) map[s.key] = s?.label || s.key;
    });
    return map;
  }, [materialSections]);

  const materialExportItems = useMemo<MaterialListExportItem[]>(() => {
    const out: MaterialListExportItem[] = [];

    const pushExportItem = (material: any, bron: string, aantal = 1) => {
      const merged = mergeMaterialForPriceCheck(material);
      if (!merged) return;

      const naam = String(merged.materiaalnaam || merged._raw?.materiaalnaam || '').trim();
      if (!naam) return;

      const eenheid = String(merged.eenheid || merged._raw?.eenheid || 'stuk').trim() || 'stuk';
      const prijsExcl = getPositivePriceFromMaterial(merged);
      const safeAantal = Number.isFinite(aantal) && aantal > 0 ? Math.round(aantal) : 1;
      const materialId = merged.row_id || merged.material_ref_id || merged.id || naam;

      out.push({
        key: `${materialId}-${out.length}`,
        naam,
        bron,
        eenheid,
        aantal: safeAantal,
        prijsExclBtw: typeof prijsExcl === 'number' ? Number(prijsExcl.toFixed(2)) : null,
      });
    };

    Object.entries(gekozenMaterialen || {}).forEach(([sectionKey, value]: [string, any]) => {
      if (!value) return;
      const sectionLabel = sectionLabelByKey[sectionKey] || sectionKey;
      if (isMultiEntrySlot(value)) {
        value.entries.forEach((entry: MultiEntryEntry) => {
          pushExportItem(entry.material, sectionLabel, entry.aantal);
        });
        return;
      }
      pushExportItem(value, sectionLabel, 1);
    });

    customGroups.forEach((group: any) => {
      const material = group?.materials?.[0];
      if (!material) return;
      const groupLabel = String(group?.title || 'Extra materiaal').trim() || 'Extra materiaal';
      pushExportItem(material, `Extra - ${groupLabel}`, 1);
    });

    components.forEach((component) => {
      const registrySections = COMPONENT_REGISTRY[component.type as JobComponentType]?.defaultMaterials || [];
      const componentLabel = String(
        component.label
          || COMPONENT_REGISTRY[component.type as JobComponentType]?.title
          || component.type
          || 'Onderdeel',
      ).trim();

      (component.materials || []).forEach((entry: any) => {
        const sectionKey = String(entry?.sectionKey || '');
        const registrySection = registrySections.find((section: any) => section.key === sectionKey);
        const sectionLabel = registrySection?.label || sectionLabelByKey[sectionKey] || sectionKey || 'Materiaal';
        pushExportItem(entry?.material || entry, `${componentLabel} - ${sectionLabel}`, 1);
      });
    });

    return out;
  }, [gekozenMaterialen, customGroups, components, sectionLabelByKey]);

  const materialExportContext = useMemo<MaterialListExportMeta>(() => ({
    ...materialExportMeta,
    klusTitel: JOB_TITEL,
  }), [materialExportMeta, JOB_TITEL]);

  const saveMaterialSupplierSettings = useCallback(async (
    nextSuppliersInput: LeverancierContact[],
    preferredDefaultSupplierId?: string,
  ): Promise<string> => {
    if (!user || !firestore) {
      throw new Error('Gebruiker of database niet beschikbaar.');
    }

    const normalizedSuppliers = normalizeLeverancierContactList(nextSuppliersInput);
    const resolvedDefaultSupplierId = pickDefaultLeverancierId(
      preferredDefaultSupplierId ?? defaultMaterialSupplierId,
      normalizedSuppliers,
    );

    await setDoc(doc(firestore, 'users', user.uid), {
      settings: {
        leveranciers: normalizedSuppliers,
        defaultLeverancierId: resolvedDefaultSupplierId,
      },
    }, { merge: true });

    setMaterialSuppliers(normalizedSuppliers);
    setDefaultMaterialSupplierId(resolvedDefaultSupplierId);
    return resolvedDefaultSupplierId;
  }, [user, firestore, defaultMaterialSupplierId]);

  const handleUpdateMaterialSupplierContact = useCallback(async ({
    supplierId,
    contactNaam,
    email,
  }: {
    supplierId: string;
    contactNaam: string;
    email: string;
  }): Promise<void> => {
    const resolvedSupplierId = String(supplierId || '').trim();
    if (!resolvedSupplierId) {
      throw new Error('Geen leverancier geselecteerd.');
    }

    const trimmedContactNaam = String(contactNaam || '').trim();
    const trimmedEmail = String(email || '').trim();

    if (!trimmedEmail) {
      throw new Error('E-mailadres ontbreekt.');
    }

    const nextSuppliers = (materialSuppliers || []).map((supplier) => (
      supplier.id === resolvedSupplierId
        ? {
          ...supplier,
          contactNaam: trimmedContactNaam,
          email: trimmedEmail,
        }
        : supplier
    ));

    await saveMaterialSupplierSettings(nextSuppliers, defaultMaterialSupplierId || resolvedSupplierId);
  }, [materialSuppliers, saveMaterialSupplierSettings, defaultMaterialSupplierId]);

  const handleCreateMaterialSupplier = useCallback(async ({
    naam,
    contactNaam,
    email,
  }: {
    naam: string;
    contactNaam: string;
    email: string;
  }): Promise<string> => {
    const trimmedNaam = String(naam || '').trim();
    const trimmedContactNaam = String(contactNaam || '').trim();
    const trimmedEmail = String(email || '').trim();

    if (!trimmedNaam) {
      throw new Error('Leveranciersnaam ontbreekt.');
    }
    if (!trimmedEmail) {
      throw new Error('E-mailadres ontbreekt.');
    }

    const newSupplier: LeverancierContact = {
      id: crypto.randomUUID(),
      naam: trimmedNaam,
      contactNaam: trimmedContactNaam,
      email: trimmedEmail,
    };

    const nextSuppliers = [...(materialSuppliers || []), newSupplier];
    await saveMaterialSupplierSettings(nextSuppliers, newSupplier.id);
    return newSupplier.id;
  }, [materialSuppliers, saveMaterialSupplierSettings]);

  const orphanedComponents = components.filter((c) => {
    const normalizedType = normalizeComponentType(c.type);
    return !normalizedType || !activeComponentTypes.has(normalizedType);
  });

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === gekozenPresetId) || null,
    [presets, gekozenPresetId]
  );

  const presetCards = useMemo(() => {
    const keyToLabel = new Map<string, string>();
    const sectionOrder = new Map<string, number>();
    (materialSections || []).forEach((section: any) => {
      if (section?.key) {
        keyToLabel.set(section.key, section?.label || section.key);
        sectionOrder.set(section.key, sectionOrder.size);
      }
    });

    const defaultCard = {
      id: 'default',
      name: 'Nieuw',
      isDefault: false,
      summary: 'Start zonder werkpakket',
      chips: [] as string[],
      isBuiltIn: true,
    };

    const cards = (presets || []).map((preset: any) => {
      const mappedSlots = mapPresetSlotsForJob(preset?.slots || {}, JOB_KEY) || {};
      const slotKeys = Object.keys(mappedSlots).sort((a, b) => {
        const orderA = sectionOrder.has(a) ? sectionOrder.get(a)! : Number.MAX_SAFE_INTEGER;
        const orderB = sectionOrder.has(b) ? sectionOrder.get(b)! : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const labelA = keyToLabel.get(a) || sectionLabelByKey[a] || a;
        const labelB = keyToLabel.get(b) || sectionLabelByKey[b] || b;
        return labelA.localeCompare(labelB, 'nl');
      });
      const slotLabels = Array.from(new Set(slotKeys.map((key) => keyToLabel.get(key) || sectionLabelByKey[key] || key)));
      const componentsCount = Array.isArray(preset?.components) ? preset.components.length : 0;
      const customCount = preset?.custommateriaal && typeof preset.custommateriaal === 'object'
        ? Object.keys(preset.custommateriaal).length
        : 0;

      const summaryParts: string[] = [];
      if (slotKeys.length > 0) summaryParts.push(`${slotKeys.length} materiaal${slotKeys.length === 1 ? '' : 'en'}`);
      if (componentsCount > 0) summaryParts.push(`${componentsCount} onderdeel${componentsCount === 1 ? '' : 'en'}`);
      if (customCount > 0) summaryParts.push(`${customCount} extra`);

      return {
        ...preset,
        summary: summaryParts.join(' · ') || 'Geen ingevulde keuzes',
        chips: slotLabels,
        isBuiltIn: false,
      };
    });

    return [defaultCard, ...cards];
  }, [presets, materialSections, mapPresetSlotsForJob, JOB_KEY, sectionLabelByKey]);

  const filteredPresetCards = useMemo(() => {
    const q = presetPickerSearch.trim().toLowerCase();
    if (!q) return presetCards;
    return presetCards.filter((preset: any) => {
      const haystack = `${preset.name || ''} ${preset.summary || ''} ${(preset.chips || []).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [presetCards, presetPickerSearch]);

  const isBuiltInPresetCard = useCallback((preset: any) => preset?.id === 'default' || preset?.isBuiltIn, []);

  const builtInPresetCards = useMemo(
    () => filteredPresetCards.filter((preset: any) => isBuiltInPresetCard(preset)),
    [filteredPresetCards, isBuiltInPresetCard]
  );

  const customPresetCards = useMemo(
    () => filteredPresetCards.filter((preset: any) => !isBuiltInPresetCard(preset)),
    [filteredPresetCards, isBuiltInPresetCard]
  );

  const renderPresetPickerCard = (preset: any, hasCustomPresets: boolean) => {
    const isSelected = gekozenPresetId === preset.id;
    const isBuiltIn = isBuiltInPresetCard(preset);
    const presetSummary = String(preset.summary || 'Geen beschrijving').replace(/materiaalen/gi, 'materialen');
    const selectPreset = () => {
      onPresetChange(preset.id);
      setPresetPickerOpen(false);
    };

    return (
      <div key={preset.id} className={cn(isBuiltIn ? 'mb-4' : '')}>
        <div
          className={cn(
            "group relative w-full text-left rounded-xl border border-l-4 px-4 transition-all duration-200",
            isBuiltIn ? "py-2.5" : "py-3",
            isSelected
              ? "border-white/20 border-l-white/30 bg-card/60 shadow-[0_10px_24px_-18px_rgba(255,255,255,0.35)]"
              : "border-white/10 border-l-white/10 bg-card/40 hover:bg-card/60 hover:border-white/20 hover:border-l-white/20"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={selectPreset}
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-md"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  {isBuiltIn ? (
                    <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Box className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  <span className={cn(
                    "truncate text-zinc-100",
                    isBuiltIn ? "text-sm font-semibold" : "text-base font-bold"
                  )}>
                    {preset.name}
                  </span>
                  <span className="truncate text-sm text-zinc-400">
                    {presetSummary}
                  </span>
                </div>

                {Array.isArray(preset.chips) && preset.chips.length > 0 ? (
                  <div className="flex flex-wrap gap-1 overflow-hidden max-h-12">
                    {preset.chips.map((chip: string) => (
                      <span
                        key={`${preset.id}-${chip}`}
                        className="shrink-0 whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-zinc-400"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {!isBuiltIn ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 text-muted-foreground/40 hover:text-yellow-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePresetSetDefaultWrapper(preset);
                  }}
                  disabled={preset.isDefault}
                  title={preset.isDefault ? 'Al standaard' : 'Maak standaard'}
                >
                  <Star className={cn("h-6 w-6", preset.isDefault ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")} />
                </Button>
              ) : null}
              {!isBuiltIn ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePresetDeleteWrapper(preset);
                  }}
                  title="Verwijderen"
                >
                  <Trash2 className="h-6 w-6" />
                </Button>
              ) : null}
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </div>
          </div>
        </div>
        {isBuiltIn && hasCustomPresets ? (
          <div className="mt-3 border-t border-border/70" />
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    if (!presetPickerOpen) setPresetPickerSearch('');
  }, [presetPickerOpen]);

  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [variantPickerType, setVariantPickerType] = useState<JobComponentType | null>(null);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);

  const resetActiveMaterialModalState = useCallback(() => {
    setActiveComponentId(null);
    setActieveSectie(null);
    setActiveSectionMeta(null);
    setActiveGroupId(null);
    setActiveMultiEntryKey(null);
    setActiveMultiEntryId(null);
  }, []);

  const currentlyPickedMaterialId = useMemo(() => {
    if (activeGroupId) {
      const g = customGroups.find(x => x.id === activeGroupId);
      return g?.materials?.[0]?.row_id || g?.materials?.[0]?.id;
    }
    if (activeComponentId && actieveSectie) {
      const comp = components.find(c => c.id === activeComponentId);
      const matEntry = (comp?.materials as any[])?.find((m: any) => m.sectionKey === actieveSectie);
      return matEntry?.material?.row_id || matEntry?.material?.id;
    }
    if (activeMultiEntryKey && actieveSectie && activeMultiEntryId) {
      const slot = gekozenMaterialen[activeMultiEntryKey];
      if (isMultiEntrySlot(slot)) {
        const entry = slot.entries.find(e => e.id === activeMultiEntryId);
        return entry?.material?.row_id || entry?.material?.id;
      }
    }
    if (actieveSectie) {
      // For multi-entry without a specific entry selected (adding a new one), we don't have a "current"
      if (activeMultiEntryKey) return undefined;

      const mat = gekozenMaterialen[actieveSectie];
      return mat?.row_id || mat?.id;
    }
    return undefined;
  }, [activeGroupId, activeComponentId, actieveSectie, activeMultiEntryKey, activeMultiEntryId, customGroups, components, gekozenMaterialen]);

  const [klus, setKlus] = useState<Job | null>(null);
  const [notities, setNotities] = useState('');
  const [notesPlaceholderIndex, setNotesPlaceholderIndex] = useState(0);
  const [notesPlaceholderCursor, setNotesPlaceholderCursor] = useState(0);
  const [notesPlaceholderPhase, setNotesPlaceholderPhase] = useState<'typing' | 'holding' | 'deleting'>('typing');
  const [notesReduceMotion, setNotesReduceMotion] = useState(false);
  const notesWasEmptyRef = useRef(true);

  const notesPlaceholderMessage = NOTES_PLACEHOLDER_MESSAGES[notesPlaceholderIndex % NOTES_PLACEHOLDER_MESSAGES.length];
  const notesShouldAnimatePlaceholder = !notesReduceMotion && notities.trim().length === 0;
  const notesPlaceholderText = notesReduceMotion
    ? NOTES_PLACEHOLDER_MESSAGES[0]
    : notesShouldAnimatePlaceholder
      ? notesPlaceholderMessage.slice(0, notesPlaceholderCursor)
      : notesPlaceholderMessage;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setNotesReduceMotion(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const isEmpty = notities.trim().length === 0;
    if (isEmpty && !notesWasEmptyRef.current) {
      setNotesPlaceholderIndex(0);
      setNotesPlaceholderCursor(0);
      setNotesPlaceholderPhase('typing');
    }
    notesWasEmptyRef.current = isEmpty;
  }, [notities]);

  useEffect(() => {
    if (!notesShouldAnimatePlaceholder) return;

    let timeout: ReturnType<typeof setTimeout>;
    if (notesPlaceholderPhase === 'typing') {
      if (notesPlaceholderCursor < notesPlaceholderMessage.length) {
        const delay = notesPlaceholderCursor === 0 ? NOTES_PLACEHOLDER_START_DELAY_MS : NOTES_PLACEHOLDER_TYPING_MS;
        timeout = setTimeout(() => setNotesPlaceholderCursor((prev) => prev + 1), delay);
      } else {
        timeout = setTimeout(() => setNotesPlaceholderPhase('holding'), NOTES_PLACEHOLDER_HOLD_MS);
      }
    } else if (notesPlaceholderPhase === 'holding') {
      timeout = setTimeout(() => setNotesPlaceholderPhase('deleting'), NOTES_PLACEHOLDER_HOLD_MS);
    } else {
      if (notesPlaceholderCursor > 0) {
        timeout = setTimeout(() => setNotesPlaceholderCursor((prev) => prev - 1), NOTES_PLACEHOLDER_DELETE_MS);
      } else {
        setNotesPlaceholderPhase('typing');
        setNotesPlaceholderIndex((prev) => (prev + 1) % NOTES_PLACEHOLDER_MESSAGES.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [
    notesShouldAnimatePlaceholder,
    notesPlaceholderPhase,
    notesPlaceholderCursor,
    notesPlaceholderMessage,
  ]);

  // === BEAM HEIGHT WARNING ===
  // Calculate warning when selected beam length is too close to wall height
  const beamHeightWarning = useMemo(() => {
    // Only relevant for wall jobs
    if (!jobSlug.includes('wand') && !jobSlug.includes('hsb') && !jobSlug.includes('metalstud')) {
      return null;
    }

    // Get wall height from maatwerk data
    const maatwerkKey = `${jobSlug}_maatwerk`;
    const maatwerkItems = (klus as any)?.[maatwerkKey] || [];
    if (!Array.isArray(maatwerkItems) || maatwerkItems.length === 0) return null;

    const wallHeight = maatwerkItems[0]?.hoogte;
    if (!wallHeight || typeof wallHeight !== 'number') return null;

    // Get selected beam material
    const staandersKeys = ['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'];
    let beamMaterial: any = null;
    for (const key of staandersKeys) {
      if (gekozenMaterialen[key]) {
        beamMaterial = gekozenMaterialen[key]._raw || gekozenMaterialen[key];
        break;
      }
    }
    if (!beamMaterial) return null;

    // Parse beam length from material
    const beamLength = (() => {
      const val = beamMaterial.lengte;

      // Try direct number (already in mm)
      if (typeof val === 'number') return val;

      // Try string with unit (e.g., "300cm" or "3000mm")
      if (typeof val === 'string') {
        const cleaned = val.replace(',', '.').toLowerCase().trim();

        // Check for cm suffix - convert to mm
        if (cleaned.endsWith('cm')) {
          const num = parseFloat(cleaned.replace('cm', ''));
          if (!isNaN(num)) return num * 10; // cm to mm
        }

        // Check for mm suffix
        if (cleaned.endsWith('mm')) {
          const num = parseFloat(cleaned.replace('mm', ''));
          if (!isNaN(num)) return num;
        }

        // Try plain number (assume mm if large, cm if small)
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          return num < 100 ? num * 10 : num; // Assume cm if < 100
        }
      }

      // Fallback: parse from material name (e.g., "44x69mm 3000mm lang")
      const name = beamMaterial.materiaalnaam || '';
      const mmMatch = name.match(/(\d{3,4})mm\s*lang/i);
      if (mmMatch) {
        return parseInt(mmMatch[1], 10);
      }

      return null;
    })();
    if (!beamLength) return null;

    // Calculate remaining space
    // Warn ONLY if beam is shorter than wall (too short)
    if (beamLength < wallHeight) {
      const missingLength = wallHeight - beamLength;
      return {
        wallHeight,
        beamLength,
        missingLength,
        isMsg: true,
        isTooShort: true,
        materialName: beamMaterial.materiaalnaam || 'Gekozen balk'
      };
    }

    return null;
  }, [jobSlug, klus, gekozenMaterialen]);



  const handleComponentMaterialSelect = (compId: string, sectionKey: string, material: any) => {
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      // Store materials in a generic internal selection array: { sectionKey, material }
      const current = (comp.materials || []) as any[];
      // Remove existing for this section
      const others = current.filter((m: any) => m.sectionKey !== sectionKey);
      return { ...comp, materials: [...others, { sectionKey, material }] };
    }));
  };

  const handleComponentMaterialRemove = (compId: string, sectionKey: string) => {
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      const current = (comp.materials || []) as any[];
      return { ...comp, materials: current.filter((m: any) => m.sectionKey !== sectionKey) };
    }));
  };

  // Component Deletion Confirmation
  const [componentDeleteId, setComponentDeleteId] = useState<string | null>(null);

  const handleComponentDelete = (compId: string) => {
    setComponents(prev => prev.filter(c => c.id !== compId));
  };

  const getPresetMaterialsForType = useCallback((type: JobComponentType) => {
    const activePreset = presets.find(p => p.id === gekozenPresetId);
    if (!activePreset) return [];

    // 1. Try component templates (saved components in werkpakket)
    if (activePreset.components) {
      const template = activePreset.components.find((c: any) => c.type === type);
      if (template?.materials) return template.materials;
      if (template?.materiaalKeuzes) {
        return Object.entries(template.materiaalKeuzes).map(([key, mat]) => ({
          sectionKey: key,
          material: mat
        }));
      }
    }

    // 2. Fallback: match from global slots using COMPONENT_REGISTRY defaultMaterials
    const config = COMPONENT_REGISTRY[type];
    const mappedSlots = mapPresetSlotsForJob(activePreset.slots, JOB_KEY);
    if (config?.defaultMaterials && mappedSlots && alleMaterialen.length) {
      const materials: any[] = [];
      for (const section of config.defaultMaterials) {
        const matId = mappedSlots[section.key];
        if (matId) {
          const found = findMaterialByAnyId(matId);
          if (found) materials.push({ sectionKey: section.key, material: found });
        }
      }
      if (materials.length > 0) return materials;
    }

    return [];
  }, [presets, gekozenPresetId, alleMaterialen, JOB_KEY, mapPresetSlotsForJob, normalizeSelectedMaterialsForJob, findMaterialByAnyId]);

  const getVariantItemsForType = useCallback((type: JobComponentType | null): any[] => {
    if (!type) return [];
    let items: any[] = [];
    if (type === 'kozijn') items = JOB_REGISTRY.kozijnen.items;
    else if (type === 'deur') items = JOB_REGISTRY.deuren.items;
    else if (type === 'plafond') items = JOB_REGISTRY.plafonds.items;
    else if (type === 'dagkant' || type === 'vensterbank') items = JOB_REGISTRY.afwerkingen.items;

    if (type === 'dagkant' || type === 'vensterbank') {
      return items.filter(i => i.title.toLowerCase().includes(type.toLowerCase()));
    }
    return items;
  }, []);

  const addComponentFromVariant = useCallback((type: JobComponentType, item: any, idx = 0) => {
    const newItem = {
      id: `${type}-${Date.now()}-${idx}`,
      type,
      label: item.title,
      slug: item.slug,
      measurements: {},
      materials: getPresetMaterialsForType(type)
    };
    setComponents(prev => [...prev, newItem]);
  }, [getPresetMaterialsForType]);

  const openVariantPickerOrAdd = useCallback((type: JobComponentType) => {
    const items = getVariantItemsForType(type);
    if (items.length === 1) {
      addComponentFromVariant(type, items[0], 0);
      return;
    }
    setVariantPickerType(type);
    setVariantPickerOpen(true);
  }, [getVariantItemsForType, addComponentFromVariant]);

  // Safeguard state
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [presetConfirmOpen, setPresetConfirmOpen] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const handleApplyComponentPreset = useCallback((presetId: string, componentType: string, compId: string) => {
    const preset = (componentPresets[componentType] || []).find((p: any) => p.id === presetId);
    if (!preset?.materials) return;
    setComponents(prev => prev.map(comp => {
      if (comp.id !== compId) return comp;
      return { ...comp, materials: JSON.parse(JSON.stringify(preset.materials)) };
    }));
  }, [componentPresets]);

  const getDefaultComponentPreset = useCallback((type: string) => {
    const list = componentPresets[type] || [];
    return list.find((p: any) => p.isDefault) || list.find((p: any) => (p.name || '').toLowerCase().includes('standaard'));
  }, [componentPresets]);

  // Auto-apply standaard werkpakket per component (only when empty)
  useEffect(() => {
    if (!components.length) return;
    if (!Object.keys(componentPresets).length) return;

    setComponentPresetSelection(prev => {
      let next = prev;
      let changed = false;

      components.forEach(comp => {
        if (next[comp.id]) return;
        if ((comp.materials || []).length > 0) return;

        const def = getDefaultComponentPreset(comp.type);
        if (!def) return;

        if (next === prev) next = { ...prev };
        next[comp.id] = def.id;
        changed = true;

        handleApplyComponentPreset(def.id, comp.type, comp.id);
      });

      return changed ? next : prev;
    });
  }, [components, componentPresets, getDefaultComponentPreset, handleApplyComponentPreset]);

  useEffect(() => {
    if (!isGevelbekledingJob) return;
    setComponents(prev => {
      let changed = false;
      const next = prev.map(comp => {
        if (comp.type !== 'koof') return comp;
        const current = (comp.materials || []) as any[];
        const filtered = current.filter((m: any) => !['constructieplaat', 'koof_constructieplaat', 'koof_beplating'].includes(String(m.sectionKey)));
        if (filtered.length === current.length) return comp;
        changed = true;
        return { ...comp, materials: filtered };
      });
      return changed ? next : prev;
    });
  }, [isGevelbekledingJob]);

  // Load User Preferences (Hidden Categories) - job-type dependent
  useEffect(() => {
    if (!user || !firestore || !jobSlug) return;
    const loadUserPrefs = async () => {
      try {
        const ref = doc(firestore, 'users', user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const hiddenByJob = data.hidden_categories_by_job;
          const collapsedByJob = data.collapsed_sections_by_job;

          let loadedHiddenPrefs: Record<string, boolean> | null = null;

          console.log('[DEBUG] Loading prefs for jobSlug:', jobSlug);
          console.log('[DEBUG] hidden_categories_by_job:', hiddenByJob);
          console.log('[DEBUG] hidden_categories_by_job[jobSlug]:', hiddenByJob?.[jobSlug]);
          console.log('[DEBUG] legacy hidden_categories:', data.hidden_categories);

          // Priority 1: Check for job-specific preferences (new format)
          if (hiddenByJob && typeof hiddenByJob === 'object' && hiddenByJob[jobSlug]) {
            loadedHiddenPrefs = hiddenByJob[jobSlug];
            console.log('[DEBUG] ✅ Using hidden_categories_by_job for', jobSlug, ':', loadedHiddenPrefs);
          }
          // Priority 2: Legacy fallback (old format - only if new format doesn't exist for this job)
          else if (data.hidden_categories && typeof data.hidden_categories === 'object') {
            loadedHiddenPrefs = data.hidden_categories;
            console.log('[DEBUG] ⚠️ Falling back to legacy hidden_categories:', loadedHiddenPrefs);
          }
          // No preferences found
          else {
            console.log('[DEBUG] ❌ No hidden prefs found for', jobSlug);
          }

          if (loadedHiddenPrefs) {
            // Store in ref so hydration can access it
            userHiddenPrefsRef.current = loadedHiddenPrefs;
            // Also apply immediately
            console.log('[DEBUG] Applying hiddenPrefs to state:', loadedHiddenPrefs);
            setHiddenCategories(prev => ({ ...prev, ...loadedHiddenPrefs }));
          }

          if (collapsedByJob && typeof collapsedByJob === 'object' && collapsedByJob[jobSlug]) {
            setCollapsedSections(prev => ({ ...prev, ...collapsedByJob[jobSlug] }));
          }
        }
      } catch (e) {
        console.error("Error loading user prefs", e);
      }
    };
    loadUserPrefs();
  }, [user, firestore, jobSlug]);

  // Fetch Materials
  const fetchMaterials = useCallback(async () => {
    // Determine token for API call
    if (!user) return; // Wait for user
    setMaterialenLaden(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/materialen/get', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Fout bij ophalen');
      }

      const materialenData = (json.data || []).map((m: any) => {
        const exclPrice = getExclPriceFromMaterial(m);
        const rawCategorie = String(m.categorie || '').trim();
        const rawSubsectie = String(m.subsectie || m.sub_categorie || '').trim();
        const effectiveCategorie = rawCategorie || 'Overig';
        const effectiveSubsectie = rawSubsectie || 'Overig';
        return {
          ...m, // Keep all raw fields
          _raw: m, // Store exact raw object for pristine saving
          id: m.row_id || m.id,
          // In de offerte-flow is prijs_per_stuk excl. btw.
          prijs: exclPrice || 0,
          prijs_per_stuk: exclPrice || 0,
          prijs_excl_btw: exclPrice,
          // Map standard keys for UI filtering
          categorie: effectiveCategorie,
          subsectie: effectiveSubsectie,
          leverancier: m.merk || m.leverancier,
        };
      });

      setAlleMaterialen(materialenData);
    } catch (err) {
      console.error("Fetch materials error:", err);
      setFoutMaterialen('Kon materialen niet laden.');
    } finally {
      setMaterialenLaden(false);
    }
  }, [user]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  // Fetch Presets
  useEffect(() => {
    if (!user || !firestore) {
      setPresetsLaden(false);
      setHasLoadedPresetsOnce(true);
      return;
    }
    const fetchPresets = async () => {
      setPresetsLaden(true);
      try {
        const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const fetched = querySnapshot.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data };
        });

        const compatible = fetched.filter((preset: any) => isPresetCompatible(preset));
        setPresets(compatible);

        const legacyMigrations: Array<{ id: string; updates: Record<string, unknown> }> = [];
        compatible.forEach((preset: any) => {
          const rawJobType = String(preset?.jobType || '').trim();
          const canonicalJobType = resolvePresetJobTypeAlias(rawJobType);
          const rawPresetGroup = String(preset?.presetGroup || '').trim();
          const expectedPresetGroup = getPresetGroup(canonicalJobType);
          const updates: Record<string, unknown> = {};

          const jobTypeChanged =
            normalizePresetIdentity(rawJobType)
            && normalizePresetIdentity(rawJobType) !== normalizePresetIdentity(canonicalJobType);
          if (jobTypeChanged) {
            updates.jobType = canonicalJobType;
          }

          if (expectedPresetGroup) {
            if (normalizePresetIdentity(rawPresetGroup) !== normalizePresetIdentity(expectedPresetGroup)) {
              updates.presetGroup = expectedPresetGroup;
            }
          }

          if (Object.keys(updates).length === 0) return;
          legacyMigrations.push({
            id: String(preset.id),
            updates: {
              ...updates,
              updatedAt: serverTimestamp(),
            },
          });
        });

        if (legacyMigrations.length > 0) {
          void Promise.all(
            legacyMigrations.map((migration) =>
              setDoc(doc(firestore, 'presets', migration.id), migration.updates, { merge: true })
            )
          ).catch((error) => {
            console.error('Kon preset migratie niet opslaan:', error);
          });
        }
      } catch (e) { console.error(e); } finally {
        setPresetsLaden(false);
        setHasLoadedPresetsOnce(true);
      }
    };
    fetchPresets();
  }, [user, firestore, JOB_KEY, isPresetCompatible]);

  // One-time repair for presets with stale slot IDs after catalog re-sync.
  useEffect(() => {
    if (hasAttemptedPresetSlotRepairRef.current) return;
    if (!user || !firestore) return;
    if (isPresetsLaden || isMaterialenLaden) return;
    if (!presets.length || !alleMaterialen.length) return;

    const brokenPresets = presets.filter((preset: any) => {
      const slots = preset?.slots && typeof preset.slots === 'object' ? preset.slots : {};
      return Object.values(slots).some((slotId: any) => {
        const normalized = normalizeMaterialId(slotId);
        return normalized && !findMaterialByAnyId(normalized);
      });
    });

    hasAttemptedPresetSlotRepairRef.current = true;
    if (!brokenPresets.length) return;

    let cancelled = false;

    const toMillis = (value: any): number => {
      if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
      const parsed = Date.parse(String(value ?? ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const repairPresetSlots = async () => {
      try {
        const candidatePresetIds = new Set<string>(brokenPresets.map((preset: any) => String(preset.id)));
        const quoteQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
        const quoteSnapshot = await getDocs(quoteQuery);

        type SlotCandidate = {
          materialName: string;
          materialId: string | null;
          updatedAtMs: number;
        };

        const candidatesByPresetAndSection = new Map<string, Map<string, SlotCandidate[]>>();
        const candidatesByOldMaterialId = new Map<string, SlotCandidate[]>();

        quoteSnapshot.docs.forEach((quoteDoc) => {
          const quoteData = quoteDoc.data() as any;
          const quoteUpdatedAtMs = Math.max(
            toMillis(quoteData?.updatedAt),
            toMillis(quoteData?.createdAt)
          );
          const klussen = quoteData?.klussen;
          if (!klussen || typeof klussen !== 'object') return;

          Object.values(klussen).forEach((klusRaw: any) => {
            const klus = klusRaw as any;
            const workMethodId = String(klus?.werkwijze?.workMethodId || '').trim();
            const isRelevantPreset = !!workMethodId && candidatePresetIds.has(workMethodId);

            const materialenLijst = klus?.materialen?.materialen_lijst;
            if (!materialenLijst || typeof materialenLijst !== 'object') return;

            Object.values(materialenLijst).forEach((entryRaw: any) => {
              const entry = entryRaw as any;
              const sectionKey = String(entry?.sectionKey || '').trim();
              if (!sectionKey) return;

              const material = entry?.material && typeof entry.material === 'object'
                ? entry.material
                : entry;
              const materialName = normalizeMaterialName(material?.materiaalnaam);
              if (!materialName) return;

              const materialId = normalizeMaterialId(
                material?.material_ref_id || material?.row_id || material?.id
              );

              const candidate: SlotCandidate = {
                materialName,
                materialId,
                updatedAtMs: quoteUpdatedAtMs,
              };

              if (isRelevantPreset) {
                if (!candidatesByPresetAndSection.has(workMethodId)) {
                  candidatesByPresetAndSection.set(workMethodId, new Map<string, SlotCandidate[]>());
                }
                const sectionMap = candidatesByPresetAndSection.get(workMethodId)!;
                if (!sectionMap.has(sectionKey)) {
                  sectionMap.set(sectionKey, []);
                }
                sectionMap.get(sectionKey)!.push(candidate);
              }

              if (materialId) {
                if (!candidatesByOldMaterialId.has(materialId)) {
                  candidatesByOldMaterialId.set(materialId, []);
                }
                candidatesByOldMaterialId.get(materialId)!.push(candidate);
              }
            });
          });
        });

        const updates: Array<{ id: string; slots: Record<string, string> }> = [];

        brokenPresets.forEach((preset: any) => {
          const presetId = String(preset.id);
          const slots = preset?.slots && typeof preset.slots === 'object'
            ? { ...(preset.slots as Record<string, any>) }
            : {};
          let changed = false;
          const sectionCandidates = candidatesByPresetAndSection.get(presetId);

          Object.entries(slots).forEach(([sectionKey, slotIdRaw]) => {
            const slotId = normalizeMaterialId(slotIdRaw);
            if (!slotId || findMaterialByAnyId(slotId)) return;

            const candidates = sectionCandidates?.get(sectionKey) || [];
            const exactOldId = candidates.find((candidate) => candidate.materialId === slotId);
            const bySectionCandidate = exactOldId || [...candidates].sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];
            const byOldIdCandidate = [...(candidatesByOldMaterialId.get(slotId) || [])]
              .sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];
            const bestCandidate = bySectionCandidate || byOldIdCandidate;
            if (!bestCandidate) return;

            const matchedMaterial = materialByName.get(bestCandidate.materialName);
            const nextSlotId = normalizeMaterialId(
              matchedMaterial?.id || matchedMaterial?.row_id || matchedMaterial?.material_ref_id
            );
            if (!nextSlotId) return;

            slots[sectionKey] = nextSlotId;
            changed = true;
          });

          if (changed) {
            updates.push({
              id: presetId,
              slots: slots as Record<string, string>,
            });
          }
        });

        if (!updates.length || cancelled) return;

        await Promise.all(
          updates.map((update) =>
            setDoc(
              doc(firestore, 'presets', update.id),
              {
                slots: update.slots,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
          )
        );

        if (cancelled) return;

        const updatedSlotsByPresetId = new Map<string, Record<string, string>>(
          updates.map((update) => [update.id, update.slots])
        );
        setPresets((prev) =>
          prev.map((preset) =>
            updatedSlotsByPresetId.has(String(preset.id))
              ? { ...preset, slots: updatedSlotsByPresetId.get(String(preset.id)) }
              : preset
          )
        );

        toast({
          title: 'Werkpakketten hersteld',
          description: `${updates.length} werkpakket(ten) opnieuw gekoppeld aan actuele materialen.`,
        });
      } catch (error) {
        console.error('Kon werkpakket-ID migratie niet uitvoeren:', error);
      }
    };

    void repairPresetSlots();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    firestore,
    isPresetsLaden,
    isMaterialenLaden,
    presets,
    alleMaterialen,
    findMaterialByAnyId,
    materialByName,
    toast,
  ]);

  // Fetch per-component werkpakket presets
  useEffect(() => {
    if (!user || !firestore) return;
    const fetchComponentPresets = async () => {
      try {
        const q = query(collection(firestore, 'component_presets'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const grouped: Record<string, any[]> = {};
        snap.docs.forEach(d => {
          const data = { id: d.id, ...d.data() };
          const type = (data as any).componentType;
          if (!type) return;
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(data);
        });
        setComponentPresets(grouped);
      } catch (e) { console.error('Error fetching component presets:', e); }
    };
    fetchComponentPresets();
  }, [user, firestore]);

  const handleSaveComponentPreset = async (presetName: string, componentType: string, compId: string) => {
    if (!user || !firestore) return;
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    const presetData: any = {
      userId: user.uid,
      componentType,
      name: presetName,
      materials: JSON.parse(JSON.stringify(comp.materials || [])),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    const existing = (componentPresets[componentType] || []).find(
      (p: any) => p.name.trim().toLowerCase() === presetName.trim().toLowerCase()
    );
    const docRef = existing ? doc(firestore, 'component_presets', existing.id) : doc(collection(firestore, 'component_presets'));
    if (existing) delete presetData.createdAt;
    await setDoc(docRef, presetData, { merge: true });
    const saved = { id: docRef.id, ...presetData };
    setComponentPresets(prev => {
      const list = (prev[componentType] || []).filter(p => p.id !== docRef.id);
      return { ...prev, [componentType]: [...list, saved] };
    });
    return saved;
  };


  // Favorites
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    try {
      const newKey = `calvora:favorieten:${user.uid}`;
      const legacyKey = `offertehulp:favorieten:${user.uid}`;
      const saved = localStorage.getItem(newKey) ?? localStorage.getItem(legacyKey);
      if (saved) setFavorieten(JSON.parse(saved));
    } catch (e) { console.error(e); }
  }, [user]);

  const toggleFavoriet = useCallback((id: string) => {
    if (!user) return;
    setFavorieten((prev) => {
      let next;
      if (prev.includes(id)) next = prev.filter((fid) => fid !== id);
      else next = [...prev, id];
      localStorage.setItem(`calvora:favorieten:${user.uid}`, JSON.stringify(next));
      return next;
    });
  }, [user]);

  // Merge favorites into materials for the modal
  const enrichedMaterials = useMemo(() => {
    return alleMaterialen.map(m => ({
      ...m,
      isFavorite: favorieten.includes(m.id)
    }));
  }, [alleMaterialen, favorieten]);

  // Hydrate from Firestore
  useEffect(() => {
    if (!firestore || !quoteId || !klusId) return;
    const hydrate = async () => {
      setPaginaLaden(true);
      try {
        const quoteRef = doc(firestore, 'quotes', quoteId);
        let snap = await getDoc(quoteRef);
        if (!snap.exists()) return;
        let data = snap.data() as Record<string, any>;

        const legacyMaterialenLijstKey = `klussen.${klusId}.materialen.materialen_lijst`;
        const legacySavedAtKey = `klussen.${klusId}.materialen.savedAt`;
        const legacyUpdatedAtKey = `klussen.${klusId}.updatedAt`;
        const legacyMaterialenLijst = data?.[legacyMaterialenLijstKey];
        if (legacyMaterialenLijst && typeof legacyMaterialenLijst === 'object') {
          try {
            await updateDoc(quoteRef, {
              [`klussen.${klusId}.materialen.materialen_lijst`]: legacyMaterialenLijst,
              [`klussen.${klusId}.materialen.savedAt`]: serverTimestamp(),
              [`klussen.${klusId}.updatedAt`]: serverTimestamp(),
            });

            await (updateDoc as any)(
              quoteRef,
              new FieldPath(legacyMaterialenLijstKey),
              deleteField(),
              new FieldPath(legacySavedAtKey),
              deleteField(),
              new FieldPath(legacyUpdatedAtKey),
              deleteField()
            );

            snap = await getDoc(quoteRef);
            if (snap.exists()) {
              data = snap.data() as Record<string, any>;
            }
          } catch (repairErr) {
            console.warn('Kon legacy materiaalvelden met punt-notatie niet herstellen:', repairErr);
          }
        }
        const klusNode = data?.klussen?.[klusId];

        const klantInfo = data?.klantinformatie && typeof data.klantinformatie === 'object'
          ? data.klantinformatie
          : {};
        const klantNaam = [
          String(klantInfo?.voornaam || '').trim(),
          String(klantInfo?.achternaam || '').trim(),
        ].filter(Boolean).join(' ').trim()
          || String(klantInfo?.bedrijfsnaam || '').trim();
        const offerteNummer = String(data?.offerteNummer || '').trim();
        let senderCompanyName = '';
        let senderContactName = '';

        if (user) {
          const userSettingsSnap = await getDoc(doc(firestore, 'users', user.uid));
          const rawSettings = userSettingsSnap.exists()
            ? (userSettingsSnap.data()?.settings || {})
            : {};
          senderCompanyName = String(rawSettings?.bedrijfsnaam || '').trim();
          senderContactName = String(rawSettings?.contactNaam || '').trim();
          const leveranciers = normalizeLeverancierContactList(rawSettings?.leveranciers);
          const defaultLeverancierId = pickDefaultLeverancierId(rawSettings?.defaultLeverancierId, leveranciers);
          setMaterialSuppliers(leveranciers);
          setDefaultMaterialSupplierId(defaultLeverancierId);
        } else {
          setMaterialSuppliers([]);
          setDefaultMaterialSupplierId('');
        }

        setMaterialExportMeta({
          offerteNummer,
          klantNaam,
          senderCompanyName,
          senderContactName,
        });

        if (klusNode) setKlus(klusNode as unknown as Job);

        const maatwerkNode = klusNode?.maatwerk;
        const materialenLijstNode = klusNode?.materialen?.materialen_lijst || {};

        // Reconstruct components from maatwerk.toevoegingen + materialen_lijst
        const toevoegingen = maatwerkNode?.toevoegingen || [];
        let currentComponents: JobComponent[];

        if (Array.isArray(toevoegingen) && toevoegingen.length > 0) {
          currentComponents = toevoegingen.map((t: any, idx: number) => {
            const compId = t.id || `toevoeging_${idx}`;

            // Reconstruct materials from materialen_lijst entries with comp_ prefix
            const compMaterials: any[] = [];
            Object.entries(materialenLijstNode).forEach(([key, entry]: [string, any]) => {
              if (key.startsWith(`comp_${compId}_`)) {
                compMaterials.push({
                  sectionKey: entry.sectionKey,
                  material: entry.material,
                });
              }
            });

            return {
              id: compId,
              type: normalizeComponentType(t.type) || t.type,
              label: t.label,
              measurements: t.afmetingen || {},
              materials: compMaterials,
              slug: t.slug,
            } as JobComponent;
          });
        } else if (Array.isArray(klusNode?.components) && klusNode.components.length > 0) {
          // Fallback: legacy components field for old data
          currentComponents = klusNode.components.map((c: any) => ({
            ...c,
            type: normalizeComponentType(c?.type) || c?.type,
          }));
        } else {
          currentComponents = [];
        }

        setComponents(currentComponents);

        if (klusNode?.materialen) {
          const mat = klusNode.materialen;
          // Prefer new structure 'materialen_lijst'
          const materialenLijst = mat.materialen_lijst || {};
          const pendingMaterialsMap = mat.pending_materials || {};

          // Separate standard selections from custom groups based on known section keys vs arbitrary keys
          // We can use the fact that custom groups usually have 'title' and 'order' saved, while standard ones don't (or don't need them)
          // OR simply: use the active sections logic to pick out standard ones.

          const newGekozen: Record<string, any> = {};
          const newCustomGroupsMap: Record<string, any> = {};
          const newWasteByEntryKey: Record<string, number> = {};

          // Helper to identify standard keys
          // We'll trust that standard keys are specific slugs (not uuids). 
          // But to be robust, let's look at the structure.
          // Custom items we saved have { title, order, ... }
          // Standard items { materiaalnaam, ... }

          // Fallback to old 'selections' and 'custommateriaal' if 'materialen_lijst' is empty/missing
          // (Legacy support for existing quotes)
          if (Object.keys(materialenLijst).length === 0 && (mat.selections || mat.custommateriaal)) {
            Object.assign(newGekozen, mat.selections || {});
            Object.assign(newCustomGroupsMap, mat.custommateriaal || {});

            // Legacy legacy support
            const legacyExtra = mat.extraMaterials || [];
            if (Array.isArray(legacyExtra) && legacyExtra.length > 0) {
              legacyExtra.forEach((m: any, idx: number) => {
                const gid = `legacy_${m.id}_${idx}`;
                newCustomGroupsMap[gid] = {
                  id: m.id,
                  title: m.materiaalnaam || 'Extra',
                  order: 9000 + idx
                };
              });
            }

            Object.entries(newGekozen).forEach(([key, val]: [string, any]) => {
              if (typeof val?.wastePercentage === 'number') {
                const sectionKeyForWaste =
                  typeof val?.sectionKey === 'string' ? val.sectionKey : key;
                newWasteByEntryKey[key] = normalizeSavedWastePercentage(
                  val.wastePercentage,
                  sectionKeyForWaste,
                  key,
                  val?.context,
                  val?.material?.materiaalnaam
                );
              }
            });
            Object.entries(newCustomGroupsMap).forEach(([key, val]: [string, any]) => {
              if (typeof val?.wastePercentage === 'number') {
                newWasteByEntryKey[key] = val.wastePercentage;
              }
            });
          } else {
            // New structure distribution
            // First pass: collect multi-entry items grouped by their base sectionKey
            const multiEntryGroups: Record<string, MultiEntryEntry[]> = {};

            Object.entries(materialenLijst).forEach(([key, val]: [string, any]) => {
              if (key.startsWith('comp_') || val?.type === 'component_material') {
                if (typeof val?.wastePercentage === 'number') {
                  const sectionKeyForWaste =
                    typeof val?.sectionKey === 'string' ? val.sectionKey : null;
                  newWasteByEntryKey[key] = normalizeSavedWastePercentage(
                    val.wastePercentage,
                    sectionKeyForWaste,
                    val?.sectionKey,
                    val?.context,
                    val?.material?.materiaalnaam
                  );
                }
                return;
              }

              const legacyWaste = typeof val?.wastePercentage === 'number'
                ? val.wastePercentage
                : (typeof val?.material?.wastePercentage === 'number' ? val.material.wastePercentage : null);
              if (legacyWaste != null) {
                const sectionKeyForWaste =
                  typeof val?.sectionKey === 'string' ? val.sectionKey : key;
                newWasteByEntryKey[key] = normalizeSavedWastePercentage(
                  legacyWaste,
                  sectionKeyForWaste,
                  key,
                  val?.context ?? JOB_TITEL,
                  val?.material?.materiaalnaam
                );
              }

              // Detect multi-entry items by type flag or __N suffix pattern
              if (val.type === 'multi_entry' && val.sectionKey && val.material) {
                const baseKey = val.sectionKey;
                if (!multiEntryGroups[baseKey]) multiEntryGroups[baseKey] = [];
                multiEntryGroups[baseKey].push({
                  id: crypto.randomUUID(),
                  material: val.material,
                  aantal: typeof val.aantal === 'number' ? val.aantal : 1,
                });
                return;
              }

              // Also detect by __N suffix (backward compat)
              const multiMatch = key.match(/^(.+)__(\d+)$/);
              if (multiMatch && val.material && val.sectionKey) {
                const baseKey = val.sectionKey;
                if (!multiEntryGroups[baseKey]) multiEntryGroups[baseKey] = [];
                multiEntryGroups[baseKey].push({
                  id: crypto.randomUUID(),
                  material: val.material,
                  aantal: typeof val.aantal === 'number' ? val.aantal : 1,
                });
                return;
              }

              // Standard selections
              if (val.material && val.sectionKey) {
                newGekozen[val.sectionKey] = val.material;
              }
              // Custom groups
              else if (val.order !== undefined || val.title) {
                newCustomGroupsMap[key] = val;
              }
              // Fallback for legacy standard selections (flat structure)
              else {
                newGekozen[key] = val;
              }
            });

            // Reconstruct multi-entry slot values
            Object.entries(multiEntryGroups).forEach(([baseKey, entries]) => {
              newGekozen[baseKey] = { _multiEntry: true, entries } as MultiEntrySlotData;
            });
          }

          setGekozenMaterialen(normalizeSelectedMaterialsForJob(newGekozen, jobSlug));
          setFirestoreCustommateriaal(newCustomGroupsMap);
          setWasteByEntryKey(newWasteByEntryKey);
          const restoredPendingById = new Map<string, PendingSafetyItem>();
          if (pendingMaterialsMap && typeof pendingMaterialsMap === 'object') {
            Object.entries(pendingMaterialsMap).forEach(([rawId, value]: [string, any]) => {
              if (!value || typeof value !== 'object') return;
              const statusRaw = String(value.status || '').trim().toLowerCase();
              if (statusRaw === 'resolved' || statusRaw === 'done') return;

              const question = String(value.question || '').trim();
              const expectedUnit = String(value.expected_unit || value.expectedUnit || '');
              const answer = String(value.answer || '');
              const questions = normalizePendingQuestions(value.questions, {
                question,
                expectedUnit,
                answer,
              });
              const firstQuestion = questions[0];
              const updatedAtMs =
                typeof value?.updatedAt?.toMillis === 'function'
                  ? Number(value.updatedAt.toMillis())
                  : null;
              const isStaleBackgroundState =
                (statusRaw === 'analyzing' || statusRaw === 'saving') &&
                typeof updatedAtMs === 'number' &&
                Number.isFinite(updatedAtMs) &&
                Date.now() - updatedAtMs > 45_000;

              let status: PendingSafetyItem['status'] =
                statusRaw === 'needs_answer'
                  ? 'needs_answer'
                  : statusRaw === 'saving'
                    ? 'saving'
                    : statusRaw === 'error'
                      ? 'error'
                      : 'analyzing';

              if (status === 'analyzing' && (firstQuestion?.question || question)) {
                status = 'needs_answer';
              } else if (isStaleBackgroundState) {
                status = 'error';
              }

              const id = String(value.id || rawId);
              restoredPendingById.set(id, {
                id,
                status,
                question: firstQuestion?.question || question,
                expectedUnit: firstQuestion?.expectedUnit || expectedUnit,
                answer: firstQuestion?.answer || answer,
                questions,
                error: value.error
                  ? String(value.error)
                  : (status === 'error' ? 'Vorige achtergrond-opslag is onderbroken. Probeer opnieuw via Opslaan.' : null),
                draftPayload: value.draft_payload && typeof value.draft_payload === 'object'
                  ? (value.draft_payload as Record<string, unknown>)
                  : {},
              });
            });
          }

          // Fallback: recover pending flow from placeholders in materialen_lijst
          // in case pending_materials map is missing or incomplete.
          Object.values(materialenLijst).forEach((entry: any) => {
            const material = entry?.material && typeof entry.material === 'object'
              ? entry.material
              : (entry && typeof entry === 'object' ? entry : null);
            if (!material || typeof material !== 'object') return;

            const pendingId = String((material as any).pending_material_id || '').trim();
            if (!pendingId) return;

            const stateRaw = String((material as any).pending_material_state || '').trim().toLowerCase();
            if (stateRaw === 'resolved' || stateRaw === 'done') return;

            const question = String((material as any).pending_material_question || '').trim();
            const expectedUnit = String((material as any).expected_unit || (material as any).safety_expected_unit || '');
            const prijsExcl =
              parseNLMoneyToNumber((material as any).prijs_excl_btw ?? (material as any).prijs_per_stuk ?? (material as any).prijs) ?? 0;
            const prijsIncl =
              parseNLMoneyToNumber((material as any).prijs_incl_btw ?? (material as any).prijs) ??
              Number((prijsExcl * 1.21).toFixed(2));

            const fallbackPayload: Record<string, unknown> = {
              materiaalnaam: String((material as any).materiaalnaam || '').trim(),
              eenheid: String((material as any).eenheid || 'stuk').trim() || 'stuk',
              prijs: prijsIncl,
              prijs_excl_btw: prijsExcl,
              prijs_incl_btw: prijsIncl,
              pending_id: pendingId,
              quote_id: quoteId,
              klus_id: klusId,
            };
            const categorie = String((material as any).categorie || (material as any).subsectie || '').trim();
            const leverancier = String((material as any).leverancier || '').trim();
            if (categorie) fallbackPayload.categorie = categorie;
            if (leverancier) fallbackPayload.leverancier = leverancier;

            const fallbackStatus: PendingSafetyItem['status'] =
              stateRaw === 'error'
                ? 'error'
                : stateRaw === 'saving'
                  ? 'error'
                  : (question ? 'needs_answer' : 'analyzing');
            const questions = normalizePendingQuestions((material as any).pending_material_questions, {
              question,
              expectedUnit,
              answer: '',
            });
            const firstQuestion = questions[0];

            const fallbackItem: PendingSafetyItem = {
              id: pendingId,
              status: fallbackStatus,
              question: firstQuestion?.question || question,
              expectedUnit: firstQuestion?.expectedUnit || expectedUnit,
              answer: firstQuestion?.answer || '',
              questions,
              error: (material as any).pending_material_error
                ? String((material as any).pending_material_error)
                : (fallbackStatus === 'error'
                  ? 'Vorige achtergrond-opslag is onderbroken. Probeer opnieuw via Opslaan.'
                  : null),
              draftPayload: fallbackPayload,
            };

            const existing = restoredPendingById.get(pendingId);
            if (!existing) {
              restoredPendingById.set(pendingId, fallbackItem);
              return;
            }

            // Merge missing details from placeholder fallback.
            const merged: PendingSafetyItem = {
              ...existing,
              status: existing.status === 'analyzing' && fallbackItem.status === 'needs_answer'
                ? 'needs_answer'
                : existing.status,
              question: existing.question || fallbackItem.question,
              expectedUnit: existing.expectedUnit || fallbackItem.expectedUnit,
              answer: existing.answer || fallbackItem.answer,
              questions: existing.questions.length > 0 ? existing.questions : fallbackItem.questions,
              error: existing.error || fallbackItem.error,
              draftPayload: Object.keys(existing.draftPayload || {}).length > 0
                ? existing.draftPayload
                : fallbackItem.draftPayload,
            };
            restoredPendingById.set(pendingId, merged);
          });

          setPendingSafetyItems(Array.from(restoredPendingById.values()));
          // Only mark as having saved config if there's actual data
          if (Object.keys(newGekozen).length > 0 || Object.keys(newCustomGroupsMap).length > 0) {
            hasSavedConfigRef.current = true;
          }
        }
        if (klusNode?.werkwijze?.workMethodId) setGekozenPresetId(klusNode.werkwijze.workMethodId);
        if (klusNode?.kleinMateriaal) setKleinMateriaalConfig(klusNode.kleinMateriaal);
        // if (klusNode?.uiState?.collapsedSections) setCollapsedSections(klusNode.uiState.collapsedSections); // Removed: Loaded from user profile now

        // Auto-unhide categories if relevant components exist (Step Id: 181)
        // NOTE: hiddenCategories are now stored ONLY in user profile (hidden_categories_by_job)
        // We no longer load from klusNode.uiState.hiddenCategories (per-quote storage removed)

        // Apply job-specific defaults (first-visit defaults only; never override saved user prefs)
        const defaultHiddenForJob: Record<string, boolean> | null =
          (jobSlug === 'binnendeur-afhangen' || jobSlug === 'buitendeur-afhangen')
            ? { glas: true, tochtstrips: true, ventilatie: true }
            : (jobSlug === 'golfplaat-dak')
              ? { isolatie: true, afwerking_dak: true }
              : null;

        // Auto-unhide categories that have active components (force-show these)
        const componentBasedUnhide: Record<string, boolean> = {};
        currentComponents.forEach(comp => {
          let cat: string | null = null;
          if (comp.type === 'kozijn') cat = 'Kozijnen';
          else if (comp.type === 'deur') cat = 'Deuren';
          else if (comp.type === 'dagkant') cat = 'Dagkant';
          else if (comp.type === 'vensterbank') cat = 'Vensterbank';
          else if (comp.type === 'waterslag') cat = 'Vensterbank';
          else if (comp.type === 'daktrim') cat = 'daktrim';
          else if (comp.type === 'vlizotrap') cat = 'Toegang';
          else if (comp.type === 'plafond') cat = 'plafond';

          if (cat) componentBasedUnhide[cat] = false; // Force show
        });

        // Merge: user preferences (already loaded from user profile) -> job defaults -> component overrides
        setHiddenCategories(prev => {
          // Start with previous state
          let merged = { ...prev };

          // Apply user preferences from ref (ensures they're included even if async load finished after this effect started)
          if (userHiddenPrefsRef.current) {
            merged = { ...merged, ...userHiddenPrefsRef.current };
          }

          // Apply job defaults only for keys not already set by user
          if (defaultHiddenForJob) {
            Object.entries(defaultHiddenForJob).forEach(([key, value]) => {
              if (merged[key] === undefined) merged[key] = value;
            });
          }
          // Component-based overrides always win (force show categories with active components)
          return { ...merged, ...componentBasedUnhide };
        });

        if (klusNode?.material_notities) setNotities(klusNode.material_notities);
        isHydratingRef.current = false;
      } catch (e) { console.error(e); }
      finally { setPaginaLaden(false); }
    };
    hydrate();
  }, [firestore, quoteId, klusId, jobSlug, user, normalizeSelectedMaterialsForJob]);

  // Full Object Mapping
  useEffect(() => {
    if (!alleMaterialen.length || isHydratingRef.current) return;
    setGekozenMaterialen(prev => {
      const next: any = {};
      let changed = false;
      Object.keys(prev).forEach(k => {
        const val = prev[k];
        // Skip multi-entry slots - they manage their own material references
        if (isMultiEntrySlot(val)) {
          next[k] = val;
          return;
        }
        // Only try to link back if we have an ID.
        // If we don't have an ID (new clean format), we just use the preserved values.
        if (val && (val.id || val.row_id || val.material_ref_id) && !val.materiaalnaam) {
          const found = findMaterialByAnyId(val.id || val.row_id || val.material_ref_id);
          if (found) { next[k] = found; changed = true; }
          else next[k] = val;
        } else {
          next[k] = val;
        }
      });
      return changed ? next : prev;
    });
  }, [alleMaterialen, findMaterialByAnyId]);

  // Build Custom Groups
  useEffect(() => {
    if (isHydratingRef.current) return;
    if (!firestoreCustommateriaal) return;

    const hasBrokenItems = customGroups.some((g) =>
      g.materials.some((m: any) => m.materiaalnaam === '(onbekend)')
    );

    if (customGroups.length > 0 && !hasBrokenItems) return;

    const built = bouwCustomGroupsUitFirestore(firestoreCustommateriaal, alleMaterialen);
    setCustomGroups(built);
  }, [firestoreCustommateriaal, alleMaterialen, customGroups.length]);

  // Detect stale/missing preset IDs referenced by the quote.
  useEffect(() => {
    if (gekozenPresetId === 'default') return;
    if (isPaginaLaden || isPresetsLaden) return;
    if (presets.some((preset) => preset.id === gekozenPresetId)) return;

    const issueKey = `${gekozenPresetId}|${JOB_KEY}|preset-id-missing`;
    if (lastPresetLoadIssueKeyRef.current === issueKey) return;
    lastPresetLoadIssueKeyRef.current = issueKey;

    toast({
      variant: 'destructive',
      title: 'Werkpakket ontbreekt',
      description: 'Het gekoppelde werkpakket bestaat niet meer of is niet compatibel met deze klus.',
    });

    void reportOperationalError({
      source: 'klus_preset_reference_missing',
      title: 'Werkpakket referentie ontbreekt',
      message: `Preset ${gekozenPresetId} ontbreekt voor job ${JOB_KEY}.`,
      severity: 'critical',
      context: {
        quoteId,
        klusId,
        jobSlug: JOB_KEY,
        presetId: gekozenPresetId,
      },
    });

    setGekozenPresetId('default');
  }, [gekozenPresetId, isPaginaLaden, isPresetsLaden, presets, JOB_KEY, quoteId, klusId, toast]);

  // Auto Preset
  useEffect(() => {
    if (isPaginaLaden || isPresetsLaden || !presets.length || userHeeftPresetGewijzigdRef.current || hasSavedConfigRef.current || gekozenPresetId !== 'default') return;
    if (customGroups.length > 0) return;

    const defaultPreset = presets.find((p) => p.isDefault) || presets.find((p) => (p.name || '').toLowerCase().includes('standaard'));
    if (defaultPreset) {
      autoApplyDefaultPresetRef.current = true;
      setGekozenPresetId(defaultPreset.id);
    }
  }, [isPresetsLaden, presets, gekozenPresetId, customGroups.length, isPaginaLaden]);


  // Apply Preset Logic
  useEffect(() => {
    if (gekozenPresetId === 'default') {
      if (userHeeftPresetGewijzigdRef.current) {
        setGekozenMaterialen({});
        setCollapsedSections({});
        setHiddenCategories({});
        // extraMaterials removed
        setCustomGroups([]);
        setFirestoreCustommateriaal(null);
        setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null });
        setComponents([]);
        userHeeftPresetGewijzigdRef.current = false;
      }
      autoApplyDefaultPresetRef.current = false;
      setIsApplyingPreset(false);
      return;
    }
    if (!alleMaterialen.length) {
      // If materials failed/finished loading and none are available, do not keep UI locked.
      if (!isMaterialenLaden) {
        setIsApplyingPreset(false);
      }
      return;
    }
    const preset = presets.find(p => p.id === gekozenPresetId);
    if (!preset) {
      autoApplyDefaultPresetRef.current = false;
      setIsApplyingPreset(false);
      return;
    }
    // Only apply if: user explicitly changed it OR hydrating is done + auto-apply triggers
    const shouldApplyFromSelectedWorkMethod =
      isHydratingRef.current === false &&
      !hasSavedConfigRef.current &&
      gekozenPresetId !== 'default';
    if (!userHeeftPresetGewijzigdRef.current && !autoApplyDefaultPresetRef.current && !shouldApplyFromSelectedWorkMethod) return;

    // ✅ Lock UI while applying
    setIsApplyingPreset(true);

    // Small timeout to allow UI to show loading state if needed, and ensure processing happens
    const timer = setTimeout(() => {
      try {
        const newSels: any = {};
        const mappedSlots = mapPresetSlotsForJob(preset.slots, JOB_KEY);
        const slotMeta = preset?.slotMeta && typeof preset.slotMeta === 'object'
          ? preset.slotMeta as Record<string, { materialId?: string; materialName?: string }>
          : {};
        const rawPresetSlots = preset?.slots && typeof preset.slots === 'object'
          ? preset.slots as Record<string, unknown>
          : {};
        const missingSlotKeys: string[] = [];
        const repairedSlotIds: Record<string, string> = {};
        let totalReferencedSlots = 0;
        let resolvedFromNameCount = 0;

        if (mappedSlots) {
          Object.keys(mappedSlots).forEach((key) => {
            const matId = normalizeMaterialId(mappedSlots[key]);
            if (!matId) return;

            totalReferencedSlots += 1;
            let found = findMaterialByAnyId(matId);

            if (!found) {
              const fallbackName = normalizeMaterialName(slotMeta?.[key]?.materialName);
              if (fallbackName) {
                const fallbackByName = materialByName.get(fallbackName);
                if (fallbackByName) {
                  found = fallbackByName;
                  resolvedFromNameCount += 1;
                  const nextId = normalizeMaterialId(
                    fallbackByName?.id || fallbackByName?.row_id || fallbackByName?.material_ref_id
                  );
                  if (
                    nextId
                    && nextId !== matId
                    && Object.prototype.hasOwnProperty.call(rawPresetSlots, key)
                  ) {
                    repairedSlotIds[key] = nextId;
                  }
                }
              }
            }

            if (found) {
              newSels[key] = found;
            } else {
              missingSlotKeys.push(key);
            }
          });
        }

        const resolvedSlotsCount = Object.keys(newSels).length;
        const slotRepairEntries = Object.entries(repairedSlotIds);
        if (slotRepairEntries.length > 0 && firestore && preset?.id) {
          const slotFieldUpdates: Record<string, unknown> = {};
          slotRepairEntries.forEach(([sectionKey, slotId]) => {
            slotFieldUpdates[`slots.${sectionKey}`] = slotId;
            slotFieldUpdates[`slotMeta.${sectionKey}.materialId`] = slotId;
          });
          void updateDoc(
            doc(firestore, 'presets', String(preset.id)),
            {
              ...slotFieldUpdates,
              updatedAt: serverTimestamp(),
            }
          ).catch((error) => {
            console.error('Kon preset slot-herstel niet opslaan:', error);
          });
        }

        if (totalReferencedSlots > 0 && resolvedSlotsCount === 0) {
          const issueKey = `${String(preset.id)}|${JOB_KEY}|preset-not-loaded`;
          if (lastPresetLoadIssueKeyRef.current !== issueKey) {
            lastPresetLoadIssueKeyRef.current = issueKey;
            toast({
              variant: 'destructive',
              title: 'Werkpakket niet geladen',
              description: 'Geen materialen uit dit werkpakket konden worden gekoppeld. Controleer of materiaal-IDs of secties zijn gewijzigd.',
            });
            void reportOperationalError({
              source: 'klus_preset_apply_failed',
              title: 'Werkpakket kon niet geladen worden',
              message: `0/${totalReferencedSlots} materialen gekoppeld voor preset ${String(preset.id)}.`,
              severity: 'critical',
              context: {
                quoteId,
                klusId,
                jobSlug: JOB_KEY,
                presetId: String(preset.id),
                missingSlotKeys: missingSlotKeys.slice(0, 50),
              },
            });
          }
        } else if (totalReferencedSlots > 0 && missingSlotKeys.length > 0) {
          const issueKey = `${String(preset.id)}|${JOB_KEY}|preset-partial|${missingSlotKeys.join(',')}`;
          if (lastPresetLoadIssueKeyRef.current !== issueKey) {
            lastPresetLoadIssueKeyRef.current = issueKey;
            toast({
              title: 'Werkpakket deels geladen',
              description: `${resolvedSlotsCount}/${totalReferencedSlots} materialen geladen. ${missingSlotKeys.length} onderdeel(en) vragen controle.`,
            });
            void reportOperationalError({
              source: 'klus_preset_apply_partial',
              title: 'Werkpakket deels geladen',
              message: `${resolvedSlotsCount}/${totalReferencedSlots} materialen gekoppeld voor preset ${String(preset.id)}.`,
              severity: 'warning',
              context: {
                quoteId,
                klusId,
                jobSlug: JOB_KEY,
                presetId: String(preset.id),
                missingSlotKeys: missingSlotKeys.slice(0, 50),
                resolvedFromNameCount,
              },
            });
          }
        } else {
          lastPresetLoadIssueKeyRef.current = null;
        }

        const normalizedSels = normalizeSelectedMaterialsForJob(newSels, JOB_KEY, { forcePresetAantalOne: true });
        setGekozenMaterialen(normalizedSels);
        if (preset.collapsedSections) setCollapsedSections(preset.collapsedSections);

        // Handle components (Kozijnen, Deuren, etc.)
        // Merge preset components with existing ones (from measurements/openings)
        let finalComponents = [...components];
        if (preset.components && Array.isArray(preset.components) && preset.components.length > 0) {
          const existingIds = new Set(components.map(c => c.id));
          const existingTypes = new Set(components.map(c => c.type));
          const toAdd = preset.components.filter((pc: JobComponent) => {
            // Skip if exact ID already exists (e.g. re-applying same preset)
            if (existingIds.has(pc.id)) return false;
            // Skip if a component of this type already exists from measurements (opening-derived)
            // but only for types that are typically derived from openings (kozijn, deur, dagkant)
            const openingDerivedTypes = ['kozijn', 'deur', 'dagkant'];
            if (openingDerivedTypes.includes(pc.type) && existingTypes.has(pc.type)) return false;
            return true;
          }).map((pc: JobComponent) => {
            // Preset defines WHAT components are needed, not the dimensions.
            const config = COMPONENT_REGISTRY[pc.type];
            const hasRequiredMeasurements = config?.measurements?.some((f: any) => !f.optional && f.type === 'number');
            if (hasRequiredMeasurements) {
              const cleared: JobComponent = {
                ...pc,
                id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                measurements: {},
                [`measurements_${pc.type}`]: {},
              };
              return cleared;
            }
            return { ...pc, id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2) };
          });
          if (toAdd.length > 0) {
            finalComponents = [...finalComponents, ...toAdd];
            setComponents(finalComponents);
          }
        }

        // Only force-show categories that have active components.
        const componentForceShow: Record<string, boolean> = {};
        finalComponents.forEach(comp => {
          let cat: string | null = null;
          if (comp.type === 'kozijn') cat = 'Kozijnen';
          else if (comp.type === 'deur') cat = 'Deuren';
          else if (comp.type === 'dagkant') cat = 'Dagkant';
          else if (comp.type === 'vensterbank') cat = 'Vensterbank';
          else if (comp.type === 'waterslag') cat = 'Vensterbank';
          else if (comp.type === 'daktrim') cat = 'daktrim';
          else if (comp.type === 'vlizotrap') cat = 'Toegang';
          else if (comp.type === 'koof') cat = 'Koof';
          else if (comp.type === 'plafond') cat = 'plafond';
          else if (comp.type === 'isolatie') cat = 'isolatie';

          if (cat) componentForceShow[cat] = false; // Force show
        });

        setHiddenCategories(prev => ({ ...prev, ...componentForceShow }));
      } catch (error) {
        console.error('Preset apply error:', error);
      } finally {
        setIsApplyingPreset(false);
        userHeeftPresetGewijzigdRef.current = false;
        autoApplyDefaultPresetRef.current = false;
        hasSavedConfigRef.current = true;
      }
    }, 100);

    return () => clearTimeout(timer);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gekozenPresetId,
    presets,
    alleMaterialen,
    isMaterialenLaden,
    findMaterialByAnyId,
    materialByName,
    firestore,
    quoteId,
    klusId,
    JOB_KEY,
    toast,
  ]); // intentionally exclude components to prevent infinite loop when resetting to 'default'

  // Watchdog: never leave preset-apply lock active indefinitely
  useEffect(() => {
    if (!isApplyingPreset) return;
    const watchdog = setTimeout(() => {
      console.warn('Preset apply watchdog unlocked UI');
      setIsApplyingPreset(false);
    }, 5000);
    return () => clearTimeout(watchdog);
  }, [isApplyingPreset]);


  // Fail-safe: Ensure categories with components are always visible
  // This overrides any preset trying to hide them
  useEffect(() => {
    if (components.length === 0) return;

    setHiddenCategories(prev => {
      const next = { ...prev };
      let changed = false;

      components.forEach(comp => {
        let cat: string | null = null;
        if (comp.type === 'kozijn') cat = 'Kozijnen';
        else if (comp.type === 'deur') cat = 'Deuren';
        else if (comp.type === 'dagkant') cat = 'Dagkant';
        else if (comp.type === 'vensterbank') cat = 'Vensterbank';
        else if (comp.type === 'waterslag') cat = 'Vensterbank';
        else if (comp.type === 'daktrim') cat = 'daktrim';
        else if (comp.type === 'vlizotrap') cat = 'Toegang';
        else if (comp.type === 'installatie') cat = 'Installatie';
        else if (comp.type === 'gips') cat = 'gips_afwerking';
        else if (comp.type === 'isolatie') cat = 'isolatie';
        else if (comp.type === 'plafond') cat = 'plafond';

        // If currently hidden (true), unhide it (false)
        if (cat && next[cat] === true) {
          next[cat] = false;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components]); // intentionally exclude hiddenCategories to prevent infinite loop

  // Handlers
  const onPresetChange = (val: string) => {
    // No-op when selecting the already active preset
    if (val === gekozenPresetId) {
      setPendingPresetId(null);
      setPresetConfirmOpen(false);
      return;
    }

    // If user has manually selected materials (and it's not just the default empty state or same preset), warn them.
    const hasSelections = Object.keys(gekozenMaterialen).length > 0 || customGroups.length > 0;
    if (hasSelections) {
      setPendingPresetId(val);
      setPresetConfirmOpen(true);
    } else {
      applyPresetChange(val);
    }
  };

  const applyPresetChange = (val: string) => {
    setIsApplyingPreset(true); // Immediate lock to prevent race conditions
    userHeeftPresetGewijzigdRef.current = true;
    autoApplyDefaultPresetRef.current = false;
    setGekozenPresetId(val);
    setPresetConfirmOpen(false);
    setPendingPresetId(null);
  };

  const resetToNieuwWithoutWarning = () => {
    // Direct reset path requested by user: no confirmation prompt.
    setPresetConfirmOpen(false);
    setPendingPresetId(null);
    setPresetPickerOpen(false);
    setGekozenPresetId('default');
    setGekozenMaterialen({});
    setWasteByEntryKey({});
    setCollapsedSections({});
    setHiddenCategories({});
    setCustomGroups([]);
    setFirestoreCustommateriaal(null);
    setSectionCategoryOverrides({});
    setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null });
    setComponents([]);
    userHeeftPresetGewijzigdRef.current = false;
    autoApplyDefaultPresetRef.current = false;
    setIsApplyingPreset(false);
    hasSavedConfigRef.current = true;
  };

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const nextCollapsed = !prev[key];
      const newState = { ...prev, [key]: nextCollapsed };

      // Persist to Firestore if user is logged in
      if (user && firestore) {
        const ref = doc(firestore, 'users', user.uid);
        setDoc(ref, {
          [`collapsed_sections_by_job.${jobSlug}.${key}`]: nextCollapsed
        }, { merge: true }).catch(console.error);
      }

      return newState;
    });
  };

  const toggleCategoryVisibility = (categoryKey: string) => {
    setHiddenCategories(prev => {
      const nextHidden = !prev[categoryKey];
      const newState = { ...prev, [categoryKey]: nextHidden };

      console.log('[DEBUG] toggleCategoryVisibility:', categoryKey, '→', nextHidden);

      // Also update the ref so future hydrations reflect this change
      userHiddenPrefsRef.current = { ...(userHiddenPrefsRef.current || {}), [categoryKey]: nextHidden };

      // Persist to Firestore if user is logged in
      if (user && firestore) {
        const userDocRef = doc(firestore, 'users', user.uid);
        console.log('[DEBUG] Saving to Firestore: hidden_categories_by_job ->', jobSlug, '->', categoryKey, '=', nextHidden);
        console.log('[DEBUG] User UID:', user.uid);

        // Use proper nested object structure (NOT dot notation in key which creates flat field names)
        setDoc(userDocRef, {
          hidden_categories_by_job: {
            [jobSlug]: {
              [categoryKey]: nextHidden
            }
          }
        }, { merge: true }).then(async () => {
          console.log('[DEBUG] Firestore setDoc completed');
          // Verify by reading back
          try {
            const verifySnap = await getDoc(userDocRef);
            if (verifySnap.exists()) {
              const data = verifySnap.data();
              console.log('[DEBUG] Verification read - hidden_categories_by_job:', data.hidden_categories_by_job);
              console.log('[DEBUG] Verification read - jobSlug data:', data.hidden_categories_by_job?.[jobSlug]);
            } else {
              console.log('[DEBUG] Verification read - document does not exist!');
            }
          } catch (verifyErr) {
            console.error('[DEBUG] Verification read FAILED:', verifyErr);
          }
        }).catch((err) => {
          console.error('[DEBUG] Firestore save FAILED:', err);
        });
      }

      return newState;
    });
  };
  const openMateriaalKiezer = (
    sectieKey: string,
    groupId: string | null = null,
    sectionMeta?: { key: string; label?: string; categoryFilter?: string | string[]; categoryUltraFilter?: string }
  ) => {
    setActieveSectie(sectieKey);
    setActiveGroupId(groupId);
    setActiveSectionMeta(sectionMeta || null);
    setIsExtraModalOpen(true);
  };
  const handleMateriaalSelectie = (key: string, materiaal: any) => { setGekozenMaterialen(prev => ({ ...prev, [key]: materiaal })); };
  const handleMateriaalVerwijderen = (key: string) => { setGekozenMaterialen(prev => { const n = { ...prev }; delete n[key]; return n; }); };

  // Multi-entry handlers
  const handleMultiEntryAdd = (sectionKey: string, materiaal: any) => {
    setGekozenMaterialen(prev => {
      const current = prev[sectionKey];
      const entries: MultiEntryEntry[] = isMultiEntrySlot(current) ? [...current.entries] : [];
      const sectionConfig = materialSections.find((section) => section.key === sectionKey);
      const maxAllowedEntries =
        typeof sectionConfig?.maxEntries === 'number' && Number.isFinite(sectionConfig.maxEntries) && sectionConfig.maxEntries > 0
          ? Math.max(1, Math.floor(sectionConfig.maxEntries))
          : null;
      if (maxAllowedEntries !== null && entries.length >= maxAllowedEntries) {
        return prev;
      }
      entries.push({ id: crypto.randomUUID(), material: materiaal, aantal: 1 });
      return { ...prev, [sectionKey]: { _multiEntry: true, entries } as MultiEntrySlotData };
    });
  };

  const handleMultiEntryEdit = (sectionKey: string, entryId: string, materiaal: any) => {
    setGekozenMaterialen(prev => {
      const current = prev[sectionKey];
      if (!isMultiEntrySlot(current)) return prev;
      const entries = current.entries.map(e => e.id === entryId ? { ...e, material: materiaal } : e);
      return { ...prev, [sectionKey]: { _multiEntry: true, entries } as MultiEntrySlotData };
    });
  };

  const handleMultiEntryRemove = (sectionKey: string, entryId: string) => {
    setGekozenMaterialen(prev => {
      const current = prev[sectionKey];
      if (!isMultiEntrySlot(current)) return prev;
      const entries = current.entries.filter(e => e.id !== entryId);
      if (entries.length === 0) {
        const n = { ...prev };
        delete n[sectionKey];
        return n;
      }
      return { ...prev, [sectionKey]: { _multiEntry: true, entries } as MultiEntrySlotData };
    });
  };

  const handleMultiEntryAantal = (sectionKey: string, entryId: string, aantal: number) => {
    setGekozenMaterialen(prev => {
      const current = prev[sectionKey];
      if (!isMultiEntrySlot(current)) return prev;
      const entries = current.entries.map(e => e.id === entryId ? { ...e, aantal } : e);
      return { ...prev, [sectionKey]: { _multiEntry: true, entries } as MultiEntrySlotData };
    });
  };

  const openMultiEntryModal = (sectionKey: string, entryId: string | null = null) => {
    setActiveMultiEntryKey(sectionKey);
    setActiveMultiEntryId(entryId);
    setActieveSectie(sectionKey);
    const section = materialSections.find((s) => s.key === sectionKey);
    setActiveSectionMeta(
      section
        ? {
          key: section.key,
          label: section.label,
          categoryFilter: section.categoryFilter,
          categoryUltraFilter: section.category_ultra_filter,
        }
        : null
    );
    setIsExtraModalOpen(true);
  };

  const normalizeMaterialForSelection = useCallback((material: any) => {
    return {
      ...material,
      id: material?.id || material?.row_id || material?.material_ref_id,
      row_id: material?.row_id || material?.id || material?.material_ref_id,
      prijs: typeof material?.prijs === 'number'
        ? material.prijs
        : (parseNLMoneyToNumber(material?.prijs_excl_btw ?? material?.prijs ?? material?.prijs_per_stuk) || 0),
      quantity: 1,
    };
  }, []);

  const applyMaterialToCurrentModalTarget = useCallback((material: any) => {
    if (activeComponentId && actieveSectie) {
      handleComponentMaterialSelect(activeComponentId, actieveSectie, material);
    } else if (activeGroupId) {
      setCustomGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, materials: [material] } : g));
    } else if (activeMultiEntryKey && actieveSectie) {
      if (activeMultiEntryId) {
        handleMultiEntryEdit(activeMultiEntryKey, activeMultiEntryId, material);
      } else {
        handleMultiEntryAdd(activeMultiEntryKey, material);
      }
    } else if (actieveSectie) {
      handleMateriaalSelectie(actieveSectie, material);
    }

    resetActiveMaterialModalState();
    setIsExtraModalOpen(false);
  }, [
    activeComponentId,
    actieveSectie,
    activeGroupId,
    activeMultiEntryKey,
    activeMultiEntryId,
    handleMultiEntryAdd,
    handleMultiEntryEdit,
    resetActiveMaterialModalState,
  ]);

  const patchPendingMaterialById = useCallback((pendingId: string, patch: Record<string, unknown>) => {
    setGekozenMaterialen(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (!value) return;
        if (isMultiEntrySlot(value)) {
          let changed = false;
          const entries = value.entries.map((entry) => {
            if (entry.material?.pending_material_id !== pendingId) return entry;
            changed = true;
            return { ...entry, material: { ...entry.material, ...patch } };
          });
          if (changed) next[key] = { ...value, entries } as MultiEntrySlotData;
          return;
        }
        if ((value as any)?.pending_material_id === pendingId) {
          next[key] = { ...(value as any), ...patch };
        }
      });
      return next;
    });

    setCustomGroups(prev => prev.map((group) => ({
      ...group,
      materials: (group.materials || []).map((material: any) => (
        material?.pending_material_id === pendingId ? { ...material, ...patch } : material
      )),
    })));

    setComponents(prev => prev.map((comp) => ({
      ...comp,
      materials: (comp.materials || []).map((entry: any) => {
        const mat = entry?.material || entry;
        if (mat?.pending_material_id !== pendingId) return entry;
        const updatedMat = { ...mat, ...patch };
        return entry?.material ? { ...entry, material: updatedMat } : updatedMat;
      }),
    })));
  }, []);

  const replacePendingMaterialById = useCallback((pendingId: string, material: any) => {
    const cleanedMaterial = { ...material };
    delete (cleanedMaterial as any).pending_material_id;
    delete (cleanedMaterial as any).pending_material_state;
    delete (cleanedMaterial as any).pending_material_question;
    delete (cleanedMaterial as any).pending_material_error;

    setGekozenMaterialen(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (!value) return;
        if (isMultiEntrySlot(value)) {
          let changed = false;
          const entries = value.entries.map((entry) => {
            if (entry.material?.pending_material_id !== pendingId) return entry;
            changed = true;
            return { ...entry, material: cleanedMaterial };
          });
          if (changed) next[key] = { ...value, entries } as MultiEntrySlotData;
          return;
        }
        if ((value as any)?.pending_material_id === pendingId) {
          next[key] = cleanedMaterial;
        }
      });
      return next;
    });

    setCustomGroups(prev => prev.map((group) => ({
      ...group,
      materials: (group.materials || []).map((m: any) => (
        m?.pending_material_id === pendingId ? cleanedMaterial : m
      )),
    })));

    setComponents(prev => prev.map((comp) => ({
      ...comp,
      materials: (comp.materials || []).map((entry: any) => {
        const mat = entry?.material || entry;
        if (mat?.pending_material_id !== pendingId) return entry;
        return entry?.material ? { ...entry, material: cleanedMaterial } : cleanedMaterial;
      }),
    })));
  }, []);

  const persistPendingMaterialState = useCallback(async (
    pendingId: string,
    patch: Record<string, unknown>,
    options?: { remove?: boolean; setCreatedAt?: boolean }
  ) => {
    if (!firestore || !quoteId || !klusId || !pendingId) return;
    try {
      const quoteRef = doc(firestore, 'quotes', quoteId);
      const basePath = `klussen.${klusId}.materialen.pending_materials.${pendingId}`;
      const legacyFieldNames = new Set<string>([
        basePath,
        `${basePath}.id`,
        `${basePath}.updatedAt`,
        `${basePath}.createdAt`,
      ]);
      Object.keys(patch).forEach((key) => {
        legacyFieldNames.add(`${basePath}.${key}`);
      });

      const cleanupArgs: any[] = [];
      legacyFieldNames.forEach((fieldName) => {
        cleanupArgs.push(new FieldPath(fieldName), deleteField());
      });
      try {
        if (cleanupArgs.length > 0) {
          await (updateDoc as any)(quoteRef, ...cleanupArgs);
        }
      } catch {
        // Best effort cleanup van oude foutieve veldnamen met punten.
      }

      if (options?.remove) {
        await updateDoc(quoteRef, { [basePath]: deleteField() });
        return;
      }

      const updatePayload: Record<string, unknown> = {
        [`${basePath}.id`]: pendingId,
        [`${basePath}.updatedAt`]: serverTimestamp(),
      };
      if (options?.setCreatedAt) {
        updatePayload[`${basePath}.createdAt`] = serverTimestamp();
      }
      Object.entries(patch).forEach(([key, value]) => {
        updatePayload[`${basePath}.${key}`] = value;
      });

      await updateDoc(quoteRef, updatePayload as any);
    } catch (err) {
      console.error('Kon pending materiaalstatus niet opslaan in Firestore:', err);
    }
  }, [firestore, quoteId, klusId]);

  const queueSafetyConfirmationInBackground = useCallback((item: PendingSafetyItem, token?: string) => {
    const rawQuestions = item.questions.length > 0
      ? item.questions
      : normalizePendingQuestions(undefined, {
          question: item.question,
          expectedUnit: item.expectedUnit,
          answer: item.answer,
        });
    const draftPayload = item.draftPayload || {};
    const baseNaam = String(draftPayload.materiaalnaam || '').trim();
    let resolvedNaam = baseNaam;
    const safetyAnswers: Record<string, unknown> = {};
    let resolvedVerbruikPerM2: number | null = null;
    let firstExpectedUnit = '';

    rawQuestions.forEach((question, index) => {
      const rawAnswer = String(question.answer || '').trim();
      if (!rawAnswer) return;
      const normalizedAnswer = applySafetyUnit(rawAnswer, question.expectedUnit, question.question);
      const key = (question.key || `vraag_${index + 1}`).trim();
      const targetField = (question.targetField || '').trim().toLowerCase();
      const shouldMapToVerbruik =
        key === 'verbruik_per_m2' ||
        targetField === 'verbruik_per_m2' ||
        isVerbruikPerM2Question(question.question, question.expectedUnit);

      if (!firstExpectedUnit && question.expectedUnit) {
        firstExpectedUnit = question.expectedUnit;
      }

      if (shouldMapToVerbruik) {
        const parsedVerbruik = parseVerbruikPerM2Answer(normalizedAnswer);
        if (parsedVerbruik !== null) {
          safetyAnswers[key] = parsedVerbruik;
          resolvedVerbruikPerM2 = parsedVerbruik;
        }
        return;
      }

      resolvedNaam = mergeSafetyAnswerIntoNaam(resolvedNaam, normalizedAnswer);
      safetyAnswers[key] = normalizedAnswer;
    });

    const payload: Record<string, unknown> = {
      ...draftPayload,
      materiaalnaam: resolvedNaam,
      safety_confirmed: true,
    };
    const firstAnswer = Object.values(safetyAnswers)[0];
    if (firstAnswer !== undefined) {
      payload.safety_answer = typeof firstAnswer === 'string' ? firstAnswer : String(firstAnswer);
    }
    if (Object.keys(safetyAnswers).length > 0) {
      payload.safety_answers = safetyAnswers;
    }
    if (resolvedVerbruikPerM2 !== null) {
      payload.verbruik_per_m2 = resolvedVerbruikPerM2;
    }
    if (firstExpectedUnit) payload.expected_unit = firstExpectedUnit;
    if (!payload.pending_id) payload.pending_id = item.id;
    if (!payload.quote_id && quoteId) payload.quote_id = quoteId;
    if (!payload.klus_id && klusId) payload.klus_id = klusId;

    setPendingSafetyItems((prev) => prev.map((x) => x.id === item.id ? { ...x, status: 'saving', error: null } : x));
    patchPendingMaterialById(item.id, {
      pending_material_state: 'saving',
      pending_material_error: null,
    });
    void persistPendingMaterialState(item.id, {
      status: 'saving',
      question: rawQuestions[0]?.question || '',
      expected_unit: rawQuestions[0]?.expectedUnit || '',
      answer: rawQuestions[0]?.answer || '',
      questions: rawQuestions,
      error: null,
    });

    void (async () => {
      try {
        const authToken = token || (user ? await user.getIdToken() : null);
        if (!authToken) throw new Error('Niet ingelogd.');

        const res = await fetch('/api/materialen/upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'Opslaan mislukt');

        const responseQuestions = normalizePendingQuestions(json?.data?.questions, {
          question: String(json?.data?.question || ''),
          expectedUnit: String(json?.data?.expected_unit || ''),
        });
        const responseFirst = responseQuestions[0];
        if (json?.data?.ready === false && responseQuestions.length > 0) {
          const answerByKey = new Map(rawQuestions.map((q) => [q.key, q.answer]));
          const mergedQuestions = responseQuestions.map((q) => ({
            ...q,
            answer: answerByKey.get(q.key) || q.answer || '',
          }));
          setPendingSafetyItems((prev) => prev.map((x) => x.id === item.id ? {
            ...x,
            status: 'needs_answer',
            question: responseFirst?.question || '',
            expectedUnit: responseFirst?.expectedUnit || '',
            answer: mergedQuestions[0]?.answer || '',
            questions: mergedQuestions,
            error: null,
          } : x));
          patchPendingMaterialById(item.id, {
            pending_material_state: 'needs_answer',
            pending_material_question: responseFirst?.question || '',
            pending_material_error: null,
          });
          void persistPendingMaterialState(item.id, {
            status: 'needs_answer',
            question: responseFirst?.question || '',
            expected_unit: responseFirst?.expectedUnit || '',
            answer: mergedQuestions[0]?.answer || '',
            questions: mergedQuestions,
            error: null,
          });
          return;
        }

        const row = Array.isArray(json?.data) ? json.data[0] : json?.data;
        const realId = row?.row_id || row?.id || json?.row_id;
        if (!realId) throw new Error('Materiaal nog niet bevestigd opgeslagen. Probeer opnieuw.');

        const mergedResolved = row && typeof row === 'object'
          ? { ...payload, ...row, row_id: realId, id: realId }
          : { ...payload, row_id: realId, id: realId };

        replacePendingMaterialById(item.id, normalizeMaterialForSelection(mergedResolved));
        setPendingSafetyItems((prev) => prev.filter((x) => x.id !== item.id));
        void persistPendingMaterialState(item.id, { status: 'resolved', row_id: realId }, { remove: true });
      } catch (err: any) {
        const message = err?.message || 'Onbekende fout tijdens opslaan.';
        setPendingSafetyItems((prev) => prev.map((x) => x.id === item.id ? {
          ...x,
          status: 'error',
          error: message,
        } : x));
        patchPendingMaterialById(item.id, {
          pending_material_state: 'error',
          pending_material_error: message,
        });
        void persistPendingMaterialState(item.id, {
          status: 'error',
          answer: item.answer,
          questions: rawQuestions,
          error: message,
        });
      }
    })();
  }, [
    klusId,
    patchPendingMaterialById,
    persistPendingMaterialState,
    quoteId,
    replacePendingMaterialById,
    normalizeMaterialForSelection,
    user,
  ]);

  const suggestBetterBeam = useCallback((sectionKey: string) => {
    if (!beamHeightWarning || !alleMaterialen.length) return;

    const targetHeight = beamHeightWarning.wallHeight;
    const currentName = beamHeightWarning.materialName || '';

    // Heuristic: Extract "NNxNN" (dimensions) from current name to find similar beams
    const dimRegex = /(\d+)[xX](\d+)/;
    const match = currentName.match(dimRegex);
    let candidates = alleMaterialen;

    if (match) {
      const dimStr = match[0]; // e.g. "38x89"
      candidates = candidates.filter(m => (m.materiaalnaam || '').includes(dimStr));
    } else {
      // Fallback: if 'SLS' in name, filter for SLS
      if (currentName.toLowerCase().includes('sls')) {
        candidates = candidates.filter(m => (m.materiaalnaam || '').toLowerCase().includes('sls'));
      }
    }

    // Find valid lengths
    const validOptions = candidates.map(m => {
      const len = getMaterialLength(m);
      return { material: m, length: len };
    }).filter(item => item.length !== null && item.length >= targetHeight);

    // Sort: Smallest sufficient length first (best fit), then price
    validOptions.sort((a, b) => {
      const lenDiff = a.length! - b.length!;
      if (lenDiff !== 0) return lenDiff;
      // Price low to high
      const pA = typeof a.material.prijs === 'number' ? a.material.prijs : 0;
      const pB = typeof b.material.prijs === 'number' ? b.material.prijs : 0;
      return pA - pB;
    });

    const best = validOptions[0];

    if (best) {
      handleMateriaalSelectie(sectionKey, best.material);
      toast({
        title: "Balk aangepast",
        description: `Geselecteerd: ${best.material.materiaalnaam} (${best.length}mm)`,
        duration: 3000
      });
    } else {
      toast({
        variant: "destructive",
        title: "Geen geschikte balk gevonden",
        description: `Geen standaard balk gevonden langer dan ${targetHeight}mm.`,
        duration: 4000
      });
    }
  }, [beamHeightWarning, alleMaterialen, handleMateriaalSelectie, toast]);

  // --- RENDERERS ---

  const renderKleinMateriaalSectie = () => {
    const { mode, percentage, fixedAmount } = kleinMateriaalConfig;

    const isHidden = hiddenCategories['klein_materiaal'];

    // Calculate Summary Text
    let summaryText = null;
    if (mode === 'inschatting') summaryText = "Automatische Inschatting";
    else if (mode === 'percentage') summaryText = `Percentage: ${percentage ?? 0}%`;
    else if (mode === 'fixed') summaryText = `Vast bedrag: ${formatNlMoneyFromNumber(fixedAmount)}`;
    else if (mode === 'none') summaryText = "Geen klein materiaal";

    return (
      <div className="mt-8 rounded-xl border border-border/60 bg-card/30 overflow-hidden shadow-sm">
        {/* Header Section - Now Clickable/Toggleable */}
        <div
          onClick={() => toggleCategoryVisibility('klein_materiaal')}
          className="px-5 py-4 border-b border-border/50 bg-muted/20 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors group select-none"
        >
          <div className="flex-1">
            <h2 className={cn(
              "text-sm font-bold flex items-center gap-2 uppercase tracking-wide transition-colors",
              isHidden ? "text-muted-foreground" : "text-foreground"
            )}>
              <Calculator className={cn("h-4 w-4", isHidden ? "text-muted-foreground" : "text-emerald-500")} />
              Automatische Klein Materiaal Berekening
              {isHidden && summaryText && (
                <span className={cn(
                  "ml-3 text-[10px] px-2 py-0.5 rounded-full font-medium normal-case tracking-normal border animate-in fade-in slide-in-from-left-2",
                  mode === 'none'
                    ? "bg-muted text-muted-foreground border-border"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                )}>
                  Ingesteld: {summaryText}
                </span>
              )}
            </h2>
            {!isHidden && (
              <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-top-1">
                Dit dekt schroeven, pluggen, tape en ander klein bevestigingsmateriaal dat u niet individueel hoeft te specificeren.
              </p>
            )}
          </div>

          <div
            className="p-1.5 rounded-md text-muted-foreground group-hover:text-foreground transition-colors ml-4"
            title={isHidden ? "Toon sectie" : "Verberg sectie"}
          >
            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
        </div>

        {/* Content Section - Conditionally Rendered */}
        {!isHidden && (
          <div className="p-5 space-y-6 animate-in slide-in-from-top-2 duration-200">

            {/* Recommended Option */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Aanbevolen</label>
              <div
                onClick={() => {
                  setKleinMateriaalConfig({ mode: 'inschatting', percentage: null, fixedAmount: null });
                  setKleinVastBedragStr('');
                }}
                className={cn(
                  "relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer group",
                  mode === 'inschatting'
                    ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm"
                    : "border-border/60 hover:border-emerald-500/30 hover:bg-accent/40 bg-background/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 p-2 rounded-lg transition-colors",
                  mode === 'inschatting' ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground group-hover:text-emerald-500"
                )}>
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    Automatische Inschatting
                    {mode === 'inschatting' && <CheckCircle2 className="h-4 w-4 text-emerald-600 animate-in zoom-in-50 duration-200" />}
                  </div>

                  {/* Trust explanation - ONLY visible when selected */}
                  {mode === 'inschatting' ? (
                    <p className="text-xs text-muted-foreground/90 leading-relaxed animate-in fade-in slide-in-from-top-1">
                      Klein materiaal automatisch meeberekenen op basis van klusomvang.
                      <br /><span className="opacity-75">Zorgt voor een correcte dekking van kleinverbruik.</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
                      Automatisch klein materiaal en verbruiksartikelen meenemen.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Alternatives */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Handmatige Alternatieven</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKleinMateriaalConfig((p: any) => ({ ...p, mode: 'percentage' }))}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'percentage'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-border/60 bg-background/50 hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  Percentage
                </button>

                <button
                  type="button"
                  onClick={() => setKleinMateriaalConfig((p: any) => ({ ...p, mode: 'fixed' }))}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'fixed'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-border/60 bg-background/50 hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  Vast bedrag
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setKleinMateriaalConfig({ mode: 'none', percentage: null, fixedAmount: null });
                    setKleinVastBedragStr('');
                  }}
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    mode === 'none'
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
                      : "border-transparent bg-transparent text-muted-foreground/70 hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  Geen
                </button>


                {/* Inline Inputs - Conditional Rendering */}
                {mode === 'percentage' && (
                  <div className="flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="relative w-24">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        className="pr-7 h-9 text-sm"
                        value={percentage ?? ''}
                        onChange={(e) => setKleinMateriaalConfig({ ...kleinMateriaalConfig, percentage: e.target.value ? Number(e.target.value) : null })}
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground text-xs pointer-events-none">%</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">van materiaalkosten</span>
                  </div>
                )}

                {mode === 'fixed' && (
                  <div className="flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="w-32">
                      <EuroInput
                        id="km-fixed-input"
                        value={kleinVastBedragStr}
                        placeholder="0,00"
                        // autoFocus // Can be annoying if switching quickly, but helpful for immediate entry
                        onChange={(v: string) => {
                          setKleinVastBedragStr(v);
                          setKleinMateriaalConfig({ ...kleinMateriaalConfig, fixedAmount: parseNLMoneyToNumber(v) });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Percentage Clarification Text */}
              {mode === 'percentage' && (
                <p className="text-xs text-muted-foreground/80 leading-relaxed pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  Dit percentage wordt berekend over de <strong>totale materiaalkosten</strong> van deze klus (excl. arbeid & transport).
                </p>
              )}
            </div>

          </div>
        )}
      </div>
    );
  };

  const handleSavePreset = async (presetName: string, isDefault: boolean, existingId?: string) => {
    if (!user || !firestore) return;
    const slots: Record<string, string> = {};
    const slotMeta: Record<string, { materialId: string; materialName?: string }> = {};
    for (const key of Object.keys(gekozenMaterialen || {})) {
      const materiaal = (gekozenMaterialen as any)[key];
      let matId = materiaal?.id || materiaal?.row_id || materiaal?.material_ref_id;
      let materialName = materiaal?.materiaalnaam;
      if (!matId && isMultiEntrySlot(materiaal)) {
        const firstEntryMaterial = materiaal.entries?.[0]?.material;
        matId = firstEntryMaterial?.id || firstEntryMaterial?.row_id || firstEntryMaterial?.material_ref_id;
        materialName = firstEntryMaterial?.materiaalnaam;
      }
      const normalizedMatId = normalizeMaterialId(matId);
      if (!normalizedMatId) continue;

      slots[key] = normalizedMatId;

      const cleanName = String(materialName || '').trim();
      slotMeta[key] = cleanName
        ? { materialId: normalizedMatId, materialName: cleanName }
        : { materialId: normalizedMatId };
    }
    // NOTE:
    // Component materials are stored in `components` itself.
    // Do not merge them into top-level `slots` because generic section keys
    // (e.g. "afwerkplaat") can collide with base job section keys and cause
    // wrong auto-fill / double counting in downstream calculations.
    const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);
    const newPresetData: any = {
      userId: user.uid,
      jobType: JOB_KEY,
      ...(PRESET_GROUP ? { presetGroup: PRESET_KEY } : {}),
      name: presetName,
      isDefault,
      slots: slots,
      slotMeta,
      schemaVersion: 2,
      collapsedSections,
      // hiddenCategories removed - now stored in user profile globally, not per-preset
      kleinMateriaalConfig,
      custommateriaal: customMap,
      components: JSON.parse(JSON.stringify(components)), // FIX: Save components (kozijnen, deuren, etc.)
      updatedAt: serverTimestamp(),
    };
    if (!existingId) newPresetData.createdAt = serverTimestamp();
    const batch = writeBatch(firestore);
    if (isDefault) {
      const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid), where('isDefault', '==', true));
      try {
        const qs = await getDocs(q);
        qs.forEach((d) => {
          const data = d.data();
          if (!isPresetCompatible(data)) return;
          if (d.id !== existingId) batch.update(d.ref, { isDefault: false });
        });
      } catch (e) { console.error("Error clearing defaults", e); }
    }
    const docRef = existingId ? doc(firestore, 'presets', existingId) : doc(collection(firestore, 'presets'));
    batch.set(docRef, newPresetData, { merge: true });
    try {
      await batch.commit();
      const action = existingId ? 'bijgewerkt' : 'opgeslagen';
      toast({ title: `Werkpakket ${action}`, description: `Werkpakket "${presetName}" is succesvol ${action}.` });
      const newPreset = { id: docRef.id, ...newPresetData };
      setPresets((prev) => {
        const filtered = prev.filter((p) => p.id !== docRef.id);
        const updatedList = filtered.map((p) => ({ ...p, isDefault: isDefault ? false : p.isDefault }));
        return [...updatedList, newPreset];
      });
      setGekozenPresetId(docRef.id);
    } catch (error: any) { console.error("Preset save error", error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkpakket niet opslaan.' }); }
  };

  const handleSetDefaultPreset = async (presetToSet: any) => {
    if (!user || !firestore || presetToSet.isDefault) return;
    const batch = writeBatch(firestore);
    const currentDefaults = presets.filter((p) => p.isDefault);
    currentDefaults.forEach((p) => batch.update(doc(firestore, 'presets', p.id), { isDefault: false }));
    batch.update(doc(firestore, 'presets', presetToSet.id), { isDefault: true });
    try {
      await batch.commit();
      toast({ title: 'Standaard ingesteld', description: `"${presetToSet.name}" is nu het standaard werkpakket.` });
      setPresets((prev) => prev.map((p) => ({ ...p, isDefault: p.id === presetToSet.id })));
    } catch (error) { console.error('Fout bij instellen standaard werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon het standaard werkpakket niet instellen.' }); }
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete || !firestore) return;
    const docRef = doc(firestore, 'presets', presetToDelete.id);
    try {
      await deleteDoc(docRef);
      toast({ title: 'Werkpakket verwijderd', description: `Het werkpakket "${presetToDelete.name}" is verwijderd.` });
      setPresets((prev) => prev.filter((p) => p.id !== presetToDelete.id));
      if (gekozenPresetId === presetToDelete.id) setGekozenPresetId('default');
    } catch (error) { console.error('Fout bij verwijderen werkwijze:', error); toast({ variant: 'destructive', title: 'Fout', description: 'Kon werkpakket niet verwijderen.' }); }
    finally { setDeleteConfirmationOpen(false); setPresetToDelete(null); setManagePresetsModalOpen(false); }
  };

  const saveToFirestore = async (options: { navigateTo?: string, silent?: boolean } = {}): Promise<boolean> => {
    if (!user || !firestore) return false;

    if (isPresetNotReadyForSave) {
      if (!options.silent) {
        toast({
          variant: 'destructive',
          title: 'Nog bezig met laden',
          description: 'Wacht tot het werkpakket volledig is geladen voordat je opslaat.',
        });
      }
      return false;
    }

    if (!options.silent) setIsOpslaan(true);
    else setIsAutosaving(true);

    try {
      // === UPDATE BEAM DIMENSIONS FROM STAANDERS & LIGGERS MATERIAL ===
      // Find the selected staanders & liggers material and update calculatedData.beams
      let updatedMaatwerkData: { key: string; items: any[] } | null = null;
      const staandersKeys = ['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'];
      let staandersMaterial: any = null;
      for (const key of staandersKeys) {
        if (gekozenMaterialen[key]) {
          staandersMaterial = gekozenMaterialen[key]._raw || gekozenMaterialen[key];
          break;
        }
      }

      // If we have a staanders material with dimensions, update the beams
      if (staandersMaterial) {
        // Parse dimensions from material (dikte = thickness, breedte = width)
        const parseDimension = (val: any): number | null => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const num = parseFloat(val.replace(',', '.'));
            return isNaN(num) ? null : num;
          }
          return null;
        };

        const dikte = parseDimension(staandersMaterial.dikte);
        const breedte = parseDimension(staandersMaterial.breedte);

        // If we have valid dimensions, update the beams in Firestore
        if ((dikte !== null || breedte !== null) && klus) {
          // Get the maatwerk key for this job
          const maatwerkKey = `${jobSlug}_maatwerk`;
          const maatwerkItems =
            (klus as any)?.maatwerk?.basis ||
            (klus as any)?.maatwerk?.items ||
            (klus as any)?.[maatwerkKey] ||
            [];

          if (Array.isArray(maatwerkItems) && maatwerkItems.length > 0) {
            const updatedMaatwerkItems = maatwerkItems.map((item: any) => {
              if (item.calculatedData?.beams && Array.isArray(item.calculatedData.beams)) {
                const updatedBeams = item.calculatedData.beams.map((beam: any) => ({
                  ...beam,
                  // wMm is width of beam (use breedte), keep original if not set
                  wMm: breedte ?? beam.wMm,
                  // Store dikte as reference
                  dikteMm: dikte ?? beam.dikteMm,
                  // Also store the material source for AI context
                  materialSource: staandersMaterial.materiaalnaam || 'selected material'
                }));
                return {
                  ...item,
                  calculatedData: {
                    ...item.calculatedData,
                    beams: updatedBeams
                  }
                };
              }
              return item;
            });

            // Store the updated maatwerk items for later use in updatePayload
            updatedMaatwerkData = { key: maatwerkKey, items: updatedMaatwerkItems };
          }
        }
      }
      // === END BEAM DIMENSION UPDATE ===

      // CLEANER SAVE STRUCTURE as requested:
      // 1. All materials in 'materialen_lijst' including custom ones.
      // 2. No flattening of components (they have their own list).
      // 3. No ID saved (supabase row_id).

      // === PREPARE BASE ITEMS & MIRROR CHECK ===
      // Determine the final list of base items (maatwerk) to save
      const maatwerkKey = `${jobSlug}_maatwerk`;
      const baseItems = updatedMaatwerkData
        ? updatedMaatwerkData.items
        : ((klus as any)?.maatwerk?.basis || (klus as any)?.maatwerk?.items || (klus as any)?.[maatwerkKey] || []);

      const isHellendDakJob =
        jobSlug.includes('hellend-dak') ||
        jobSlug.includes('dakrenovatie-pannen') ||
        (jobConfig?.title || '').toLowerCase().includes('hellend dak');
      const isGolfplaatDakJob = jobSlug.includes('golfplaat-dak');
      const isEpdmDakJob = jobSlug.includes('epdm-dakbedekking');

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

      const hellendDakMultiplierTemplate: Record<string, number> = {
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

      const toPositiveInt = (value: any): number | null => {
        const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
      };

      const toPositiveNumber = (value: any): number | null => {
        const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
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

      const buildHellendDakMultiplierMap = (mirrorEnabled: boolean, existing: any): Record<string, number> => {
        const defaults = Object.fromEntries(
          Object.entries(hellendDakMultiplierTemplate).map(([sectionKey, mirroredMultiplier]) => [
            sectionKey,
            mirrorEnabled ? mirroredMultiplier : 1,
          ])
        ) as Record<string, number>;

        if (!existing || typeof existing !== 'object') return defaults;
        Object.entries(existing as Record<string, any>).forEach(([sectionKey, rawMultiplier]) => {
          const multiplier = toPositiveInt(rawMultiplier);
          if (!sectionKey || multiplier === null) return;
          const normalizedSectionKey = sectionKey.trim();
          // Known hellend-dak sections are driven by mirror mode to avoid stale values
          // overriding expected 2x behavior after the user toggles mirror on.
          if (normalizedSectionKey in hellendDakMultiplierTemplate) return;
          defaults[normalizedSectionKey] = mirrorEnabled ? multiplier : 1;
        });
        return defaults;
      };

      const normalizedBaseItems = Array.isArray(baseItems)
        ? baseItems.map((bi: any) => {
          if (!bi || typeof bi !== 'object') return bi;

          const baseItem = { ...bi };

          if (isGolfplaatDakJob) {
            // Persist explicit false when toggle is untouched, instead of omitting the key.
            baseItem.includeTopBottomGording = Boolean(baseItem.includeTopBottomGording);
            baseItem.gording_in_breedte = 'horizontaal';
            if (baseItem.breedte === undefined || baseItem.breedte === null || baseItem.breedte === '') {
              if (baseItem.hoogte !== undefined && baseItem.hoogte !== null && baseItem.hoogte !== '') {
                baseItem.breedte = baseItem.hoogte;
              }
            }
            if (
              (baseItem.tussenmuur_vanaf_links_maat === undefined
                || baseItem.tussenmuur_vanaf_links_maat === null
                || baseItem.tussenmuur_vanaf_links_maat === '')
              && baseItem.tussenmuur !== undefined
              && baseItem.tussenmuur !== null
              && baseItem.tussenmuur !== ''
            ) {
              baseItem.tussenmuur_vanaf_links_maat = baseItem.tussenmuur;
            }
            delete baseItem.hoogte;
            delete baseItem.tussenmuur;
            delete baseItem.aantal_daken;
            const gordingLengte = buildGolfplaatGordingLengte(baseItem);
            if (gordingLengte) baseItem.gording_lengte = gordingLengte;
            else delete baseItem.gording_lengte;
          }

          if (!isHellendDakJob) return baseItem;
          return {
            ...baseItem,
            edge_left: normalizeHellendDakEdge(baseItem?.edge_left),
            edge_right: normalizeHellendDakEdge(baseItem?.edge_right),
            hellend_dak_multipliers: buildHellendDakMultiplierMap(
              isMirrorEnabled(baseItem?.hellend_dak_mirror),
              baseItem?.hellend_dak_multipliers
            )
          };
        })
        : baseItems;

      // Check if any item has a mirror flag
      const isBoeiboordMirrored = Array.isArray(normalizedBaseItems) && normalizedBaseItems.some((bi: any) => isMirrorEnabled(bi?.boeiboord_mirror));
      const isHellendDakMirrored = Array.isArray(normalizedBaseItems) && normalizedBaseItems.some((bi: any) => isMirrorEnabled(bi?.hellend_dak_mirror));
      const isHellendDakMirroredFromMaatwerkBasis = (() => {
        const basisItems = (klus as any)?.maatwerk?.basis;
        if (Array.isArray(basisItems) && basisItems.length > 0) {
          return basisItems.some((bi: any) => isMirrorEnabled(bi?.hellend_dak_mirror));
        }
        return isHellendDakMirrored;
      })();

      const hellendDakSectionMultipliers = new Map<string, number>();
      if (Array.isArray(normalizedBaseItems)) {
        normalizedBaseItems.forEach((bi: any) => {
          const map = bi?.hellend_dak_multipliers;
          if (!map || typeof map !== 'object') return;
          Object.entries(map as Record<string, any>).forEach(([sectionKey, rawMultiplier]) => {
            const multiplier = toPositiveInt(rawMultiplier);
            if (!sectionKey || multiplier === null) return;
            const prev = hellendDakSectionMultipliers.get(sectionKey) ?? 1;
            if (multiplier > prev) {
              hellendDakSectionMultipliers.set(sectionKey, multiplier);
            }
          });
        });
      }

      const getSectionMultiplier = (sectionKey?: string | null): number => {
        if (isBoeiboordMirrored) return 2;
        if (!isHellendDakJob) return 1;

        const normalizedSectionKey = typeof sectionKey === 'string' ? sectionKey.trim() : '';
        if (normalizedSectionKey && normalizedSectionKey in hellendDakMultiplierTemplate) {
          if (!isHellendDakMirroredFromMaatwerkBasis) return 1;
          return hellendDakMultiplierTemplate[normalizedSectionKey] ?? 1;
        }
        if (normalizedSectionKey) {
          const mappedMultiplier = hellendDakSectionMultipliers.get(normalizedSectionKey);
          if (mappedMultiplier && mappedMultiplier > 0) return mappedMultiplier;
        }

        if (!isHellendDakMirrored) return 1;
        return normalizedSectionKey === 'ruiter' ? 1 : 2;
      };

      const materialenLijst: Record<string, any> = {};

      const applySectionMultiplierToMaterial = (material: any, sectionMultiplier: number): any => {
        if (!material) return material;
        const {
          hellend_dak_multiplier: _legacyHellendDakMultiplier,
          hellend_dak_multipliers: _legacyHellendDakMultipliers,
          boeiboord_multiplier: _legacyBoeiMultiplier,
          boeiboord_multipliers: _legacyBoeiMultipliers,
          ...rest
        } = material;

        if (isHellendDakJob) {
          return {
            ...rest,
            hellend_dak_multiplier: sectionMultiplier,
            aantal: sectionMultiplier,
          };
        }

        return rest;
      };

      const fallbackRuleMeta = (sectionKey?: string | null) => ({
        source: 'static_file' as const,
        slug: jobSlug,
        sectionKey: sectionKey ?? null,
        version: KLUS_REGELS_STATIC_VERSION,
        status: 'missing' as const,
      });

      const withRuleAttachment = (entry: Record<string, any>, sectionKey?: string | null): Record<string, any> => {
        const attachment = getMaterialRule(jobSlug, sectionKey);
        const strippedRule = attachment?.rule && typeof attachment.rule === 'object'
          ? (() => {
            const { required_inputs, missing_input_behavior, ...rest } = attachment.rule as Record<string, any>;
            return rest;
          })()
          : null;
        return {
          ...entry,
          rule: strippedRule,
          rule_meta: attachment?.rule_meta ?? fallbackRuleMeta(sectionKey),
        };
      };

      const catalogById = new Map<string, any>();
      const catalogByName = new Map<string, any>();
      (alleMaterialen || []).forEach((m: any) => {
        const id = m?.row_id || m?.material_ref_id || m?.id;
        if (id) catalogById.set(String(id), m);
        if (m?.materiaalnaam) catalogByName.set(String(m.materiaalnaam), m);
      });

      const ensurePriceSnapshot = (cleaned: any): any => {
        if (!cleaned) return cleaned;

        const refId = cleaned.material_ref_id || cleaned.row_id || cleaned.id;
        const catalog = (refId ? catalogById.get(String(refId)) : null)
          || (cleaned.materiaalnaam ? catalogByName.get(String(cleaned.materiaalnaam)) : null)
          || null;

        const next = { ...cleaned };
        const localExcl = getPositivePriceFromMaterial(next);
        const catalogExcl = getPositivePriceFromMaterial(catalog);
        const resolvedExcl = localExcl ?? catalogExcl;

        if (resolvedExcl && resolvedExcl > 0) {
          next.prijs_excl_btw = String(Number(resolvedExcl.toFixed(2)));
        }

        // Firestore materiaal-snapshots are excl-only to prevent accidental +21% recalc bugs.
        if ('prijs_incl_btw' in next) {
          delete next.prijs_incl_btw;
        }

        const isEmptyValue = (value: any): boolean => (
          value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
        );
        const firstFilled = (...values: any[]): any => values.find((value) => !isEmptyValue(value));

        if (catalog && !next.eenheid && catalog.eenheid) next.eenheid = catalog.eenheid;

        const helperBackfillSpecs: Array<{ target: string; sources: string[] }> = [
          { target: 'verbruik_per_m2', sources: ['verbruik_per_m2', 'vebruik_per_m2'] },
          { target: 'max_werkende_lengte_mm', sources: ['max_werkende_lengte_mm', 'max_werkende_hoogte_mm'] },
          { target: 'min_werkende_lengte_mm', sources: ['min_werkende_lengte_mm', 'min_werkende_hoogte_mm'] },
          { target: 'max_werkende_breedte_mm', sources: ['max_werkende_breedte_mm', 'werkende_breedte_maat', 'werkende_breedte_mm', 'werkende_breedte', 'werkend'] },
          { target: 'min_werkende_breedte_mm', sources: ['min_werkende_breedte_mm', 'werkende_breedte_maat', 'werkende_breedte_mm', 'werkende_breedte', 'werkend'] },
          { target: 'max_werkende_hoogte_mm', sources: ['max_werkende_hoogte_mm', 'werkende_hoogte_maat', 'werkende_hoogte_mm', 'werkende_hoogte', 'werkende_lengte', 'panlatafstand', 'latafstand'] },
          { target: 'min_werkende_hoogte_mm', sources: ['min_werkende_hoogte_mm', 'werkende_hoogte_maat', 'werkende_hoogte_mm', 'werkende_hoogte', 'werkende_lengte', 'panlatafstand', 'latafstand'] },
        ];

        helperBackfillSpecs.forEach(({ target, sources }) => {
          if (!isEmptyValue(next[target])) return;
          const fillValue = firstFilled(...sources.map((sourceKey) => catalog?.[sourceKey]));
          if (!isEmptyValue(fillValue)) next[target] = fillValue;
        });

        return next;
      };

      // 1. Unified Material Map Construction

      // A. Standard Selections (Base Job)
      Object.entries(gekozenMaterialen).forEach(([k, v]) => {
        if (k.startsWith('component_') || k.startsWith('comp_')) return;

        // Handle multi-entry slots
        if (isMultiEntrySlot(v)) {
          v.entries.forEach((entry, idx) => {
            const cleaned = ensurePriceSnapshot(cleanMaterialData(entry.material));
            if (cleaned) {
              const normalizedSectionKey =
                normalizeEpdmDaktrimSectionKeyForSave(jobSlug, k, cleaned) || k;
              const sectionMultiplier = getSectionMultiplier(normalizedSectionKey);
              const parsedAantal = Number(entry.aantal);
              const finalAantal = Number.isFinite(parsedAantal)
                ? parsedAantal * sectionMultiplier
                : entry.aantal;
              const cleanedWithMultiplier = applySectionMultiplierToMaterial(cleaned, sectionMultiplier);
              const indexedKey = `${k}__${idx}`;
              materialenLijst[indexedKey] = withRuleAttachment({
                sectionKey: normalizedSectionKey,
                material: cleanedWithMultiplier,
                aantal: finalAantal,
                ...(isHellendDakJob ? { hellend_dak_multiplier: sectionMultiplier } : {}),
                context: JOB_TITEL,
                type: 'multi_entry',
                wastePercentage: typeof wasteByEntryKey[indexedKey] === 'number'
                  ? wasteByEntryKey[indexedKey]
                  : getDefaultWastePercentage(normalizedSectionKey, sectionLabelByKey[k], JOB_TITEL)
              }, normalizedSectionKey);
            }
          });
          return;
        }

        const cleaned = ensurePriceSnapshot(cleanMaterialData(v));
        if (cleaned) {
          const normalizedSectionKey =
            normalizeEpdmDaktrimSectionKeyForSave(jobSlug, k, cleaned) || k;
          const sectionMultiplier = getSectionMultiplier(normalizedSectionKey);
          const cleanedWithMultiplier = applySectionMultiplierToMaterial(cleaned, sectionMultiplier);
          const storageKey =
            isEpdmDakJob
            && (k === 'daktrim' || k === 'daktrim_hoeken')
            && normalizedSectionKey
              ? normalizedSectionKey
              : k;

          materialenLijst[storageKey] = withRuleAttachment({
            sectionKey: normalizedSectionKey,
            material: cleanedWithMultiplier,
            ...(isHellendDakJob ? { hellend_dak_multiplier: sectionMultiplier } : {}),
            context: JOB_TITEL,
            wastePercentage: typeof wasteByEntryKey[k] === 'number'
              ? wasteByEntryKey[k]
              : getDefaultWastePercentage(normalizedSectionKey, sectionLabelByKey[k], JOB_TITEL)
          }, normalizedSectionKey);
        }
      });

      // B. Custom Groups (Extra Materials)
      const customMap = bouwCustommateriaalMapUitCustomGroups(customGroups);
      Object.entries(customMap).forEach(([gid, cm]: [string, any]) => {
        const cleaned = ensurePriceSnapshot(cleanMaterialData(cm));
        if (cleaned) {
          materialenLijst[gid] = withRuleAttachment({
            material: cleaned,
            title: cm.title,
            context: JOB_TITEL,
            type: 'custom_group',
            wastePercentage: typeof wasteByEntryKey[gid] === 'number'
              ? wasteByEntryKey[gid]
              : getDefaultWastePercentage(null, cm.title, JOB_TITEL)
          }, null);
        }
      });

      // C. Component Materials (Rich Data & Labeled)
      // We both save them in the special list for AI AND keep them in the components for UI
      const mappedComponents = components.map(c => {
        const componentMaterials = (c.materials || []).map((m: any, idx: number) => {
          if (!m.material) return m;

          const cleaned = ensurePriceSnapshot(cleanMaterialData(m.material));
          if (cleaned) {
            // Push to main list for AI/Overview
            const globalKey = `comp_${c.id}_${m.sectionKey || idx}`;
            materialenLijst[globalKey] = withRuleAttachment({
              material: cleaned,
              sectionKey: m.sectionKey,
              context: c.label || c.type,
              type: 'component_material',
              wastePercentage: typeof wasteByEntryKey[globalKey] === 'number'
                ? wasteByEntryKey[globalKey]
                : getDefaultWastePercentage(m.sectionKey || null, m.sectionKey, c.label || c.type)
            }, m.sectionKey || null);
          }

          return {
            sectionKey: m.sectionKey,
            material: cleaned
          };
        });

        return { ...c, materials: componentMaterials };
      });

      // Auto-sync maatwerk.aantal with sum of multi-entry quantities.
      // If the job config marks explicit sync drivers, only those sections count.
      let syncedBaseItems = normalizedBaseItems;
      const syncToJobAantalSectionKeys = new Set(
        (materialSections || [])
          .filter((section: any) => section.multiEntry && section.syncToJobAantal)
          .map((section: any) => section.key)
      );
      const hasExplicitSyncDrivers = syncToJobAantalSectionKeys.size > 0;

      const multiEntryTotalAantal = Object.entries(gekozenMaterialen).reduce((sum, [sectionKey, value]) => {
        if (hasExplicitSyncDrivers && !syncToJobAantalSectionKeys.has(sectionKey)) {
          return sum;
        }
        if (isMultiEntrySlot(value)) {
          return sum + value.entries.reduce((s: number, e: MultiEntryEntry) => s + (e.aantal || 0), 0);
        }
        return sum;
      }, 0);

      if (multiEntryTotalAantal > 0 && Array.isArray(normalizedBaseItems) && normalizedBaseItems.length > 0) {
        syncedBaseItems = normalizedBaseItems.map((item: any, idx: number) =>
          idx === 0 ? { ...item, aantal: multiEntryTotalAantal } : item
        );
      }

      const updatePayload: any = {
        [`klussen.${klusId}.maatwerk`]: JSON.parse(JSON.stringify({
          basis: syncedBaseItems,
          toevoegingen: mappedComponents.map((c: any) => ({
            id: c.id,
            type: c.type,
            label: c.label,
            slug: c.slug,
            afmetingen: c.measurements || {}
          })),
          notities: notities ?? "",
          meta: (klus as any)?.maatwerk?.meta || undefined,
        })),
        [`klussen.${klusId}.components`]: deleteField(),
        [`klussen.${klusId}.materialen.jobKey`]: JOB_KEY,
        [`klussen.${klusId}.materialen.materialen_lijst`]: JSON.parse(JSON.stringify(materialenLijst)),
        [`klussen.${klusId}.materialen.savedByUid`]: user.uid,
        [`klussen.${klusId}.materialen.savedAt`]: serverTimestamp(),

        // CLEANUP: Removing old dirty/legacy fields
        [`klussen.${klusId}.${maatwerkKey}`]: deleteField(),
        [`klussen.${klusId}.materialen.selections`]: deleteField(),
        [`klussen.${klusId}.materialen.custommateriaal`]: deleteField(),
        [`klussen.${klusId}.materialen.extraMaterials`]: deleteField(),

        [`klussen.${klusId}.werkwijze`]: JSON.parse(JSON.stringify({
          workMethodId: gekozenPresetId === 'default' ? null : gekozenPresetId,
          savedByUid: user.uid
        })),
        // [`klussen.${klusId}.uiState.collapsedSections`]: JSON.parse(JSON.stringify(collapsedSections ?? {})),
        // [`klussen.${klusId}.uiState.hiddenCategories`]: JSON.parse(JSON.stringify(hiddenCategories ?? {})),
        [`klussen.${klusId}.uiState`]: deleteField(), // Remove legacy uiState object
        [`klussen.${klusId}.material_notities`]: notities ?? "",
        [`klussen.${klusId}.updatedAt`]: serverTimestamp()
      };

      if (kleinMateriaalConfig.mode === 'none') {
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = deleteField();
      } else {
        const cleanKlein: any = { mode: kleinMateriaalConfig.mode };
        if (kleinMateriaalConfig.mode === 'percentage' && kleinMateriaalConfig.percentage != null) {
          cleanKlein.percentage = kleinMateriaalConfig.percentage;
        } else if (kleinMateriaalConfig.mode === 'fixed' && kleinMateriaalConfig.fixedAmount != null) {
          cleanKlein.fixedAmount = kleinMateriaalConfig.fixedAmount;
        }
        updatePayload[`klussen.${klusId}.kleinMateriaal`] = cleanKlein;
      }

      await updateDoc(doc(firestore, 'quotes', quoteId), updatePayload);

      if (options.navigateTo) {
        router.push(options.navigateTo);
      }

      return true;

    } catch (e: any) {
      console.error(e);
      if (!options.silent) toast({ variant: 'destructive', title: "Fout bij opslaan", description: e.message });
      return false;
    } finally {
      if (!options.silent) setIsOpslaan(false);
      else setIsAutosaving(false);
    }
  };

  // Autosave Effect
  useEffect(() => {
    if (
      !isMounted ||
      isHydratingRef.current ||
      isPresetNotReadyForSave
    ) return;

    // Debounce save by 2 seconds
    const timer = setTimeout(() => {
      saveToFirestore({ silent: true });
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    gekozenMaterialen,
    // extraMaterials removed from deps
    customGroups,
    wasteByEntryKey,
    kleinMateriaalConfig,
    collapsedSections,
    // hiddenCategories removed from autosave - now stored in user profile only (via toggleCategoryVisibility)
    gekozenPresetId,
    notities,
    isMounted,
    isPresetNotReadyForSave,
  ]);

  const getMissingPriceItems = useCallback(() => {
    // Collect all selected materials
    const allMaterials: any[] = [];
    const seenKeys = new Set<string>();
    const catalogById = new Map<string, any>();
    const catalogByName = new Map<string, any>();

    (alleMaterialen || []).forEach((m: any) => {
      const id = m?.row_id || m?.material_ref_id || m?.id;
      if (id) catalogById.set(String(id), m);
      if (m?.materiaalnaam) catalogByName.set(String(m.materiaalnaam), m);
    });

    // 1. Standard selections from gekozenMaterialen
    Object.values(gekozenMaterialen).forEach((v: any) => {
      if (!v) return;
      // Handle multi-entry slots
      if (isMultiEntrySlot(v)) {
        v.entries.forEach((entry: MultiEntryEntry) => {
          const merged = mergeMaterialForPriceCheck(entry.material);
          if (!merged) return;
          const id = merged.row_id || merged.material_ref_id || merged.id || merged.materiaalnaam;
          if (!id || seenKeys.has(String(id))) return;
          seenKeys.add(String(id));
          allMaterials.push(merged);
        });
        return;
      }
      const merged = mergeMaterialForPriceCheck(v);
      const id = merged.row_id || merged.material_ref_id || merged.id || merged.materiaalnaam;
      if (!id || seenKeys.has(String(id))) return;
      seenKeys.add(String(id));
      allMaterials.push(merged);
    });

    // 2. Component materials
    components.forEach((comp) => {
      (comp.materials || []).forEach((m: any) => {
        const merged = mergeMaterialForPriceCheck(m.material || m);
        const id = merged.row_id || merged.material_ref_id || merged.id || merged.materiaalnaam;
        if (!id || seenKeys.has(String(id))) return;
        seenKeys.add(String(id));
        allMaterials.push(merged);
      });
    });

    // Filter to those missing a price
    return allMaterials.filter((m) => {
      const localPrice = getPositivePriceFromMaterial(m);
      const refId = m?.row_id || m?.material_ref_id || m?.id;
      const catalogMat = (refId ? catalogById.get(String(refId)) : null) || (m?.materiaalnaam ? catalogByName.get(String(m.materiaalnaam)) : null);
      const catalogPrice = getPositivePriceFromMaterial(catalogMat);
      const numPrice = localPrice ?? catalogPrice ?? 0;
      return !numPrice || numPrice <= 0;
    });
  }, [gekozenMaterialen, components, alleMaterialen]);

  const handleNext = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (isPresetNotReadyForSave) {
      toast({
        variant: 'destructive',
        title: 'Nog bezig met laden',
        description: 'Wacht tot het werkpakket volledig is geladen voordat je opslaat.',
      });
      return;
    }


    const hasMeasurements = jobConfig?.measurements && jobConfig.measurements.length > 0;
    const navigateTo = hasMeasurements
      ? `/offertes/${quoteId}/klus/${klusId}/${categorySlug}/${jobSlug}`
      : `/offertes/${quoteId}/overzicht`;

    // Save to Firestore first (without navigation)
    const didSave = await saveToFirestore({});
    if (!didSave) return;

    const missing = getMissingPriceItems();
    const hasPendingSafety = pendingSafetyItems.length > 0;

    if (missing.length > 0 || hasPendingSafety) {
      setMissingPriceItems(missing);
      setMissingPriceInputsExcl({});
      setMissingPriceInputsIncl({});
      setMissingPriceEenheden({});
      setMissingPriceSaved({});
      setPendingNavigateTo(navigateTo);
      setShowMissingPriceDialog(true);
    } else {
      router.push(navigateTo);
    }
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isPresetNotReadyForSave) {
      toast({
        variant: 'destructive',
        title: 'Nog bezig met laden',
        description: 'Wacht tot het werkpakket volledig is geladen voordat je verdergaat.',
      });
      return;
    }
    // Material page is now the first step after job selection — go back to category/job selection
    const hasOnlyOneItem = categoryConfig?.items?.length === 1;
    const backUrl = hasOnlyOneItem
      ? `/offertes/${quoteId}/klus/nieuw`
      : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`;
    saveToFirestore({ navigateTo: backUrl });
  };


  const handlePresetDeleteWrapper = (preset: any) => { setPresetToDelete(preset); setDeleteConfirmationOpen(true); };
  const handlePresetSetDefaultWrapper = (preset: any) => handleSetDefaultPreset(preset);

  // Page progress (not item completion)
  // This is the materials page, which is step 3 of 4 (after client info at 0%)
  // Client info (0%) -> Job selection (25%) -> Job details (50%) -> Materials (75%) -> Overview (100%)
  const pageProgress = 60;

  if (!isMounted) return null;

  return (
    <>
      <main className="relative min-h-screen bg-background">
        {/* HEADER - Consistent with other pages */}
        <WizardHeader
          title={JOB_TITEL}
          backLink={
            categoryConfig?.items?.length === 1
              ? `/offertes/${quoteId}/klus/nieuw`
              : `/offertes/${quoteId}/klus/nieuw/${categorySlug}`
          }
          progress={pageProgress}
          quoteId={quoteId}
          rightContent={
            isPaginaLaden ? (
              <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
            ) : (
              <div className="flex items-center gap-2">
                <PersonalNotes quoteId={quoteId} context={`Materialen: ${JOB_TITEL}`} />
              </div>
            )
          }
        />

        {/* CONTENT */}
        <div className="px-4 py-4 max-w-5xl mx-auto w-full pb-[280px] space-y-6">
          {foutMaterialen && (<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{foutMaterialen}</div>)}

          {/* Helper: Main Job Measurements - REMOVED per user request */}

          {/* Preset Selector - Compact */}
          <div className="space-y-3 pb-8 mb-8 border-b border-border/60">
            <Label className="text-base font-semibold text-foreground/90">Kies Een Werkpakket</Label>
            <div
              className="grid w-full items-stretch"
              style={{ gridTemplateColumns: '84% 15%', columnGap: '1%' }}
            >
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-border/70 bg-card/40 text-foreground hover:bg-muted/40 hover:border-border justify-between px-3"
                onClick={() => setPresetPickerOpen(true)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 text-left flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {gekozenPresetId === 'default' ? 'Nieuw' : (selectedPreset?.name || 'Werkpakket')}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      •
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {gekozenPresetId === 'default'
                        ? 'Start zonder werkpakket'
                        : selectedPreset?.isDefault
                          ? 'Standaard werkpakket'
                          : 'Klik om werkpakket te kiezen'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-border/70 bg-card/40 text-foreground hover:bg-muted/40 hover:border-border font-semibold"
                onClick={resetToNieuwWithoutWarning}
              >
                <Sparkles className="h-4 w-4 mr-2 text-muted-foreground" />
                Nieuw
              </Button>
            </div>
          </div>

          {/* Compact Checklist Structure */}
          <div className="space-y-6">
            {/* Use job-specific categoryConfig if available, otherwise fall back to MATERIAL_CATEGORY_INFO */}
            {(Object.entries(jobConfig?.categoryConfig || MATERIAL_CATEGORY_INFO) as [MaterialCategoryKey, any][])
              .sort(([keyA, a], [keyB, b]) => {
                // Check if this is a complex job with component injection sections
                const isComplexJob = (
                  jobSlug.includes('hsb')
                  || jobSlug.includes('metalstud')
                  || jobSlug.includes('wand')
                  || jobSlug.includes('dak')
                  || jobSlug.includes('hellend')
                  || jobSlug.includes('plat')
                  || jobSlug.includes('gevelbekleding')
                  || categorySlug === 'gevelbekleding'
                );
                const isCeilingJob = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');
                const isBoeiboordSection = (keyA === 'boeiboord' || (keyA as string).toLowerCase() === 'boeiboorden');
                const isVlizotrapSectionA = (keyA === 'Toegang' || keyA === 'Vliering_Toegang' || (keyA as string).toLowerCase().includes('vlizotrap') || (keyA as string).toLowerCase().includes('toegang'));
                const isVlizotrapSectionB = (keyB === 'Toegang' || keyB === 'Vliering_Toegang' || (keyB as string).toLowerCase().includes('vlizotrap') || (keyB as string).toLowerCase().includes('toegang'));

                const isAComponentSection = (isComplexJob && (
                  keyA === 'Kozijnen' || (keyA as string).toLowerCase() === 'kozijnen' ||
                  keyA === 'Deuren' || (keyA as string).toLowerCase() === 'deuren' ||
                  keyA === 'Koof' ||
                  (keyA === 'boeiboord' || (keyA as string).toLowerCase() === 'boeiboorden') ||
                  keyA === 'Installatie' || keyA === 'Schakelmateriaal' ||
                  keyA === 'Dagkant' || keyA === 'Vensterbank' ||
                  (isGevelbekledingJob && (keyA as string).toLowerCase() === 'daktrim')
                )) || (isCeilingJob && (isVlizotrapSectionA || keyA === 'Koof' || keyA === 'Installatie' || keyA === 'Schakelmateriaal')) || (keyA === 'gips_afwerking') ||
                  (keyA === 'isolatie' && (categorySlug === 'boeidelen' || categorySlug === 'boeiboorden' || jobSlug.includes('boeidelen') || jobSlug.includes('boeiboord')));

                const isBComponentSection = (isComplexJob && (
                  keyB === 'Kozijnen' || (keyB as string).toLowerCase() === 'kozijnen' ||
                  keyB === 'Deuren' || (keyB as string).toLowerCase() === 'deuren' ||
                  keyB === 'Koof' ||
                  (keyB === 'boeiboord' || (keyB as string).toLowerCase() === 'boeiboorden') ||
                  keyB === 'Installatie' || keyB === 'Schakelmateriaal' ||
                  keyB === 'Dagkant' || keyB === 'Vensterbank' ||
                  (isGevelbekledingJob && (keyB as string).toLowerCase() === 'daktrim')
                )) || (isCeilingJob && (isVlizotrapSectionB || keyB === 'Koof' || keyB === 'Installatie' || keyB === 'Schakelmateriaal')) || (keyB === 'gips_afwerking') ||
                  (keyB === 'isolatie' && (
                    categorySlug === 'boeidelen' ||
                    categorySlug === 'boeiboorden' ||
                    categorySlug === 'gevelbekleding' ||
                    jobSlug.includes('boeidelen') ||
                    jobSlug.includes('boeiboord') ||
                    jobSlug.includes('gevelbekleding')
                  ));

                // Push component sections to the end
                if (isAComponentSection && !isBComponentSection) return 1;
                if (!isAComponentSection && isBComponentSection) return -1;

                // Otherwise sort by order
                return a.order - b.order;
              })
              .map(([categoryKey, categoryInfo]) => {
                // 1. Identify Job Context
                const isComplexJob = (
                  jobSlug.includes('hsb')
                  || jobSlug.includes('metalstud')
                  || jobSlug.includes('wand')
                  || jobSlug.includes('dak')
                  || jobSlug.includes('hellend')
                  || jobSlug.includes('plat')
                  || jobSlug.includes('gevelbekleding')
                  || categorySlug === 'gevelbekleding'
                );
                const isCeilingJob = (jobSlug.includes('plafond') || jobSlug.includes('vliering') || jobSlug.includes('bergzolder') || categorySlug === 'plafonds');

                // 2. Identify Section Type
                const lowerKey = (categoryKey as string).toLowerCase();
                const isKozijnenSection = (categoryKey === 'Kozijnen' || lowerKey === 'kozijnen');
                const isDeurenSection = (categoryKey === 'Deuren' || lowerKey === 'deuren');
                const isBoeiboordSection = (categoryKey === 'boeiboord' || lowerKey === 'boeiboorden');
                const isVlizotrapSection = (categoryKey === 'Toegang' || categoryKey === 'Vliering_Toegang' || lowerKey.includes('vlizotrap') || lowerKey.includes('toegang'));
                const isKoofSection = categoryKey === 'Koof';
                const isPlafondSection = categoryKey === 'plafond';
                const isInstallatieSection = categoryKey === 'Installatie' || categoryKey === 'Schakelmateriaal';
                const isDagkantSection = categoryKey === 'Dagkant' || lowerKey === 'dagkant';
                const isVensterbankSection = categoryKey === 'Vensterbank' || lowerKey === 'vensterbank';
                const isDaktrimSection = categoryKey === 'daktrim' || lowerKey === 'daktrim';
                const isGipsSection = categoryKey === 'gips_afwerking';
                const isIsolatieSection = categoryKey === 'isolatie';

                // 3. Guards (Prevents Global Fallback Pollution)
                if (isBoeiboordSection) {
                  const isBoeiboordJob = jobSlug.includes('boeidelen') || jobSlug.includes('boeiboord') || categorySlug === 'boeidelen' || categorySlug === 'boeiboorden';
                  // Force return null if not a boeiboord job
                  if (!isBoeiboordJob) return null;
                }

                if (isPlafondSection && !isCeilingJob) return null;


                // 4. Determine Target Component Type (For "+ Add Button")
                const allowDoorComponents = showOpeningsSection || isComplexJob;
                let targetComponentType: JobComponentType | null = null;

                if (isKozijnenSection && allowDoorComponents) targetComponentType = 'kozijn';
                else if (isDeurenSection && allowDoorComponents) targetComponentType = 'deur';
                else if (isBoeiboordSection) {
                  const isBoeiboordJob = jobSlug.includes('boeidelen') || jobSlug.includes('boeiboord') || categorySlug === 'boeidelen' || categorySlug === 'boeiboorden';
                  if (isBoeiboordJob) targetComponentType = 'boeiboord';
                }
                else if (isKoofSection) targetComponentType = 'koof';
                else if (isInstallatieSection) targetComponentType = 'installatie';
                else if (isDagkantSection && allowDoorComponents) targetComponentType = 'dagkant';
                else if (isVensterbankSection && isGevelbekledingJob) targetComponentType = 'waterslag';
                else if (isVensterbankSection && allowDoorComponents) targetComponentType = 'vensterbank';
                else if (isDaktrimSection && isGevelbekledingJob) targetComponentType = 'daktrim';
                else if (isVlizotrapSection) targetComponentType = 'vlizotrap';
                else if (isPlafondSection) targetComponentType = 'plafond';
                else if (isGipsSection) targetComponentType = 'gips';
                else if (isIsolatieSection && (
                  categorySlug === 'boeidelen' ||
                  categorySlug === 'boeiboorden' ||
                  categorySlug === 'gevelbekleding' ||
                  jobSlug.includes('boeidelen') ||
                  jobSlug.includes('boeiboord') ||
                  jobSlug.includes('gevelbekleding')
                )) targetComponentType = 'isolatie';

                // 5. Visibility Check
                const sections = groupedSections[categoryKey] || [];
                // Allow rendering if sections exist OR if it's a component-adding section (even if empty of standard materials)
                if (sections.length === 0 && !targetComponentType) return null;

                const isHidden = hiddenCategories[categoryKey];
                const addActionLabelByType: Record<string, string> = {
                  kozijn: 'Kozijn',
                  deur: 'Deur',
                  vlizotrap: 'Vlizotrap',
                  koof: 'Koof',
                  installatie: 'Installatie',
                  dagkant: 'Dagkant',
                  vensterbank: 'Vensterbank',
                  waterslag: 'Waterslagen',
                  daktrim: 'Daktrim',
                  gips: 'Naden & Stucwerk',
                  isolatie: 'Isolatie & Folies',
                  plafond: 'Plafond',
                };
                const addActionLabel = targetComponentType
                  ? (addActionLabelByType[targetComponentType] || 'Boeiboord')
                  : 'Boeiboord';

                return (
                  <div key={categoryKey} className="space-y-2">
                    {/* Debug Info (Hidden in prod) */}
                    {/* <div className="text-xs text-red-500 hidden">Key: {categoryKey}, Type: {targetComponentType}</div> */}
                    <div
                      onClick={(e) => {
                        if (targetComponentType) {
                          if (isHidden) toggleCategoryVisibility(categoryKey);

                          // Direct Add logic for types without complex measurements
                          if (targetComponentType === 'vlizotrap') {
                            const newVlizotrap = {
                              id: `vlizotrap-${Date.now()}`,
                              type: 'vlizotrap' as const,
                              label: 'Vlizotrap',
                              measurements: {},
                              materials: getPresetMaterialsForType('vlizotrap')
                            };
                            setComponents(prev => [...prev, newVlizotrap]);
                          } else if (targetComponentType === 'installatie') {
                            const newInstallatie = {
                              id: `installatie-${Date.now()}`,
                              type: 'installatie' as const,
                              label: 'Installatie & Elektra',
                              measurements: {},
                              materials: getPresetMaterialsForType('installatie')
                            };
                            setComponents(prev => [...prev, newInstallatie]);
                          } else if (targetComponentType === 'gips') {
                            const newGips = {
                              id: `gips-${Date.now()}`,
                              type: 'gips' as const,
                              label: 'Naden & Stucwerk',
                              measurements: {},
                              materials: getPresetMaterialsForType('gips')
                            };
                            setComponents(prev => [...prev, newGips]);
                          } else if (targetComponentType === 'koof') {
                            const newKoof = {
                              id: `koof-${Date.now()}`,
                              type: 'koof' as const,
                              label: 'Koof',
                              measurements: {},
                              materials: getPresetMaterialsForType('koof')
                            };
                            setComponents(prev => [...prev, newKoof]);
                          } else if (targetComponentType === 'isolatie') {
                            const newIsolatie = {
                              id: `isolatie-${Date.now()}`,
                              type: 'isolatie' as const,
                              label: 'Isolatie & Folies',
                              measurements: {},
                              materials: getPresetMaterialsForType('isolatie')
                            };
                            setComponents(prev => [...prev, newIsolatie]);
                          } else if (targetComponentType === 'waterslag') {
                            const newWaterslag = {
                              id: `waterslag-${Date.now()}`,
                              type: 'waterslag' as const,
                              label: 'Waterslagen',
                              measurements: {},
                              materials: getPresetMaterialsForType('waterslag')
                            };
                            setComponents(prev => [...prev, newWaterslag]);
                          } else if (targetComponentType === 'daktrim') {
                            const newDaktrim = {
                              id: `daktrim-${Date.now()}`,
                              type: 'daktrim' as const,
                              label: 'Daktrim',
                              measurements: {},
                              materials: getPresetMaterialsForType('daktrim')
                            };
                            setComponents(prev => [...prev, newDaktrim]);
                          } else {
                            // If only one variant exists, add directly; otherwise open picker.
                            openVariantPickerOrAdd(targetComponentType);
                          }
                        } else {
                          toggleCategoryVisibility(categoryKey);
                        }
                      }}
                      className="flex items-center justify-between px-3 py-3 -mx-4 hover:bg-muted/40 active:bg-muted/60 rounded-lg cursor-pointer transition-all group select-none border-l-2 border-b border-b-border/30 min-h-[44px] mt-2" style={{ borderLeftColor: '#4A5568' }}
                    >
                      {targetComponentType ? (
                        <div className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 font-medium w-full">
                          <Plus className="h-4 w-4" />
                          <span className="text-sm font-medium uppercase" style={{ letterSpacing: '0.05em' }}>{addActionLabel} toevoegen</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <h2 className={cn(
                            "text-sm font-semibold uppercase transition-colors shrink-0",
                            isHidden ? "text-muted-foreground" : "text-foreground"
                          )} style={{ letterSpacing: '0.05em' }}>{categoryInfo.title}</h2>
                          {isHidden && (() => {
                            const filledSections = sections.filter((s: any) => {
                              const val = gekozenMaterialen[s.key];
                              return val?.materiaalnaam || (isMultiEntrySlot(val) && val.entries.length > 0);
                            });
                            if (filledSections.length === 0) return null;
                            return filledSections.map((s: any) => {
                              const val = gekozenMaterialen[s.key];
                              const label = isMultiEntrySlot(val)
                                ? `${val.entries.length}x ${s.label}`
                                : val.materiaalnaam;
                              return (
                                <span key={s.key} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium normal-case tracking-normal truncate max-w-[180px] animate-in fade-in slide-in-from-left-2">
                                  {label}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )}

                      {(!targetComponentType || components.some(c => c.type === targetComponentType)) ? (
                        <div
                          className="p-1.5 rounded-md text-muted-foreground group-hover:text-foreground transition-colors"
                          title={isHidden ? "Toon categorie" : "Verberg categorie"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategoryVisibility(categoryKey);
                          }}
                        >
                          {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                      ) : (
                        <div className="p-1.5 w-7" /> /* Spacer for consistent height */
                      )}
                    </div>

                    {
                      !isHidden && (
                        <div className="space-y-1.5">
                          {targetComponentType ? (
                            <div className="pl-0 sm:pl-2 space-y-8">

                              {/* Custom Rendering of Components with Expanded Materials */}
                              {components.filter(c => c.type === targetComponentType).map((comp, idx) => {
                                // Lookup variant config from registry via slug
                                let variantItem = null;
                                if (targetComponentType === 'kozijn') {
                                  variantItem = comp.slug ? JOB_REGISTRY.kozijnen.items.find((i: any) => i.slug === comp.slug) : null;
                                } else if (targetComponentType === 'deur') {
                                  variantItem = comp.slug ? JOB_REGISTRY.deuren.items.find((i: any) => i.slug === comp.slug) : null;
                                } else if (targetComponentType === 'dagkant') {
                                  variantItem = comp.slug ? JOB_REGISTRY.afwerkingen.items.find((i: any) => i.slug === comp.slug) : null;
                                } else if (targetComponentType === 'vensterbank') {
                                  variantItem = comp.slug ? JOB_REGISTRY.afwerkingen.items.find((i: any) => i.slug === comp.slug) : null;
                                }

                                let compSections = variantItem?.materialSections || COMPONENT_REGISTRY[comp.type]?.defaultMaterials || [];

                                // Custom Filtering based on opening type for Kozijnen
                                if (targetComponentType === 'kozijn' && comp.meta?.openingType) {
                                  const type = comp.meta.openingType;
                                  if (type === 'window' || type === 'raamkozijn') {
                                    // For windows: hide door specific fields
                                    compSections = compSections.filter((s: any) =>
                                      !['beslag', 'deurbeslag', 'deur_scharnieren', 'deur_sloten', 'deur_krukken'].some(k =>
                                        s.key.includes(k) || (s.category && s.category.toLowerCase().includes('deur'))
                                      )
                                    );
                                  } else if (type === 'door-frame' || type === 'door' || type === 'deurkozijn') {
                                    // For doors: hide window specific fields (like specific glas details if needed, though doors can have glass)
                                    // But definitely show hinges/locks. 
                                    // Maybe hide 'raam' section if it exists (which implies opening window parts)
                                    compSections = compSections.filter((s: any) => s.key !== 'raam');
                                  }
                                }

                                // Gevelbekleding-specific component overrides
                                if (isGevelbekledingJob && targetComponentType === 'koof') {
                                  compSections = compSections
                                    .filter((s: any) => !['constructieplaat', 'koof_constructieplaat', 'koof_beplating'].includes(String(s.key)))
                                    .map((s: any) =>
                                      ['afwerkplaat', 'koof_afwerkplaat'].includes(String(s.key))
                                        ? { ...s, categoryFilter: 'Exterieur platen' }
                                        : s
                                    );
                                }

                                if (isGevelbekledingJob && targetComponentType === 'dagkant') {
                                  compSections = compSections.map((s: any) =>
                                    ['dagkant', 'dagkanten'].includes(String(s.key))
                                      ? { ...s, label: 'Afwerkplaat', categoryFilter: 'Exterieur platen' }
                                      : s
                                  );
                                }

                                // ALL COMPONENTS: Simplified rendering (Vlizotrap Style)
                                // User requested uniform "clean list" style for everything, including Kozijnen/Deuren.
                                if (targetComponentType) {

                                  return (
                                    <div key={comp.id} className="mt-2 space-y-1.5">
                                      {/* Header / Label with visual indicator */}
                                      <div className="flex items-center gap-2 mb-2 px-1">
                                        <div className={cn(
                                          "w-1.5 h-1.5 rounded-full shrink-0",
                                          comp.meta?.openingType === 'window' ? "bg-blue-400" :
                                            comp.meta?.openingType === 'door-frame' || comp.meta?.openingType === 'door' ? "bg-orange-400" : "bg-gray-400"
                                        )} />
                                        <span className="text-sm font-semibold text-foreground/90">{comp.label}</span>
                                      </div>

                                      {/* Werkpakket Selector - per component type */}
                                      {targetComponentType && (
                                        <div className="flex items-center gap-1.5 mb-3 p-2 rounded-lg bg-muted/20 border border-border/30">
                                          <div className="flex-1 space-y-1.5">
                                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                              Werkpakket
                                            </Label>
                                            <Select
                                              value={componentPresetSelection[comp.id] || 'default'}
                                              onValueChange={(val) => {
                                                setComponentPresetSelection(prev => ({ ...prev, [comp.id]: val }));
                                                if (val !== 'default') {
                                                  handleApplyComponentPreset(val, targetComponentType, comp.id);
                                                }
                                              }}
                                            >
                                              <SelectTrigger className="w-full bg-background/60 border-emerald-500/20 focus:ring-emerald-500/20 h-9">
                                                <div className="flex items-center gap-2">
                                                  <Box className="w-4 h-4 text-emerald-500" />
                                                  <SelectValue placeholder="Kies werkpakket" />
                                                </div>
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem className={SELECT_ITEM_GREEN} value="default">Nieuw</SelectItem>
                                                {(componentPresets[targetComponentType] || []).map((p: any) => (
                                                  <SelectItem className={SELECT_ITEM_GREEN} key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 shrink-0 mt-5 text-muted-foreground hover:text-emerald-500"
                                            title="Opslaan als werkpakket"
                                            onClick={() => {
                                              setSaveComponentPresetType(targetComponentType);
                                              setSaveComponentPresetCompId(comp.id);
                                              setSaveComponentPresetOpen(true);
                                            }}
                                          >
                                            <Save className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      )}

                                      {/* Clean material list without sub-categories */}
                                      {compSections.map((section: any) => {
                                        const selectedForThis = (comp.materials || []).find((m: any) => {
                                          if (m.sectionKey === section.key) return true;
                                          if (
                                            isGevelbekledingJob
                                            && targetComponentType === 'dagkant'
                                            && (
                                              (section.key === 'dagkant' && m.sectionKey === 'dagkanten')
                                              || (section.key === 'dagkanten' && m.sectionKey === 'dagkant')
                                            )
                                          ) {
                                            return true;
                                          }
                                          if (
                                            isGevelbekledingJob
                                            && targetComponentType === 'vensterbank'
                                            && section.key === 'vensterbank'
                                            && m.sectionKey === 'waterslag'
                                          ) {
                                            return true;
                                          }
                                          return false;
                                        })?.material;

                                        return (
                                          <div key={section.key} className="relative group">
                                            <MaterialRow
                                              label={section.label}
                                              selected={selectedForThis}
                                              onClick={() => {
                                                setActiveComponentId(comp.id);
                                                openMateriaalKiezer(section.key, null, {
                                                  key: section.key,
                                                  label: section.label,
                                                  categoryFilter: section.categoryFilter,
                                                  categoryUltraFilter: section.category_ultra_filter,
                                                });
                                              }}
                                              onRemove={() => {
                                                handleComponentMaterialRemove(comp.id, section.key);
                                                if (
                                                  isGevelbekledingJob
                                                  && targetComponentType === 'dagkant'
                                                  && section.key === 'dagkant'
                                                ) {
                                                  handleComponentMaterialRemove(comp.id, 'dagkanten');
                                                }
                                                if (
                                                  isGevelbekledingJob
                                                  && targetComponentType === 'vensterbank'
                                                  && section.key === 'vensterbank'
                                                ) {
                                                  handleComponentMaterialRemove(comp.id, 'waterslag');
                                                }
                                              }}
                                            />
                                          </div>
                                        );
                                      })}
                                      {/* Footer Actions: Edit (if applicable) & Delete */}
                                      <div className="flex justify-end pt-2 pb-1 gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-60 hover:opacity-100 transition-opacity"
                                          onClick={() => setComponentDeleteId(comp.id)}
                                        >
                                          <Trash2 className="h-3 w-3 mr-1" />

                                          {comp.label || 'Onderdeel'} verwijderen
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                }


                                return null;
                              })}


                            </div>
                          ) : (
                            <>
                              {sections.map(section => (
                                <React.Fragment key={section.key}>
                                  {section.multiEntry ? (
                                    <MultiEntryMaterialSlot
                                      sectionLabel={section.label}
                                      sectionKey={section.key}
                                      slotData={isMultiEntrySlot(gekozenMaterialen[section.key]) ? gekozenMaterialen[section.key] : null}
                                      maxEntries={typeof section.maxEntries === 'number' ? section.maxEntries : null}
                                      onAddEntry={() => openMultiEntryModal(section.key, null)}
                                      onEditEntry={(entryId) => openMultiEntryModal(section.key, entryId)}
                                      onRemoveEntry={(entryId) => handleMultiEntryRemove(section.key, entryId)}
                                      onUpdateAantal={(entryId, aantal) => handleMultiEntryAantal(section.key, entryId, aantal)}
                                    />
                                  ) : (
                                    <>
                                      <MaterialRow
                                        label={section.label}
                                        selected={gekozenMaterialen[section.key]}
                                        onClick={() => openMateriaalKiezer(section.key, null, {
                                          key: section.key,
                                          label: section.label,
                                          categoryFilter: section.categoryFilter,
                                          categoryUltraFilter: section.category_ultra_filter,
                                        })}
                                        onRemove={() => handleMateriaalVerwijderen(section.key)}
                                      />
                                      {/* Beam Height Warning - shows after staanders selection */}
                                      {['staanders_en_liggers', 'regelwerk_hoofd', 'ms_staanders'].includes(section.key) && beamHeightWarning && (
                                        <div className="mx-1 mb-2 p-3 rounded-lg border bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                          <div className="flex items-start gap-2.5">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                                                {beamHeightWarning.isTooShort ? 'Balk te kort' : 'Controleer balkhoogte'}
                                              </p>
                                              <p className="text-xs text-amber-700/80 dark:text-amber-500/70 mt-0.5 leading-relaxed">
                                                De wandhoogte is <strong>{beamHeightWarning.wallHeight}mm</strong> en de gekozen balken zijn{' '}
                                                <strong>{beamHeightWarning.beamLength}mm</strong>.
                                                {beamHeightWarning.isTooShort && (
                                                  <> Dit is <strong className="text-red-600">{beamHeightWarning.missingLength}mm te kort</strong>.</>
                                                )}
                                                {' '}Is dit correct?
                                              </p>
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-8 bg-amber-100 border-amber-300 text-amber-900 hover:bg-emerald-100 hover:text-emerald-900 hover:border-emerald-300 transition-colors shrink-0"
                                              onClick={() => suggestBetterBeam(section.key)}
                                            >
                                              <Sparkles className="mr-2 h-3.5 w-3.5" />
                                              Balk aanpassen
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          )}
                        </div>
                      )
                    }
                  </div>
                );
              })}

            {/* Orphaned Components (Debug/Cleanup) */}
            {orphanedComponents.length > 0 && (
              <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Trash2 className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-700">
                      Niet-toegewezen Onderdelen ({orphanedComponents.length})
                    </h3>
                  </div>
                  <p className="text-xs text-amber-600/80 leading-relaxed">
                    Deze onderdelen zijn opgeslagen maar horen niet bij de huidige klus-configuratie.
                    Verwijder ze om uw offerte schoon te houden.
                  </p>
                </div>

                <div className="space-y-2">
                  {orphanedComponents.map((comp) => (
                    <div key={comp.id} className="flex items-center justify-between p-3 rounded-lg border border-amber-200/50 bg-amber-50/50 hover:bg-amber-100/50 transition-colors group">
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-sm font-medium text-amber-900 truncate">{comp.label}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700/60 bg-amber-200/30 px-1.5 py-0.5 rounded">
                            {comp.type || 'ONBEKEND'}
                          </span>
                          <span className="text-[10px] text-amber-700/40 font-mono truncate max-w-[120px]">
                            ID: {comp.id}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setComponentDeleteId(comp.id)}
                        className="text-amber-600 hover:text-red-600 hover:bg-red-100/50 shrink-0 h-8"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Verwijderen
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extra Materials Category */}
            <div className="space-y-2">
              <div
                onClick={() => setAddExtraMaterialOpen(true)}
                className="flex items-center justify-between px-3 py-3 -mx-4 hover:bg-muted/40 active:bg-muted/60 rounded-lg cursor-pointer transition-all group select-none border-l-2 border-b border-b-border/30 min-h-[44px]"
                style={{ borderLeftColor: '#4A5568' }}
              >
                <div className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 font-medium w-full">
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium uppercase" style={{ letterSpacing: '0.05em' }}>Extra materiaal toevoegen</span>
                </div>
                <div className="p-1.5 w-7" /> {/* Spacer for consistent height */}
              </div>

              {/* Show added extra materials below */}
              {((groupedSections.extra || []).length > 0 || customGroups.length > 0) && (
                <div className="space-y-1.5">
                  {(groupedSections.extra || []).map(section => (
                    <MaterialRow
                      key={section.key}
                      label={section.label}
                      selected={gekozenMaterialen[section.key]}
                      onClick={() => openMateriaalKiezer(section.key, null, {
                        key: section.key,
                        label: section.label,
                        categoryFilter: section.categoryFilter,
                        categoryUltraFilter: section.category_ultra_filter,
                      })}
                      onRemove={() => handleMateriaalVerwijderen(section.key)}
                    />
                  ))}

                  {customGroups.map((group) => {
                    const material = group.materials[0];
                    return (
                      <MaterialRow
                        key={group.id}
                        label={group.title || 'Extra materiaal'}
                        selected={material}
                        onClick={() => { setActiveGroupId(group.id); setIsExtraModalOpen(true); }}
                        onRemove={() => setCustomGroups((prev) => prev.filter((g) => g.id !== group.id))}
                        isCustom
                        onEditTitle={() => setEditingTitleId(group.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* (Legacy Helper Removed) */}

          {/* Klein Material - Card style */}
          <div>
            {renderKleinMateriaalSectie()}
          </div>

          {/* Public Job Notes Section - Matching Measurement Page Style */}
          <div className="space-y-3 pt-6 border-t border-white/5">
            <div>
              <h3 className="text-lg font-medium text-amber-500">Slimme Notities</h3>
              <p className="text-sm text-muted-foreground">Onze assistent begrijpt vrije tekst. Type simpelweg wat je extra nodig hebt en de geschatte prijs; wij voegen het toe aan de calculatie.</p>
            </div>
            <div className="p-5 rounded-2xl border border-white/5 bg-card/40 shadow-sm backdrop-blur-xl">
              <Textarea
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
                placeholder={notesPlaceholderText}
                className="min-h-[120px] bg-black/20 border-white/10 focus-visible:ring-emerald-500/50 resize-y"
              />
            </div>
          </div>
        </div>
      </main >

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap sm:flex-nowrap justify-between items-center gap-2">
          <Button variant="outline" disabled={isOpslaan || isPresetNotReadyForSave} onClick={handleBack}>
            Terug
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsMaterialExportOpen(true)}
            disabled={materialExportItems.length === 0}
            className="gap-2"
          >
            <Share2 className="h-4 w-4" />
            Materiaallijst delen
          </Button>

          <Button
            variant="outline"
            disabled={isPresetNotReadyForSave}
            onClick={() => setSavePresetModalOpen(true)}
            className="gap-2"
          >
            Opslaan als werkpakket
            <Save className="h-4 w-4" />
          </Button>

          <Button
            type="submit"
            variant="success"
            disabled={isOpslaan || isPresetNotReadyForSave}
            onClick={handleNext}
          >
            {isOpslaan ? 'Opslaan...' : isPresetNotReadyForSave ? 'Werkpakket laden...' : 'Opslaan'}
          </Button>
        </div>
      </div >

      {/* MODALS */}
      < ManagePresetsDialog
        open={managePresetsModalOpen}
        onOpenChange={setManagePresetsModalOpen}
        presets={presets}
        onDelete={handlePresetDeleteWrapper}
        onSetDefault={handlePresetSetDefaultWrapper}
      />

      {/* Component Deletion Confirmation Dialog */}
      <AlertDialog open={!!componentDeleteId} onOpenChange={(open) => !open && setComponentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Onderdeel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{components.find(c => c.id === componentDeleteId)?.label}</strong> wilt verwijderen? Alle materialen in dit onderdeel gaan verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (componentDeleteId) {
                  handleComponentDelete(componentDeleteId);
                  setComponentDeleteId(null);
                }
              }}
              className={buttonVariants({ variant: "destructiveSoft" })}
            >
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
        presets={presets}
        defaultName={gekozenPresetId !== 'default' ? presets.find(p => p.id === gekozenPresetId)?.name : ''}
      />

      {/* Per-component werkpakket save dialog */}
      <SaveComponentPresetDialog
        open={saveComponentPresetOpen}
        onOpenChange={setSaveComponentPresetOpen}
        componentType={saveComponentPresetType}
        existingPresets={saveComponentPresetType ? (componentPresets[saveComponentPresetType] || []) : []}
        onSave={async (name: string) => {
          if (!saveComponentPresetType || !saveComponentPresetCompId) return;
          const saved = await handleSaveComponentPreset(name, saveComponentPresetType, saveComponentPresetCompId);
          if (saved) {
            toast({ title: 'Werkpakket opgeslagen', description: `"${name}" is opgeslagen voor ${COMPONENT_REGISTRY[saveComponentPresetType]?.title || saveComponentPresetType}.` });
          }
        }}
      />

      <AddExtraMaterialDialog
        open={addExtraMaterialOpen}
        onOpenChange={setAddExtraMaterialOpen}
        onAdd={(title: string) => {
          setCustomGroups((prev) => [...prev, { id: maakId(), title, materials: [] }]);
        }}
      />

      <MaterialListExportDialog
        isOpen={isMaterialExportOpen}
        onClose={() => setIsMaterialExportOpen(false)}
        items={materialExportItems}
        meta={materialExportContext}
        suppliers={materialSuppliers}
        defaultSupplierId={defaultMaterialSupplierId}
        onUpdateSupplierContact={handleUpdateMaterialSupplierContact}
        onCreateSupplier={handleCreateMaterialSupplier}
      />

      <Dialog open={presetPickerOpen} onOpenChange={setPresetPickerOpen}>
        <DialogContent className={cn('w-[95vw] max-w-[1200px] h-[88vh] overflow-hidden flex flex-col', DIALOG_CLOSE_TAP)}>
          <DialogHeader className="space-y-2">
            <DialogTitle>Kies een werkpakket</DialogTitle>
            <DialogDescription>
              Selecteer een werkpakket of beheer het direct vanuit deze lijst.
            </DialogDescription>
          </DialogHeader>

          {builtInPresetCards.length > 0 ? (
            <div className="space-y-2 py-1">
              {builtInPresetCards.map((preset: any) => renderPresetPickerCard(preset, customPresetCards.length > 0))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek werkpakket..."
              value={presetPickerSearch}
              onChange={(e) => setPresetPickerSearch(e.target.value)}
              className="pl-9 h-10 border-muted-foreground/20 focus-visible:ring-emerald-500/40"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 py-1">
            {customPresetCards.map((preset: any) => renderPresetPickerCard(preset, customPresetCards.length > 0))}
            {builtInPresetCards.length === 0 && customPresetCards.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10">Geen werkpakketten gevonden.</div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2 justify-start sm:justify-start">
            <Button variant="ghost" onClick={() => setPresetPickerOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={presetConfirmOpen} onOpenChange={setPresetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Werkpakket wisselen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt zelf materialen geselecteerd. Als je nu van werkpakket wisselt, worden deze <strong>overschreven</strong> en gaan je selecties verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPresetId(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPresetId) applyPresetChange(pendingPresetId);
              }}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Overschrijven
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Title Dialog */}
      <Dialog open={editingTitleId !== null} onOpenChange={(open) => !open && setEditingTitleId(null)}>
        <DialogContent className={cn('max-w-md w-full', DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>Naam wijzigen</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Naam *</Label>
              <Input
                id="edit-title"
                value={customGroups.find(g => g.id === editingTitleId)?.title || ''}
                onChange={(e) => {
                  setCustomGroups((prev) =>
                    prev.map((g) => g.id === editingTitleId ? { ...g, title: e.target.value } : g)
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTitleId(null);
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTitleId(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmationOpen} onOpenChange={setDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePreset}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MaterialSelectionModal
        open={isExtraModalOpen}
        onOpenChange={(open) => {
          setIsExtraModalOpen(open);
          if (!open) {
            resetActiveMaterialModalState();
          }
        }}
        quoteId={quoteId}
        klusId={klusId}
        onUpdateWaste={(newWaste) => {
          if (activeComponentId && actieveSectie) {
            const entryKey = `comp_${activeComponentId}_${actieveSectie}`;
            setWasteByEntryKey(prev => ({ ...prev, [entryKey]: newWaste }));
          } else if (activeGroupId) {
            setWasteByEntryKey(prev => ({ ...prev, [activeGroupId]: newWaste }));
          } else if (actieveSectie) {
            setWasteByEntryKey(prev => ({ ...prev, [actieveSectie]: newWaste }));
          }
        }}
        existingMaterials={enrichedMaterials}
        showFavorites={actieveSectie !== 'extra' && !activeGroupId}
        defaultCategory={memoizedDefaultCategory}
        nameContainsFilter={activeSectionMeta?.categoryUltraFilter}
        selectedMaterialId={currentlyPickedMaterialId}
        onCategoryFilterChange={handleModalCategoryFilterChange}

        // New Props
        categoryTitle={(() => {
          if (activeGroupId) return customGroups.find(g => g.id === activeGroupId)?.title || 'Extra materiaal';
          if (activeComponentId) {
            const comp = components.find(c => c.id === activeComponentId);
            if (comp) return `${comp.label} - ${actieveSectie || 'Materiaal'}`;
            return 'Onderdeel materiaal';
          }
          if (actieveSectie) {
            const s = materialSections.find(sec => sec.key === actieveSectie);
            return s?.label || actieveSectie;
          }
          return 'Kies materiaal';
        })()}
        initialWastePercentage={(() => {
          if (activeGroupId) {
            return typeof wasteByEntryKey[activeGroupId] === 'number'
              ? wasteByEntryKey[activeGroupId]
              : getDefaultWastePercentage(null, customGroups.find(g => g.id === activeGroupId)?.title, JOB_TITEL);
          }
          if (activeComponentId && actieveSectie) {
            const entryKey = `comp_${activeComponentId}_${actieveSectie}`;
            return typeof wasteByEntryKey[entryKey] === 'number'
              ? wasteByEntryKey[entryKey]
              : getDefaultWastePercentage(actieveSectie, actieveSectie, components.find(c => c.id === activeComponentId)?.label);
          }
          if (actieveSectie) {
            return typeof wasteByEntryKey[actieveSectie] === 'number'
              ? wasteByEntryKey[actieveSectie]
              : getDefaultWastePercentage(actieveSectie, sectionLabelByKey[actieveSectie], JOB_TITEL);
          }
          return 0;
        })()}

        onToggleFavorite={toggleFavoriet}
        onSelectExisting={(result: any) => {
          const mat = result.data || result;
          const converted: any = normalizeMaterialForSelection({
            ...mat,
            categorie: mat.subsectie || null,
            materiaalnaam: mat.materiaalnaam || '',
            eenheid: mat.eenheid || 'stuk',
            sort_order: null,
          });
          applyMaterialToCurrentModalTarget(converted);
        }}
        onMaterialAdded={(newMaterial: any) => {
          applyMaterialToCurrentModalTarget(normalizeMaterialForSelection(newMaterial));
        }}
        onPendingMaterialQueued={({ clientId, placeholderMaterial, draftPayload }) => {
          const targetMeta =
            activeComponentId && actieveSectie
              ? { type: 'component', componentId: activeComponentId, sectionKey: actieveSectie }
              : activeGroupId
                ? { type: 'custom_group', groupId: activeGroupId }
                : activeMultiEntryKey && actieveSectie
                  ? { type: 'multi_entry', sectionKey: activeMultiEntryKey, entryId: activeMultiEntryId }
                  : actieveSectie
                    ? { type: 'section', sectionKey: actieveSectie }
                    : null;

          setPendingSafetyItems((prev) => {
            const filtered = prev.filter((item) => item.id !== clientId);
            return [
              ...filtered,
              {
                id: clientId,
                status: 'analyzing',
                question: '',
                expectedUnit: '',
                answer: '',
                questions: [],
                error: null,
                draftPayload,
              },
            ];
          });
          void persistPendingMaterialState(clientId, {
            status: 'analyzing',
            question: '',
            expected_unit: '',
            answer: '',
            questions: [],
            error: null,
            draft_payload: draftPayload,
            target: targetMeta,
          }, { setCreatedAt: true });
          applyMaterialToCurrentModalTarget(normalizeMaterialForSelection(placeholderMaterial));
        }}
        onPendingMaterialQuestion={({ clientId, questions, draftPayload }) => {
          const normalizedQuestions = normalizePendingQuestions(questions);
          const firstQuestion = normalizedQuestions[0];
          const question = firstQuestion?.question || '';
          const expectedUnit = firstQuestion?.expectedUnit || '';
          setPendingSafetyItems((prev) => {
            const existing = prev.find((item) => item.id === clientId);
            if (!existing) {
              return [
                ...prev,
                {
                  id: clientId,
                  status: 'needs_answer',
                  question,
                  expectedUnit,
                  answer: '',
                  questions: normalizedQuestions,
                  error: null,
                  draftPayload,
                },
              ];
            }
            return prev.map((item) => item.id === clientId ? {
              ...item,
              status: 'needs_answer',
              question,
              expectedUnit,
              questions: normalizedQuestions,
              draftPayload,
              error: null,
            } : item);
          });
          void persistPendingMaterialState(clientId, {
            status: 'needs_answer',
            question,
            expected_unit: expectedUnit,
            questions: normalizedQuestions,
            draft_payload: draftPayload,
            error: null,
          });
          patchPendingMaterialById(clientId, {
            pending_material_state: 'needs_answer',
            pending_material_question: question,
            pending_material_error: null,
          });
        }}
        onPendingMaterialResolved={({ clientId, material }) => {
          replacePendingMaterialById(clientId, normalizeMaterialForSelection(material));
          setPendingSafetyItems((prev) => prev.filter((item) => item.id !== clientId));
          void persistPendingMaterialState(clientId, {
            status: 'resolved',
            row_id: material?.row_id || material?.id || null,
            resolvedAt: serverTimestamp(),
          }, { remove: true });
        }}
        onPendingMaterialFailed={({ clientId, error }) => {
          void reportOperationalError({
            source: 'klus_materialen_pending_upsert',
            title: 'Aanmaken materiaal mislukt',
            message: error || 'Onbekende fout.',
            severity: 'critical',
            context: {
              pendingClientId: clientId,
            },
          });
          setPendingSafetyItems((prev) => prev.map((item) => item.id === clientId ? {
            ...item,
            status: 'error',
            error,
          } : item));
          void persistPendingMaterialState(clientId, {
            status: 'error',
            error: error || 'Onbekende fout',
          });
          patchPendingMaterialById(clientId, {
            pending_material_state: 'error',
            pending_material_error: error,
          });
          toast({
            variant: 'destructive',
            title: 'Aanmaken materiaal mislukt',
            description: error || 'Probeer opnieuw via Opslaan.',
          });
        }}
      />

      {/* Missing Price Dialog */}
      <Dialog open={showMissingPriceDialog} onOpenChange={(open) => {
        if (!open) {
          setShowMissingPriceDialog(false);
          setPendingNavigateTo(null);
        }
      }}>
        <DialogContent className={cn('max-w-2xl max-h-[80vh] overflow-y-auto', DIALOG_CLOSE_TAP)}>
          <DialogHeader>
            <DialogTitle>
              {pendingSafetyItems.length > 0 && missingPriceItems.length > 0
                ? 'Controleer materialen'
                : pendingSafetyItems.length > 0
                  ? 'Controlevragen voor nieuwe materialen'
                  : 'Materialen zonder prijs'}
            </DialogTitle>
            <DialogDescription>
              {pendingSafetyItems.length > 0 && missingPriceItems.length > 0
                ? 'Beantwoord de controlevragen en vul waar nodig prijzen in.'
                : pendingSafetyItems.length > 0
                  ? 'Beantwoord eerst de controlevragen voor nieuw toegevoegde materialen.'
                  : 'De volgende materialen hebben nog geen prijs. Vul de prijs per stuk en eenheid in.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {pendingSafetyItems.length > 0 && (
              <div className="space-y-3">
                {pendingSafetyItems.map((item) => {
                  const materiaalnaam = String(item.draftPayload?.materiaalnaam || 'Nieuw materiaal');
                  const isWaiting = item.status === 'analyzing';
                  const isBusy = item.status === 'saving';
                  const questions = item.questions.length > 0
                    ? item.questions
                    : normalizePendingQuestions(undefined, {
                        question: item.question,
                        expectedUnit: item.expectedUnit,
                        answer: item.answer,
                      });
                  return (
                    <div key={item.id} className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{materiaalnaam}</p>
                        {isWaiting ? (
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Vraag wordt opgesteld...
                          </span>
                        ) : isBusy ? (
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Bezig met opslaan...
                          </span>
                        ) : null}
                      </div>

                      {!isWaiting && (
                        <div className="space-y-2">
                          {questions.length > 0 ? questions.map((question, questionIndex) => (
                            <div key={`${item.id}-${question.key}-${questionIndex}`} className="space-y-2">
                              <p className="text-sm text-muted-foreground">
                                {question.question || 'Vul ontbrekende productinformatie in.'}
                              </p>
                              <Input
                                value={question.answer}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setPendingSafetyItems((prev) => prev.map((x) => {
                                    if (x.id !== item.id) return x;
                                    const existingQuestions = x.questions.length > 0
                                      ? x.questions
                                      : normalizePendingQuestions(undefined, {
                                          question: x.question,
                                          expectedUnit: x.expectedUnit,
                                          answer: x.answer,
                                        });
                                    const updatedQuestions = existingQuestions.map((q, idx) => (
                                      idx === questionIndex ? { ...q, answer: value } : q
                                    ));
                                    return {
                                      ...x,
                                      questions: updatedQuestions,
                                      question: updatedQuestions[0]?.question || x.question,
                                      expectedUnit: updatedQuestions[0]?.expectedUnit || x.expectedUnit,
                                      answer: updatedQuestions[0]?.answer || '',
                                      error: null,
                                      status: x.status === 'error' ? 'needs_answer' : x.status,
                                    };
                                  }));
                                  void persistPendingMaterialState(item.id, {
                                    answer: questionIndex === 0 ? value : (item.answer || ''),
                                    questions: questions.map((q, idx) => (
                                      idx === questionIndex ? { ...q, answer: value } : q
                                    )),
                                    error: null,
                                    status: item.status === 'error' ? 'needs_answer' : item.status,
                                  });
                                }}
                                placeholder={question.valueType === 'number' ? 'Bijv. 0,3' : 'Bijv. 750ml, 5 liter, 25kg'}
                                disabled={isSavingPrices || isBusy}
                              />
                              {question.expectedUnit ? (
                                <p className="text-xs text-muted-foreground">
                                  Verwachte eenheid: <span className="font-semibold">{question.expectedUnit}</span>
                                </p>
                              ) : null}
                            </div>
                          )) : (
                            <p className="text-sm text-muted-foreground">Vul ontbrekende productinformatie in.</p>
                          )}
                          {item.error ? (
                            <p className="text-xs text-destructive">{item.error}</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {missingPriceItems.map((item, idx) => {
              const key = getMissingPriceItemKey(item, idx);
              const name = item.materiaalnaam || `Materiaal ${idx + 1}`;
              const eenheid = item.eenheid || missingPriceEenheden[key] || 'stuk';

              return (
                <div key={key} className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{name}</p>
                    {missingPriceSaved[key] && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Eenheid *</Label>
                      <Select
                        value={eenheid}
                        onValueChange={(val) => {
                          setMissingPriceEenheden(prev => ({ ...prev, [key]: val }));
                          if (missingPriceSaved[key]) {
                            setMissingPriceSaved(prev => ({ ...prev, [key]: false }));
                          }
                        }}
                        disabled={isSavingPrices}
                      >
                        <SelectTrigger className="h-9">
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
                      <Label className="text-xs font-medium">Prijs excl. BTW</Label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">€</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-9"
                          value={missingPriceInputsExcl[key] ?? ''}
                          onChange={(e) => {
                            const excl = sanitizeNlMoneyInput(e.target.value);
                            setMissingPriceInputsExcl(prev => ({ ...prev, [key]: excl }));
                            // Auto-calculate incl BTW
                            const exclNum = parseNLMoneyToNumber(excl);
                            if (exclNum && exclNum > 0) {
                              const inclBtw = formatNlMoneyFromNumber(exclNum * 1.21);
                              setMissingPriceInputsIncl(prev => ({ ...prev, [key]: inclBtw || '' }));
                            }
                            if (missingPriceSaved[key]) {
                              setMissingPriceSaved(prev => ({ ...prev, [key]: false }));
                            }
                          }}
                          disabled={isSavingPrices}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Prijs incl. BTW</Label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">€</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-9"
                          value={missingPriceInputsIncl[key] ?? ''}
                          onChange={(e) => {
                            const incl = sanitizeNlMoneyInput(e.target.value);
                            setMissingPriceInputsIncl(prev => ({ ...prev, [key]: incl }));
                            // Auto-calculate excl BTW
                            const inclNum = parseNLMoneyToNumber(incl);
                            if (inclNum && inclNum > 0) {
                              const exclBtw = formatNlMoneyFromNumber(inclNum / 1.21);
                              setMissingPriceInputsExcl(prev => ({ ...prev, [key]: exclBtw || '' }));
                            }
                            if (missingPriceSaved[key]) {
                              setMissingPriceSaved(prev => ({ ...prev, [key]: false }));
                            }
                          }}
                          disabled={isSavingPrices}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={isSavingPrices}
              onClick={() => {
                setShowMissingPriceDialog(false);
                if (pendingNavigateTo) router.push(pendingNavigateTo);
              }}
            >
              Overslaan
            </Button>
            <Button
              variant="success"
              disabled={isSavingPrices || pendingSafetyItems.some((item) => item.status === 'analyzing' || item.status === 'saving')}
              onClick={async () => {
                setIsSavingPrices(true);
                try {
                  const safetyAnalyzingCount = pendingSafetyItems.filter((item) => item.status === 'analyzing' || item.status === 'saving').length;
                  if (safetyAnalyzingCount > 0) {
                    toast({
                      variant: 'destructive',
                      title: 'Nog bezig met analyseren',
                      description: 'Wacht tot alle controlevragen klaarstaan voordat je doorgaat.',
                    });
                    return;
                  }

                  const safetyToSave = pendingSafetyItems.filter((item) => item.status === 'needs_answer' || item.status === 'error');
                  const missingAnswers = safetyToSave.filter((item) => {
                    const questions = item.questions.length > 0
                      ? item.questions
                      : normalizePendingQuestions(undefined, {
                          question: item.question,
                          expectedUnit: item.expectedUnit,
                          answer: item.answer,
                        });
                    return questions.some((question) => !String(question.answer || '').trim());
                  });
                  if (missingAnswers.length > 0) {
                    toast({
                      variant: 'destructive',
                      title: 'Controlevragen incompleet',
                      description: 'Vul eerst alle antwoorden in voordat je opslaat.',
                    });
                    return;
                  }

                  const invalidVerbruikAnswers = safetyToSave.filter((item) => {
                    const questions = item.questions.length > 0
                      ? item.questions
                      : normalizePendingQuestions(undefined, {
                          question: item.question,
                          expectedUnit: item.expectedUnit,
                          answer: item.answer,
                        });
                    return questions.some((question) => {
                      const shouldMapToVerbruik =
                        question.key === 'verbruik_per_m2' ||
                        question.targetField === 'verbruik_per_m2' ||
                        isVerbruikPerM2Question(question.question, question.expectedUnit);
                      if (!shouldMapToVerbruik) return false;
                      return parseVerbruikPerM2Answer(String(question.answer || '')) === null;
                    });
                  });
                  if (invalidVerbruikAnswers.length > 0) {
                    toast({
                      variant: 'destructive',
                      title: 'Verbruik per m² ongeldig',
                      description: 'Vul verbruik per m² in als getal, bijv. 0,3.',
                    });
                    return;
                  }

                  const entriesToSave = missingPriceItems.flatMap((item, idx) => {
                    const key = getMissingPriceItemKey(item, idx);
                    const prijsExcl = missingPriceInputsExcl[key];
                    const prijsIncl = missingPriceInputsIncl[key];
                    const eenheid = missingPriceEenheden[key] || item.eenheid || 'stuk';

                    const prijsExclNum = parseNLMoneyToNumber(prijsExcl);
                    const prijsInclNum = parseNLMoneyToNumber(prijsIncl);

                    if (((!prijsExclNum || prijsExclNum <= 0) && (!prijsInclNum || prijsInclNum <= 0)) || !eenheid) return [];

                    const finalPrijsExcl = prijsExclNum && prijsExclNum > 0
                      ? prijsExclNum
                      : (prijsInclNum! / 1.21);
                    const finalPrijsIncl = prijsInclNum && prijsInclNum > 0
                      ? prijsInclNum
                      : (finalPrijsExcl * 1.21);

                    return [{
                      key,
                      prijsExcl: Number(finalPrijsExcl.toFixed(2)),
                      prijsIncl: Number(finalPrijsIncl.toFixed(2)),
                      eenheid,
                      row_id: item.row_id || item.material_ref_id || item.id || null,
                      materiaalnaam: item.materiaalnaam || null,
                    }];
                  });

                  if (entriesToSave.length === 0) {
                    for (const item of safetyToSave) {
                      queueSafetyConfirmationInBackground(item);
                    }
                    setShowMissingPriceDialog(false);
                    if (pendingNavigateTo) router.push(pendingNavigateTo);
                    return;
                  }

                  const token = await user!.getIdToken();

                  for (const item of safetyToSave) {
                    queueSafetyConfirmationInBackground(item, token);
                  }

                  const updatedByIdExcl = new Map<string, number>();
                  const updatedByNameExcl = new Map<string, number>();
                  const updatedByIdIncl = new Map<string, number>();
                  const updatedByNameIncl = new Map<string, number>();
                  const failedItems: string[] = [];

                  for (const entry of entriesToSave) {
                    try {
                      const res = await fetch('/api/materialen/update-price', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          materiaalnaam: entry.materiaalnaam,
                          row_id: entry.row_id,
                          prijs_incl_btw: entry.prijsIncl,
                          prijs_excl_btw: entry.prijsExcl,
                          eenheid: entry.eenheid,
                        }),
                      });
                      const json = await res.json();
                      if (json.ok) {
                        if (entry.row_id) {
                          updatedByIdExcl.set(String(entry.row_id), entry.prijsExcl);
                          updatedByIdIncl.set(String(entry.row_id), entry.prijsIncl);
                        }
                        if (entry.materiaalnaam) {
                          updatedByNameExcl.set(entry.materiaalnaam, entry.prijsExcl);
                          updatedByNameIncl.set(entry.materiaalnaam, entry.prijsIncl);
                        }
                        setMissingPriceSaved(prev => ({ ...prev, [entry.key]: true }));
                        // Update local gekozenMaterialen state
                        setGekozenMaterialen(prev => {
                          const updated = { ...prev };
                          for (const [k, v] of Object.entries(updated)) {
                            if (!v) continue;
                            const source = (v as any)._raw || v;
                            const sourceId = source.row_id || source.material_ref_id || source.id;
                            const sameId = entry.row_id && sourceId && String(sourceId) === String(entry.row_id);
                            const sameName = !entry.row_id && entry.materiaalnaam && source.materiaalnaam === entry.materiaalnaam;
                            if (
                              sameId ||
                              sameName
                            ) {
                              const newVal = { ...v as any };
                              newVal.prijs_incl_btw = entry.prijsIncl;
                              newVal.prijs_excl_btw = entry.prijsExcl;
                              newVal.prijs = entry.prijsExcl;
                              newVal.prijs_per_stuk = entry.prijsExcl;
                              newVal.eenheid = entry.eenheid;
                              if (newVal._raw) {
                                newVal._raw = {
                                  ...newVal._raw,
                                  prijs_incl_btw: entry.prijsIncl,
                                  prijs_excl_btw: entry.prijsExcl,
                                  prijs: entry.prijsExcl,
                                  prijs_per_stuk: entry.prijsExcl,
                                  eenheid: entry.eenheid
                                };
                              }
                              updated[k] = newVal;
                            }
                          }
                          return updated;
                        });
                      } else {
                        failedItems.push(entry.materiaalnaam || String(entry.row_id || entry.key));
                      }
                    } catch (err) {
                      console.error(`Failed to update price for ${entry.materiaalnaam}:`, err);
                      failedItems.push(entry.materiaalnaam || String(entry.row_id || entry.key));
                    }
                  }

                  if (failedItems.length > 0) {
                    toast({
                      variant: 'destructive',
                      title: 'Opslaan in materialenlijst mislukt',
                      description: `Kon ${failedItems.length} materiaalprijs(en) niet opslaan in Supabase main_material_list.`
                    });
                    return;
                  }

                  let remaining = missingPriceItems;
                  if (updatedByIdExcl.size > 0 || updatedByNameExcl.size > 0) {
                    // Update custom groups
                    setCustomGroups(prev => prev.map(group => ({
                      ...group,
                      materials: (group.materials || []).map((mat: any) => {
                        const sourceId = mat?._raw?.row_id || mat?._raw?.material_ref_id || mat?._raw?.id || mat?.row_id || mat?.material_ref_id || mat?.id;
                        if (sourceId && updatedByIdExcl.has(String(sourceId))) {
                          const prijsExcl = updatedByIdExcl.get(String(sourceId))!;
                          const prijsIncl = updatedByIdIncl.get(String(sourceId)) ?? Number((prijsExcl * 1.21).toFixed(2));
                          return {
                            ...mat,
                            prijs_incl_btw: prijsIncl,
                            prijs_excl_btw: prijsExcl,
                            prijs: prijsExcl,
                            prijs_per_stuk: prijsExcl,
                            _raw: mat._raw
                              ? { ...mat._raw, prijs_incl_btw: prijsIncl, prijs_excl_btw: prijsExcl, prijs: prijsExcl, prijs_per_stuk: prijsExcl }
                              : mat._raw
                          };
                        }
                        if (mat?.materiaalnaam && updatedByNameExcl.has(mat.materiaalnaam)) {
                          const prijsExcl = updatedByNameExcl.get(mat.materiaalnaam)!;
                          const prijsIncl = updatedByNameIncl.get(mat.materiaalnaam) ?? Number((prijsExcl * 1.21).toFixed(2));
                          return {
                            ...mat,
                            prijs_incl_btw: prijsIncl,
                            prijs_excl_btw: prijsExcl,
                            prijs: prijsExcl,
                            prijs_per_stuk: prijsExcl,
                            _raw: mat._raw
                              ? { ...mat._raw, prijs_incl_btw: prijsIncl, prijs_excl_btw: prijsExcl, prijs: prijsExcl, prijs_per_stuk: prijsExcl }
                              : mat._raw
                          };
                        }
                        return mat;
                      })
                    })));

                    // Update component materials
                    setComponents(prev => prev.map(comp => ({
                      ...comp,
                      materials: (comp.materials || []).map((m: any) => {
                        const mat = m.material || m;
                        const sourceId = mat?._raw?.row_id || mat?._raw?.material_ref_id || mat?._raw?.id || mat?.row_id || mat?.material_ref_id || mat?.id;
                        if (sourceId && updatedByIdExcl.has(String(sourceId))) {
                          const prijsExcl = updatedByIdExcl.get(String(sourceId))!;
                          const prijsIncl = updatedByIdIncl.get(String(sourceId)) ?? Number((prijsExcl * 1.21).toFixed(2));
                          const updatedMat = {
                            ...mat,
                            prijs_incl_btw: prijsIncl,
                            prijs_excl_btw: prijsExcl,
                            prijs: prijsExcl,
                            prijs_per_stuk: prijsExcl,
                            _raw: mat._raw
                              ? { ...mat._raw, prijs_incl_btw: prijsIncl, prijs_excl_btw: prijsExcl, prijs: prijsExcl, prijs_per_stuk: prijsExcl }
                              : mat._raw
                          };
                          return m.material ? { ...m, material: updatedMat } : updatedMat;
                        }
                        if (mat?.materiaalnaam && updatedByNameExcl.has(mat.materiaalnaam)) {
                          const prijsExcl = updatedByNameExcl.get(mat.materiaalnaam)!;
                          const prijsIncl = updatedByNameIncl.get(mat.materiaalnaam) ?? Number((prijsExcl * 1.21).toFixed(2));
                          const updatedMat = {
                            ...mat,
                            prijs_incl_btw: prijsIncl,
                            prijs_excl_btw: prijsExcl,
                            prijs: prijsExcl,
                            prijs_per_stuk: prijsExcl,
                            _raw: mat._raw
                              ? { ...mat._raw, prijs_incl_btw: prijsIncl, prijs_excl_btw: prijsExcl, prijs: prijsExcl, prijs_per_stuk: prijsExcl }
                              : mat._raw
                          };
                          return m.material ? { ...m, material: updatedMat } : updatedMat;
                        }
                        return m;
                      })
                    })));

                    // Remove resolved items from the dialog list and use that list for continuation logic.
                    remaining = missingPriceItems.filter((item) => {
                      const id = item.row_id || item.material_ref_id || item.id;
                      if (id && updatedByIdExcl.has(String(id))) return false;
                      if (item.materiaalnaam && updatedByNameExcl.has(item.materiaalnaam)) return false;
                      return true;
                    });
                  }

                  setMissingPriceItems(remaining);
                  // Persist updated material snapshots immediately so reopening
                  // this step does not re-trigger missing-price checks.
                  await saveToFirestore({ silent: true });
                  if (remaining.length === 0) {
                    setShowMissingPriceDialog(false);
                    if (pendingNavigateTo) router.push(pendingNavigateTo);
                  } else if (pendingSafetyItems.length > 0 && pendingNavigateTo) {
                    // Safety confirmation runs in background; don't block user on this dialog
                    setShowMissingPriceDialog(false);
                    router.push(pendingNavigateTo);
                  }
                } catch (err) {
                  console.error('Error saving prices:', err);
                  toast({ variant: 'destructive', title: 'Fout', description: 'Kon prijzen niet opslaan.' });
                } finally {
                  setIsSavingPrices(false);
                }
              }}
            >
              {isSavingPrices ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Opslaan...
                </>
              ) : pendingSafetyItems.some((item) => item.status === 'analyzing' || item.status === 'saving') ? (
                'Vragen voorbereiden...'
              ) : (
                'Opslaan & Volgende'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW: Variant Selection Dialog */}
      <Dialog open={variantPickerOpen} onOpenChange={setVariantPickerOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Type {
              variantPickerType === 'kozijn'
                ? 'Kozijn'
                : (variantPickerType === 'deur'
                  ? 'Deur'
                  : (variantPickerType === 'plafond'
                    ? 'Plafond'
                    : (variantPickerType === 'vensterbank'
                      ? 'Vensterbank'
                      : 'Onderdeel')))
            } kiezen</DialogTitle>
            <DialogDescription>
              Selecteer een variant om toe te voegen aan de lijst.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 py-4">
            {variantPickerType && (() => {
              const items = getVariantItemsForType(variantPickerType);

              return items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => {
                    addComponentFromVariant(variantPickerType, item, idx);
                    setVariantPickerOpen(false);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium group-hover:text-emerald-500 transition-colors">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500" />
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerOpen(false)}>Annuleren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
