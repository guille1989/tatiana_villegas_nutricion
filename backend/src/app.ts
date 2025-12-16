import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'
import { env } from './config/env'

const parseOrigins = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const createApp = () => {
  const app = express()
  const allowedOrigins = parseOrigins(env.clientUrl)

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        return callback(new Error('Not allowed by CORS'))
      },
      credentials: true,
    }),
  )
  app.use(express.json())
  app.use(morgan('dev'))

  app.use('/api', routes)

  app.use(errorHandler)

  return app
}
