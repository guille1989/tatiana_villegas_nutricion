import { Schema, model, Types, type Document } from 'mongoose'

export type RecipeGenerationStatus = 'completed' | 'failed'

export type RecipeGenerationDoc = {
  planId: Types.ObjectId
  distributionId: string
  userId: string
  status: RecipeGenerationStatus
  name?: string | null
  targetSnapshot: unknown
  menu: unknown
  provider: {
    name: string
    model: string
  }
  createdBy: string
  completedAt?: Date | null
} & Document

const recipeGenerationSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    distributionId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    status: { type: String, enum: ['completed', 'failed'], required: true, index: true },
    name: { type: String, trim: true, maxlength: 80, default: null },
    targetSnapshot: { type: Schema.Types.Mixed, required: true },
    menu: { type: Schema.Types.Mixed, required: true },
    provider: {
      name: { type: String, required: true, default: 'anthropic' },
      model: { type: String, required: true },
    },
    createdBy: { type: String, required: true, index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

recipeGenerationSchema.index({ planId: 1, distributionId: 1, createdAt: -1 })

export const RecipeGenerationModel = model<RecipeGenerationDoc>(
  'RecipeGeneration',
  recipeGenerationSchema,
)
