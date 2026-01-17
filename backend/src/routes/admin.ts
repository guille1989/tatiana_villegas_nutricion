import crypto from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { AssessmentModel } from '../models/Assessment'
import { InviteCodeModel } from '../models/InviteCode'
import { PlanDayOverrideModel } from '../models/PlanDayOverride'
import { PlanModel } from '../models/Plan'
import { UserModel } from '../models/User'
import { authMiddleware, requireAdmin } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest } from '../utils/apiError'
import ingredientRoutes from './adminIngredients'

const router = Router()

router.use(authMiddleware, requireAdmin)
router.use('/ingredients', ingredientRoutes)

const inviteSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  maxUses: z.coerce.number().min(1).max(50).optional(),
  expiresInDays: z.coerce.number().min(1).max(365).optional(),
})

const hashCode = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const generateCode = () => crypto.randomBytes(8).toString('hex').toUpperCase()

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
    const users = await UserModel.find({ role: 'member', status: 'active' }).sort({ createdAt: -1 })

    const summaries = await Promise.all(
      users.map(async (user) => {
        const userId = user._id.toString()
        const assessment = await AssessmentModel.findOne({ userId }).sort({ createdAt: -1 })
        const plan =
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

export default router
