import { Schema, model, Types, type Document } from 'mongoose'
import type { MealCategoryDistributionInput } from '../modules/domainTypes'

export type PlanStatus = 'draft' | 'active' | 'archived'

export type PlanMacroOverride = {
  effectiveFrom: string
  macros: {
    kcalObjectiveDay: number
    protein: number
    carbsAdjusted: number
    fatsAdjusted: number
  }
}

export type PlanMacroDistribution = {
  id: string
  name: string
  dayType?: 'rest' | 'training_type_1' | 'training_type_2' | 'training' | string | null
  kcalDelta?: number
  carbsPerKg: number
  proteinPerKg: number
  isDefault: boolean
  mealCategoryDistribution?: MealCategoryDistributionInput[] | null
  generatedMenu?: unknown
  mealPreferences?: string | null
}

export type PlanDoc = {
  userId: string
  baseAssessmentId: Types.ObjectId
  startDate: Date
  days: 5 | 7 | 15 | 30
  status: PlanStatus
  title?: string
  macroOverrides?: PlanMacroOverride[]
  macroDistributions?: PlanMacroDistribution[]
} & Document

const macroOverrideSchema = new Schema(
  {
    effectiveFrom: { type: String, required: true },
    macros: {
      kcalObjectiveDay: { type: Number, required: true },
      protein: { type: Number, required: true },
      carbsAdjusted: { type: Number, required: true },
      fatsAdjusted: { type: Number, required: true },
    },
  },
  { _id: false },
)

const macroDistributionSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    dayType: { type: String, default: null },
    kcalDelta: { type: Number, required: true, default: 0 },
    carbsPerKg: { type: Number, required: true, min: 0 },
    proteinPerKg: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, required: true, default: false },
    mealCategoryDistribution: { type: Schema.Types.Mixed, default: null },
    generatedMenu: { type: Schema.Types.Mixed, default: null },
    mealPreferences: { type: String, default: null },
  },
  { _id: false },
)

const planSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    baseAssessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    startDate: { type: Date, required: true },
    days: { type: Number, enum: [5, 7, 15, 30], required: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    title: { type: String },
    macroOverrides: { type: [macroOverrideSchema], default: [] },
    macroDistributions: { type: [macroDistributionSchema], default: [] },
  },
  { timestamps: true },
)

export const PlanModel = model('Plan', planSchema)
