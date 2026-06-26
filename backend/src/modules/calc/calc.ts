import type { WizardInputs } from '../domainTypes'

const roundInt = (v: number) => Math.round(v)
const round1 = (v: number) => Math.round(v * 10) / 10

const eeeFactorMap: Record<WizardInputs['goal'], number> = {
  fat_loss: 1,
  muscle_gain: 1,
  recomp: 1,
}

export const getEeeFactor = (goal: WizardInputs['goal']) => eeeFactorMap[goal] ?? 1

const CARB_FACTOR_DEFAULT = 0.65
const carbFactorRules: Array<{ factor: number; types?: ReadonlySet<string>; prefixes?: readonly string[] }> = [
  { factor: 0.8, prefixes: ['running_', 'cycling_', 'indoor_cycling_', 'swimming_'] },
  {
    factor: 0.75,
    types: new Set(['circuit_training', 'bootcamp']),
    prefixes: ['hiit', 'crossfit', 'cardio_', 'elliptical_', 'rowing_'],
  },
  { factor: 0.6, types: new Set(['mobility']), prefixes: ['pilates_', 'yoga_'] },
]

const getTrainingCarbFactor = (trainingType?: WizardInputs['trainingType'] | null) => {
  if (!trainingType) return CARB_FACTOR_DEFAULT
  for (const rule of carbFactorRules) {
    if (rule.types?.has(trainingType)) return rule.factor
    if (rule.prefixes?.some((prefix) => trainingType.startsWith(prefix))) return rule.factor
  }
  return CARB_FACTOR_DEFAULT
}

export const getCarbFactor = (dayType: WizardInputs['dayType'], trainingType?: WizardInputs['trainingType'] | null): number => {
  if (dayType !== 'training') return 0
  return getTrainingCarbFactor(trainingType)
}

export type MacroOverrideValue = {
  protein: number
  carbsAdjusted: number
  fatsAdjusted: number
}

export type MacroGramsValue = {
  protein: number
  carbs: number
  fat: number
}

export const MACRO_PORTION_GRAMS = {
  protein: 10,
  carbs: 15,
  fat: 5,
} as const

export type MacroPortionKey = keyof typeof MACRO_PORTION_GRAMS

export const toMacroPortionValue = (grams: number, macro: MacroPortionKey) =>
  grams / MACRO_PORTION_GRAMS[macro]

export const toMacroPortions = (macros: MacroGramsValue) => ({
  protein: toMacroPortionValue(macros.protein, 'protein'),
  carbs: toMacroPortionValue(macros.carbs, 'carbs'),
  fat: toMacroPortionValue(macros.fat, 'fat'),
})

export const getMacroKcalBreakdown = (macros: MacroGramsValue) => {
  const proteinKcal = macros.protein * 4
  const carbsKcal = macros.carbs * 4
  const fatKcal = macros.fat * 9
  return {
    proteinKcal,
    carbsKcal,
    fatKcal,
    totalKcal: proteinKcal + carbsKcal + fatKcal,
  }
}

export const calcKcalFromMacroGrams = (macros: MacroGramsValue) =>
  Math.round(getMacroKcalBreakdown(macros).totalKcal)

export const calcKcalFromMacros = (macros: MacroOverrideValue) =>
  calcKcalFromMacroGrams({
    protein: macros.protein,
    carbs: macros.carbsAdjusted,
    fat: macros.fatsAdjusted,
  })

export const adjustCarbFat = ({
  fats,
  carbs,
  dayType,
  trainingType,
  eee = 0,
  goal,
  weight,
}: {
  fats: number
  carbs: number
  dayType: WizardInputs['dayType']
  trainingType?: WizardInputs['trainingType'] | null
  eee?: number
  goal?: WizardInputs['goal'] | null
  weight: number
}) => {
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0
  const fatFactor = dayType === 'training' ? 1 - carbFactor : 0
  if (dayType !== 'training') {
    return { carbsAdjusted: round1(Math.max(carbs, 0)), fatsAdjusted: round1(Math.max(fats, 0)) }
  }
  // Legacy support for existing plans that still store dayType="training".
  void goal
  const rec = 1
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
    fatsAdjusted = round1(Math.max(grasaMin, fatsAdjusted))
  } else {
    fatsAdjusted = round1(baseFats)
  }
  return { carbsAdjusted, fatsAdjusted }
}

export type MacroOutputsLike = {
  eee?: number
  kcalObjectiveDay: number
  protein: number
  carbsAdjusted: number
  fatsAdjusted: number
}

