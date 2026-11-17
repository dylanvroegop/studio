'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { addInvoiceExtraWork } from '@/lib/invoice-extra-work';
import { parsePriceToNumber } from '@/lib/utils';
import type { Invoice } from '@/lib/types';

const currency = (value: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

export function InvoiceExtraWork({ invoice }: { invoice: Invoice }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vatRate, setVatRate] = useState(() => {
    const rate = Number(invoice.calculationSnapshot?.instellingen?.btwTarief ?? 21);
    return [0, 9, 21].includes(rate) ? rate : 21;
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const parsedAmount = parsePriceToNumber(amount);
  const validAmount = parsedAmount !== null && Number.isFinite(parsedAmount) && Math.round(parsedAmount * 100) > 0;
  const cancelled = invoice.status === 'geannuleerd';

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || !firestore || !user || cancelled) return;
    if (!validAmount || parsedAmount === null || !description.trim()) {
      toast({ title: 'Vul bedrag en uitleg in', variant: 'destructive' });
      return;
    }
    const key = JSON.stringify([invoice.id, parsedAmount, description.trim(), vatRate]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    savingRef.current = true;
    setSaving(true);
    try {
      await addInvoiceExtraWork(firestore, invoice.id, user.uid, {
        id: pending.current.id, amountInclBtw: parsedAmount, description, vatRate,
      });
      setAmount('');
      setDescription('');
      pending.current = null;
      toast({ title: 'Meerwerk toegevoegd', description: 'Het factuurbedrag en openstaande saldo zijn bijgewerkt.' });
    } catch (error) {
      toast({ title: 'Opslaan mislukt', description: error instanceof Error ? error.message : 'Probeer het opnieuw.', variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Betaling toevoegen</CardTitle>
          <p className="text-sm text-muted-foreground">Extra afgesproken werk toevoegen aan de factuur, ook zonder bon.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
              <div className="space-y-2">
                <Label htmlFor="extra-work-amount">Bedrag (incl. BTW)</Label>
                <Input id="extra-work-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="bijv. 150,00" disabled={saving || cancelled} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra-work-vat">BTW</Label>
                <Select value={String(vatRate)} onValueChange={(value) => setVatRate(Number(value))} disabled={saving || cancelled}>
                  <SelectTrigger id="extra-work-vat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="21">21%</SelectItem>
                    <SelectItem value="9">9%</SelectItem>
                    <SelectItem value="0">0%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra-work-description">Uitleg</Label>
              <Textarea id="extra-work-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="bijv. Extra plint geplaatst, mondeling afgesproken" maxLength={2000} className="min-h-[90px]" disabled={saving || cancelled} required />
            </div>
            {validAmount && parsedAmount !== null ? (
              <div className="flex flex-wrap justify-between gap-2 text-sm" aria-live="polite">
                <span>Nieuw totaal: <strong>{currency(invoice.totalsSnapshot.totaalInclBtw + parsedAmount)}</strong></span>
                <span>Openstaand: <strong>{currency(Math.max(0, invoice.totalsSnapshot.totaalInclBtw + parsedAmount - (invoice.paymentSummary?.paidAmount ?? 0)))}</strong></span>
              </div>
            ) : null}
            <Button type="submit" variant="success" disabled={saving || cancelled || !validAmount || !description.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Bedrag toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>
      {invoice.extraWork?.length ? (
        <Card>
          <CardHeader className="pb-4"><CardTitle>Toegevoegd meerwerk</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {invoice.extraWork.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{item.description}</p>
                <span className="shrink-0 text-sm font-semibold">+ {currency(item.amountInclBtw)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
