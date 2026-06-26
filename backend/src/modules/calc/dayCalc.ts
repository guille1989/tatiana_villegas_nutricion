import { calculateInitials } from './calc'
import type { DayOverrideInputs, WizardInputs } from '../domainTypes'

export const calculateDayFromBase = (baseInputs: WizardInputs, overrides: DayOverrideInputs) => {
  const merged: WizardInputs = { ...baseInputs }

  if (overrides.activityLevel !== undefined) {
    merged.activityLevel = overrides.activityLevel ?? baseInputs.activityLevel
  }
  if (overrides.dayType !== undefined) {
    merged.dayType = overrides.dayType ?? baseInputs.dayType
  }

  return calculateInitials(merged)
}
