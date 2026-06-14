import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import {
  queryOne,
  getThreshold,
  addAuditLog,
  getDistinctGrades,
  getCoursesBySemester,
  getDistinctSemesters,
  getGradesByGradeAndSubject,
  getPreviousSemesterGrades,
  createStatReport,
  insertReportSubject,
  insertReportStudent,
  listStatReports,
  getStatReport,
  getStudentGradeHistory,
  getStudentsInGradeAndClass,
  bulkCreateNotification,
  type ScoreRange,
  type ReportSubjectData,
  type ReportStudentData,
} from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type {
  StatReport,
  StudentGradeHistory,
  GenerateReportRequest,
  CompareReportsRequest,
} from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/config/options', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const grades = getDistinctGrades()
    const semesters = getDistinctSemesters()

    const coursesBySemester: Record<string, Array<{ id: number; name: string; code: string }>> = {}
    for (const semester of semesters) {
      coursesBySemester[semester] = getCoursesBySemester(semester)
    }

    const defaultScoreRanges: ScoreRange[] = [
      { min: 0, max: 59, label: '不及格' },
      { min: 60, max: 69, label: '及格' },
      { min: 70, max: 79, label: '中等' },
      { min: 80, max: 89, label: '良好' },
      { min: 90, max: 100, label: '优秀' },
    ]

    res.json({
      success: true,
      data: {
        grades,
        semesters,
        coursesBySemester,
        defaultScoreRanges,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取配置选项失败' })
  }
})

router.post('/generate', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, grade, subjectIds, semester, scoreRanges } = req.body as GenerateReportRequest

    if (!name || !grade || !subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0 || !semester || !scoreRanges || !Array.isArray(scoreRanges)) {
      res.status(400).json({ success: false, error: '缺少必要参数' })
      return
    }

    const threshold = getThreshold()

    const reportId = createStatReport({
      name,
      grade,
      subjectIds,
      semester,
      scoreRanges,
      createdBy: req.userId!,
    })

    const subjectsResult: ReportSubjectData[] = []
    const studentsResult: ReportStudentData[] = []
    const alertSubjects: Array<{ subjectId: number; subjectName: string; averageScore: number }> = []

    for (const subjectId of subjectIds) {
      const grades = getGradesByGradeAndSubject(grade, subjectId, semester)

      if (grades.length === 0) continue

      const courseInfo = queryOne<{ name: string; code: string }>(
        'SELECT name, code FROM courses WHERE id = ?',
        [subjectId],
      )
      const subjectName = courseInfo?.name || ''
      const subjectCode = courseInfo?.code || ''

      const scores = grades.map((g) => g.score)
      const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length
      const passCount = scores.filter((s) => s >= threshold).length
      const passRate = (passCount / scores.length) * 100

      const scoreDistribution: Record<string, number> = {}
      for (const range of scoreRanges) {
        const count = scores.filter((s) => s >= range.min && s <= range.max).length
        scoreDistribution[range.label] = count
      }

      const belowThreshold = averageScore < threshold

      insertReportSubject(
        reportId,
        subjectId,
        Number(averageScore.toFixed(2)),
        Number(passRate.toFixed(2)),
        scoreDistribution,
        belowThreshold,
      )

      subjectsResult.push({
        subjectId,
        subjectName,
        averageScore: Number(averageScore.toFixed(2)),
        passRate: Number(passRate.toFixed(2)),
        scoreDistribution,
        belowThreshold,
      })

      if (belowThreshold) {
        alertSubjects.push({ subjectId, subjectName, averageScore: Number(averageScore.toFixed(2)) })
      }

      const previousGrades = getPreviousSemesterGrades(grade, subjectCode, semester)
      const prevGradeMap = new Map<number, { score: number; semester: string }>()
      for (const pg of previousGrades) {
        if (!prevGradeMap.has(pg.student_id)) {
          prevGradeMap.set(pg.student_id, pg)
        }
      }

      const classMap = new Map<string, Array<{ student_id: number; score: number }>>()
      for (const g of grades) {
        if (!classMap.has(g.class_no)) {
          classMap.set(g.class_no, [])
        }
        classMap.get(g.class_no)!.push({ student_id: g.student_id, score: g.score })
      }

      const sortedGradeScores = [...scores].sort((a, b) => b - a)
      const getGradeRank = (score: number) => sortedGradeScores.indexOf(score) + 1

      for (const g of grades) {
        const classScores = classMap.get(g.class_no) || []
        const sortedClassScores = [...classScores].sort((a, b) => b.score - a.score)
        const classRank = sortedClassScores.findIndex((s) => s.student_id === g.student_id) + 1
        const gradeRank = getGradeRank(g.score)

        const prev = prevGradeMap.get(g.student_id)
        const previousScore = prev?.score
        const scoreChange = previousScore !== undefined ? Number((g.score - previousScore).toFixed(2)) : undefined

        let rankChange: string | undefined
        if (prev !== undefined) {
          const prevGrades = getGradesByGradeAndSubject(grade, subjectId, prev.semester)
          if (prevGrades.length > 0) {
            const prevScores = prevGrades.map((pg) => pg.score).sort((a, b) => b - a)
            const prevClassGrades = prevGrades.filter((pg) => pg.class_no === g.class_no)
            const prevClassScores = [...prevClassGrades].sort((a, b) => b.score - a.score)

            const prevGradeRank = prevScores.indexOf(prev.score) + 1
            const prevClassRank = prevClassScores.findIndex((pg) => pg.student_id === g.student_id) + 1

            if (prevGradeRank > gradeRank) rankChange = '↑'
            else if (prevGradeRank < gradeRank) rankChange = '↓'
            else rankChange = '-'

            insertReportStudent({
              reportId,
              studentId: g.student_id,
              subjectId,
              currentScore: g.score,
              previousScore,
              scoreChange,
              classRank,
              gradeRank,
              previousClassRank: prevClassRank,
              previousGradeRank: prevGradeRank,
              rankChange,
            })
          } else {
            insertReportStudent({
              reportId,
              studentId: g.student_id,
              subjectId,
              currentScore: g.score,
              previousScore,
              scoreChange,
              classRank,
              gradeRank,
              rankChange,
            })
          }
        } else {
          insertReportStudent({
            reportId,
            studentId: g.student_id,
            subjectId,
            currentScore: g.score,
            classRank,
            gradeRank,
          })
        }

        let changeMarker: 'up' | 'down' | 'same' | undefined
        if (scoreChange !== undefined) {
          if (scoreChange > 0) changeMarker = 'up'
          else if (scoreChange < 0) changeMarker = 'down'
          else changeMarker = 'same'
        }

        studentsResult.push({
          studentId: g.student_id,
          studentName: g.student_name,
          grade,
          classNo: g.class_no,
          subjectId,
          subjectName,
          currentScore: g.score,
          previousScore,
          scoreChange,
          classRank,
          gradeRank,
          rankChange,
          changeMarker,
        })
      }
    }

    for (const alert of alertSubjects) {
      const students = getStudentsInGradeAndClass(grade)
      const studentIds = students.map((s) => s.id)
      bulkCreateNotification(
        studentIds,
        'low_score_alert',
        `${alert.subjectName}成绩预警`,
        `【${alert.subjectName}】平均分${alert.averageScore}分，低于预警线${threshold}分，请关注学习情况。`,
        'stat_report',
        reportId,
      )
    }

    addAuditLog('generate', 'stat_report', reportId, req.userId!, `生成统计报告: ${name}`)

    const report: StatReport = {
      id: reportId,
      name,
      grade,
      subjectIds,
      semester,
      scoreRanges,
      createdBy: req.userId!,
      createdAt: new Date().toISOString(),
      subjects: subjectsResult,
      students: studentsResult,
    }

    res.json({ success: true, data: report })
  } catch (error) {
    res.status(500).json({ success: false, error: '生成报告失败' })
  }
})

