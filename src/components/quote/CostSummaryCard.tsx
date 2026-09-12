'use client';

import { CalculationResult, QuoteSettings, formatCurrency } from '@/lib/quote-calculations';
import { Euro } from 'lucide-react';

interface CostSummaryCardProps {
    totals: CalculationResult | null;
    settings: QuoteSettings | null;
    totalUren: number;
    urenPerDag?: number;
    extraKostenExcl?: number;
    onUpdateHourlyRate?: (rate: number) => void;
    onUpdateTotalHours?: (hours: number) => void;
    onUpdateLowVatLaborHours?: (hours: number) => void;
    onUpdateMaterialenGrootTotal?: (value: number) => void;
    onUpdateMaterialenVerbruikTotal?: (value: number) => void;
    onUpdateMaterialenSubtotal?: (value: number) => void;
    onUpdateExtraKostenTotal?: (value: number) => void;
    onUpdateTransportTotal?: (value: number) => void;
    onUpdateTransportRatePerKm?: (value: number) => void;
    onUpdateWinstMargePercentage?: (value: number) => void;
    onUpdateWinstMargeAmountExcl?: (value: number) => void;
}

import { useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';

type EditableAmountField = 'groot' | 'verbruik' | 'extra' | 'subtotaal' | 'transport' | 'margePct' | 'margeAmount';
type AmountEditMode = 'excl' | 'incl';
type AdditiveAmountField =
    | 'groot'
    | 'verbruik'
    | 'extra'
    | 'subtotaal'
    | 'arbeid'
    | 'arbeidHoog'
    | 'arbeidLaag'
    | 'transport'
    | 'totaalExcl'
    | 'margeAmount'
    | 'btwHoog'
    | 'btwLaag'
    | 'btw'
    | 'totaalIncl';

export function CostSummaryCard({
    totals,
    settings,
    totalUren,
    urenPerDag = 8,
    extraKostenExcl = 0,
    onUpdateHourlyRate,
    onUpdateTotalHours,
    onUpdateLowVatLaborHours,
    onUpdateMaterialenGrootTotal,
    onUpdateMaterialenVerbruikTotal,
    onUpdateMaterialenSubtotal,
    onUpdateExtraKostenTotal,
    onUpdateTransportTotal,
    onUpdateTransportRatePerKm,
    onUpdateWinstMargePercentage,
    onUpdateWinstMargeAmountExcl,
}: CostSummaryCardProps) {
    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState<string>('');

    const [isEditingHours, setIsEditingHours] = useState(false);
    const [tempHours, setTempHours] = useState<string>('');
    const [isEditingLowVatHours, setIsEditingLowVatHours] = useState(false);
    const [tempLowVatHours, setTempLowVatHours] = useState<string>('');
    const [isEditingTransportRate, setIsEditingTransportRate] = useState(false);
    const [tempTransportRate, setTempTransportRate] = useState<string>('');
    const [editingField, setEditingField] = useState<EditableAmountField | null>(null);
    const [editingAmountMode, setEditingAmountMode] = useState<AmountEditMode>('excl');
    const [tempFieldValue, setTempFieldValue] = useState<string>('');
    const [additionValues, setAdditionValues] = useState<Record<string, string>>({});
    const skipNextBlurSaveRef = useRef(false);

    const startEditingRate = () => {
        if (!settings) return;
        setTempRate(settings.uurTariefExclBtw.toString());
        setIsEditingRate(true);
    };

    const saveRate = () => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }
        const newRate = parseFloat(tempRate);
        if (!isNaN(newRate) && onUpdateHourlyRate) {
            onUpdateHourlyRate(newRate);
        }
        setIsEditingRate(false);
    };

    const cancelEditingRate = () => {
        setIsEditingRate(false);
    };

    const startEditingHours = () => {
        setTempHours(totalUren.toString());
        setIsEditingHours(true);
    };

    const saveHours = () => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }
        const newHours = parseFloat(tempHours);
        if (!isNaN(newHours) && onUpdateTotalHours) {
            onUpdateTotalHours(newHours);
        }
        setIsEditingHours(false);
    };

    const cancelEditingHours = () => {
        setIsEditingHours(false);
    };

    const startEditingLowVatHours = () => {
        const current = Math.max(0, Number(settings?.arbeidBtwLaagUren) || 0);
        setTempLowVatHours(current.toLocaleString('nl-NL', { maximumFractionDigits: 2 }));
        setIsEditingLowVatHours(true);
    };

    const saveLowVatHours = () => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }
        const parsed = parseLocalizedNumber(tempLowVatHours);
        if (!Number.isNaN(parsed) && onUpdateLowVatLaborHours) {
            onUpdateLowVatLaborHours(Math.max(0, Math.min(parsed, Math.max(0, totalUren))));
        }
        setIsEditingLowVatHours(false);
    };

    const cancelEditingLowVatHours = () => {
        setIsEditingLowVatHours(false);
    };

    const startEditingTransportRate = () => {
        setTempTransportRate(totals?.transportRatePerKm?.toLocaleString('nl-NL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) ?? '');
        setIsEditingTransportRate(true);
    };

    const saveTransportRate = () => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }
        const newRate = parseLocalizedNumber(tempTransportRate);
        if (!Number.isNaN(newRate) && onUpdateTransportRatePerKm) {
            onUpdateTransportRatePerKm(Math.max(0, newRate));
        }
        setIsEditingTransportRate(false);
    };

    const cancelEditingTransportRate = () => {
        setIsEditingTransportRate(false);
    };

    const parseLocalizedNumber = (value: string): number => {
        const parsed = parseFloat(value.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : NaN;
    };

    const selectAllOnFocus = (e: FocusEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        requestAnimationFrame(() => {
            if (typeof input.select === 'function') {
                input.select();
            }
        });
    };

    const startEditingAmount = (
        field: EditableAmountField,
        initialValue: number,
        mode: AmountEditMode = 'excl',
    ) => {
        setTempFieldValue(initialValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setEditingField(field);
        setEditingAmountMode(mode);
    };

    const cancelEditingAmount = () => {
        setEditingField(null);
        setEditingAmountMode('excl');
        setTempFieldValue('');
    };

    const convertInclToExcl = (field: EditableAmountField, value: number): number => {
        // In materiaal-only mode, transport and winstmarge are not subject to VAT.
        const isMaterialAmount = field === 'groot' || field === 'verbruik' || field === 'extra' || field === 'subtotaal';
        const isVatApplicable = isMaterialAmount || settings?.btwMode !== 'materiaal_only';
        if (!isVatApplicable) return value;

        const rate = Math.max(0, Number(settings?.btwTarief) || 0);
        return value / (1 + rate / 100);
    };

    const saveEditingAmount = () => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }
        if (!editingField) return;
        const parsed = parseLocalizedNumber(tempFieldValue);
        if (Number.isNaN(parsed)) {
            cancelEditingAmount();
            return;
        }

        const value = editingAmountMode === 'incl'
            ? convertInclToExcl(editingField, parsed)
            : parsed;

        if (editingField === 'groot' && onUpdateMaterialenGrootTotal) {
            onUpdateMaterialenGrootTotal(value);
        } else if (editingField === 'verbruik' && onUpdateMaterialenVerbruikTotal) {
            onUpdateMaterialenVerbruikTotal(value);
        } else if (editingField === 'extra' && onUpdateExtraKostenTotal) {
            onUpdateExtraKostenTotal(value);
        } else if (editingField === 'subtotaal' && onUpdateMaterialenSubtotal) {
            onUpdateMaterialenSubtotal(value);
        } else if (editingField === 'transport' && onUpdateTransportTotal) {
            onUpdateTransportTotal(value);
        } else if (editingField === 'margePct' && onUpdateWinstMargePercentage) {
            onUpdateWinstMargePercentage(value);
        } else if (editingField === 'margeAmount' && onUpdateWinstMargeAmountExcl) {
            onUpdateWinstMargeAmountExcl(value);
        }

        cancelEditingAmount();
    };

    const handleEditorKeyDown = (
        event: KeyboardEvent<HTMLInputElement>,
        cancel: () => void,
    ) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            skipNextBlurSaveRef.current = true;
            event.currentTarget.blur();
            cancel();
        }
    };

    const totaalExclZonderMarge = totals ? totals.subtotaalExclBtw : 0;
    const winstMargeExclBtw = totals ? totals.winstMarge : 0;
    const btwMetMarge = totals ? totals.btw : 0;
    const vatRate = Math.max(0, Number(settings?.btwTarief) || 0);
    const vatMultiplier = 1 + vatRate / 100;
    const isMaterialsOnlyVatMode = settings?.btwMode === 'materiaal_only';
    const amountGridClass = 'grid w-[385px] sm:w-[570px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(5.25rem,6.5rem)_minmax(5.25rem,6.5rem)] gap-2 sm:gap-3 items-center text-right';
    const winstMargeBasisLabel =
        settings?.extras?.winstMarge?.basis === 'materiaal'
            ? 'over materialen'
            : settings?.extras?.winstMarge?.basis === 'arbeid'
                ? 'over arbeid'
                : 'over totaal';
    const calculateInclAmount = (exclValue: number, isVatApplicable: boolean): number => {
        if (!isMaterialsOnlyVatMode) return exclValue * vatMultiplier;
        if (!isVatApplicable) return exclValue;
        return exclValue + ((exclValue * vatRate) / 100);
    };
    const renderAmountColumns = (
        exclNode: ReactNode,
        inclAmount: number,
        inclClassName: string = 'text-foreground',
        inclNode: ReactNode = formatCurrency(inclAmount),
        addField?: AdditiveAmountField,
    ) => (
        <div className={amountGridClass}>
            <div className="text-foreground">{exclNode}</div>
            <div className={inclClassName}>{inclNode}</div>
            {addField ? renderAdditionInput(addField, 'excl') : <div />}
            {addField ? renderAdditionInput(addField, 'incl') : <div />}
        </div>
    );

    const renderEditableAmount = (
        field: EditableAmountField,
        exclAmount: number,
        inclAmount: number,
        inclClassName: string = 'text-foreground',
    ) => {
        const renderInput = (mode: AmountEditMode) => (
            <Input
                autoFocus
                type="text"
                value={tempFieldValue}
                onChange={(e) => setTempFieldValue(e.target.value)}
                onBlur={saveEditingAmount}
                onFocus={selectAllOnFocus}
                className="h-6 w-28 px-1 py-0 text-sm bg-muted border-border text-right"
                onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingAmount)}
                aria-label={`Bedrag ${mode === 'incl' ? 'incl. btw' : 'excl. btw'} bewerken`}
            />
        );

        const renderButton = (amount: number, mode: AmountEditMode) => (
            <button
                type="button"
                className="text-foreground flex items-center gap-1 hover:text-primary transition-colors justify-self-end"
                onClick={() => startEditingAmount(field, amount, mode)}
                aria-label={`Bedrag ${mode === 'incl' ? 'incl. btw' : 'excl. btw'} bewerken`}
                title={`Bedrag ${mode === 'incl' ? 'incl. btw' : 'excl. btw'} bewerken`}
            >
                {formatCurrency(amount)}
                <Pencil size={12} className="text-muted-foreground" />
            </button>
        );

        return renderAmountColumns(
            editingField === field && editingAmountMode === 'excl'
                ? renderInput('excl')
                : renderButton(exclAmount, 'excl'),
            inclAmount,
            inclClassName,
            editingField === field && editingAmountMode === 'incl'
                ? renderInput('incl')
                : renderButton(inclAmount, 'incl'),
            field === 'margePct' ? undefined : field,
        );
    };

    if (!totals || !settings) {
        return (
            <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="font-semibold text-muted-foreground text-sm mb-4">KOSTENOVERZICHT</h3>
                <p className="text-muted-foreground">Bezig met berekenen...</p>
            </div>
        );
    }
    const winstProjectie = totals.winstProjectie;
    // "Extra kosten" wordt als verbruiksartikel opgeslagen zodat het onderdeel
    // blijft van het materiaalsubtotaal. Trek het hier af omdat deze kosten op
    // de volgende regel als eigen kostencategorie worden getoond.
    const verbruiksartikelenExclExtraKosten = Math.max(
        0,
        totals.materialenVerbruik - extraKostenExcl,
    );
    const winstInclBtw = winstProjectie.winstInclBtw ?? (winstProjectie.omzetInclBtw - (winstProjectie.kostenInclBtw ?? 0));
    const winstNaBtwArbeidEnMarge = winstProjectie.winstNaBtwArbeidEnMarge ?? winstInclBtw;
    const btwArbeidEnMarge = winstProjectie.btwArbeidEnMarge ?? 0;
    const brutowinstPercentageInclBtw = winstProjectie.omzetInclBtw > 0
        ? (winstInclBtw / winstProjectie.omzetInclBtw) * 100
        : 0;
    const safeUrenPerDag = Number.isFinite(urenPerDag) && urenPerDag > 0 ? urenPerDag : 8;
    const aantalWerkdagen = totalUren > 0 ? Math.max(1, Math.ceil(totalUren / safeUrenPerDag)) : 0;
    const winstPerWerkdag = aantalWerkdagen > 0 ? winstNaBtwArbeidEnMarge / aantalWerkdagen : 0;
    const arbeidLaagBtwUren = Math.max(0, totals.arbeidLaagBtwUren || 0);
    const arbeidHoogBtwUren = Math.max(0, totals.arbeidHoogBtwUren || totalUren);
    const arbeidLaagBtwTotaal = Math.max(0, totals.arbeidLaagBtwTotaal || 0);
    const arbeidHoogBtwTotaal = Math.max(0, totals.arbeidHoogBtwTotaal || totals.arbeidTotaal);
    const arbeidLaagBtwTarief = Math.max(0, totals.arbeidLaagBtwTarief || settings.arbeidBtwLaagTarief || 9);
    const hasLaborVatSplit = arbeidLaagBtwUren > 0 && arbeidLaagBtwTotaal > 0 && !isMaterialsOnlyVatMode;
    const calculateInclAmountForRate = (exclValue: number, rate: number): number => {
        if (isMaterialsOnlyVatMode) return exclValue;
        return exclValue + ((exclValue * Math.max(0, rate)) / 100);
    };

    const getAdditionKey = (field: AdditiveAmountField, mode: AmountEditMode): string => `${field}-${mode}`;

    const setAdditionValue = (field: AdditiveAmountField, mode: AmountEditMode, value: string) => {
        setAdditionValues((current) => ({
            ...current,
            [getAdditionKey(field, mode)]: value,
        }));
    };

    const clearAdditionValue = (field: AdditiveAmountField, mode: AmountEditMode) => {
        setAdditionValues((current) => {
            const next = { ...current };
            delete next[getAdditionKey(field, mode)];
            return next;
        });
    };

    const convertAdditionInclToExcl = (
        field: AdditiveAmountField,
        value: number,
        currentExcl: number,
        currentIncl: number,
    ): number => {
        // Use the displayed ratio for mixed-rate labour, so an incl. btw
        // addition remains exactly that amount in the overview.
        if (currentExcl > 0 && currentIncl >= 0) {
            return value / (currentIncl / currentExcl);
        }

        const isMaterialAmount = field === 'groot' || field === 'verbruik' || field === 'extra' || field === 'subtotaal';
        const isVatApplicable = isMaterialAmount || settings?.btwMode !== 'materiaal_only';
        if (!isVatApplicable) return value;

        const rate = field === 'arbeidLaag'
            ? arbeidLaagBtwTarief
            : Math.max(0, Number(settings?.btwTarief) || 0);
        return value / (1 + rate / 100);
    };

    const saveAmountAddition = async (
        field: AdditiveAmountField,
        mode: AmountEditMode,
    ): Promise<void> => {
        if (skipNextBlurSaveRef.current) {
            skipNextBlurSaveRef.current = false;
            return;
        }

        const rawValue = additionValues[getAdditionKey(field, mode)] || '';
        clearAdditionValue(field, mode);
        const parsed = parseLocalizedNumber(rawValue);
        if (Number.isNaN(parsed) || parsed === 0 || !totals) return;

        const amountToAdd = Math.max(0, parsed);
        const currentAmounts: Record<AdditiveAmountField, { excl: number; incl: number }> = {
            groot: {
                excl: totals.materialenGroot,
                incl: calculateInclAmount(totals.materialenGroot, true),
            },
            verbruik: {
                excl: verbruiksartikelenExclExtraKosten,
                incl: calculateInclAmount(verbruiksartikelenExclExtraKosten, true),
            },
            extra: {
                excl: extraKostenExcl,
                incl: calculateInclAmount(extraKostenExcl, true),
            },
            subtotaal: {
                excl: totals.materialenTotaal,
                incl: calculateInclAmount(totals.materialenTotaal, true),
            },
            arbeid: {
                excl: totals.arbeidTotaal,
                incl: hasLaborVatSplit
                    ? calculateInclAmountForRate(arbeidHoogBtwTotaal, vatRate) + calculateInclAmountForRate(arbeidLaagBtwTotaal, arbeidLaagBtwTarief)
                    : calculateInclAmount(totals.arbeidTotaal, !isMaterialsOnlyVatMode),
            },
            arbeidHoog: {
                excl: arbeidHoogBtwTotaal,
                incl: calculateInclAmountForRate(arbeidHoogBtwTotaal, vatRate),
            },
            arbeidLaag: {
                excl: arbeidLaagBtwTotaal,
                incl: calculateInclAmountForRate(arbeidLaagBtwTotaal, arbeidLaagBtwTarief),
            },
            transport: {
                excl: totals.transportTotaal,
                incl: calculateInclAmount(totals.transportTotaal, !isMaterialsOnlyVatMode),
            },
            totaalExcl: {
                excl: totaalExclZonderMarge,
                incl: isMaterialsOnlyVatMode
                    ? totaalExclZonderMarge + ((Math.max(0, totals.materialenTotaal) * vatRate) / 100)
                    : calculateInclAmount(totaalExclZonderMarge, true),
            },
            margeAmount: {
                excl: winstMargeExclBtw,
                incl: calculateInclAmount(winstMargeExclBtw, !isMaterialsOnlyVatMode),
            },
            btwHoog: {
                excl: totals.btwHoog || 0,
                incl: totals.btwHoog || 0,
            },
            btwLaag: {
                excl: totals.btwLaag || 0,
                incl: totals.btwLaag || 0,
            },
            btw: {
                excl: btwMetMarge,
                incl: btwMetMarge,
            },
            totaalIncl: {
                excl: totals.totaalExclBtw,
                incl: totals.totaalInclBtw,
            },
        };
        const current = currentAmounts[field];
        const amountToAddExcl = mode === 'incl'
            ? convertAdditionInclToExcl(field, amountToAdd, current.excl, current.incl)
            : amountToAdd;

        if (!Number.isFinite(amountToAddExcl) || amountToAddExcl <= 0) return;

        if (field === 'groot' && onUpdateMaterialenGrootTotal) {
            await onUpdateMaterialenGrootTotal(current.excl + amountToAddExcl);
        } else if (field === 'verbruik' && onUpdateMaterialenVerbruikTotal) {
            await onUpdateMaterialenVerbruikTotal(current.excl + amountToAddExcl);
        } else if (field === 'extra' && onUpdateExtraKostenTotal) {
            await onUpdateExtraKostenTotal(current.excl + amountToAddExcl);
        } else if (field === 'subtotaal' && onUpdateMaterialenSubtotal) {
            await onUpdateMaterialenSubtotal(current.excl + amountToAddExcl);
        } else if (field === 'transport' && onUpdateTransportTotal) {
            await onUpdateTransportTotal(current.excl + amountToAddExcl);
        } else if (field === 'totaalExcl' && onUpdateMaterialenSubtotal) {
            // This line is the subtotal before margin. Keep the addition on
            // that subtotal so the line itself and the following totals move.
            await onUpdateMaterialenSubtotal(current.excl + amountToAddExcl);
        } else if ((field === 'arbeid' || field === 'arbeidHoog' || field === 'arbeidLaag') && onUpdateTotalHours) {
            const hourlyRate = Math.max(0, Number(settings.uurTariefExclBtw) || 0);
            if (hourlyRate <= 0) return;

            const hoursToAdd = amountToAddExcl / hourlyRate;
            await onUpdateTotalHours(totalUren + hoursToAdd);
            if (field === 'arbeidLaag' && onUpdateLowVatLaborHours) {
                await onUpdateLowVatLaborHours(arbeidLaagBtwUren + hoursToAdd);
            }
        } else if ((field === 'btwHoog' || field === 'btw') && vatRate > 0) {
            const taxableAmountToAdd = amountToAddExcl / (vatRate / 100);
            if (isMaterialsOnlyVatMode && onUpdateMaterialenSubtotal) {
                await onUpdateMaterialenSubtotal(totals.materialenTotaal + taxableAmountToAdd);
            } else if (onUpdateWinstMargeAmountExcl) {
                await onUpdateWinstMargeAmountExcl(winstMargeExclBtw + taxableAmountToAdd);
            }
        } else if (field === 'btwLaag' && onUpdateTotalHours && arbeidLaagBtwTarief > 0) {
            const hourlyRate = Math.max(0, Number(settings.uurTariefExclBtw) || 0);
            if (hourlyRate <= 0) return;

            const hoursToAdd = amountToAddExcl / ((arbeidLaagBtwTarief / 100) * hourlyRate);
            await onUpdateTotalHours(totalUren + hoursToAdd);
            if (onUpdateLowVatLaborHours) {
                await onUpdateLowVatLaborHours(arbeidLaagBtwUren + hoursToAdd);
            }
        } else if ((field === 'totaalIncl' || field === 'margeAmount') && onUpdateWinstMargeAmountExcl) {
            // The incl. total is derived from the cost lines. Store its
            // addition as a margin addition so the customer total moves.
            await onUpdateWinstMargeAmountExcl(winstMargeExclBtw + amountToAddExcl);
        }
    };

    const handleAdditionKeyDown = (
        event: KeyboardEvent<HTMLInputElement>,
        field: AdditiveAmountField,
        mode: AmountEditMode,
    ) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            skipNextBlurSaveRef.current = true;
            clearAdditionValue(field, mode);
            event.currentTarget.blur();
        }
    };

    const renderAdditionInput = (field: AdditiveAmountField, mode: AmountEditMode) => (
        <Input
            type="text"
            inputMode="decimal"
            value={additionValues[getAdditionKey(field, mode)] ?? '0'}
            onChange={(event) => setAdditionValue(field, mode, event.target.value)}
            onBlur={() => { void saveAmountAddition(field, mode); }}
            onFocus={selectAllOnFocus}
            onKeyDown={(event) => handleAdditionKeyDown(event, field, mode)}
            className="h-7 w-full min-w-0 px-1.5 py-0 text-xs bg-muted/70 border-border text-right"
            aria-label={`Toevoegen ${mode === 'incl' ? 'incl. btw' : 'excl. btw'} bij deze regel`}
        />
    );

    return (
        <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold text-muted-foreground text-sm mb-3 flex items-center gap-2">
                <Euro size={14} />
                KOSTENOVERZICHT
            </h3>
            <div className="mb-2 flex justify-end">
                <div className={`${amountGridClass} text-[11px] uppercase tracking-wide text-muted-foreground`}>
                    <span>Excl. btw</span>
                    <span>Incl. btw</span>
                    <span>Toevoegen excl.</span>
                    <span>Toevoegen incl.</span>
                </div>
            </div>

            <div className="space-y-3">
                <div className="rounded-lg border border-border p-2.5 space-y-1.5 bg-background/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Materialen (groot)</span>
                        {renderEditableAmount(
                            'groot',
                            totals.materialenGroot,
                            calculateInclAmount(totals.materialenGroot, true),
                        )}
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Verbruiksartikelen</span>
                        {renderEditableAmount(
                            'verbruik',
                            verbruiksartikelenExclExtraKosten,
                            calculateInclAmount(verbruiksartikelenExclExtraKosten, true),
                        )}
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Extra kosten</span>
                        {renderEditableAmount(
                            'extra',
                            extraKostenExcl,
                            calculateInclAmount(extraKostenExcl, true),
                        )}
                    </div>
                    <div className="border-t border-border pt-1.5 flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotaal materialen</span>
                        {renderEditableAmount(
                            'subtotaal',
                            totals.materialenTotaal,
                            calculateInclAmount(totals.materialenTotaal, true),
                        )}
                    </div>
                </div>

                <div className="h-px bg-border/60" />

                <div className="rounded-lg border border-border p-2.5 space-y-2 bg-background/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                            Arbeid (
                            {isEditingHours ? (
                                <div className="flex items-center gap-1">
                                    <Input
                                        autoFocus
                                        type="number"
                                        value={tempHours}
                                        onChange={(e) => setTempHours(e.target.value)}
                                        onBlur={saveHours}
                                        onFocus={selectAllOnFocus}
                                        className="h-6 w-16 px-1 py-0 text-sm bg-muted border-border text-center"
                                        onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingHours)}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="p-0 border-0 bg-transparent flex items-center gap-1 hover:text-foreground transition-colors"
                                    onClick={startEditingHours}
                                >
                                    {totalUren} uur
                                    <Pencil size={12} className="text-muted-foreground" />
                                </button>
                            )}
                            ×
                            {isEditingRate ? (
                                <div className="flex items-center gap-1 ml-1">
                                    <span className="text-muted-foreground">€</span>
                                    <Input
                                        autoFocus
                                        type="number"
                                        value={tempRate}
                                        onChange={(e) => setTempRate(e.target.value)}
                                        onBlur={saveRate}
                                        onFocus={selectAllOnFocus}
                                        className="h-6 w-20 px-1 py-0 text-sm bg-muted border-border"
                                        onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingRate)}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="p-0 border-0 bg-transparent flex items-center gap-1 hover:text-foreground transition-colors ml-1"
                                    onClick={startEditingRate}
                                >
                                    {formatCurrency(settings.uurTariefExclBtw)}
                                    <Pencil size={12} className="text-muted-foreground" />
                                </button>
                            )}
                            <span className="text-xs text-muted-foreground ml-1">excl. btw</span>)
                        </span>
                        {hasLaborVatSplit
                            ? renderAmountColumns(
                                <span>{formatCurrency(totals.arbeidTotaal)}</span>,
                                calculateInclAmountForRate(arbeidHoogBtwTotaal, vatRate) + calculateInclAmountForRate(arbeidLaagBtwTotaal, arbeidLaagBtwTarief),
                                'text-foreground',
                                undefined,
                                'arbeid',
                            )
                            : renderAmountColumns(
                                <span>{formatCurrency(totals.arbeidTotaal)}</span>,
                                calculateInclAmount(totals.arbeidTotaal, !isMaterialsOnlyVatMode),
                                'text-foreground',
                                undefined,
                                'arbeid',
                            )}
                    </div>
                    <div className="border-t border-border/70 pt-2 space-y-1 text-xs">
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">
                                Arbeid {vatRate}% ({arbeidHoogBtwUren.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur)
                            </span>
                            {renderAmountColumns(
                                <span>{formatCurrency(arbeidHoogBtwTotaal)}</span>,
                                calculateInclAmountForRate(arbeidHoogBtwTotaal, vatRate),
                                'text-foreground',
                                undefined,
                                'arbeidHoog',
                            )}
                        </div>
                        {(hasLaborVatSplit || isEditingLowVatHours || onUpdateLowVatLaborHours) && (
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                                    Arbeid {arbeidLaagBtwTarief}% (
                                    {isEditingLowVatHours ? (
                                        <Input
                                            autoFocus
                                            type="text"
                                            value={tempLowVatHours}
                                            onChange={(e) => setTempLowVatHours(e.target.value)}
                                            onBlur={saveLowVatHours}
                                            onFocus={selectAllOnFocus}
                                            className="h-6 w-16 px-1 py-0 text-xs bg-muted border-border text-center"
                                            onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingLowVatHours)}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="p-0 border-0 bg-transparent inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                            onClick={startEditingLowVatHours}
                                        >
                                            {arbeidLaagBtwUren.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur
                                            <Pencil size={11} className="text-muted-foreground" />
                                        </button>
                                    )}
                                    )
                                </span>
                                {renderAmountColumns(
                                    <span>{formatCurrency(arbeidLaagBtwTotaal)}</span>,
                                    calculateInclAmountForRate(arbeidLaagBtwTotaal, arbeidLaagBtwTarief),
                                    'text-foreground',
                                    undefined,
                                    'arbeidLaag',
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="h-px bg-border/60" />

                <div className="rounded-lg border border-border p-2.5 bg-background/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                            <span className="block">
                                Transport (
                                {isEditingTransportRate ? (
                                    <Input
                                        autoFocus
                                        type="text"
                                        value={tempTransportRate}
                                        onChange={(e) => setTempTransportRate(e.target.value)}
                                        onBlur={saveTransportRate}
                                        onFocus={selectAllOnFocus}
                                        className="mx-1 inline-flex h-6 w-16 px-1 py-0 text-sm bg-muted border-border text-right"
                                        onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingTransportRate)}
                                        aria-label="Prijs per kilometer voor deze offerte"
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        className="mx-1 inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                        onClick={startEditingTransportRate}
                                        aria-label="Prijs per kilometer voor deze offerte bewerken"
                                    >
                                        {totals.transportRatePerKm.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <Pencil size={11} className="text-muted-foreground" />
                                    </button>
                                )}
                                x {totals.transportDistanceKmOneWay.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}km = {formatCurrency(totals.transportOneWayCost)} x 2 = {formatCurrency(totals.transportRoundTripCost)} x {totals.transportAantalDagen} dagen)
                            </span>
                        </span>
                        {renderEditableAmount(
                            'transport',
                            totals.transportTotaal,
                            calculateInclAmount(totals.transportTotaal, !isMaterialsOnlyVatMode),
                        )}
                    </div>
                </div>

                <div className="h-px bg-border/60" />

                <div className="rounded-lg border border-border p-2.5 space-y-1.5 bg-background/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Totaal excl. BTW</span>
                        {renderAmountColumns(
                            <span>{formatCurrency(totaalExclZonderMarge)}</span>,
                            isMaterialsOnlyVatMode
                                ? totaalExclZonderMarge + ((Math.max(0, totals.materialenTotaal) * vatRate) / 100)
                                : calculateInclAmount(totaalExclZonderMarge, true),
                            'text-foreground',
                            undefined,
                            'totaalExcl',
                        )}
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                            {settings.extras.winstMarge.mode === 'percentage' ? (
                                <>
                                    Winstmarge (
                                    {editingField === 'margePct' ? (
                                        <Input
                                            autoFocus
                                            type="text"
                                            value={tempFieldValue}
                                            onChange={(e) => setTempFieldValue(e.target.value)}
                                            onBlur={saveEditingAmount}
                                            onFocus={selectAllOnFocus}
                                            className="mx-1 inline-flex h-6 w-20 px-1 py-0 text-sm bg-muted border-border text-right"
                                            onKeyDown={(e) => handleEditorKeyDown(e, cancelEditingAmount)}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="mx-1 inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                            onClick={() => startEditingAmount('margePct', Number(settings.extras.winstMarge.percentage || 0))}
                                        >
                                            {settings.extras.winstMarge.percentage}%
                                            <Pencil size={12} className="text-muted-foreground" />
                                        </button>
                                    )}
                                    {winstMargeBasisLabel})
                                </>
                            ) : (
                                <>Winstmarge (vast)</>
                            )}
                        </span>
                        {renderEditableAmount(
                            'margeAmount',
                            winstMargeExclBtw,
                            calculateInclAmount(winstMargeExclBtw, !isMaterialsOnlyVatMode),
                        )}
                    </div>
                    {hasLaborVatSplit ? (
                        <div className="border-t border-border pt-1.5 space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">BTW ({settings.btwTarief}%)</span>
                                {renderAmountColumns(
                                    <span>{formatCurrency(totals.btwHoog || 0)}</span>,
                                    totals.btwHoog || 0,
                                    'text-foreground',
                                    undefined,
                                    'btwHoog',
                                )}
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">BTW ({arbeidLaagBtwTarief}%)</span>
                                {renderAmountColumns(
                                    <span>{formatCurrency(totals.btwLaag || 0)}</span>,
                                    totals.btwLaag || 0,
                                    'text-foreground',
                                    undefined,
                                    'btwLaag',
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="border-t border-border pt-1.5 flex justify-between text-sm">
                            <span className="text-muted-foreground">BTW ({settings.btwTarief}%)</span>
                            {renderAmountColumns(
                                <span>{formatCurrency(btwMetMarge)}</span>,
                                btwMetMarge,
                                'text-foreground',
                                undefined,
                                'btw',
                            )}
                        </div>
                    )}
                </div>

                <div className="border-t-2 border-primary/50 pt-2.5 flex justify-between">
                    <span className="font-semibold text-foreground">TOTAAL INCL. BTW</span>
                    {renderAmountColumns(
                        <span className="font-bold text-primary">{formatCurrency(totals.totaalExclBtw)}</span>,
                        totals.totaalInclBtw,
                        'font-bold text-lg text-primary',
                        <span className="font-bold text-lg text-primary">{formatCurrency(totals.totaalInclBtw)}</span>,
                        'totaalIncl',
                    )}
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-4">
                        <span className="font-medium text-foreground">GEPROJECTEERDE WINST (incl. btw)</span>
                        <span className="font-semibold text-emerald-500">{formatCurrency(winstInclBtw)}</span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Omzet incl. btw</span>
                            <span className="text-foreground">{formatCurrency(winstProjectie.omzetInclBtw)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Werkelijke kosten incl. btw</span>
                            <span className="text-foreground">{formatCurrency(winstProjectie.kostenInclBtw ?? 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-emerald-500/20 pt-1.5">
                            <span className="text-muted-foreground">Winst met arbeid + marge incl. btw</span>
                            <span className="font-medium text-emerald-500">{formatCurrency(winstInclBtw)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Btw arbeid + marge afdracht</span>
                            <span className="text-foreground">{formatCurrency(btwArbeidEnMarge)}</span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-emerald-500/20 pt-1.5">
                            <span className="text-muted-foreground">Winst na btw arbeid + marge</span>
                            <span className="font-medium text-emerald-500">{formatCurrency(winstNaBtwArbeidEnMarge)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Brutowinstpercentage</span>
                            <span className="font-medium text-emerald-500">
                                {brutowinstPercentageInclBtw.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                            </span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-emerald-500/20 pt-1.5">
                            <span className="text-muted-foreground">
                                Winst per werkdag ({aantalWerkdagen} {aantalWerkdagen === 1 ? 'dag' : 'dagen'} x {safeUrenPerDag.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur)
                            </span>
                            <span className="font-medium text-emerald-500">{formatCurrency(winstPerWerkdag)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
