'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Eraser, ExternalLink, Loader2, Octagon, PackageSearch, Plus, RefreshCw, Trash2 } from 'lucide-react';

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type BouwmaatImportMaterial = {
  materiaalnaam: string;
  eenheid: string;
  prijs_excl_btw: number | null;
  prijs_incl_btw: number | null;
  categorie: string;
  sub_categorie: string;
  leverancier: string;
  lengte: string;
  breedte: string;
  dikte: string;
  hoogte: string;
  source_url: string;
  source_product_id: string;
  unit_price_text: string;
  bulk_price_text: string;
  confidence: number;
  audit_status?: 'valid' | 'review' | 'rejected';
  audit_reason?: string;
  audit_confidence?: number | null;
};

type BouwmaatImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken: () => Promise<string>;
  onImported: () => Promise<void> | void;
};

const DEFAULT_BOUWMAAT_URL = '';
const PRESETS_STORAGE_KEY = 'bouwmaat-import-link-presets-v1';

type BouwmaatLinkPreset = {
  id: string;
  name: string;
  links: string[];
  maxPagesPerUrl: string;
  aiAuditEnabled: boolean;
};

function formatEuro(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseUrlRows(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [urlRaw, categoryRaw, subCategoryRaw] = line.split('|').map((part) => part.trim());
      return {
        url: urlRaw,
        categorie: categoryRaw || '',
        sub_categorie: subCategoryRaw || '',
      };
    })
    .filter((row) => row.url.startsWith('https://www.bouwmaat.nl/') || row.url.startsWith('https://bouwmaat.nl/'));
}

function normalizeStoredLinks(entry: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(entry.links)
    ? entry.links.filter((link) => typeof link === 'string').map((link) => link.trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray;

  // Backward compatibility for earlier storage shapes.
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
          maxPagesPerUrl: typeof entry.maxPagesPerUrl === 'string' ? entry.maxPagesPerUrl : '',
          aiAuditEnabled: typeof entry.aiAuditEnabled === 'boolean' ? entry.aiAuditEnabled : true,
        };
      });
  } catch {
    return [];
  }
}

function writePresets(next: BouwmaatLinkPreset[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next));
}

