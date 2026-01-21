// Javascript version of correction test
function calculateGridGaps(params) {
    const wallLength = params.wallLength;
    const spacing = params.spacing;
    const studWidth = params.studWidth || 50;
    const startFromRight = params.startFromRight || false;

    const beamCenters = [];
    const gaps = [];

    if (wallLength <= 0 || spacing <= 0) return { beamCenters, gaps };

    const HALF_STUD = studWidth / 2;
    const rawCenters = [];

    // A. First Edge
    rawCenters.push(HALF_STUD); 

    // B. Last Edge
    const lastEdgeCenter = wallLength - HALF_STUD;
    if (Math.abs(lastEdgeCenter - HALF_STUD) > 1) {
        rawCenters.push(lastEdgeCenter);
    }

    // C. Grid
    const numIntervals = Math.floor(wallLength / spacing);

    for (let i = 1; i <= numIntervals; i++) {
        let xRel = i * spacing;
        if (startFromRight) xRel = wallLength - (i * spacing);
        const center = xRel;
        const overlapStart = (center - HALF_STUD < 0 + studWidth - 1);
        const overlapEnd = (center + HALF_STUD > wallLength - studWidth + 1);

        if (!overlapStart && !overlapEnd) {
            rawCenters.push(center);
        }
    }

    // Sort unique
    let uniqueCenters = Array.from(new Set(rawCenters)).sort((a, b) => a - b);

    // GAP CORRECTION (The Logic I Just Added - Copied Here for Test)
    const correctedCenters = [];
    if (uniqueCenters.length > 0) {
        correctedCenters.push(uniqueCenters[0]);

        for (let i = 0; i < uniqueCenters.length - 1; i++) {
            const current = uniqueCenters[i];
            const next = uniqueCenters[i + 1];
            const gap = next - current;

            // Tolerance
            if (gap > spacing + 1) {
                // Gap is too big! Insert a beam in the middle.
                const midPoint = current + (gap / 2);
                correctedCenters.push(midPoint);
            }
            correctedCenters.push(next);
        }
    } else {
        correctedCenters.push(...uniqueCenters);
    }
    
    uniqueCenters = correctedCenters;
    return { beamCenters: uniqueCenters };
}

const layout = calculateGridGaps({ wallLength: 5000, spacing: 700, studWidth: 70 });
console.log("Centers:", layout.beamCenters);

const hasMidBeam = layout.beamCenters.some(c => Math.abs(c - 4582.5) < 1);
if (hasMidBeam) {
    console.log("SUCCESS: Mid-beam found at ~4582.5");
} else {
     // Check if ANY beam is between 4200 and 4965
     const mid = layout.beamCenters.find(c => c > 4200 && c < 4965);
     if (mid) console.log("SUCCESS: Found beam at " + mid);
     else console.log("FAILURE: No mid-beam found.");
}
