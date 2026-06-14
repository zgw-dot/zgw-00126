import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import { queryAll } from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'

const router = Router()

router.use(authMiddleware)

router.get('/notification-list', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const records = queryAll<{
      studentName: string
      courseName: string
      exam_date: string
      start_time: string
      end_time: string
      examRoomName: string
      location: string
    }>(
      `SELECT u.name AS studentName, c.name AS courseName,
              ar.exam_date, ar.start_time, ar.end_time, er.name AS examRoomName, er.location
       FROM arrangements ar
       JOIN applications a ON ar.application_id = a.id
       JOIN users u ON ar.student_id = u.id
       JOIN courses c ON ar.course_id = c.id
       JOIN exam_rooms er ON ar.exam_room_id = er.id
       WHERE ar.status = 'scheduled' AND a.status = 'approved'
       ORDER BY ar.exam_date, ar.start_time`,
    )

    const csvData = records.map((r) => ({
      学生姓名: r.studentName,
      课程名称: r.courseName,
      考试日期: r.exam_date,
      开始时间: r.start_time,
      结束时间: r.end_time,
      考场名称: r.examRoomName,
      考场位置: r.location,
    }))

    const csv = Papa.unparse(csvData)
    const filename = encodeURIComponent('补考通知单.csv')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send('\uFEFF' + csv)
  } catch (error) {
    res.status(500).json({ success: false, error: '导出通知单失败' })
  }
})

router.get('/exam-schedule', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const records = queryAll<{
      studentName: string
      courseName: string
      exam_date: string
      start_time: string
      end_time: string
      examRoomName: string
      location: string
      status: string
    }>(
      `SELECT u.name AS studentName, c.name AS courseName,
              ar.exam_date, ar.start_time, ar.end_time, er.name AS examRoomName, er.location, ar.status
       FROM arrangements ar
       JOIN users u ON ar.student_id = u.id
       JOIN courses c ON ar.course_id = c.id
       JOIN exam_rooms er ON ar.exam_room_id = er.id
       WHERE ar.status = 'scheduled'
       ORDER BY ar.exam_date, ar.start_time`,
    )

    const csvData = records.map((r) => ({
      学生姓名: r.studentName,
      课程名称: r.courseName,
      考试日期: r.exam_date,
      开始时间: r.start_time,
      结束时间: r.end_time,
      考场名称: r.examRoomName,
      考场位置: r.location,
      状态: r.status === 'scheduled' ? '已安排' : '已取消',
    }))

    const csv = Papa.unparse(csvData)
    const filename = encodeURIComponent('考试安排表.csv')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send('\uFEFF' + csv)
  } catch (error) {
    res.status(500).json({ success: false, error: '导出考试安排失败' })
  }
})

export default router
