import type { ErrorRequestHandler } from 'express'
import { ApiError } from '../utils/apiError'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof ApiError ? err.status : 500
  const message = err instanceof ApiError ? err.message : 'Unexpected error'
  const details = err instanceof ApiError ? err.details : undefined

  if (process.env.NODE_ENV !== 'production') {
    console.error(err)
  }

  res.status(status).json({ error: message, details })
}
