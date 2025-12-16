import { Router } from 'express'
import { z } from 'zod'
import { AssessmentModel } from '../models/Assessment'
import { calculateInitials } from '../modules/calc/calc'
import { wizardInputsSchema } from '../modules/types'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound } from '../utils/apiError'

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

    res.status(201).json({ assessment })
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
