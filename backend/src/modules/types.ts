import { z } from 'zod'
import { metMap } from './calc/metMap'

export const sexEnum = z.enum(['male', 'female'])
export const profileEnum = z.enum(['general', 'athlete'])
export const activityEnum = z.enum([
  'sedentary',
  'light',
  'moderate',
  'high',
  'hyperactive',
  'sedentary_training_3',
  'sedentary_training_4',
  'sedentary_training_5',
  'sedentary_training_6',
  'light_training_3',
  'light_training_4',
  'light_training_5',
])
export const goalEnum = z.enum(['fat_loss', 'muscle_gain', 'recomp'])
export const dayTypeEnum = z.enum(['rest', 'training_type_1', 'training_type_2', 'training'])

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
    bodyFat: z.number().min(0).max(60).optional(),
    profile: profileEnum,
    activityLevel: activityEnum,
    goal: goalEnum,
    dayType: dayTypeEnum,
    trainingType: trainingTypeEnum.optional(),
    trainingMet: z.number().min(1).max(30).optional(),
    duration: z.number().min(10).max(300).optional(),
    training: trainingSchema.optional(),
  })

export const dayOverrideSchema = z.object({
  activityLevel: activityEnum.nullable().optional(),
  dayType: dayTypeEnum.nullable().optional(),
  macroDistributionId: z.string().trim().min(1).nullable().optional(),
  macroOverride: z
    .object({
      protein: z.coerce.number().nonnegative(),
      carbsAdjusted: z.coerce.number().nonnegative(),
      fatsAdjusted: z.coerce.number().nonnegative(),
    })
    .nullable()
    .optional(),
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
  meals: z
    .array(
      z.object({
        key: z.enum(['breakfast', 'lunch', 'snack', 'snack2', 'dinner']),
        name: z.string(),
        items: z.array(
          z.object({
            foodId: z.string(),
            nameSnapshot: z.string(),
            grams: z.number().nonnegative(),
            macros: z.object({
              protein: z.number().nonnegative(),
              carbs: z.number().nonnegative(),
              fat: z.number().nonnegative(),
            }),
            kcal: z.number().nonnegative(),
          }),
        ),
        totals: z.object({
          protein: z.number().nonnegative(),
          carbs: z.number().nonnegative(),
          fat: z.number().nonnegative(),
          kcal: z.number().nonnegative(),
        }),
      }),
    )
    .optional(),
  mealPortionTargets: z
    .array(
      z.object({
        key: z.enum(['breakfast', 'lunch', 'snack', 'snack2', 'dinner']),
        name: z.string(),
        portions: z.object({
          protein: z.number().nonnegative(),
          carbs: z.number().nonnegative(),
          fat: z.number().nonnegative(),
        }),
      }),
    )
    .nullable()
    .optional(),
  mealCategoryDistribution: z
    .array(
      z.object({
        category: z.string().trim().min(1),
        name: z.string().trim().min(1),
        portions: z.object({
          breakfast: z.number().nonnegative(),
          snack: z.number().nonnegative(),
          lunch: z.number().nonnegative(),
          snack2: z.number().nonnegative(),
          dinner: z.number().nonnegative(),
          extras: z.number().nonnegative(),
        }),
      }),
    )
    .nullable()
    .optional(),
})

export type WizardInputs = z.infer<typeof wizardInputsSchema>
export type DayOverrideInputs = z.infer<typeof dayOverrideSchema>
