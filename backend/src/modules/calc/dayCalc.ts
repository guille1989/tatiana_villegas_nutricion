import { calculateInitials, adjustCarbFat, getEeeFactor } from './calc'
import type { DayOverrideInputs, WizardInputs } from '../types'
import { metMap } from './metMap'

const roundInt = (v: number) => Math.round(v)
const round1 = (v: number) => Math.round(v * 10) / 10

export const calculateDayFromBase = (baseInputs: WizardInputs, overrides: DayOverrideInputs) => {
  const merged: WizardInputs = { ...baseInputs }

  if (overrides.activityLevel !== undefined) merged.activityLevel = overrides.activityLevel ?? baseInputs.activityLevel
  if (overrides.dayType !== undefined) merged.dayType = overrides.dayType ?? baseInputs.dayType

  // Normalize trainings array (supports legacy single training)
  const trainings =
    overrides.trainings ??
    (overrides.training
      ? [overrides.training]
      : baseInputs.training
        ? [baseInputs.training]
        : [])

  const normalizedTrainings =
    merged.dayType === 'training'
      ? trainings
          .filter(Boolean)
          .map((t) => ({
            type: t?.type ?? undefined,
            met: t?.met ?? (t?.type ? metMap[t.type] : undefined),
            durationMin: t?.durationMin ?? undefined,
          }))
      : []

  // If no trainings provided but dayType is training, fallback to base single session
  if (merged.dayType === 'training' && normalizedTrainings.length === 0 && baseInputs.trainingType && baseInputs.duration) {
    normalizedTrainings.push({
      type: baseInputs.trainingType,
      met: baseInputs.trainingMet ?? metMap[baseInputs.trainingType],
      durationMin: baseInputs.duration,
    })
  }

  // Compute total EEE from all sessions
  const eeeTotal =
    merged.dayType === 'training'
      ? normalizedTrainings.reduce((acc, session) => {
          if (!session.type || session.met === undefined || !session.durationMin) return acc
          return acc + ((merged.weight * session.met * 3.5) / 200) * session.durationMin
        }, 0)
      : 0

  // Calculate base outputs without forcing single-session EEE
  const baseCalc = calculateInitials({
    ...baseInputs,
    activityLevel: merged.activityLevel,
    dayType: merged.dayType,
    training: undefined,
    trainingType: merged.trainingType,
    duration: undefined,
    trainingMet: merged.trainingMet,
  })

  const outputs = { ...baseCalc.outputs }
  outputs.eee = roundInt(eeeTotal)
  const eeeAdjusted = outputs.eee * getEeeFactor(merged.goal)
  outputs.kcalObjectiveDay = outputs.kcalObjectiveBase + eeeAdjusted
  const carbFactorTrainingType =
    merged.dayType === 'training'
      ? normalizedTrainings.find((session) => session.type)?.type ?? merged.trainingType
      : undefined
  const carbFatAdjusted = adjustCarbFat({
    protein: outputs.protein,
    fats: outputs.fats,
    carbs: outputs.carbs,
    kcalObjectiveDay: outputs.kcalObjectiveDay,
    dayType: merged.dayType,
    trainingType: carbFactorTrainingType,
    eee: outputs.eee,
    goal: merged.goal,
  })
  outputs.carbsAdjusted = carbFatAdjusted.carbsAdjusted
  outputs.fatsAdjusted = carbFatAdjusted.fatsAdjusted
  if (outputs.ffm !== undefined) {
    outputs.ea = round1((outputs.kcalObjectiveDay - eeeAdjusted) / outputs.ffm)
  }

  return { outputs }
}
