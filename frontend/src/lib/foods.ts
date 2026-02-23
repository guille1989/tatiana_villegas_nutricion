import type { Food } from '../types'
import foodsLocal from '../data/foods.json'
import { searchFoodsApi } from './api'
import { MACRO_PORTION_GRAMS } from './calc'

const localFoods: Food[] = (foodsLocal as Food[]).map((f) => ({
  ...f,
  subgrup: (f as any).subgrup ?? (f as any).subgrupo ?? (f as any).sub_group ?? null,
  default_portion_g: (f as any).default_portion_g ?? null,
}))

export const FOOD_GROUP_OPTIONS = [
  { value: 'proteinas', label: 'Proteina' },
  { value: 'carbohidratos', label: 'Carbohidratos' },
  { value: 'grasas', label: 'Grasas' },
  { value: 'vegetales', label: 'Vegetales' },
  { value: 'extras', label: 'Extras' },
] as const

export type FoodGroupFilter = (typeof FOOD_GROUP_OPTIONS)[number]['value'] | 'all'

const CORE_GROUPS = new Set<Food['group']>(['proteinas', 'carbohidratos', 'grasas'])
const DEFAULT_PORTION_GRAMS = 100

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? ''

const getDefaultPortionGrams = (food: Food) => {
  const parsed = Number(food.default_portion_g)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return DEFAULT_PORTION_GRAMS
}

const isNonMacroGroup = (food: Food) => {
  const groupKey = normalizeKey((food as { group?: string | null }).group)
  const subGroupKey = normalizeKey(food.subgrup)
  return (
    groupKey === 'vegetales' ||
    groupKey === 'extras' ||
    subGroupKey === 'vegetales' ||
    subGroupKey === 'extras'
  )
}

const isCoreGroup = (group: FoodGroupFilter): group is Food['group'] =>
  CORE_GROUPS.has(group as Food['group'])

const matchesGroup = (food: Food, group?: FoodGroupFilter) => {
  if (!group || group === 'all') return true
  if (food.group === group) return true
  if (isCoreGroup(group)) return false
  return normalizeKey(food.subgrup) === normalizeKey(group)
}

const applyGroupFilter = (foods: Food[], group?: FoodGroupFilter) => {
  if (!group || group === 'all') return foods
  return foods.filter((food) => matchesGroup(food, group))
}

export const searchFoods = async (
  query: string,
  group?: FoodGroupFilter,
  signal?: AbortSignal,
): Promise<Food[]> => {
  try {
    const foods = await searchFoodsApi(query, {
      group: group && group !== 'all' ? group : undefined,
      signal,
    })
    return applyGroupFilter(foods, group)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const q = query.trim().toLowerCase()
    let filtered = localFoods
    if (q) {
      filtered = filtered.filter((food) => food.name.toLowerCase().includes(q))
    }
    return applyGroupFilter(filtered, group)
  }
}

export const fetchFoodsCatalog = async ({
  query = '',
  group,
  limit,
  offset,
  signal,
}: {
  query?: string
  group?: FoodGroupFilter
  limit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<Food[]> =>
  searchFoodsApi(query, {
    group: group && group !== 'all' ? group : undefined,
    limit,
    offset,
    signal,
  })

export const calcFoodMacrosFromGrams = (food: Food, grams: number) => {
  const baseGrams = isNonMacroGroup(food) ? getDefaultPortionGrams(food) : 100
  const ratio = baseGrams > 0 ? grams / baseGrams : 0
  const protein = ratio * food.prot_100g
  const carbs = ratio * food.cho_100g
  const fat = ratio * food.fat_100g
  const kcal = ratio * food.kcal_100g
  return { protein, carbs, fat, kcal }
}

export const gramsFromPortions = (food: Food, portions: number) => {
  if (portions <= 0) return 0
  const fallback = () => portions * getDefaultPortionGrams(food)
  if (isNonMacroGroup(food)) return fallback()
  if (food.group === 'proteinas') {
    if (!food.prot_100g) return fallback()
    return (portions * MACRO_PORTION_GRAMS.protein * 100) / food.prot_100g
  }
  if (food.group === 'carbohidratos') {
    if (!food.cho_100g) return fallback()
    return (portions * MACRO_PORTION_GRAMS.carbs * 100) / food.cho_100g
  }
  if (food.group === 'grasas') {
    if (!food.fat_100g) return fallback()
    return (portions * MACRO_PORTION_GRAMS.fat * 100) / food.fat_100g
  }
  return fallback()
}
