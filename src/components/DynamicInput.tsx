import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MeasurementInput } from '@/components/MeasurementInput';
import { cn } from '@/lib/utils';
import { MeasurementField } from '@/lib/job-registry';

interface DynamicInputProps {
    field: MeasurementField;
    value: any;
    onChange: (val: any) => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    disabled?: boolean;
    className?: string;
    labelOverride?: string;
    labelClassName?: string;
}

export function DynamicInput({
    field,
    value,
    onChange,
    onKeyDown,
    disabled,
    className,
    labelOverride,
    labelClassName
}: DynamicInputProps) {
    return (
        <div className={cn("space-y-2", className)}>
            <Label htmlFor={field.key} className={labelClassName}>
                {labelOverride ?? field.label}
                {field.type === 'number' && !field.optional && ' *'}
            </Label>

            {field.type === 'textarea' ? (
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Optioneel. Alleen invullen bij bijzonderheden.</p>
                    <Textarea
                        id={field.key}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="resize-none"
                        rows={3}
                    />
                </div>
            ) : field.type === 'select' ? (
                <Select value={value} onValueChange={onChange} disabled={disabled}>
                    <SelectTrigger id={field.key}>
                        <SelectValue placeholder={field.placeholder || "Selecteer..."} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <MeasurementInput
                    id={field.key}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(val: string | number) => onChange(val)}
                    onKeyDown={onKeyDown}
                    disabled={disabled}
                    className={field.suffix ? 'pr-10' : ''}
                />
            )}
        </div>
    );
}
