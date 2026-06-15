'use client';

import { useState, type ElementType, type ReactNode } from 'react';
import { Settings, Eye, FileText, Package, Clock, ChevronDown, ChevronUp, Image } from 'lucide-react';

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
    showSummaryArbeidTariefPerUurExclBtw: boolean;
    showSummaryTransport: boolean;
    showSummaryExclBtw: boolean;
    showSummaryBtw: boolean;
    showSummaryInclBtw: boolean;
    showAlgemeneVoorwaarden: boolean;
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
    showSummaryArbeidTariefPerUurExclBtw: false,
    showSummaryTransport: true,
    showSummaryExclBtw: true,
    showSummaryBtw: true,
    showSummaryInclBtw: true,
    showAlgemeneVoorwaarden: false,
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

    const toggleSetting = (key: keyof QuotePDFSettings): void => {
        onChange({
            ...settings,
            [key]: !settings[key],
        });
    };

    const ToggleRow = ({
        settingKey,
        label,
        description,
        icon: Icon,
    }: {
        settingKey: keyof QuotePDFSettings;
        label: string;
        description: string;
        icon: ElementType;
    }) => (
        <button
            type="button"
            className="w-full flex items-center justify-between py-2.5 px-3 rounded-md border border-transparent hover:border-border/70 hover:bg-muted/30 transition-colors"
            onClick={() => toggleSetting(settingKey)}
        >
            <div className="flex items-center gap-3">
                <Icon size={16} className="text-muted-foreground" />
                <div>
                    <p className="text-sm font-medium text-foreground text-left">{label}</p>
                    <p className="text-xs text-muted-foreground text-left">{description}</p>
                </div>
            </div>
            <div
                className={`relative w-9 h-5 rounded-full transition-colors ${settings[settingKey] ? 'bg-emerald-600' : 'bg-muted'}`}
            >
                <span
                    className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${settings[settingKey] ? 'translate-x-4' : 'translate-x-0'}`}
                />
            </div>
        </button>
    );

    const SectionCard = ({
        title,
        subtitle,
        children,
    }: {
        title: string;
        subtitle?: string;
        children: ReactNode;
    }) => (
        <section className="rounded-lg border border-white/10 bg-muted/55 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10 bg-muted/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/90">{title}</p>
                {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
            </div>
            <div className="p-2 space-y-1">{children}</div>
        </section>
    );

    const Content = () => (
        <div className={variant === 'default' ? 'border-t border-border/70 p-3 space-y-3' : 'p-2 min-w-[300px] space-y-3'}>
            <SectionCard title="Inhoud van de PDF" subtitle="Kies welke onderdelen en bijlagen in de offerte komen">
                <ToggleRow
                    settingKey="showFullWerkbeschrijving"
                    label="Volledige Werk & Levering"
                    description="Scope, materialen, maatvoering en uitsluitingen"
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
                <ToggleRow
                    settingKey="showTekeningen"
                    label="Tekeningen toevoegen"
                    description="Voeg een tekeningen pagina toe"
                    icon={Image}
                />
                <ToggleRow
                    settingKey="showAlgemeneVoorwaarden"
                    label="Algemene voorwaarden toevoegen"
                    description="Plaats algemene voorwaarden als extra pagina"
                    icon={FileText}
                />
                {(settings.showGrootmaterialen || settings.showVerbruiksartikelen) && (
                    <ToggleRow
                        settingKey="showPricesPerItem"
                        label="Prijzen per stuk tonen"
                        description="Individuele materiaalprijzen"
                        icon={Eye}
                    />
                )}
            </SectionCard>

            <SectionCard title="Samenvatting op eerste pagina" subtitle="Bepaal welke bedragen zichtbaar zijn in de samenvatting">
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
                {settings.showSummaryArbeid && (
                    <ToggleRow
                        settingKey="showSummaryArbeidTariefPerUurExclBtw"
                        label="Tarief tonen bij arbeid"
                        description="Bijv. € 52,50 excl. btw / uur"
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
            </SectionCard>

        </div>
    );

    if (variant === 'flat') {
        return <Content />;
    }

    return (
        <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Settings size={18} className="text-muted-foreground" />
                    <div className="text-left">
                        <h3 className="font-semibold text-foreground">PDF Instellingen</h3>
                        <p className="text-xs text-muted-foreground">Bepaal wat er op de offerte komt</p>
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp size={20} className="text-muted-foreground" />
                ) : (
                    <ChevronDown size={20} className="text-muted-foreground" />
                )}
            </button>
            {expanded && <Content />}
        </div>
    );
}
