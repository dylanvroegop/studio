'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  emptySubsidyMeasure, getSubsidyQuestions, invoiceSubsidySchema, subsidyFields,
  subsidyMeasureSchema, type SubsidyField, type SubsidyMeasure, type SubsidyQuestion,
} from '@/lib/invoice-subsidy';
import type { InvoiceType } from '@/lib/types';

function reviewKey(rows: SubsidyMeasure[]): string {
  return JSON.stringify(rows.map(({ material, application, thickness, insulationValue }) =>
    [material, application, thickness, insulationValue]));
}

interface Props {
  user: User;
  quoteId: string;
  type: InvoiceType;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  measures: SubsidyMeasure[];
  setMeasures: Dispatch<SetStateAction<SubsidyMeasure[]>>;
  setReviewing: (reviewing: boolean) => void;
  disabled: boolean;
}

export function InvoiceSubsidyFields({
  user, quoteId, type, enabled, setEnabled, measures, setMeasures, setReviewing, disabled,
}: Props) {
  const [reviewing, setLocalReviewing] = useState(false);
  const [questions, setQuestions] = useState<SubsidyQuestion[]>([]);
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lastReviewed = useRef('');
  const latestMeasures = useRef(measures);
  latestMeasures.current = measures;
  const schemaValid = invoiceSubsidySchema.safeParse(measures).success;
  const missing = getSubsidyQuestions(measures, type);

  useEffect(() => {
    setQuestions([]);
    setStatus('');
    if (!enabled) return;
    const input = invoiceSubsidySchema.safeParse(latestMeasures.current);
    if (!input.success || !getSubsidyQuestions(input.data, type).length) return;
    const controller = new AbortController();
    lastReviewed.current = reviewKey(input.data);
    setLocalReviewing(true);
    setReviewing(true);
    void (async () => {
      try {
        const response = await fetch('/api/facturen/subsidie', {
          method: 'POST',
          headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteId, type, measures: input.data }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const result = invoiceSubsidySchema.safeParse(payload.measures);
        if (!response.ok || !result.success || !Array.isArray(payload.questions)) throw new Error('Beoordeling mislukt');
        setMeasures((current) => current.map((measure, index) => {
          const original = input.data[index];
          const code = result.data[index]?.code;
          if (!code || measure.code || !original || measure.material !== original.material
            || measure.application !== original.application || measure.thickness !== original.thickness
            || measure.insulationValue !== original.insulationValue) return measure;
          return { ...measure, code };
        }));
        setQuestions(payload.questions);
        setStatus([payload.aiAvailable === false ? 'AI-beoordeling tijdelijk niet beschikbaar.' : '',
          payload.catalogAvailable === false ? 'De RVO-meldcodelijst was tijdelijk onbereikbaar.' : ''].filter(Boolean).join(' '));
      } catch {
        if (!controller.signal.aborted) setStatus('Automatische beoordeling tijdelijk niet beschikbaar.');
      } finally {
        if (!controller.signal.aborted) {
          setLocalReviewing(false);
          setReviewing(false);
        }
      }
    })();
    return () => {
      controller.abort();
      setLocalReviewing(false);
      setReviewing(false);
    };
  }, [attempt, enabled, quoteId, setMeasures, setReviewing, type, user]);

  function reviewWhenChanged(): void {
    if (!reviewing && missing.length > 0 && schemaValid && reviewKey(measures) !== lastReviewed.current) {
      setAttempt((value) => value + 1);
    }
  }

  function update(index: number, field: SubsidyField, value: string) {
    setMeasures((current) => current.map((measure, position) => {
      if (position !== index) return measure;
      const affectsCode = field === 'material' || field === 'application' || field === 'thickness' || field === 'insulationValue';
      return { ...measure, [field]: value, ...(affectsCode && value !== measure[field] ? { code: '' } : {}) };
    }));
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="invoice-isde">ISDE-gegevens op factuur</Label>
        <Switch id="invoice-isde" checked={enabled} disabled={disabled} onCheckedChange={(value) => {
          if (value && !measures.length) setMeasures([emptySubsidyMeasure()]);
          setEnabled(value);
        }} />
      </div>
      {enabled && <>
        {type === 'voorschot' && <p className="text-xs text-muted-foreground">De gegevens komen als geplande werkzaamheden op de voorschotfactuur.</p>}
        {reviewing && <p className="text-xs text-muted-foreground" role="status">Subsidiegegevens controleren…</p>}
        {status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
        {measures.map((measure, index) => (
          <fieldset key={index} disabled={disabled} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{measure.material || `Maatregel ${index + 1}`}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {subsidyFields(measure, type).map(({ field, label }) => {
                const id = `invoice-subsidy-${index}-${field}`;
                const fallback = missing.find((item) => item.index === index && item.field === field);
                const question = fallback && (questions.find((item) => item.index === index && item.field === field)?.question || fallback.question);
                const invalid = !subsidyMeasureSchema.shape[field].safeParse(measure[field]).success;
                return (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={id}>{label}</Label>
                    <Input id={id} value={measure[field]} onChange={(event) => update(index, field, event.target.value)}
                      onBlur={['material', 'application', 'thickness', 'insulationValue'].includes(field) ? reviewWhenChanged : undefined}
                      type={field === 'purchaseDate' || field === 'installationDate' ? 'date' : 'text'}
                      inputMode={['area', 'plannedArea', 'thickness', 'insulationValue', 'amount'].includes(field) ? 'decimal' : undefined}
                      aria-invalid={invalid} aria-describedby={question || invalid ? `${id}-help` : undefined} />
                    {(question || invalid) && <p id={`${id}-help`} className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      {invalid ? field === 'code' ? 'Gebruik een meldcode zoals KA12345.' : 'Controleer de invoer.' : question}
                    </p>}
                  </div>
                );
              })}
            </div>
            {measures.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={reviewing}
              onClick={() => { setQuestions([]); setMeasures((current) => current.filter((_, position) => position !== index)); }}>Verwijder maatregel</Button>}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || reviewing || measures.length >= 20}
            onClick={() => setMeasures((current) => [...current, emptySubsidyMeasure()])}>Maatregel toevoegen</Button>
          {missing.length > 0 && <Button type="button" variant="outline" size="sm" disabled={disabled || reviewing || !schemaValid}
            onClick={() => setAttempt((value) => value + 1)}>Gegevens opnieuw controleren</Button>}
          <a className="text-xs underline" href="https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten" target="_blank" rel="noreferrer">RVO-meldcodelijsten</a>
        </div>
      </>}
    </div>
  );
}
