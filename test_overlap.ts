import { calculateGridGaps } from './src/components/visualizers/shared/framing-utils';

const layout = calculateGridGaps({ wallLength: 5000, spacing: 700, studWidth: 70 });
console.log("Beam Centers:", layout.beamCenters);
console.log("Gaps:", layout.gaps);

// Check if 4900 is in centers
if (layout.beamCenters.includes(4900)) {
    console.log("Beam at 4900 EXISTS");
} else {
    console.log("Beam at 4900 DROPPED");
}
