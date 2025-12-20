import { Router } from 'express'
import assessmentRoutes from './assessments'
import planRoutes from './plans'
import foodRoutes from './foods'

const router = Router()

router.use('/assessments', assessmentRoutes)
router.use('/plans', planRoutes)
router.use('/foods', foodRoutes)

export default router
