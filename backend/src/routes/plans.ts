import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { PlanModel } from '../models/Plan'
import { calculateDayFromBase } from '../modules/calc/dayCalc'
import { AssessmentModel } from '../models/Assessment'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound, unauthorized } from '../utils/apiError'
import { dayOverrideSchema } from '../modules/types'

const router = Router()

router.use(authMiddleware)

const createPlanSchema = z.object({
  baseAssessmentId: z.string().min(1),
  startDate: z.string().min(1),
  days: z.union([z.literal(5), z.literal(7), z.literal(15), z.literal(30)]),
  title: z.string().optional(),
})

const macroOverrideSchema = z.object({
  kcalObjectiveDay: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbsAdjusted: z.coerce.number().nonnegative(),
  fatsAdjusted: z.coerce.number().nonnegative(),
})

const macroOverrideBodySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  macros: macroOverrideSchema,
})

type MacroOverrideValue = z.infer<typeof macroOverrideSchema>
type MacroOverrideEntry = { effectiveFrom: string; macros?: MacroOverrideValue | null }

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

const applyMacroOverride = (
  outputs: ReturnType<typeof calculateDayFromBase>['outputs'],
  override: { macros: MacroOverrideValue } | null,
) => {
  if (!override) return outputs
  return {
    ...outputs,
    kcalObjectiveDay: override.macros.kcalObjectiveDay,
    protein: override.macros.protein,
    carbsAdjusted: override.macros.carbsAdjusted,
    fatsAdjusted: override.macros.fatsAdjusted,
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')

    const { baseAssessmentId, startDate, days, title } = parsed.data
    await PlanModel.updateMany({ userId, status: 'active' }, { status: 'archived' })
    const plan = await PlanModel.create({
      userId,
      baseAssessmentId: new Types.ObjectId(baseAssessmentId),
      startDate: new Date(startDate),
      days,
      title,
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
    if (!isAdmin && plan.userId !== req.user?.id) throw badRequest('Acceso no permitido')

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
      macros: parsed.data.macros,
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

const overrideBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overrides: dayOverrideSchema,
  meals: z.any().optional(),
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
    if (!isAdmin && plan.userId !== req.user?.id) throw badRequest('Acceso no permitido')

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const { outputs } = calculateDayFromBase(assessment.inputs, parsed.data.overrides)
    const macroOverride = getMacroOverrideForDate(plan.macroOverrides, parsed.data.date)
    const computed = applyMacroOverride(outputs, macroOverride)

    const override = await PlanDayOverrideModel.findOneAndUpdate(
      { planId, date: parsed.data.date },
      {
        planId,
        userId: req.user?.id ?? 'unknown',
        date: parsed.data.date,
        overrides: parsed.data.overrides,
        computed,
        meals: parsed.data.meals,
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
    if (!isAdmin && plan.userId !== req.user?.id) throw badRequest('Acceso no permitido')

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
    if (!isAdmin && plan.userId !== req.user?.id) throw badRequest('Acceso no permitido')

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const existing = await PlanDayOverrideModel.findOne({ planId, date })
    if (existing) {
      const macroOverride = getMacroOverrideForDate(plan.macroOverrides, date)
      const computed = applyMacroOverride(existing.computed, macroOverride)
      res.json({ override: { ...existing.toObject(), computed }, outputs: computed })
      return
    }

    const { outputs } = calculateDayFromBase(assessment.inputs, {})
    const macroOverride = getMacroOverrideForDate(plan.macroOverrides, date)
    const computed = applyMacroOverride(outputs, macroOverride)
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

export default router
