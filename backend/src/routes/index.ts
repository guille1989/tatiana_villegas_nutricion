import { Router } from 'express'
import assessmentRoutes from './assessments'
import planRoutes from './plans'

const router = Router()

router.use('/assessments', assessmentRoutes)
router.use('/plans', planRoutes)

export default router
