import { Box, Button, Card, CardContent, CardHeader, Chip, Stack, Typography } from '@mui/material'
import dayjs from 'dayjs'
import type { CalculationOutputs, WizardInputs } from '../types'
import { visibleDayTypeOptions } from '../lib/schema'

type Props = {
  date: string
  outputs: CalculationOutputs
  dayType: WizardInputs['dayType']
  hasOverride?: boolean
  note?: string
  onEdit: () => void
}

const formatInt = (value: number) => Math.round(value)

const DayCard = ({ date, outputs, dayType, hasOverride, note, onEdit }: Props) => {
  const formatted = dayjs(date).format('dddd, DD MMM YYYY')
  const isTraining = dayType !== 'rest'
  const dayTypeLabel = visibleDayTypeOptions.find((option) => option.value === dayType)?.label ?? (isTraining ? 'Entreno' : 'Descanso')

  return (
    <Card elevation={0} sx={{ height: '100%' }}>
      <CardHeader
        title={formatted}
        subheader={note}
        action={
          <Stack direction="row" spacing={1}>
            {hasOverride && <Chip size="small" label="Override" color="secondary" variant="outlined" />}
            <Chip
              size="small"
              label={dayTypeLabel}
              color={isTraining ? 'primary' : 'default'}
            />
          </Stack>
        }
      />
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Box flex={1}>
            <Typography variant="body2" color="text.secondary">
              Kcal objetivo
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {formatInt(outputs.kcalObjectiveDay)} kcal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              EEE: {formatInt(outputs.eee)} kcal
            </Typography>
          </Box>
          <Box flex={1}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Proteina
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {formatInt(outputs.protein)} g
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Carbs ajustados: {formatInt(outputs.carbsAdjusted)} g
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Grasas ajustadas: {formatInt(outputs.fatsAdjusted)} g
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Box mt={2}>
          <Button variant="outlined" onClick={onEdit} fullWidth>
            Editar día
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}

export default DayCard
