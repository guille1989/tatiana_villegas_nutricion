import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { PlanModel } from '../models/Plan'
import { calculateDayFromBase } from '../modules/calc/dayCalc'
import { AssessmentModel } from '../models/Assessment'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound } from '../utils/apiError'
import { dayOverrideSchema } from '../modules/types'

const router = Router()

const createPlanSchema = z.object({
  userId: z.string().min(1),
  baseAssessmentId: z.string().min(1),
  startDate: z.string().min(1),
  days: z.union([z.literal(5), z.literal(7), z.literal(15), z.literal(30)]),
  title: z.string().optional(),
})

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const { userId, baseAssessmentId, startDate, days, title } = parsed.data
    const plan = await PlanModel.create({
      userId,
      baseAssessmentId: new Types.ObjectId(baseAssessmentId),
      startDate: new Date(startDate),
      days,
      title,
      status: 'draft',
    })
    res.status(201).json({ plan })
  }),
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.query.userId
    if (!userId || typeof userId !== 'string') throw badRequest('userId requerido')
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

    const overrides = await PlanDayOverrideModel.find({ planId })
    res.json({ plan, overrides })
  }),
)

const overrideBodySchema = z.object({
  userId: z.string().min(1),
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
    if (plan.userId !== parsed.data.userId) throw badRequest('userId no coincide')

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const { outputs } = calculateDayFromBase(assessment.inputs, parsed.data.overrides)

    const override = await PlanDayOverrideModel.findOneAndUpdate(
      { planId, date: parsed.data.date },
      {
        planId,
        userId: parsed.data.userId,
        date: parsed.data.date,
        overrides: parsed.data.overrides,
        computed: outputs,
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
    const { date, userId } = req.query
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    if (!date || typeof date !== 'string') throw badRequest('date requerido')
    if (!userId || typeof userId !== 'string') throw badRequest('userId requerido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (plan.userId !== userId) throw badRequest('userId no coincide')

    await PlanDayOverrideModel.deleteOne({ planId, date })
    res.json({ ok: true })
  }),
)

router.get(
  '/:planId/day',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    const { date, userId } = req.query
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    if (!date || typeof date !== 'string') throw badRequest('date requerido')
    if (!userId || typeof userId !== 'string') throw badRequest('userId requerido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (plan.userId !== userId) throw badRequest('userId no coincide')

    const assessment = await AssessmentModel.findById(plan.baseAssessmentId)
    if (!assessment) throw notFound('Assessment base no encontrado')

    const existing = await PlanDayOverrideModel.findOne({ planId, date })
    if (existing) {
      res.json({ override: existing, outputs: existing.computed })
      return
    }

    const { outputs } = calculateDayFromBase(assessment.inputs, {})
    res.json({ outputs })
  }),
)

router.delete(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = req.params
    const { userId } = req.query
    if (!Types.ObjectId.isValid(planId)) throw badRequest('planId invalido')
    if (!userId || typeof userId !== 'string') throw badRequest('userId requerido')

    const plan = await PlanModel.findById(planId)
    if (!plan) throw notFound('Plan no encontrado')
    if (plan.userId !== userId) throw badRequest('userId no coincide')

    await PlanDayOverrideModel.deleteMany({ planId })
    await PlanModel.deleteOne({ _id: planId })
    res.json({ ok: true })
  }),
)

export default router
