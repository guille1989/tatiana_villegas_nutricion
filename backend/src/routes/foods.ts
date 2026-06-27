import { Router } from 'express'
import { z } from 'zod'
import { FoodModel } from '../models/Food'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest } from '../utils/apiError'

const router = Router()

router.use(authMiddleware)

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

    const filter: Record<string, unknown> = {}
    filter.status = { $ne: 'inactive' }
    if (q) {
      filter.name = { $regex: q, $options: 'i' }
    }
    if (group) {
      if (group === 'proteinas' || group === 'carbohidratos' || group === 'grasas') {
        filter.group = group
      } else {
        filter.$or = [{ group }, { subgrupo: group }, { subgroup: group }, { subgrup: group }]
      }
    }

    const foods = await FoodModel.find(filter).skip(offset).limit(limit).sort({ name: 1 }).lean()
    const normalizedFoods = foods.map((food) => ({
      ...food,
      subgrup:
        food.subgrupo ??
        food.subgroup ??
        (food as Record<string, unknown>).subgrup ??
        (food as Record<string, unknown>).sub_group ??
        null,
    }))
    res.json({ foods: normalizedFoods })
  }),
)

export default router
