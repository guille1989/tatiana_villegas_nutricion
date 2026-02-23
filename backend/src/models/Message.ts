import { Schema, model, type Document } from 'mongoose'

export type MessageDoc = {
  senderUserId: string
  recipientUserId: string
  body: string
  readAt?: Date | null
} & Document

const messageSchema = new Schema(
  {
    senderUserId: { type: String, required: true, index: true },
    recipientUserId: { type: String, required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)

messageSchema.index({ recipientUserId: 1, createdAt: -1, _id: -1 })
messageSchema.index({ senderUserId: 1, recipientUserId: 1, createdAt: -1, _id: -1 })

export const MessageModel = model('Message', messageSchema)

