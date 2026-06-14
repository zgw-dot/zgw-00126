import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { initDB } from './database.js'
import authRoutes from './routes/auth.js'
import gradesRoutes from './routes/grades.js'
import qualificationsRoutes from './routes/qualifications.js'
import applicationsRoutes from './routes/applications.js'
import examRoomsRoutes from './routes/examRooms.js'
import arrangementsRoutes from './routes/arrangements.js'
import exportRoutes from './routes/export.js'
import thresholdRoutes from './routes/threshold.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

let dbInitialized = false

app.use(async (_req: Request, res: Response, next: NextFunction) => {
  if (!dbInitialized) {
    try {
      await initDB()
      dbInitialized = true
    } catch (error) {
      res.status(500).json({ success: false, error: '数据库初始化失败' })
      return
    }
  }
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/grades', gradesRoutes)
app.use('/api/qualifications', qualificationsRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/exam-rooms', examRoomsRoutes)
app.use('/api/arrangements', arrangementsRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/threshold', thresholdRoutes)

app.use(
  '/api/health',
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
