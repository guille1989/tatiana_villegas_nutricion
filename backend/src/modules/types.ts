import { z } from 'zod'
import { metMap } from './calc/metMap'

export const sexEnum = z.enum(['male', 'female'])
export const profileEnum = z.enum(['general', 'athlete'])
export const activityEnum = z.enum(['sedentary', 'light', 'moderate', 'high'])
export const goalEnum = z.enum(['fat_loss', 'muscle_gain', 'recomp'])
export const dayTypeEnum = z.enum(['training', 'rest'])

export const trainingTypeEnum = z.enum(Object.keys(metMap) as [keyof typeof metMap, ...(keyof typeof metMap)[]])

export const trainingSchema = z.object({
  type: trainingTypeEnum,
  met: z.number().positive(),
  durationMin: z.number().min(10).max(300),
})

export const trainingsSchema = z
  .array(
    z.object({
      type: trainingTypeEnum.optional().nullable(),
      met: z.number().min(1).max(30).optional().nullable(),
      durationMin: z.number().min(10).max(300).optional().nullable(),
    }),
  )

export const wizardInputsSchema = z
  .object({
    name: z.string().trim().min(1),
    sex: sexEnum,
    age: z.number().min(10).max(100),
    weight: z.number().min(30).max(250),
    height: z.number().min(120).max(230),
    bodyFat: z.number().min(3).max(60).optional(),
    profile: profileEnum,
    activityLevel: activityEnum,
    goal: goalEnum,
    dayType: dayTypeEnum,
    trainingType: trainingTypeEnum.optional(),
    trainingMet: z.number().min(1).max(30).optional(),
    duration: z.number().min(10).max(300).optional(),
    training: trainingSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dayType === 'training') {
      const hasTraining =
        (data.training?.type && data.training?.met !== undefined && data.training?.durationMin !== undefined) ||
        (data.trainingType && data.duration !== undefined)

      if (!hasTraining) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training'], message: 'Training data required' })
      }
    }
  })

export const dayOverrideSchema = z.object({
  activityLevel: activityEnum.nullable().optional(),
  dayType: dayTypeEnum.nullable().optional(),
  trainings: trainingsSchema.nullable().optional(),
  // Backward compatibility: allow single training object
  training: z
    .object({
      type: trainingTypeEnum.nullable().optional(),
      met: z.number().min(1).max(30).nullable().optional(),
      durationMin: z.number().min(10).max(300).nullable().optional(),
    })
    .nullable()
    .optional(),
})

export type WizardInputs = z.infer<typeof wizardInputsSchema>
export type DayOverrideInputs = z.infer<typeof dayOverrideSchema>
