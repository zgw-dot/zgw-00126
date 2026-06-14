import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, addAuditLog, createSnapshot, createNotification } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { Arrangement, BatchResultItem } from '../types.js'

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

    const room = queryOne<{ id: number; capacity: number; name: string }>(
      'SELECT id, capacity, name FROM exam_rooms WHERE id = ?',
      [Number(examRoomId)],
    )
    if (!room) {
      res.status(404).json({ success: false, error: '考场不存在' })
      return
    }

    const results: BatchResultItem[] = []
    const created: Arrangement[] = []
    const skippedIds = new Set<number>()

    for (const appId of applicationIds) {
      const id = Number(appId)
      try {
        const app = queryOne<{ id: number; student_id: number; course_id: number; status: string }>(
          'SELECT id, student_id, course_id, status FROM applications WHERE id = ?',
          [id],
        )

        if (!app) {
          results.push({ id, status: 'skipped', reason: '申请不存在' })
          skippedIds.add(id)
          continue
        }

        if (app.status !== 'approved') {
          const statusLabel: Record<string, string> = {
            pending: '待审核',
            rejected: '已拒绝',
            withdrawn: '已撤回',
          }
          results.push({ id, status: 'skipped', reason: `申请状态为${statusLabel[app.status] || app.status}，仅已批准的申请可排考` })
          skippedIds.add(id)
          continue
        }

        const conflict = queryOne<{ id: number }>(
          `SELECT id FROM arrangements
           WHERE student_id = ? AND exam_date = ? AND status = 'scheduled'
           AND NOT (end_time <= ? OR start_time >= ?)`,
          [app.student_id, examDate, startTime, endTime],
        )

        if (conflict) {
          results.push({ id, status: 'skipped', reason: `该学生在 ${examDate} ${startTime}-${endTime} 已有考试安排，时间冲突` })
          skippedIds.add(id)
          continue
        }

        const alreadyScheduled = queryOne<{ id: number }>(
          `SELECT id FROM arrangements WHERE application_id = ? AND status = 'scheduled'`,
          [id],
        )
        if (alreadyScheduled) {
          results.push({ id, status: 'skipped', reason: '该申请已存在有效的排考安排' })
          skippedIds.add(id)
          continue
        }

        const currentUsed = queryOne<{ count: number }>(
          'SELECT COUNT(*) AS count FROM arrangements WHERE exam_room_id = ? AND status = ? AND exam_date = ?',
          [room.id, 'scheduled', examDate],
        )
        if ((currentUsed?.count || 0) + 1 > room.capacity) {
          results.push({ id, status: 'skipped', reason: '考场容量不足' })
          skippedIds.add(id)
          continue
        }

        run(
          'INSERT INTO arrangements (application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [app.id, app.student_id, app.course_id, room.id, examDate, startTime, endTime, 'scheduled'],
        )

        const arrangement = queryOne<Arrangement>(
          `SELECT ar.id, ar.application_id, ar.student_id, ar.course_id, ar.exam_room_id,
                  ar.exam_date, ar.start_time, ar.end_time, ar.status, ar.cancel_reason, ar.created_at,
                  u.name AS studentName, c.name AS courseName, er.name AS examRoomName
                  FROM arrangements ar
                  JOIN users u ON ar.student_id = u.id
                  JOIN courses c ON ar.course_id = c.id
                  JOIN exam_rooms er ON ar.exam_room_id = er.id
                  WHERE ar.application_id = ? AND ar.status = 'scheduled'
                  ORDER BY ar.id DESC LIMIT 1`,
          [id],
        )

        if (arrangement) {
          createSnapshot(
            'create_arrangement',
            'arrangement',
            arrangement.id,
            { arrangement },
            req.userId!,
          )
          created.push(arrangement)
          addAuditLog('create', 'arrangement', arrangement.id, req.userId!, `批量排考: 学生${app.student_id}, 课程${app.course_id}, 考场${room.id}`)

          createNotification(
            app.student_id,
            'exam_scheduled',
            '考试安排已生成',
            `您的${arrangement.courseName}考试已安排：${arrangement.examRoomName} ${examDate} ${startTime}-${endTime}`,
            'arrangement',
            arrangement.id,
          )

          results.push({ id, status: 'success' })
        } else {
          results.push({ id, status: 'failed', reason: '创建排考记录失败' })
        }
      } catch (e) {
        results.push({ id, status: 'failed', reason: e instanceof Error ? e.message : '处理失败' })
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    res.json({
      success: true,
      data: {
        total: applicationIds.length,
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
        details: results,
        arrangements: created,
      },
    })
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
