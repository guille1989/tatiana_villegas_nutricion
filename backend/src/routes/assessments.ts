import { Router } from 'express'
import { z } from 'zod'
import { AssessmentModel } from '../models/Assessment'
import { PlanModel } from '../models/Plan'
import { calculateInitials } from '../modules/calc/calc'
import { wizardInputsSchema } from '../modules/types'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound } from '../utils/apiError'
import { Types } from 'mongoose'

const router = Router()

const assessmentBodySchema = z.object({
  userId: z.string().min(1),
  inputs: wizardInputsSchema,
})

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log('Received assessment creation request')
    const parsed = assessmentBodySchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const { outputs, formulas } = calculateInitials(parsed.data.inputs)

    const assessment = await AssessmentModel.create({
      userId: parsed.data.userId,
      inputs: parsed.data.inputs,
      outputs,
      formulas,
    })

    // Upsert a 7-day plan for this user based on the latest assessment
    const startDate = new Date()
    const existingPlan = await PlanModel.findOne({ userId: parsed.data.userId, days: 7 }).sort({
      createdAt: -1,
    })

    const plan =
      existingPlan ??
      new PlanModel({
        userId: parsed.data.userId,
        baseAssessmentId: new Types.ObjectId(assessment._id),
        startDate,
        days: 7,
        status: 'draft',
        title: 'Plan 7 dias',
      })

    plan.baseAssessmentId = new Types.ObjectId(assessment._id)
    plan.startDate = startDate
    plan.status = 'active'
    if (!plan.title) plan.title = 'Plan 7 dias'
    await plan.save()

    res.status(201).json({ assessment, plan })
  }),
)

router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const userId = req.query.userId
    if (!userId || typeof userId !== 'string') throw badRequest('userId requerido')

    const assessment = await AssessmentModel.findOne({ userId }).sort({ createdAt: -1 })
    if (!assessment) throw notFound('Assessment no encontrado')
    res.json({ assessment })
  }),
)

export default router
