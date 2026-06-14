import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import { queryAll, queryOne, run, recalculateQualifications, getDB } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type { Grade } from '../types.js'

const router = Router()

router.use(authMiddleware)

function getField(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name]
    const lower = name.toLowerCase()
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return row[key]
    }
  }
  return undefined
}

function getOrCreateStudent(studentId: string, studentName: string): number {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? AND role = ?',
    [studentId, 'student'],
  )
  if (existing) return existing.id

  run(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
    [studentId, 'student123', studentName || studentId, 'student'],
  )
  const row = queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? AND role = ?',
    [studentId, 'student'],
  )
  return row ? row.id : 0
}

function getOrCreateCourse(courseId: string, courseName: string): number {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM courses WHERE code = ?',
    [courseId],
  )
  if (existing) return existing.id

  const teacher = queryOne<{ id: number }>(
    "SELECT id FROM users WHERE role = 'teacher' LIMIT 1",
  )
  const teacherId = teacher ? teacher.id : 2

  run(
    'INSERT INTO courses (name, code, semester, teacher_id) VALUES (?, ?, ?, ?)',
    [courseName || courseId, courseId, '2025-2026-1', teacherId],
  )
  const row = queryOne<{ id: number }>(
    'SELECT id FROM courses WHERE code = ?',
    [courseId],
  )
  return row ? row.id : 0
}

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
      dynamicTyping: false,
    })

    const errors: string[] = []
    let imported = 0

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i] as Record<string, unknown>

      const studentIdRaw = String(getField(row, 'studentId', 'student_id', '学号') || '')
      const studentName = String(getField(row, 'studentName', 'student_name', '姓名') || '')
      const courseIdRaw = String(getField(row, 'courseId', 'course_id', '课程号', '课程编号') || '')
      const courseName = String(getField(row, 'courseName', 'course_name', '课程名', '课程名称') || '')
      const scoreRaw = getField(row, 'score', '成绩', '分数')

      if (!studentIdRaw || !courseIdRaw || scoreRaw === undefined || scoreRaw === null) {
        errors.push(`第${i + 1}行: 缺少必要字段 (studentId=${studentIdRaw}, courseId=${courseIdRaw}, score=${scoreRaw})`)
        continue
      }

      const score = Number(scoreRaw)
      if (isNaN(score) || score < 0 || score > 100) {
        errors.push(`第${i + 1}行: 成绩格式错误 (score=${scoreRaw})`)
        continue
      }

      try {
        const studentDbId = getOrCreateStudent(studentIdRaw, studentName)
        const courseDbId = getOrCreateCourse(courseIdRaw, courseName)

        if (studentDbId === 0 || courseDbId === 0) {
          errors.push(`第${i + 1}行: 用户或课程创建失败`)
          continue
        }

        run(
          'INSERT OR REPLACE INTO grades (student_id, course_id, score) VALUES (?, ?, ?)',
          [studentDbId, courseDbId, score],
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
