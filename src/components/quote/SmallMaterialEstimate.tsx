'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/quote-calculations';

interface SmallMaterialEstimateProps {
    amount: number;
    onSave: (amount: number) => Promise<void>;
}

export function SmallMaterialEstimate({ amount, onSave }: SmallMaterialEstimateProps) {
    const [value, setValue] = useState(amount.toFixed(2).replace('.', ','));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { setValue(amount.toFixed(2).replace('.', ',')); }, [amount]);
    const parsed = value.trim() ? Number(value.trim().replace(',', '.')) : NaN;
    const changed = Number.isFinite(parsed) && parsed >= 0 && Math.abs(parsed - amount) >= 0.005;
    const save = async (): Promise<void> => {
        if (!changed) return;
        setSaving(true);
        setError('');
        try { await onSave(parsed); }
        catch { setError('Bedrag kon niet worden opgeslagen. Probeer opnieuw.'); }
        finally { setSaving(false); }
    };
    return (
        <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">Klein materiaal</h3>
                    <p className="text-sm text-muted-foreground">Dit zou het ongeveer kosten voor klein materiaal.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input aria-label="Schatting klein materiaal excl. btw" inputMode="decimal" value={value}
                        onChange={(event) => setValue(event.target.value)} disabled={saving}
                        className="w-28 text-right" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }} />
                    <span className="text-xs text-muted-foreground">excl. btw</span>
                    {changed && <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? 'Opslaan…' : 'Opslaan'}</Button>}
                </div>
            </div>
            {(!Number.isFinite(parsed) || parsed < 0) && <p role="alert" className="mt-2 text-sm text-red-500">Vul een geldig bedrag vanaf € 0 in.</p>}
            {error && <p role="alert" className="mt-2 text-sm text-red-500">{error} Opgeslagen: {formatCurrency(amount)}.</p>}
        </section>
    );
}
