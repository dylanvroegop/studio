'use client';

import { useState } from 'react';
import { Settings, Eye, EyeOff, FileText, Package, Clock, ChevronDown, ChevronUp, Image } from 'lucide-react';

export interface QuotePDFSettings {
    showGrootmaterialen: boolean;
    showVerbruiksartikelen: boolean;
    showUrenSpecificatie: boolean;
    showFullWerkbeschrijving: boolean;
    showPricesPerItem: boolean;
    showTekeningen: boolean;
    showSummaryMaterialen: boolean;
    showSummaryArbeid: boolean;
    showSummaryArbeidUren: boolean;
    showSummaryTransport: boolean;
    showSummaryExclBtw: boolean;
    showSummaryBtw: boolean;
    showSummaryInclBtw: boolean;
}

export const defaultQuotePDFSettings: QuotePDFSettings = {
    showGrootmaterialen: false,
    showVerbruiksartikelen: false,
    showUrenSpecificatie: false,
    showFullWerkbeschrijving: true,
    showPricesPerItem: false,
    showTekeningen: false,
    showSummaryMaterialen: true,
    showSummaryArbeid: true,
    showSummaryArbeidUren: true,
    showSummaryTransport: true,
    showSummaryExclBtw: true,
    showSummaryBtw: true,
    showSummaryInclBtw: true,
};

export function sanitizeQuotePDFSettings(value: unknown): QuotePDFSettings {
    if (!value || typeof value !== 'object') return { ...defaultQuotePDFSettings };
    const raw = value as Partial<Record<keyof QuotePDFSettings, unknown>>;
    const result = { ...defaultQuotePDFSettings };

    (Object.keys(defaultQuotePDFSettings) as Array<keyof QuotePDFSettings>).forEach((key) => {
        if (typeof raw[key] === 'boolean') {
            result[key] = raw[key] as boolean;
        }
    });

    return result;
}

interface QuoteSettingsProps {
    settings: QuotePDFSettings;
    onChange: (settings: QuotePDFSettings) => void;
    variant?: 'default' | 'flat';
}

