import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { Types } from 'mongoose'
import { z } from 'zod'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { PlanModel } from '../models/Plan'
import { MessageModel } from '../models/Message'
import { calculateDayFromBase } from '../modules/calc/dayCalc'
import { applyMacroOverrideToOutputs, calcKcalFromMacros } from '../modules/calc/calc'
import { AssessmentModel } from '../models/Assessment'
import { env } from '../config/env'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { ApiError, badRequest, notFound, unauthorized } from '../utils/apiError'
import { dayOverrideSchema, type DayOverrideInputs, type WizardInputs } from '../modules/types'

const router = Router()

router.use(authMiddleware)

const formatPlanDate = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${day}/${month}/${year}`
}

const parsePlanNumber = (title?: string | null) => {
  if (!title) return 0
  const match = title.match(/planificaci\S*\s*(\d+)/i)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

const getNextPlanNumber = async (userId: string) => {
  const plans = await PlanModel.find({ userId }).select('title').lean()
  const maxNumber = plans.reduce(
    (acc, plan) => Math.max(acc, parsePlanNumber(plan.title)),
    0,
  )
  return maxNumber + 1
}

const buildDefaultPlanTitle = (date: Date, number: number) =>
  `Planificación ${number} - ${formatPlanDate(date)}`

const createPlanSchema = z.object({
  baseAssessmentId: z.string().min(1),
  startDate: z.string().min(1),
  days: z.union([z.literal(5), z.literal(7), z.literal(15), z.literal(30)]),
  title: z.string().optional(),
})

const macroOverrideSchema = z.object({
  protein: z.coerce.number().nonnegative(),
  carbsAdjusted: z.coerce.number().nonnegative(),
  fatsAdjusted: z.coerce.number().nonnegative(),
})

const macroOverrideBodySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  macros: macroOverrideSchema,
})

const macroDistributionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  dayType: z.enum(['rest', 'training_type_1', 'training_type_2', 'training']).optional(),
  kcalDelta: z.coerce.number().finite().optional(),
  carbsPerKg: z.coerce.number().nonnegative(),
  proteinPerKg: z.coerce.number().nonnegative(),
  isDefault: z.boolean().optional().default(false),
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
  generatedMenu: z.unknown().nullable().optional(),
  mealPreferences: z.string().max(500).nullable().optional(),
})

const planStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
})

const MAX_MESSAGE_LENGTH = 1000
const DEFAULT_PLAN_DISPLAY_NAME = 'Plan nutricional'
const DEFAULT_PLAN_ENABLED_MESSAGE_TEMPLATE = [
  '{{greeting}}',
  '',
  'Ya tienes tu planificacion para el proximo mes.',
  '',
  'Segun lo que hablamos tu objetivo es {{kcalObjectiveDay}}.',
  '',
  'Este es tu plan "{{planName}}".',
  '',
  'Echale un vistazo a todo y me cuentas si tienes alguna duda. Acuerdate que me puedes hablar por WhatsApp o Email si te surge alguna duda o problema.',
].join('\n')

const resolvePlanDisplayName = (plan: { title?: string | null }) => {
  const title = plan.title?.trim()
  return title && title.length > 0 ? title : DEFAULT_PLAN_DISPLAY_NAME
}

const resolveGreeting = (date = new Date()) =>
  date.getHours() < 14 ? 'Buenos dias' : 'Buenas tardes'

const formatKcalObjectiveDay = (kcalObjectiveDay: number | null) =>
  kcalObjectiveDay !== null && Number.isFinite(kcalObjectiveDay)
    ? `${Math.round(kcalObjectiveDay)} kcal`
    : 'las kcal definidas en tu plan'

const resolvePlanKcalObjectiveDay = async (
  plan: {
    macroOverrides?: Array<MacroOverrideEntry>
    baseAssessmentId: Types.ObjectId
  },
) => {
  const normalized = normalizeMacroOverrides(plan.macroOverrides)
  if (normalized.length > 0) {
    const sorted = [...normalized].sort((a, b) =>
      a.effectiveFrom < b.effectiveFrom ? 1 : -1,
    )
    const fromOverride = sorted.find((item) =>
      Number.isFinite(item.macros.kcalObjectiveDay),
    )?.macros.kcalObjectiveDay
    if (fromOverride !== undefined && Number.isFinite(fromOverride)) return fromOverride
  }

  const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    .select('outputs.kcalObjectiveDay')
    .lean<{ outputs?: { kcalObjectiveDay?: number } }>()
  const fromAssessment = assessment?.outputs?.kcalObjectiveDay
  return fromAssessment !== undefined && Number.isFinite(fromAssessment)
    ? fromAssessment
    : null
}

const buildPlanEnabledMessage = (payload: {
  planName: string
  kcalObjectiveDay: number | null
  now?: Date
}) => {
  const { planName, kcalObjectiveDay, now = new Date() } = payload
  const template = env.planEnabledMessageTemplate?.trim()
  const baseTemplate =
    template && template.length > 0
      ? template
      : DEFAULT_PLAN_ENABLED_MESSAGE_TEMPLATE
  const greeting = resolveGreeting(now)
  const kcalLabel = formatKcalObjectiveDay(kcalObjectiveDay)

  const interpolated = baseTemplate
    .replace(/\{\{\s*greeting\s*\}\}|\{\s*greeting\s*\}/gi, greeting)
    .replace(/\{\{\s*planName\s*\}\}|\{\s*planName\s*\}/gi, planName)
    .replace(/\{\{\s*kcalObjectiveDay\s*\}\}|\{\s*kcalObjectiveDay\s*\}/gi, kcalLabel)

  return interpolated.length > MAX_MESSAGE_LENGTH
    ? `${interpolated.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
    : interpolated
}

