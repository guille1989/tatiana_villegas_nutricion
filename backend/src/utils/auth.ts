import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { UserDoc } from '../models/User'

export type TokenPayload = {
  sub: string
  role: UserDoc['role']
}

export const signToken = (user: { id: string; role: UserDoc['role'] }) =>
  jwt.sign({ sub: user.id, role: user.role } satisfies TokenPayload, env.jwtSecret)
