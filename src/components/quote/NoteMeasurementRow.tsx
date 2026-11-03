'use client';

import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NOTE_SHAPES, NOTE_SHAPE_FIELDS, noteSurfaceArea, legacyBoeiboordAreas, type NoteMeasurement } from '@/lib/note-surfaces';

interface Props {
    row: NoteMeasurement;
    kind: 'wand' | 'plafond';
    onChange: (field: keyof NoteMeasurement, value: string) => void;
    onRemove: () => void;
}

export function NoteMeasurementRow({ row, kind, onChange, onRemove }: Props) {
    const shape = row.shape || 'rectangle';
    const boeiboord = legacyBoeiboordAreas(row);
    const fields: Array<[keyof NoteMeasurement, string]> = [['length', boeiboord ? 'Lengte voorzijde' : 'Lengte']];
    if (boeiboord) fields.push(['width', 'Breedte onderzijde'], ['height', 'Hoogte voorzijde']);
    else if (shape === 'slope') fields.push(['hoogteLinks', 'Hoogte links'], ['hoogteRechts', 'Hoogte rechts']);
    else if (shape === 'gable') fields.push(['height', 'Hoogte zijkant'], ['hoogteNok', 'Hoogte top']);
    else if (shape === 'l-shape' || shape === 'u-shape') {
        const keys: Array<keyof typeof NOTE_SHAPE_FIELDS> = shape === 'l-shape'
            ? ['lengte1', 'hoogte1', 'hoogte2'] : ['lengte1', 'lengte2', 'hoogte1', 'hoogte2', 'hoogte3'];
        fields.push(...keys.map(key => [key, NOTE_SHAPE_FIELDS[key]] as [keyof NoteMeasurement, string]));
    } else fields.push(['width', 'Breedte'], ['height', 'Hoogte']);
    fields.push(['thickness', 'Dikte']);
    const area = noteSurfaceArea(row, kind);
    const left = Number(row.hoogteLinks?.replace(',', '.'));
    const right = Number(row.hoogteRechts?.replace(',', '.'));
    const length = Number(row.length.replace(',', '.'));
    const diagonal = shape === 'slope' && area > 0 && (left === 0 || right === 0)
        ? Math.hypot(length, right - left) : 0;

    return (
        <div className="space-y-1">
            <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
                <div className="col-span-2 space-y-1 lg:col-span-1">
                    <Label className="text-[11px] text-muted-foreground">Titel</Label>
                    <Input aria-label="Titel maatwerk" value={row.title} onChange={e => onChange('title', e.target.value)} placeholder="bijv. Plafond" className="h-9" />
                </div>
                <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Vorm</Label>
                    <Select value={shape} onValueChange={value => onChange('shape', value)}>
                        <SelectTrigger aria-label="Vorm" className="h-9"><SelectValue>{diagonal > 0 ? 'Driehoek' : NOTE_SHAPES[shape as keyof typeof NOTE_SHAPES] || shape}</SelectValue></SelectTrigger>
                        <SelectContent>{Object.entries(NOTE_SHAPES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                {fields.map(([field, label]) => (
                    <div key={field} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{label}</Label>
                        <Input aria-label={label} value={row[field] || ''} onChange={e => onChange(field, e.target.value)} placeholder="mm" inputMode="decimal" className="h-9" />
                    </div>
                ))}
                <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Oppervlakte</Label>
                    <div className="flex h-9 items-center whitespace-nowrap text-sm">{area > 0 ? `${area.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m²` : '— m²'}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} aria-label="Verwijder maatwerkregel"><Trash2 className="h-4 w-4" /></Button>
            </div>
            {boeiboord && <p className="text-xs text-muted-foreground">
                Voorzijde {boeiboord.front.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m² + onderzijde {boeiboord.bottom.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m² · lengte onderzijde {boeiboord.bottomLength} mm
            </p>}
            {diagonal > 0 && <p className="text-xs text-muted-foreground">Driehoek · schuine zijde {diagonal.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm</p>}
        </div>
    );
}
