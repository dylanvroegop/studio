'use client';

import { useState } from 'react';
import { Settings, Eye, EyeOff, FileText, Package, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export interface QuotePDFSettings {
    showGrootmaterialen: boolean;
    showVerbruiksartikelen: boolean;
    showUrenSpecificatie: boolean;
    showFullWerkbeschrijving: boolean;
    showPricesPerItem: boolean;
}

export const defaultQuotePDFSettings: QuotePDFSettings = {
    showGrootmaterialen: false,
    showVerbruiksartikelen: false,
    showUrenSpecificatie: false,
    showFullWerkbeschrijving: true,
    showPricesPerItem: false,
};

interface QuoteSettingsProps {
    settings: QuotePDFSettings;
    onChange: (settings: QuotePDFSettings) => void;
}

export function QuoteSettings({ settings, onChange }: QuoteSettingsProps) {
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
            className="flex items-center justify-between py-3 px-4 hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors"
            onClick={() => toggleSetting(settingKey)}
        >
            <div className="flex items-center gap-3">
                <Icon size={18} className="text-zinc-400" />
                <div>
                    <p className="text-sm font-medium text-zinc-200">{label}</p>
                    <p className="text-xs text-zinc-500">{description}</p>
                </div>
            </div>
            <button
                className={`relative w-11 h-6 rounded-full transition-colors ${settings[settingKey] ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
            >
                <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings[settingKey] ? 'translate-x-5' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    );

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
            {expanded && (
                <div className="border-t border-zinc-800 p-2">
                    <div className="mb-2 px-4 py-2">
                        <p className="text-xs text-yellow-500/80 flex items-center gap-2">
                            <EyeOff size={12} />
                            Tip: De meeste aannemers tonen geen materiaallijst op offertes
                        </p>
                    </div>

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

                    {(settings.showGrootmaterialen || settings.showVerbruiksartikelen) && (
                        <ToggleRow
                            settingKey="showPricesPerItem"
                            label="Prijzen per stuk tonen"
                            description="Individuele materiaalprijzen"
                            icon={Eye}
                        />
                    )}

                    {/* Quick presets */}
                    <div className="mt-4 px-4 pb-2 flex gap-2">
                        <button
                            onClick={() => onChange({
                                showGrootmaterialen: false,
                                showVerbruiksartikelen: false,
                                showUrenSpecificatie: false,
                                showFullWerkbeschrijving: true,
                                showPricesPerItem: false,
                            })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors"
                        >
                            Minimaal (standaard)
                        </button>
                        <button
                            onClick={() => onChange({
                                showGrootmaterialen: true,
                                showVerbruiksartikelen: true,
                                showUrenSpecificatie: true,
                                showFullWerkbeschrijving: true,
                                showPricesPerItem: false,
                            })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors"
                        >
                            Volledig transparant
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
