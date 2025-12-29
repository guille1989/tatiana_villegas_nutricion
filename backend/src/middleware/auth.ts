import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UserModel } from '../models/User'
import { forbidden, unauthorized } from '../utils/apiError'
import type { TokenPayload } from '../utils/auth'

export type AuthUser = {
  id: string
  role: 'admin' | 'member'
  name?: string
}

export const authMiddleware: RequestHandler = async (req, _res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(unauthorized('Token requerido'))
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload
    if (!payload?.sub) {
      return next(unauthorized('Token invalido'))
    }
    const user = await UserModel.findById(payload.sub)
    if (!user || user.status !== 'active') {
      return next(unauthorized('Usuario invalido'))
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name ?? undefined,
    }
    next()
  } catch (err) {
    return next(unauthorized('Token invalido'))
  }
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(forbidden('Admin requerido'))
  }
  next()
}
