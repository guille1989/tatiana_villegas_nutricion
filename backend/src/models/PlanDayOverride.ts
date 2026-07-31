import { Schema, model, Types, type Document } from 'mongoose'
import type { CalculationOutputs } from '../modules/calc/calc'
import type { DayOverrideInputs } from '../modules/types'

export type PlanDayOverrideDoc = {
  planId: Types.ObjectId
  userId: string
  date: string
  overrides: DayOverrideInputs
  computed: CalculationOutputs
  meals?: unknown
  generatedMenu?: unknown
  generatedSelections?: unknown
  note?: string
} & Document

const overrideSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    userId: { type: String, required: true },
    date: { type: String, required: true },
    overrides: { type: Schema.Types.Mixed, required: true },
    computed: { type: Schema.Types.Mixed, required: true },
    meals: { type: Schema.Types.Mixed },
    generatedMenu: { type: Schema.Types.Mixed },
    generatedSelections: { type: Schema.Types.Mixed },
    note: { type: String },
  },
  { timestamps: true },
)

overrideSchema.index({ planId: 1, date: 1 }, { unique: true })

export const PlanDayOverrideModel = model('PlanDayOverride', overrideSchema)
