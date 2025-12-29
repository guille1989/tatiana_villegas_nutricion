import { Schema, model, type Document } from 'mongoose'
import type { UserRole } from './User'

export type InviteStatus = 'active' | 'disabled' | 'expired' | 'consumed'

export type InviteClaimLog = {
  userId: string
  name?: string
  usedAt: Date
}

export type InviteCodeDoc = {
  codeHash: string
  codeSuffix: string
  createdBy: string
  role: UserRole
  maxUses: number
  usesCount: number
  expiresAt?: Date
  status: InviteStatus
  claimedBy?: string[]
  claimLogs?: InviteClaimLog[]
} & Document

const inviteSchema = new Schema(
  {
    codeHash: { type: String, required: true, index: true },
    codeSuffix: { type: String, required: true },
    createdBy: { type: String, required: true, index: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    maxUses: { type: Number, default: 1 },
    usesCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    status: { type: String, enum: ['active', 'disabled', 'expired', 'consumed'], default: 'active' },
    claimedBy: { type: [String], default: [] },
    claimLogs: {
      type: [
        {
          userId: { type: String, required: true },
          name: { type: String },
          usedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
)

inviteSchema.index({ status: 1, expiresAt: 1 })

export const InviteCodeModel = model('InviteCode', inviteSchema)
