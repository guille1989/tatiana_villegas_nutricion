import { Box, Stack, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import dayjs from 'dayjs'
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { WeeklyDataPoint } from '../lib/weeklyTracking'
import { getDayAdherencePct, getMacroProgress } from '../lib/weeklyTracking'

type WeeklyIntakeChartProps = {
  data: WeeklyDataPoint[]
  selectedIndex: number | null
  onSelectIndex: (index: number) => void
  adherenceTolerancePct?: number
  disableInteractions?: boolean
  fillHeight?: boolean
  centerTooltip?: boolean
  hideTooltip?: boolean
}

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 320
const MARGIN = { top: 24, right: 16, bottom: 56, left: 48 }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const toNiceCeil = (value: number) => {
  if (value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  let niceFraction = 10
  if (fraction <= 1) niceFraction = 1
  else if (fraction <= 2) niceFraction = 2
  else if (fraction <= 5) niceFraction = 5
  return niceFraction * 10 ** exponent
}

const TooltipMacroRow = ({
  label,
  color,
  consumed,
  target,
}: {
  label: string
  color: string
  consumed: number | null
  target: number
}) => {
  const progress = getMacroProgress(consumed, target)
  const width = clamp(progress, 0, 100)

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" fontWeight={700}>
          {consumed !== null ? Math.round(consumed) : '--'} / {Math.round(target)}g
        </Typography>
      </Stack>
      <Box sx={{ height: 5, borderRadius: 99, bgcolor: 'grey.200', overflow: 'hidden' }}>
        <Box sx={{ width: `${width}%`, height: '100%', bgcolor: color }} />
      </Box>
    </Stack>
  )
}

const WeeklyIntakeChart = ({
  data,
  selectedIndex,
  onSelectIndex,
  adherenceTolerancePct = 5,
  disableInteractions = false,
  fillHeight = false,
  centerTooltip = false,
  hideTooltip = true,
}: WeeklyIntakeChartProps) => {
  const theme = useTheme()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const chartWidth = VIEW_WIDTH
  const chartHeight = VIEW_HEIGHT
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right
  const plotHeight = chartHeight - MARGIN.top - MARGIN.bottom
  const dayCount = Math.max(data.length, 1)
  const slotWidth = plotWidth / dayCount
  const barWidth = clamp(slotWidth * 0.58, 14, 46)

  const targetValues = data.map((item) => item.caloriesTarget).filter((value) => value > 0)
  const consumedValues = data
    .map((item) => item.caloriesConsumed)
    .filter((value): value is number => value !== null)
  const baseTarget = targetValues.length
    ? targetValues.reduce((acc, value) => acc + value, 0) / targetValues.length
    : 0
  const targetUpper = baseTarget * (1 + adherenceTolerancePct / 100)
  const targetLower = Math.max(0, baseTarget * (1 - adherenceTolerancePct / 100))
  const yMax = toNiceCeil(Math.max(...consumedValues, ...targetValues, targetUpper, 1) * 1.08)

  const toY = (value: number) => MARGIN.top + plotHeight - (value / yMax) * plotHeight
  const getX = (index: number) => MARGIN.left + slotWidth * index + slotWidth / 2
  const baselineY = toY(0)
  const targetY = baseTarget > 0 ? toY(baseTarget) : null
  const rangeTopY = baseTarget > 0 ? toY(targetUpper) : null
  const rangeBottomY = baseTarget > 0 ? toY(targetLower) : null

  const activeIndex =
    !disableInteractions && data.length > 0 ? (hoverIndex ?? selectedIndex ?? null) : null
  const activeDay = activeIndex !== null ? data[activeIndex] : null

  const ticks = useMemo(() => Array.from({ length: 5 }, (_, idx) => (yMax / 4) * idx), [yMax])

  const getIndexFromSvgX = (svgX: number) => {
    const rawIndex = Math.floor((svgX - MARGIN.left) / slotWidth)
    return clamp(rawIndex, 0, data.length - 1)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (disableInteractions || data.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const svgX = (offsetX / rect.width) * chartWidth
    setHoverIndex(getIndexFromSvgX(svgX))
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (disableInteractions || data.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const svgX = (offsetX / rect.width) * chartWidth
    const index = getIndexFromSvgX(svgX)
    setHoverIndex(index)
    onSelectIndex(index)
  }

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>, index: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelectIndex(index)
  }

  const tooltipPosition =
    !hideTooltip && activeDay && activeIndex !== null
      ? (() => {
          if (centerTooltip) {
            return { left: 50, top: 50 }
          }
          const anchorY =
            activeDay.caloriesConsumed !== null
              ? toY(activeDay.caloriesConsumed)
              : targetY !== null
                ? targetY
                : baselineY
          const left = clamp((getX(activeIndex) / chartWidth) * 100, 12, 88)
          const top = clamp((anchorY / chartHeight) * 100, 20, 80)
          return { left, top }
        })()
      : null

  if (data.length === 100) {
    return (
      <Box
        sx={{
          width: '100%',
          minHeight: { xs: 240, md: 300 },
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'divider',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Sin datos semanales.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', minHeight: { xs: 240, md: 300 }, height: { xs: 240, md: 300 } }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio={fillHeight ? 'none' : 'xMidYMid meet'}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onPointerDown={handlePointerDown}
        role="img"
        aria-label="Grafica semanal de kcal consumidas vs objetivo"
      >
        {ticks.map((tick) => {
          const y = toY(tick)
          return (
            <g key={tick}>
              <line x1={MARGIN.left} y1={y} x2={MARGIN.left + plotWidth} y2={y} stroke={theme.palette.grey[200]} />
              <text
                x={MARGIN.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill={theme.palette.text.secondary}
              >
                {Math.round(tick)}
              </text>
            </g>
          )
        })}

        {rangeTopY !== null && rangeBottomY !== null && (
          <rect
            x={MARGIN.left}
            y={rangeTopY}
            width={plotWidth}
            height={Math.max(0, rangeBottomY - rangeTopY)}
            fill={alpha(theme.palette.secondary.main, 0.12)}
          />
        )}

        {targetY !== null && (
          <line
            x1={MARGIN.left}
            y1={targetY}
            x2={MARGIN.left + plotWidth}
            y2={targetY}
            stroke={theme.palette.secondary.main}
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        )}

        {activeIndex !== null && (
          <line
            x1={getX(activeIndex)}
            y1={MARGIN.top}
            x2={getX(activeIndex)}
            y2={MARGIN.top + plotHeight}
            stroke={theme.palette.grey[300]}
            strokeDasharray="4 4"
          />
        )}

        {data.map((day, index) => {
          const x = getX(index) - barWidth / 2
          const hasConsumed = day.caloriesConsumed !== null
          const y = hasConsumed ? toY(day.caloriesConsumed as number) : baselineY - 3
          const height = hasConsumed ? Math.max(4, baselineY - y) : 3
          const isSelected = selectedIndex === index
          const isActive = activeIndex === index
          const fill = hasConsumed
            ? isSelected
              ? theme.palette.primary.dark
              : isActive
                ? theme.palette.primary.main
                : alpha(theme.palette.primary.main, 0.82)
            : alpha(theme.palette.grey[400], 0.4)
          const stroke = isSelected ? theme.palette.primary.dark : alpha(theme.palette.primary.main, 0.35)
          const formattedDate = day.date ? dayjs(day.date).format('DD/MM') : '--'
          const consumedLabel = hasConsumed ? `${Math.round(day.caloriesConsumed as number)} kcal` : 'Sin registros'

          return (
            <g key={`${day.date}-${index}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSelected ? 1.5 : 1}
                rx={5}
                role="button"
                tabIndex={disableInteractions ? -1 : 0}
                aria-label={`${day.dayLabel} ${formattedDate}. ${consumedLabel}. Objetivo ${Math.round(
                  day.caloriesTarget,
                )} kcal`}
                onClick={() => {
                  if (disableInteractions) return
                  onSelectIndex(index)
                }}
                onFocus={() => {
                  if (disableInteractions) return
                  setHoverIndex(index)
                }}
                onBlur={() => {
                  if (disableInteractions) return
                  setHoverIndex(null)
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
              />
              <text
                x={getX(index)}
                y={chartHeight - 28}
                textAnchor="middle"
                fontSize="12"
                fill={theme.palette.text.primary}
              >
                {day.dayLabel}
              </text>
              <text
                x={getX(index)}
                y={chartHeight - 14}
                textAnchor="middle"
                fontSize="10"
                fill={theme.palette.text.secondary}
              >
                {formattedDate}
              </text>
            </g>
          )
        })}
      </svg>

      {!hideTooltip && !disableInteractions && activeDay && tooltipPosition && (
        <Box
          sx={{
            position: 'absolute',
            left: `${tooltipPosition.left}%`,
            top: `${tooltipPosition.top}%`,
            transform: centerTooltip ? 'translate(-50%, -50%)' : 'translate(-50%, -110%)',
            bgcolor: 'common.white',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            boxShadow: '0 14px 28px rgba(15, 23, 42, 0.14)',
            px: 1.25,
            py: 1,
            minWidth: { xs: 190, md: 220 },
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <Stack spacing={0.75}>
            <Typography variant="caption" color="text.secondary">
              {activeDay.dayLabel} {dayjs(activeDay.date).format('DD/MM')}
            </Typography>
            {activeDay.caloriesConsumed === null ? (
              <Typography variant="subtitle2" fontWeight={700}>
                Sin registros
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" fontWeight={800}>
                  {Math.round(activeDay.caloriesConsumed)} / {Math.round(activeDay.caloriesTarget)} kcal
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Adherencia diaria: {Math.round(getDayAdherencePct(activeDay) ?? 0)}%
                </Typography>
                <TooltipMacroRow
                  label="Proteina"
                  color={theme.palette.primary.main}
                  consumed={activeDay.proteinConsumedG}
                  target={activeDay.proteinTargetG}
                />
                <TooltipMacroRow
                  label="Carbs"
                  color={theme.palette.success.main}
                  consumed={activeDay.carbsConsumedG}
                  target={activeDay.carbsTargetG}
                />
                <TooltipMacroRow
                  label="Grasas"
                  color={theme.palette.warning.main}
                  consumed={activeDay.fatsConsumedG}
                  target={activeDay.fatsTargetG}
                />
              </Stack>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  )
}

export default WeeklyIntakeChart
