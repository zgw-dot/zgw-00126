import { Router, type Request, type Response } from 'express'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from '../database.js'
import { authMiddleware } from '../middleware.js'
import type { Notification } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: '未登录' })
      return
    }
    const rows = listNotifications(req.userId)
    const notifications: Notification[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      type: row.type as Notification['type'],
      isRead: row.is_read === 1,
      relatedEntityType: row.related_entity_type || undefined,
      relatedEntityId: row.related_entity_id || undefined,
      createdAt: row.created_at,
    }))
    res.json({ success: true, data: notifications })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询通知列表失败' })
  }
})

router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: '未登录' })
      return
    }
    const count = getUnreadNotificationCount(req.userId)
    res.json({ success: true, data: { count } })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询未读通知数失败' })
  }
})

router.post('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: '未登录' })
      return
    }
    const { id } = req.params
    markNotificationRead(Number(id), req.userId)
    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '标记已读失败' })
  }
})

router.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: '未登录' })
      return
    }
    markAllNotificationsRead(req.userId)
    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '全部标记已读失败' })
  }
})

export default router
