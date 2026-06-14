import { Router, type Request, type Response } from 'express'
import { getNotificationConfig, updateNotificationConfig } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { NotificationConfig as INotificationConfig } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = getNotificationConfig()
    const typed: INotificationConfig[] = configs.map((c) => ({
      eventType: c.eventType as INotificationConfig['eventType'],
      enabled: c.enabled,
    }))
    res.json({ success: true, data: typed })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取通知配置失败' })
  }
})

router.put('/:eventType', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventType } = req.params
    const { enabled } = req.body
    if (enabled === undefined) {
      res.status(400).json({ success: false, error: '缺少enabled参数' })
      return
    }
    updateNotificationConfig(eventType, Boolean(enabled))
    const updated = getNotificationConfig()
    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '更新通知配置失败' })
  }
})

export default router
