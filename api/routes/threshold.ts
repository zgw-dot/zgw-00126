import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, recalculateQualifications, addAuditLog } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { ThresholdConfig } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = queryOne<ThresholdConfig>(
      'SELECT * FROM threshold_config ORDER BY updated_at DESC LIMIT 1',
    )

    res.json({ success: true, data: config })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询阈值配置失败' })
  }
})

router.put('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { score } = req.body

    if (score === undefined || isNaN(Number(score))) {
      res.status(400).json({ success: false, error: '缺少有效的分数阈值' })
      return
    }

    run(
      'INSERT INTO threshold_config (score, updated_by) VALUES (?, ?)',
      [Number(score), req.userId],
    )

    recalculateQualifications()

    addAuditLog('update', 'threshold', 0, req.userId!, `更新阈值: ${score}`)

    const config = queryOne<ThresholdConfig>(
      'SELECT * FROM threshold_config ORDER BY updated_at DESC LIMIT 1',
    )

    res.json({ success: true, data: config })
  } catch (error) {
    res.status(500).json({ success: false, error: '更新阈值配置失败' })
  }
})

router.get('/history', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const history = queryAll<ThresholdConfig>(
      'SELECT * FROM threshold_config ORDER BY updated_at DESC',
    )

    res.json({ success: true, data: history })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询阈值历史失败' })
  }
})

export default router
