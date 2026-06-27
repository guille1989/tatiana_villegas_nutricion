import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { FoodModel } from '../models/Food'
import { MealTemplateModel } from '../models/MealTemplate'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound } from '../utils/apiError'

const router = Router()

const groupSchema = z.enum(['proteinas', 'carbohidratos', 'grasas', 'extras', 'vegetales'])
const statusSchema = z.enum(['active', 'inactive'])

const listSchema = z.object({
  q: z.string().trim().optional(),
  group: groupSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  limit: z.coerce.number().min(0).max(200).optional(),
  offset: z.coerce.number().min(0).optional(),
})

const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  group: groupSchema,
  subgrup: z.string().trim().optional().nullable(),
  subgrupo: z.string().trim().optional().nullable(),
  subgroup: z.string().trim().optional().nullable(),
  sub_group: z.string().trim().optional().nullable(),
  prot_100g: z.coerce.number().min(0),
  cho_100g: z.coerce.number().min(0),
  fat_100g: z.coerce.number().min(0),
  kcal_100g: z.coerce.number().min(0),
  default_portion_g: z.union([z.coerce.number().min(0), z.literal(null)]).optional(),
  max_portion_in_meal: z.union([z.coerce.number().min(0), z.literal(null)]).optional(),
})

const statusBodySchema = z.object({
  status: statusSchema,
})

const coreGroups = new Set(['proteinas', 'carbohidratos', 'grasas'])

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeName = (value: string) => value.trim()

const resolveSubgrup = (ingredient: Record<string, any>) =>
  ingredient.subgrup ??
  ingredient.subgrupo ??
  ingredient.subgroup ??
  ingredient.sub_group ??
  ingredient.subGroup ??
  ingredient.subgroupo ??
  null

const buildIngredientPayload = (data: z.infer<typeof ingredientSchema>) => ({
  name: normalizeName(data.name),
  group: data.group,
  subgrupo:
    data.subgrup?.trim() ||
    data.subgrupo?.trim() ||
    data.subgroup?.trim() ||
    data.sub_group?.trim() ||
    null,
  prot_100g: data.prot_100g,
  cho_100g: data.cho_100g,
  fat_100g: data.fat_100g,
  kcal_100g: data.kcal_100g,
  default_portion_g: data.default_portion_g ?? null,
  max_portion_in_meal: data.max_portion_in_meal ?? null,
})

const findActiveNameConflict = async (name: string, excludeId?: string) => {
  const regex = new RegExp(`^${escapeRegex(name)}$`, 'i')
  const filter: Record<string, unknown> = {
    name: { $regex: regex },
    status: { $ne: 'inactive' },
  }
  if (excludeId) filter._id = { $ne: excludeId }
  return FoodModel.findOne(filter).lean()
}

const countIngredientUsage = async (foodId: string) => {
  const [templates, overrides] = await Promise.all([
    MealTemplateModel.countDocuments({ 'items.foodId': foodId }),
    PlanDayOverrideModel.countDocuments({
      $or: [{ 'meals.items.foodId': foodId }, { 'overrides.meals.items.foodId': foodId }],
    }),
  ])
  return {
    templates,
    overrides,
    total: templates + overrides,
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) throw badRequest('Parametros invalidos', parsed.error.flatten())

    const { q, group, limit = 100, offset = 0 } = parsed.data
    const status = parsed.data.status ?? 'active'

    const filter: Record<string, unknown> = {}
    if (status !== 'all') {
      filter.status = status === 'active' ? { $ne: 'inactive' } : 'inactive'
    }
    if (q) filter.name = { $regex: q, $options: 'i' }
    if (group) {
      if (coreGroups.has(group)) {
        filter.group = group
      } else {
        filter.$or = [{ group }, { subgrupo: group }, { subgroup: group }, { subgrup: group }]
      }
    }

    const ingredients = await FoodModel.find(filter)
      .sort({ status: 1, name: 1 })
      .skip(offset)
      .limit(limit)
      .lean()

    const normalizedIngredients = ingredients.map((ingredient) => ({
      ...ingredient,
      subgrup: resolveSubgrup(ingredient),
    }))

    res.json({ ingredients: normalizedIngredients })
  }),
)

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const total = await FoodModel.countDocuments()
    const inactive = await FoodModel.countDocuments({ status: 'inactive' })
    const active = Math.max(total - inactive, 0)

    res.json({ stats: { total, active, inactive } })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = ingredientSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const payload = buildIngredientPayload(parsed.data)
    const existing = await findActiveNameConflict(payload.name)
    if (existing) throw badRequest('Nombre ya existe')

    const ingredient = await FoodModel.create({
      ...payload,
      status: 'active',
      version: 1,
    })

    res.status(201).json({ ingredient })
  }),
)

router.get(
  '/:ingredientId/usage',
  asyncHandler(async (req, res) => {
    const { ingredientId } = req.params
    if (!Types.ObjectId.isValid(ingredientId)) throw badRequest('ingredientId invalido')

    const ingredient = await FoodModel.findById(ingredientId)
    if (!ingredient) throw notFound('Ingrediente no encontrado')

    const usage = await countIngredientUsage(ingredientId)
    res.json({ usage })
  }),
)

router.put(
  '/:ingredientId',
  asyncHandler(async (req, res) => {
    const { ingredientId } = req.params
    if (!Types.ObjectId.isValid(ingredientId)) throw badRequest('ingredientId invalido')

    const parsed = ingredientSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const ingredient = await FoodModel.findById(ingredientId)
    if (!ingredient) throw notFound('Ingrediente no encontrado')

    const payload = buildIngredientPayload(parsed.data)
    const existing = await findActiveNameConflict(payload.name, ingredientId)
    if (existing) throw badRequest('Nombre ya existe')

    const usage = await countIngredientUsage(ingredientId)
    if (usage.total > 0) {
      const nextVersion = (ingredient.version ?? 1) + 1
      const nextIngredient = await FoodModel.create({
        ...payload,
        status: 'active',
        version: nextVersion,
        versionedFrom: ingredient._id.toString(),
      })

      ingredient.status = 'inactive'
      ingredient.replacedBy = nextIngredient._id.toString()
      await ingredient.save()

      res.json({
        ingredient: nextIngredient,
        versioned: true,
        previousId: ingredient._id,
        usage,
      })
      return
    }

    ingredient.set(payload)
    await ingredient.save()

    res.json({ ingredient, versioned: false, usage })
  }),
)

router.put(
  '/:ingredientId/status',
  asyncHandler(async (req, res) => {
    const { ingredientId } = req.params
    if (!Types.ObjectId.isValid(ingredientId)) throw badRequest('ingredientId invalido')

    const parsed = statusBodySchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const ingredient = await FoodModel.findById(ingredientId)
    if (!ingredient) throw notFound('Ingrediente no encontrado')

    ingredient.status = parsed.data.status
    await ingredient.save()

    res.json({ ingredient })
  }),
)

export default router
