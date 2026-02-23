import {
  MACRO_PORTION_GRAMS,
  applyMacroOverrideToOutputs as applyMacroOverrideToOutputsCore,
  calcKcalFromMacroGrams as calcKcalFromMacroGramsCore,
  calcKcalFromMacros as calcKcalFromMacrosCore,
  calculateInitials as calculateInitialsCore,
  getCarbFactor,
  getEeeFactor,
  toMacroPortionValue as toMacroPortionValueCore,
  toMacroPortions as toMacroPortionsCore,
  getMacroKcalBreakdown as getMacroKcalBreakdownCore,
  type MacroGramsValue as CoreMacroGramsValue,
  type MacroPortionKey as CoreMacroPortionKey,
  type MacroOverrideValue as CoreMacroOverrideValue,
} from '../../../backend/src/modules/calc/calc.ts'
import { calculateDayFromBase as calculateDayFromBaseCore } from '../../../backend/src/modules/calc/dayCalc.ts'
import type { CalculationOutputs, DayOverrideInputs, WizardInputs } from '../types'

export type CalculationResult = CalculationOutputs

export type MacroGramsValue = CoreMacroGramsValue
export type MacroPortionKey = CoreMacroPortionKey
export type MacroOverrideValue = CoreMacroOverrideValue

export { getCarbFactor, getEeeFactor }
export { MACRO_PORTION_GRAMS }

export const calculateInitials = (inputs: WizardInputs): CalculationResult =>
  calculateInitialsCore(inputs as unknown as import('../../../backend/src/modules/domainTypes.ts').WizardInputs)
    .outputs as CalculationResult

export const calculateDayFromBase = (
  baseInputs: WizardInputs,
  overrideInputs: DayOverrideInputs,
): CalculationResult =>
  calculateDayFromBaseCore(
    baseInputs as unknown as import('../../../backend/src/modules/domainTypes.ts').WizardInputs,
    overrideInputs as unknown as import('../../../backend/src/modules/domainTypes.ts').DayOverrideInputs,
  ).outputs as CalculationResult

export const calcKcalFromMacros = (macros: MacroOverrideValue) => calcKcalFromMacrosCore(macros)
export const calcKcalFromMacroGrams = (macros: MacroGramsValue) => calcKcalFromMacroGramsCore(macros)
export const getMacroKcalBreakdown = (macros: MacroGramsValue) => getMacroKcalBreakdownCore(macros)
export const toMacroPortionValue = (grams: number, macro: MacroPortionKey) => toMacroPortionValueCore(grams, macro)
export const toMacroPortions = (macros: MacroGramsValue) => toMacroPortionsCore(macros)

export const applyMacroOverrideToOutputs = <T extends CalculationOutputs>({
  outputs,
  overrideMacros,
  dayType,
  trainingType,
  goal,
  weight,
  activityDelta = 0,
}: {
  outputs: T
  overrideMacros: MacroOverrideValue
  dayType: 'training' | 'rest'
  trainingType?: WizardInputs['trainingType'] | null
  goal: WizardInputs['goal']
  weight: number
  activityDelta?: number
}) =>
  applyMacroOverrideToOutputsCore({
    outputs,
    overrideMacros,
    dayType,
    trainingType,
    goal: goal as import('../../../backend/src/modules/domainTypes.ts').WizardInputs['goal'],
    weight,
    activityDelta,
  })
