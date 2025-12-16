import { Card, CardContent, CardHeader, MenuItem, Stack, TextField, Typography } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { Controller, useFormContext } from 'react-hook-form'
import { sexOptions, type WizardFormData } from '../lib/schema'

const StepPersonal = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<WizardFormData>()

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Datos personales"
        subheader="Usamos estos datos para personalizar tus necesidades energeticas."
      />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Nombre"
                  fullWidth
                  required
                  autoComplete="name"
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Controller
              name="sex"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Sexo"
                  fullWidth
                  required
                  error={!!errors.sex}
                  helperText={errors.sex?.message}
                >
                  {sexOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Controller
              name="age"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Edad"
                  fullWidth
                  required
                  inputProps={{ min: 10, max: 90 }}
                  value={field.value ?? ''}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                  }
                  error={!!errors.age}
                  helperText={errors.age?.message}
                />
              )}
            />
          </Grid>
        </Grid>

        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Mantendremos estos datos solo en tu navegador (localStorage).
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default StepPersonal