router.get('/reports', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { grade } = req.query
    const reports = listStatReports(grade as string | undefined)
    res.json({ success: true, data: reports })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取报告列表失败' })
  }
})

router.get('/reports/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const report = getStatReport(Number(id))

    if (!report) {
      res.status(404).json({ success: false, error: '报告不存在' })
      return
    }

    res.json({ success: true, data: report })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取报告详情失败' })
  }
})

router.get('/reports/:id/export', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const report = getStatReport(Number(id))

    if (!report) {
      res.status(404).json({ success: false, error: '报告不存在' })
      return
    }

    const csvRows: Array<Record<string, string | number>> = []

    const subjectMap = new Map<number, ReportSubjectData>()
    for (const s of report.subjects || []) {
      subjectMap.set(s.subjectId, s)
    }

    const studentSubjectMap = new Map<number, Map<number, ReportStudentData>>()
    for (const s of report.students || []) {
      if (!studentSubjectMap.has(s.studentId)) {
        studentSubjectMap.set(s.studentId, new Map())
      }
      studentSubjectMap.get(s.studentId)!.set(s.subjectId, s)
    }

    const uniqueStudents = new Map<number, { name: string; classNo: string }>()
    for (const s of report.students || []) {
      uniqueStudents.set(s.studentId, { name: s.studentName, classNo: s.classNo })
    }

    for (const [studentId, studentInfo] of uniqueStudents.entries()) {
      const baseRow: Record<string, string | number> = {
        学生姓名: studentInfo.name,
        班级: studentInfo.classNo,
      }

      for (const subjectId of report.subjectIds) {
        const subject = subjectMap.get(subjectId)
        const studentData = studentSubjectMap.get(studentId)?.get(subjectId)

        if (subject && studentData) {
          baseRow[`${subject.subjectName}_本次分数`] = studentData.currentScore
          baseRow[`${subject.subjectName}_上次分数`] = studentData.previousScore ?? '-'
          baseRow[`${subject.subjectName}_分数涨跌`] = studentData.scoreChange ?? '-'
          baseRow[`${subject.subjectName}_涨跌标记`] =
            studentData.changeMarker === 'up' ? '↑' :
            studentData.changeMarker === 'down' ? '↓' :
            studentData.changeMarker === 'same' ? '-' : '-'
          baseRow[`${subject.subjectName}_班级排名`] = studentData.classRank
          baseRow[`${subject.subjectName}_年级排名`] = studentData.gradeRank
          baseRow[`${subject.subjectName}_排名变化`] = studentData.rankChange ?? '-'
        }
      }

      csvRows.push(baseRow)
    }

    const csv = Papa.unparse(csvRows)

    addAuditLog('export', 'stat_report', Number(id), req.userId!, `导出报告CSV: ${report.name}`)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.name)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (error) {
    res.status(500).json({ success: false, error: '导出CSV失败' })
  }
})

