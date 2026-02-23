import { Alert, Box, Stack, Typography } from '@mui/material'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import { useMemo, useState } from 'react'
import type { WeeklyDataPoint } from '../lib/weeklyTracking'
import {
  getLastTrackedDayIndex,
  getWeeklyIntakeState,
  getWeeklyKpis,
} from '../lib/weeklyTracking'
import DayMacroDetail from './DayMacroDetail'
import WeeklyIntakeChart from './WeeklyIntakeChart'

type WeeklyIntakeCardProps = {
  weeklyData: WeeklyDataPoint[]
  adherenceTolerancePct?: number
  title?: string
  subtitle?: string
  showDetailPanel?: boolean
  fillChartHeight?: boolean
  centerTooltip?: boolean
  detailStatusRule?: 'calories' | 'macros'
  hideTooltip?: boolean
  onEditSelectedDayMacros?: (day: WeeklyDataPoint) => void
  hasDayMacroOverride?: (day: WeeklyDataPoint) => boolean
  isDayMacroSaving?: boolean
  allowSelectionWhenEmpty?: boolean
}

const formatKcal = (value: number | null) => (value !== null ? `${Math.round(value)} kcal` : '--')

const WeeklyIntakeCard = ({
  weeklyData,
  adherenceTolerancePct = 5,
  title = 'Seguimiento semanal',
  subtitle = 'Ultimos 7 dias',
  showDetailPanel = true,
  fillChartHeight = false,
  centerTooltip = false,
  detailStatusRule = 'calories',
  hideTooltip = true,
  onEditSelectedDayMacros,
  hasDayMacroOverride,
  isDayMacroSaving = false,
  allowSelectionWhenEmpty = false,
}: WeeklyIntakeCardProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(getLastTrackedDayIndex(weeklyData))
  const fallbackSelectedIndex = getLastTrackedDayIndex(weeklyData)
  const resolvedSelectedIndex =
    selectedIndex !== null && selectedIndex < weeklyData.length ? selectedIndex : fallbackSelectedIndex

  const kpis = useMemo(
    () => getWeeklyKpis(weeklyData, adherenceTolerancePct),
    [adherenceTolerancePct, weeklyData],
  )
  const intakeState = getWeeklyIntakeState(weeklyData)
  const selectedDay = resolvedSelectedIndex !== null ? weeklyData[resolvedSelectedIndex] : null
  const selectedDayHasMacroOverride = selectedDay ? !!hasDayMacroOverride?.(selectedDay) : false
  const bestDay = kpis.bestDayIndex !== null ? weeklyData[kpis.bestDayIndex] : null
  const objectiveKcal = weeklyData.find((item) => item.caloriesTarget > 0)?.caloriesTarget ?? null
  const avgKcalIndicator = useMemo(() => {
    if (kpis.avgCalories === null) return null
    const tracked = weeklyData.filter(
      (item) => item.caloriesConsumed !== null && item.caloriesTarget > 0,
    )
    if (tracked.length === 0) return null

    const avgTarget = tracked.reduce((acc, item) => acc + item.caloriesTarget, 0) / tracked.length
    const delta = Math.round(kpis.avgCalories - avgTarget)
    const tolerance = avgTarget * (adherenceTolerancePct / 100)

    if (Math.abs(delta) <= tolerance) {
      return { state: 'in-range' as const, text: `Dentro de rango (+/-${adherenceTolerancePct}%)` }
    }
    if (delta > 0) {
      return { state: 'over' as const, text: `Exceso ${Math.abs(delta)} kcal` }
    }
    return { state: 'under' as const, text: `Faltan ${Math.abs(delta)} kcal` }
  }, [adherenceTolerancePct, kpis.avgCalories, weeklyData])

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.25,
        }}
      >
        <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 1.25 }}>
          <Typography variant="overline" color="text.secondary">
            Promedio semanal
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            {formatKcal(kpis.avgCalories)}
          </Typography>
          {avgKcalIndicator && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
              {avgKcalIndicator.state === 'in-range' ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
              ) : avgKcalIndicator.state === 'over' ? (
                <ArrowUpwardRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
              ) : (
                <ArrowDownwardRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: avgKcalIndicator.state === 'in-range' ? 'success.main' : 'error.main',
                }}
              >
                {avgKcalIndicator.text}
              </Typography>
            </Stack>
          )}
        </Box>
        <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 1.25 }}>
          <Typography variant="overline" color="text.secondary">
            Mejor dia
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            {bestDay && kpis.bestDayAdherencePct !== null
              ? `${bestDay.dayLabel} ${Math.round(kpis.bestDayAdherencePct)}%`
              : '--'}
          </Typography>
        </Box>
        <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 1.25 }}>
          <Typography variant="overline" color="text.secondary">
            Adherencia semanal
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            {kpis.weeklyAdherencePct !== null ? `${kpis.weeklyAdherencePct}%` : '--'}
          </Typography>
        </Box>
      </Box>

      {weeklyData.length === 0 ? (
        <Alert severity="info">Sin datos semanales para graficar.</Alert>
      ) : (
        <>
          {intakeState === 'empty' && (
            <Alert severity="info">
              Aun no hay consumos registrados esta semana. Objetivo kcal:{' '}
              {objectiveKcal !== null ? Math.round(objectiveKcal) : '--'}
            </Alert>
          )}
          <WeeklyIntakeChart
            data={weeklyData}
            selectedIndex={resolvedSelectedIndex}
            onSelectIndex={setSelectedIndex}
            adherenceTolerancePct={adherenceTolerancePct}
            disableInteractions={intakeState === 'empty' && !allowSelectionWhenEmpty}
            fillHeight={fillChartHeight}
            centerTooltip={centerTooltip}
            hideTooltip={hideTooltip}
          />
          {showDetailPanel && (
            <DayMacroDetail
              day={selectedDay}
              adherenceTolerancePct={adherenceTolerancePct}
              statusRule={detailStatusRule}
              onEditMacros={onEditSelectedDayMacros}
              hasMacroOverride={selectedDayHasMacroOverride}
              isSavingMacros={isDayMacroSaving}
            />
          )}
        </>
      )}
    </Stack>
  )
}

export default WeeklyIntakeCard
