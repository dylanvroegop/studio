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

/**
 * Recursively removes empty fields from an object or array.
 * - Removes null, undefined, "", [], {} (unless specified otherwise)
 * - Preserves 0 and false
 */
export function removeEmptyFields(obj: any): any {
  if (obj === null || obj === undefined || obj === '') return undefined;

  if (Array.isArray(obj)) {
    const cleaned = obj.map(removeEmptyFields).filter(v => v !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = removeEmptyFields(obj[key]);
        if (value !== undefined) {
          cleaned[key] = value;
        }
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  return obj;
}