router.post('/compare', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportIds, classNo } = req.body as CompareReportsRequest

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length < 2) {
      res.status(400).json({ success: false, error: '请选择至少2份报告进行对比' })
      return
    }

    const reports: Array<StatReport & { studentData: Map<number, Map<number, ReportStudentData>> }> = []

    for (const reportId of reportIds) {
      const report = getStatReport(reportId)
      if (!report) {
        res.status(404).json({ success: false, error: `报告${reportId}不存在` })
        return
      }

      const studentData = new Map<number, Map<number, ReportStudentData>>()
      for (const s of report.students || []) {
        if (classNo && s.classNo !== classNo) continue
        if (!studentData.has(s.studentId)) {
          studentData.set(s.studentId, new Map())
        }
        studentData.get(s.studentId)!.set(s.subjectId, s)
      }

      reports.push({ ...report, studentData })
    }

    const allStudentIds = new Set<number>()
    for (const r of reports) {
      for (const id of r.studentData.keys()) {
        allStudentIds.add(id)
      }
    }

    const result: Array<{
      studentId: number
      studentName: string
      classNo: string
      reports: Array<{
        reportId: number
        reportName: string
        semester: string
        subjects: Array<{
          subjectName: string
          score: number
          classRank: number
          gradeRank: number
        }>
      }>
    }> = []

    for (const studentId of allStudentIds) {
      const studentReports: typeof result[0]['reports'] = []
      let studentName = ''
      let classNoValue = ''

      for (const report of reports) {
        const subjectData = report.studentData.get(studentId)
        if (!subjectData) continue

        const subjects: Array<{ subjectName: string; score: number; classRank: number; gradeRank: number }> = []
        for (const sd of subjectData.values()) {
          studentName = sd.studentName
          classNoValue = sd.classNo
          subjects.push({
            subjectName: sd.subjectName,
            score: sd.currentScore,
            classRank: sd.classRank,
            gradeRank: sd.gradeRank,
          })
        }

        if (subjects.length > 0) {
          studentReports.push({
            reportId: report.id,
            reportName: report.name,
            semester: report.semester,
            subjects,
          })
        }
      }

      if (studentReports.length > 0) {
        result.push({
          studentId,
          studentName,
          classNo: classNoValue,
          reports: studentReports,
        })
      }
    }

    res.json({ success: true, data: { reports: result } })
  } catch (error) {
    res.status(500).json({ success: false, error: '对比报告失败' })
  }
})

router.get('/my-grades', requireRole('student'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: '未登录' })
      return
    }

    const history = getStudentGradeHistory(req.userId)

    const historyByCourse = new Map<string, StudentGradeHistory[]>()
    for (const h of history) {
      if (!historyByCourse.has(h.courseCode)) {
        historyByCourse.set(h.courseCode, [])
      }
      historyByCourse.get(h.courseCode)!.push(h)
    }

    const result: Array<{
      courseCode: string
      courseName: string
      history: Array<StudentGradeHistory & { rankChange?: string }>
    }> = []

    for (const [courseCode, records] of historyByCourse.entries()) {
      const sortedRecords = [...records].sort((a, b) => a.semester.localeCompare(b.semester))

      for (let i = 1; i < sortedRecords.length; i++) {
        const curr = sortedRecords[i]
        const prev = sortedRecords[i - 1]
        if (prev.gradeRank && curr.gradeRank) {
          if (curr.gradeRank < prev.gradeRank) sortedRecords[i].rankChange = '↑'
          else if (curr.gradeRank > prev.gradeRank) sortedRecords[i].rankChange = '↓'
          else sortedRecords[i].rankChange = '-'
        }
      }

      result.push({
        courseCode,
        courseName: sortedRecords[0].courseName,
        history: sortedRecords,
      })
    }

    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取个人成绩失败' })
  }
})

export default router
