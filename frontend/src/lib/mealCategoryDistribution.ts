import type {
  MealCategoryDistribution,
  MealDistributionColumnKey,
} from '../types'

type MacroSummary = { protein: number; carbs: number; fat: number }

export const MEAL_DISTRIBUTION_COLUMNS: Array<{
  key: MealDistributionColumnKey
  label: string
}> = [
  { key: 'breakfast', label: 'Desayuno' },
  { key: 'snack', label: 'Merienda' },
  { key: 'lunch', label: 'Comida' },
  { key: 'snack2', label: 'Merienda 2' },
  { key: 'dinner', label: 'Cena' },
  { key: 'extras', label: 'Extras' },
]

export const FOOD_CATEGORY_EXCHANGES: Array<{
  key: string
  name: string
  macros: MacroSummary
}> = [
  { key: 'whole_dairy', name: 'Lácteos enteros', macros: { carbs: 9, protein: 7, fat: 7 } },
  { key: 'protein_dairy', name: 'Lácteos proteicos', macros: { carbs: 2, protein: 7, fat: 0 } },
  { key: 'semi_dairy', name: 'Lácteos semidesnatados', macros: { carbs: 9, protein: 7, fat: 3 } },
  { key: 'skim_dairy', name: 'Lácteos desnatados', macros: { carbs: 12, protein: 9, fat: 0 } },
  { key: 'vegetables', name: 'Verduras y hortalizas', macros: { carbs: 4, protein: 2, fat: 0.5 } },
  { key: 'fruit', name: 'Fruta', macros: { carbs: 15, protein: 1, fat: 0.25 } },
  {
    key: 'cereals',
    name: 'Cereales, tubérculos y derivados',
    macros: { carbs: 14, protein: 2, fat: 0.5 },
  },
  { key: 'legumes', name: 'Legumbres', macros: { carbs: 14, protein: 7, fat: 0.5 } },
  { key: 'sugars', name: 'Azúcares', macros: { carbs: 10, protein: 0, fat: 0 } },
  { key: 'lean_protein', name: 'Proteicos magros', macros: { carbs: 0, protein: 7, fat: 0.5 } },
  {
    key: 'semi_fat_protein',
    name: 'Proteicos semigrasos',
    macros: { carbs: 0, protein: 7, fat: 2 },
  },
  { key: 'fat_protein', name: 'Proteicos grasos', macros: { carbs: 0, protein: 7, fat: 5 } },
  { key: 'fats', name: 'Grasas', macros: { carbs: 0, protein: 0, fat: 5 } },
]

export const MACRO_DISTRIBUTION_TOLERANCE: MacroSummary = {
  protein: 3.5,
  carbs: 7.5,
  fat: 2.5,
}

const emptyPortions = (): Record<MealDistributionColumnKey, number> => ({
  breakfast: 0,
  snack: 0,
  lunch: 0,
  snack2: 0,
  dinner: 0,
  extras: 0,
})

export const roundExchange = (value: number) => Math.round(value * 2) / 2

export const createEmptyCategoryDistribution = (): MealCategoryDistribution[] =>
  FOOD_CATEGORY_EXCHANGES.map((category) => ({
    category: category.key,
    name: category.name,
    portions: emptyPortions(),
  }))

export const normalizeCategoryDistribution = (
  existing?: MealCategoryDistribution[] | null,
) => {
  const existingMap = new Map((existing ?? []).map((item) => [item.category, item]))
  return FOOD_CATEGORY_EXCHANGES.map((category) => {
    const current = existingMap.get(category.key)
    return {
      category: category.key,
      name: category.name,
      portions: MEAL_DISTRIBUTION_COLUMNS.reduce(
        (acc, column) => {
          acc[column.key] = roundExchange(current?.portions[column.key] ?? 0)
          return acc
        },
        emptyPortions(),
      ),
    }
  })
}

