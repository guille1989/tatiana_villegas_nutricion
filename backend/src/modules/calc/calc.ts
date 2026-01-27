import { metMap } from './metMap'
import type { WizardInputs } from '../types'

const roundInt = (v: number) => Math.round(v)
const round1 = (v: number) => Math.round(v * 10) / 10

const eeeFactorMap: Record<WizardInputs['goal'], number> = {
  fat_loss: 0.7,
  muscle_gain: 1,
  recomp: 1,
}

export const getEeeFactor = (goal: WizardInputs['goal']) => eeeFactorMap[goal] ?? 1

const CARB_FACTOR_DEFAULT = 0.65
const carbFactorRules: Array<{ factor: number; types?: ReadonlySet<string>; prefixes?: readonly string[] }> = [
  { factor: 0.8, prefixes: ['running_', 'cycling_', 'indoor_cycling_', 'swimming_'] },
  {
    factor: 0.75,
    types: new Set(['circuit_training', 'bootcamp']),
    prefixes: ['hiit', 'crossfit', 'elliptical_', 'rowing_'],
  },
  { factor: 0.6, types: new Set(['mobility']), prefixes: ['pilates_', 'yoga_'] },
]

const getTrainingCarbFactor = (trainingType?: WizardInputs['trainingType'] | null) => {
  if (!trainingType) return CARB_FACTOR_DEFAULT
  for (const rule of carbFactorRules) {
    if (rule.types?.has(trainingType)) return rule.factor
    if (rule.prefixes?.some((prefix) => trainingType.startsWith(prefix))) return rule.factor
  }
  return CARB_FACTOR_DEFAULT
}

export const getCarbFactor = (dayType: WizardInputs['dayType'], trainingType?: WizardInputs['trainingType'] | null): number => {
  if (dayType !== 'training') return 0
  return getTrainingCarbFactor(trainingType)
}

export const adjustCarbFat = ({
  protein,
  fats,
  carbs,
  kcalObjectiveDay,
  dayType,
  trainingType,
  eee = 0,
  goal,
  weight,
  source = 'unknown',
}: {
  protein: number
  fats: number
  carbs: number
  kcalObjectiveDay: number
  dayType: WizardInputs['dayType']
  trainingType?: WizardInputs['trainingType'] | null
  eee?: number
  goal?: WizardInputs['goal'] | null
  weight: number
  source?: string
}) => {
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0.85
  const fatFactor = dayType === 'training' ? 1 - carbFactor : 0
  const eeeFactor = goal ? getEeeFactor(goal) : 1
  const rec = goal === 'fat_loss' ? 0.7 : 1
  const grasaMin = 0.6 * weight
  const eeeSafe = Math.max(eee, 0)  
  const baseCarbs = Math.max(carbs, 0)
  let carbsAdjusted: number
  if (dayType === 'training') {
    const extraCarbGrams = (eeeSafe * rec * carbFactor) / 4
    carbsAdjusted = round1(baseCarbs + extraCarbGrams)
  } else {
    carbsAdjusted = round1(baseCarbs)
  }
  const baseFats = Math.max(fats, 0)
  let fatsAdjusted = baseFats
  if (dayType === 'training') {
    const extraFat = (eeeSafe * rec * fatFactor) / 9
    fatsAdjusted = baseFats + extraFat
  }
  fatsAdjusted = round1(Math.max(grasaMin, fatsAdjusted))
  return { carbsAdjusted, fatsAdjusted }
}

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

export type FormulaMeta = {
  rmrMethod: 'cunningham' | 'mifflin'
  version: 'v1'
}

export const calculateInitials = (inputs: WizardInputs): { outputs: CalculationOutputs; formulas: FormulaMeta } => {
  const ffm = inputs.bodyFat !== undefined ? inputs.weight * (1 - inputs.bodyFat / 100) : undefined

  let rmrMethod: FormulaMeta['rmrMethod'] = 'mifflin'
  let rmr =
    inputs.sex === 'male'
      ? 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age + 5
      : 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age - 161

  if (inputs.profile === 'athlete' && ffm !== undefined) {
    rmrMethod = 'cunningham'
    rmr = 500 + 22 * ffm
  }

  const palMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
  } as const
  const pal = palMap[inputs.activityLevel]
  const tdee = rmr * pal

  const goalFactor = { fat_loss: -0.25, muscle_gain: 0.1, recomp: 0 }[inputs.goal]
  const goalFactFactor = { fat_loss: 0.7, muscle_gain: 1, recomp: 0 }[inputs.goal]
  const kcalObjectiveBase = tdee * (1 + goalFactor)

  const proteinFactor = { fat_loss: 2.2, muscle_gain: 2.5, recomp: 1.6 }[inputs.goal]
  const protein = inputs.weight * proteinFactor
  const fats = inputs.weight * goalFactFactor
  const carbs = Math.max(0, (kcalObjectiveBase - (protein * 4 + fats * 9)) / 4)

  const training =
    inputs.training ??
    (inputs.trainingType
      ? {
          type: inputs.trainingType,
          met: inputs.trainingMet ?? metMap[inputs.trainingType],
          durationMin: inputs.duration,
        }
      : undefined)

  const trainingMet = training?.met

  const eee =
    inputs.dayType === 'training' && training?.type && training?.durationMin && trainingMet
      ? ((inputs.weight * trainingMet * 3.5) / 200) * training.durationMin
      : 0

  const eeeAdjusted = eee * getEeeFactor(inputs.goal)
  const kcalObjectiveDay = kcalObjectiveBase + eeeAdjusted

  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    protein,
    fats,
    carbs,
    kcalObjectiveDay: roundInt(kcalObjectiveDay),
    dayType: inputs.dayType,
    trainingType: training?.type ?? inputs.trainingType ?? null,
    eee,
    goal: inputs.goal,
    weight: inputs.weight,
    source: 'calculateInitials',
  })

  const ea = ffm ? (kcalObjectiveDay - eeeAdjusted) / ffm : undefined

  return {
    outputs: {
      rmr: roundInt(rmr),
      pal,
      tdee: roundInt(tdee),
      kcalObjectiveBase: roundInt(kcalObjectiveBase),
      protein: round1(protein),
      fats: round1(fats),
      carbs: round1(carbs),
      eee: roundInt(eee),
      kcalObjectiveDay: roundInt(kcalObjectiveDay),
      carbsAdjusted: round1(carbsAdjusted),
      fatsAdjusted: round1(fatsAdjusted),
      ffm: ffm ? round1(ffm) : undefined,
      ea: ea ? round1(ea) : undefined,
    },
    formulas: { rmrMethod, version: 'v1' },
  }
}
