import { calculateGridGaps } from './src/components/visualizers/shared/framing-utils';

const spacing = 600;

console.log("Testing StudWidth = 70 (Current)");
for (let len = 600; len < 3200; len += 10) {
    const layout = calculateGridGaps({ wallLength: len, spacing, studWidth: 70 });
    const gaps = layout.gaps;
    if (gaps.length > 0) {
        const lastGap = gaps[gaps.length - 1];
        if (Math.abs(lastGap.value - 800) < 1) {
            console.log(`Found 800mm gap! Length: ${len}, Spacing: ${spacing}, StudWidth: 70`);
            console.log(gaps);
        }
    }
}

console.log("Testing StudWidth = 50 (Old)");
for (let len = 600; len < 3200; len += 10) {
    const layout = calculateGridGaps({ wallLength: len, spacing, studWidth: 50 });
    const gaps = layout.gaps;
    if (gaps.length > 0) {
         const lastGap = gaps[gaps.length - 1];
         if (Math.abs(lastGap.value - 800) < 1) {
            console.log(`Found 800mm gap! Length: ${len}, Spacing: ${spacing}, StudWidth: 50`);
         }
    }
}
