// Javascript version
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

        // Collision Check (Simple)
        const overlapStart = (center - HALF_STUD < 0 + studWidth - 1);
        const overlapEnd = (center + HALF_STUD > wallLength - studWidth + 1);

        if (!overlapStart && !overlapEnd) {
            rawCenters.push(center);
        } else {
             console.log("Collision detected for center " + center + ". overlapStart: " + overlapStart + ", overlapEnd: " + overlapEnd);
        }
    }

    const uniqueCenters = Array.from(new Set(rawCenters)).sort((a, b) => a - b);
    return { beamCenters: uniqueCenters };
}

const layout = calculateGridGaps({ wallLength: 5000, spacing: 700, studWidth: 70 });
console.log("Beam Centers:", layout.beamCenters);
if (layout.beamCenters.includes(4900)) {
    console.log("Beam at 4900 EXISTS");
} else {
    console.log("Beam at 4900 DROPPED");
}
