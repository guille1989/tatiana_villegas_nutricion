import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { deleteOverride, upsertOverride } from '../lib/api'
import {
  activityOptions,
  dayTypeOptions,
  trainingOptions,
  type ActivityLevel,
  type DayType,
} from '../lib/schema'
import type { DayOverride, DayOverrideInputs, WizardInputs } from '../types'

type Props = {
  open: boolean
  planId: string
  date: string
  baseInputs: WizardInputs
  existingOverride?: DayOverride | null
  onClose: () => void
  onSaved: (override: DayOverride) => void
  onDeleted: (date: string) => void
}

const trainingSchema = z.object({
  type: z.string().min(1, 'Selecciona el tipo'),
  met: z.number().min(1, 'MET minimo 1').max(30, 'MET muy alto'),
  durationMin: z.number().min(10, 'Minimo 10 min').max(300, 'Maximo 300 min'),
})

const activityValues = activityOptions.map((opt) => opt.value) as [ActivityLevel, ...ActivityLevel[]]

const formSchema = z
  .object({
    activityLevel: z.union([z.literal(''), z.enum(activityValues)]).optional(),
    dayType: z.enum(['training', 'rest']),
    training: trainingSchema.partial().nullable().optional(),
    note: z.string().max(240, 'Max 240 caracteres').optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.dayType === 'training') {
      const training = data.training ?? {}
      if (!training.type) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training', 'type'], message: 'Requerido' })
      }
      if (training.durationMin === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['training', 'durationMin'],
          message: 'Requerido',
        })
      }
      if (training.met === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training', 'met'], message: 'Requerido' })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

const DayEditDialog = ({
  open,
  planId,
  date,
  baseInputs,
  existingOverride,
  onClose,
  onSaved,
  onDeleted,
}: Props) => {
  const defaultActivity = existingOverride?.overrides.activityLevel ?? undefined
  const defaultDayType = existingOverride?.overrides.dayType ?? baseInputs.dayType

  const baseTrainingMet =
    baseInputs.trainingMet ??
    trainingOptions.find((opt) => opt.value === baseInputs.trainingType)?.met ??
    undefined

  const defaultTraining = useMemo(
    () =>
      existingOverride?.overrides.training ?? {
        type: baseInputs.trainingType ?? '',
        met: baseTrainingMet,
        durationMin: baseInputs.duration ?? undefined,
      },
    [baseInputs.duration, baseInputs.trainingType, baseTrainingMet, existingOverride?.overrides.training],
  )

  const {
    handleSubmit,
    control,
    formState: { errors, dirtyFields },
    setValue,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      activityLevel: defaultActivity ?? '',
      dayType: defaultDayType,
      training: defaultTraining,
      note: existingOverride?.note ?? '',
    },
  })

  const dayType = useWatch({ control, name: 'dayType' }) as DayType
  const trainingType = useWatch({ control, name: 'training.type' }) as string | undefined
  const trainingMetDirty = (dirtyFields.training as Record<string, boolean> | undefined)?.met

  useEffect(() => {
    const option = trainingOptions.find((item) => item.value === trainingType)
    if (option && !trainingMetDirty) {
      setValue('training.met', option.met, { shouldDirty: false })
    }
  }, [setValue, trainingMetDirty, trainingType])

  useEffect(() => {
    if (!open) {
      reset({
        activityLevel: defaultActivity ?? '',
        dayType: defaultDayType,
        training: defaultTraining,
        note: existingOverride?.note ?? '',
      })
    }
  }, [open, defaultActivity, defaultDayType, defaultTraining, existingOverride?.note, reset])

  const onSubmit = async (values: FormValues) => {
    const activityLevel =
      values.activityLevel === '' || values.activityLevel === undefined
        ? undefined
        : (values.activityLevel as ActivityLevel)

    const overrides: DayOverrideInputs = {
      activityLevel,
      dayType: values.dayType,
    }

    if (values.dayType === 'training') {
      overrides.training = {
        type: values.training?.type ?? null,
        durationMin: values.training?.durationMin ?? null,
        met: values.training?.met ?? null,
      }
    } else {
      overrides.training = null
    }

    try {
      const record = await upsertOverride({
        planId,
        date,
        overrides,
        note: values.note?.trim() ? values.note.trim() : undefined,
      })
      onSaved(record)
      onClose()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteOverride(planId, date)
      onDeleted(date)
      onClose()
    } catch (err) {
      console.error(err)
    }
  }

  const renderTrainingFields = () => {
    if (dayType !== 'training') return null
    return (
      <Stack spacing={2} mt={2}>
        <Controller
          name="training.type"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label="Tipo de entreno"
              fullWidth
              required
              error={!!errors.training?.type}
              helperText={errors.training?.type?.message}
            >
              {trainingOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label} - MET {option.met}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Controller
            name="training.durationMin"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="number"
                label="Duracion (min)"
                fullWidth
                required
                inputProps={{ min: 10, max: 300, step: 5 }}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value === '' ? undefined : Number(event.target.value))}
                error={!!errors.training?.durationMin}
                helperText={errors.training?.durationMin?.message}
              />
            )}
          />
          <Controller
            name="training.met"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="number"
                label="MET (editable)"
                fullWidth
                required
                inputProps={{ min: 1, max: 30, step: 0.1 }}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value === '' ? undefined : Number(event.target.value))}
                error={!!errors.training?.met}
                helperText={errors.training?.met?.message ?? 'Se precarga segun el tipo elegido'}
              />
            )}
          />
        </Stack>
      </Stack>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar {dayjs(date).format('DD MMM YYYY')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} mt={1}>
          <Controller
            name="activityLevel"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Actividad (opcional)"
                fullWidth
                helperText="Deja 'Sin cambio' para usar el plan base"
              >
                <MenuItem value="">Sin cambio</MenuItem>
                {activityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <FormControl component="fieldset">
            <FormLabel>Tipo de dia</FormLabel>
            <Controller
              name="dayType"
              control={control}
              render={({ field }) => (
                <RadioGroup row {...field}>
                  {dayTypeOptions.map((option) => (
                    <FormControlLabel
                      key={option.value}
                      value={option.value}
                      control={<Radio />}
                      label={option.label}
                    />
                  ))}
                </RadioGroup>
              )}
            />
          </FormControl>

          {dayType === 'rest' && (
            <Alert severity="info">Este dia se calculara como descanso. No se usara entrenamiento.</Alert>
          )}

          {renderTrainingFields()}

          <Controller
            name="note"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Nota (opcional)"
                fullWidth
                multiline
                minRows={2}
                value={field.value ?? ''}
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {existingOverride && (
          <Button color="error" onClick={handleDelete}>
            Eliminar override
          </Button>
        )}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit(onSubmit)}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DayEditDialog
