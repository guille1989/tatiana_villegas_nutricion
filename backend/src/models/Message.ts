import { Schema, model, type Document } from 'mongoose'

export type MessageKind = 'manual' | 'plan_enabled'

export type MessageDoc = {
  senderUserId: string
  recipientUserId: string
  body: string
  kind: MessageKind
  planId?: string | null
  planTitleSnapshot?: string | null
  triggeredByUserId?: string | null
  readAt?: Date | null
} & Document

const messageSchema = new Schema(
  {
    senderUserId: { type: String, required: true, index: true },
    recipientUserId: { type: String, required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    kind: { type: String, enum: ['manual', 'plan_enabled'], default: 'manual', index: true },
    planId: { type: String, default: null, index: true },
    planTitleSnapshot: { type: String, default: null },
    triggeredByUserId: { type: String, default: null, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)

messageSchema.index({ recipientUserId: 1, createdAt: -1, _id: -1 })
messageSchema.index({ senderUserId: 1, recipientUserId: 1, createdAt: -1, _id: -1 })
messageSchema.index({ kind: 1, recipientUserId: 1, planId: 1, createdAt: -1, _id: -1 })

export const MessageModel = model('Message', messageSchema)
