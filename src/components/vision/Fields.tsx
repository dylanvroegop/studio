'use client';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
export const inputClass =
  'min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';
export const grid = 'grid min-w-0 gap-3 sm:grid-cols-2';
export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="min-w-0 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}
export function Details({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="min-w-0 rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{title}</summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 content-start gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Text({
  label,
  value,
  onChange,
  area = false,
  type = 'text',
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  type?: string;
  max?: number;
}) {
  return (
    <Field label={label}>
      {area ? (
        <textarea
          className={inputClass}
          rows={3}
          maxLength={max ?? 24000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          type={type}
          maxLength={max ?? 250}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  max = 1e9,
  min = 0,
  slider,
  step = 0.01,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  max?: number;
  min?: number;
  slider?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Field label={label}>
        <input
          className={inputClass + ' tabular-nums'}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          placeholder="Onbekend"
          value={value ?? ''}
          onChange={(e) => {
            if (!e.target.value) return onChange(null);
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v >= min && v <= max && (step !== 1 || Number.isInteger(v)))
              onChange(v);
          }}
        />
      </Field>
      {slider !== undefined && (
        <input
          type="range"
          className="h-6 w-full accent-emerald-500"
          aria-label={label + ' schuifregelaar'}
          min={min}
          max={Math.max(slider, value ?? 0)}
          step={step === 1 ? 1 : slider >= 1000 ? 50 : 0.5}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-emerald-500"
      />
      {label}
    </label>
  );
}
export function Metric({ name, value, detail }: { name: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{name}</div>
      <div className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</div>
      {detail && <small className="text-muted-foreground">{detail}</small>}
    </div>
  );
}