export const calculateCategoryDistributionMacros = (
  distribution: MealCategoryDistribution[],
) => {
  const byMeal = MEAL_DISTRIBUTION_COLUMNS.reduce(
    (acc, column) => {
      acc[column.key] = { protein: 0, carbs: 0, fat: 0 }
      return acc
    },
    {} as Record<MealDistributionColumnKey, MacroSummary>,
  )

  distribution.forEach((row) => {
    const category = FOOD_CATEGORY_EXCHANGES.find((item) => item.key === row.category)
    if (!category) return
    MEAL_DISTRIBUTION_COLUMNS.forEach((column) => {
      const portions = row.portions[column.key] ?? 0
      byMeal[column.key].protein += portions * category.macros.protein
      byMeal[column.key].carbs += portions * category.macros.carbs
      byMeal[column.key].fat += portions * category.macros.fat
    })
  })

  const total = Object.values(byMeal).reduce<MacroSummary>(
    (acc, macros) => ({
      protein: acc.protein + macros.protein,
      carbs: acc.carbs + macros.carbs,
      fat: acc.fat + macros.fat,
    }),
    { protein: 0, carbs: 0, fat: 0 },
  )

  return { byMeal, total }
}

const distributeTotalAcrossMeals = (total: number) => {
  const weights: Record<MealDistributionColumnKey, number> = {
    breakfast: 0.24,
    snack: 0.12,
    lunch: 0.3,
    snack2: 0.1,
    dinner: 0.24,
    extras: 0,
  }
  const portions = emptyPortions()
  MEAL_DISTRIBUTION_COLUMNS.forEach((column) => {
    portions[column.key] = roundExchange(total * weights[column.key])
  })
  const assigned = Object.values(portions).reduce((sum, value) => sum + value, 0)
  portions.lunch = Math.max(0, roundExchange(portions.lunch + total - assigned))
  return portions
}

export const buildAutomaticCategoryDistribution = (
  target: MacroSummary,
): MealCategoryDistribution[] => {
  let best = {
    cereals: 0,
    leanProtein: 0,
    fats: 0,
    score: Number.POSITIVE_INFINITY,
  }
  const maxCereals = Math.max(0, Math.ceil(target.carbs / 14) + 4)
  const maxLeanProtein = Math.max(0, Math.ceil(target.protein / 7) + 4)

  for (let cereals = 0; cereals <= maxCereals; cereals += 0.5) {
    for (let leanProtein = 0; leanProtein <= maxLeanProtein; leanProtein += 0.5) {
      const carbs = cereals * 14
      const protein = cereals * 2 + leanProtein * 7
      const baseFat = cereals * 0.5 + leanProtein * 0.5
      const fats = Math.max(0, roundExchange((target.fat - baseFat) / 5))
      const fat = baseFat + fats * 5
      const score =
        Math.abs(target.carbs - carbs) / MACRO_DISTRIBUTION_TOLERANCE.carbs +
        Math.abs(target.protein - protein) / MACRO_DISTRIBUTION_TOLERANCE.protein +
        Math.abs(target.fat - fat) / MACRO_DISTRIBUTION_TOLERANCE.fat
      if (score < best.score) best = { cereals, leanProtein, fats, score }
    }
  }

  const distribution = createEmptyCategoryDistribution()
  const totalsByCategory: Record<string, number> = {
    cereals: best.cereals,
    lean_protein: best.leanProtein,
    fats: best.fats,
  }
  return distribution.map((row) => ({
    ...row,
    portions: distributeTotalAcrossMeals(totalsByCategory[row.category] ?? 0),
  }))
}

export const isCategoryDistributionBalanced = (
  used: MacroSummary,
  target: MacroSummary,
) =>
  (['protein', 'carbs', 'fat'] as const).every(
    (key) => Math.abs(target[key] - used[key]) <= MACRO_DISTRIBUTION_TOLERANCE[key],
  )
