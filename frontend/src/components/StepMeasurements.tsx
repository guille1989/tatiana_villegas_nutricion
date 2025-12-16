import { Card, CardContent, CardHeader, MenuItem, TextField } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import type { ChangeEvent } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { profileOptions, type WizardFormData } from '../lib/schema'

const StepMeasurements = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<WizardFormData>()

  const handleNumberChange =
    (onChange: (value: number | undefined) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value === '' ? undefined : Number(event.target.value))
    }

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Medidas"
        subheader="Estos valores ayudan a calcular tu gasto energetico basal."
      />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Controller
              name="weight"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Peso (kg)"
                  fullWidth
                  required
                  inputProps={{ min: 30, max: 250, step: 0.1 }}
                  value={field.value ?? ''}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.weight}
                  helperText={errors.weight?.message}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Controller
              name="height"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Talla (cm)"
                  fullWidth
                  required
                  inputProps={{ min: 120, max: 230, step: 0.5 }}
                  value={field.value ?? ''}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.height}
                  helperText={errors.height?.message}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Controller
              name="bodyFat"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="% grasa corporal (opcional)"
                  fullWidth
                  inputProps={{ min: 3, max: 60, step: 0.1 }}
                  value={field.value ?? ''}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.bodyFat}
                  helperText={errors.bodyFat?.message || 'Si no conoces tu % grasa, deja vacio.'}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Controller
              name="profile"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Perfil"
                  fullWidth
                  required
                  error={!!errors.profile}
                  helperText={errors.profile?.message}
                >
                  {profileOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default StepMeasurements