export function QuoteSettings({ settings, onChange, variant = 'default' }: QuoteSettingsProps) {
    const [expanded, setExpanded] = useState(false);

    const toggleSetting = (key: keyof QuotePDFSettings) => {
        onChange({
            ...settings,
            [key]: !settings[key],
        });
    };

    const ToggleRow = ({
        settingKey,
        label,
        description,
        icon: Icon
    }: {
        settingKey: keyof QuotePDFSettings;
        label: string;
        description: string;
        icon: React.ElementType;
    }) => (
        <div
            className="flex items-center justify-between py-2 px-3 hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors"
            onClick={() => toggleSetting(settingKey)}
        >
            <div className="flex items-center gap-3">
                <Icon size={16} className="text-zinc-400" />
                <div>
                    <p className="text-sm font-medium text-zinc-200">{label}</p>
                    <p className="text-xs text-zinc-500">{description}</p>
                </div>
            </div>
            <button
                className={`relative w-9 h-5 rounded-full transition-colors ${settings[settingKey] ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
            >
                <span
                    className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${settings[settingKey] ? 'translate-x-4' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    );

    const Content = () => (
        <div className={variant === 'default' ? "border-t border-zinc-800 p-2" : "p-2 min-w-[300px]"}>
            <ToggleRow
                settingKey="showFullWerkbeschrijving"
                label="Volledige werkbeschrijving"
                description="Alle stappen op aparte pagina"
                icon={FileText}
            />

            <ToggleRow
                settingKey="showGrootmaterialen"
                label="Grootmaterialen tonen"
                description="Platen, isolatie, kozijnen etc."
                icon={Package}
            />

            <ToggleRow
                settingKey="showVerbruiksartikelen"
                label="Verbruiksartikelen tonen"
                description="Schroeven, kit, tape etc."
                icon={Package}
            />

            <ToggleRow
                settingKey="showUrenSpecificatie"
                label="Urenspecificatie tonen"
                description="Gedetailleerde uren per taak"
                icon={Clock}
            />

            <div className="mt-3 px-3 pt-3 border-t border-zinc-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Samenvatting in PDF</p>
            </div>

            <ToggleRow
                settingKey="showSummaryMaterialen"
                label="Regel: Materialen"
                description="Toon materiaalbedrag in samenvatting"
                icon={Eye}
            />

            <ToggleRow
                settingKey="showSummaryArbeid"
                label="Regel: Arbeid"
                description="Toon arbeidsbedrag in samenvatting"
                icon={Clock}
            />

            {settings.showSummaryArbeid && (
                <ToggleRow
                    settingKey="showSummaryArbeidUren"
                    label="Uren tonen bij arbeid"
                    description="Bijv. Arbeid (45 uur)"
                    icon={Eye}
                />
            )}

            <ToggleRow
                settingKey="showSummaryTransport"
                label="Regel: Transport"
                description="Toon transportbedrag in samenvatting"
                icon={Package}
            />

            <ToggleRow
                settingKey="showSummaryExclBtw"
                label="Regel: Totaal excl. BTW"
                description="Toon subtotaal exclusief BTW"
                icon={Eye}
            />

            <ToggleRow
                settingKey="showSummaryBtw"
                label="Regel: BTW"
                description="Toon BTW-bedrag"
                icon={Eye}
            />

            <ToggleRow
                settingKey="showSummaryInclBtw"
                label="Regel: Totaal incl. BTW"
                description="Toon eindtotaal inclusief BTW"
                icon={Eye}
            />

            {(settings.showGrootmaterialen || settings.showVerbruiksartikelen) && (
                <ToggleRow
                    settingKey="showPricesPerItem"
                    label="Prijzen per stuk tonen"
                    description="Individuele materiaalprijzen"
                    icon={Eye}
                />
            )}

            <ToggleRow
                settingKey="showTekeningen"
                label="Tekeningen toevoegen"
                description="Voeg een tekeningen pagina toe"
                icon={Image}
            />

            {/* Quick presets */}
            <div className="mt-4 px-3 pb-2 flex gap-2 border-t border-zinc-800 pt-3">
                <button
                    onClick={() => onChange({
                        showGrootmaterialen: false,
                        showVerbruiksartikelen: false,
                        showUrenSpecificatie: false,
                        showFullWerkbeschrijving: true,
                        showPricesPerItem: false,
                        showTekeningen: false,
                        showSummaryMaterialen: true,
                        showSummaryArbeid: true,
                        showSummaryArbeidUren: true,
                        showSummaryTransport: true,
                        showSummaryExclBtw: true,
                        showSummaryBtw: true,
                        showSummaryInclBtw: true,
                    })}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors flex-1"
                >
                    Minimaal
                </button>
                <button
                    onClick={() => onChange({
                        showGrootmaterialen: true,
                        showVerbruiksartikelen: true,
                        showUrenSpecificatie: true,
                        showFullWerkbeschrijving: true,
                        showPricesPerItem: false,
                        showTekeningen: true,
                        showSummaryMaterialen: true,
                        showSummaryArbeid: true,
                        showSummaryArbeidUren: true,
                        showSummaryTransport: true,
                        showSummaryExclBtw: true,
                        showSummaryBtw: true,
                        showSummaryInclBtw: true,
                    })}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors flex-1"
                >
                    Volledig
                </button>
            </div>
        </div>
    );

    if (variant === 'flat') {
        return <Content />;
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {/* Header - Always visible */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Settings size={18} className="text-zinc-400" />
                    <div className="text-left">
                        <h3 className="font-semibold text-white">PDF Instellingen</h3>
                        <p className="text-xs text-zinc-500">Bepaal wat er op de offerte komt</p>
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp size={20} className="text-zinc-400" />
                ) : (
                    <ChevronDown size={20} className="text-zinc-400" />
                )}
            </button>

            {/* Expandable settings */}
            {expanded && <Content />}
        </div>
    );
}
