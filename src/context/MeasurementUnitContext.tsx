'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type MeasurementUnit = 'mm' | 'cm' | 'm';

interface MeasurementUnitContextType {
    unit: MeasurementUnit;
    setUnit: (unit: MeasurementUnit) => void;
    convertFromMm: (mmValue: number) => number;
    convertToMm: (value: number) => number;
    getLabel: () => string;
}

const MeasurementUnitContext = createContext<MeasurementUnitContextType | undefined>(undefined);

export function MeasurementUnitProvider({ children }: { children: React.ReactNode }) {
    const [unit, setUnitState] = useState<MeasurementUnit>('mm');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('measurement-unit') as MeasurementUnit;
        if (saved && ['mm', 'cm', 'm'].includes(saved)) {
            setUnitState(saved);
        }
        setMounted(true);
    }, []);

    const setUnit = (newUnit: MeasurementUnit) => {
        setUnitState(newUnit);
        localStorage.setItem('measurement-unit', newUnit);
    };

    const convertFromMm = (mmValue: number) => {
        if (unit === 'cm') return mmValue / 10;
        if (unit === 'm') return mmValue / 1000;
        return mmValue;
    };

    const convertToMm = (value: number) => {
        if (unit === 'cm') return value * 10;
        if (unit === 'm') return value * 1000;
        return value;
    };

    const getLabel = () => unit;

    return (
        <MeasurementUnitContext.Provider value={{ unit, setUnit, convertFromMm, convertToMm, getLabel }}>
            {children}
        </MeasurementUnitContext.Provider>
    );
}

export function useMeasurementUnit() {
    const context = useContext(MeasurementUnitContext);
    if (context === undefined) {
        throw new Error('useMeasurementUnit must be used within a MeasurementUnitProvider');
    }
    return context;
}

export function UnitToggle() {
    const { unit, setUnit } = useMeasurementUnit();

    return (
        <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
            {(['mm', 'cm', 'm'] as const).map((u) => (
                <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`
            px-3 py-1 text-xs font-medium rounded-md transition-all
            ${unit === u
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}
          `}
                >
                    {u}
                </button>
            ))}
        </div>
    );
}
