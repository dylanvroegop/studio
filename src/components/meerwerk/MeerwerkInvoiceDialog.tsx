'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { calculateMeerwerkbonTotals, formatCurrency, normalizeMeerwerkbonLineItem } from '@/lib/meerwerkbon-utils';
import type { MeerwerkbonLineItem, MeerwerkbonPricingMode } from '@/lib/types';

function editableLine(row: Partial<MeerwerkbonLineItem>, quantity = '') {
  return {
    id: row.id || crypto.randomUUID(),
    type: row.type || 'vrije_post' as const,
    omschrijving: row.omschrijving || '',
    aantal: quantity,
    eenheid: row.eenheid || 'stuk',
    prijsPerEenheidExclBtw: String(row.prijsPerEenheidExclBtw ?? ''),
    btwTarief: String(row.btwTarief ?? 21),
  };
}

function numberValue(input: string): number {
  return input.trim() ? Number(input.replace(',', '.')) : NaN;
}

export function MeerwerkInvoiceDialog({ lines, pricingMode, hourlyRate, busy, onClose, onCreate }: {
  lines: MeerwerkbonLineItem[];
  pricingMode: MeerwerkbonPricingMode;
  hourlyRate: number;
  busy: boolean;
  onClose: () => void;
  onCreate: (actual: MeerwerkbonLineItem[]) => void;
}): JSX.Element {
  const [rows, setRows] = useState(() => {
    const isHour = (unit: string) => /^(uur|uren|u|h)$/i.test(unit.trim());
    const items = lines.map((row) => editableLine(row,
      pricingMode === 'uren_nacalculatie' && !isHour(row.eenheid) ? String(row.aantal) : ''));
    if (!items.some((row) => isHour(row.eenheid))) {
      items.unshift(editableLine({ omschrijving: 'Arbeid', eenheid: 'uur', prijsPerEenheidExclBtw: hourlyRate }));
    }
    return items;
  });

  const parsed = rows.map((row) => ({
    ...row, aantal: numberValue(row.aantal), prijsPerEenheidExclBtw: numberValue(row.prijsPerEenheidExclBtw),
    btwTarief: numberValue(row.btwTarief),
  }));
  const valid = parsed.every(row => row.omschrijving.trim() && row.eenheid.trim()
    && Number.isFinite(row.aantal) && row.aantal > 0
    && Number.isFinite(row.prijsPerEenheidExclBtw) && row.prijsPerEenheidExclBtw >= 0
    && Number.isFinite(row.btwTarief) && row.btwTarief >= 0 && row.btwTarief <= 100);
  const invoiceLines = parsed.map(normalizeMeerwerkbonLineItem);
  const total = calculateMeerwerkbonTotals(invoiceLines).totaalInclBtw;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Meerwerk factureren</DialogTitle>
          <DialogDescription>Vul de werkelijk te factureren aantallen en prijzen in. De goedgekeurde bon blijft bewaard.</DialogDescription>
        </DialogHeader>
        {rows.map((row) => (
          <fieldset key={row.id} disabled={busy} className="grid grid-cols-2 gap-2 rounded-lg border p-3">
            {([
              ['omschrijving', 'Omschrijving'], ['aantal', 'Werkelijk aantal'], ['eenheid', 'Eenheid'],
              ['prijsPerEenheidExclBtw', 'Prijs per eenheid excl. btw'], ['btwTarief', 'Btw (%)'],
            ] as const).map(([field, label]) => (
              <label key={field} className={field === 'omschrijving' ? 'col-span-2 text-sm' : 'text-sm'}>
                {label}
                <Input value={row[field]} inputMode={field === 'omschrijving' || field === 'eenheid' ? 'text' : 'decimal'}
                  onChange={(event) => setRows(previous => previous.map(item => item.id === row.id
                    ? { ...item, [field]: event.target.value } : item))} />
              </label>
            ))}
            <Button variant="ghost" size="sm" className="col-span-2 justify-self-end"
              onClick={() => setRows(previous => previous.filter(item => item.id !== row.id))}>
              <Trash2 className="mr-2 h-4 w-4" /> Regel verwijderen
            </Button>
          </fieldset>
        ))}
        <Button variant="outline" disabled={busy} onClick={() => setRows(previous => [...previous, editableLine({})])}>
          <Plus className="mr-2 h-4 w-4" /> Regel toevoegen
        </Button>
        <div className="flex justify-between font-semibold"><span>Totaal incl. btw</span>{formatCurrency(total)}</div>
        <Button variant="success" disabled={busy || !valid || !(total > 0)} onClick={() => onCreate(invoiceLines)}>
          {busy ? 'Factuur maken…' : 'Maak conceptfactuur'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
