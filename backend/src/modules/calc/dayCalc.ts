import { calculateInitials, adjustCarbFat } from './calc'
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
  outputs.kcalObjectiveDay = outputs.kcalObjectiveBase + outputs.eee
  const carbFatAdjusted = adjustCarbFat({
    protein: outputs.protein,
    fats: outputs.fats,
    carbs: outputs.carbs,
    kcalObjectiveDay: outputs.kcalObjectiveDay,
    dayType: merged.dayType,
  })
  outputs.carbsAdjusted = carbFatAdjusted.carbsAdjusted
  outputs.fatsAdjusted = carbFatAdjusted.fatsAdjusted
  if (outputs.ffm !== undefined) {
    outputs.ea = round1((outputs.kcalObjectiveDay - outputs.eee) / outputs.ffm)
  }

  return { outputs }
}
