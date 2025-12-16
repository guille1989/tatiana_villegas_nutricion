import { z } from 'zod'

export const sexOptions = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
] as const

export const profileOptions = [
  { value: 'general', label: 'General' },
  { value: 'athlete', label: 'Deportista' },
] as const

export const activityOptions = [
  { value: 'sedentary', label: 'Sedentario' },
  { value: 'light', label: 'Ligero' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'high', label: 'Alto' },
] as const

export const goalOptions = [
  { value: 'fat_loss', label: 'Perdida grasa' },
  { value: 'muscle_gain', label: 'Ganancia muscular' },
  { value: 'recomp', label: 'Recomposicion' },
] as const

export const dayTypeOptions = [
  { value: 'training', label: 'Entreno' },
  { value: 'rest', label: 'Descanso' },
] as const

export const trainingOptions = [
  { value: 'strength', label: 'Fuerza (moderada)', met: 5 },
  { value: 'hiit', label: 'HIIT', met: 10 },
  { value: 'crossfit', label: 'Crossfit', met: 11 },
  { value: 'cardio_light', label: 'Cardio suave', met: 4 },
  { value: 'cardio_moderate', label: 'Cardio moderado', met: 7 },
] as const

type OptionValue<T extends ReadonlyArray<{ value: string }>> = T[number]['value']

export type Sex = OptionValue<typeof sexOptions>
export type Profile = OptionValue<typeof profileOptions>
export type ActivityLevel = OptionValue<typeof activityOptions>
export type Goal = OptionValue<typeof goalOptions>
export type DayType = OptionValue<typeof dayTypeOptions>
export type TrainingType = OptionValue<typeof trainingOptions>

const requiredNumber = (label: string, min: number, max: number) =>
  z.number().min(min, `${label} minimo ${min}`).max(max, `${label} maximo ${max}`)

const optionalNumber = (label: string, min?: number, max?: number) =>
  z
    .number()
    .min(min ?? Number.MIN_SAFE_INTEGER, {
      message: min ? `${label} minimo ${min}` : `${label} fuera de rango`,
    })
    .max(max ?? Number.MAX_SAFE_INTEGER, {
      message: max ? `${label} maximo ${max}` : `${label} fuera de rango`,
    })
    .optional()

export const wizardSchema = z
  .object({
    name: z.string().trim().min(1, 'Nombre requerido'),
    sex: z.enum(sexOptions.map((s) => s.value) as [Sex, ...Sex[]], 'Selecciona sexo'),
    age: requiredNumber('Edad', 10, 90),
    weight: requiredNumber('Peso', 30, 250),
    height: requiredNumber('Talla', 120, 230),
    bodyFat: optionalNumber('% grasa corporal', 3, 60),
    profile: z.enum(profileOptions.map((p) => p.value) as [Profile, ...Profile[]], 'Selecciona un perfil'),
    activityLevel: z.enum(
      activityOptions.map((a) => a.value) as [ActivityLevel, ...ActivityLevel[]],
      'Selecciona el nivel de actividad',
    ),
    goal: z.enum(goalOptions.map((g) => g.value) as [Goal, ...Goal[]], 'Selecciona un objetivo'),
    dayType: z.enum(dayTypeOptions.map((d) => d.value) as [DayType, ...DayType[]], 'Selecciona el tipo de dia'),
    trainingType: z
      .enum(trainingOptions.map((t) => t.value) as [TrainingType, ...TrainingType[]])
      .optional(),
    duration: optionalNumber('Duracion', 10, 180),
  })
  .superRefine((data, ctx) => {
    if (data.dayType === 'training') {
      if (!data.trainingType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trainingType'],
          message: 'Selecciona el tipo de entreno',
        })
      }
      if (data.duration === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['duration'],
          message: 'Indica la duracion',
        })
      }
    }
  })

export type WizardFormData = z.infer<typeof wizardSchema>

export const DEFAULT_VALUES: WizardFormData = {
  name: '',
  sex: 'male',
  age: 30,
  weight: 70,
  height: 170,
  bodyFat: undefined,
  profile: 'general',
  activityLevel: 'moderate',
  goal: 'recomp',
  dayType: 'rest',
  trainingType: 'strength',
  duration: 45,
}