type MacroOverrideValue = z.infer<typeof macroOverrideSchema> & {
  kcalObjectiveDay?: number
}
type MacroOverrideEntry = { effectiveFrom: string; macros?: MacroOverrideValue | null }
type MacroDistributionValue = Omit<z.infer<typeof macroDistributionSchema>, 'dayType' | 'kcalDelta'> & {
  id: string
  dayType?: string | null
  kcalDelta?: number
}

const normalizeMacroOverrides = (overrides: Array<MacroOverrideEntry> | undefined) =>
  (overrides ?? []).filter(
    (item): item is { effectiveFrom: string; macros: MacroOverrideValue } =>
      !!item?.macros,
  )

const getMacroOverrideForDate = (
  overrides: Array<MacroOverrideEntry> | undefined,
  date: string,
) => {
  const normalized = normalizeMacroOverrides(overrides)
  if (normalized.length === 0) return null
  const filtered = normalized.filter((item) => item.effectiveFrom <= date)
  if (filtered.length === 0) return null
  filtered.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
  return filtered[filtered.length - 1]
}

const normalizeMacroDistributions = (
  distributions: Array<MacroDistributionValue> | undefined,
) => distributions ?? []

const getLegacyDistributionKcalDelta = (dayType?: string | null) =>
  dayType && dayType !== 'rest' ? 300 : 0

const getDistributionKcalDelta = (
  distribution: MacroDistributionValue | null | undefined,
) =>
  Number.isFinite(distribution?.kcalDelta)
    ? Number(distribution?.kcalDelta)
    : getLegacyDistributionKcalDelta(distribution?.dayType)

const ensureMacroDistributionDefaults = (
  distributions: MacroDistributionValue[],
) => {
  const result = distributions.map((item) => ({ ...item }))
  const selectedDefault = result.find((item) => item.isDefault) ?? result[0]
  result.forEach((item) => {
    item.isDefault = item.id === selectedDefault?.id
  })
  return result
}

const getMacroDistributionForDay = (
  distributions: Array<MacroDistributionValue> | undefined,
  overrides: DayOverrideInputs | null | undefined,
  dayType: WizardInputs['dayType'],
) => {
  const normalized = normalizeMacroDistributions(distributions)
  const explicitId = overrides?.macroDistributionId
  if (explicitId) {
    const explicit = normalized.find((item) => item.id === explicitId)
    if (explicit) return explicit
  }
  return (
    normalized.find((item) => item.dayType === dayType && item.isDefault) ??
    normalized.find((item) => item.isDefault) ??
    null
  )
}

const macroOverrideFromDistribution = (
  distribution: MacroDistributionValue | null,
  weight: number,
): MacroOverrideValue | null =>
  distribution
    ? {
        protein: weight * distribution.proteinPerKg,
        carbsAdjusted: weight * distribution.carbsPerKg,
        fatsAdjusted: 0,
      }
    : null

