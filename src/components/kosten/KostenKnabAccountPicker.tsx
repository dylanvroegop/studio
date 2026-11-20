'use client';

import { useId } from 'react';

import type { KnabCostAccount } from '@/lib/finance-bank-ledger';

interface Props {
  accounts: KnabCostAccount[];
  selectedIban: string;
  onSelect: (iban: string) => void;
}

export function KostenKnabAccountPicker({ accounts, selectedIban, onSelect }: Props) {
  const group = useId();

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">Knab-rekening voor kosten</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map(({ iban, name }) => (
          <label key={iban} className="flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 has-[:checked]:border-emerald-500">
            <input
              type="radio"
              name={group}
              value={iban}
              checked={selectedIban === iban}
              onChange={() => onSelect(iban)}
              className="h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{name}</span>
              <span className="block break-words text-sm tabular-nums text-muted-foreground">{iban.match(/.{1,4}/g)?.join(' ') || iban}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