export function BouwmaatImportDialog({
  open,
  onOpenChange,
  getToken,
  onImported,
}: BouwmaatImportDialogProps) {
  const [urlLines, setUrlLines] = useState<string[]>([DEFAULT_BOUWMAAT_URL]);
  const [presets, setPresets] = useState<BouwmaatLinkPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [maxPagesPerUrl, setMaxPagesPerUrl] = useState('');
  const [pageDelaySeconds, setPageDelaySeconds] = useState('6');
  const [aiAuditEnabled, setAiAuditEnabled] = useState(true);
  const [materials, setMaterials] = useState<BouwmaatImportMaterial[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isStoppingScrape, setIsStoppingScrape] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const urlRows = useMemo(() => parseUrlRows(urlLines), [urlLines]);

  const selectedMaterials = useMemo(() => {
    return materials.filter((material) => selectedKeys.has(material.source_product_id || material.source_url || material.materiaalnaam));
  }, [materials, selectedKeys]);

  useEffect(() => {
    if (!open) return;
    setPresets(readPresets());
  }, [open]);

  const resetPreview = () => {
    setMaterials([]);
    setSelectedKeys(new Set());
    setStatus('');
    setError(null);
  };

  const refreshClean = () => {
    setMaterials([]);
    setSelectedKeys(new Set());
    setStatus('');
    setError(null);
    setIsScraping(false);
    setIsStoppingScrape(false);
    setIsImporting(false);
  };

  const resetInterface = () => {
    setUrlLines([DEFAULT_BOUWMAAT_URL]);
    setMaxPagesPerUrl('');
    setPageDelaySeconds('6');
    setAiAuditEnabled(true);
    setMaterials([]);
    setSelectedKeys(new Set());
    setStatus('');
    setError(null);
    setIsOpeningBrowser(false);
    setIsScraping(false);
    setIsStoppingScrape(false);
    setIsImporting(false);
  };

  const closeAndReset = () => {
    resetInterface();
    onOpenChange(false);
  };

  const updateUrlLine = (index: number, value: string) => {
    setUrlLines((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    resetPreview();
  };

  const addUrlLine = () => {
    setUrlLines((current) => [...current, '']);
    resetPreview();
  };

  const removeUrlLine = (index: number) => {
    setUrlLines((current) => {
      if (current.length <= 1) return [''];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    resetPreview();
  };

  const saveCurrentAsPreset = () => {
    const name = presetName.trim();
    const links = urlLines.map((line) => line.trim()).filter(Boolean);
    if (!name) {
      setError('Geef een presetnaam op.');
      return;
    }
    if (links.length === 0) {
      setError('Voeg minimaal één link toe om een preset op te slaan.');
      return;
    }

    const existing = presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id || `preset-${Date.now()}`;
    const entry: BouwmaatLinkPreset = {
      id,
      name,
      links,
      maxPagesPerUrl: maxPagesPerUrl.trim(),
      aiAuditEnabled,
    };
    const next = existing
      ? presets.map((preset) => (preset.id === existing.id ? entry : preset))
      : [...presets, entry];
    setPresets(next);
    setSelectedPresetId(id);
    writePresets(next);
    setError(null);
    setStatus(`Preset "${name}" opgeslagen.`);
  };

  const loadSelectedPreset = () => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    setUrlLines(preset.links.length ? preset.links : ['']);
    setMaxPagesPerUrl(preset.maxPagesPerUrl || '');
    setAiAuditEnabled(preset.aiAuditEnabled);
    setMaterials([]);
    setSelectedKeys(new Set());
    setError(null);
    setStatus(`Preset "${preset.name}" geladen.`);
  };

  const loadPresetById = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setUrlLines(preset.links.length ? preset.links : ['']);
    setMaxPagesPerUrl(preset.maxPagesPerUrl || '');
    setAiAuditEnabled(preset.aiAuditEnabled);
    setMaterials([]);
    setSelectedKeys(new Set());
    setError(null);
    setStatus(`Preset "${preset.name}" geladen.`);
  };

  const deleteSelectedPreset = () => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    const next = presets.filter((item) => item.id !== selectedPresetId);
    setPresets(next);
    setSelectedPresetId('');
    writePresets(next);
    setError(null);
    setStatus(`Preset "${preset.name}" verwijderd.`);
  };

  const openBouwmaatBrowser = async () => {
    setIsOpeningBrowser(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/local/bouwmaat/session', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Bouwmaat browser kon niet openen.');
      }
      setStatus(json.message || 'Bouwmaat browser geopend.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bouwmaat browser kon niet openen.');
    } finally {
      setIsOpeningBrowser(false);
    }
  };

  const scrapeProducts = async () => {
    if (urlRows.length === 0) {
      setError('Plak minimaal één geldige Bouwmaat URL.');
      return;
    }

    setIsScraping(true);
    setError(null);
    setStatus('Bouwmaat pagina’s worden uitgelezen...');
    try {
      const token = await getToken();
      const parsedMaxPages = Number.parseInt(maxPagesPerUrl, 10);
      const res = await fetch('/api/local/bouwmaat/scrape', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          urls: urlRows,
          maxPagesPerUrl: Number.isFinite(parsedMaxPages) && parsedMaxPages > 0 ? parsedMaxPages : 1,
          pageDelaySeconds: Number.parseInt(pageDelaySeconds, 10) || 6,
          aiAudit: aiAuditEnabled,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Bouwmaat scrape mislukt.');
      }

      const nextMaterials = Array.isArray(json.materials) ? json.materials : [];
      setMaterials(nextMaterials);
      setSelectedKeys(new Set(nextMaterials.map((material: BouwmaatImportMaterial) =>
        material.source_product_id || material.source_url || material.materiaalnaam
      )));
      const reviewCount = typeof json.reviewCount === 'number' ? json.reviewCount : 0;
      const rejectedCount = typeof json.rejectedCount === 'number' ? json.rejectedCount : 0;
      const auditPart = aiAuditEnabled
        ? ` Validatie: ${reviewCount} ter controle, ${rejectedCount} afgekeurd.`
        : '';
      setStatus(
        json.cancelled
          ? `Gestopt. ${nextMaterials.length} producten gevonden over ${json.pagesVisited ?? '?'} pagina’s.${auditPart}`
          : `${nextMaterials.length} producten gevonden over ${json.pagesVisited ?? '?'} pagina’s.${auditPart}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bouwmaat scrape mislukt.');
      setStatus('');
    } finally {
      setIsScraping(false);
    }
  };

  const stopScrape = async () => {
    setIsStoppingScrape(true);
    setError(null);
    setStatus('Stopverzoek wordt verstuurd...');
    try {
      const token = await getToken();
      const res = await fetch('/api/local/bouwmaat/cancel', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Stoppen mislukt.');
      }
      setStatus('Stopverzoek ontvangen. De scraper stopt na de huidige stap.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stoppen mislukt.');
    } finally {
      setIsStoppingScrape(false);
    }
  };

  const toggleMaterial = (material: BouwmaatImportMaterial, checked: boolean) => {
    const key = material.source_product_id || material.source_url || material.materiaalnaam;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(materials.map((material) =>
      material.source_product_id || material.source_url || material.materiaalnaam
    )));
  };

  const importSelected = async () => {
    if (selectedMaterials.length === 0) {
      setError('Selecteer minimaal één materiaal.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setStatus('Materialen worden geïmporteerd...');
    try {
      const token = await getToken();
      const res = await fetch('/api/materialen/import/bulk-upsert', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ materials: selectedMaterials }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Import mislukt.');
      }

      setStatus(`${json.inserted ?? 0} nieuw, ${json.updated ?? 0} bijgewerkt, ${(json.skipped || []).length} overgeslagen.`);
      await onImported();
      closeAndReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import mislukt.');
    } finally {
      setIsImporting(false);
    }
  };

  const isBusy = isOpeningBrowser || isScraping || isImporting;

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
            Bouwmaat import
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Link presets</div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedPresetId(value);
                      if (value) loadPresetById(value);
                    }}
                    className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Kies preset</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={loadSelectedPreset} disabled={!selectedPresetId}>
                    Laad
                  </Button>
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
                  <Button type="button" variant="outline" onClick={saveCurrentAsPreset}>
                    Opslaan
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Bouwmaat URL’s</div>
                <div className="space-y-2">
                  {urlLines.map((line, index) => (
                    <div key={`url-line-${index}`} className="flex items-center gap-2">
                      <Input
                        value={line}
                        onChange={(event) => updateUrlLine(index, event.target.value)}
                        className="font-mono text-xs"
                        placeholder="https://www.bouwmaat.nl/.../hout | Constructieplaten | Osb"
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
                <div className="text-sm font-medium">Hoeveel pagina’s?</div>
                <Input
                  value={maxPagesPerUrl}
                  onChange={(event) => {
                    setMaxPagesPerUrl(event.target.value);
                    resetPreview();
                  }}
                  type="number"
                  min="1"
                  max="150"
                  inputMode="numeric"
                />
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
                    const key = material.source_product_id || material.source_url || material.materiaalnaam;
                    const selected = selectedKeys.has(key);
                    return (
                      <TableRow
                        key={key}
                        className={cn(
                          !selected && 'opacity-50',
                          material.audit_status === 'review' && 'bg-amber-500/5'
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => toggleMaterial(material, Boolean(checked))}
                            aria-label={`${material.materiaalnaam} selecteren`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium leading-snug">{material.materiaalnaam}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {[material.source_product_id, `${material.categorie || '—'} / ${material.sub_categorie || '—'}`, material.unit_price_text]
                                .filter(Boolean)
                                .join(' • ') || '—'}
                            </div>
                            {material.audit_status === 'review' && material.audit_reason ? (
                              <div className="mt-1 text-xs text-amber-300">{material.audit_reason}</div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatEuro(material.prijs_excl_btw)}</div>
                          <div className="text-xs text-muted-foreground">
                            incl: {formatEuro(material.prijs_incl_btw ?? (material.prijs_excl_btw == null ? null : Number((material.prijs_excl_btw * 1.21).toFixed(2))))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{material.eenheid}</TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                        Open de Bouwmaat browser, log in en haal daarna producten op.
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
            onClick={scrapeProducts}
            disabled={isBusy || urlRows.length === 0}
            className="gap-2"
          >
            {isScraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Producten ophalen
          </Button>
          <Button type="button" variant="outline" onClick={refreshClean} disabled={isScraping || isImporting} className="gap-2">
            <Eraser className="h-4 w-4" />
            Preview leegmaken
          </Button>
          <Button
            type="button"
            variant={aiAuditEnabled ? 'success' : 'outline'}
            onClick={() => {
              setAiAuditEnabled((current) => !current);
              resetPreview();
            }}
          >
            {aiAuditEnabled ? 'AI controle: aan' : 'AI controle: uit'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={openBouwmaatBrowser}
            disabled={isBusy}
            className="gap-2"
          >
            {isOpeningBrowser ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Open Bouwmaat browser
          </Button>
          {isScraping ? (
            <Button
              type="button"
              variant="destructiveSoft"
              onClick={stopScrape}
              disabled={isStoppingScrape}
              className="gap-2"
            >
              {isStoppingScrape ? <Loader2 className="h-4 w-4 animate-spin" /> : <Octagon className="h-4 w-4" />}
              Stop ophalen
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isBusy}>
            Sluiten
          </Button>
          <Button
            type="button"
            variant="success"
            onClick={importSelected}
            disabled={isBusy || selectedMaterials.length === 0}
            className="gap-2"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Importeer selectie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