const getTrainingType = (
  overrides: DayOverrideInputs | null | undefined,
  baseInputs?: WizardInputs | null,
): WizardInputs['trainingType'] | null => {
  const overrideTraining =
    overrides?.trainings?.find((item) => item?.type)?.type ?? overrides?.training?.type ?? null
  return (overrideTraining ?? baseInputs?.trainingType ?? null) as WizardInputs['trainingType'] | null
}

const getDayMacroOverride = (overrides: DayOverrideInputs | null | undefined): MacroOverrideValue | null => {
  if (!overrides?.macroOverride) return null
  return {
    protein: overrides.macroOverride.protein,
    carbsAdjusted: overrides.macroOverride.carbsAdjusted,
    fatsAdjusted: overrides.macroOverride.fatsAdjusted,
  }
}

const applyMacroOverride = (
  outputs: ReturnType<typeof calculateDayFromBase>['outputs'],
  planOverride: { macros: MacroOverrideValue } | null,
  dayOverride: MacroOverrideValue | null,
  distributionOverride: MacroOverrideValue | null,
  distribution: MacroDistributionValue | null,
  dayType: WizardInputs['dayType'],
  trainingType: WizardInputs['trainingType'] | null,
  goal: WizardInputs['goal'],
  weight: number,
  activityDelta = 0,
) => {
  const override = dayOverride ?? distributionOverride ?? planOverride?.macros ?? null
  if (!override) return outputs
  return applyMacroOverrideToOutputs({
    outputs,
    overrideMacros: override,
    dayType,
    trainingType,
    goal,
    weight,
    activityDelta,
    targetCaloriesOverride:
      distributionOverride && outputs.kcalObjectiveBase !== undefined
        ? outputs.kcalObjectiveBase + getDistributionKcalDelta(distribution)
        : undefined,
  })
}

const isMemberPlanActive = (plan: { status?: string | null }) =>
  plan.status === 'active' || !plan.status

const assertMemberPlanAccess = (plan: { userId: string; status?: string | null }, userId: string | undefined, isAdmin: boolean) => {
  if (isAdmin) return
  if (!userId || plan.userId !== userId) throw badRequest('Acceso no permitido')
  if (!isMemberPlanActive(plan)) throw badRequest('Plan no activo')
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')

    const { baseAssessmentId, startDate, days, title } = parsed.data
    const startDateValue = new Date(startDate)
    let planTitle = title?.trim() ?? ''
    if (!planTitle) {
      const nextPlanNumber = await getNextPlanNumber(userId)
      planTitle = buildDefaultPlanTitle(startDateValue, nextPlanNumber)
    }
    await PlanModel.updateMany({ userId, status: 'active' }, { status: 'archived' })
    const plan = await PlanModel.create({
      userId,
      baseAssessmentId: new Types.ObjectId(baseAssessmentId),
      startDate: startDateValue,
      days,
      title: planTitle,
      status: 'active',
    })
    res.status(201).json({ plan })
  }),
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')
    const plans = await PlanModel.find({ userId }).sort({ createdAt: -1 })
    res.json({ plans })
  }),
)

router.get(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    const plan = await PlanModel.findById(planId).populate('baseAssessmentId')
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    assertMemberPlanAccess(plan, req.user?.id, isAdmin)

    const overrides = await PlanDayOverrideModel.find({ planId })
    res.json({ plan, overrides })
  }),
)

router.put(
  '/:planId/macro-overrides',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    const parsed = macroOverrideBodySchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin) throw badRequest('Acceso no permitido')

    const today = new Date().toISOString().slice(0, 10)
    const requestedDate = parsed.data.effectiveFrom ?? today
    const effectiveFrom = requestedDate < today ? today : requestedDate

    const nextOverride = {
      effectiveFrom,
      macros: {
        ...parsed.data.macros,
        kcalObjectiveDay: calcKcalFromMacros(parsed.data.macros),
      },
    }

    const existing = normalizeMacroOverrides(plan.macroOverrides)
    const filtered = existing.filter(
      (item: { effectiveFrom: string }) => item.effectiveFrom !== effectiveFrom,
    )
    plan.set('macroOverrides', [...filtered, nextOverride])
    await plan.save()

    res.json({ plan })
  }),
)

