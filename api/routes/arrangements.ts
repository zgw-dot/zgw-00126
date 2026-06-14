import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, addAuditLog, createSnapshot } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { Arrangement } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { applicationIds, examRoomId, examDate, startTime, endTime } = req.body

    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      res.status(400).json({ success: false, error: '缺少申请ID列表' })
      return
    }
    if (!examRoomId || !examDate || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少考场ID、考试日期或时间' })
      return
    }

    const room = queryOne<{ id: number; capacity: number }>(
      'SELECT id, capacity FROM exam_rooms WHERE id = ?',
      [Number(examRoomId)],
    )
    if (!room) {
      res.status(404).json({ success: false, error: '考场不存在' })
      return
    }

    const usedSeats = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM arrangements WHERE exam_room_id = ? AND status = ? AND exam_date = ?',
      [Number(examRoomId), 'scheduled', examDate],
    )
    const currentUsed = usedSeats?.count || 0

    if (currentUsed + applicationIds.length > room.capacity) {
      res.status(400).json({
        success: false,
        error: `考场容量不足，当前已用${currentUsed}座，剩余${room.capacity - currentUsed}座，需要${applicationIds.length}座`,
      })
      return
    }

    const created: Arrangement[] = []

    for (const appId of applicationIds) {
      const app = queryOne<{ id: number; student_id: number; course_id: number; status: string }>(
        'SELECT id, student_id, course_id, status FROM applications WHERE id = ?',
        [Number(appId)],
      )

      if (!app) {
        res.status(400).json({ success: false, error: `申请ID ${appId} 不存在` })
        return
      }

      if (app.status !== 'approved') {
        res.status(400).json({ success: false, error: `申请ID ${appId} 未审批通过` })
        return
      }

      const conflict = queryOne<{ id: number }>(
        `SELECT id FROM arrangements
         WHERE student_id = ? AND exam_date = ? AND status = 'scheduled'
         AND NOT (end_time <= ? OR start_time >= ?)`,
        [app.student_id, examDate, startTime, endTime],
      )

      if (conflict) {
        res.status(400).json({
          success: false,
          error: `学生ID ${app.student_id} 在 ${examDate} ${startTime}-${endTime} 已有考试安排，时间冲突`,
        })
        return
      }

      run(
        'INSERT INTO arrangements (application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [app.id, app.student_id, app.course_id, Number(examRoomId), examDate, startTime, endTime, 'scheduled'],
      )

      const arrangement = queryOne<Arrangement>(
        `SELECT ar.id, ar.application_id, ar.student_id, ar.course_id, ar.exam_room_id,
                ar.exam_date, ar.start_time, ar.end_time, ar.status, ar.cancel_reason, ar.created_at,
                u.name AS studentName, c.name AS courseName, er.name AS examRoomName
                FROM arrangements ar
                JOIN users u ON ar.student_id = u.id
                JOIN courses c ON ar.course_id = c.id
                JOIN exam_rooms er ON ar.exam_room_id = er.id
                ORDER BY ar.id DESC LIMIT 1`,
      )

      if (arrangement) {
        createSnapshot(
          'create_arrangement',
          'arrangement',
          arrangement.id,
          {
            arrangement,
          },
          req.userId!,
        )
        created.push(arrangement)
        addAuditLog('create', 'arrangement', arrangement.id, req.userId!, `排考安排: 学生${app.student_id}, 课程${app.course_id}, 考场${examRoomId}`)
      }
    }

    res.json({ success: true, data: created })
  } catch (error) {
    res.status(500).json({ success: false, error: '创建排考安排失败' })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, courseId, examRoomId } = req.query
    let sql = `SELECT ar.id, ar.application_id, ar.student_id, ar.course_id, ar.exam_room_id,
               ar.exam_date, ar.start_time, ar.end_time, ar.status, ar.cancel_reason, ar.created_at,
               u.name AS studentName, c.name AS courseName, er.name AS examRoomName
               FROM arrangements ar
               JOIN users u ON ar.student_id = u.id
               JOIN courses c ON ar.course_id = c.id
               JOIN exam_rooms er ON ar.exam_room_id = er.id
               WHERE 1=1`
    const params: unknown[] = []

    if (studentId) {
      sql += ' AND ar.student_id = ?'
      params.push(Number(studentId))
    }
    if (courseId) {
      sql += ' AND ar.course_id = ?'
      params.push(Number(courseId))
    }
    if (examRoomId) {
      sql += ' AND ar.exam_room_id = ?'
      params.push(Number(examRoomId))
    }

    if (req.userRole === 'student' && req.userId) {
      sql += ' AND ar.student_id = ?'
      params.push(req.userId)
    } else if (req.userRole === 'teacher' && req.userId) {
      sql += ' AND c.teacher_id = ?'
      params.push(req.userId)
    }

    sql += ' ORDER BY ar.id'

    const arrangements = queryAll<Arrangement>(sql, params)
    res.json({ success: true, data: arrangements })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询排考安排失败' })
  }
})

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      res.status(400).json({ success: false, error: '缺少取消原因' })
      return
    }

    const arrangement = queryOne<Arrangement>(
      'SELECT * FROM arrangements WHERE id = ?',
      [Number(id)],
    )

    if (!arrangement) {
      res.status(404).json({ success: false, error: '排考安排不存在' })
      return
    }

    if (arrangement.status !== 'scheduled') {
      res.status(400).json({ success: false, error: '该安排已取消' })
      return
    }

    run(
      'UPDATE arrangements SET status = ?, cancel_reason = ? WHERE id = ?',
      ['cancelled', reason, Number(id)],
    )

    addAuditLog('cancel', 'arrangement', Number(id), req.userId!, `取消排考: ${reason}`)

    const updated = queryOne<Arrangement>(
      `SELECT ar.id, ar.application_id, ar.student_id, ar.course_id, ar.exam_room_id,
              ar.exam_date, ar.start_time, ar.end_time, ar.status, ar.cancel_reason, ar.created_at,
              u.name AS studentName, c.name AS courseName, er.name AS examRoomName
              FROM arrangements ar
              JOIN users u ON ar.student_id = u.id
              JOIN courses c ON ar.course_id = c.id
              JOIN exam_rooms er ON ar.exam_room_id = er.id
              WHERE ar.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '取消排考安排失败' })
  }
})

export default router
