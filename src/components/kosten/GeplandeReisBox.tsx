'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseScenarioAmount } from '@/lib/bank-cost-scenario';
import { calculateTravelBudget } from '@/lib/travel-budget';

const empty = { balance: '', travel: '', fixed: '', upfront: '', reserve: '', months: '' };
type Values = typeof empty;
const fields: Array<{ key: keyof Values; label: string; optional?: boolean }> = [
  { key: 'balance', label: 'Nu beschikbaar (€)' },
  { key: 'travel', label: 'Reiskosten per maand (€)' },
  { key: 'fixed', label: 'Doorlopende vaste lasten per maand (€)', optional: true },
  { key: 'upfront', label: 'Eenmalige kosten (€)', optional: true },
  { key: 'reserve', label: 'Reserve aanhouden (€)', optional: true },
  { key: 'months', label: 'Geplande reisduur (maanden)' },
];
const euro = (amount: number): string => amount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

export function GeplandeReisBox({ userId }: { userId: string }) {
  const key = `kosten-geplande-reis-v1:${userId}`;
  const [values, setValues] = useState<Values>(empty);
  const [restored, setRestored] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setRestored(null);
    setValues(empty);
    setStorageError(false);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved === 'object') {
        const next = { ...empty };
        for (const field of fields) if (typeof saved[field.key] === 'string') next[field.key] = saved[field.key];
        setValues(next);
      }
    } catch { setStorageError(true); }
    setRestored(key);
  }, [key]);
  useEffect(() => {
    if (restored !== key) return;
    try { localStorage.setItem(key, JSON.stringify(values)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [key, restored, values]);
  const parsed = Object.fromEntries(fields.map((field) => [field.key, values[field.key].trim() ? parseScenarioAmount(values[field.key]) : field.optional ? 0 : null])) as Record<keyof Values, number | null>;
  const ready = Object.values(parsed).every((value) => value !== null && value >= 0);
  const result = ready ? calculateTravelBudget({ startingBalance: parsed.balance!, monthlyTravel: parsed.travel!, monthlyFixed: parsed.fixed!, upfront: parsed.upfront!, reserve: parsed.reserve!, plannedMonths: parsed.months! }) : null;
  const invalid = fields.some((field) => values[field.key].trim() && (parsed[field.key] === null || parsed[field.key]! < 0));
  return <section className="min-w-0 rounded-lg border border-border bg-card p-4">
    <h2 className="mb-3 text-sm font-semibold">Geplande reis</h2>
    {restored !== key ? <p className="text-sm text-muted-foreground">Laden…</p> : <div className="space-y-3">
      {fields.map((field) => <div key={field.key} className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`planned-trip-${field.key}`} className="text-sm">{field.label}</label>
        <Input id={`planned-trip-${field.key}`} type="text" inputMode="decimal" className="h-8 w-28 text-right tabular-nums" value={values[field.key]} aria-invalid={Boolean(values[field.key].trim()) && (parsed[field.key] === null || parsed[field.key]! < 0)} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
      </div>)}
      {invalid ? <p role="alert" className="text-xs text-destructive">Vul bedragen en een reisduur van 0 of hoger in.</p> : null}
      <table className="w-full text-sm"><tbody>
        {[
          ['Totaal per maand', result ? euro(result.monthlyTotal) : '—'],
          ['Beschikbaar na eenmalige kosten en reserve', result ? euro(result.available) : '—'],
          ['Hoe lang kan ik reizen?', result?.affordableMonths != null ? `≈ ${result.affordableMonths.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} maanden` : '—'],
          ['Kosten geplande reis', result ? euro(result.plannedCost) : '—'],
          ['Over na geplande reis', result ? euro(result.remaining) : '—'],
          ['Tekort om reserve te behouden', result ? euro(result.shortage) : '—'],
        ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className="px-3 py-2 text-right tabular-nums">{value}</td></tr>)}
      </tbody></table>
      {storageError ? <p role="alert" className="text-xs text-destructive">Reisplan kon niet op dit apparaat worden opgeslagen.</p> : null}
    </div>}
  </section>;
}