router.post(
  '/:planId/macro-distributions',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    const parsed = macroDistributionSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (req.user?.role !== 'admin') throw badRequest('Acceso no permitido')

    const existing = normalizeMacroDistributions(plan.macroDistributions)
    const hasDefault = existing.some(
      (item) => item.isDefault,
    )
    const nextDistribution: MacroDistributionValue = {
      id: randomUUID(),
      ...parsed.data,
      kcalDelta: parsed.data.kcalDelta ?? getLegacyDistributionKcalDelta(parsed.data.dayType),
      mealCategoryDistribution: parsed.data.mealCategoryDistribution ?? null,
      generatedMenu: parsed.data.generatedMenu ?? null,
      mealPreferences: parsed.data.mealPreferences ?? null,
      isDefault: parsed.data.isDefault || !hasDefault,
    }
    const next = existing.map((item) =>
      nextDistribution.isDefault
        ? { ...item, isDefault: false }
        : item,
    )
    plan.set(
      'macroDistributions',
      ensureMacroDistributionDefaults([...next, nextDistribution]),
    )
    await plan.save()
    res.status(201).json({ plan })
  }),
)

router.put(
  '/:planId/macro-distributions/:distributionId',
  asyncHandler(async (req, res) => {
    const { planId, distributionId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    const parsed = macroDistributionSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (req.user?.role !== 'admin') throw badRequest('Acceso no permitido')

    const existing = normalizeMacroDistributions(plan.macroDistributions)
    if (!existing.some((item) => item.id === distributionId)) {
      throw notFound('Distribucion no encontrada')
    }
    const next = existing.map((item) => {
      if (item.id === distributionId) {
        return {
          id: distributionId,
          ...parsed.data,
          kcalDelta: parsed.data.kcalDelta ?? getLegacyDistributionKcalDelta(parsed.data.dayType),
          mealCategoryDistribution: parsed.data.mealCategoryDistribution ?? item.mealCategoryDistribution ?? null,
          generatedMenu: parsed.data.generatedMenu ?? item.generatedMenu ?? null,
          mealPreferences: parsed.data.mealPreferences ?? item.mealPreferences ?? null,
        }
      }
      if (parsed.data.isDefault) {
        return { ...item, isDefault: false }
      }
      return item
    })
    plan.set('macroDistributions', ensureMacroDistributionDefaults(next))
    await plan.save()
    res.json({ plan })
  }),
)

router.delete(
  '/:planId/macro-distributions/:distributionId',
  asyncHandler(async (req, res) => {
    const { planId, distributionId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (req.user?.role !== 'admin') throw badRequest('Acceso no permitido')

    const existing = normalizeMacroDistributions(plan.macroDistributions)
    if (!existing.some((item) => item.id === distributionId)) {
      throw notFound('Distribucion no encontrada')
    }
    plan.set(
      'macroDistributions',
      ensureMacroDistributionDefaults(existing.filter((item) => item.id !== distributionId)),
    )
    await plan.save()
    await PlanDayOverrideModel.updateMany(
      { planId, 'overrides.macroDistributionId': distributionId },
      { $set: { 'overrides.macroDistributionId': null } },
    )
    res.json({ plan })
  }),
)

router.put(
  '/:planId/status',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    const parsed = planStatusSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin) throw badRequest('Acceso no permitido')
    const actorUserId = req.user?.id ?? 'unknown'
    const shouldNotifyPlanEnabled = parsed.data.status === 'active' && plan.status !== 'active'

    if (parsed.data.status === 'active') {
      await PlanModel.updateMany(
        { userId: plan.userId, status: 'active', _id: { $ne: plan._id } },
        { status: 'archived' },
      )
    }

    plan.status = parsed.data.status
    await plan.save()

    if (shouldNotifyPlanEnabled) {
      const planTitleSnapshot = resolvePlanDisplayName(plan)
      const kcalObjectiveDay = await resolvePlanKcalObjectiveDay(plan)
      const body = buildPlanEnabledMessage({
        planName: planTitleSnapshot,
        kcalObjectiveDay,
      })
      await MessageModel.create({
        senderUserId: actorUserId,
        recipientUserId: plan.userId,
        body,
        kind: 'plan_enabled',
        planId: plan._id.toString(),
        planTitleSnapshot,
        triggeredByUserId: actorUserId,
      })
    }

    res.json({ plan })
  }),
)

const overrideBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overrides: dayOverrideSchema,
  meals: z.any().optional(),
  generatedMenu: z.any().optional(),
  generatedSelections: z.any().optional(),
  note: z.string().max(240).optional(),
})

