import {
  getWeeklyIntakeState,
  getWeeklyKpis,
  type WeeklyDataPoint,
} from '../src/lib/weeklyTracking.ts'

const makeDay = (
  date: string,
  dayLabel: WeeklyDataPoint['dayLabel'],
  caloriesConsumed: number | null,
  caloriesTarget = 2000,
): WeeklyDataPoint => ({
  date,
  dayLabel,
  caloriesConsumed,
  caloriesTarget,
  proteinConsumedG: caloriesConsumed !== null ? 130 : null,
  carbsConsumedG: caloriesConsumed !== null ? 200 : null,
  fatsConsumedG: caloriesConsumed !== null ? 60 : null,
  proteinTargetG: 140,
  carbsTargetG: 220,
  fatsTargetG: 65,
})

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const run = () => {
  const emptyWeek = [
    makeDay('2026-02-09', 'L', null),
    makeDay('2026-02-10', 'M', null),
    makeDay('2026-02-11', 'X', null),
    makeDay('2026-02-12', 'J', null),
    makeDay('2026-02-13', 'V', null),
    makeDay('2026-02-14', 'S', null),
    makeDay('2026-02-15', 'D', null),
  ]
  assert(getWeeklyIntakeState(emptyWeek) === 'empty', 'empty state should be detected')
  assert(getWeeklyKpis(emptyWeek).avgCalories === null, 'empty week average should be null')
  assert(getWeeklyKpis(emptyWeek).weeklyAdherencePct === null, 'empty week adherence should be null')

  const partialWeek = [
    makeDay('2026-02-09', 'L', 1980),
    makeDay('2026-02-10', 'M', null),
    makeDay('2026-02-11', 'X', 2200),
    makeDay('2026-02-12', 'J', null),
    makeDay('2026-02-13', 'V', 2020),
    makeDay('2026-02-14', 'S', null),
    makeDay('2026-02-15', 'D', null),
  ]
  assert(getWeeklyIntakeState(partialWeek) === 'partial', 'partial state should be detected')

  const partialKpis = getWeeklyKpis(partialWeek, 5)
  assert(partialKpis.avgCalories === 2067, 'average kcal should ignore null days')
  assert(partialKpis.bestDayIndex === 0, 'best day should be closest to target')
  assert(partialKpis.weeklyAdherencePct === 67, 'weekly adherence should use only tracked days')
}

run()
