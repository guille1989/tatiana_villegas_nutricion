import { Card, CardContent, CardHeader, MenuItem, Stack, TextField } from '@mui/material'
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
      const raw = event.target.value.replace(',', '.')
      onChange(raw === '' ? undefined : Number(raw))
    }

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Medidas"
        subheader="Estos valores ayudan a calcular tu gasto energetico basal."
      />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Controller
              name="weight"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="text"
                  label="Peso (kg)"
                  fullWidth
                  required
                  inputMode="decimal"
                  inputProps={{ min: 30, max: 250, step: 0.1, pattern: '[0-9]*[.,]?[0-9]*' }}
                  value={field.value ?? ''}
                  onFocus={(e) => e.target.select()}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.weight}
                  helperText={errors.weight?.message}
                />
              )}
            />
            <Controller
              name="height"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="text"
                  label="Talla (cm)"
                  fullWidth
                  required
                  inputMode="decimal"
                  inputProps={{ min: 120, max: 230, step: 0.5, pattern: '[0-9]*[.,]?[0-9]*' }}
                  value={field.value ?? ''}
                  onFocus={(e) => e.target.select()}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.height}
                  helperText={errors.height?.message}
                />
              )}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Controller
              name="bodyFat"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="text"
                  label="% grasa corporal (opcional)"
                  fullWidth
                  inputMode="decimal"
                  inputProps={{ min: 0, max: 60, step: 0.1, pattern: '[0-9]*[.,]?[0-9]*' }}
                  value={field.value ?? ''}
                  onFocus={(e) => e.target.select()}
                  onChange={handleNumberChange(field.onChange)}
                  error={!!errors.bodyFat}
                  helperText={errors.bodyFat?.message || 'Si no conoces tu % grasa, deja vacio.'}
                />
              )}
            />
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
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default StepMeasurements
