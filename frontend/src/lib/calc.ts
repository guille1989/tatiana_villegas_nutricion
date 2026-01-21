import { activityOptions, goalOptions, trainingOptions } from './schema'
import type { DayOverrideInputs, WizardInputs } from '../types'

const palMap: Record<(typeof activityOptions)[number]['value'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
}

const goalFactorMap: Record<(typeof goalOptions)[number]['value'], number> = {
  fat_loss: -0.2,
  muscle_gain: 0.1
}

const proteinFactorMap: Record<(typeof goalOptions)[number]['value'], number> = {
  fat_loss: 2.0,
  muscle_gain: 1.8
}

const eeeFactorMap: Record<(typeof goalOptions)[number]['value'], number> = {
  fat_loss: 0.7,
  muscle_gain: 1
}

export const getEeeFactor = (goal: WizardInputs['goal']) => eeeFactorMap[goal] ?? 1

const trainingMetMap: Record<(typeof trainingOptions)[number]['value'], number> = trainingOptions.reduce(
  (acc, item) => {
    acc[item.value] = item.met
    return acc
  },
  {} as Record<string, number>,
)

const isTrainingValue = (value: unknown): value is (typeof trainingOptions)[number]['value'] =>
  typeof value === 'string' && value in trainingMetMap

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

const getTrainingCarbFactor = (trainingType?: (typeof trainingOptions)[number]['value'] | null) => {
  if (!trainingType) return CARB_FACTOR_DEFAULT
  for (const rule of carbFactorRules) {
    if (rule.types?.has(trainingType)) return rule.factor
    if (rule.prefixes?.some((prefix) => trainingType.startsWith(prefix))) return rule.factor
  }
  return CARB_FACTOR_DEFAULT
}

export const getCarbFactor = (
  dayType: WizardInputs['dayType'],
  trainingType?: WizardInputs['trainingType'] | null,
) => {
  if (dayType !== 'training') return 0
  return getTrainingCarbFactor(trainingType)
}

const roundInt = (value: number) => Math.round(value)
const round1 = (value: number) => Math.round(value * 10) / 10

const adjustCarbFat = ({
  protein,
  fats,
  carbs,
  kcalObjectiveDay,
  dayType,
  trainingType,
  eee = 0,
  goal,
  weight,
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
}) => {
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0.85
  const fatFactor = dayType === 'training' ? 1 - carbFactor : 0
  const eeeFactor = goal ? getEeeFactor(goal) : 1
  console.log({ protein, fats, carbs, kcalObjectiveDay, dayType, trainingType, eee, goal, weight, eeeFactor })
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

export type CalculationResult = {
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

export const calculateInitials = (inputs: WizardInputs): CalculationResult => {
  const ffm = inputs.bodyFat !== undefined ? inputs.weight * (1 - inputs.bodyFat / 100) : undefined

  const rmr =
    inputs.profile === 'athlete' && ffm !== undefined
      ? 500 + 22 * ffm
      : inputs.sex === 'male'
        ? 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age + 5
        : 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age - 161

  const pal = palMap[inputs.activityLevel]
  const tdee = rmr * pal

  const goalFactor = goalFactorMap[inputs.goal]
  const kcalObjectiveBase = tdee * (1 + goalFactor)

  const protein = inputs.weight * proteinFactorMap[inputs.goal]
  const fats = inputs.weight * 1.0

  const carbs = Math.max(0, (kcalObjectiveBase - (protein * 4 + fats * 9)) / 4)

  const trainingTypeKey = inputs.trainingType as keyof typeof trainingMetMap | undefined
  const trainingMet = inputs.trainingMet ?? (trainingTypeKey ? trainingMetMap[trainingTypeKey] : undefined)

  const eee =
    inputs.dayType === 'training' && trainingTypeKey && inputs.duration && trainingMet
      ? ((inputs.weight * trainingMet * 3.5) / 200) * inputs.duration
      : 0

  const eeeAdjusted = eee * getEeeFactor(inputs.goal)
  const kcalObjectiveDay = kcalObjectiveBase + eeeAdjusted
  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    protein,
    fats,
    carbs,
    kcalObjectiveDay: roundInt(kcalObjectiveDay),
    dayType: inputs.dayType,
    trainingType: inputs.trainingType,
    eee,
    goal: inputs.goal,
    weight: inputs.weight,
  })

  const ea = ffm ? (kcalObjectiveDay - eeeAdjusted) / ffm : undefined

  return {
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
  }
}

export const calculateDayFromBase = (
  baseInputs: WizardInputs,
  overrideInputs: DayOverrideInputs,
): CalculationResult => {
  const merged: WizardInputs = { ...baseInputs }

  if (overrideInputs.activityLevel !== undefined) {
    merged.activityLevel = overrideInputs.activityLevel ?? baseInputs.activityLevel
  }

  if (overrideInputs.dayType !== undefined) {
    merged.dayType = overrideInputs.dayType ?? baseInputs.dayType
  }

  const trainings = overrideInputs.trainings ?? (overrideInputs.training ? [overrideInputs.training] : [])

  const normalizedTrainings =
    merged.dayType === 'training'
      ? trainings
          .filter(Boolean)
          .map((t) => {
            const type = t?.type && isTrainingValue(t.type) ? t.type : undefined
            const met = t?.met ?? (type ? trainingMetMap[type] : undefined)
            const durationMin = t?.durationMin ?? undefined
            return { type, met, durationMin }
          })
      : []

  if (merged.dayType === 'training' && normalizedTrainings.length === 0 && baseInputs.trainingType && baseInputs.duration) {
    normalizedTrainings.push({
      type: baseInputs.trainingType,
      met: baseInputs.trainingMet ?? trainingMetMap[baseInputs.trainingType],
      durationMin: baseInputs.duration,
    })
  }

  const eeeTotal =
    merged.dayType === 'training'
      ? normalizedTrainings.reduce((acc, session) => {
          if (!session.type || session.met === undefined || !session.durationMin) return acc
          return acc + ((merged.weight * session.met * 3.5) / 200) * session.durationMin
        }, 0)
      : 0

  const baseOutputs = calculateInitials({
    ...baseInputs,
    activityLevel: merged.activityLevel,
    dayType: merged.dayType,
    trainingType: merged.trainingType,
    duration: undefined,
    trainingMet: merged.trainingMet ?? undefined,
  })

  const outputs = { ...baseOutputs, eee: roundInt(eeeTotal) }
  const eeeAdjusted = outputs.eee * getEeeFactor(merged.goal)
  outputs.kcalObjectiveDay = outputs.kcalObjectiveBase + eeeAdjusted
  const carbFactorTrainingType =
    merged.dayType === 'training'
      ? normalizedTrainings.find((session) => session.type)?.type ?? merged.trainingType
      : undefined
  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    protein: outputs.protein,
    fats: outputs.fats,
    carbs: outputs.carbs,
    kcalObjectiveDay: outputs.kcalObjectiveDay,
    dayType: merged.dayType,
    trainingType: carbFactorTrainingType,
    eee: outputs.eee,
    goal: merged.goal,
    weight: merged.weight,
  })
  outputs.carbsAdjusted = carbsAdjusted
  outputs.fatsAdjusted = fatsAdjusted
  if (outputs.ffm !== undefined) {
    outputs.ea = round1((outputs.kcalObjectiveDay - eeeAdjusted) / outputs.ffm)
  }

  return outputs
}
