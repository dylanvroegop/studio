'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eraser, Loader2, PackageSearch, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type SupplierImportMaterial = {
  id: string;
  name: string;
  unit: string;
  price_excl_btw: number | null;
  price_per_unit: number | null;
  supplier: string;
  sku: string;
  product_url: string;
  hoofdcategorie: string;
  subcategorie: string;
  selected: boolean;
};

type SupplierImportJob = {
  id: string;
  supplier: string;
  status: 'pending' | 'scraping' | 'importing' | 'completed' | 'failed' | 'imported';
  total_products: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type BouwmaatImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken: () => Promise<string>;
  onImported: () => Promise<void> | void;
  onStartAutoImportFlow: (params: {
    importJobId: string;
    supplier: string;
  }) => Promise<void> | void;
};

const DEFAULT_BOUWMAAT_URL = '';
const PRESETS_STORAGE_KEY = 'bouwmaat-import-link-presets-v1';
const SUPPORTED_SUPPLIER_HOSTS = ['bouwmaat.nl', 'toolstation.nl', 'gamma.nl'];
const BUILT_IN_SUPPLIER_TABS = [
  { id: 'bouwmaat', label: 'Bouwmaat', host: 'bouwmaat.nl', removable: false, supplierKey: 'bouwmaat' as const },
  { id: 'toolstation', label: 'Toolstation', host: 'toolstation.nl', removable: false, supplierKey: 'toolstation' as const },
  { id: 'gamma', label: 'Gamma', host: 'gamma.nl', removable: false, supplierKey: 'gamma' as const },
] as const;

type PriceMode = 'excl' | 'incl';
type SupplierKey = 'bouwmaat' | 'toolstation' | 'gamma' | 'custom';
type SupplierApiKey = 'bouwmaat' | 'toolstation' | 'gamma';

type SupplierTab = {
  id: string;
  label: string;
  host: string | null;
  removable: boolean;
  supplierKey: SupplierKey;
};

type SupplierDraft = {
  urlLines: string[];
  maxPagesPerUrl: string;
  aiAuditEnabled: boolean;
  priceMode: PriceMode;
};

const DEFAULT_SUPPLIER_DRAFT: SupplierDraft = {
  urlLines: [DEFAULT_BOUWMAAT_URL],
  maxPagesPerUrl: '',
  aiAuditEnabled: false,
  priceMode: 'excl',
};

type BouwmaatLinkPreset = {
  id: string;
  name: string;
  links: string[];
  supplierKey: SupplierKey;
  priceMode: PriceMode;
  maxPagesPerUrl: string;
  aiAuditEnabled: boolean;
};

type ParsedUrlRow = {
  base_url: string;
  pages: number;
  hoofdcategorie: string;
  subcategorie: string;
};

function formatEuro(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoredLinks(entry: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(entry.links)
    ? entry.links.filter((link) => typeof link === 'string').map((link) => link.trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray;

  const fromUrlLines = Array.isArray(entry.urlLines)
    ? (entry.urlLines as unknown[]).filter((link) => typeof link === 'string').map((link) => (link as string).trim()).filter(Boolean)
    : [];
  if (fromUrlLines.length > 0) return fromUrlLines;

  const urlsText = typeof entry.urlsText === 'string' ? entry.urlsText : '';
  const fromMultiline = urlsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (fromMultiline.length > 0) return fromMultiline;

  return [];
}

function readPresets(): BouwmaatLinkPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const entry = item as Record<string, unknown>;
        const links = normalizeStoredLinks(entry);
        return {
          id: typeof entry.id === 'string' ? entry.id : `preset-${Date.now()}`,
          name: typeof entry.name === 'string' ? entry.name : 'Preset',
          links: links.length > 0 ? links : [''],
          supplierKey: (() => {
            const key = typeof entry.supplierKey === 'string' ? entry.supplierKey : 'bouwmaat';
            if (key === 'toolstation' || key === 'gamma' || key === 'custom') return key;
            return 'bouwmaat';
          })(),
          priceMode: typeof entry.priceMode === 'string' && entry.priceMode === 'incl' ? 'incl' : 'excl',
          maxPagesPerUrl: typeof entry.maxPagesPerUrl === 'string' ? entry.maxPagesPerUrl : '',
          aiAuditEnabled: typeof entry.aiAuditEnabled === 'boolean' ? entry.aiAuditEnabled : false,
        };
      });
  } catch {
    return [];
  }
}

