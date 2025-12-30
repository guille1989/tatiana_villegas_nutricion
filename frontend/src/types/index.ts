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
  formulas?: { rmrMethod: 'cunningham' | 'mifflin'; version: 'v1' }
}

export type Plan = {
  id: string
  createdAt: string
  baseAssessmentId: string
  startDate: string
  days: 5 | 7 | 15 | 30
  title?: string
  status?: 'draft' | 'active' | 'archived'
}

export type TrainingSession = {
  type?: string | null
  met?: number | null
  durationMin?: number | null
} | null

export type Food = {
  id: string
  name: string
  sub_group?: string | null
  group: 'proteinas' | 'carbohidratos' | 'grasas'
  prot_100g: number
  cho_100g: number
  fat_100g: number
  kcal_100g: number
}

export type DayOverrideInputs = {
  activityLevel?: WizardFormData['activityLevel'] | null
  dayType?: WizardFormData['dayType'] | null
  trainings?: TrainingSession[] | null
  // Legacy support
  training?: TrainingSession
  note?: string | null
  meals?: Meal[]
}

export type DayOverride = {
  id: string
  planId: string
  date: string
  overrides: DayOverrideInputs
  computed: CalculationOutputs
  meals?: Meal[]
  note?: string
  updatedAt: string
}

export type MealItem = {
  foodId: string
  nameSnapshot: string
  grams: number
  amount?: number
  mode?: 'grams' | 'portions'
  macros: { protein: number; carbs: number; fat: number }
  kcal: number
}

export type Meal = {
  key: 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'snack2'
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
