import { Router } from 'express'
import { z } from 'zod'
import { AssessmentModel } from '../models/Assessment'
import { PlanModel } from '../models/Plan'
import { calculateInitials } from '../modules/calc/calc'
import { wizardInputsSchema } from '../modules/types'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound, unauthorized } from '../utils/apiError'
import { Types } from 'mongoose'

const router = Router()

router.use(authMiddleware)

const formatPlanDate = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${day}/${month}/${year}`
}

const buildDefaultPlanTitle = (date: Date) => `Planificación 1 - ${formatPlanDate(date)}`

const assessmentBodySchema = z.object({
  inputs: wizardInputsSchema,
})

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log('Received assessment creation request')
    const parsed = assessmentBodySchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')

    const { outputs, formulas } = calculateInitials(parsed.data.inputs)

    const assessment = await AssessmentModel.create({
      userId,
      inputs: parsed.data.inputs,
      outputs,
      formulas,
    })

    // Create a new plan for this user based on the latest assessment
    const startDate = new Date()
    const defaultTitle = buildDefaultPlanTitle(startDate)

    await PlanModel.updateMany({ userId, status: 'active' }, { status: 'archived' })

    const plan = await PlanModel.create({
      userId,
      baseAssessmentId: new Types.ObjectId(assessment._id),
      startDate,
      days: 30,
      status: 'active',
      title: defaultTitle,
    })
    res.status(201).json({ assessment, plan })
  }),
)

router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')

    const assessment = await AssessmentModel.findOne({ userId }).sort({ createdAt: -1 })
    if (!assessment) throw notFound('Assessment no encontrado')
    res.json({ assessment })
  }),
)

export default router
