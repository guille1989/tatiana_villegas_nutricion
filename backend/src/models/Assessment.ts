import { Schema, model, type Document } from 'mongoose'
import type { CalculationOutputs, FormulaMeta } from '../modules/calc/calc'
import type { WizardInputs } from '../modules/types'

export type AssessmentDoc = {
  userId: string
  inputs: WizardInputs
  outputs: CalculationOutputs
  formulas: FormulaMeta
} & Document

const assessmentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    inputs: { type: Schema.Types.Mixed, required: true },
    outputs: { type: Schema.Types.Mixed, required: true },
    formulas: {
      rmrMethod: { type: String, enum: ['excel_average', 'cunningham', 'mifflin'], required: true },
      version: { type: String, required: true },
    },
  },
  { timestamps: true },
)

export const AssessmentModel = model('Assessment', assessmentSchema)