router.put(
  '/:planId/overrides',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    // Backward compatibility: map single training to trainings array
    const incoming = { ...req.body }
    if (incoming.overrides?.training && !incoming.overrides?.trainings) {
      incoming.overrides.trainings = [incoming.overrides.training]
      delete incoming.overrides.training
    }

    const parsed = overrideBodySchema.safeParse(incoming)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    assertMemberPlanAccess(plan, req.user?.id, isAdmin)

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const { outputs } = calculateDayFromBase(assessment.inputs, parsed.data.overrides)
    const baseOverrides = { ...parsed.data.overrides, activityLevel: undefined }
    const { outputs: baseOutputs } = calculateDayFromBase(assessment.inputs, baseOverrides)
    const activityDelta = (outputs.kcalObjectiveDay ?? 0) - (baseOutputs.kcalObjectiveDay ?? 0)
    const macroOverride = getMacroOverrideForDate(plan.macroOverrides, parsed.data.date)
    const dayMacroOverride = getDayMacroOverride(parsed.data.overrides)
    const dayType = parsed.data.overrides.dayType ?? assessment.inputs.dayType ?? 'rest'
    const macroDistribution = getMacroDistributionForDay(
      plan.macroDistributions,
      parsed.data.overrides,
      dayType,
    )
    const distributionOverride = macroOverrideFromDistribution(
      macroDistribution,
      assessment.inputs.weight,
    )
    const trainingType = getTrainingType(parsed.data.overrides, assessment.inputs)
    const computed = applyMacroOverride(
      outputs,
      macroOverride,
      dayMacroOverride,
      distributionOverride,
      macroDistribution,
      dayType,
      trainingType,
      assessment.inputs.goal,
      assessment.inputs.weight,
      activityDelta,
    )

    const override = await PlanDayOverrideModel.findOneAndUpdate(
      { planId, date: parsed.data.date },
      {
        planId,
        userId: req.user?.id ?? 'unknown',
        date: parsed.data.date,
        overrides: parsed.data.overrides,
        computed,
        meals: parsed.data.meals,
        generatedMenu: parsed.data.generatedMenu,
        generatedSelections: parsed.data.generatedSelections,
        note: parsed.data.note,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    res.json({ override })
  }),
)

router.delete(
  '/:planId/overrides',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    const { date } = req.query
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    if (!date || typeof date !== 'string') throw badRequest('date requerido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    assertMemberPlanAccess(plan, req.user?.id, isAdmin)

    await PlanDayOverrideModel.deleteOne({ planId, date })
    res.json({ ok: true })
  }),
)

router.get(
  '/:planId/day',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    const { date } = req.query
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    if (!date || typeof date !== 'string') throw badRequest('date requerido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    assertMemberPlanAccess(plan, req.user?.id, isAdmin)

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const existing = await PlanDayOverrideModel.findOne({ planId, date })
    if (existing) {
      const macroOverride = getMacroOverrideForDate(plan.macroOverrides, date)
      const dayMacroOverride = getDayMacroOverride(existing.overrides ?? null)
      const dayType = existing.overrides?.dayType ?? assessment.inputs.dayType ?? 'rest'
      const macroDistribution = getMacroDistributionForDay(
        plan.macroDistributions,
        existing.overrides ?? null,
        dayType,
      )
      const distributionOverride = macroOverrideFromDistribution(
        macroDistribution,
        assessment.inputs.weight,
      )
      const { outputs } = calculateDayFromBase(assessment.inputs, existing.overrides ?? {})
      const baseOverrides = { ...(existing.overrides ?? {}), activityLevel: undefined }
      const { outputs: baseOutputs } = calculateDayFromBase(assessment.inputs, baseOverrides)
      const activityDelta = (outputs.kcalObjectiveDay ?? 0) - (baseOutputs.kcalObjectiveDay ?? 0)
      const trainingType = getTrainingType(existing.overrides ?? null, assessment.inputs)
      const computed = applyMacroOverride(
        outputs,
        macroOverride,
        dayMacroOverride,
        distributionOverride,
        macroDistribution,
        dayType,
        trainingType,
        assessment.inputs.goal,
        assessment.inputs.weight,
        activityDelta,
      )
      res.json({ override: { ...existing.toObject(), computed }, outputs: computed })
      return
    }

    const { outputs } = calculateDayFromBase(assessment.inputs, {})
    const macroOverride = getMacroOverrideForDate(plan.macroOverrides, date)
    const dayMacroOverride = null
    const dayType = assessment.inputs.dayType ?? 'rest'
    const macroDistribution = getMacroDistributionForDay(
      plan.macroDistributions,
      null,
      dayType,
    )
    const distributionOverride = macroOverrideFromDistribution(
      macroDistribution,
      assessment.inputs.weight,
    )
    const computed = applyMacroOverride(
      outputs,
      macroOverride,
      dayMacroOverride,
      distributionOverride,
      macroDistribution,
      dayType,
      assessment.inputs.trainingType ?? null,
      assessment.inputs.goal,
      assessment.inputs.weight,
    )
    res.json({ outputs: computed })
  }),
)

