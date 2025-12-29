import crypto from 'crypto'

const KEY_LEN = 64
const SALT_LEN = 16

const scryptAsync = (password: string, salt: string, keyLen: number) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey as Buffer)
    })
  })

export const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex')
  const derived = await scryptAsync(password, salt, KEY_LEN)
  return { hash: derived.toString('hex'), salt }
}

export const verifyPassword = async (password: string, salt: string, hash: string) => {
  const derived = await scryptAsync(password, salt, KEY_LEN)
  const stored = Buffer.from(hash, 'hex')
  if (stored.length !== derived.length) return false
  return crypto.timingSafeEqual(stored, derived)
}
