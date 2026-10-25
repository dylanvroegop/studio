export interface TravelBudgetInput {
  startingBalance: number;
  monthlyTravel: number;
  monthlyFixed: number;
  upfront: number;
  reserve: number;
  plannedMonths: number;
}

export function calculateTravelBudget(input: TravelBudgetInput): {
  monthlyTotal: number; available: number; affordableMonths: number | null;
  plannedCost: number; remaining: number; shortage: number;
} | null {
  if (Object.values(input).some((value) => !Number.isFinite(value) || value < 0)) return null;
  const cents = (value: number): number => Math.round(value * 100);
  const monthly = cents(input.monthlyTravel) + cents(input.monthlyFixed);
  const available = cents(input.startingBalance) - cents(input.upfront) - cents(input.reserve);
  const plannedCost = cents(input.upfront) + Math.round(monthly * input.plannedMonths);
  const remaining = cents(input.startingBalance) - plannedCost;
  return { monthlyTotal: monthly / 100, available: available / 100,
    affordableMonths: monthly > 0 ? Math.max(0, available) / monthly : null,
    plannedCost: plannedCost / 100, remaining: remaining / 100,
    shortage: Math.max(0, cents(input.reserve) - remaining) / 100 };
}
