'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { QuoteAmountComparison } from '@/lib/quote-shared-amount';

const currency = (cents: number): string => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export function QuoteAmountDifferenceDialog({ comparison, onCancel, onConfirm, onAdjust }: {
  comparison: QuoteAmountComparison | null;
  onCancel: () => void;
  onConfirm: () => void;
  onAdjust: () => void;
}): JSX.Element {
  return <Dialog open={!!comparison} onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Weet je het zeker?</DialogTitle>
        <DialogDescription>Het bedrag wijkt af van de offerte die je via WhatsApp hebt gedeeld.</DialogDescription>
      </DialogHeader>
      {comparison && <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt>Gedeelde offerte incl. btw</dt><dd className="whitespace-nowrap">{currency(comparison.sharedAmountCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Eindfactuur + gefactureerd voorschot</dt><dd className="whitespace-nowrap">{currency(comparison.invoiceTotalCents)}</dd></div>
        <div className="flex justify-between gap-3 border-t pt-2 font-medium"><dt>Verschil</dt><dd className="whitespace-nowrap">{currency(Math.abs(comparison.differenceCents))} {comparison.differenceCents > 0 ? 'hoger' : 'lager'}</dd></div>
      </dl>}
      <DialogFooter className="gap-2 sm:flex-wrap">
        <Button variant="outline" onClick={onCancel}>Nee, terug</Button>
        <Button variant="outline" onClick={onAdjust}>Aanpassen</Button>
        <Button onClick={onConfirm}>Ja, maak factuur</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