function parseUrlRows(lines: string[], expectedHost: string | null, defaultPages: number): ParsedUrlRow[] {
  const isSupportedSupplierUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (!SUPPORTED_SUPPLIER_HOSTS.includes(host)) return false;
      if (!expectedHost) return true;
      return host === expectedHost;
    } catch {
      return false;
    }
  };

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [urlRaw, categoryRaw, subCategoryRaw] = line.split('|').map((part) => part.trim());
      return {
        base_url: urlRaw,
        pages: defaultPages,
        hoofdcategorie: categoryRaw || '',
        subcategorie: subCategoryRaw || '',
      };
    })
    .filter((row) => isSupportedSupplierUrl(row.base_url));
}

function mapSupplierKeyForApi(key: SupplierKey): SupplierApiKey | null {
  if (key === 'bouwmaat' || key === 'toolstation' || key === 'gamma') return key;
  return null;
}

function mapMaterialRow(row: Record<string, unknown>): SupplierImportMaterial | null {
  const id = normalizeString(row.id);
  const name = normalizeString(row.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    unit: normalizeString(row.unit),
    price_excl_btw: parseNumberOrNull(row.price_excl_btw),
    price_per_unit: parseNumberOrNull(row.price_per_unit),
    supplier: normalizeString(row.supplier),
    sku: normalizeString(row.sku),
    product_url: normalizeString(row.product_url),
    hoofdcategorie: normalizeString(row.hoofdcategorie),
    subcategorie: normalizeString(row.subcategorie),
    selected: row.selected !== false,
  };
}

