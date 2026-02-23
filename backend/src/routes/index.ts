import { Router } from 'express'
import adminRoutes from './admin'
import authRoutes from './auth'
import assessmentRoutes from './assessments'
import planRoutes from './plans'
import foodRoutes from './foods'
import mealLibraryRoutes from './mealLibrary'
import messageRoutes from './messages'

const router = Router()

router.use('/auth', authRoutes)
router.use('/assessments', assessmentRoutes)
router.use('/plans', planRoutes)
router.use('/foods', foodRoutes)
router.use('/admin', adminRoutes)
router.use('/meal-library', mealLibraryRoutes)
router.use('/messages', messageRoutes)

export default router
