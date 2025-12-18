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

export type TrainingOverride =
  | {
      type?: string
      met?: number
      durationMin?: number
    }
  | null

export type DayOverrideInputs = {
  activityLevel?: WizardFormData['activityLevel'] | null
  dayType?: WizardFormData['dayType'] | null
  training?: TrainingOverride
  note?: string | null
}

export type DayOverride = {
  id: string
  planId: string
  date: string
  overrides: DayOverrideInputs
  computed: CalculationOutputs
  note?: string
  updatedAt: string
}
