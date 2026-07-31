import type { DayOverride, Plan, WizardInputs } from '../types'

export const getLegacyDistributionKcalDelta = (dayType?: string | null) =>
  dayType && dayType !== 'rest' ? 300 : 0

export const getDistributionKcalDelta = (
  distribution: NonNullable<Plan['macroDistributions']>[number] | null | undefined,
) =>
  Number.isFinite(distribution?.kcalDelta)
    ? Number(distribution?.kcalDelta)
    : getLegacyDistributionKcalDelta(distribution?.dayType)

export const getMacroDistributionForDay = (
  plan: Plan | null | undefined,
  dayOverride: DayOverride | null | undefined,
  dayType: WizardInputs['dayType'],
) => {
  const distributions = plan?.macroDistributions ?? []
  const explicitId = dayOverride?.overrides?.macroDistributionId
  if (explicitId) {
    const explicit = distributions.find((item) => item.id === explicitId)
    if (explicit) return explicit
  }
  return (
    distributions.find((item) => item.dayType === dayType && item.isDefault) ??
    distributions.find((item) => item.isDefault) ??
    null
  )
}

export const getDistributionMacroOverride = (
  plan: Plan | null | undefined,
  dayOverride: DayOverride | null | undefined,
  dayType: WizardInputs['dayType'],
  weight: number,
) => {
  const distribution = getMacroDistributionForDay(plan, dayOverride, dayType)
  if (!distribution) return null
  return {
    protein: weight * distribution.proteinPerKg,
    carbsAdjusted: weight * distribution.carbsPerKg,
    fatsAdjusted: 0,
  }
}
