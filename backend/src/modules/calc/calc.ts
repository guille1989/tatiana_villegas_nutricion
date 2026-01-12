import { metMap } from './metMap'
import type { WizardInputs } from '../types'

const roundInt = (v: number) => Math.round(v)
const round1 = (v: number) => Math.round(v * 10) / 10

export const adjustCarbFat = ({
  protein,
  fats,
  carbs,
  kcalObjectiveDay,
  dayType,
}: {
  protein: number
  fats: number
  carbs: number
  kcalObjectiveDay: number
  dayType: WizardInputs['dayType']
}) => {
  const carbFactor = dayType === 'training' ? 1.2 : 0.85
  const fatFactor = dayType === 'training' ? 0.85 : 1.2

  const protKcal = protein * 4
  const remaining = Math.max(kcalObjectiveDay - protKcal, 0)

  const baseCarbKcal = Math.max(carbs, 0) * 4
  const baseFatKcal = Math.max(fats, 0) * 9

  const targCarb = baseCarbKcal * carbFactor
  const targFat = baseFatKcal * fatFactor
  const denom = targCarb + targFat

  if (denom <= 0) {
    return { carbsAdjusted: 0, fatsAdjusted: 0 }
  }

  const scale = remaining / denom
  const carbsAdjusted = round1((targCarb * scale) / 4)
  const fatsAdjusted = round1((targFat * scale) / 9)
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
  const kcalObjectiveBase = tdee * (1 + goalFactor)

  const proteinFactor = { fat_loss: 2.5, muscle_gain: 2.2, recomp: 1.6 }[inputs.goal]
  const protein = inputs.weight * proteinFactor
  const fats = inputs.weight * 1.0
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

  const kcalObjectiveDay = kcalObjectiveBase + eee

  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    protein,
    fats,
    carbs,
    kcalObjectiveDay: roundInt(kcalObjectiveDay),
    dayType: inputs.dayType,
  })

  const ea = ffm ? (kcalObjectiveDay - eee) / ffm : undefined

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
