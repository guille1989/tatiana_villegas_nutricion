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
  muscle_gain: 0.1,
  recomp: 0,
}

const proteinFactorMap: Record<(typeof goalOptions)[number]['value'], number> = {
  fat_loss: 2.0,
  muscle_gain: 1.8,
  recomp: 1.6,
}

const trainingMetMap: Record<(typeof trainingOptions)[number]['value'], number> = trainingOptions.reduce(
  (acc, item) => {
    acc[item.value] = item.met
    return acc
  },
  {} as Record<string, number>,
)

const roundInt = (value: number) => Math.round(value)
const round1 = (value: number) => Math.round(value * 10) / 10

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

  const trainingMet =
    inputs.trainingMet ?? (inputs.trainingType ? trainingMetMap[inputs.trainingType] : undefined)

  const eee =
    inputs.dayType === 'training' && inputs.trainingType && inputs.duration && trainingMet
      ? ((inputs.weight * trainingMet * 3.5) / 200) * inputs.duration
      : 0

  const kcalObjectiveDay = kcalObjectiveBase + eee

  const carbsFactor = inputs.dayType === 'training' ? 1.2 : 0.85
  const fatsFactor = inputs.dayType === 'training' ? 0.85 : 1.2

  const carbsAdjusted = carbs * carbsFactor
  const fatsAdjusted = fats * fatsFactor

  const ea = ffm ? (kcalObjectiveDay - eee) / ffm : undefined

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

  if (overrideInputs.training !== undefined) {
    const training = overrideInputs.training
    if (training === null) {
      merged.trainingType = baseInputs.trainingType
      merged.duration = baseInputs.duration
      merged.trainingMet = baseInputs.trainingMet ?? undefined
    } else {
      if (training.type !== undefined) {
        merged.trainingType = training.type ?? undefined
      }
      if (training.durationMin !== undefined) {
        merged.duration = training.durationMin ?? undefined
      }
      if (training.met !== undefined) {
        merged.trainingMet = training.met ?? undefined
      }
    }
  }

  if (merged.dayType === 'rest') {
    merged.trainingType = undefined
    merged.duration = undefined
    merged.trainingMet = undefined
  }

  if (merged.dayType === 'training') {
    if (!merged.trainingType && baseInputs.trainingType) merged.trainingType = baseInputs.trainingType
    if (merged.duration === undefined && baseInputs.duration !== undefined) {
      merged.duration = baseInputs.duration
    }
    if (merged.trainingMet === undefined && baseInputs.trainingMet !== undefined) {
      merged.trainingMet = baseInputs.trainingMet ?? undefined
    }
  }

  return calculateInitials(merged)
}
