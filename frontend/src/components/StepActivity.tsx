import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { excelActivityOptions, goalOptions, visibleDayTypeOptions, type WizardFormData } from '../lib/schema'

const StepActivity = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<WizardFormData>()
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Actividad y objetivo"
        subheader="Necesitamos conocer tu nivel de actividad y hacia donde quieres avanzar. Estos niveles describen cuánta actividad física hacer FUERA del entrenamiento: Trabajo, desplazamientos, tareas del día a día. El entrenamiento se calcula aparte."
        action={
          <IconButton
            aria-label="Informacion de niveles de actividad"
            onClick={() => setInfoOpen(true)}
          >
            <InfoOutlinedIcon />
          </IconButton>
        }
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
                {excelActivityOptions.map((option) => (
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
          <Controller
            name="dayType"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Tipo de dia"
                fullWidth
                required
                error={!!errors.dayType}
                helperText={errors.dayType?.message}
              >
                {visibleDayTypeOptions.map((option) => (
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

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Niveles de actividad diaria</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack spacing={0.75}>
              <Typography variant="subtitle2" fontWeight={700}>
                Sedentario
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2">
                  Factor bajo de actividad diaria.
                </Typography>
                <Typography component="li" variant="body2">
                  Pasas la mayor parte del dia sentado.
                </Typography>
                <Typography component="li" variant="body2">
                  Trabajo de oficina o estudio sin desplazamientos activos.
                </Typography>
                <Typography component="li" variant="body2">
                  Caminas poco (normalmente &lt;5.000 pasos/dia).
                </Typography>
                <Typography component="li" variant="body2">
                  Tareas domesticas minimas.
                </Typography>
              </Stack>
              <Typography variant="body2">
                Ejemplo tipico: Trabajo frente al ordenador, me muevo poco y no hago
                actividad fisica fuera del entreno.
              </Typography>
            </Stack>

            <Stack spacing={0.75}>
              <Typography variant="subtitle2" fontWeight={700}>
                Ligero
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2">
                  Actividad diaria baja-moderada.
                </Typography>
                <Typography component="li" variant="body2">
                  Te mueves algo durante el dia, pero no de forma continua.
                </Typography>
                <Typography component="li" variant="body2">
                  Caminas con cierta frecuencia (5.000-7.000 pasos/dia).
                </Typography>
                <Typography component="li" variant="body2">
                  Trabajo mayormente sedentario con pausas activas.
                </Typography>
                <Typography component="li" variant="body2">
                  Tareas domesticas regulares.
                </Typography>
              </Stack>
              <Typography variant="body2">
                Ejemplo tipico: Trabajo sentado, pero camino a ratos, hago recados a pie
                o me mantengo algo activo durante el dia.
              </Typography>
            </Stack>

            <Stack spacing={0.75}>
              <Typography variant="subtitle2" fontWeight={700}>
                Moderado
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2">
                  Actividad diaria claramente activa.
                </Typography>
                <Typography component="li" variant="body2">
                  Pasas buena parte del dia de pie o caminando.
                </Typography>
                <Typography component="li" variant="body2">
                  Caminas bastante (7.000-10.000 pasos/dia).
                </Typography>
                <Typography component="li" variant="body2">
                  Trabajo activo: educacion, comercio, sanidad, hosteleria.
                </Typography>
                <Typography component="li" variant="body2">
                  Tareas domesticas frecuentes o cuidado de personas.
                </Typography>
              </Stack>
              <Typography variant="body2">
                Ejemplo tipico: Mi rutina diaria implica moverme bastante.
              </Typography>
            </Stack>

            <Stack spacing={0.75}>
              <Typography variant="subtitle2" fontWeight={700}>
                Alto
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2">
                  Actividad diaria muy activa.
                </Typography>
                <Typography component="li" variant="body2">
                  Trabajo fisico o manual.
                </Typography>
                <Typography component="li" variant="body2">
                  Caminas mucho o realizas esfuerzo fisico durante horas.
                </Typography>
                <Typography component="li" variant="body2">
                  Mas de 10.000 pasos/dia de forma habitual.
                </Typography>
                <Typography component="li" variant="body2">
                  Cargas, empujas, te desplazas constantemente.
                </Typography>
              </Stack>
              <Typography variant="body2">
                Ejemplo tipico: Mi trabajo es fisicamente exigente o paso gran parte del
                dia en movimiento.
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default StepActivity
