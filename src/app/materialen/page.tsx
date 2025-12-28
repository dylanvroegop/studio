'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';

import { useUser } from '@/firebase';

import { DashboardHeader } from '@/components/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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

type Material = {
  row_id: string;
  subsectie: string | null;
  materiaalnaam: string | null;
  prijs: number | string | null;
  eenheid: string | null;
  leverancier: string | null;
  gebruikerid: string;
  volgorde: number | null;
};

function parsePriceToNumber(raw: unknown): number | null {
  if (raw == null) return null;

  if (typeof raw === 'number') {
    return Number.isNaN(raw) ? null : raw;
  }

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
  // If they chose m1, we calculate price per full length
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

function PageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={null} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center p-8 text-center text-gray-500">
          <Loader2 className="mr-3 h-8 w-8 animate-spin text-primary" />
          Pagina laden...
        </div>
      </main>
    </div>
  );
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
  if (!currentUser) throw new Error('Niet ingelogd. Log opnieuw in.');
  return await currentUser.getIdToken();
}

export default function MaterialenPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [savingCustom, setSavingCustom] = useState<boolean>(false);

  // ✅ Delete confirm dialog
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [customNaam, setCustomNaam] = useState<string>('');
  const [customEenheid, setCustomEenheid] = useState<string>(''); // leeg (focus!)
  const [customPrijs, setCustomPrijs] = useState<string>('');
  const [customSubsectie, setCustomSubsectie] = useState<string>('');
  const [customLeverancier, setCustomLeverancier] = useState<string>(''); // leeg

  const [maatUnit, setMaatUnit] = useState<string>('mm');
  const [maatLengte, setMaatLengte] = useState<string>('');
  const [maatBreedte, setMaatBreedte] = useState<string>('');
  const [maatDikte, setMaatDikte] = useState<string>('');
  const [maatHoogte, setMaatHoogte] = useState<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  // ✅ FIX: geen losse rommel onder de hook, geen extra sluit-haakjes, en juiste route /api/materialen/get
  const fetchMaterials = useCallback(async () => {
    if (!user?.uid) return;

    setIsLoading(true);
    setPageError(null);

    try {
      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/get', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setMaterials(Array.isArray(json.data) ? json.data : []);
      } else {
        const msg =
          json?.message ||
          json?.error ||
          (typeof json === 'string' ? json : null) ||
          `Kon materialen niet laden (HTTP ${res.status}).`;
        setPageError(msg);
      }
    } catch (err: any) {
      console.error(err);
      setPageError(err?.message || 'Netwerkfout bij het laden van materialen.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      fetchMaterials();
    } else if (!isUserLoading) {
      setIsLoading(false);
    }
  }, [user?.uid, isUserLoading, fetchMaterials]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, supplierFilter, categoryFilter]);

  const uniqueSuppliers = useMemo(() => {
    const arr = materials
      .map((m) => (m.leverancier ?? '').trim())
      .filter((v) => !!v);
    return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const uniqueCategories = useMemo(() => {
    const arr = materials
      .map((m) => (m.subsectie ?? '').trim())
      .filter((v) => !!v);
    return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    let result = materials;

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter((m) => (m.materiaalnaam ?? '').toLowerCase().includes(s));
    }

    if (supplierFilter !== 'all') {
      result = result.filter((m) => (m.leverancier ?? '') === supplierFilter);
    }

    if (categoryFilter !== 'all') {
      result = result.filter((m) => (m.subsectie ?? '') === categoryFilter);
    }

    return result;
  }, [materials, search, supplierFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / itemsPerPage));

  const paginatedMaterials = useMemo(() => {
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (safePage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredMaterials.slice(start, end);
  }, [filteredMaterials, currentPage, totalPages]);

  const resetCustomForm = useCallback(() => {
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
  }, []);

  const openCustomDialog = useCallback(() => {
    setPageError(null);
    resetCustomForm();
    setDialogOpen(true);
  }, [resetCustomForm]);

  const closeCustomDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  useEffect(() => {
    if (customEenheid === 'p/m3') {
      setMaatDikte('');
    } else if (customEenheid === 'p/m1' || customEenheid === 'p/m2') {
      setMaatHoogte('');
    }
  }, [customEenheid]);

  const isNaamOk = useMemo(() => customNaam.trim().length > 0, [customNaam]);
  const prijsNum = useMemo(() => parsePriceToNumber(customPrijs), [customPrijs]);
  const isPrijsOk = useMemo(() => prijsNum != null && prijsNum >= 0, [prijsNum]);
  const isEenheidOk = useMemo(() => (customEenheid || '').trim().length > 0, [customEenheid]);

  const maatVereist = useMemo(() => isMaatEenheid(customEenheid), [customEenheid]);

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
    return !savingCustom && isNaamOk && isPrijsOk && isEenheidOk && isMaatOk;
  }, [savingCustom, isNaamOk, isPrijsOk, isEenheidOk, isMaatOk]);

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

  const saveCustomMaterial = useCallback(async () => {
    try {
      const naamRaw = customNaam.trim();
      if (!naamRaw) {
        setPageError('Materiaalnaam is verplicht.');
        return;
      }

      // Nieuw: Maak de naam netjes (Hoofdletter Per Woord)
      const formattedName = naamRaw
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const prijsNumLocal = parsePriceToNumber(customPrijs);
      if (prijsNumLocal == null || prijsNumLocal < 0) {
        setPageError('Vul een geldige prijs in.');
        return;
      }

      const eenheid = (customEenheid || '').trim();
      if (!eenheid) {
        setPageError('Kies een eenheid.');
        return;
      }

      const maatUnitLocal = (maatUnit || 'mm').trim();
      const lengte = maatLengte.trim();
      const breedte = maatBreedte.trim();
      const dikte = maatDikte.trim();
      const hoogte = maatHoogte.trim();

      if (isMaatEenheid(eenheid)) {
        if (!lengte || !breedte || !maatUnitLocal) {
          setPageError('Vul afmetingen in en kies mm/cm/m.');
          return;
        }
        if (eenheid === 'p/m3') {
          if (!hoogte) {
            setPageError('Vul hoogte in (voor p/m3).');
            return;
          }
        } else {
          if (!dikte) {
            setPageError('Vul dikte in (voor p/m1/p/m2).');
            return;
          }
        }
      }

      const categorie = customSubsectie.trim() || 'Overig';
      const leverancierTrim = customLeverancier.trim();
      const leverancier = leverancierTrim ? leverancierTrim : null;

      setSavingCustom(true);
      setPageError(null);

      const payload: any = {
        // Gebruik hier de geformatteerde naam
        materiaalnaam: stripMaatSuffix(formattedName),
        eenheid,
        prijs: prijsNumLocal,
        categorie,
        leverancier,
        unit: maatUnitLocal,
      };

      if (isMaatEenheid(eenheid)) {
        payload.lengte = lengte;
        payload.breedte = breedte;
        if (eenheid === 'p/m3') payload.hoogte = hoogte;
        else payload.dikte = dikte;
      }

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
        const msg = json?.message || json?.error || 'Onbekende fout bij opslaan.';
        setPageError(`Opslaan mislukt: ${msg}`);
        setSavingCustom(false);
        return;
      }

      await fetchMaterials();
      setSavingCustom(false);
      setDialogOpen(false);
    } catch (e: any) {
      console.error(e);
      setPageError(e?.message || 'Onbekende fout.');
      setSavingCustom(false);
    }
  }, [
    customNaam,
    customPrijs,
    customEenheid,
    customSubsectie,
    customLeverancier,
    maatUnit,
    maatLengte,
    maatBreedte,
    maatDikte,
    maatHoogte,
    fetchMaterials,
  ]);

  // ✅ Open delete confirm
  const openDeleteDialog = useCallback((m: Material) => {
    setPageError(null);
    setDeleteTarget(m);
    setDeleteOpen(true);
  }, []);

  // ✅ Delete via API -> n8n -> supabase delete
  const bevestigDelete = useCallback(async () => {
    if (!deleteTarget?.row_id) return;

    try {
      setDeleting(true);
      setPageError(null);

      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/delete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ row_id: deleteTarget.row_id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg =
          json?.message ||
          json?.error ||
          (typeof json === 'string' ? json : null) ||
          'Onbekende fout bij verwijderen.';
        console.error('Delete API error:', msg, json);
        setPageError(`Verwijderen mislukt: ${msg}`);
        setDeleting(false);
        return;
      }

      setDeleteOpen(false);
      setDeleteTarget(null);

      await fetchMaterials();
      setDeleting(false);
    } catch (e: any) {
      console.error(e);
      setPageError(e?.message || 'Onbekende fout.');
      setDeleting(false);
    }
  }, [deleteTarget, fetchMaterials]);

  if (isUserLoading || (!user && !pageError)) {
    return <PageSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={user} />

      <main className="flex-1 space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline" size="icon" className="h-8 w-8">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Terug</span>
              </Link>
            </Button>

            <div>
              <h1 className="text-2xl font-semibold md:text-3xl">Materialen & Prijzen</h1>
              <p className="text-muted-foreground">Doorzoek uw materiaalbibliotheek.</p>
            </div>
          </div>

          <Button onClick={openCustomDialog} className="gap-2" variant="success">
            <Plus className="h-4 w-4" />
            Eigen materiaal toevoegen
          </Button>
        </div>

        {pageError ? (
          <div className="rounded-xl border bg-destructive/10 px-4 py-3 text-destructive">
            {pageError}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Alle materialen</CardTitle>

            <div className="mt-4 flex flex-col gap-2 md:flex-row">
              <Input
                placeholder="Zoek op materiaalnaam..."
                className="max-w-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="flex gap-2">
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Leverancier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle leveranciers</SelectItem>
                    {uniqueSuppliers.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle categorieën</SelectItem>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                <span>Materialen laden...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Materiaalnaam</TableHead>
                    <TableHead className="text-right">Prijs</TableHead>
                    <TableHead>Eenheid</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead>Leverancier</TableHead>
                    <TableHead className="w-[60px] text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedMaterials.length > 0 ? (
                    paginatedMaterials.map((material) => {
                      const prijsNumber = parsePriceToNumber(material.prijs);
                      return (
                        <TableRow key={material.row_id}>
                          <TableCell className="font-medium">{material.materiaalnaam ?? '—'}</TableCell>
                          <TableCell className="text-right">{formatEuro(prijsNumber)}</TableCell>
                          <TableCell>{material.eenheid ?? '—'}</TableCell>
                          <TableCell>{material.subsectie ?? '—'}</TableCell>
                          <TableCell>{material.leverancier ?? '—'}</TableCell>

                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDeleteDialog(material)}
                              title="Verwijderen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        Geen materialen gevonden.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {filteredMaterials.length > 0 && totalPages > 1 ? (
            <CardFooter className="flex items-center justify-center pt-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Vorige
                </Button>

                <span className="text-sm text-muted-foreground">
                  Pagina {Math.min(currentPage, totalPages)} van {totalPages}
                </span>

                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Volgende
                </Button>
              </div>
            </CardFooter>
          ) : null}
        </Card>

        {/* ✅ Confirm delete dialog */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je dit materiaal wilt verwijderen?
                <br />
                <span className="font-medium">
                  {deleteTarget?.materiaalnaam ?? 'Onbekend materiaal'}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (!deleting) bevestigDelete();
                }}
                disabled={deleting}
              >
                {deleting ? 'Verwijderen...' : 'Ja, verwijderen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ✅ Add custom dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[640px]">
            <DialogHeader className="space-y-1">
              <DialogTitle>Eigen materiaal toevoegen</DialogTitle>
              <DialogDescription>
                Dit materiaal wordt opgeslagen in uw materialenlijst en blijft bestaan bij nieuwe prijslijsten.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Materiaalnaam *</div>
                <Input value={customNaam} onChange={(e) => setCustomNaam(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Eenheid *</div>
                  <Select value={customEenheid} onValueChange={setCustomEenheid}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies eenheid" />
                    </SelectTrigger>
                    <SelectContent>
                      {EENHEDEN.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
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

              {maatVereist ? (
                <div className="rounded-lg border border-muted/60 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Afmetingen *</div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">Unit</div>
                      <Select value={maatUnit} onValueChange={setMaatUnit}>
                        <SelectTrigger className="h-8 w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAAT_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Lengte *</div>
                      <InputMetSuffix
                        value={maatLengte}
                        onChange={setMaatLengte}
                        suffix={maatUnit}
                        placeholder="bijv. 2400"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Breedte *</div>
                      <InputMetSuffix
                        value={maatBreedte}
                        onChange={setMaatBreedte}
                        suffix={maatUnit}
                        placeholder="bijv. 1200"
                      />
                    </div>

                    {customEenheid === 'p/m3' ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Hoogte *</div>
                        <InputMetSuffix
                          value={maatHoogte}
                          onChange={setMaatHoogte}
                          suffix={maatUnit}
                          placeholder="bijv. 100"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Dikte *</div>
                        <InputMetSuffix
                          value={maatDikte}
                          onChange={setMaatDikte}
                          suffix={maatUnit}
                          placeholder="bijv. 18"
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-3 text-xs">
                    <span className="text-muted-foreground">Wordt opgeslagen als:&nbsp;</span>
                    <span className="font-medium text-emerald-400">{previewNaam}</span>
                  </div>
                </div>
              ) : null}

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
                    placeholder="Bijv. Eigen / Bouwmaat / Jongeneel"
                  />
                </div>
                </div> 
      </div>

{/* 1. DE SAFETY CHECK BAR */}
{isPrijsOk && isMaatOk && (customEenheid === 'p/m2' || customEenheid === 'p/m1') && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-destructive uppercase tracking-widest leading-none">Controle</span>
              <span className="text-sm font-semibold text-foreground mt-0.5 capitalize italic">{previewNaam}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-lg font-black text-destructive leading-none">
              {formatEuro(calculatePiecePrice(prijsNum!, customEenheid, maatLengte, maatBreedte, maatUnit))}
            </div>
            <div className="text-[10px] font-bold uppercase text-muted-foreground mt-1">
              per {customEenheid === 'p/m2' ? 'stuk' : 'lengte'}
            </div>
          </div>
        </div>
      )}

      {/* 2. DE KNOPPEN */}
      <DialogFooter className="mt-6 border-t border-muted/60 bg-muted/5 px-6 py-4 sm:justify-end gap-3">
        <Button 
          type="button" 
          variant="outline" 
          onClick={closeCustomDialog} 
          disabled={savingCustom}
          className="h-11 px-6 text-sm font-medium"
        >
          Annuleren
        </Button>

        <Button
          type="button"
          variant="success"
          onClick={saveCustomMaterial}
          disabled={!canSaveCustom}
          className="h-11 gap-2 px-8 text-sm font-bold shadow-lg shadow-success/20"
        >
          {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Materiaal toevoegen
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
      </main>
    </div>
  );
}