export function BouwmaatImportDialog({
  open,
  onOpenChange,
  getToken,
  onImported,
  onStartAutoImportFlow,
}: BouwmaatImportDialogProps) {
  const [supplierTabs, setSupplierTabs] = useState<SupplierTab[]>(() =>
    BUILT_IN_SUPPLIER_TABS.map((tab) => ({ ...tab }))
  );
  const [activeTabId, setActiveTabId] = useState<string>('bouwmaat');
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, SupplierDraft>>(() =>
    BUILT_IN_SUPPLIER_TABS.reduce<Record<string, SupplierDraft>>((acc, tab) => {
      acc[tab.id] = { ...DEFAULT_SUPPLIER_DRAFT };
      return acc;
    }, {})
  );

  const [presets, setPresets] = useState<BouwmaatLinkPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');

  const [materials, setMaterials] = useState<SupplierImportMaterial[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [isStartingImport, setIsStartingImport] = useState(false);
  const [activeImportJobId, setActiveImportJobId] = useState<string>('');
  const [activeImportJobStatus, setActiveImportJobStatus] = useState<string>('');

  const activeTab = useMemo(
    () => supplierTabs.find((tab) => tab.id === activeTabId) || supplierTabs[0] || null,
    [supplierTabs, activeTabId]
  );

  const activeSupplierKey: SupplierKey = activeTab?.supplierKey || 'bouwmaat';
  const activeSupplierApiKey = mapSupplierKeyForApi(activeSupplierKey);
  const activeHost = activeTab?.host || null;
  const activeDraft = supplierDrafts[activeTabId] || DEFAULT_SUPPLIER_DRAFT;
  const urlLines = activeDraft.urlLines;
  const maxPagesPerUrl = activeDraft.maxPagesPerUrl;
  const aiAuditEnabled = activeDraft.aiAuditEnabled;
  const priceMode = activeDraft.priceMode;

  const updateActiveDraft = (updater: (current: SupplierDraft) => SupplierDraft) => {
    setSupplierDrafts((current) => {
      const draft = current[activeTabId] || DEFAULT_SUPPLIER_DRAFT;
      return { ...current, [activeTabId]: updater(draft) };
    });
  };

  const selectedMaterials = useMemo(() => {
    return materials.filter((material) => selectedKeys.has(material.id));
  }, [materials, selectedKeys]);

  const parsedPages = useMemo(() => {
    const raw = Number.parseInt(maxPagesPerUrl, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  }, [maxPagesPerUrl]);

  const urlRows = useMemo(
    () => parseUrlRows(urlLines, activeHost, parsedPages),
    [urlLines, activeHost, parsedPages]
  );

  const resetPreview = () => {
    setMaterials([]);
    setSelectedKeys(new Set());
    setStatus('');
    setError(null);
    setActiveImportJobId('');
    setActiveImportJobStatus('');
  };

  const resetInterface = () => {
    setSupplierTabs(BUILT_IN_SUPPLIER_TABS.map((tab) => ({ ...tab })));
    setActiveTabId('bouwmaat');
    setSupplierDrafts(
      BUILT_IN_SUPPLIER_TABS.reduce<Record<string, SupplierDraft>>((acc, tab) => {
        acc[tab.id] = { ...DEFAULT_SUPPLIER_DRAFT };
        return acc;
      }, {})
    );
    setSelectedPresetId('');
    setPresetName('');
    setMaterials([]);
    setSelectedKeys(new Set());
    setStatus('');
    setError(null);
    setIsStartingImport(false);
    setActiveImportJobId('');
    setActiveImportJobStatus('');
  };

  const closeAndReset = () => {
    resetInterface();
    onOpenChange(false);
  };

  const updateUrlLine = (index: number, value: string) => {
    updateActiveDraft((current) => ({
      ...current,
      urlLines: current.urlLines.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
    setError(null);
  };

  const addUrlLine = () => {
    updateActiveDraft((current) => ({ ...current, urlLines: [...current.urlLines, ''] }));
    setError(null);
  };

  const removeUrlLine = (index: number) => {
    updateActiveDraft((current) => {
      if (current.urlLines.length <= 1) return { ...current, urlLines: [''] };
      return { ...current, urlLines: current.urlLines.filter((_, itemIndex) => itemIndex !== index) };
    });
    setError(null);
  };

  const addSupplierTab = () => {
    const customCount = supplierTabs.filter((tab) => tab.supplierKey === 'custom').length;
    const nextId = `custom-${Date.now()}`;
    const nextTab: SupplierTab = {
      id: nextId,
      label: `Extra ${customCount + 1}`,
      host: null,
      removable: true,
      supplierKey: 'custom',
    };
    setSupplierTabs((current) => [...current, nextTab]);
    setSupplierDrafts((current) => ({ ...current, [nextId]: { ...DEFAULT_SUPPLIER_DRAFT } }));
    setActiveTabId(nextId);
    setSelectedPresetId('');
    resetPreview();
  };

  const removeSupplierTab = (tabId: string) => {
    const tab = supplierTabs.find((item) => item.id === tabId);
    if (!tab?.removable) return;
    const nextTabs = supplierTabs.filter((item) => item.id !== tabId);
    setSupplierTabs(nextTabs);
    setSupplierDrafts((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[0]?.id || 'bouwmaat');
    }
    setSelectedPresetId('');
    resetPreview();
  };

  const loadJob = async (jobId: string, options?: { silent?: boolean }) => {
    if (!jobId) return;
    try {
      const token = await getToken();
      const query = new URLSearchParams({ import_job_id: jobId });
      const res = await fetch(`/api/supplier-import/job?${query.toString()}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Kon import job niet ophalen.');
      }

      const job = (json.job || null) as SupplierImportJob | null;
      const nextRows: unknown[] = Array.isArray(json.materials) ? json.materials : [];
      const mapped = nextRows
        .map((row: unknown) => mapMaterialRow(row as Record<string, unknown>))
        .filter((row: SupplierImportMaterial | null): row is SupplierImportMaterial => Boolean(row));

      setMaterials(mapped);
      setSelectedKeys((current) => {
        const next = new Set<string>();
        mapped.forEach((row) => {
          if (current.has(row.id) || row.selected) next.add(row.id);
        });
        return next;
      });
      setActiveImportJobId(job?.id || '');
      setActiveImportJobStatus(job?.status || '');

      if (!options?.silent) {
        if (job?.status === 'failed') {
          setError(job.error_message || 'Import job is mislukt.');
          setStatus('');
        } else if (job?.status === 'completed') {
          setError(null);
          setStatus(`Klaar! ${mapped.length} producten in preview.`);
        } else if (job?.status === 'imported') {
          setError(null);
          setStatus('Import voltooid.');
        } else if (job?.status === 'pending' || job?.status === 'scraping') {
          setError(null);
          setStatus('Bezig met ophalen... dit kan 5-10 minuten duren.');
        } else if (job?.status === 'importing') {
          setError(null);
          setStatus('Importeren bezig... AI zet producten in de juiste kolommen.');
        }
      }
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : 'Kon import job niet ophalen.');
      }
    }
  };

  const loadActiveJobForSupplier = async (supplierKey: SupplierApiKey) => {
    try {
      const token = await getToken();
      const query = new URLSearchParams({ active: '1', supplier: supplierKey });
      const res = await fetch(`/api/supplier-import/job?${query.toString()}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;

      const job = (json.job || null) as SupplierImportJob | null;
      if (!job?.id) return;

      const nextRows: unknown[] = Array.isArray(json.materials) ? json.materials : [];
      const mapped = nextRows
        .map((row: unknown) => mapMaterialRow(row as Record<string, unknown>))
        .filter((row: SupplierImportMaterial | null): row is SupplierImportMaterial => Boolean(row));

      setActiveImportJobId(job.id);
      setActiveImportJobStatus(job.status);
      setMaterials(mapped);
      setSelectedKeys(new Set(mapped.filter((row: SupplierImportMaterial) => row.selected).map((row: SupplierImportMaterial) => row.id)));
      if (job.status === 'pending' || job.status === 'scraping') {
        setStatus('Bezig met ophalen... dit kan 5-10 minuten duren.');
      } else if (job.status === 'importing') {
        setStatus('Importeren bezig... AI zet producten in de juiste kolommen.');
      } else if (job.status === 'completed') {
        setStatus(`Klaar! ${mapped.length} producten in preview.`);
      } else {
        setStatus('');
      }
      setError(job.status === 'failed' ? job.error_message || 'Import job is mislukt.' : null);
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadPresets = async () => {
      try {
        const token = await getToken();
        const query = new URLSearchParams({ supplierKey: activeSupplierKey });
        const res = await fetch(`/api/local/bouwmaat/presets?${query.toString()}`, {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !Array.isArray(json.presets)) {
          throw new Error(json?.message || 'Kon presets niet laden.');
        }
        if (cancelled) return;
        setPresets(json.presets);
        setSelectedPresetId('');
      } catch {
        if (cancelled) return;
        setPresets(readPresets().filter((preset) => preset.supplierKey === activeSupplierKey));
        setSelectedPresetId('');
      }
    };
    loadPresets();
    return () => {
      cancelled = true;
    };
  }, [open, getToken, activeSupplierKey]);

  useEffect(() => {
    if (!open) return;
    if (!activeSupplierApiKey) return;
    void loadActiveJobForSupplier(activeSupplierApiKey);
  }, [open, activeSupplierApiKey]);

  useEffect(() => {
    if (!open || !activeImportJobId) return;
    if (!['pending', 'scraping', 'importing'].includes(activeImportJobStatus)) return;

    const handle = window.setInterval(() => {
      void loadJob(activeImportJobId, { silent: true });
    }, 3000);

    return () => window.clearInterval(handle);
  }, [open, activeImportJobId, activeImportJobStatus]);

  const persistActivePreference = async (next: Partial<Pick<SupplierDraft, 'priceMode'>>) => {
    try {
      const token = await getToken();
      await fetch('/api/local/bouwmaat/preferences', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          supplierKey: activeSupplierKey,
          priceMode: next.priceMode ?? priceMode,
          aiAuditEnabled: false,
        }),
      });
    } catch {
      // Non-blocking
    }
  };

  const saveCurrentAsPreset = async () => {
    const name = presetName.trim();
    const links = urlLines.map((line) => line.trim()).filter(Boolean);
    const maxPagesRaw = maxPagesPerUrl.trim();
    const maxPages = Number.parseInt(maxPagesRaw, 10);
    if (!name) {
      setError('Geef een presetnaam op.');
      return;
    }
    if (links.length === 0) {
      setError('Voeg minimaal één link toe om een preset op te slaan.');
      return;
    }
    if (!maxPagesRaw || !Number.isFinite(maxPages) || maxPages <= 0) {
      setError('Vul "Hoeveel pagina\'s?" in met een getal groter dan 0 (bijv. 1 of 100).');
      return;
    }

    try {
      const existing = presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
      const token = await getToken();
      const res = await fetch('/api/local/bouwmaat/presets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: existing?.id || '',
          name,
          links,
          supplierKey: activeSupplierKey,
          priceMode,
          maxPagesPerUrl: maxPagesRaw,
          aiAuditEnabled,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.presets)) {
        throw new Error(json?.message || 'Preset opslaan mislukt.');
      }
      setPresets(json.presets);
      setSelectedPresetId(typeof json.savedId === 'string' ? json.savedId : existing?.id || '');
      setError(null);
      setStatus(`Preset "${name}" opgeslagen.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preset opslaan mislukt.');
    }
  };

  const loadPresetById = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    updateActiveDraft((current) => ({
      ...current,
      urlLines: preset.links.length ? preset.links : [''],
      maxPagesPerUrl: preset.maxPagesPerUrl || '',
      aiAuditEnabled: preset.aiAuditEnabled,
      priceMode: preset.priceMode || 'excl',
    }));
    setError(null);
    setStatus(`Preset "${preset.name}" geladen.`);
  };

  const deleteSelectedPreset = async () => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/local/bouwmaat/presets', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: selectedPresetId, supplierKey: activeSupplierKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.presets)) {
        throw new Error(json?.message || 'Preset verwijderen mislukt.');
      }
      setPresets(json.presets);
      setSelectedPresetId('');
      setError(null);
      setStatus(`Preset "${preset.name}" verwijderd.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preset verwijderen mislukt.');
    }
  };

  const startSupplierImport = async () => {
    if (!activeSupplierApiKey) {
      setError('Alleen Bouwmaat, Toolstation en Gamma worden nu ondersteund.');
      return;
    }
    if (urlRows.length === 0) {
      setError('Plak minimaal één geldige URL voor deze leverancier.');
      return;
    }

    setIsStartingImport(true);
    setError(null);
    setStatus('Bezig met ophalen... dit kan 5-10 minuten duren.');
    try {
      const token = await getToken();
      const res = await fetch('/api/supplier-import/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          supplier: activeSupplierApiKey,
          categories: urlRows,
          price_mode: priceMode === 'incl' ? 'incl_btw' : 'excl_btw',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.import_job_id) {
        throw new Error(json?.message || 'Starten van supplier import mislukt.');
      }

      const jobId = normalizeString(json.import_job_id);
      setActiveImportJobId(jobId);
      setActiveImportJobStatus('scraping');
      await onStartAutoImportFlow({
        importJobId: jobId,
        supplier: activeSupplierApiKey || activeSupplierKey,
      });
      closeAndReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Starten van supplier import mislukt.');
      setStatus('');
    } finally {
      setIsStartingImport(false);
    }
  };

  const toggleMaterial = (materialId: string, checked: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(materialId);
      else next.delete(materialId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(materials.map((material) => material.id)));
  };

  const isBusy = isStartingImport;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        closeAndReset();
      }}
    >
      <DialogContent className="flex h-[92vh] w-[98vw] max-w-7xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PackageSearch className="h-5 w-5 text-emerald-400" />
            Supplier import
          </DialogTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {supplierTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div key={tab.id} className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? 'success' : 'outline'}
                    onClick={() => {
                      setActiveTabId(tab.id);
                      setSelectedPresetId('');
                      setMaterials([]);
                      setSelectedKeys(new Set());
                      setStatus('');
                      setError(null);
                      setActiveImportJobId('');
                      setActiveImportJobStatus('');
                    }}
                    className="h-8 px-3"
                  >
                    {tab.label}
                  </Button>
                  {tab.removable ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => removeSupplierTab(tab.id)}
                      aria-label="Supplier tab verwijderen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={addSupplierTab}
              aria-label="Supplier tab toevoegen"
              title="Supplier tab toevoegen"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Link presets</div>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedPresetId || undefined}
                    onValueChange={(value) => {
                      setSelectedPresetId(value);
                      if (value) loadPresetById(value);
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1 rounded-md transition-colors duration-200">
                      <SelectValue placeholder="Kies preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={deleteSelectedPreset} disabled={!selectedPresetId}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Preset naam (bijv. Hout)"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={saveCurrentAsPreset} aria-label="Preset opslaan" title="Preset opslaan">
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Leverancier URL&apos;s</div>
                <div className="space-y-2">
                  {urlLines.map((line, index) => (
                    <div key={`url-line-${index}`} className="flex items-center gap-2">
                      <Input
                        value={line}
                        onChange={(event) => updateUrlLine(index, event.target.value)}
                        className="font-mono text-xs"
                        placeholder="https://... | hoofdcategorie | subcategorie"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeUrlLine(index)}
                        disabled={urlLines.length <= 1}
                        aria-label="Linkregel verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" className="gap-2" onClick={addUrlLine}>
                    <Plus className="h-4 w-4" />
                    Link toevoegen
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eén URL per regel. Optioneel: URL | hoofdcategorie | subcategorie.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Hoeveel pagina&apos;s?</div>
                <Input
                  value={maxPagesPerUrl}
                  onChange={(event) => {
                    updateActiveDraft((current) => ({ ...current, maxPagesPerUrl: event.target.value }));
                    setError(null);
                  }}
                  type="number"
                  min="1"
                  max="250"
                  inputMode="numeric"
                  placeholder="Leeg = 1"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Prijsmodus</div>
                <div className="inline-flex rounded-xl border border-border/70 bg-background p-1">
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveDraft((current) => ({ ...current, priceMode: 'excl' }));
                      persistActivePreference({ priceMode: 'excl' });
                    }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm transition-colors',
                      priceMode === 'excl' ? 'bg-emerald-600/25 text-emerald-100' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Prijzen zijn excl btw
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveDraft((current) => ({ ...current, priceMode: 'incl' }));
                      persistActivePreference({ priceMode: 'incl' });
                    }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm transition-colors',
                      priceMode === 'incl' ? 'bg-emerald-600/25 text-emerald-100' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Prijzen zijn incl btw
                  </button>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 rounded-lg border border-border/70">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Preview</div>
                <div className="text-xs text-muted-foreground">
                  {materials.length ? `${selectedMaterials.length} van ${materials.length} geselecteerd` : 'Nog geen producten opgehaald'}
                  {activeImportJobId ? ` • Job: ${activeImportJobStatus || 'onbekend'}` : ''}
                </div>
              </div>
              {materials.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleAll(selectedMaterials.length !== materials.length)}
                >
                  {selectedMaterials.length === materials.length ? 'Alles uit' : 'Alles aan'}
                </Button>
              ) : null}
            </div>

            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={materials.length > 0 && selectedMaterials.length === materials.length}
                        onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                        aria-label="Alles selecteren"
                      />
                    </TableHead>
                    <TableHead>Materiaal</TableHead>
                    <TableHead className="w-40 text-right">Prijs (excl btw)</TableHead>
                    <TableHead className="hidden w-24 md:table-cell">Eenheid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.length ? materials.map((material) => {
                    const selected = selectedKeys.has(material.id);
                    const excl = material.price_excl_btw ?? material.price_per_unit;
                    const incl = excl == null ? null : Number((excl * 1.21).toFixed(2));
                    return (
                      <TableRow key={material.id} className={cn(!selected && 'opacity-50')}>
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => toggleMaterial(material.id, Boolean(checked))}
                            aria-label={`${material.name} selecteren`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium leading-snug">{material.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {[material.sku, `${material.hoofdcategorie || '—'} / ${material.subcategorie || '—'}`]
                                .filter(Boolean)
                                .join(' • ') || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatEuro(excl)}</div>
                          <div className="text-xs text-muted-foreground">incl: {formatEuro(incl)}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{material.unit || 'stuk'}</TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                        {status || 'Klik op Producten ophalen om async import te starten.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="success"
            onClick={startSupplierImport}
            disabled={isBusy || urlRows.length === 0}
            className="gap-2"
          >
            {isStartingImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Producten ophalen
          </Button>
          <Button type="button" variant="outline" onClick={resetPreview} disabled={isBusy} className="gap-2">
            <Eraser className="h-4 w-4" />
            Preview leegmaken
          </Button>
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isBusy}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
