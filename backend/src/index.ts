import mongoose from 'mongoose'
import { createApp } from './app'
import { env } from './config/env'

const start = async () => {
  await mongoose.connect(env.mongoUri)
  const app = createApp()
  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})