router.delete(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && plan.userId !== req.user?.id) throw badRequest('Acceso no permitido')

    await PlanDayOverrideModel.deleteMany({ planId })
    await PlanModel.deleteOne({ _id: planId })
    res.json({ ok: true })
  }),
)

const mealSuggestionSchema = z.object({
  targetMacros: z.object({
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    kcal: z.number().nonnegative(),
  }),
  meals: z
    .array(
      z.object({
        name: z.string().min(1),
        macros: z
          .object({
            protein: z.number().nonnegative(),
            carbs: z.number().nonnegative(),
            fat: z.number().nonnegative(),
          })
          .optional(),
        categories: z
          .array(
            z.object({
              name: z.string().min(1),
              portions: z.number().nonnegative(),
            }),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(6),
  preferences: z.string().max(500).optional(),
})

const OPTIONS_PER_MEAL = 3

const normalizeMealName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const generatedMenuResponseSchema = z.object({
  meals: z.array(
    z.object({
      meal: z.string().min(1),
      options: z
        .array(
          z.object({
            name: z.string().min(1),
            ingredients: z.array(
              z.object({
                name: z.string().min(1),
                grams: z.number().nonnegative(),
                protein: z.number().nonnegative(),
                carbs: z.number().nonnegative(),
                fat: z.number().nonnegative(),
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
        .length(OPTIONS_PER_MEAL),
    }),
  ),
})

const MEAL_MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          meal: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      grams: { type: 'number' },
                      protein: { type: 'number' },
                      carbs: { type: 'number' },
                      fat: { type: 'number' },
                    },
                    required: ['name', 'grams', 'protein', 'carbs', 'fat'],
                  },
                },
                totals: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    protein: { type: 'number' },
                    carbs: { type: 'number' },
                    fat: { type: 'number' },
                    kcal: { type: 'number' },
                  },
                  required: ['protein', 'carbs', 'fat', 'kcal'],
                },
              },
              required: ['name', 'ingredients', 'totals'],
            },
          },
        },
        required: ['meal', 'options'],
      },
    },
  },
  required: ['meals'],
} as const

