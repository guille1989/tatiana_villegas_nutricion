import {
  Card,
  CardContent,
  CardHeader,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from '@mui/material'
import { Controller, useFormContext } from 'react-hook-form'
import { activityOptions, dayTypeOptions, goalOptions, type WizardFormData } from '../lib/schema'
import Grid from '@mui/material/GridLegacy'

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
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
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
          </Grid>
          <Grid item xs={12} sm={6}>
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
          </Grid>
           {/* <Grid item xs={12}>
            <Controller
              name="dayType"
              control={control}
              render={({ field }) => (
                <FormControl component="fieldset" error={!!errors.dayType}>
                  <FormLabel component="legend">Tipo de dia</FormLabel>
                  <RadioGroup
                    row
                    {...field}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  >
                    {dayTypeOptions.map((option) => (
                      <FormControlLabel
                        key={option.value}
                        value={option.value}
                        control={<Radio />}
                        label={option.label}
                      />
                    ))}
                  </RadioGroup>
                  <FormHelperText>{errors.dayType?.message}</FormHelperText>
                </FormControl>
              )}
            />
          </Grid>*/}
        </Grid>

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
