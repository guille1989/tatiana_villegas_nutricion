import { Card, CardContent, CardHeader, FormHelperText, MenuItem, Stack, TextField } from '@mui/material'
import { Controller, useFormContext } from 'react-hook-form'
import { activityOptions, goalOptions, type WizardFormData } from '../lib/schema'

const StepActivity = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<WizardFormData>()

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Actividad y objetivo"
        subheader="Necesitamos conocer tu nivel de actividad y hacia donde quieres avanzar."
      />
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Controller
            name="activityLevel"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Nivel de actividad"
                fullWidth
                required
                error={!!errors.activityLevel}
                helperText={errors.activityLevel?.message}
              >
                {activityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="goal"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Objetivo"
                fullWidth
                required
                error={!!errors.goal}
                helperText={errors.goal?.message}
              >
                {goalOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Stack>

        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <FormHelperText>
            El tipo de dia ajusta macronutrientes segun si entrenas o descansas.
          </FormHelperText>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default StepActivity
