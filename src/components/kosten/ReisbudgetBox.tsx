'use client';

import { useEffect, useState } from 'react';
import { GeplandeReisBox } from './GeplandeReisBox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseScenarioAmount } from '@/lib/bank-cost-scenario';
import { calculateTravelBudget } from '@/lib/travel-budget';

interface Props { userId: string; balance: number | null; scenarioBalance: number | null; potentialBalance: number | null; scenarioMonthly: number | null; potentialMonthly: number | null }
interface Settings { potentialSource: string; source: string; own: string; travel: string; fixed: string; upfront: string; reserve: string; months: string }
const defaults: Settings = { potentialSource: 'potential', source: 'scenario', own: '', travel: '', fixed: '', upfront: '', reserve: '', months: '6' };
const euro = (amount: number): string => amount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

export function ReisbudgetBox({ userId, balance, scenarioBalance, potentialBalance, scenarioMonthly, potentialMonthly }: Props) {
  const storageKey = `kosten-reisbudget-v1:${userId}`;
  const [settings, setSettings] = useState<Settings>(defaults);
  const [restored, setRestored] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setRestored(null);
    setSettings(defaults);
    setStorageError(false);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        const next = { ...defaults };
        for (const key of Object.keys(defaults) as Array<keyof Settings>) if (typeof saved[key] === 'string') next[key] = saved[key];
        if (!['scenario', 'scenario-monthly'].includes(next.source)) next.source = defaults.source;
        if (!['potential', 'potential-monthly'].includes(next.potentialSource)) next.potentialSource = 'potential';
        setSettings(next);
      }
    } catch { setStorageError(true); }
    setRestored(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (restored !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [settings, restored, storageKey]);
  const amount = (key: keyof Settings, optional = false): number | null => settings[key].trim() ? parseScenarioAmount(settings[key]) : optional ? 0 : null;
  const renderBudget = (potential: boolean) => {
    const source = potential ? settings.potentialSource : settings.source;
    const prefix = potential ? 'travel-potential' : 'travel';
    const start = source === 'scenario-monthly' ? scenarioMonthly : source === 'potential-monthly' ? potentialMonthly : source === 'bank' ? balance : source === 'potential' ? potentialBalance : source === 'own' ? amount('own') : scenarioBalance;
    const travel = amount('travel');
    const fixed = amount('fixed', true);
    const result = start !== null && travel !== null && fixed !== null
      ? calculateTravelBudget({ startingBalance: start, monthlyTravel: travel, monthlyFixed: fixed, upfront: 0, reserve: 0, plannedMonths: 0 }) : null;
    const fields: Array<{ key: keyof Settings; label: string; unit: string; optional?: boolean }> = [
      { key: 'travel', label: 'Reiskosten per maand', unit: '€' },
      { key: 'fixed', label: 'Doorlopende vaste lasten per maand', unit: '€', optional: true },
    ];
    const invalid = fields.some(({ key, optional }) => {
      const value = amount(key, optional);
      return settings[key].trim() !== '' && (value === null || value < 0);
    });
    return <section className="min-w-0 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{potential ? 'Verdienen en reizen · potentieel' : 'Verdienen en reizen'}</h2>
      {restored !== storageKey ? <p className="text-sm text-muted-foreground">Reisbudget laden…</p> : <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${prefix}-source`} className="text-sm">Bedrag excl. 21% btw</label>
          <Select value={source} onValueChange={(source) => setSettings((current) => ({ ...current, [potential ? 'potentialSource' : 'source']: source }))}>
            <SelectTrigger id={`${prefix}-source`} className="h-9 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              {potential ? <>
                <SelectItem value="potential">Potentieel totaal excl. 21% btw</SelectItem>
                <SelectItem value="potential-monthly">Potentieel per maand excl. 21% btw</SelectItem>
              </> : <>
                <SelectItem value="scenario">Saldo met besparing excl. 21% btw</SelectItem>
                <SelectItem value="scenario-monthly">Gemiddeld per maand excl. 21% btw</SelectItem>
              </>}
            </SelectContent>
          </Select>
        </div>
        <p className="text-right text-sm font-semibold tabular-nums">{start === null ? 'n.b.' : euro(start)}</p>
        {fields.map(({ key, label, unit, optional }) => {
          const value = amount(key, optional);
          const invalidField = Boolean(settings[key].trim()) && (value === null || value < 0);
          return <div key={key} className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${prefix}-${key}`} className="text-sm">{label}</label>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{unit}</span><Input id={`${prefix}-${key}`} type="text" inputMode="decimal" className="h-8 w-28 text-right tabular-nums" placeholder={optional ? '0,00' : 'Invullen'} value={settings[key]} aria-invalid={invalidField} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} /></div>
          </div>;
        })}
        {invalid ? <p role="alert" className="text-xs text-destructive">Vul bedragen van 0 of hoger in.</p> : null}
        {start !== null && start < 0 ? <p role="alert" className="text-xs text-destructive">Het startbedrag is negatief.</p> : null}
        <table className="w-full text-sm"><tbody>
          {[
            ['Verdiensten per maand excl. 21% btw', (potential ? potentialMonthly : scenarioMonthly) === null ? 'n.b.' : euro((potential ? potentialMonthly : scenarioMonthly)!)],
            ['Reisuitgaven per maand', result ? euro(result.monthlyTotal) : 'n.b.'],
            [source.endsWith('-monthly') ? 'Reisduur per maand verdienen' : 'Reisduur met totaalbedrag', result?.affordableMonths != null ? `≈ ${result.affordableMonths.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} maanden` : 'Vul maandelijkse kosten in'],
          ].map(([label, value]) => <tr key={label} className="border-b border-border/50"><td className="px-3 py-2">{label}</td><td className="px-3 py-2 text-right tabular-nums">{value}</td></tr>)}
        </tbody></table>
        {source !== 'bank' && source !== 'own' ? <p className="text-xs text-muted-foreground">Startbedrag is een berekend scenario.</p> : null}
        {storageError ? <p role="alert" className="text-xs text-destructive">Reisbudget kon niet op dit apparaat worden opgeslagen.</p> : null}
      </div>}
    </section>;
  };
  return <div className="grid min-w-0 items-start gap-4 lg:col-span-2 lg:grid-cols-2">
    {renderBudget(false)}
    {renderBudget(true)}
    <GeplandeReisBox userId={userId} />
  </div>;
}