router.post(
  '/:planId/meal-suggestions',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    const isAdmin = req.user?.role === 'admin'
    assertMemberPlanAccess(plan, req.user?.id, isAdmin)

    if (!env.anthropicApiKey) {
      throw new ApiError(503, 'La generacion de comidas no esta configurada (falta ANTHROPIC_API_KEY).')
    }

    const parsed = mealSuggestionSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const { targetMacros, meals, preferences } = parsed.data

    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

    const hasComposition = meals.some(
      (meal) => (meal.categories?.length ?? 0) > 0,
    )

    const system =
      'Eres una nutricionista experta y cocinera con criterio gastronómico. Diseñas recetas equilibradas, realistas y apetecibles en español (España). ' +
      `Para cada comida propones ${OPTIONS_PER_MEAL} opciones de receta DISTINTAS entre si. ` +
      'Primero construyes un plato reconocible y culinariamente coherente; después ajustas sus cantidades en gramos para acercarlo a los macros objetivo. ' +
      'No trates los ingredientes como piezas intercambiables elegidas solo para sumar macros. Todos deben tener sentido juntos en una receta que una persona prepararía normalmente. ' +
      'Como norma general usa una sola proteína principal por plato. No mezcles carnes, pescados o huevos entre sí solo para cuadrar proteína (por ejemplo, pollo con huevo), salvo que la combinación sea propia y reconocible de la receta propuesta. ' +
      'Los lácteos, legumbres, cereales y frutos secos pueden aportar proteína secundaria cuando encajen de forma natural. ' +
      'Mantén una técnica, estilo y contexto culinario coherentes dentro de cada opción, y evita combinaciones forzadas, ingredientes redundantes o guarniciones sin relación con el plato. ' +
      'Calcula las calorias como proteina*4 + carbohidratos*4 + grasa*9. ' +
      (hasComposition
        ? 'Cada comida indica los grupos de alimentos (subgrupos) y el numero de porciones que debe incluir; respeta esos grupos y porciones al elegir los ingredientes. '
        : '') +
      'Usa alimentos comunes y accesibles. Responde SIEMPRE en el formato JSON solicitado.'

    const mealsBlock = meals
      .map((meal) => {
        const parts: string[] = [`- ${meal.name}`]
        if (meal.macros) {
          parts.push(
            `objetivo: P ${Math.round(meal.macros.protein)} g / C ${Math.round(
              meal.macros.carbs,
            )} g / G ${Math.round(meal.macros.fat)} g`,
          )
        }
        if (meal.categories && meal.categories.length > 0) {
          parts.push(
            `grupos de alimentos: ${meal.categories
              .map((cat) => `${cat.name} (${cat.portions} porciones)`)
              .join(', ')}`,
          )
        }
        return parts.join(' | ')
      })
      .join('\n')

    const userPrompt = [
      `Objetivo de macros para el dia completo (referencia):`,
      `- Proteina: ${Math.round(targetMacros.protein)} g`,
      `- Carbohidratos: ${Math.round(targetMacros.carbs)} g`,
      `- Grasas: ${Math.round(targetMacros.fat)} g`,
      `- Calorias: ${Math.round(targetMacros.kcal)} kcal`,
      '',
      'Comidas del dia (en este orden):',
      mealsBlock,
      '',
      `Para CADA comida propon exactamente ${OPTIONS_PER_MEAL} opciones de receta distintas entre si.`,
      'Antes de devolver cada opción, comprueba que sea un plato realista, reconocible y que sus ingredientes combinen por sabor, textura y forma de preparación.',
      'Prioriza la coherencia culinaria sobre clavar una cifra exacta: mantén los macros dentro del margen indicado ajustando cantidades, no añadiendo una segunda proteína principal sin sentido.',
      'Usa normalmente una única proteína principal. Solo combina dos proteínas principales si esa combinación pertenece de forma natural a una receta conocida; nunca las juntes únicamente para completar macros.',
      'Cada opcion incluye sus ingredientes (nombre y gramos), los macros de cada ingrediente y los totales de la opcion.',
      'Los macros de cada opcion deben acercarse al objetivo de su comida (margen ~10%).',
      hasComposition
        ? 'Los ingredientes de cada opcion deben pertenecer a los grupos de alimentos indicados para esa comida y aproximarse a las porciones señaladas.'
        : '',
      preferences ? `Preferencias / restricciones del usuario: ${preferences}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    let response
    try {
      response = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: MEAL_MENU_SCHEMA },
        },
        system,
        messages: [{ role: 'user', content: userPrompt }],
      } as Anthropic.MessageCreateParamsNonStreaming)
    } catch (err) {
      console.error('Anthropic meal-suggestions error', err)
      throw new ApiError(502, 'No se pudo generar el menu. Intenta de nuevo.')
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new ApiError(502, 'Respuesta de IA vacia. Intenta de nuevo.')
    }

    let rawMenu: unknown
    try {
      rawMenu = JSON.parse(textBlock.text)
    } catch {
      throw new ApiError(502, 'No se pudo interpretar el menu generado. Intenta de nuevo.')
    }

    const parsedMenu = generatedMenuResponseSchema.safeParse(rawMenu)
    if (!parsedMenu.success) {
      throw new ApiError(502, 'La IA devolvio opciones de recetas incompletas. Regenera el menu.')
    }

    const unusedMeals = [...parsedMenu.data.meals]
    const orderedMeals = meals.map((requestedMeal) => {
      const requestedName = normalizeMealName(requestedMeal.name)
      const matchedIndex = unusedMeals.findIndex(
        (generatedMeal) => normalizeMealName(generatedMeal.meal) === requestedName,
      )
      if (matchedIndex < 0) return null
      return unusedMeals.splice(matchedIndex, 1)[0]
    })
    if (orderedMeals.some((meal) => meal === null)) {
      throw new ApiError(
        502,
        'La IA no genero recetas para todas las comidas del reparto. Regenera el menu.',
      )
    }

    const menu = { meals: orderedMeals }
    res.json({ menu })
  }),
)

export default router
