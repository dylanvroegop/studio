'use client';

import { compareSharedQuoteAmount, readSharedQuoteAmount } from '@/lib/quote-shared-amount';
import { formatCurrency } from '@/lib/quote-calculations';

export function SharedQuoteAmountBar({ snapshot, currentAmount }: { snapshot?: unknown; currentAmount: number }): JSX.Element {
  const shared = readSharedQuoteAmount(snapshot);
  const comparison = compareSharedQuoteAmount(shared, currentAmount, 0);
  return <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
      <span className="text-muted-foreground">Offertebedrag bij WhatsApp-delen</span>
      <strong className="whitespace-nowrap">{shared ? formatCurrency(shared.amountCents / 100) : 'Nog niet vastgelegd'}</strong>
    </div>
    {shared && <p className="mt-1 text-xs text-muted-foreground">Incl. btw · {new Date(shared.sharedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</p>}
    {comparison && comparison.differenceCents !== 0 && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Huidig bedrag is {formatCurrency(Math.abs(comparison.differenceCents) / 100)} {comparison.differenceCents > 0 ? 'hoger' : 'lager'}.</p>}
  </div>;
}
