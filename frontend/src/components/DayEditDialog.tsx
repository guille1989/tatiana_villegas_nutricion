import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch, type SubmitHandler } from 'react-hook-form'
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'

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
    trainings: z.array(trainingSchema.partial()).optional(),
    note: z.string().max(240, 'Max 240 caracteres').optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.dayType === 'training') {
      const trainings = data.trainings ?? []
      if (trainings.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainings'], message: 'Agrega al menos un entreno' })
      }
      trainings.forEach((training, idx) => {
        if (!training.type) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainings', idx, 'type'], message: 'Requerido' })
        }
        if (training.durationMin === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['trainings', idx, 'durationMin'],
            message: 'Requerido',
          })
        }
        if (training.met === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainings', idx, 'met'], message: 'Requerido' })
        }
      })
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

  const defaultTrainings = useMemo(() => {
    if (existingOverride?.overrides?.trainings && existingOverride.overrides.trainings.length > 0) {
      return existingOverride.overrides.trainings.map((t) => ({
        type: t?.type ?? undefined,
        met: t?.met ?? undefined,
        durationMin: t?.durationMin ?? undefined,
      }))
    }
    const legacyTraining = (existingOverride as any)?.overrides?.training
    if (legacyTraining) {
      const t = legacyTraining
      return [
        {
          type: t?.type ?? undefined,
          met: t?.met ?? undefined,
          durationMin: t?.durationMin ?? undefined,
        },
      ]
    }
    if (baseInputs.trainingType && baseInputs.duration) {
      return [
        {
          type: baseInputs.trainingType,
          met: baseTrainingMet,
          durationMin: baseInputs.duration ?? undefined,
        },
      ]
    }
    return []
  }, [baseInputs.duration, baseInputs.trainingType, baseTrainingMet, existingOverride?.overrides])

  const {
    handleSubmit,
    control,
    formState: { errors, dirtyFields },
    setValue,
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      activityLevel: defaultActivity ?? '',
      dayType: defaultDayType,
      trainings: defaultTrainings,
      note: existingOverride?.note ?? '',
    },
  })

  const dayType = useWatch({ control, name: 'dayType' }) as DayType
  const trainings = watch('trainings') ?? []
  const [expandedPanels, setExpandedPanels] = useState<number[]>([])
  const prevLengthRef = useRef(trainings.length)

  useEffect(() => {
    // Autofill MET based on type when not dirty
    trainings.forEach((session, idx) => {
      const tType = session?.type
      const metDirty = (dirtyFields.trainings as any)?.[idx]?.met
      const option = trainingOptions.find((item) => item.value === tType)
      if (option && !metDirty && session?.met === undefined) {
        setValue(`trainings.${idx}.met`, option.met, { shouldDirty: false })
      }
    })
  }, [trainings, dirtyFields.trainings, setValue])

  useEffect(() => {
    if (!open) {
      reset({
        activityLevel: defaultActivity ?? '',
        dayType: defaultDayType,
        trainings: defaultTrainings,
        note: existingOverride?.note ?? '',
      })
      setExpandedPanels([])
    }
  }, [open, defaultActivity, defaultDayType, defaultTrainings, existingOverride?.note, reset])

  useEffect(() => {
    const len = trainings.length
    if (len > prevLengthRef.current) {
      setExpandedPanels((prev) => Array.from(new Set([...prev, len - 1])))
    }
    prevLengthRef.current = len
  }, [trainings.length])

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const activityLevel =
      values.activityLevel === '' || values.activityLevel === undefined
        ? undefined
        : (values.activityLevel as ActivityLevel)

    const overrides: DayOverrideInputs = {
      activityLevel,
      dayType: values.dayType,
    }

    if (values.dayType === 'training') {
      overrides.trainings =
        values.trainings
          ?.map((session) => ({
            type: session?.type ?? undefined,
            durationMin: session?.durationMin ?? undefined,
            met: session?.met ?? undefined,
          }))
          .filter((s) => s.type || s.durationMin || s.met) ?? null
    } else {
      overrides.trainings = null
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

    const handleAdd = () => {
      const current = trainings ?? []
      setValue('trainings', [...current, { type: '', met: undefined, durationMin: undefined }], { shouldDirty: true })
    }

    const togglePanel = (idx: number) => {
      setExpandedPanels((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]))
    }

    const handleRemove = (index: number) => {
      const current = trainings ?? []
      setValue(
        'trainings',
        current.filter((_, idx) => idx !== index),
        { shouldDirty: true },
      )
      setExpandedPanels((prev) => prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)))
    }

    return (
      <Stack spacing={2} mt={2}>
        {(trainings ?? []).map((session, idx) => {
          const trainingType = session?.type ?? ''
          const option = trainingOptions.find((item) => item.value === trainingType)
          return (
            <Accordion
              key={idx}
              expanded={expandedPanels.includes(idx)}
              onChange={() => togglePanel(idx)}
              disableGutters
              sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon fontSize="small" />}
                sx={{
                  '& .MuiAccordionSummary-content': { margin: 0 },
                  px: 1.5,
                  py: 1,
                  alignItems: 'center',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} width="100%">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>
                      Entreno {idx + 1} {option ? `· ${option.label}` : ''}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        {session?.durationMin ? `${session.durationMin} min` : 'Sin duracion'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ·
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {session?.met ? `MET ${session.met}` : 'MET sin definir'}
                      </Typography>
                    </Stack>
                  </Box>
                  <IconButton
                    edge="end"
                    color="error"
                    size="small"
                    aria-label={`Eliminar entreno ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(idx)
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </AccordionSummary>

              <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                <Stack spacing={1.25}>
                  <TextField
                    select
                    label="Tipo de entreno"
                    fullWidth
                    size="small"
                    value={trainingType}
                    onChange={(event) => setValue(`trainings.${idx}.type`, event.target.value, { shouldDirty: true })}
                    required
                    error={!!errors.trainings?.[idx]?.type}
                    helperText={(errors.trainings?.[idx] as any)?.type?.message}
                  >
                    {trainingOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label} - MET {option.met}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Controller
                      name={`trainings.${idx}.durationMin`}
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          type="number"
                          label="Duracion (min)"
                          fullWidth
                          size="small"
                          required
                          inputProps={{ min: 10, max: 300, step: 5 }}
                          value={field.value ?? ''}
                          onChange={(event) =>
                            field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                          }
                          error={!!errors.trainings?.[idx]?.durationMin}
                          helperText={(errors.trainings?.[idx] as any)?.durationMin?.message}
                        />
                      )}
                    />
                    <Controller
                      name={`trainings.${idx}.met`}
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          type="number"
                          label="MET (editable)"
                          fullWidth
                          size="small"
                          required
                          inputProps={{ min: 1, max: 30, step: 0.1 }}
                          value={field.value ?? ''}
                          onChange={(event) =>
                            field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                          }
                          error={!!errors.trainings?.[idx]?.met}
                          helperText={
                            (errors.trainings?.[idx] as any)?.met?.message ?? 'Se precarga segun el tipo elegido'
                          }
                        />
                      )}
                    />
                  </Stack>
                </Stack>
              </AccordionDetails>
            </Accordion>
          )
        })}

        <Button variant="outlined" onClick={handleAdd} size="small" startIcon={<AddIcon />}>
          Agregar otro entreno
        </Button>
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
