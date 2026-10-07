import { z } from 'zod';

export const paymentRequestInput = z.union([z.object({
  kind: z.literal('custom').default('custom'),
  requestId: z.string().uuid(),
  amountCents: z.number().int().min(1).max(100000000),
  description: z.string().trim().min(1).max(255),
}), z.object({
  kind: z.enum(['upfront', 'final', 'sync']),
  expectedTotalCents: z.number().int().min(0).max(200000000),
})]);

export type PaymentRequestKind = 'upfront' | 'final' | 'custom';

export function splitPaymentTotal(totalCents: number): { upfront: number; final: number } {
  const upfront = Math.round(totalCents / 2);
  return { upfront, final: totalCents - upfront };
}

export function paymentInstallmentAmounts(totalCents: number, items: Pick<PaymentRequestView, 'kind' | 'paidAt' | 'amountCents'>[]): { upfront: number; final: number } {
  const upfront = items.find(item => item.kind === 'upfront' && item.paidAt);
  const final = items.find(item => item.kind === 'final' && item.paidAt);
  const split = splitPaymentTotal(totalCents);
  return {
    upfront: upfront?.amountCents ?? (final ? Math.max(0, totalCents - final.amountCents) : split.upfront),
    final: final?.amountCents ?? (upfront ? Math.max(0, totalCents - upfront.amountCents) : split.final),
  };
}

export function quotePaymentTotalCents(quote: Record<string, unknown>): number {
  const values = [quote.totaalbedrag, quote.amount];
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return Math.round(amount * 100);
  }
  return 0;
}

export interface PaymentRequestView {
  id: string;
  amountCents: number;
  description: string;
  url: string;
  mode: 'test' | 'live';
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  kind?: PaymentRequestKind;
  quoteTotalCents?: number;
}

export function parsePaymentAmount(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000 ? cents : null;
}

export function paymentRequestStatus(item: PaymentRequestView): string {
  if (item.paidAt) return 'Betaald';
  if (item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) return 'Verlopen';
  return 'Openstaand';
}
