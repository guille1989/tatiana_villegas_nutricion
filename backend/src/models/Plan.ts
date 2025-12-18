import { Schema, model, Types, type Document } from 'mongoose'

export type PlanStatus = 'draft' | 'active' | 'archived'

export type PlanDoc = {
  userId: string
  baseAssessmentId: Types.ObjectId
  startDate: Date
  days: 5 | 7 | 15 | 30
  status: PlanStatus
  title?: string
} & Document

const planSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    baseAssessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    startDate: { type: Date, required: true },
    days: { type: Number, enum: [5, 7, 15, 30], required: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    title: { type: String },
  },
  { timestamps: true },
)

export const PlanModel = model('Plan', planSchema)
