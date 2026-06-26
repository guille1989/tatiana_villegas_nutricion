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
  { value: 'sedentary', label: '𝐒𝐞𝐝𝐞𝐧𝐭𝐚𝐫𝐢𝐨: Trabajo sentado, me muevo poco' },
  { value: 'light', label: '𝐋𝐢𝐠𝐞𝐫𝐨: Algo de movimiento durante el día' },
  { value: 'moderate', label: '𝐌𝐨𝐝𝐞𝐫𝐚𝐝𝐨: Paso bastante tiempo activo o de pie' },
  { value: 'high', label: '𝐀𝐥𝐭𝐨: Trabajo físico o muy activo' },
] as const

export const excelActivityOptions = [
  { value: 'sedentary_training_3', label: 'Sedentario + 3 dias de entrenamiento (1.30)' },
  { value: 'sedentary_training_4', label: 'Sedentario + 4 dias de entrenamiento (1.40)' },
  { value: 'sedentary_training_5', label: 'Sedentario + 5 dias de entrenamiento (1.50)' },
  { value: 'sedentary_training_6', label: 'Sedentario + 6 dias de entrenamiento (1.60)' },
  { value: 'light_training_3', label: 'Ligeramente activo + 3 dias de entrenamiento (1.50)' },
  { value: 'light_training_4', label: 'Ligeramente activo + 4 dias de entrenamiento (1.60)' },
  { value: 'light_training_5', label: 'Ligeramente activo + 5 dias de entrenamiento (1.70)' },
  { value: 'sedentary', label: 'Sedentario (1.20)' },
  { value: 'light', label: 'Ligero (1.38)' },
  { value: 'moderate', label: 'Moderado (1.55)' },
  { value: 'high', label: 'Muy activo (1.73)' },
  { value: 'hyperactive', label: 'Hiperactivo (1.90)' },
] as const

export const goalOptions = [
  { value: 'fat_loss', label: 'Perdida grasa' },
  { value: 'muscle_gain', label: 'Ganancia muscular' }
] as const

export const dayTypeOptions = [
  { value: 'rest', label: 'Descanso' },
  { value: 'training_type_1', label: 'Entreno tipo 1' },
  { value: 'training_type_2', label: 'Entreno tipo 2' },
  { value: 'training', label: 'Entreno legacy' },
] as const

export const visibleDayTypeOptions = dayTypeOptions.filter((option) => option.value !== 'training')

export const trainingOptions = [
  { value: 'strength_light', label: 'Fuerza ligera', met: 3.5 },
  { value: 'strength_moderate', label: 'Fuerza moderada', met: 5 },
  { value: 'strength_intense', label: 'Fuerza intensa', met: 6 },
  { value: 'bodybuilding', label: 'Bodybuilding', met: 5 },
  { value: 'powerlifting', label: 'Powerlifting', met: 6 },
  { value: 'weightlifting', label: 'Halterofilia', met: 6 },
  { value: 'calisthenics_basic', label: 'Calistenia básica', met: 3.8 },
  { value: 'calisthenics_advanced', label: 'Calistenia avanzada', met: 6 },
  { value: 'cardio_light', label: 'Cardio suave', met: 5 },
  { value: 'cardio_moderate', label: 'Cardio moderado', met: 7 },
  { value: 'cardio_intense', label: 'Cardio intenso', met: 9 },
  { value: 'hiit_moderate', label: 'HIIT moderado', met: 7.5 },
  { value: 'hiit_intense', label: 'HIIT intenso', met: 9.5 },
  { value: 'hiit', label: 'HIIT', met: 10 },
  { value: 'circuit_training', label: 'Circuit training', met: 8 },
  { value: 'bootcamp', label: 'Bootcamp', met: 8 },
  { value: 'crossfit_moderate', label: 'CrossFit moderado', met: 8 },
  { value: 'crossfit_intense', label: 'CrossFit intenso', met: 10 },
  { value: 'crossfit', label: 'CrossFit', met: 10 },
  { value: 'running_z2', label: 'Carrera Z2', met: 8.5 },
  { value: 'running_tempo', label: 'Carrera tempo', met: 11 },
  { value: 'running_long_intervals', label: 'Carrera series largas', met: 12 },
  { value: 'running_short_intervals', label: 'Carrera series cortas', met: 14 },
  { value: 'cycling_light', label: 'Bicicleta suave', met: 4 },
  { value: 'cycling_moderate', label: 'Bicicleta moderada', met: 6.8 },
  { value: 'cycling_intense', label: 'Bicicleta intenso', met: 8 },
  { value: 'cycling_very_intense', label: 'Bicicleta muy intensa', met: 10 },
  { value: 'indoor_cycling_moderate', label: 'Bici indoor moderada', met: 7 },
  { value: 'indoor_cycling_intense', label: 'Bici indoor intensa', met: 10 },
  { value: 'pilates_mat', label: 'Pilates suelo', met: 3 },
  { value: 'pilates_machine', label: 'Pilates máquina', met: 3.8 },
  { value: 'yoga_light', label: 'Yoga suave', met: 2.5 },
  { value: 'yoga_vinyasa', label: 'Yoga vinyasa', met: 4 },
  { value: 'mobility', label: 'Movilidad', met: 2.3 },
  { value: 'swimming_light', label: 'Natación suave', met: 6 },
  { value: 'swimming_moderate', label: 'Natación moderada', met: 8 },
  { value: 'swimming_intense', label: 'Natación intensa', met: 9.8 },
  { value: 'swimming_competitive', label: 'Natación competitiva', met: 10.5 },
  { value: 'boxing_bag', label: 'Boxeo saco', met: 5.5 },
  { value: 'boxing_sparring', label: 'Boxeo sparring', met: 7.8 },
  { value: 'kickboxing', label: 'Kickboxing', met: 10 },
  { value: 'football_recreational', label: 'Fútbol recreativo', met: 7 },
  { value: 'football_competitive', label: 'Fútbol competitivo', met: 10 },
  { value: 'basketball_recreational', label: 'Baloncesto recreativo', met: 6.5 },
  { value: 'basketball_competitive', label: 'Baloncesto competitivo', met: 8 },
  { value: 'tennis_doubles', label: 'Tenis dobles', met: 5 },
  { value: 'tennis_singles', label: 'Tenis singles', met: 7.3 },
  { value: 'padel', label: 'Padel', met: 6 },
  { value: 'walking_light', label: 'Caminar suave', met: 2.8 },
  { value: 'walking_fast', label: 'Caminar rápido', met: 4.3 },
  { value: 'elliptical_moderate', label: 'Elíptica moderada', met: 5 },
  { value: 'elliptical_intense', label: 'Elíptica intensa', met: 8 },
  { value: 'rowing_moderate', label: 'Remo moderado', met: 6 },
  { value: 'rowing_intense', label: 'Remo intenso', met: 8.5 },
] as const

type OptionValue<T extends ReadonlyArray<{ value: string }>> = T[number]['value']

export type Sex = OptionValue<typeof sexOptions>
export type Profile = OptionValue<typeof profileOptions>
export type ActivityLevel = OptionValue<typeof excelActivityOptions>
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
    bodyFat: optionalNumber('% grasa corporal', 0, 60),
    profile: z.enum(profileOptions.map((p) => p.value) as [Profile, ...Profile[]], 'Selecciona un perfil'),
    activityLevel: z.enum(
      excelActivityOptions.map((a) => a.value) as [ActivityLevel, ...ActivityLevel[]],
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
  activityLevel: 'sedentary_training_5',
  goal: 'fat_loss',
  dayType: 'rest',
  trainingType: undefined,
  duration: undefined,
}
