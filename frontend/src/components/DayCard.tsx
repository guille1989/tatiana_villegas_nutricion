import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import type { CalculationOutputs } from '../types'

type Props = {
  date: string
  outputs: CalculationOutputs
  dayType: 'training' | 'rest'
  hasOverride?: boolean
  note?: string
  onEdit: () => void
}

const DayCard = ({ date, outputs, dayType, hasOverride, note, onEdit }: Props) => {
  const formatted = dayjs(date).format('dddd, DD MMM YYYY')
  const isTraining = dayType === 'training'

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
              label={isTraining ? 'Entreno' : 'Descanso'}
              color={isTraining ? 'primary' : 'default'}
            />
          </Stack>
        }
      />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Kcal objetivo
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {outputs.kcalObjectiveDay} kcal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              EEE: {outputs.eee} kcal
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Proteina
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {outputs.protein} g
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Carbs ajustados: {outputs.carbsAdjusted} g
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Grasas ajustadas: {outputs.fatsAdjusted} g
              </Typography>
            </Stack>
          </Grid>
        </Grid>

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
