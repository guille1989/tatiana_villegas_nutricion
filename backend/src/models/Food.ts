import { Schema, model, type Document } from 'mongoose'

export type FoodDoc = {
  name: string
  sub_group?: string
  group: 'proteinas' | 'carbohidratos' | 'grasas'
  prot_100g: number
  cho_100g: number
  fat_100g: number
  kcal_100g: number
} & Document

const foodSchema = new Schema<FoodDoc>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    sub_group: { type: String, trim: true },
    group: { type: String, enum: ['proteinas', 'carbohidratos', 'grasas'], required: true },
    prot_100g: { type: Number, required: true, min: 0 },
    cho_100g: { type: Number, required: true, min: 0 },
    fat_100g: { type: Number, required: true, min: 0 },
    kcal_100g: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
)

export const FoodModel = model<FoodDoc>('Food', foodSchema)
