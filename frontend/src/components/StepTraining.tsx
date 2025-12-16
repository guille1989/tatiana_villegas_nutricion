import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { trainingOptions, type WizardFormData } from '../lib/schema'
import Grid from '@mui/material/GridLegacy'

const StepTraining = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<WizardFormData>()
  const dayType = useWatch<WizardFormData, 'dayType'>({ name: 'dayType' })
  const isTrainingDay = dayType === 'training'

  const handleNumberChange =
    (onChange: (value: number | undefined) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value === '' ? undefined : Number(event.target.value))
    }

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Entrenamiento"
        subheader={
          isTrainingDay
            ? 'Solo si es dia de entreno. Usaremos el MET para estimar gasto de ejercicio.'
            : 'Este paso no aplica en dias de descanso.'
        }
      />
      <CardContent>
        {!isTrainingDay && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Dia de descanso seleccionado. Puedes seguir adelante.
          </Alert>
        )}

        {isTrainingDay && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={7}>
              <Controller
                name="trainingType"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Tipo de entreno"
                    fullWidth
                    required
                    error={!!errors.trainingType}
                    helperText={errors.trainingType?.message}
                  >
                    {trainingOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label} - MET {option.met}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <Controller
                name="duration"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="Duracion (min)"
                    fullWidth
                    required
                    inputProps={{ min: 10, max: 180, step: 5 }}
                    value={field.value ?? ''}
                    onChange={handleNumberChange(field.onChange)}
                    error={!!errors.duration}
                    helperText={errors.duration?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Los valores se guardan automaticamente en tu navegador.
        </Typography>
      </CardContent>
    </Card>
  )
}

export default StepTraining