export const applyMacroOverrideToOutputs = <T extends MacroOutputsLike>({
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
  dayType: WizardInputs['dayType']
  trainingType?: WizardInputs['trainingType'] | null
  goal: WizardInputs['goal']
  weight: number
  activityDelta?: number
}): T => {
  const eeeFactor = getEeeFactor(goal)
  const macroKcal = calcKcalFromMacros(overrideMacros) + (outputs.eee ?? 0) * eeeFactor
  const kcalObjectiveDay = macroKcal + activityDelta
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0
  const fatFactor = dayType === 'training' ? 1 - carbFactor : 0
  const activityCarbDelta = activityDelta ? (activityDelta * carbFactor) / 4 : 0
  const activityFatDelta = activityDelta ? (activityDelta * fatFactor) / 9 : 0
  const baseCarbs = Math.max(0, round1(overrideMacros.carbsAdjusted + activityCarbDelta))
  const baseFats = Math.max(0, round1(overrideMacros.fatsAdjusted + activityFatDelta))
  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    fats: baseFats,
    carbs: baseCarbs,
    dayType,
    trainingType,
    eee: outputs.eee ?? 0,
    goal,
    weight,
  })
  return {
    ...outputs,
    kcalObjectiveDay,
    protein: overrideMacros.protein,
    carbsAdjusted,
    fatsAdjusted,
  }
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
  rmrMethod: 'excel_average' | 'cunningham' | 'mifflin'
  version: 'v2_excel'
}

const activityFactorMap: Record<WizardInputs['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.38,
  moderate: 1.55,
  high: 1.73,
  hyperactive: 1.9,
  sedentary_training_3: 1.3,
  sedentary_training_4: 1.4,
  sedentary_training_5: 1.5,
  sedentary_training_6: 1.6,
  light_training_3: 1.5,
  light_training_4: 1.6,
  light_training_5: 1.7,
}

type NormalizedDayType = 'rest' | 'training_type_1' | 'training_type_2' | 'training'

const normalizeDayType = (dayType: WizardInputs['dayType']): NormalizedDayType =>
  dayType === 'training' ? 'training_type_1' : dayType

const goalFactorMap: Record<WizardInputs['goal'], number> = {
  fat_loss: 0.75,
  muscle_gain: 1.2,
  recomp: 1,
}

const macroPresetMap: Record<Exclude<NormalizedDayType, 'training'>, { carbsGkg: number; proteinGkg: number; extraKcal: number }> = {
  rest: { carbsGkg: 2, proteinGkg: 1.8, extraKcal: 0 },
  training_type_1: { carbsGkg: 5, proteinGkg: 1.5, extraKcal: 300 },
  training_type_2: { carbsGkg: 2, proteinGkg: 1.6, extraKcal: 0 },
}

const calcRmrAverage = (inputs: WizardInputs) => {
  const harris =
    inputs.sex === 'male'
      ? 66.47 + 13.75 * inputs.weight + 5 * inputs.height - 6.76 * inputs.age
      : 655.1 + 9.56 * inputs.weight + 1.85 * inputs.height - 4.68 * inputs.age
  const owen = inputs.sex === 'male' ? 879 + 10.2 * inputs.weight : 795 + 7.18 * inputs.weight
  const mifflin =
    inputs.sex === 'male'
      ? 5 + 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age
      : -161 + 10 * inputs.weight + 6.25 * inputs.height - 5 * inputs.age
  return (harris + owen + mifflin) / 3
}

export const calculateInitials = (inputs: WizardInputs): { outputs: CalculationOutputs; formulas: FormulaMeta } => {
  const ffm = inputs.bodyFat !== undefined ? inputs.weight * (1 - inputs.bodyFat / 100) : undefined

  const rmrMethod: FormulaMeta['rmrMethod'] = 'excel_average'
  const rmr = calcRmrAverage(inputs)
  const pal = activityFactorMap[inputs.activityLevel] ?? activityFactorMap.moderate
  const tdee = rmr * pal
  const get = tdee * 1.1
  const kcalObjectiveBase = get * (goalFactorMap[inputs.goal] ?? 1)
  const normalizedDayType = normalizeDayType(inputs.dayType)
  const preset = macroPresetMap[normalizedDayType === 'training' ? 'training_type_1' : normalizedDayType]
  const kcalObjectiveDay = kcalObjectiveBase + preset.extraKcal
  const carbs = inputs.weight * preset.carbsGkg
  const protein = inputs.weight * preset.proteinGkg
  const fats = Math.max(0, (kcalObjectiveDay - (protein * 4 + carbs * 4)) / 9)
  const eee = preset.extraKcal
  const ea = ffm ? kcalObjectiveDay / ffm : undefined

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
      carbsAdjusted: round1(carbs),
      fatsAdjusted: round1(fats),
      ffm: ffm ? round1(ffm) : undefined,
      ea: ea ? round1(ea) : undefined,
    },
    formulas: { rmrMethod, version: 'v2_excel' },
  }
}
