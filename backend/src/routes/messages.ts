import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { MessageModel } from '../models/Message'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, forbidden, notFound } from '../utils/apiError'

const router = Router()

const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
})

const mapMessage = (message: {
  _id: unknown
  senderUserId: string
  recipientUserId: string
  body: string
  readAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}) => ({
  _id: message._id,
  senderUserId: message.senderUserId,
  recipientUserId: message.recipientUserId,
  body: message.body,
  readAt: message.readAt ?? null,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
})

router.use(authMiddleware)

router.get(
  '/inbox',
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== 'member') throw forbidden('Solo clientes')

    const parsedQuery = messageListQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) throw badRequest('Validation failed', parsedQuery.error.flatten())
    const limit = parsedQuery.data.limit ?? 20

    const filter: {
      recipientUserId: string
      _id?: { $lt: Types.ObjectId }
    } = {
      recipientUserId: req.user.id,
    }
    if (parsedQuery.data.before) {
      if (!Types.ObjectId.isValid(parsedQuery.data.before)) throw badRequest('Cursor invalido')
      filter._id = { $lt: new Types.ObjectId(parsedQuery.data.before) }
    }

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
    const hasMore = messages.length > limit
    const pageItems = hasMore ? messages.slice(0, limit) : messages
    const nextBefore = hasMore ? pageItems[pageItems.length - 1]?._id?.toString() : undefined

    res.json({
      messages: pageItems.map(mapMessage),
      nextBefore,
    })
  }),
)

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== 'member') throw forbidden('Solo clientes')

    const count = await MessageModel.countDocuments({
      recipientUserId: req.user.id,
      readAt: null,
    })

    res.json({ count })
  }),
)

router.patch(
  '/:messageId/read',
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== 'member') throw forbidden('Solo clientes')
    const { messageId } = req.params
    if (!Types.ObjectId.isValid(messageId)) throw badRequest('messageId invalido')

    const message = await MessageModel.findOne({
      _id: messageId,
      recipientUserId: req.user.id,
    })
    if (!message) throw notFound('Mensaje no encontrado')

    if (!message.readAt) {
      message.readAt = new Date()
      await message.save()
    }

    res.json({ message: mapMessage(message.toObject()) })
  }),
)

export default router
