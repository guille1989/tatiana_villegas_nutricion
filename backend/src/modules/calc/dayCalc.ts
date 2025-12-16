import { calculateInitials } from './calc'
import type { DayOverrideInputs, WizardInputs } from '../types'
import { metMap } from './metMap'

const normalizeTraining = (inputs: WizardInputs) => {
  if (inputs.training) return { ...inputs.training }
  if (inputs.trainingType) {
    return {
      type: inputs.trainingType,
      met: inputs.trainingMet ?? metMap[inputs.trainingType],
      durationMin: inputs.duration,
    }
  }
  return undefined
}

export const calculateDayFromBase = (baseInputs: WizardInputs, overrides: DayOverrideInputs) => {
  const merged: WizardInputs = { ...baseInputs, training: normalizeTraining(baseInputs) }

  if (overrides.activityLevel !== undefined) merged.activityLevel = overrides.activityLevel ?? baseInputs.activityLevel
  if (overrides.dayType !== undefined) merged.dayType = overrides.dayType ?? baseInputs.dayType

  if (overrides.training !== undefined) {
    const trainingOverride = overrides.training
    if (!trainingOverride) {
      merged.training = undefined
    } else {
      merged.training = { ...(merged.training ?? {}) }
      if (trainingOverride.type !== undefined) merged.training.type = trainingOverride.type ?? undefined
      if (trainingOverride.met !== undefined) merged.training.met = trainingOverride.met ?? undefined
      if (trainingOverride.durationMin !== undefined) merged.training.durationMin = trainingOverride.durationMin ?? undefined
    }
  }

  if (merged.dayType === 'rest') {
    merged.training = undefined
  }

  if (merged.dayType === 'training') {
    if (!merged.training || !merged.training.type || merged.training.met === undefined || merged.training.durationMin === undefined) {
      throw new Error('Training data required for training day')
    }
  }

  return calculateInitials(merged)
}
