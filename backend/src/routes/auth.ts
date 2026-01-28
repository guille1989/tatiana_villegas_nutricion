import crypto from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { InviteCodeModel } from '../models/InviteCode'
import { UserModel } from '../models/User'
import { signToken } from '../utils/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { badRequest, notFound, unauthorized } from '../utils/apiError'
import { hashPassword, verifyPassword } from '../utils/password'

const router = Router()

const hashCode = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const claimSchema = z.object({
  code: z.string().trim().min(6),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
})

const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  token: z.string().min(10),
  password: z.string().min(6),
})

router.post(
  '/claim-invite',
  asyncHandler(async (req, res) => {
    const parsed = claimSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const normalizedCode = parsed.data.code.trim().toUpperCase()
    const codeHash = hashCode(normalizedCode)

    const invite = await InviteCodeModel.findOne({ codeHash })
    if (!invite || invite.status !== 'active') throw notFound('Codigo invalido')

    const now = new Date()
    if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) {
      invite.status = 'expired'
      await invite.save()
      throw badRequest('Codigo expirado')
    }

    if (invite.usesCount >= invite.maxUses) {
      invite.status = 'consumed'
      await invite.save()
      throw badRequest('Codigo usado')
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existing = await UserModel.findOne({ email })
    if (existing) throw badRequest('Email ya registrado. Usa iniciar sesion.')

    const { hash, salt } = await hashPassword(parsed.data.password)

    const user = await UserModel.create({
      name: parsed.data.name,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      role: invite.role,
      status: 'active',
    })

    const displayName = parsed.data.name?.trim() || user.name || user.email || undefined

    invite.usesCount += 1
    invite.claimedBy = [...(invite.claimedBy ?? []), user._id.toString()]
    const claimLog = { userId: user._id.toString(), name: displayName, usedAt: new Date() }
    if (invite.claimLogs) {
      invite.claimLogs.push(claimLog)
    } else {
      invite.set('claimLogs', [claimLog])
    }
    if (invite.usesCount >= invite.maxUses) {
      invite.status = 'consumed'
    }
    await invite.save()

    const token = signToken({ id: user._id.toString(), role: user.role })

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        role: user.role,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
      },
    })
  }),
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const email = parsed.data.email.trim().toLowerCase()
    const user = await UserModel.findOne({ email })
    if (!user || user.status !== 'active') throw unauthorized('Credenciales invalidas')
    if (!user.passwordHash || !user.passwordSalt) {
      throw unauthorized('Cuenta sin contrasena. Usa el codigo para activarla.')
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash)
    if (!isValid) throw unauthorized('Credenciales invalidas')

    const token = signToken({ id: user._id.toString(), role: user.role })
    res.json({
      token,
      user: {
        id: user._id.toString(),
        role: user.role,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
      },
    })
  }),
)

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    const email = parsed.data.email.trim().toLowerCase()
    const user = await UserModel.findOne({ email, status: 'active' })
    if (!user || !user.resetPasswordTokenHash || !user.resetPasswordTokenExpiresAt) {
      throw badRequest('Token invalido')
    }

    const now = new Date()
    if (user.resetPasswordTokenExpiresAt.getTime() < now.getTime()) {
      throw badRequest('Token expirado')
    }

    const tokenHash = hashCode(parsed.data.token)
    if (tokenHash !== user.resetPasswordTokenHash) {
      throw badRequest('Token invalido')
    }

    const { hash, salt } = await hashPassword(parsed.data.password)
    user.passwordHash = hash
    user.passwordSalt = salt
    user.resetPasswordTokenHash = undefined
    user.resetPasswordTokenExpiresAt = undefined
    await user.save()

    res.json({ ok: true })
  }),
)

const bootstrapSchema = z.object({
  secret: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(6).optional(),
})

router.post(
  '/bootstrap-admin',
  asyncHandler(async (req, res) => {
    const parsed = bootstrapSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten())

    if (!env.bootstrapSecret) throw badRequest('BOOTSTRAP_SECRET no configurado')
    if (parsed.data.secret !== env.bootstrapSecret) throw unauthorized('Secret invalido')

    const existingAdmin = await UserModel.findOne({ role: 'admin' })
    if (existingAdmin) throw badRequest('Admin ya existe')

    const email = parsed.data.email?.toLowerCase()
    if (email) {
      const existing = await UserModel.findOne({ email })
      if (existing) throw badRequest('Email ya registrado')
    }

    const passwordPayload = parsed.data.password ? await hashPassword(parsed.data.password) : null

    const user = await UserModel.create({
      name: parsed.data.name,
      email,
      passwordHash: passwordPayload?.hash,
      passwordSalt: passwordPayload?.salt,
      role: 'admin',
      status: 'active',
    })

    const token = signToken({ id: user._id.toString(), role: user.role })

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        role: user.role,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
      },
    })
  }),
)

export default router
