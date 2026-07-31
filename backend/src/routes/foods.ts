import { Router } from 'express'
import { z } from 'zod'
import { FoodModel } from '../models/Food'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest } from '../utils/apiError'

const router = Router()

const normalizeLegacyNumber = (value: unknown, fallback: number | null = null) => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const resolveSubgroup = (food: Record<string, unknown>) =>
  food.subgrupo ?? food.subgroup ?? food.subgrup ?? food.sub_group ?? null

const resolveCatalogGroup = (food: Record<string, unknown>) => {
  const subgroup = normalizeKey(resolveSubgroup(food))
  if (
    subgroup === 'lacteos enteros' ||
    subgroup === 'lacteos proteicos' ||
    subgroup === 'lacteos semidesnatados' ||
    subgroup === 'lacteos desnatados' ||
    subgroup === 'proteicos magros' ||
    subgroup === 'proteicos semigrasos' ||
    subgroup === 'proteicos grasos' ||
    subgroup === 'proteico graso'
  ) return 'proteinas'
  if (
    subgroup === 'fruta' ||
    subgroup === 'almidones' ||
    subgroup === 'legumbre' ||
    subgroup === 'azucares'
  ) return 'carbohidratos'
  if (subgroup === 'grasa' || subgroup === 'grasas' || subgroup === 'frutos secos') return 'grasas'
  if (subgroup === 'vegetales') return 'vegetales'
  const rawGroup = normalizeKey(food.group)
  return rawGroup === 'otros' ? 'extras' : rawGroup
}

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
    const foods = await FoodModel.find(filter).sort({ name: 1 }).lean()
    const normalizedFoods = foods.map((food) => ({
      ...food,
      subgrup: resolveSubgroup(food as unknown as Record<string, unknown>),
      prot_100g: normalizeLegacyNumber(food.prot_100g, 0),
      cho_100g: normalizeLegacyNumber(food.cho_100g, 0),
      fat_100g: normalizeLegacyNumber(food.fat_100g, 0),
      kcal_100g: normalizeLegacyNumber(food.kcal_100g, 0),
      default_portion_g: normalizeLegacyNumber(food.default_portion_g),
      max_portion_in_meal: normalizeLegacyNumber(food.max_portion_in_meal),
    }))
    const catalogFoods = group
      ? normalizedFoods.filter(
          (food) => resolveCatalogGroup(food as unknown as Record<string, unknown>) === group,
        )
      : normalizedFoods
    res.json({ foods: catalogFoods.slice(offset, offset + limit) })
  }),
)

export default router
