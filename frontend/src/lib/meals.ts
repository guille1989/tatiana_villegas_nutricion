import type { Meal } from "../types";

export type MealCount = 3 | 4 | 5;
export type MacroTargets = { protein: number; carbs: number; fat: number };

type MealConfig = { key: Meal["key"]; name: string; weight: number };

const MEAL_CONFIG: Record<MealCount, MealConfig[]> = {
  3: [
    { key: "breakfast", name: "Desayuno", weight: 0.3 },
    { key: "lunch", name: "Comida", weight: 0.4 },
    { key: "dinner", name: "Cena", weight: 0.3 },
  ],
  4: [
    { key: "breakfast", name: "Desayuno", weight: 0.28 },
    { key: "snack", name: "Merienda", weight: 0.14 },
    { key: "lunch", name: "Comida", weight: 0.34 },
    { key: "dinner", name: "Cena", weight: 0.24 },
  ],
  5: [
    { key: "breakfast", name: "Desayuno", weight: 0.24 },
    { key: "snack", name: "Merienda 1", weight: 0.12 },
    { key: "lunch", name: "Comida", weight: 0.3 },
    { key: "snack2", name: "Merienda 2", weight: 0.1 },
    { key: "dinner", name: "Cena", weight: 0.24 },
  ],
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const emptyTargets = (): MacroTargets => ({ protein: 0, carbs: 0, fat: 0 });

const initTargets = (): Record<Meal["key"], MacroTargets> => ({
  breakfast: emptyTargets(),
  snack: emptyTargets(),
  lunch: emptyTargets(),
  snack2: emptyTargets(),
  dinner: emptyTargets(),
});

export const getMealsByCount = (count: MealCount): Meal[] =>
  MEAL_CONFIG[count].map((meal) => ({
    key: meal.key,
    name: meal.name,
    items: [],
    totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  }));

export const getWeightsByCount = (count: MealCount) =>
  MEAL_CONFIG[count].map(({ key, weight, name }) => ({ key, weight, name }));

export const distributeMacros = (
  dailyMacros: MacroTargets,
  weights: { key: Meal["key"]; weight: number }[]
) => {
  const result = initTargets();
  if (weights.length === 0) return result;

  let sumProtein = 0;
  let sumCarbs = 0;
  let sumFat = 0;

  weights.forEach((meal) => {
    const macros = {
      protein: round1(dailyMacros.protein * meal.weight),
      carbs: round1(dailyMacros.carbs * meal.weight),
      fat: round1(dailyMacros.fat * meal.weight),
    };
    result[meal.key] = macros;
    sumProtein += macros.protein;
    sumCarbs += macros.carbs;
    sumFat += macros.fat;
  });

  const residual = {
    protein: round1(dailyMacros.protein - sumProtein),
    carbs: round1(dailyMacros.carbs - sumCarbs),
    fat: round1(dailyMacros.fat - sumFat),
  };

  const mainKey = weights.find((meal) => meal.key === "lunch")?.key ?? weights[0].key;
  result[mainKey] = {
    protein: round1(result[mainKey].protein + residual.protein),
    carbs: round1(result[mainKey].carbs + residual.carbs),
    fat: round1(result[mainKey].fat + residual.fat),
  };

  return result;
};
