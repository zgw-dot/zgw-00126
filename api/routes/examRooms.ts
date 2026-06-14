import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { ExamRoom } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rooms = queryAll<ExamRoom & { usedSeats: number }>(
      `SELECT er.*, COALESCE(arr.usedSeats, 0) AS usedSeats
       FROM exam_rooms er
       LEFT JOIN (
         SELECT exam_room_id, COUNT(*) AS usedSeats
         FROM arrangements
         WHERE status = 'scheduled'
         GROUP BY exam_room_id
       ) arr ON er.id = arr.exam_room_id
       ORDER BY er.id`,
    )
    res.json({ success: true, data: rooms })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询考场列表失败' })
  }
})

router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, capacity, location } = req.body
    if (!name || !capacity || !location) {
      res.status(400).json({ success: false, error: '缺少考场名称、容量或位置' })
      return
    }

    run(
      'INSERT INTO exam_rooms (name, capacity, location) VALUES (?, ?, ?)',
      [name, Number(capacity), location],
    )

    const room = queryOne<ExamRoom>(
      'SELECT * FROM exam_rooms ORDER BY id DESC LIMIT 1',
    )

    res.json({ success: true, data: { ...room, usedSeats: 0 } })
  } catch (error) {
    res.status(500).json({ success: false, error: '创建考场失败' })
  }
})

router.put('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { name, capacity, location } = req.body

    const room = queryOne<ExamRoom>(
      'SELECT * FROM exam_rooms WHERE id = ?',
      [Number(id)],
    )

    if (!room) {
      res.status(404).json({ success: false, error: '考场不存在' })
      return
    }

    run(
      'UPDATE exam_rooms SET name = ?, capacity = ?, location = ? WHERE id = ?',
      [name || room.name, capacity !== undefined ? Number(capacity) : room.capacity, location || room.location, Number(id)],
    )

    const updated = queryOne<ExamRoom>(
      'SELECT * FROM exam_rooms WHERE id = ?',
      [Number(id)],
    )

    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '更新考场失败' })
  }
})

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const room = queryOne<ExamRoom>(
      'SELECT * FROM exam_rooms WHERE id = ?',
      [Number(id)],
    )

    if (!room) {
      res.status(404).json({ success: false, error: '考场不存在' })
      return
    }

    const activeArrangements = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM arrangements WHERE exam_room_id = ? AND status = ?',
      [Number(id), 'scheduled'],
    )

    if (activeArrangements && activeArrangements.count > 0) {
      res.status(400).json({ success: false, error: '该考场有排考安排，无法删除' })
      return
    }

    run('DELETE FROM exam_rooms WHERE id = ?', [Number(id)])

    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '删除考场失败' })
  }
})

export default router
