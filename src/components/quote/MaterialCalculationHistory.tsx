'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { buildMaterialComparisonRows } from '@/lib/material-comparison';
import { Calculator, Loader2, Trash2 } from 'lucide-react';
import { useUser } from '@/firebase/provider';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency, type DataJson, type MaterialItem } from '@/lib/quote-calculations';

interface HistoryRow { number?: number; id: string; savedAt: string; data: DataJson }
interface Props {
    quoteId: string;
    current: DataJson;
    running: boolean;
    onCalculate: () => Promise<boolean>;
    onStop: () => Promise<void>;
    stopping: boolean;
    canStop: boolean;
}

function subtotal(items: MaterialItem[] = []): number {
    return items.reduce((sum, item) => sum + Number(item.aantal || 0) * Number(item.prijs_per_stuk || 0), 0);
}

function explanation(item: MaterialItem): string {
    const value = item.hoe_berekend || item.toelichting || item.berekening;
    return typeof value === 'string' ? value : value ? JSON.stringify(value) : 'Geen berekenuitleg beschikbaar.';
}

export function MaterialCalculationHistory({ quoteId, current, running, onCalculate, onStop, stopping, canStop }: Props) {
    const { user } = useUser();
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [loading, setLoading] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
        if (!user) return;
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/quotes/material-history', {
                method: 'POST', signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({ quoteId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            if (!signal?.aborted) setHistory(result.rows);
        } catch (err) {
            if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Laden mislukt.');
        } finally { if (!signal?.aborted) setLoading(false); }
    }, [quoteId, user]);
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [open, running, load]);
    const previousColumns = history.map((row, index) => ({
        id: row.id,
        label: `Stand ${row.number ?? history.length - index}`,
        savedAt: row.savedAt,
        data: row.data as DataJson | undefined,
    })).reverse();
    const removeHistory = async (): Promise<void> => {
        if (!user || !deleteTarget || deleting) return;
        setDeleting(true);
        setDeleteError('');
        try {
            const response = await fetch('/api/quotes/material-history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({ quoteId, historyId: deleteTarget.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            setHistory(previous => previous.filter(row => row.id !== deleteTarget.id));
            setDeleteTarget(null);
            await load();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Verwijderen mislukt.');
        } finally { setDeleting(false); }
    };
    const detailColumns = [
        ...(previousColumns.length ? previousColumns : [{ id: 'empty', label: 'Eerdere stand', savedAt: '', data: undefined }]),
        { id: 'current', label: 'Huidige calculatie', savedAt: '', data: current },
    ];
    const start = async (): Promise<void> => {
        if (starting || running) return;
        setStarting(true);
        try {
            if (await onCalculate()) { await load(); }
        } finally { setStarting(false); }
    };
    const total = (data: DataJson): number => subtotal(data.grootmaterialen) + subtotal(data.verbruiksartikelen);
    return <>
        <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Calculator className="mr-2 h-4 w-4" /> Opnieuw calculeren
            </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-7xl">
                <DialogHeader>
                    <DialogTitle>Calculaties vergelijken</DialogTitle>
                    <DialogDescription>Een nieuwe calculatie vervangt alle grootmaterialen en het kleinmateriaal. Eerdere standen blijven hier bewaard. Bedragen zijn exclusief btw.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Alle standen naast elkaar. Scroll horizontaal om ze te vergelijken.</p>
                    <Button disabled={running || starting || loading || !!error} onClick={() => void start()}>
                        {(running || starting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {running || starting ? 'Berekening loopt…' : 'Nieuwe calculatie'}
                    </Button>
                </div>
                {canStop && <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" disabled={stopping} onClick={() => void onStop()}>{stopping ? 'Stoppen…' : 'Wachten stoppen'}</Button>
                    <span className="text-xs text-muted-foreground">Stop het wachten bij een fout in n8n. Daarna kun je opnieuw calculeren.</span>
                </div>}
                {running && <p role="status" className="text-sm text-muted-foreground">De huidige materialen blijven zichtbaar tot de nieuwe berekening klaar is.</p>}
                {loading && <p role="status" className="text-sm">Historie laden…</p>}
                {error && <div role="alert" className="text-sm text-destructive">{error} <Button variant="outline" size="sm" onClick={() => void load()}>Opnieuw laden</Button></div>}
                <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm tabular-nums">
                        <thead className="bg-muted/30">
                            <tr className="border-b">
                                <th scope="col" className="p-3 text-left align-top">Materiaal</th>
                                {detailColumns.map(column => <th key={column.id} scope="col"
                                    className={`min-w-40 p-3 text-right align-top ${column.id === 'current' ? 'bg-muted/40' : ''}`}>
                                    <span className="flex items-center justify-end gap-2 font-semibold">{column.label}
                                        {column.savedAt && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`${column.label} verwijderen`}
                                            onClick={() => { setDeleteError(''); setDeleteTarget({ id: column.id, label: column.label }); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>}
                                    </span>
                                    {column.savedAt && <span className="mt-1 block whitespace-nowrap text-xs font-normal text-muted-foreground">{new Date(column.savedAt).toLocaleString('nl-NL')}</span>}
                                </th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {(['grootmaterialen', 'verbruiksartikelen'] as const).map(key => <tr key={key} className="border-b">
                                <th scope="row" className="p-3 text-left font-normal">{key === 'grootmaterialen' ? 'Grootmaterialen' : 'Kleinmateriaal'}</th>
                                {detailColumns.map(column => <td key={column.id}
                                    className={`whitespace-nowrap p-3 text-right ${column.id === 'current' ? 'bg-muted/20' : ''}`}>
                                    {column.data ? formatCurrency(subtotal(column.data[key])) : '—'}
                                </td>)}
                            </tr>)}
                            <tr className="font-semibold">
                                <th scope="row" className="p-3 text-left">Totaal</th>
                                {detailColumns.map(column => <td key={column.id}
                                    className={`whitespace-nowrap p-3 text-right ${column.id === 'current' ? 'bg-muted/20' : ''}`}>
                                    {column.data ? formatCurrency(total(column.data)) : '—'}
                                </td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
                {(['grootmaterialen', 'verbruiksartikelen'] as const).map(category => {
                    const rows = buildMaterialComparisonRows(detailColumns.map(column => column.data?.[category]));
                    return <section key={category} className="space-y-2">
                        <h3 className="text-sm font-semibold">{category === 'grootmaterialen' ? 'Grootmaterialen' : 'Kleinmateriaal'} — aantallen en berekenuitleg</h3>
                        <div className="overflow-x-auto rounded-md border border-border">
                            <table className="w-full text-sm tabular-nums">
                                <thead className="bg-muted/30">
                                    <tr className="border-b">
                                        <th scope="col" rowSpan={2} className="sticky left-0 z-10 min-w-56 bg-card p-3 text-left align-bottom">Materiaal</th>
                                        {detailColumns.map(column => <th key={column.id} scope="colgroup" colSpan={2}
                                            className={`border-l p-3 text-center ${column.id === 'current' ? 'bg-muted/40' : ''}`}>{column.label}</th>)}
                                    </tr>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        {detailColumns.map(column => <Fragment key={column.id}>
                                            <th scope="col" className="min-w-24 border-l px-3 py-2 text-right">Aantal</th>
                                            <th scope="col" className="min-w-28 px-3 py-2 text-right">Bedrag</th>
                                        </Fragment>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => {
                                        const quantities = row.cells.map(items => items?.reduce((sum, item) => sum + Number(item.aantal || 0), 0));
                                        const amounts = row.cells.map(items => items ? subtotal(items) : undefined);
                                        const available = detailColumns.flatMap((column, index) => column.data ? [index] : []);
                                        const quantityChanged = new Set(available.map(index => quantities[index])).size > 1;
                                        const amountChanged = new Set(available.map(index => amounts[index]?.toFixed(2))).size > 1;
                                        return <Fragment key={row.key}>
                                            <tr className="border-b align-top">
                                                <th scope="row" className="sticky left-0 z-10 min-w-56 max-w-sm bg-card p-3 text-left font-normal leading-relaxed">
                                                    {row.product}
                                                    <span className="mt-1 block text-xs text-muted-foreground">{row.unit}</span>
                                                </th>
                                                {detailColumns.map((column, index) => <Fragment key={column.id}>
                                                    <td className={`border-l p-3 text-right text-base font-semibold ${quantityChanged && column.data ? 'bg-amber-500/10' : ''}`}>
                                                        {quantities[index] === undefined ? '—' : quantities[index].toLocaleString('nl-NL', { maximumFractionDigits: 3 })}
                                                    </td>
                                                    <td className={`whitespace-nowrap p-3 text-right ${amountChanged && column.data ? 'bg-amber-500/10' : ''}`}>
                                                        {amounts[index] === undefined ? '—' : formatCurrency(amounts[index])}
                                                    </td>
                                                </Fragment>)}
                                            </tr>
                                            <tr className="border-b">
                                                <td colSpan={1 + detailColumns.length * 2} className="px-3 py-1.5">
                                                    <details className="text-xs">
                                                        <summary className="w-fit cursor-pointer text-muted-foreground">Berekenuitleg <span className="sr-only">voor {row.product}</span></summary>
                                                        <div className="grid gap-4 py-3" style={{ gridTemplateColumns: `repeat(${detailColumns.length}, minmax(200px, 1fr))` }}>
                                                            {detailColumns.map((column, index) => <div key={column.id} className="min-w-0">
                                                                <p className="mb-1 font-semibold">{column.label}</p>
                                                                {row.cells[index]?.map((item, itemIndex) => <p key={itemIndex} className="mb-2 whitespace-pre-wrap break-words text-muted-foreground">{explanation(item)}</p>)}
                                                            </div>)}
                                                        </div>
                                                    </details>
                                                </td>
                                            </tr>
                                        </Fragment>;
                                    })}
                                    {!rows.length && <tr><td colSpan={1 + detailColumns.length * 2} className="p-3 text-muted-foreground">Geen materialen.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>;
                })}
                <p className="text-xs text-muted-foreground">Gemarkeerde cellen verschillen tussen de standen. — betekent dat het materiaal of de eerdere stand ontbreekt.</p>
            </DialogContent>
        </Dialog>
        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={value => { if (!value && !deleting) setDeleteTarget(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{deleteTarget?.label} verwijderen?</AlertDialogTitle>
                    <AlertDialogDescription>Deze oude stand verdwijnt uit de vergelijking. De huidige calculatie blijft behouden.</AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
                    <Button variant="destructive" disabled={deleting} onClick={() => void removeHistory()}>{deleting ? 'Verwijderen…' : 'Verwijderen'}</Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>;
}
