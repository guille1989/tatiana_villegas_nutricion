import { getMacroState, type MacroState } from './macroStatus'

export type WeeklyDataPoint = {
  date: string
  dayLabel: string
  caloriesConsumed: number | null
  caloriesTarget: number
  proteinConsumedG: number | null
  carbsConsumedG: number | null
  fatsConsumedG: number | null
  proteinTargetG: number
  carbsTargetG: number
  fatsTargetG: number
}

export type WeeklyKpis = {
  avgCalories: number | null
  bestDayIndex: number | null
  bestDayAdherencePct: number | null
  weeklyAdherencePct: number | null
  trackedDays: number
  adherentDays: number
}

export type WeeklyIntakeState = 'empty' | 'partial' | 'complete'

const isValidNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const getDayAdherencePct = (day: WeeklyDataPoint): number | null => {
  if (!isValidNumber(day.caloriesConsumed) || day.caloriesTarget <= 0) return null
  return (day.caloriesConsumed / day.caloriesTarget) * 100
}

export const isAdherentDay = (day: WeeklyDataPoint, tolerancePct = 5): boolean => {
  if (!isValidNumber(day.caloriesConsumed) || day.caloriesTarget <= 0) return false
  const maxDiff = day.caloriesTarget * (tolerancePct / 100)
  return Math.abs(day.caloriesConsumed - day.caloriesTarget) <= maxDiff
}

export const getWeeklyIntakeState = (weeklyData: WeeklyDataPoint[]): WeeklyIntakeState => {
  const trackedCount = weeklyData.filter((item) => isValidNumber(item.caloriesConsumed)).length
  if (trackedCount === 0) return 'empty'
  if (trackedCount < weeklyData.length) return 'partial'
  return 'complete'
}

export const getWeeklyKpis = (weeklyData: WeeklyDataPoint[], tolerancePct = 5): WeeklyKpis => {
  const tracked = weeklyData
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isValidNumber(item.caloriesConsumed))

  const avgCalories =
    tracked.length > 0
      ? Math.round(
          tracked.reduce((acc, entry) => acc + (entry.item.caloriesConsumed as number), 0) / tracked.length,
        )
      : null

  let bestDayIndex: number | null = null
  let bestDayAdherencePct: number | null = null
  let minAbsDiff = Number.POSITIVE_INFINITY

  tracked.forEach(({ item, index }) => {
    if (item.caloriesTarget <= 0) return
    const diff = Math.abs((item.caloriesConsumed as number) - item.caloriesTarget)
    if (diff < minAbsDiff) {
      minAbsDiff = diff
      bestDayIndex = index
      bestDayAdherencePct = getDayAdherencePct(item)
    }
  })

  const adherentDays = tracked.filter(({ item }) => isAdherentDay(item, tolerancePct)).length
  const weeklyAdherencePct =
    tracked.length > 0 ? Math.round((adherentDays / tracked.length) * 100) : null

  return {
    avgCalories,
    bestDayIndex,
    bestDayAdherencePct,
    weeklyAdherencePct,
    trackedDays: tracked.length,
    adherentDays,
  }
}

export const getLastTrackedDayIndex = (weeklyData: WeeklyDataPoint[]): number | null => {
  for (let i = weeklyData.length - 1; i >= 0; i -= 1) {
    if (isValidNumber(weeklyData[i].caloriesConsumed)) return i
  }
  return weeklyData.length ? weeklyData.length - 1 : null
}

export const getMacroProgress = (consumed: number | null, target: number): number => {
  if (!isValidNumber(consumed) || target <= 0) return 0
  return Math.round((consumed / target) * 100)
}

type DayMacroAdherenceState = MacroState | 'none'

export const getDayMacroAdherenceState = (day: WeeklyDataPoint): DayMacroAdherenceState => {
  const macroInputs = [
    {
      key: 'protein' as const,
      consumed: day.proteinConsumedG,
      target: day.proteinTargetG,
      unitSize: 10,
    },
    {
      key: 'carbs' as const,
      consumed: day.carbsConsumedG,
      target: day.carbsTargetG,
      unitSize: 15,
    },
    {
      key: 'fat' as const,
      consumed: day.fatsConsumedG,
      target: day.fatsTargetG,
      unitSize: 5,
    },
  ]

  if (
    macroInputs.some(
      (item) => !isValidNumber(item.consumed) || !isValidNumber(item.target) || item.target <= 0,
    )
  ) {
    return 'none'
  }

  const states = macroInputs.map((item) =>
    getMacroState(item.target - (item.consumed as number), item.target, item.key, item.unitSize),
  )

  if (states.includes('over')) return 'over'
  if (states.every((state) => state === 'ok')) return 'ok'
  return 'pending'
}
