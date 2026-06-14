import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, addAuditLog, createSnapshot } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'

interface QualRow {
  id: number
  student_id: number
  course_id: number
  qualified: number
  source: 'auto' | 'manual_override'
  status: 'active' | 'cancelled' | 'overridden'
  reason: string | null
  overridden_by: number | null
  created_at: string
  updated_at: string
  studentName?: string
  courseName?: string
}

const router = Router()

router.use(authMiddleware)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, courseId, status } = req.query
    let sql = `SELECT q.id, q.student_id, q.course_id, q.qualified, q.source, q.status,
               q.reason, q.overridden_by, q.created_at, q.updated_at,
               u.name AS studentName, c.name AS courseName
               FROM qualifications q
               JOIN users u ON q.student_id = u.id
               JOIN courses c ON q.course_id = c.id
               WHERE 1=1`
    const params: unknown[] = []

    if (studentId) {
      sql += ' AND q.student_id = ?'
      params.push(Number(studentId))
    }
    if (courseId) {
      sql += ' AND q.course_id = ?'
      params.push(Number(courseId))
    }
    if (status) {
      sql += ' AND q.status = ?'
      params.push(status)
    }

    if (req.userRole === 'student' && req.userId) {
      sql += ' AND q.student_id = ?'
      params.push(req.userId)
    } else if (req.userRole === 'teacher' && req.userId) {
      sql += ' AND c.teacher_id = ?'
      params.push(req.userId)
    }

    sql += ' ORDER BY q.id'

    const qualifications = queryAll<QualRow>(sql, params)
    res.json({ success: true, data: qualifications })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询资格列表失败' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const qual = queryOne<QualRow>(
      `SELECT q.id, q.student_id, q.course_id, q.qualified, q.source, q.status,
              q.reason, q.overridden_by, q.created_at, q.updated_at,
              u.name AS studentName, c.name AS courseName
              FROM qualifications q
              JOIN users u ON q.student_id = u.id
              JOIN courses c ON q.course_id = c.id
              WHERE q.id = ?`,
      [Number(id)],
    )

    if (!qual) {
      res.status(404).json({ success: false, error: '资格记录不存在' })
      return
    }

    if (req.userRole === 'student' && req.userId && qual.student_id !== req.userId) {
      res.status(403).json({ success: false, error: '权限不足' })
      return
    }

    res.json({ success: true, data: qual })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询资格详情失败' })
  }
})

router.post('/:id/override', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { qualified, reason } = req.body

    if (qualified === undefined || !reason) {
      res.status(400).json({ success: false, error: '缺少qualified或reason参数' })
      return
    }

    const qual = queryOne<QualRow>(
      'SELECT * FROM qualifications WHERE id = ?',
      [Number(id)],
    )

    if (!qual) {
      res.status(404).json({ success: false, error: '资格记录不存在' })
      return
    }

    createSnapshot(
      'override_qualification',
      'qualification',
      Number(id),
      {
        originalQualification: qual,
        newQualified: qualified,
        reason,
      },
      req.userId!,
    )

    run(
      `INSERT INTO qualifications (student_id, course_id, qualified, source, status, reason, overridden_by)
       VALUES (?, ?, ?, 'manual_override', 'active', ?, ?)`,
      [qual.student_id, qual.course_id, qualified ? 1 : 0, reason, req.userId],
    )

    run(
      'UPDATE qualifications SET status = ? WHERE id = ?',
      ['cancelled', Number(id)],
    )

    addAuditLog('override', 'qualification', Number(id), req.userId!, `覆盖资格: qualified=${qualified}, 原因: ${reason}`)

    const newQual = queryOne<QualRow>(
      `SELECT q.id, q.student_id, q.course_id, q.qualified, q.source, q.status,
              q.reason, q.overridden_by, q.created_at, q.updated_at,
              u.name AS studentName, c.name AS courseName
              FROM qualifications q
              JOIN users u ON q.student_id = u.id
              JOIN courses c ON q.course_id = c.id
              WHERE q.student_id = ? AND q.course_id = ? AND q.source = 'manual_override'
              ORDER BY q.id DESC LIMIT 1`,
      [qual.student_id, qual.course_id],
    )

    res.json({ success: true, data: newQual })
  } catch (error) {
    res.status(500).json({ success: false, error: '覆盖资格失败' })
  }
})

router.post('/:id/cancel', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      res.status(400).json({ success: false, error: '缺少取消原因' })
      return
    }

    const qual = queryOne<QualRow>(
      'SELECT * FROM qualifications WHERE id = ?',
      [Number(id)],
    )

    if (!qual) {
      res.status(404).json({ success: false, error: '资格记录不存在' })
      return
    }

    run(
      'UPDATE qualifications SET status = ?, reason = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ['cancelled', reason, Number(id)],
    )

    const approvedApps = queryAll<{ id: number }>(
      'SELECT id FROM applications WHERE qualification_id = ? AND status = ?',
      [Number(id), 'approved'],
    )

    for (const app of approvedApps) {
      run('UPDATE applications SET status = ? WHERE id = ?', ['rejected', app.id])

      const arrangements = queryAll<{ id: number }>(
        'SELECT id FROM arrangements WHERE application_id = ? AND status = ?',
        [app.id, 'scheduled'],
      )
      for (const arr of arrangements) {
        run(
          'UPDATE arrangements SET status = ?, cancel_reason = ? WHERE id = ?',
          ['cancelled', `资格取消: ${reason}`, arr.id],
        )
      }
    }

    addAuditLog('cancel', 'qualification', Number(id), req.userId!, `取消资格: ${reason}`)

    const updatedQual = queryOne<QualRow>(
      `SELECT q.id, q.student_id, q.course_id, q.qualified, q.source, q.status,
              q.reason, q.overridden_by, q.created_at, q.updated_at,
              u.name AS studentName, c.name AS courseName
              FROM qualifications q
              JOIN users u ON q.student_id = u.id
              JOIN courses c ON q.course_id = c.id
              WHERE q.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updatedQual })
  } catch (error) {
    res.status(500).json({ success: false, error: '取消资格失败' })
  }
})

export default router
