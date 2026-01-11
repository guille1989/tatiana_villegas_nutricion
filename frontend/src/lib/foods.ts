import type { Food } from '../types'
import foodsLocal from '../data/foods.json'
import { searchFoodsApi } from './api'

const localFoods: Food[] = (foodsLocal as Food[]).map((f) => ({
  ...f,
  sub_group: (f as any).sub_group ?? null,
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

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? ''

const isCoreGroup = (group: FoodGroupFilter): group is Food['group'] =>
  CORE_GROUPS.has(group as Food['group'])

const matchesGroup = (food: Food, group?: FoodGroupFilter) => {
  if (!group || group === 'all') return true
  if (food.group === group) return true
  if (isCoreGroup(group)) return false
  return normalizeKey(food.sub_group) === normalizeKey(group)
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
  const protein = (grams * food.prot_100g) / 100
  const carbs = (grams * food.cho_100g) / 100
  const fat = (grams * food.fat_100g) / 100
  const kcal = (grams * food.kcal_100g) / 100
  return { protein, carbs, fat, kcal }
}

export const gramsFromPortions = (food: Food, portions: number) => {
  if (portions <= 0) return 0
  const fallback = () => portions * 100
  if (food.group === 'proteinas') {
    if (!food.prot_100g) return fallback()
    return (portions * 10 * 100) / food.prot_100g
  }
  if (food.group === 'carbohidratos') {
    if (!food.cho_100g) return fallback()
    return (portions * 15 * 100) / food.cho_100g
  }
  if (food.group === 'grasas') {
    if (!food.fat_100g) return fallback()
    return (portions * 5 * 100) / food.fat_100g
  }
  return fallback()
}
