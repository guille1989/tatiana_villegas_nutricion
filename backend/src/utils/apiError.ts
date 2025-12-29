export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const notFound = (msg = 'Not found') => new ApiError(404, msg)
export const badRequest = (msg = 'Bad request', details?: unknown) => new ApiError(400, msg, details)
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg)
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg)
