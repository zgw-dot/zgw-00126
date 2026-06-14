import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, addAuditLog } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
interface AppRow {
  id: number
  student_id: number
  course_id: number
  qualification_id: number
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  reject_reason: string | null
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
  studentName?: string
  courseName?: string
}

const router = Router()

router.use(authMiddleware)

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.userRole !== 'student') {
      res.status(403).json({ success: false, error: '只有学生可以创建申请' })
      return
    }

    const { courseId } = req.body
    if (!courseId) {
      res.status(400).json({ success: false, error: '缺少课程ID' })
      return
    }

    const qual = queryOne<{ id: number }>(
      'SELECT id FROM qualifications WHERE student_id = ? AND course_id = ? AND qualified = 1 AND status = ?',
      [req.userId, Number(courseId), 'active'],
    )

    if (!qual) {
      res.status(400).json({ success: false, error: '您没有该课程的补考资格' })
      return
    }

    const existing = queryOne<{ id: number }>(
      'SELECT id FROM applications WHERE student_id = ? AND course_id = ? AND status = ?',
      [req.userId, Number(courseId), 'pending'],
    )

    if (existing) {
      res.status(400).json({ success: false, error: '您已提交过该课程的补考申请，请勿重复提交' })
      return
    }

    run(
      'INSERT INTO applications (student_id, course_id, qualification_id, status) VALUES (?, ?, ?, ?)',
      [req.userId, Number(courseId), qual.id, 'pending'],
    )

    const app = queryOne<AppRow>(
      `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
              a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
              u.name AS studentName, c.name AS courseName
              FROM applications a
              JOIN users u ON a.student_id = u.id
              JOIN courses c ON a.course_id = c.id
              WHERE a.student_id = ? AND a.course_id = ? AND a.qualification_id = ?
              ORDER BY a.id DESC LIMIT 1`,
      [req.userId, Number(courseId), qual.id],
    )

    res.json({ success: true, data: app })
  } catch (error) {
    res.status(500).json({ success: false, error: '创建申请失败' })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, status } = req.query
    let sql = `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
               a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
               u.name AS studentName, c.name AS courseName
               FROM applications a
               JOIN users u ON a.student_id = u.id
               JOIN courses c ON a.course_id = c.id
               WHERE 1=1`
    const params: unknown[] = []

    if (studentId) {
      sql += ' AND a.student_id = ?'
      params.push(Number(studentId))
    }
    if (status) {
      sql += ' AND a.status = ?'
      params.push(status)
    }

    if (req.userRole === 'student' && req.userId) {
      sql += ' AND a.student_id = ?'
      params.push(req.userId)
    } else if (req.userRole === 'teacher' && req.userId) {
      sql += ' AND c.teacher_id = ?'
      params.push(req.userId)
    }

    sql += ' ORDER BY a.id'

    const applications = queryAll<AppRow>(sql, params)
    res.json({ success: true, data: applications })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询申请列表失败' })
  }
})

router.post('/:id/approve', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const app = queryOne<AppRow>(
      'SELECT * FROM applications WHERE id = ?',
      [Number(id)],
    )

    if (!app) {
      res.status(404).json({ success: false, error: '申请不存在' })
      return
    }

    if (app.status !== 'pending') {
      res.status(400).json({ success: false, error: '只能审批待审核的申请' })
      return
    }

    run(
      'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
      ['approved', req.userId, Number(id)],
    )

    addAuditLog('approve', 'application', Number(id), req.userId!, '审批通过')

    const updated = queryOne<AppRow>(
      `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
              a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
              u.name AS studentName, c.name AS courseName
              FROM applications a
              JOIN users u ON a.student_id = u.id
              JOIN courses c ON a.course_id = c.id
              WHERE a.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '审批通过失败' })
  }
})

router.post('/:id/reject', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      res.status(400).json({ success: false, error: '缺少拒绝原因' })
      return
    }

    const app = queryOne<AppRow>(
      'SELECT * FROM applications WHERE id = ?',
      [Number(id)],
    )

    if (!app) {
      res.status(404).json({ success: false, error: '申请不存在' })
      return
    }

    if (app.status !== 'pending') {
      res.status(400).json({ success: false, error: '只能拒绝待审核的申请' })
      return
    }

    run(
      'UPDATE applications SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
      ['rejected', reason, req.userId, Number(id)],
    )

    addAuditLog('reject', 'application', Number(id), req.userId!, `拒绝原因: ${reason}`)

    const updated = queryOne<AppRow>(
      `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
              a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
              u.name AS studentName, c.name AS courseName
              FROM applications a
              JOIN users u ON a.student_id = u.id
              JOIN courses c ON a.course_id = c.id
              WHERE a.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '拒绝申请失败' })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const app = queryOne<AppRow>(
      'SELECT * FROM applications WHERE id = ?',
      [Number(id)],
    )

    if (!app) {
      res.status(404).json({ success: false, error: '申请不存在' })
      return
    }

    if (req.userRole === 'student' && req.userId && app.student_id !== req.userId) {
      res.status(403).json({ success: false, error: '只能撤回自己的申请' })
      return
    }

    if (app.status !== 'pending') {
      res.status(400).json({ success: false, error: '只能撤回待审核的申请' })
      return
    }

    run('UPDATE applications SET status = ? WHERE id = ?', ['withdrawn', Number(id)])

    const updated = queryOne<AppRow>(
      `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
              a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
              u.name AS studentName, c.name AS courseName
              FROM applications a
              JOIN users u ON a.student_id = u.id
              JOIN courses c ON a.course_id = c.id
              WHERE a.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updated })
  } catch (error) {
    res.status(500).json({ success: false, error: '撤回申请失败' })
  }
})

export default router
