import { Schema, model, type Document } from 'mongoose'

export type FoodDoc = {
  name: string
  subgrupo?: string | null
  subgroup?: string | null
  group: 'proteinas' | 'carbohidratos' | 'grasas' | 'extras' | 'vegetales'
  mealCategory?:
    | 'whole_dairy'
    | 'protein_dairy'
    | 'semi_dairy'
    | 'skim_dairy'
    | 'vegetables'
    | 'fruit'
    | 'cereals'
    | 'legumes'
    | 'sugars'
    | 'lean_protein'
    | 'semi_fat_protein'
    | 'fat_protein'
    | 'fats'
    | null
  prot_100g: number
  cho_100g: number
  fat_100g: number
  kcal_100g: number
  default_portion_g?: number | null
  max_portion_in_meal?: number
  status?: 'active' | 'inactive'
  version?: number
  versionedFrom?: string | null
  replacedBy?: string | null
  micros?: Record<string, number> | null
  brand?: string | null
  equivalences?: string[] | null
} & Document

const foodSchema = new Schema<FoodDoc>(
  {
    name: { type: String, required: true, trim: true, unique: false },
    subgrupo: { type: String, trim: true },
    subgroup: { type: String, trim: true },
    group: { type: String, enum: ['proteinas', 'carbohidratos', 'grasas', 'extras', 'vegetales'], required: true },
    mealCategory: {
      type: String,
      enum: [
        'whole_dairy',
        'protein_dairy',
        'semi_dairy',
        'skim_dairy',
        'vegetables',
        'fruit',
        'cereals',
        'legumes',
        'sugars',
        'lean_protein',
        'semi_fat_protein',
        'fat_protein',
        'fats',
        null,
      ],
      default: null,
    },
    prot_100g: { type: Number, required: true, min: 0 },
    cho_100g: { type: Number, required: true, min: 0 },
    fat_100g: { type: Number, required: true, min: 0 },
    kcal_100g: { type: Number, required: true, min: 0 },
    default_portion_g: { type: Number, min: 0 },
    max_portion_in_meal: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    version: { type: Number, min: 1, default: 1 },
    versionedFrom: { type: String },
    replacedBy: { type: String },
    micros: { type: Schema.Types.Mixed },
    brand: { type: String, trim: true },
    equivalences: { type: [String] },
  },
  { timestamps: true },
)

foodSchema.index({ status: 1, group: 1, name: 1 })

export const FoodModel = model<FoodDoc>('Food', foodSchema)
