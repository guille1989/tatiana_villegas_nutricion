import { Schema, model, type Document } from 'mongoose'

export type UserRole = 'admin' | 'member'
export type UserStatus = 'active' | 'disabled'

export type UserDoc = {
  name?: string
  email?: string
  passwordHash?: string
  passwordSalt?: string
  role: UserRole
  status: UserStatus
} & Document

const userSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    passwordHash: { type: String },
    passwordSalt: { type: String },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
)

export const UserModel = model('User', userSchema)
