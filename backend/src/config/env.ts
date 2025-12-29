import dotenv from 'dotenv'

dotenv.config()

export const env = {
  port: parseInt(process.env.PORT ?? '4001', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/nutrition',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  bootstrapSecret: process.env.BOOTSTRAP_SECRET ?? '',
}
