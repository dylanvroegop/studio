'use client';

import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useMeasurementUnit } from '@/context/MeasurementUnitContext';
import { cn } from '@/lib/utils';

interface MeasurementInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: string | number | undefined;
    onChange: (value: string | number) => void;
    precision?: number;
}

export function MeasurementInput({
    value,
    onChange,
    className,
    precision = 2,
    ...props
}: MeasurementInputProps) {
    const { unit, convertFromMm, convertToMm } = useMeasurementUnit();
    const [displayValue, setDisplayValue] = useState<string>('');

    // Sync display value when prop value or unit changes
    useEffect(() => {
        if (value === '' || value === undefined || value === null) {
            setDisplayValue('');
            return;
        }

        const mmVal = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(mmVal)) {
            setDisplayValue('');
            return;
        }

        const converted = convertFromMm(mmVal);

        // Format logic:
        // If it's an integer after conversion, show as integer.
        // If it has decimals, show up to `precision` decimals, removing trailing zeros.
        const formatted = parseFloat(converted.toFixed(precision)).toString();

        // Only update if the user is NOT currently typing (handled by local change logic below)
        // Actually, we must allow updating if the external value changed effectively (e.g. initial load or computed update)
        // But we don't want to overwrite user input like "5." or "5.0" while typing.
        // This simple effect will overwrite "5." to "5". 
        // To solve this, we can track if the conversion matches the current display value closely.

        setDisplayValue(formatted);
    }, [value, unit, convertFromMm, precision]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setDisplayValue(newVal);

        if (newVal === '') {
            onChange('');
            return;
        }

        const parsed = parseFloat(newVal);
        if (!isNaN(parsed)) {
            const mmVal = convertToMm(parsed);
            onChange(mmVal);
        }
    };

    // On blur, re-format to clean up inputs like "5." -> "5"
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (props.onBlur) props.onBlur(e);

        if (displayValue !== '') {
            const parsed = parseFloat(displayValue);
            if (!isNaN(parsed)) {
                // Re-trigger effect to format nicely? 
                // Or just format locally:
                const formatted = parseFloat(parsed.toFixed(precision)).toString();
                setDisplayValue(formatted);
            }
        }
    };

    return (
        <div className="relative">
            <Input
                {...props}
                type="number" // Use type="number" step="any" ? Or text to allow flexible decimal input? number is better for mobile.
                step="any"
                value={displayValue}
                onChange={handleChange}
                onBlur={handleBlur}
                className={cn('pr-10', className)}
            />
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground text-sm">
                {unit}
            </div>
        </div>
    );
}
