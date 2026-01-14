import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parsePriceToNumber(raw: unknown): number | null {
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
