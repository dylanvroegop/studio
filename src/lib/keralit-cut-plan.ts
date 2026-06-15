export interface KeralitCutPlanInput {
  items: Array<Record<string, unknown>>;
  sectionKey: string;
  stockLengthMm: number;
  workingWidthMm: number;
}

export interface KeralitStockLength {
  cutsMm: number[];
  usedMm: number;
  remainderMm: number;
}

export interface KeralitCutPlan {
  calculationMethod: 'one_dimensional_cut_plan';
  stockLengthMm: number;
  workingWidthMm: number;
  cutsMm: number[];
  stockLengths: KeralitStockLength[];
  requiredStockLengths: number;
  totalCutLengthMm: number;
  totalRemainderMm: number;
  valid: boolean;
  error: string | null;
}

export function parseMaterialDimensionMm(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (/\bcm\b/i.test(normalized)) return parsed * 10;
  if (/\bm\b/i.test(normalized) && !/\bmm\b/i.test(normalized)) return parsed * 1000;
  return parsed;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildTriangleCuts(lengthMm: number, heightMm: number, workingWidthMm: number): number[] {
  const courses = Math.ceil(heightMm / workingWidthMm);
  const cuts: number[] = [];

  for (let course = 1; course <= courses; course += 1) {
    const coveredHeightMm = Math.min(heightMm, course * workingWidthMm);
    cuts.push(Math.ceil(lengthMm * (coveredHeightMm / heightMm)));
  }

  return cuts;
}

function buildRectangleCuts(lengthMm: number, heightMm: number, workingWidthMm: number): number[] {
  return Array.from({ length: Math.ceil(heightMm / workingWidthMm) }, () => Math.ceil(lengthMm));
}

function buildRequiredCuts(
  items: Array<Record<string, unknown>>,
  sectionKey: string,
  workingWidthMm: number
): number[] {
  const isUnderside = sectionKey.includes('onderkant');
  const cuts: number[] = [];

  items.forEach((item) => {
    const multiplier = item?.boeiboord_mirror === true ? 2 : 1;
    if (isUnderside) {
      const lengthMm = toPositiveNumber(item?.lengte_onderzijde);
      const widthMm = toPositiveNumber(item?.breedte);
      if (!lengthMm || !widthMm) return;
      const itemCuts = buildRectangleCuts(lengthMm, widthMm, workingWidthMm);
      for (let copy = 0; copy < multiplier; copy += 1) cuts.push(...itemCuts);
      return;
    }

    const lengthMm = toPositiveNumber(item?.lengte);
    const heightMm = toPositiveNumber(item?.hoogte);
    if (!lengthMm || !heightMm) return;

    const shape = String(item?.shape || 'rectangle').toLowerCase();
    const itemCuts = shape === 'slope' || shape === 'gable'
      ? buildTriangleCuts(lengthMm, heightMm, workingWidthMm)
      : buildRectangleCuts(lengthMm, heightMm, workingWidthMm);
    for (let copy = 0; copy < multiplier; copy += 1) cuts.push(...itemCuts);
  });

  return cuts;
}

function packCutsBestFitDecreasing(cutsMm: number[], stockLengthMm: number): KeralitStockLength[] {
  const bins: Array<{ cutsMm: number[]; usedMm: number }> = [];
  const sortedCuts = [...cutsMm].sort((a, b) => b - a);

  sortedCuts.forEach((cutMm) => {
    let bestBinIndex = -1;
    let smallestRemainder = Number.POSITIVE_INFINITY;

    bins.forEach((bin, index) => {
      const remainder = stockLengthMm - bin.usedMm - cutMm;
      if (remainder >= 0 && remainder < smallestRemainder) {
        bestBinIndex = index;
        smallestRemainder = remainder;
      }
    });

    if (bestBinIndex === -1) {
      bins.push({ cutsMm: [cutMm], usedMm: cutMm });
      return;
    }

    bins[bestBinIndex].cutsMm.push(cutMm);
    bins[bestBinIndex].usedMm += cutMm;
  });

  return bins.map((bin) => ({
    cutsMm: bin.cutsMm.sort((a, b) => b - a),
    usedMm: bin.usedMm,
    remainderMm: stockLengthMm - bin.usedMm,
  }));
}

export function buildKeralitCutPlan(input: KeralitCutPlanInput): KeralitCutPlan {
  const cutsMm = buildRequiredCuts(input.items, input.sectionKey, input.workingWidthMm);
  const oversizedCut = cutsMm.find((cutMm) => cutMm > input.stockLengthMm);

  if (oversizedCut) {
    return {
      calculationMethod: 'one_dimensional_cut_plan',
      stockLengthMm: input.stockLengthMm,
      workingWidthMm: input.workingWidthMm,
      cutsMm,
      stockLengths: [],
      requiredStockLengths: 0,
      totalCutLengthMm: cutsMm.reduce((sum, cutMm) => sum + cutMm, 0),
      totalRemainderMm: 0,
      valid: false,
      error: `Benodigde ononderbroken lengte ${oversizedCut} mm is langer dan de handelslengte ${input.stockLengthMm} mm.`,
    };
  }

  const stockLengths = packCutsBestFitDecreasing(cutsMm, input.stockLengthMm);
  const totalCutLengthMm = cutsMm.reduce((sum, cutMm) => sum + cutMm, 0);

  return {
    calculationMethod: 'one_dimensional_cut_plan',
    stockLengthMm: input.stockLengthMm,
    workingWidthMm: input.workingWidthMm,
    cutsMm,
    stockLengths,
    requiredStockLengths: stockLengths.length,
    totalCutLengthMm,
    totalRemainderMm: (stockLengths.length * input.stockLengthMm) - totalCutLengthMm,
    valid: cutsMm.length > 0,
    error: cutsMm.length > 0 ? null : 'Geen geldige baanlengtes gevonden.',
  };
}
