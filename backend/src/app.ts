import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'
import { env } from './config/env'

export const createApp = () => {
  const app = express()

  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    }),
  )
  app.use(express.json())
  app.use(morgan('dev'))

  app.use('/api', routes)

  app.use(errorHandler)

  return app
}
