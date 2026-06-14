import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, addAuditLog, createSnapshot, createNotification, buildSnapshotOperation, buildAuditLogOperation, execTransaction } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { BatchResultItem } from '../types.js'
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

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const app = queryOne<AppRow>(
      `SELECT a.id, a.student_id, a.course_id, a.qualification_id, a.status,
              a.reject_reason, a.reviewed_by, a.reviewed_at, a.created_at,
              u.name AS studentName, c.name AS courseName
              FROM applications a
              JOIN users u ON a.student_id = u.id
              JOIN courses c ON a.course_id = c.id
              WHERE a.id = ?`,
      [Number(id)],
    )

    if (!app) {
      res.status(404).json({ success: false, error: '申请不存在' })
      return
    }

    if (req.userRole === 'student' && req.userId && app.student_id !== req.userId) {
      res.status(403).json({ success: false, error: '无权查看该申请' })
      return
    }

    res.json({ success: true, data: app })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询申请详情失败' })
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

    createSnapshot(
      'approve_application',
      'application',
      Number(id),
      {
        application: app,
      },
      req.userId!,
    )

    run(
      'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
      ['approved', req.userId, Number(id)],
    )

    addAuditLog('approve', 'application', Number(id), req.userId!, '审批通过')

    const courseRow = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [app.course_id])
    createNotification(
      app.student_id,
      'application_approved',
      '补考申请已通过',
      `您的${courseRow?.name || '课程'}补考申请已通过审批`,
      'application',
      Number(id),
    )

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

    createSnapshot(
      'reject_application',
      'application',
      Number(id),
      {
        application: app,
        rejectReason: reason,
      },
      req.userId!,
    )

    run(
      'UPDATE applications SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
      ['rejected', reason, req.userId, Number(id)],
    )

    addAuditLog('reject', 'application', Number(id), req.userId!, `拒绝原因: ${reason}`)

    const courseRow = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [app.course_id])
    createNotification(
      app.student_id,
      'application_rejected',
      '补考申请被拒绝',
      `您的${courseRow?.name || '课程'}补考申请被拒绝，原因：${reason}`,
      'application',
      Number(id),
    )

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

router.post('/batch-approve', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: '缺少申请ID列表' })
      return
    }

    const results: BatchResultItem[] = []
    const toProcess: Array<{ id: number; app: AppRow }> = []
    const invalidIds: number[] = []

    for (const rawId of ids) {
      const id = Number(rawId)
      const app = queryOne<AppRow>('SELECT * FROM applications WHERE id = ?', [id])
      if (!app) {
        invalidIds.push(id)
        continue
      }
      if (app.status !== 'pending') {
        const statusLabel: Record<string, string> = {
          approved: '已通过',
          rejected: '已拒绝',
          withdrawn: '已撤回',
        }
        results.push({ id, status: 'skipped', reason: `申请状态已变更为${statusLabel[app.status] || app.status}，已被其他教务处理` })
        continue
      }
      toProcess.push({ id, app })
    }

    if (invalidIds.length > 0) {
      const errorMsg = `申请ID不存在: ${invalidIds.join(', ')}`
      for (const id of invalidIds) {
        results.push({ id, status: 'failed', reason: errorMsg })
      }
      for (const { id } of toProcess) {
        results.push({ id, status: 'failed', reason: errorMsg })
      }
      const successCount = 0
      const skippedCount = results.filter((r) => r.status === 'skipped').length
      const failedCount = invalidIds.length + toProcess.length

      res.json({
        success: true,
        data: {
          total: ids.length,
          success: successCount,
          skipped: skippedCount,
          failed: failedCount,
          details: results,
        },
      })
      return
    }

    if (toProcess.length > 0) {
      const txOps: Array<{ sql: string; params: unknown[] }> = []

      for (const { id, app } of toProcess) {
        txOps.push(buildSnapshotOperation(
          'approve_application',
          'application',
          id,
          { application: app },
          req.userId!,
        ))
        txOps.push({
          sql: 'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
          params: ['approved', req.userId, id],
        })
        txOps.push(buildAuditLogOperation(
          'approve',
          'application',
          id,
          req.userId!,
          '批量审批通过',
        ))
      }

      try {
        execTransaction(txOps)

        for (const { id, app } of toProcess) {
          results.push({ id, status: 'success' })
          const courseRow = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [app.course_id])
          createNotification(
            app.student_id,
            'application_approved',
            '补考申请已通过',
            `您的${courseRow?.name || '课程'}补考申请已通过审批`,
            'application',
            id,
          )
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '事务执行失败'
        for (const { id } of toProcess) {
          results.push({ id, status: 'failed', reason: errorMsg })
        }
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    res.json({
      success: true,
      data: {
        total: ids.length,
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
        details: results,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '批量审批失败' })
  }
})

router.post('/batch-reject', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, reason } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: '缺少申请ID列表' })
      return
    }
    if (!reason) {
      res.status(400).json({ success: false, error: '缺少拒绝原因' })
      return
    }

    const results: BatchResultItem[] = []
    const toProcess: Array<{ id: number; app: AppRow }> = []
    const invalidIds: number[] = []

    for (const rawId of ids) {
      const id = Number(rawId)
      const app = queryOne<AppRow>('SELECT * FROM applications WHERE id = ?', [id])
      if (!app) {
        invalidIds.push(id)
        continue
      }
      if (app.status !== 'pending') {
        const statusLabel: Record<string, string> = {
          approved: '已通过',
          rejected: '已拒绝',
          withdrawn: '已撤回',
        }
        results.push({ id, status: 'skipped', reason: `申请状态已变更为${statusLabel[app.status] || app.status}，已被其他教务处理` })
        continue
      }
      toProcess.push({ id, app })
    }

    if (invalidIds.length > 0) {
      const errorMsg = `申请ID不存在: ${invalidIds.join(', ')}`
      for (const id of invalidIds) {
        results.push({ id, status: 'failed', reason: errorMsg })
      }
      for (const { id } of toProcess) {
        results.push({ id, status: 'failed', reason: errorMsg })
      }
      const successCount = 0
      const skippedCount = results.filter((r) => r.status === 'skipped').length
      const failedCount = invalidIds.length + toProcess.length

      res.json({
        success: true,
        data: {
          total: ids.length,
          success: successCount,
          skipped: skippedCount,
          failed: failedCount,
          details: results,
        },
      })
      return
    }

    if (toProcess.length > 0) {
      const txOps: Array<{ sql: string; params: unknown[] }> = []

      for (const { id, app } of toProcess) {
        txOps.push(buildSnapshotOperation(
          'reject_application',
          'application',
          id,
          { application: app, rejectReason: reason },
          req.userId!,
        ))
        txOps.push({
          sql: 'UPDATE applications SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
          params: ['rejected', reason, req.userId, id],
        })
        txOps.push(buildAuditLogOperation(
          'reject',
          'application',
          id,
          req.userId!,
          `批量拒绝，原因: ${reason}`,
        ))
      }

      try {
        execTransaction(txOps)

        for (const { id, app } of toProcess) {
          results.push({ id, status: 'success' })
          const courseRow = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [app.course_id])
          createNotification(
            app.student_id,
            'application_rejected',
            '补考申请被拒绝',
            `您的${courseRow?.name || '课程'}补考申请被拒绝，原因：${reason}`,
            'application',
            id,
          )
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '事务执行失败'
        for (const { id } of toProcess) {
          results.push({ id, status: 'failed', reason: errorMsg })
        }
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    res.json({
      success: true,
      data: {
        total: ids.length,
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
        details: results,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '批量拒绝失败' })
  }
})

export default router
