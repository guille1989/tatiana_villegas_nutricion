import dotenv from 'dotenv'

dotenv.config()

export const env = {
  port: parseInt(process.env.PORT ?? '4001', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/nutrition',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
}
