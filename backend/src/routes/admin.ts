import crypto from 'crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { AssessmentModel } from '../models/Assessment'
import { InviteCodeModel } from '../models/InviteCode'
import { MessageModel } from '../models/Message'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { PlanModel } from '../models/Plan'
import { UserModel } from '../models/User'
import { env } from '../config/env'
import { authMiddleware, requireAdmin } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound } from '../utils/apiError'
import ingredientRoutes from './adminIngredients'

const router = Router()

router.use(authMiddleware, requireAdmin)
router.use('/ingredients', ingredientRoutes)

const inviteSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  maxUses: z.coerce.number().min(1).max(50).optional(),
  expiresInDays: z.coerce.number().min(1).max(365).optional(),
})

const userStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})
const adminMessageSchema = z.object({
  body: z.string().trim().min(1).max(1000),
})
const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
})

const hashCode = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const generateCode = () => crypto.randomBytes(8).toString('hex').toUpperCase()

const RESET_TOKEN_TTL_MINUTES = 60

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

const mapInvite = (invite: {
  _id: unknown
  createdAt?: Date
  codeSuffix: string
  role: string
  maxUses: number
  usesCount: number
  expiresAt?: Date | null
  status: string
  claimLogs?: { userId: string; name?: string | null; usedAt: Date | null }[]
}) => ({
  _id: invite._id,
  createdAt: invite.createdAt,
  codeSuffix: invite.codeSuffix,
  role: invite.role,
  maxUses: invite.maxUses,
  usesCount: invite.usesCount,
  expiresAt: invite.expiresAt ?? undefined,
  status: invite.status,
  claimLogs: (invite.claimLogs ?? []).map((log) => ({
    userId: log.userId,
    name: log.name ?? undefined,
    usedAt: log.usedAt ?? null,
  })),
})

router.post(
  '/invites',
  asyncHandler(async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const code = generateCode()
    const codeHash = hashCode(code)
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined

    const invite = await InviteCodeModel.create({
      codeHash,
      codeSuffix: code.slice(-4),
      createdBy: req.user?.id ?? 'unknown',
      role: parsed.data.role ?? 'member',
      maxUses: parsed.data.maxUses ?? 1,
      expiresAt,
    })

    res.status(201).json({
      invite: mapInvite(invite.toObject()),
      code,
    })
  }),
)

router.get(
  '/invites',
  asyncHandler(async (_req, res) => {
    const invites = await InviteCodeModel.find().sort({ createdAt: -1 }).lean()
    res.json({ invites: invites.map(mapInvite) })
  }),
)

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const users = await UserModel.find({ role: 'member' }).sort({ createdAt: -1 })

    const summaries = await Promise.all(
      users.map(async (user) => {
        const userId = user._id.toString()
        const assessment = await AssessmentModel.findOne({ userId }).sort({ createdAt: -1 })
        const plan =
          (await PlanModel.findOne({ userId, status: 'draft' }).sort({ createdAt: -1 })) ??
          (await PlanModel.findOne({ userId, status: 'active' }).sort({ createdAt: -1 })) ??
          (await PlanModel.findOne({ userId }).sort({ createdAt: -1 }))
        const overrides = plan ? await PlanDayOverrideModel.find({ planId: plan._id }) : []

        return {
          user: {
            id: userId,
            name: user.name ?? undefined,
            email: user.email ?? undefined,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt,
          },
          assessment,
          plan,
          overrides,
        }
      }),
    )

    res.json({ users: summaries })
  }),
)

router.get(
  '/messages/unread-counts',
  asyncHandler(async (_req, res) => {
    const rows = await MessageModel.aggregate<{ _id: string; count: number }>([
      { $match: { readAt: null } },
      { $group: { _id: '$recipientUserId', count: { $sum: 1 } } },
    ])

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      if (row._id) acc[row._id] = row.count
      return acc
    }, {})

    res.json({ counts })
  }),
)

router.put(
  '/users/:userId/status',
  asyncHandler(async (req, res) => {
    const parsed = userStatusSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const { userId } = req.params
    const user = await UserModel.findById(userId)
    if (!user) throw notFound('Usuario no encontrado')
    if (user.role !== 'member') throw badRequest('Solo se puede modificar miembros')

    user.status = parsed.data.status
    await user.save()

    res.json({
      user: {
        id: user._id.toString(),
        status: user.status,
      },
    })
  }),
)

router.post(
  '/users/:userId/reset-password',
  asyncHandler(async (req, res) => {
    const { userId } = req.params
    const user = await UserModel.findById(userId)
    if (!user || user.status !== 'active') throw badRequest('Usuario no encontrado')
    if (!user.email) throw badRequest('Usuario sin email registrado')

    const rawToken = crypto.randomBytes(32).toString('hex')
    user.resetPasswordTokenHash = hashCode(rawToken)
    user.resetPasswordTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)
    await user.save()

    const baseUrl = env.clientUrl.replace(/\/$/, '')
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`

    res.json({
      token: rawToken,
      resetUrl,
      expiresAt: user.resetPasswordTokenExpiresAt,
      email: user.email,
    })
  }),
)

router.post(
  '/users/:userId/messages',
  asyncHandler(async (req, res) => {
    const parsed = adminMessageSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const { userId } = req.params
    if (!Types.ObjectId.isValid(userId)) throw badRequest('userId invalido')
    const recipient = await UserModel.findById(userId)
    if (!recipient || recipient.role !== 'member') throw badRequest('Cliente no encontrado')

    const senderUserId = req.user?.id
    if (!senderUserId) throw badRequest('Usuario no autenticado')

    const message = await MessageModel.create({
      senderUserId,
      recipientUserId: userId,
      body: parsed.data.body,
    })

    res.status(201).json({ message: mapMessage(message.toObject()) })
  }),
)

router.get(
  '/users/:userId/messages',
  asyncHandler(async (req, res) => {
    const { userId } = req.params
    if (!Types.ObjectId.isValid(userId)) throw badRequest('userId invalido')
    const recipient = await UserModel.findById(userId)
    if (!recipient || recipient.role !== 'member') throw badRequest('Cliente no encontrado')

    const parsedQuery = messageListQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) throw badRequest('Validation failed', parsedQuery.error.flatten())
    const limit = parsedQuery.data.limit ?? 20

    const filter: {
      recipientUserId: string
      _id?: { $lt: Types.ObjectId }
    } = {
      recipientUserId: userId,
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

export default router
