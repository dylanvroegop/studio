import { NOTE_SHAPES, NOTE_SHAPE_FIELDS, legacyBoeiboordDimensions, type NoteMeasurement } from './note-surfaces';

function dimension(label: string, value: string | undefined): string {
    const clean = value?.trim().replace(/\s*mm$/i, '').trim();
    return clean ? `${label} = ${clean} mm` : '';
}

function shapeText(row: NoteMeasurement): string {
    const shape = row.shape || 'rectangle';
    return `Vorm: ${(NOTE_SHAPES[shape as keyof typeof NOTE_SHAPES] || shape).toLowerCase()}`;
}

function frontDimensions(row: NoteMeasurement): string[] {
    return [
        dimension('Lengte voorzijde', row.length),
        dimension('Hoogte voorzijde', row.height),
        ...Object.entries(NOTE_SHAPE_FIELDS).map(([key, label]) => dimension(`${label} voorzijde`, row[key as keyof typeof NOTE_SHAPE_FIELDS])),
    ];
}

/** Leesbare maattekst; de opgeslagen vlakken en hun oppervlakte blijven ongewijzigd. */
export function formatNoteMeasurementTexts(rows: NoteMeasurement[]): string[] {
    const sides = rows.map(row => row.title.match(/^(.*) — (Voorzijde|Onderzijde)( \d+)?$/));
    const consumed = new Set<number>();
    return rows.flatMap((row, index) => {
        if (consumed.has(index)) return [];
        // Oude calculatieregels bewaren de onafhankelijke onderlengte in de titel.
        const legacy = legacyBoeiboordDimensions(row);
        if (legacy) {
            return [[legacy.title, [
                dimension('Lengte onderzijde', legacy.bottomLength), dimension('Breedte onderzijde', row.width),
                ...frontDimensions(row), dimension('Dikte', row.thickness), shapeText(row),
            ].filter(Boolean).join(' | ')].join(' | ')];
        }

        const side = sides[index];
        if (side) {
            const matches = sides.flatMap((candidate, otherIndex) => candidate && candidate[1] === side[1]
                && candidate[3] === side[3] ? [otherIndex] : []);
            const fronts = matches.filter(i => sides[i]![2] === 'Voorzijde');
            const bottoms = matches.filter(i => sides[i]![2] === 'Onderzijde');
            // Alleen een uniek paar samen tonen; gelijke onderdelen blijven apart.
            if (fronts.length <= 1 && bottoms.length <= 1) {
                matches.forEach(i => consumed.add(i));
                const front = fronts.length ? rows[fronts[0]] : undefined;
                const bottom = bottoms.length ? rows[bottoms[0]] : undefined;
                return [[`${side[1]}${side[3] || ''}`, ...[
                    ...(bottom ? [dimension('Lengte onderzijde', bottom.length), dimension('Breedte onderzijde', bottom.width)] : []),
                    ...(front ? frontDimensions(front) : []),
                    shapeText(front || bottom!),
                ].filter(Boolean)].join(' | ')];
            }
        }

        const values = [
            dimension('Lengte', row.length), dimension('Breedte', row.width),
            dimension('Hoogte', row.height), dimension('Dikte', row.thickness),
            ...Object.entries(NOTE_SHAPE_FIELDS).map(([key, label]) => dimension(label, row[key as keyof typeof NOTE_SHAPE_FIELDS])),
        ].filter(Boolean);
        return values.length ? [[row.title || 'Maatwerk', ...values, shapeText(row)].join(' | ')] : [];
    });
}
