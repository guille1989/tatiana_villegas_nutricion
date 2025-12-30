import crypto from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { MealTemplateModel } from '../models/MealTemplate'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, unauthorized } from '../utils/apiError'

const router = Router()

router.use(authMiddleware)

const itemSchema = z.object({
  foodId: z.string().min(1),
  nameSnapshot: z.string().min(1),
  grams: z.number().nonnegative(),
  amount: z.number().optional(),
  mode: z.enum(['grams', 'portions']).optional(),
  macros: z.object({
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  }),
  kcal: z.number().nonnegative(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1),
  items: z.array(itemSchema).min(1),
  totals: z.object({
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    kcal: z.number().nonnegative(),
  }),
})

const buildSignature = (items: z.infer<typeof itemSchema>[]) => {
  const normalized = items.map((item) => ({
    foodId: item.foodId,
    nameSnapshot: item.nameSnapshot,
    grams: Number(item.grams.toFixed(3)),
    amount: item.amount !== undefined ? Number(item.amount.toFixed(3)) : null,
    mode: item.mode ?? null,
    macros: {
      protein: Number(item.macros.protein.toFixed(3)),
      carbs: Number(item.macros.carbs.toFixed(3)),
      fat: Number(item.macros.fat.toFixed(3)),
    },
    kcal: Number(item.kcal.toFixed(3)),
  }))
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')
    const templates = await MealTemplateModel.find({ userId }).sort({ createdAt: -1 })
    res.json({ templates })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createTemplateSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const userId = req.user?.id
    if (!userId) throw unauthorized('Usuario no autenticado')

    const signature = buildSignature(parsed.data.items)
    const existing = await MealTemplateModel.findOne({ userId, signature })
    if (existing) {
      res.json({ template: existing })
      return
    }

    const template = await MealTemplateModel.create({
      userId,
      name: parsed.data.name,
      items: parsed.data.items,
      totals: parsed.data.totals,
      signature,
    })
    res.status(201).json({ template })
  }),
)

export default router
