import { calculateInitials } from './calc'
import type { DayOverrideInputs, WizardInputs } from '../types'
import { metMap } from './metMap'

export const calculateDayFromBase = (baseInputs: WizardInputs, overrides: DayOverrideInputs) => {
  const merged: WizardInputs = { ...baseInputs }

  if (overrides.activityLevel !== undefined) merged.activityLevel = overrides.activityLevel ?? baseInputs.activityLevel
  if (overrides.dayType !== undefined) merged.dayType = overrides.dayType ?? baseInputs.dayType

  if (overrides.training !== undefined) {
    const training = overrides.training
    if (training === null) {
      merged.trainingType = undefined
      merged.duration = undefined
      merged.trainingMet = undefined
    } else {
      if (training.type !== undefined) merged.trainingType = training.type ?? undefined
      if (training.durationMin !== undefined) merged.duration = training.durationMin ?? undefined
      if (training.met !== undefined) merged.trainingMet = training.met ?? undefined
    }
  }

  if (merged.dayType === 'rest') {
    merged.trainingType = undefined
    merged.duration = undefined
    merged.trainingMet = undefined
  }

  if (merged.dayType === 'training') {
    if (!merged.trainingType) merged.trainingType = baseInputs.trainingType
    if (merged.duration === undefined && baseInputs.duration !== undefined) merged.duration = baseInputs.duration
    if (merged.trainingMet === undefined && baseInputs.trainingMet !== undefined) merged.trainingMet = baseInputs.trainingMet

    if (!merged.trainingType) throw new Error('Training data required for training day')
    if (merged.trainingMet === undefined) merged.trainingMet = metMap[merged.trainingType]
    if (merged.duration === undefined) throw new Error('Training duration required for training day')
  }

  return calculateInitials(merged)
}
