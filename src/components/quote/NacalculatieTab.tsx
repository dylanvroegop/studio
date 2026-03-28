'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { useFirestore } from '@/firebase';
import { createDefaultNacalculatieDoc, normalizeNacalculatieDoc, recalculateNacalculatie } from '@/lib/nacalculatie';
import type {
  NacalculatieCostEntry,
  NacalculatieDoc,
  NacalculatieLaborEntry,
  NacalculatieMaterialEntry,
  NacalculatieTransportEntry,
} from '@/lib/winst-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface NacalculatieTabProps {
  quoteId: string;
  userId: string;
  defaultHourlyRateExcl: number;
}

function createId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function updateArrayItem<T>(items: T[], index: number, updater: (item: T) => T): T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? updater(item) : item));
}

export function NacalculatieTab({ quoteId, userId, defaultHourlyRateExcl }: NacalculatieTabProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [docState, setDocState] = useState<NacalculatieDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hydrateRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const nacalcRef = doc(firestore, 'quotes', quoteId, 'nacalculatie', 'main');
        const snap = await getDoc(nacalcRef);
        const normalized = normalizeNacalculatieDoc({
          quoteId,
          userId,
          source: snap.exists() ? snap.data() : createDefaultNacalculatieDoc({ quoteId, userId, defaultHourRateExcl: defaultHourlyRateExcl }),
          defaultHourRateExcl: defaultHourlyRateExcl,
        });
        if (!cancelled) {
          setDocState(normalized);
          setLoading(false);
          hydrateRef.current = false;
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          toast({
            title: 'Nacalculatie laden mislukt',
            description: error instanceof Error ? error.message : 'Onbekende fout',
            variant: 'destructive',
          });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [defaultHourlyRateExcl, firestore, quoteId, toast, userId]);

  const persistDoc = async (nextDoc: NacalculatieDoc) => {
    if (!firestore) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nacalcRef = doc(firestore, 'quotes', quoteId, 'nacalculatie', 'main');
      const payload = {
        ...nextDoc,
        quoteId,
        userId,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      };
      await setDoc(nacalcRef, payload, { merge: true });
      setLastSavedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!docState) return;
    if (hydrateRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistDoc(recalculateNacalculatie(docState));
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [docState]);

  const totals = useMemo(() => {
    if (!docState) return null;
    const normalized = recalculateNacalculatie(docState);
    const totalCostExcl =
      normalized.labor.actualCostExcl +
      normalized.materials.groot.actualCostExcl +
      normalized.materials.verbruik.actualCostExcl +
      normalized.transport.actualCostExcl +
      normalized.materieel.actualCostExcl +
      normalized.overhead.actualCostExcl;
    return {
      actualHours: normalized.labor.actualHours,
      totalCostExcl,
      grootCost: normalized.materials.groot.actualCostExcl,
      verbruikCost: normalized.materials.verbruik.actualCostExcl,
      laborCost: normalized.labor.actualCostExcl,
      transportCost: normalized.transport.actualCostExcl,
      materieelCost: normalized.materieel.actualCostExcl,
      overheadCost: normalized.overhead.actualCostExcl,
    };
  }, [docState]);

  if (loading || !docState) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Nacalculatie laden...
      </div>
    );
  }

  const setLaborEntries = (entries: NacalculatieLaborEntry[]) => {
    setDocState((prev) => (prev ? recalculateNacalculatie({ ...prev, labor: { ...prev.labor, entries } }) : prev));
  };

  const setGrootEntries = (entries: NacalculatieMaterialEntry[]) => {
    setDocState((prev) =>
      prev
        ? recalculateNacalculatie({
            ...prev,
            materials: {
              ...prev.materials,
              groot: { ...prev.materials.groot, entries },
            },
          })
        : prev
    );
  };

  const setVerbruikEntries = (entries: NacalculatieMaterialEntry[]) => {
    setDocState((prev) =>
      prev
        ? recalculateNacalculatie({
            ...prev,
            materials: {
              ...prev.materials,
              verbruik: { ...prev.materials.verbruik, entries },
            },
          })
        : prev
    );
  };

  const setTransportEntries = (entries: NacalculatieTransportEntry[]) => {
    setDocState((prev) => (prev ? recalculateNacalculatie({ ...prev, transport: { ...prev.transport, entries } }) : prev));
  };

  const setMaterieelEntries = (entries: NacalculatieCostEntry[]) => {
    setDocState((prev) => (prev ? recalculateNacalculatie({ ...prev, materieel: { ...prev.materieel, entries } }) : prev));
  };

  const setOverheadEntries = (entries: NacalculatieCostEntry[]) => {
    setDocState((prev) => (prev ? recalculateNacalculatie({ ...prev, overhead: { ...prev.overhead, entries } }) : prev));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nacalculatie (Werkelijk)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={docState.status}
                onValueChange={(value) =>
                  setDocState((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: value === 'afgerond' || value === 'in_progress' ? value : 'concept',
                        }
                      : prev
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status kiezen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="in_progress">In uitvoering</SelectItem>
                  <SelectItem value="afgerond">Afgerond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Werkelijke uren</div>
              <div className="text-lg font-semibold">{safeNumber(totals?.actualHours).toFixed(1)} uur</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Werkelijke kosten (excl.)</div>
              <div className="text-lg font-semibold">{formatCurrency(safeNumber(totals?.totalCostExcl))}</div>
            </div>
          </div>

          <div className="grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded border border-border px-3 py-2">Groot: {formatCurrency(safeNumber(totals?.grootCost))}</div>
            <div className="rounded border border-border px-3 py-2">Verbruik: {formatCurrency(safeNumber(totals?.verbruikCost))}</div>
            <div className="rounded border border-border px-3 py-2">Arbeid: {formatCurrency(safeNumber(totals?.laborCost))}</div>
            <div className="rounded border border-border px-3 py-2">Transport: {formatCurrency(safeNumber(totals?.transportCost))}</div>
            <div className="rounded border border-border px-3 py-2">Materieel: {formatCurrency(safeNumber(totals?.materieelCost))}</div>
            <div className="rounded border border-border px-3 py-2">Overhead: {formatCurrency(safeNumber(totals?.overheadCost))}</div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {saving ? 'Opslaan...' : lastSavedAt ? `Laatst opgeslagen: ${lastSavedAt.toLocaleTimeString('nl-NL')}` : 'Nog niet opgeslagen'}
            </span>
            {saveError ? <span className="text-red-400">Opslaan mislukt: {saveError}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Arbeid (werkelijke uren)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {docState.labor.entries.map((entry, index) => (
            <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
              <Input
                type="date"
                value={entry.date}
                onChange={(event) =>
                  setLaborEntries(updateArrayItem(docState.labor.entries, index, (item) => ({ ...item, date: event.target.value })))
                }
                className="md:col-span-2"
              />
              <Input
                type="number"
                step="0.1"
                min="0"
                value={entry.hours}
                onChange={(event) =>
                  setLaborEntries(
                    updateArrayItem(docState.labor.entries, index, (item) => ({ ...item, hours: Math.max(0, safeNumber(event.target.value)) }))
                  )
                }
                placeholder="Uren"
                className="md:col-span-2"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={entry.hourRateExcl}
                onChange={(event) =>
                  setLaborEntries(
                    updateArrayItem(docState.labor.entries, index, (item) => ({ ...item, hourRateExcl: Math.max(0, safeNumber(event.target.value)) }))
                  )
                }
                placeholder="Tarief excl."
                className="md:col-span-2"
              />
              <Input
                value={entry.note || ''}
                onChange={(event) =>
                  setLaborEntries(updateArrayItem(docState.labor.entries, index, (item) => ({ ...item, note: event.target.value })))
                }
                placeholder="Notitie"
                className="md:col-span-4"
              />
              <div className="flex items-center justify-between md:col-span-2">
                <span className="text-sm font-medium">{formatCurrency(entry.hours * entry.hourRateExcl)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLaborEntries(docState.labor.entries.filter((_, currentIndex) => currentIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLaborEntries([
                ...docState.labor.entries,
                { id: createId(), date: todayDateString(), hours: 0, hourRateExcl: defaultHourlyRateExcl || 50 },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Arbeid regel toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Materialen (Groot)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {docState.materials.groot.entries.map((entry, index) => (
            <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
              <Input
                value={entry.name}
                onChange={(event) =>
                  setGrootEntries(updateArrayItem(docState.materials.groot.entries, index, (item) => ({ ...item, name: event.target.value })))
                }
                placeholder="Materiaal"
                className="md:col-span-3"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.qty}
                onChange={(event) =>
                  setGrootEntries(
                    updateArrayItem(docState.materials.groot.entries, index, (item) => ({ ...item, qty: Math.max(0, safeNumber(event.target.value)) }))
                  )
                }
                placeholder="Aantal"
                className="md:col-span-2"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.unitCostExcl}
                onChange={(event) =>
                  setGrootEntries(
                    updateArrayItem(docState.materials.groot.entries, index, (item) => ({
                      ...item,
                      unitCostExcl: Math.max(0, safeNumber(event.target.value)),
                    }))
                  )
                }
                placeholder="Prijs/stuk"
                className="md:col-span-2"
              />
              <Input
                type="date"
                value={entry.date}
                onChange={(event) =>
                  setGrootEntries(updateArrayItem(docState.materials.groot.entries, index, (item) => ({ ...item, date: event.target.value })))
                }
                className="md:col-span-2"
              />
              <div className="flex items-center justify-between md:col-span-3">
                <span className="text-sm font-medium">{formatCurrency(entry.qty * entry.unitCostExcl)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setGrootEntries(docState.materials.groot.entries.filter((_, currentIndex) => currentIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setGrootEntries([
                ...docState.materials.groot.entries,
                { id: createId(), date: todayDateString(), name: '', qty: 0, unitCostExcl: 0, totalExcl: 0 },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Groot materiaal toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verbruiksmaterialen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {docState.materials.verbruik.entries.map((entry, index) => (
            <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
              <Input
                value={entry.name}
                onChange={(event) =>
                  setVerbruikEntries(
                    updateArrayItem(docState.materials.verbruik.entries, index, (item) => ({ ...item, name: event.target.value }))
                  )
                }
                placeholder="Verbruiksmateriaal"
                className="md:col-span-3"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.qty}
                onChange={(event) =>
                  setVerbruikEntries(
                    updateArrayItem(docState.materials.verbruik.entries, index, (item) => ({ ...item, qty: Math.max(0, safeNumber(event.target.value)) }))
                  )
                }
                placeholder="Aantal"
                className="md:col-span-2"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.unitCostExcl}
                onChange={(event) =>
                  setVerbruikEntries(
                    updateArrayItem(docState.materials.verbruik.entries, index, (item) => ({
                      ...item,
                      unitCostExcl: Math.max(0, safeNumber(event.target.value)),
                    }))
                  )
                }
                placeholder="Prijs/stuk"
                className="md:col-span-2"
              />
              <Input
                type="date"
                value={entry.date}
                onChange={(event) =>
                  setVerbruikEntries(
                    updateArrayItem(docState.materials.verbruik.entries, index, (item) => ({ ...item, date: event.target.value }))
                  )
                }
                className="md:col-span-2"
              />
              <div className="flex items-center justify-between md:col-span-3">
                <span className="text-sm font-medium">{formatCurrency(entry.qty * entry.unitCostExcl)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setVerbruikEntries(docState.materials.verbruik.entries.filter((_, currentIndex) => currentIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setVerbruikEntries([
                ...docState.materials.verbruik.entries,
                { id: createId(), date: todayDateString(), name: '', qty: 0, unitCostExcl: 0, totalExcl: 0 },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Verbruiksmateriaal toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transport (werkelijk)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {docState.transport.entries.map((entry, index) => (
            <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
              <Input
                type="date"
                value={entry.date}
                onChange={(event) =>
                  setTransportEntries(updateArrayItem(docState.transport.entries, index, (item) => ({ ...item, date: event.target.value })))
                }
                className="md:col-span-2"
              />
              <Input
                type="number"
                min="0"
                step="0.1"
                value={entry.km}
                onChange={(event) =>
                  setTransportEntries(
                    updateArrayItem(docState.transport.entries, index, (item) => ({ ...item, km: Math.max(0, safeNumber(event.target.value)) }))
                  )
                }
                placeholder="KM"
                className="md:col-span-2"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.costExcl}
                onChange={(event) =>
                  setTransportEntries(
                    updateArrayItem(docState.transport.entries, index, (item) => ({
                      ...item,
                      costExcl: Math.max(0, safeNumber(event.target.value)),
                    }))
                  )
                }
                placeholder="Kosten excl."
                className="md:col-span-3"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.revenueExcl}
                onChange={(event) =>
                  setTransportEntries(
                    updateArrayItem(docState.transport.entries, index, (item) => ({
                      ...item,
                      revenueExcl: Math.max(0, safeNumber(event.target.value)),
                    }))
                  )
                }
                placeholder="Opbrengst excl."
                className="md:col-span-3"
              />
              <div className="flex items-center justify-end md:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setTransportEntries(docState.transport.entries.filter((_, currentIndex) => currentIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setTransportEntries([
                ...docState.transport.entries,
                { id: createId(), date: todayDateString(), km: 0, costExcl: 0, revenueExcl: 0 },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Transportregel toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Materieel en Overhead</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-medium">Materieel</div>
            {docState.materieel.entries.map((entry, index) => (
              <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
                <Input
                  value={entry.name}
                  onChange={(event) =>
                    setMaterieelEntries(updateArrayItem(docState.materieel.entries, index, (item) => ({ ...item, name: event.target.value })))
                  }
                  placeholder="Omschrijving"
                  className="md:col-span-5"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.costExcl}
                  onChange={(event) =>
                    setMaterieelEntries(
                      updateArrayItem(docState.materieel.entries, index, (item) => ({
                        ...item,
                        costExcl: Math.max(0, safeNumber(event.target.value)),
                      }))
                    )
                  }
                  placeholder="Kosten excl."
                  className="md:col-span-4"
                />
                <Input
                  type="date"
                  value={entry.date}
                  onChange={(event) =>
                    setMaterieelEntries(updateArrayItem(docState.materieel.entries, index, (item) => ({ ...item, date: event.target.value })))
                  }
                  className="md:col-span-2"
                />
                <div className="flex items-center justify-end md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMaterieelEntries(docState.materieel.entries.filter((_, currentIndex) => currentIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setMaterieelEntries([
                  ...docState.materieel.entries,
                  { id: createId(), date: todayDateString(), name: '', costExcl: 0 },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Materieel toevoegen
            </Button>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Overhead</div>
            {docState.overhead.entries.map((entry, index) => (
              <div key={entry.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-12">
                <Input
                  value={entry.name}
                  onChange={(event) =>
                    setOverheadEntries(updateArrayItem(docState.overhead.entries, index, (item) => ({ ...item, name: event.target.value })))
                  }
                  placeholder="Omschrijving"
                  className="md:col-span-5"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.costExcl}
                  onChange={(event) =>
                    setOverheadEntries(
                      updateArrayItem(docState.overhead.entries, index, (item) => ({
                        ...item,
                        costExcl: Math.max(0, safeNumber(event.target.value)),
                      }))
                    )
                  }
                  placeholder="Kosten excl."
                  className="md:col-span-4"
                />
                <Input
                  type="date"
                  value={entry.date}
                  onChange={(event) =>
                    setOverheadEntries(updateArrayItem(docState.overhead.entries, index, (item) => ({ ...item, date: event.target.value })))
                  }
                  className="md:col-span-2"
                />
                <div className="flex items-center justify-end md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOverheadEntries(docState.overhead.entries.filter((_, currentIndex) => currentIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOverheadEntries([
                  ...docState.overhead.entries,
                  { id: createId(), date: todayDateString(), name: '', costExcl: 0 },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Overhead toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notities nacalculatie</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={docState.notes || ''}
            onChange={(event) =>
              setDocState((prev) =>
                prev
                  ? {
                      ...prev,
                      notes: event.target.value,
                    }
                  : prev
              )
            }
            placeholder="Wat liep anders dan geoffreerd? Wat neem je mee naar je volgende offerte?"
            rows={5}
          />
        </CardContent>
      </Card>
    </div>
  );
}
