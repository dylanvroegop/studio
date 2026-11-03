'use client';

import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useUser } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SCOPE_COST_LABELS } from '@/lib/quote-scope-costs';
import { formatCurrency, type DataJson } from '@/lib/quote-calculations';
import { finitePreviewNumber, type MaterialCalculationPreview, type PreviewMaterial } from '@/lib/material-calculation-preview';

const quantity = (value: number | null) => value === null ? 'Onbekend' : value.toLocaleString('nl-NL', { maximumFractionDigits: 3 });
const money = (value: number | null) => value === null ? 'Onbekend' : formatCurrency(value);
const amount = (item: PreviewMaterial) => item.aantal === null || item.prijs_per_stuk === null ? null : item.aantal * item.prijs_per_stuk;
const key = (item: PreviewMaterial) => JSON.stringify([item.product.trim().toLocaleLowerCase('nl-NL'), item.eenheid.trim().toLocaleLowerCase('nl-NL')]);
function sumKnown(values: (number | null)[]): number | null {
    return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function MaterialCalculationTest({ quoteId, current, disabled }: { quoteId: string; current: DataJson; disabled: boolean }) {
    const { user } = useUser();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<MaterialCalculationPreview | null>(null);
    const [baselineSmall, setBaselineSmall] = useState<number | null>(null);
    const [baseline, setBaseline] = useState<PreviewMaterial[]>([]);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => { setOpen(false); setResult(null); setError(''); setLoading(false); return () => controller.current?.abort(); }, [quoteId]);
    const run = async (): Promise<void> => {
        if (!user || controller.current || disabled) return;
        const abort = new AbortController();
        controller.current = abort;
        setOpen(true); setLoading(true); setError(''); setResult(null);
        const smallRows = (current.verbruiksartikelen || []).filter(item => !Object.values(SCOPE_COST_LABELS).some(label => label.toLowerCase() === item.product?.trim().toLowerCase()));
        setBaselineSmall(smallRows.length ? sumKnown(smallRows.map(item => {
            const count = finitePreviewNumber(item.aantal), price = finitePreviewNumber(item.prijs_per_stuk);
            return count === null || price === null ? null : count * price;
        })) : null);
        setBaseline((current.grootmaterialen || []).map(item => ({ product: item.product, eenheid: item.eenheid || 'stuk', aantal: finitePreviewNumber(item.aantal), prijs_per_stuk: finitePreviewNumber(item.prijs_per_stuk), hoe_berekend: String(item.hoe_berekend || '') })));
        try {
            const response = await fetch('/api/offerte/generate', {
                method: 'POST', signal: abort.signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({ quoteId, previewOnly: true }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Testberekening mislukt.');
            if (!abort.signal.aborted) setResult(data);
        } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Testberekening mislukt.'); }
        finally { if (controller.current === abort) { controller.current = null; if (!abort.signal.aborted) setLoading(false); } }
    };
    const rows = new Map<string, { product: string; unit: string; old: PreviewMaterial[]; test: PreviewMaterial[] }>();
    [baseline, result?.materials || []].forEach((items, index) => items.forEach(item => {
        const id = key(item);
        const row = rows.get(id) || { product: item.product, unit: item.eenheid, old: [], test: [] };
        (index === 0 ? row.old : row.test).push(item); rows.set(id, row);
    }));
    const oldTotal = sumKnown(baseline.map(amount));
    const newTotal = result ? sumKnown(result.materials.map(amount)) : null;
    const completeComparison = Array.from(rows.values()).every(row => row.old.length && row.test.length);
    const difference = completeComparison && oldTotal !== null && newTotal !== null ? newTotal - oldTotal : null;
    const purchaseKeys = (result?.purchases || []).map(row => JSON.stringify([row.date, row.product.toLocaleLowerCase('nl-NL'), row.quantity, row.unit, row.amount]));
    const repeatedPurchases = new Set(purchaseKeys.filter((value, index) => purchaseKeys.indexOf(value) !== index));
    return <>
        <Button variant="outline" size="sm" disabled={disabled || !user} onClick={() => loading || result ? setOpen(true) : void run()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />} Test calculatie
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl [&>*]:min-w-0">
                <DialogHeader>
                    <DialogTitle>Test calculatie</DialogTitle>
                    <DialogDescription>Alleen bekijken; de offerte wordt niet gewijzigd. Bestaande grootmaterialen bij de start van de test tegenover een nieuwe materiaalraming. Alle bedragen excl. btw.</DialogDescription>
                </DialogHeader>
                {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Testberekening maken en gekoppelde inkoopregels laden…</p>}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                {!loading && <Button className="w-fit" variant="outline" size="sm" disabled={disabled} onClick={() => void run()}>Test opnieuw uitvoeren</Button>}
                {result && <>
                    <p className="text-xs text-muted-foreground">Testmodel: {result.model}. Nieuwe eenvoudige materiaalraming met afvalpercentage uit de app. Het model van de bestaande stand is niet vastgelegd; deze kan handmatige wijzigingen bevatten.</p>
                    <div className="w-full min-w-0 overflow-x-auto rounded-md border">
                        <table className="w-full text-sm tabular-nums">
                            <thead><tr className="border-b bg-muted/30"><th className="p-3 text-left">Grootmateriaal</th><th className="p-3 text-right">Bestaand aantal</th><th className="p-3 text-right">Test aantal</th><th className="p-3 text-right">Verschil aantal</th><th className="p-3 text-right">Bestaand bedrag</th><th className="p-3 text-right">Test bedrag</th></tr></thead>
                            <tbody>{Array.from(rows).map(([id, row]) => {
                                const oldQty = row.old.length ? sumKnown(row.old.map(item => item.aantal)) : null;
                                const newQty = row.test.length ? sumKnown(row.test.map(item => item.aantal)) : null;
                                const oldAmount = row.old.length ? sumKnown(row.old.map(amount)) : null;
                                const newAmount = row.test.length ? sumKnown(row.test.map(amount)) : null;
                                return <tr key={id} className="border-b align-top">
                                    <td className="min-w-56 p-3">{row.product}<span className="block text-xs text-muted-foreground">{row.unit}</span><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Berekenuitleg</summary>{row.test.map((item, i) => <p key={i} className="mt-2 max-w-md whitespace-pre-wrap">{item.hoe_berekend}</p>)}{!row.test.length && <p>Niet opgenomen in de test.</p>}</details></td>
                                    <td className="p-3 text-right">{row.old.length ? quantity(oldQty) : '—'}</td>
                                    <td className={`p-3 text-right ${oldQty !== newQty ? 'bg-amber-500/10' : ''}`}>{row.test.length ? quantity(newQty) : '—'}</td>
                                    <td className="p-3 text-right">{oldQty !== null && newQty !== null ? quantity(newQty - oldQty) : '—'}</td>
                                    <td className="whitespace-nowrap p-3 text-right">{row.old.length ? money(oldAmount) : '—'}</td><td className="whitespace-nowrap p-3 text-right">{row.test.length ? money(newAmount) : '—'}</td>
                                </tr>;
                            })}</tbody>
                        </table>
                    </div>
                    <p className="text-sm font-medium">Grootmaterialen: bestaand {money(oldTotal)} · test {money(newTotal)} · verschil {money(difference)}</p>
                    {!completeComparison && <p className="text-xs text-muted-foreground">Niet alle materialen staan in beide berekeningen. Het totaalverschil is daarom onbekend; ontbrekende regels zijn geen besparing.</p>}
                    <p className="text-sm">Kleinmateriaal: bestaand {money(baselineSmall)} · test {money(result.smallMaterials)} · verschil {money(baselineSmall !== null && result.smallMaterials !== null ? result.smallMaterials - baselineSmall : null)}.<br />{result.smallExplanation}</p>
                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Inkoop bij deze offerte</h3>
                        <p className="text-xs text-muted-foreground">Gekoppelde materiaalregels uit facturen en bonnen, inclusief eventuele retouren. Dit bewijst inkoop, niet hoeveel materiaal daadwerkelijk verwerkt is. Productnamen kunnen afwijken van de calculatie.</p>
                        {repeatedPurchases.size > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">Er staan mogelijk dubbele boekingen tussen: dezelfde omschrijving, datum, hoeveelheid en bedrag. Ze blijven zichtbaar en tellen mee in dit boekingstotaal.</p>}
                        {result.purchaseError ? <p role="alert" className="text-sm text-destructive">{result.purchaseError}</p> : !result.purchases.length ? <p className="text-sm text-muted-foreground">Geen gekoppelde materiaalinkoop gevonden. Werkelijk gebruik is onbekend.</p> : <>
                            <div className="w-full min-w-0 overflow-x-auto rounded-md border"><table className="w-full text-sm tabular-nums"><thead><tr className="border-b bg-muted/30"><th className="p-3 text-left">Materiaal / omschrijving</th><th className="p-3 text-left">Bron</th><th className="p-3 text-right">Aantal</th><th className="p-3 text-right">Bedrag</th></tr></thead><tbody>
                                {result.purchases.map(row => <tr key={row.id} className="border-b align-top"><td className="min-w-48 p-3">{row.product}</td><td className="min-w-40 p-3 text-xs">{row.supplier}<br />{row.invoice}<br />{row.date}</td><td className="whitespace-nowrap p-3 text-right">{quantity(row.quantity)} {row.unit}</td><td className="whitespace-nowrap p-3 text-right">{money(row.amount)}</td></tr>)}
                            </tbody></table></div>
                            <p className="text-sm font-medium">Totaal gekoppelde boekingen: {money(sumKnown(result.purchases.map(row => row.amount)))}</p>
                        </>}
                    </section>
                    <p className="text-xs text-muted-foreground">— = materiaal ontbreekt in die stand. Onbekend = onvoldoende gegevens; niet als nul meegerekend. De test verdwijnt wanneer je de pagina verlaat.</p>
                </>}
            </DialogContent>
        </Dialog>
    </>;
}
