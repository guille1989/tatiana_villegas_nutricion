import { Router } from 'express'
import { z } from 'zod'
import { FoodModel } from '../models/Food'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest } from '../utils/apiError'

const router = Router()

const querySchema = z.object({
  q: z.string().trim().optional(),
  group: z
    .enum(['proteinas', 'carbohidratos', 'grasas', 'vegetales', 'extras'])
    .optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
})

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest('Parámetros inválidos', parsed.error.flatten())
    const { q, group, limit = 100, offset = 0 } = parsed.data

    const normalizedGroup =
      group === 'vegetales' ? 'carbohidratos' : group === 'extras' ? undefined : group

    const filter: Record<string, unknown> = {}
    if (q) {
      filter.name = { $regex: q, $options: 'i' }
    }
    if (normalizedGroup) {
      filter.group = normalizedGroup
    }

    const foods = await FoodModel.find(filter).skip(offset).limit(limit).sort({ name: 1 })
    res.json({ foods })
  }),
)

export default router
