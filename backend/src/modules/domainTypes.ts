import type { metMap } from './calc/metMap'

export type Sex = 'male' | 'female'
export type Profile = 'general' | 'athlete'
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'high'
  | 'hyperactive'
  | 'sedentary_training_3'
  | 'sedentary_training_4'
  | 'sedentary_training_5'
  | 'sedentary_training_6'
  | 'light_training_3'
  | 'light_training_4'
  | 'light_training_5'
export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp'
export type DayType = 'rest' | 'training_type_1' | 'training_type_2' | 'training'
export type TrainingType = keyof typeof metMap

export type TrainingInput = {
  type: TrainingType
  met: number
  durationMin: number
}

export type TrainingOverrideInput = {
  type?: TrainingType | null
  met?: number | null
  durationMin?: number | null
}

export type MacroOverrideInput = {
  protein: number
  carbsAdjusted: number
  fatsAdjusted: number
}

export type DayMealItemInput = {
  foodId: string
  nameSnapshot: string
  grams: number
  macros: {
    protein: number
    carbs: number
    fat: number
  }
  kcal: number
}

export type DayMealInput = {
  key: 'breakfast' | 'lunch' | 'snack' | 'snack2' | 'dinner'
  name: string
  items: DayMealItemInput[]
  totals: {
    protein: number
    carbs: number
    fat: number
    kcal: number
  }
}

export type MealPortionTargetInput = {
  key: DayMealInput['key']
  name: string
  portions: {
    protein: number
    carbs: number
    fat: number
  }
}

export type MealCategoryDistributionInput = {
  category: string
  name: string
  portions: {
    breakfast: number
    snack: number
    lunch: number
    snack2: number
    dinner: number
    extras: number
  }
}

export type WizardInputs = {
  name: string
  sex: Sex
  age: number
  weight: number
  height: number
  bodyFat?: number
  profile: Profile
  activityLevel: ActivityLevel
  goal: Goal
  dayType: DayType
  trainingType?: TrainingType
  trainingMet?: number
  duration?: number
  training?: TrainingInput
}

export type DayOverrideInputs = {
  activityLevel?: ActivityLevel | null
  dayType?: DayType | null
  macroDistributionId?: string | null
  macroOverride?: MacroOverrideInput | null
  trainings?: TrainingOverrideInput[] | null
  training?: TrainingOverrideInput | null
  meals?: DayMealInput[]
  mealPortionTargets?: MealPortionTargetInput[] | null
  mealCategoryDistribution?: MealCategoryDistributionInput[] | null
}
