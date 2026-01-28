import dotenv from 'dotenv'

dotenv.config()

const rawClientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'

export const env = {
  port: parseInt(process.env.PORT ?? '4001', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/nutrition',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  bootstrapSecret: process.env.BOOTSTRAP_SECRET ?? '',
  clientUrl: rawClientUrl.split(',')[0]?.trim() || rawClientUrl,
}
