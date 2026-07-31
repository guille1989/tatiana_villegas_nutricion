import type { WizardFormData } from '../lib/schema'

export type WizardInputs = WizardFormData & { trainingMet?: number | null }

export type CalculationOutputs = {
  rmr: number
  pal: number
  tdee: number
  kcalObjectiveBase: number
  protein: number
  fats: number
  carbs: number
  eee: number
  kcalObjectiveDay: number
  carbsAdjusted: number
  fatsAdjusted: number
  ffm?: number
  ea?: number
}

export type Assessment = {
  id: string
  createdAt: string
  inputs: WizardInputs
  outputs: CalculationOutputs
  formulas?: { rmrMethod: 'excel_average' | 'cunningham' | 'mifflin'; version: 'v2_excel' | 'v1' }
}

export type Plan = {
  id: string
  userId?: string
  createdAt: string
  baseAssessmentId: string
  startDate: string
  days: 5 | 7 | 15 | 30
  title?: string
  status?: 'draft' | 'active' | 'archived'
  macroOverrides?: PlanMacroOverride[]
  macroDistributions?: PlanMacroDistribution[]
}

export type PlanMacroDistribution = {
  id: string
  name: string
  dayType?: WizardFormData['dayType'] | string | null
  kcalDelta?: number
  carbsPerKg: number
  proteinPerKg: number
  isDefault: boolean
  mealCategoryDistribution?: MealCategoryDistribution[] | null
  generatedMenu?: unknown
  mealPreferences?: string | null
}

export type PlanMacroOverride = {
  effectiveFrom: string
  macros: {
    kcalObjectiveDay: number
    protein: number
    carbsAdjusted: number
    fatsAdjusted: number
  }
}

export type TrainingSession = {
  type?: string | null
  met?: number | null
  durationMin?: number | null
} | null

export type Food = {
  id: string
  name: string
  subgrup?: string | null
  group: 'proteinas' | 'carbohidratos' | 'grasas' | 'extras' | 'vegetales'
  mealCategory?:
    | 'whole_dairy'
    | 'protein_dairy'
    | 'semi_dairy'
    | 'skim_dairy'
    | 'vegetables'
    | 'fruit'
    | 'cereals'
    | 'legumes'
    | 'sugars'
    | 'lean_protein'
    | 'semi_fat_protein'
    | 'fat_protein'
    | 'fats'
    | null
  prot_100g: number
  cho_100g: number
  fat_100g: number
  kcal_100g: number
  max_portion_in_meal?: number | null
  default_portion_g?: number | null
}

export type MealKey = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'snack2' | 'extras'

export type MealPortionTarget = {
  key: MealKey
  name: string
  portions: { protein: number; carbs: number; fat: number }
}

export type MealDistributionColumnKey =
  | 'breakfast'
  | 'snack'
  | 'lunch'
  | 'snack2'
  | 'dinner'
  | 'extras'

export type MealCategoryDistribution = {
  category: string
  name: string
  portions: Record<MealDistributionColumnKey, number>
}

export type IngredientStatus = 'active' | 'inactive'

export type Ingredient = Food & {
  status?: IngredientStatus
  version?: number
  versionedFrom?: string | null
  replacedBy?: string | null
}

export type DayOverrideInputs = {
  activityLevel?: WizardFormData['activityLevel'] | null
  dayType?: WizardFormData['dayType'] | null
  macroDistributionId?: string | null
  macroOverride?: {
    protein: number
    carbsAdjusted: number
    fatsAdjusted: number
  } | null
  trainings?: TrainingSession[] | null
  // Legacy support
  training?: TrainingSession
  note?: string | null
  meals?: Meal[]
  mealPortionTargets?: MealPortionTarget[] | null
  mealCategoryDistribution?: MealCategoryDistribution[] | null
}

export type DayOverride = {
  id: string
  planId: string
  date: string
  overrides: DayOverrideInputs
  computed: CalculationOutputs
  meals?: Meal[]
  generatedMenu?: unknown
  generatedSelections?: Record<number, number>
  note?: string
  updatedAt: string
}

export type MealItem = {
  foodId: string
  nameSnapshot: string
  group?: Food['group']
  grams: number
  amount?: number
  mode?: 'grams' | 'portions'
  macros: { protein: number; carbs: number; fat: number }
  kcal: number
  max_portion_in_meal?: number | null
}

export type Meal = {
  key: MealKey
  name: string
  items: MealItem[]
  totals: { protein: number; carbs: number; fat: number; kcal: number }
}

export type MealTemplate = {
  id: string
  createdAt: string
  name: string
  items: MealItem[]
  totals: { protein: number; carbs: number; fat: number; kcal: number }
}
