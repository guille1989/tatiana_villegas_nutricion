import { Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import dayjs from 'dayjs'
import type { WeeklyDataPoint } from '../lib/weeklyTracking'
import {
  getDayAdherencePct,
  getDayMacroAdherenceState,
  getMacroProgress,
  isAdherentDay,
} from '../lib/weeklyTracking'

type DayMacroDetailProps = {
  day: WeeklyDataPoint | null
  adherenceTolerancePct?: number
  statusRule?: 'calories' | 'macros'
  onEditMacros?: (day: WeeklyDataPoint) => void
  hasMacroOverride?: boolean
  isSavingMacros?: boolean
}

type MacroRow = {
  label: string
  consumed: number | null
  target: number
  color: string
}

const MacroProgressRow = ({ label, consumed, target, color }: MacroRow) => {
  const progress = getMacroProgress(consumed, target)
  const clampedProgress = Math.min(progress, 100)

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {consumed !== null ? `${Math.round(consumed)}g` : '--'} / {Math.round(target)}g
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={clampedProgress}
        aria-label={`Progreso ${label}`}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': { bgcolor: color },
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {progress}% del objetivo
      </Typography>
    </Stack>
  )
}

const DayMacroDetail = ({
  day,
  adherenceTolerancePct = 5,
  statusRule = 'calories',
  onEditMacros,
  hasMacroOverride = false,
  isSavingMacros = false,
}: DayMacroDetailProps) => {
  const theme = useTheme()

  if (!day) {
    return (
      <Box
        sx={{
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'grey.50',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Selecciona un dia para ver el detalle.
        </Typography>
      </Box>
    )
  }

  const hasData = day.caloriesConsumed !== null
  const adherencePct = getDayAdherencePct(day)
  const macroAdherenceState = getDayMacroAdherenceState(day)
  const isInRange =
    statusRule === 'macros' ? macroAdherenceState === 'ok' : isAdherentDay(day, adherenceTolerancePct)
  const dateLabel = day.date ? dayjs(day.date).format('DD/MM') : '--'
  const adherenceLabel =
    statusRule === 'macros'
      ? macroAdherenceState === 'ok'
        ? 'Cumplido'
        : macroAdherenceState === 'over'
          ? 'Fuera de rango'
          : macroAdherenceState === 'pending'
            ? 'Pendiente'
            : null
      : isInRange
        ? 'Dentro de rango'
        : 'Fuera de rango'
  const adherenceColor =
    statusRule === 'macros'
      ? macroAdherenceState === 'ok'
        ? 'success'
        : macroAdherenceState === 'none'
          ? 'default'
          : 'warning'
      : isInRange
        ? 'success'
        : 'warning'

  return (
    <Box
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        p: { xs: 1.75, md: 2 },
        bgcolor: 'common.white',
      }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          spacing={1}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Stack spacing={0.25}>
            <Typography variant="subtitle2" fontWeight={800}>
              Detalle del dia seleccionado
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {day.dayLabel} {dateLabel}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {hasData && adherenceLabel && (
              <Chip
                size="small"
                label={adherenceLabel}
                color={adherenceColor}
                variant={isInRange ? 'filled' : 'outlined'}
              />
            )}
            {hasMacroOverride && (
              <Chip size="small" variant="outlined" color="info" label="Ajuste diario admin" />
            )}
            {onEditMacros && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onEditMacros(day)}
                disabled={isSavingMacros}
              >
                Ajustar macros del dia
              </Button>
            )}
          </Stack>
        </Stack>

        {!hasData ? (
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              Sin registros para este dia.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Objetivo kcal: {Math.round(day.caloriesTarget)}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="baseline">
              <Typography variant="h5" fontWeight={900}>
                {Math.round(day.caloriesConsumed as number)} kcal
              </Typography>
              <Typography variant="body2" color="text.secondary">
                / {Math.round(day.caloriesTarget)} kcal
              </Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ color: isInRange ? theme.palette.success.main : theme.palette.warning.main }}
              >
                {adherencePct !== null ? `${Math.round(adherencePct)}%` : '--'}
              </Typography>
            </Stack>

            <Stack spacing={1.2}>
              <MacroProgressRow
                label="Proteina"
                consumed={day.proteinConsumedG}
                target={day.proteinTargetG}
                color={theme.palette.primary.main}
              />
              <MacroProgressRow
                label="Carbs"
                consumed={day.carbsConsumedG}
                target={day.carbsTargetG}
                color={theme.palette.success.main}
              />
              <MacroProgressRow
                label="Grasas"
                consumed={day.fatsConsumedG}
                target={day.fatsTargetG}
                color={theme.palette.warning.main}
              />
            </Stack>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

export default DayMacroDetail
