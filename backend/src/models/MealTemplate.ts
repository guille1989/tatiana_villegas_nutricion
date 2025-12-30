import { Schema, model, type Document } from 'mongoose'

export type MealTemplateDoc = {
  userId: string
  name: string
  items: Array<{
    foodId: string
    nameSnapshot: string
    grams: number
    amount?: number
    mode?: 'grams' | 'portions'
    macros: { protein: number; carbs: number; fat: number }
    kcal: number
  }>
  totals: { protein: number; carbs: number; fat: number; kcal: number }
  signature: string
} & Document

const macroSchema = new Schema(
  {
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
  },
  { _id: false },
)

const itemSchema = new Schema(
  {
    foodId: { type: String, required: true },
    nameSnapshot: { type: String, required: true },
    grams: { type: Number, required: true },
    amount: { type: Number },
    mode: { type: String, enum: ['grams', 'portions'] },
    macros: { type: macroSchema, required: true },
    kcal: { type: Number, required: true },
  },
  { _id: false },
)

const totalsSchema = new Schema(
  {
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
    kcal: { type: Number, required: true },
  },
  { _id: false },
)

const mealTemplateSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    items: { type: [itemSchema], required: true },
    totals: { type: totalsSchema, required: true },
    signature: { type: String, required: true },
  },
  { timestamps: true },
)

mealTemplateSchema.index({ userId: 1, signature: 1 }, { unique: true })

export const MealTemplateModel = model('MealTemplate', mealTemplateSchema)
