import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import { queryAll, run, recalculateQualifications } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { Grade } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.post('/import', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userRole || !['admin'].includes(req.userRole)) {
      res.status(403).json({ success: false, error: '权限不足' })
      return
    }

    const { csv } = req.body
    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ success: false, error: '缺少CSV数据' })
      return
    }

    const result = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    })

    const errors: string[] = []
    let imported = 0

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i] as Record<string, unknown>
      const studentId = Number(row.student_id)
      const courseId = Number(row.course_id)
      const score = Number(row.score)

      if (isNaN(studentId) || isNaN(courseId) || isNaN(score)) {
        errors.push(`第${i + 1}行: 数据格式错误 (student_id=${row.student_id}, course_id=${row.course_id}, score=${row.score})`)
        continue
      }

      try {
        run(
          'INSERT OR REPLACE INTO grades (student_id, course_id, score) VALUES (?, ?, ?)',
          [studentId, courseId, score],
        )
        imported++
      } catch (err) {
        errors.push(`第${i + 1}行: 插入失败 - ${(err as Error).message}`)
      }
    }

    recalculateQualifications()

    res.json({ success: true, data: { imported, errors } })
  } catch (error) {
    res.status(500).json({ success: false, error: '导入成绩失败' })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId, studentId } = req.query
    let sql = `SELECT g.id, g.student_id, g.course_id, g.score,
               u.name AS studentName, c.name AS courseName, c.semester
               FROM grades g
               JOIN users u ON g.student_id = u.id
               JOIN courses c ON g.course_id = c.id
               WHERE 1=1`
    const params: unknown[] = []

    if (courseId) {
      sql += ' AND g.course_id = ?'
      params.push(Number(courseId))
    }
    if (studentId) {
      sql += ' AND g.student_id = ?'
      params.push(Number(studentId))
    }

    if (req.userRole === 'student' && req.userId) {
      sql += ' AND g.student_id = ?'
      params.push(req.userId)
    } else if (req.userRole === 'teacher' && req.userId) {
      sql += ' AND c.teacher_id = ?'
      params.push(req.userId)
    }

    sql += ' ORDER BY g.id'

    const grades = queryAll<Grade>(sql, params)
    res.json({ success: true, data: grades })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询成绩失败' })
  }
})

export default router
