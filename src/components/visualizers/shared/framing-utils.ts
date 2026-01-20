
/**
 * framing-utils.ts
 * Shared logic for calculating stud/beam layouts and H.O.H dimensions.
 * Extracted from Reference: WallDrawing.tsx
 */

export interface GapData {
    value: number; // Size of gap in mm
    c1: number;    // Start X (mm relative to wall start, or screen coords?? Utils should ideally return MM)
    c2: number;    // End X (mm)
}

export interface FramingLayout {
    beamCenters: number[]; // X centers in mm
    gaps: GapData[];       // Gaps in mm
}

interface framingParams {
    wallLength: number;
    spacing: number;
    studWidth?: number; // Default 50
    startFromRight?: boolean;
}

export function calculateGridGaps({
    wallLength,
    spacing,
    studWidth = 50,
    startFromRight = false
}: framingParams): FramingLayout {
    const beamCenters: number[] = [];
    const gaps: GapData[] = [];

    if (wallLength <= 0 || spacing <= 0) {
        return { beamCenters, gaps };
    }

    const HALF_STUD = studWidth / 2;

    // 1. Identify Beams (MM)
    // WallDrawing logic: 
    // Start Stud: 0
    // End Stud: Length - StudWidth
    // Grid: k * spacing - HalfStud

    // We only need the CENTERS for dimensions.
    // Start Beam Center: HalfStud
    // Grid Beam Center: k * spacing

    const rawCenters: number[] = [];

    // A. First Edge
    rawCenters.push(HALF_STUD); // 25mm

    // B. Last Edge
    const lastEdgeCenter = wallLength - HALF_STUD;
    if (Math.abs(lastEdgeCenter - HALF_STUD) > 1) { // Avoid dupe if wall is tiny
        rawCenters.push(lastEdgeCenter);
    }

    // C. Grid
    const numIntervals = Math.floor(wallLength / spacing);

    // WallDrawing loop: for (let i = 1; i <= numIntervals; i++)
    for (let i = 1; i <= numIntervals; i++) {
        let xRel = i * spacing;

        if (startFromRight) {
            xRel = wallLength - (i * spacing);
        }

        // Logic Check: WallDrawing calculates gridX (left edge) = xRel - HALF_STUD
        // So Center = xRel ?
        // Line 427 WallDrawing: const gridX = seg.startX + xRel - HALF_STUD;
        // So Center = gridX + HALF_STUD = seg.startX + xRel.
        // YES. The grid line IS the center.

        const center = xRel;

        // Collision Check (Simple)
        // Overlap Start? Center < studWidth ?? WallDrawing checks StartStud + StudWidth.
        // Start stud ends at StudWidth (50).
        // If Center < 50 + HalfStud (75)? 
        // WallDrawing: overlapStart = (gridX < startStudX + STUD_W - 1)
        // gridX = center - 25.
        // overlapStart = (center - 25 < 0 + 50 - 1) => center < 74.

        const overlapStart = (center - HALF_STUD < 0 + studWidth - 1);
        const overlapEnd = (center + HALF_STUD > wallLength - studWidth + 1);

        if (!overlapStart && !overlapEnd) {
            rawCenters.push(center);
        }
    }

    // Sort unique
    const uniqueCenters = Array.from(new Set(rawCenters)).sort((a, b) => a - b);

    // 2. Calculate Gaps
    // WallDrawing Logic:
    // Gap 0: WallStart -> Center[1] (The second beam). 
    // Wait, WallDrawing "centers" array includes *all* studs including edges.
    // Loop i=0 to len-2.
    // Start of Gap = (i==0) ? WallStart : centers[i]
    // End of Gap   = (i==last) ? WallEnd : centers[i+1]

    for (let i = 0; i < uniqueCenters.length - 1; i++) {
        const c1 = (i === 0) ? 0 : uniqueCenters[i];
        const c2 = (i === uniqueCenters.length - 2) ? wallLength : uniqueCenters[i + 1];

        gaps.push({
            value: c2 - c1,
            c1: c1,
            c2: c2
        });
    }

    return { beamCenters: uniqueCenters, gaps };
}
