import type { metMap } from './calc/metMap'

export type Sex = 'male' | 'female'
export type Profile = 'general' | 'athlete'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high'
export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp'
export type DayType = 'training' | 'rest'
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
  macroOverride?: MacroOverrideInput | null
  trainings?: TrainingOverrideInput[] | null
  training?: TrainingOverrideInput | null
  meals?: DayMealInput[]
}

