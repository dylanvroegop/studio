import { calculateGridGaps } from './src/components/visualizers/shared/framing-utils';

const layout = calculateGridGaps({ wallLength: 5000, spacing: 700, studWidth: 70 });
console.log("Centers:", layout.beamCenters);

// Check for mid-point beam around 4582.5
// 4200 (prev) + 4965 (end) = 9165 / 2 = 4582.5
const hasMidBeam = layout.beamCenters.some(c => Math.abs(c - 4582.5) < 1);

if (hasMidBeam) {
    console.log("SUCCESS: Mid-beam found at ~4582.5");
} else {
    console.log("FAILURE: No mid-beam found.");
}
