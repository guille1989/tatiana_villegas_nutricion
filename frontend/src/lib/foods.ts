import type { Food } from '../types'
import foodsLocal from '../data/foods.json'
import { searchFoodsApi } from './api'

const localFoods: Food[] = (foodsLocal as Food[]).map((f) => ({
  ...f,
  sub_group: (f as any).sub_group ?? null,
}))

export const searchFoods = async (query: string): Promise<Food[]> => {
  try {
    return await searchFoodsApi(query)
  } catch (err) {
    const q = query.trim().toLowerCase()
    if (!q) return localFoods
    return localFoods.filter((food) => food.name.toLowerCase().includes(q))
  }
}

export const calcFoodMacrosFromGrams = (food: Food, grams: number) => {
  const protein = (grams * food.prot_100g) / 100
  const carbs = (grams * food.cho_100g) / 100
  const fat = (grams * food.fat_100g) / 100
  const kcal = (grams * food.kcal_100g) / 100
  return { protein, carbs, fat, kcal }
}

export const gramsFromPortions = (food: Food, portions: number) => {
  if (portions <= 0) return 0
  if (food.group === 'proteinas') {
    if (!food.prot_100g) return null
    return (portions * 10 * 100) / food.prot_100g
  }
  if (food.group === 'carbohidratos') {
    if (!food.cho_100g) return null
    return (portions * 15 * 100) / food.cho_100g
  }
  if (food.group === 'grasas') {
    if (!food.fat_100g) return null
    return (portions * 5 * 100) / food.fat_100g
  }
  return null
}
