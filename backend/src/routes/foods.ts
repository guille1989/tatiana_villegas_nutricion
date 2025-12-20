import { Router } from 'express'
import { z } from 'zod'
import { FoodModel } from '../models/Food'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest } from '../utils/apiError'

const router = Router()

const querySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
})

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest('Parámetros inválidos', parsed.error.flatten())
    const { q, limit = 100 } = parsed.data

    const filter = q
      ? {
          name: { $regex: q, $options: 'i' },
        }
      : {}

    const foods = await FoodModel.find(filter).limit(limit).sort({ name: 1 })
    res.json({ foods })
  }),
)

export default router
