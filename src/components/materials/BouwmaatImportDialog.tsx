'use client';

import { useMemo, useState } from 'react';
import { Check, Eraser, ExternalLink, Loader2, Octagon, PackageSearch, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
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
};

type BouwmaatImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken: () => Promise<string>;
  onImported: () => Promise<void> | void;
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

function parseUrlRows(raw: string, defaultCategory: string, defaultSubCategory: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [urlRaw, categoryRaw, subCategoryRaw] = line.split('|').map((part) => part.trim());
      return {
        url: urlRaw,
        categorie: categoryRaw || defaultCategory.trim(),
        sub_categorie: subCategoryRaw || defaultSubCategory.trim(),
      };
    })
    .filter((row) => row.url.startsWith('https://www.bouwmaat.nl/') || row.url.startsWith('https://bouwmaat.nl/'));
}

export function BouwmaatImportDialog({
  open,
  onOpenChange,
  getToken,
  onImported,
}: BouwmaatImportDialogProps) {
  const [urlsText, setUrlsText] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultSubCategory, setDefaultSubCategory] = useState('');
  const [maxPagesPerUrl, setMaxPagesPerUrl] = useState('5');
  const [pageDelaySeconds, setPageDelaySeconds] = useState('6');
  const [materials, setMaterials] = useState<BouwmaatImportMaterial[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isStoppingScrape, setIsStoppingScrape] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const urlRows = useMemo(
    () => parseUrlRows(urlsText, defaultCategory, defaultSubCategory),
    [urlsText, defaultCategory, defaultSubCategory]
  );

  const selectedMaterials = useMemo(() => {
    return materials.filter((material) => selectedKeys.has(material.source_product_id || material.source_url || material.materiaalnaam));
  }, [materials, selectedKeys]);

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
    setUrlsText('');
    setDefaultCategory('');
    setDefaultSubCategory('');
    setMaxPagesPerUrl('5');
    setPageDelaySeconds('6');
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
      const res = await fetch('/api/local/bouwmaat/scrape', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          urls: urlRows,
          maxPagesPerUrl: Number.parseInt(maxPagesPerUrl, 10) || 5,
          pageDelaySeconds: Number.parseInt(pageDelaySeconds, 10) || 6,
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
      setStatus(
        json.cancelled
          ? `Gestopt. ${nextMaterials.length} producten gevonden over ${json.pagesVisited ?? '?'} pagina’s.`
          : `${nextMaterials.length} producten gevonden over ${json.pagesVisited ?? '?'} pagina’s.`
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
      <DialogContent className="w-[96vw] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PackageSearch className="h-5 w-5 text-emerald-400" />
            Bouwmaat import
          </DialogTitle>
          <DialogDescription>
            Open de lokale Bouwmaat browser, log in, kies handmatig de categorie en importeer daarna de gevonden producten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[72vh] gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 text-sm font-semibold">1. Login sessie</div>
              <Button
                type="button"
                variant="outline"
                onClick={openBouwmaatBrowser}
                disabled={isBusy}
                className="w-full justify-center gap-2"
              >
                {isOpeningBrowser ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Open Bouwmaat browser
              </Button>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                De categorie wordt handmatig toegepast op alle URL’s, tenzij je per regel override gebruikt met URL | categorie | subcategorie.
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Standaard hoofdcategorie</div>
                  <Input
                    value={defaultCategory}
                    onChange={(event) => {
                      setDefaultCategory(event.target.value);
                      resetPreview();
                    }}
                    placeholder="Bijv. Vuren hout"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Standaard subcategorie</div>
                  <Input
                    value={defaultSubCategory}
                    onChange={(event) => {
                      setDefaultSubCategory(event.target.value);
                      resetPreview();
                    }}
                    placeholder="Bijv. Balken"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Pagina’s per URL</div>
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
                <p className="text-xs text-muted-foreground">
                  De scraper volgt automatisch volgende pagina’s tot dit maximum.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Pauze tussen pagina’s</div>
                <Input
                  value={pageDelaySeconds}
                  onChange={(event) => {
                    setPageDelaySeconds(event.target.value);
                    resetPreview();
                  }}
                  type="number"
                  min="6"
                  max="60"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Minimaal 6 seconden. Er komt automatisch 1-5 seconden variatie bovenop.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Bouwmaat URL’s</div>
                <Textarea
                  value={urlsText}
                  onChange={(event) => {
                    setUrlsText(event.target.value);
                    resetPreview();
                  }}
                  className="min-h-[180px] font-mono text-xs"
                  placeholder={'https://www.bouwmaat.nl/.../hout\nhttps://www.bouwmaat.nl/.../osb-platen | Constructieplaten | Osb'}
                />
                <p className="text-xs text-muted-foreground">
                  Eén URL per regel. Optioneel: URL | hoofdcategorie | subcategorie.
                </p>
              </div>

              <Button
                type="button"
                variant="success"
                onClick={scrapeProducts}
                disabled={isBusy || urlRows.length === 0}
                className="w-full justify-center gap-2"
              >
                {isScraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Producten ophalen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={refreshClean}
                disabled={isScraping || isImporting}
                className="w-full justify-center gap-2"
              >
                <Eraser className="h-4 w-4" />
                Preview leegmaken
              </Button>
              {isScraping ? (
                <Button
                  type="button"
                  variant="destructiveSoft"
                  onClick={stopScrape}
                  disabled={isStoppingScrape}
                  className="w-full justify-center gap-2"
                >
                  {isStoppingScrape ? <Loader2 className="h-4 w-4 animate-spin" /> : <Octagon className="h-4 w-4" />}
                  Stop ophalen
                </Button>
              ) : null}
            </div>

            {status ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {status}
              </div>
            ) : null}
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
                    <TableHead className="w-28 text-right">Prijs</TableHead>
                    <TableHead className="hidden w-24 md:table-cell">Eenheid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.length ? materials.map((material) => {
                    const key = material.source_product_id || material.source_url || material.materiaalnaam;
                    const selected = selectedKeys.has(key);
                    return (
                      <TableRow key={key} className={cn(!selected && 'opacity-50')}>
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
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatEuro(material.prijs_excl_btw)}</TableCell>
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
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isBusy}>
            Sluiten
          </Button>
          <Button type="button" variant="outline" onClick={refreshClean} disabled={isScraping || isImporting}>
            Preview leegmaken
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
