import { Router, type Request, type Response } from 'express'
import {
  queryAll,
  queryOne,
  run,
  addAuditLog,
  createSnapshot,
  createNotification,
  buildSnapshotOperation,
  buildAuditLogOperation,
  execTransaction,
  pushDraftUndo,
  popDraftUndo,
  listDraftUndoStack,
  countDraftUndoStack,
  clearDraftUndoStack,
  type DraftUndoStackItem,
  type DraftUndoAction,
} from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'
import type {
  Arrangement,
  ArrangementDraft,
  BatchResultItem,
  DraftPublishResult,
} from '../types.js'

const router = Router()

router.use(authMiddleware)

function buildArrangementRow(row: Record<string, unknown>): Arrangement {
  return {
    id: Number(row.id),
    applicationId: Number(row.application_id),
    studentId: Number(row.student_id),
    courseId: Number(row.course_id),
    examRoomId: Number(row.exam_room_id),
    examDate: String(row.exam_date),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    status: row.status as 'scheduled' | 'cancelled',
    cancelReason: row.cancel_reason as string | undefined,
    createdAt: String(row.created_at),
    studentName: row.studentName as string | undefined,
    courseName: row.courseName as string | undefined,
    examRoomName: row.examRoomName as string | undefined,
  }
}

function buildDraftRow(row: Record<string, unknown>): ArrangementDraft {
  return {
    id: Number(row.id),
    applicationId: Number(row.application_id),
    studentId: Number(row.student_id),
    courseId: Number(row.course_id),
    examRoomId: Number(row.exam_room_id),
    examDate: String(row.exam_date),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    createdBy: Number(row.created_by),
    createdAt: String(row.created_at),
    studentName: row.studentName as string | undefined,
    courseName: row.courseName as string | undefined,
    examRoomName: row.examRoomName as string | undefined,
  }
}

function hasTimeOverlap(
  s1: string,
  e1: string,
  s2: string,
  e2: string,
): boolean {
  return !(e1 <= s2 || s1 >= e2)
}

function checkStudentConflictInScheduled(
  studentId: number,
  examDate: string,
  startTime: string,
  endTime: string,
  excludeArrangementId?: number,
): { id: number; courseName?: string } | null {
  let sql = `SELECT ar.id, c.name AS courseName
             FROM arrangements ar
             JOIN courses c ON ar.course_id = c.id
             WHERE ar.student_id = ?
               AND ar.exam_date = ?
               AND ar.status = 'scheduled'
               AND NOT (ar.end_time <= ? OR ar.start_time >= ?)`
  const params: unknown[] = [studentId, examDate, startTime, endTime]
  if (excludeArrangementId !== undefined) {
    sql += ' AND ar.id != ?'
    params.push(excludeArrangementId)
  }
  sql += ' LIMIT 1'
  return queryOne<{ id: number; courseName: string }>(sql, params)
}

function checkStudentConflictInDrafts(
  studentId: number,
  examDate: string,
  startTime: string,
  endTime: string,
  excludeDraftId?: number,
): { id: number; courseName?: string } | null {
  let sql = `SELECT d.id, c.name AS courseName
             FROM arrangement_drafts d
             JOIN courses c ON d.course_id = c.id
             WHERE d.student_id = ?
               AND d.exam_date = ?
               AND NOT (d.end_time <= ? OR d.start_time >= ?)`
  const params: unknown[] = [studentId, examDate, startTime, endTime]
  if (excludeDraftId !== undefined) {
    sql += ' AND d.id != ?'
    params.push(excludeDraftId)
  }
  sql += ' LIMIT 1'
  return queryOne<{ id: number; courseName: string }>(sql, params)
}

function getRoomUsedCount(roomId: number, examDate: string): number {
  const row = queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM arrangements WHERE exam_room_id = ? AND status = ? AND exam_date = ?',
    [roomId, 'scheduled', examDate],
  )
  return row?.count || 0
}

function getRoomDraftCount(roomId: number, examDate: string, excludeDraftId?: number): number {
  let sql = 'SELECT COUNT(*) AS count FROM arrangement_drafts WHERE exam_room_id = ? AND exam_date = ?'
  const params: unknown[] = [roomId, examDate]
  if (excludeDraftId !== undefined) {
    sql += ' AND id != ?'
    params.push(excludeDraftId)
  }
  const row = queryOne<{ count: number }>(sql, params)
  return row?.count || 0
}

router.get('/drafts', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const drafts = queryAll<Record<string, unknown>>(
      `SELECT d.*,
              u.name AS studentName,
              c.name AS courseName,
              er.name AS examRoomName
       FROM arrangement_drafts d
       JOIN users u ON d.student_id = u.id
       JOIN courses c ON d.course_id = c.id
       JOIN exam_rooms er ON d.exam_room_id = er.id
       ORDER BY d.exam_date, d.start_time, d.id`,
    )
    const result = drafts.map(buildDraftRow)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: '查询排考草稿失败' })
  }
})

router.post('/drafts/batch-add', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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

    const details: Array<{ applicationId: number; status: 'added' | 'skipped'; reason?: string }> = []
    const toAdd: Array<{
      app: { id: number; student_id: number; course_id: number; status: string }
    }> = []
    const addedStudentIds = new Set<number>()

    for (const appId of applicationIds) {
      const id = Number(appId)
      const app = queryOne<{ id: number; student_id: number; course_id: number; status: string }>(
        'SELECT id, student_id, course_id, status FROM applications WHERE id = ?',
        [id],
      )

      if (!app) {
        details.push({ applicationId: id, status: 'skipped', reason: '申请不存在' })
        continue
      }

      if (app.status !== 'approved') {
        const statusLabel: Record<string, string> = {
          pending: '待审核',
          rejected: '已拒绝',
          withdrawn: '已撤回',
        }
        details.push({
          applicationId: id,
          status: 'skipped',
          reason: `申请状态为${statusLabel[app.status] || app.status}，仅已批准的申请可排考`,
        })
        continue
      }

      const alreadyScheduled = queryOne<{ id: number }>(
        `SELECT id FROM arrangements WHERE application_id = ? AND status = 'scheduled'`,
        [id],
      )
      if (alreadyScheduled) {
        details.push({ applicationId: id, status: 'skipped', reason: '该申请已存在有效的排考安排' })
        continue
      }

      const alreadyInDraft = queryOne<{ id: number }>(
        'SELECT id FROM arrangement_drafts WHERE application_id = ?',
        [id],
      )
      if (alreadyInDraft) {
        details.push({ applicationId: id, status: 'skipped', reason: '该申请已在草稿中' })
        continue
      }

      const scheduledConflict = checkStudentConflictInScheduled(
        app.student_id,
        examDate,
        startTime,
        endTime,
      )
      if (scheduledConflict) {
        details.push({
          applicationId: id,
          status: 'skipped',
          reason: `该学生在 ${examDate} ${startTime}-${endTime} 已有正式考试安排（${scheduledConflict.courseName || ''}），时间冲突`,
        })
        continue
      }

      const draftConflict = checkStudentConflictInDrafts(
        app.student_id,
        examDate,
        startTime,
        endTime,
      )
      if (draftConflict) {
        details.push({
          applicationId: id,
          status: 'skipped',
          reason: `该学生在 ${examDate} ${startTime}-${endTime} 的草稿中已有安排（${draftConflict.courseName || ''}），时间冲突`,
        })
        continue
      }

      if (addedStudentIds.has(app.student_id)) {
        details.push({
          applicationId: id,
          status: 'skipped',
          reason: `该学生在 ${examDate} ${startTime}-${endTime} 的同批次草稿中已有安排，时间冲突`,
        })
        continue
      }

      toAdd.push({ app })
      addedStudentIds.add(app.student_id)
    }

    const currentUsed = getRoomUsedCount(room.id, examDate)
    const currentDrafts = getRoomDraftCount(room.id, examDate)
    const available = room.capacity - currentUsed - currentDrafts

    if (toAdd.length > available && available >= 0) {
      for (let i = available; i < toAdd.length; i++) {
        details.push({
          applicationId: toAdd[i].app.id,
          status: 'skipped',
          reason: '考场容量不足',
        })
      }
      toAdd.splice(available)
    }

    const addedDraftIds: number[] = []
    for (const { app } of toAdd) {
      run(
        `INSERT INTO arrangement_drafts
         (application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [app.id, app.student_id, app.course_id, room.id, examDate, startTime, endTime, req.userId!],
      )
      const idRow = queryOne<{ id: number }>('SELECT last_insert_rowid() AS id')
      if (idRow) addedDraftIds.push(idRow.id)
      details.push({ applicationId: app.id, status: 'added' })
    }

    const addedCount = details.filter((d) => d.status === 'added').length
    const skippedCount = details.filter((d) => d.status === 'skipped').length

    if (addedCount > 0) {
      for (const draftId of addedDraftIds) {
        addAuditLog('create', 'arrangement_draft', draftId, req.userId!,
          `批量添加草稿: 考场${room.id}, ${examDate} ${startTime}-${endTime}`)
      }
      pushDraftUndo(req.userId!, 'batch_add', {
        draftIds: addedDraftIds,
        description: `撤销批量添加 ${addedCount} 条草稿`,
      })
    }

    res.json({
      success: true,
      data: {
        total: applicationIds.length,
        added: addedCount,
        skipped: skippedCount,
        details,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '批量添加草稿失败' })
  }
})

router.put('/drafts/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { examRoomId, examDate, startTime, endTime } = req.body

    const draft = queryOne<{
      id: number
      application_id: number
      student_id: number
      course_id: number
      exam_room_id: number
      exam_date: string
      start_time: string
      end_time: string
    }>('SELECT * FROM arrangement_drafts WHERE id = ?', [Number(id)])

    if (!draft) {
      res.status(404).json({ success: false, error: '草稿项不存在' })
      return
    }

    const newRoomId = examRoomId !== undefined ? Number(examRoomId) : draft.exam_room_id
    const newDate = examDate || draft.exam_date
    const newStart = startTime || draft.start_time
    const newEnd = endTime || draft.end_time

    if (examRoomId !== undefined) {
      const room = queryOne<{ id: number; capacity: number }>(
        'SELECT id, capacity FROM exam_rooms WHERE id = ?',
        [newRoomId],
      )
      if (!room) {
        res.status(404).json({ success: false, error: '考场不存在' })
        return
      }
    }

    const scheduledConflict = checkStudentConflictInScheduled(
      draft.student_id,
      newDate,
      newStart,
      newEnd,
    )
    if (scheduledConflict) {
      res.status(400).json({
        success: false,
        error: `该学生在 ${newDate} ${newStart}-${newEnd} 已有正式考试安排（${scheduledConflict.courseName || ''}），时间冲突`,
      })
      return
    }

    const draftConflict = checkStudentConflictInDrafts(
      draft.student_id,
      newDate,
      newStart,
      newEnd,
      Number(id),
    )
    if (draftConflict) {
      res.status(400).json({
        success: false,
        error: `该学生在 ${newDate} ${newStart}-${newEnd} 的草稿中已有其他安排，时间冲突`,
      })
      return
    }

    const room = queryOne<{ id: number; capacity: number }>(
      'SELECT id, capacity FROM exam_rooms WHERE id = ?',
      [newRoomId],
    )
    if (room) {
      const used = getRoomUsedCount(newRoomId, newDate)
      const draftCount = getRoomDraftCount(newRoomId, newDate, Number(id))
      if (used + draftCount + 1 > room.capacity) {
        res.status(400).json({ success: false, error: '考场容量不足' })
        return
      }
    }

    const beforeData = {
      id: Number(id),
      applicationId: draft.application_id,
      studentId: draft.student_id,
      courseId: draft.course_id,
      examRoomId: draft.exam_room_id,
      examDate: draft.exam_date,
      startTime: draft.start_time,
      endTime: draft.end_time,
    }

    run(
      `UPDATE arrangement_drafts
       SET exam_room_id = ?, exam_date = ?, start_time = ?, end_time = ?
       WHERE id = ?`,
      [newRoomId, newDate, newStart, newEnd, Number(id)],
    )

    addAuditLog('update', 'arrangement_draft', Number(id), req.userId!,
      `修改草稿: 考场${draft.exam_room_id}→${newRoomId}, ${draft.exam_date} ${draft.start_time}-${draft.end_time}→${newDate} ${newStart}-${newEnd}`)

    pushDraftUndo(req.userId!, 'update', {
      before: beforeData,
      description: `撤销修改草稿 #${id}`,
    })

    const updated = queryOne<Record<string, unknown>>(
      `SELECT d.*,
              u.name AS studentName,
              c.name AS courseName,
              er.name AS examRoomName
       FROM arrangement_drafts d
       JOIN users u ON d.student_id = u.id
       JOIN courses c ON d.course_id = c.id
       JOIN exam_rooms er ON d.exam_room_id = er.id
       WHERE d.id = ?`,
      [Number(id)],
    )

    res.json({ success: true, data: updated ? buildDraftRow(updated) : null })
  } catch (error) {
    res.status(500).json({ success: false, error: '更新草稿失败' })
  }
})

router.delete('/drafts/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const draft = queryOne<{
      id: number
      application_id: number
      student_id: number
      course_id: number
      exam_room_id: number
      exam_date: string
      start_time: string
      end_time: string
      created_by: number
    }>('SELECT * FROM arrangement_drafts WHERE id = ?', [Number(id)])
    if (!draft) {
      res.status(404).json({ success: false, error: '草稿项不存在' })
      return
    }

    run('DELETE FROM arrangement_drafts WHERE id = ?', [Number(id)])

    addAuditLog('delete', 'arrangement_draft', Number(id), req.userId!, '删除单个草稿项')

    pushDraftUndo(req.userId!, 'delete', {
      draft: {
        id: draft.id,
        applicationId: draft.application_id,
        studentId: draft.student_id,
        courseId: draft.course_id,
        examRoomId: draft.exam_room_id,
        examDate: draft.exam_date,
        startTime: draft.start_time,
        endTime: draft.end_time,
        createdBy: draft.created_by,
      },
      description: `撤销删除草稿 #${id}`,
    })

    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '删除草稿项失败' })
  }
})

router.delete('/drafts', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const allDrafts = queryAll<{
      id: number
      application_id: number
      student_id: number
      course_id: number
      exam_room_id: number
      exam_date: string
      start_time: string
      end_time: string
      created_by: number
    }>('SELECT * FROM arrangement_drafts')

    run('DELETE FROM arrangement_drafts')

    if (allDrafts.length > 0) {
      for (const d of allDrafts) {
        addAuditLog('delete', 'arrangement_draft', d.id, req.userId!, '批量清空草稿')
      }
      pushDraftUndo(req.userId!, 'clear', {
        drafts: allDrafts.map((d) => ({
          id: d.id,
          applicationId: d.application_id,
          studentId: d.student_id,
          courseId: d.course_id,
          examRoomId: d.exam_room_id,
          examDate: d.exam_date,
          startTime: d.start_time,
          endTime: d.end_time,
          createdBy: d.created_by,
        })),
        description: `撤销清空 ${allDrafts.length} 条草稿`,
      })
    }

    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '清空草稿失败' })
  }
})

router.post('/drafts/publish', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const drafts = queryAll<{
      id: number
      application_id: number
      student_id: number
      course_id: number
      exam_room_id: number
      exam_date: string
      start_time: string
      end_time: string
      studentName: string
      courseName: string
      examRoomName: string
    }>(
      `SELECT d.*,
              u.name AS studentName,
              c.name AS courseName,
              er.name AS examRoomName
       FROM arrangement_drafts d
       JOIN users u ON d.student_id = u.id
       JOIN courses c ON d.course_id = c.id
       JOIN exam_rooms er ON d.exam_room_id = er.id
       ORDER BY d.id`,
    )

    if (drafts.length === 0) {
      res.status(400).json({ success: false, error: '草稿为空，无可发布的排考' })
      return
    }

    const details: BatchResultItem[] = []
    const toPublish: typeof drafts = []
    const publishedByStudent: Map<number, Array<{ date: string; start: string; end: string }>> = new Map()

    for (const draft of drafts) {
      const appId = draft.application_id
      const app = queryOne<{ id: number; status: string }>(
        'SELECT id, status FROM applications WHERE id = ?',
        [appId],
      )

      if (!app || app.status !== 'approved') {
        details.push({
          id: draft.id,
          status: 'failed',
          reason: '申请不存在或状态已变更，无法发布',
        })
        continue
      }

      const alreadyScheduled = queryOne<{ id: number }>(
        `SELECT id FROM arrangements WHERE application_id = ? AND status = 'scheduled'`,
        [appId],
      )
      if (alreadyScheduled) {
        details.push({
          id: draft.id,
          status: 'skipped',
          reason: '该申请已存在有效的排考安排',
        })
        continue
      }

      const scheduledConflict = checkStudentConflictInScheduled(
        draft.student_id,
        draft.exam_date,
        draft.start_time,
        draft.end_time,
      )
      if (scheduledConflict) {
        details.push({
          id: draft.id,
          status: 'failed',
          reason: `学生在 ${draft.exam_date} ${draft.start_time}-${draft.end_time} 已有正式考试安排，时间冲突`,
        })
        continue
      }

      const studentPublished = publishedByStudent.get(draft.student_id) || []
      const draftSelfConflict = studentPublished.some(
        (s) => s.date === draft.exam_date && hasTimeOverlap(s.start, s.end, draft.start_time, draft.end_time),
      )
      if (draftSelfConflict) {
        details.push({
          id: draft.id,
          status: 'failed',
          reason: `学生在 ${draft.exam_date} ${draft.start_time}-${draft.end_time} 的待发布草稿中已有其他安排，时间冲突`,
        })
        continue
      }

      const room = queryOne<{ id: number; capacity: number }>(
        'SELECT id, capacity FROM exam_rooms WHERE id = ?',
        [draft.exam_room_id],
      )
      if (!room) {
        details.push({ id: draft.id, status: 'failed', reason: '考场不存在' })
        continue
      }

      const used = getRoomUsedCount(room.id, draft.exam_date)
      const otherDraftsSameRoom = drafts.filter(
        (d) =>
          d.exam_room_id === draft.exam_room_id &&
          d.exam_date === draft.exam_date &&
          d.id !== draft.id,
      ).length
      if (used + otherDraftsSameRoom + 1 > room.capacity) {
        details.push({ id: draft.id, status: 'failed', reason: '考场容量不足' })
        continue
      }

      toPublish.push(draft)
      if (!publishedByStudent.has(draft.student_id)) {
        publishedByStudent.set(draft.student_id, [])
      }
      publishedByStudent.get(draft.student_id)!.push({
        date: draft.exam_date,
        start: draft.start_time,
        end: draft.end_time,
      })
    }

    const failedCount = details.filter((d) => d.status === 'failed').length
    if (failedCount > 0) {
      res.json({
        success: false,
        error: `发布前检查发现 ${failedCount} 项冲突，请修正后重试`,
        data: {
          success: false,
          total: drafts.length,
          published: 0,
          failed: failedCount,
          skipped: details.filter((d) => d.status === 'skipped').length,
          details,
        } as DraftPublishResult,
      })
      return
    }

    const txOps: Array<{ sql: string; params: unknown[] }> = []
    const arrangementIds: number[] = []

    for (const draft of toPublish) {
      txOps.push({
        sql: `INSERT INTO arrangements
              (application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        params: [
          draft.application_id,
          draft.student_id,
          draft.course_id,
          draft.exam_room_id,
          draft.exam_date,
          draft.start_time,
          draft.end_time,
        ],
      })
      txOps.push({
        sql: 'SELECT last_insert_rowid() AS id',
        params: [],
      })
    }

    try {
      const database = (await import('../database.js')).getDB()
      database.run('BEGIN TRANSACTION')

      const insertedIds: number[] = []

      for (const draft of toPublish) {
        database.run(
          `INSERT INTO arrangements
           (application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
          [
            draft.application_id,
            draft.student_id,
            draft.course_id,
            draft.exam_room_id,
            draft.exam_date,
            draft.start_time,
            draft.end_time,
          ] as (string | number)[],
        )
        const stmt = database.prepare('SELECT last_insert_rowid() AS id')
        stmt.step()
        const row = stmt.getAsObject() as { id: number }
        insertedIds.push(row.id)
        stmt.free()

        database.run(
          'INSERT INTO audit_log (action, entity_type, entity_id, operator_id, detail) VALUES (?, ?, ?, ?, ?)',
          [
            'create',
            'arrangement',
            row.id,
            req.userId!,
            `草稿发布: 学生${draft.student_id}, 课程${draft.course_id}, 考场${draft.exam_room_id}`,
          ],
        )

        database.run(
          `INSERT INTO operation_snapshots
           (operation_type, target_type, target_id, snapshot_data, operator_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            'create_arrangement',
            'arrangement',
            row.id,
            JSON.stringify({
              arrangement: {
                id: row.id,
                applicationId: draft.application_id,
                studentId: draft.student_id,
                courseId: draft.course_id,
                examRoomId: draft.exam_room_id,
                examDate: draft.exam_date,
                startTime: draft.start_time,
                endTime: draft.end_time,
                status: 'scheduled',
              },
            }),
            req.userId!,
          ],
        )
      }

      database.run('DELETE FROM arrangement_drafts')

      database.run('COMMIT')

      const { saveDB } = await import('../database.js')
      saveDB()

      for (let i = 0; i < toPublish.length; i++) {
        const draft = toPublish[i]
        const arrId = insertedIds[i]
        details.push({ id: arrId, status: 'success' })

        createNotification(
          draft.student_id,
          'exam_scheduled',
          '考试安排已生成',
          `您的${draft.courseName}考试已安排：${draft.examRoomName} ${draft.exam_date} ${draft.start_time}-${draft.end_time}`,
          'arrangement',
          arrId,
        )
      }

      const publishedArrangements = queryAll<Record<string, unknown>>(
        `SELECT ar.*,
                u.name AS studentName,
                c.name AS courseName,
                er.name AS examRoomName
         FROM arrangements ar
         JOIN users u ON ar.student_id = u.id
         JOIN courses c ON ar.course_id = c.id
         JOIN exam_rooms er ON ar.exam_room_id = er.id
         WHERE ar.id IN (${insertedIds.map(() => '?').join(',')})
         ORDER BY ar.id`,
        insertedIds,
      ).map(buildArrangementRow)

      clearDraftUndoStack(req.userId!)

      res.json({
        success: true,
        data: {
          success: true,
          total: drafts.length,
          published: publishedArrangements.length,
          failed: 0,
          skipped: 0,
          details,
          arrangements: publishedArrangements,
        } as DraftPublishResult,
      })
    } catch (e) {
      const database = (await import('../database.js')).getDB()
      database.run('ROLLBACK')

      res.status(500).json({
        success: false,
        error: `发布失败，已全部回滚：${e instanceof Error ? e.message : '未知错误'}`,
        data: {
          success: false,
          total: drafts.length,
          published: 0,
          failed: drafts.length,
          skipped: 0,
          details: drafts.map((d) => ({
            id: d.id,
            status: 'failed' as const,
            reason: '事务回滚',
          })),
        } as DraftPublishResult,
      })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '发布草稿失败' })
  }
})

router.get('/drafts/undo-stack', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const stack = listDraftUndoStack(req.userId!, 20)
    const count = countDraftUndoStack(req.userId!)
    res.json({ success: true, data: { stack, count } })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取撤销栈失败' })
  }
})

router.post('/drafts/undo', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const item = popDraftUndo(req.userId!)
    if (!item) {
      res.status(400).json({ success: false, error: '撤销栈为空，无可回退操作' })
      return
    }

    const undoData = item.undoData
    let restoredCount = 0

    switch (item.action) {
      case 'batch_add': {
        const draftIds = undoData.draftIds as number[]
        for (const id of draftIds) {
          const exists = queryOne<{ id: number }>('SELECT id FROM arrangement_drafts WHERE id = ?', [id])
          if (exists) {
            run('DELETE FROM arrangement_drafts WHERE id = ?', [id])
            addAuditLog('delete', 'arrangement_draft', id, req.userId!, '撤销批量添加，删除草稿')
            restoredCount++
          }
        }
        break
      }
      case 'update': {
        const before = undoData.before as Record<string, unknown>
        const exists = queryOne<{ id: number }>('SELECT id FROM arrangement_drafts WHERE id = ?', [Number(before.id)])
        if (exists) {
          run(
            `UPDATE arrangement_drafts
             SET exam_room_id = ?, exam_date = ?, start_time = ?, end_time = ?
             WHERE id = ?`,
            [
              Number(before.examRoomId),
              String(before.examDate),
              String(before.startTime),
              String(before.endTime),
              Number(before.id),
            ],
          )
          addAuditLog('update', 'arrangement_draft', Number(before.id), req.userId!, '撤销修改，恢复草稿')
          restoredCount = 1
        }
        break
      }
      case 'delete': {
        const draft = undoData.draft as Record<string, unknown>
        const exists = queryOne<{ id: number }>('SELECT id FROM arrangement_drafts WHERE id = ?', [Number(draft.id)])
        if (!exists) {
          run(
            `INSERT INTO arrangement_drafts
             (id, application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              Number(draft.id),
              Number(draft.applicationId),
              Number(draft.studentId),
              Number(draft.courseId),
              Number(draft.examRoomId),
              String(draft.examDate),
              String(draft.startTime),
              String(draft.endTime),
              Number(draft.createdBy),
            ],
          )
          addAuditLog('create', 'arrangement_draft', Number(draft.id), req.userId!, '撤销删除，恢复草稿')
          restoredCount = 1
        }
        break
      }
      case 'clear': {
        const drafts = undoData.drafts as Array<Record<string, unknown>>
        for (const d of drafts) {
          const exists = queryOne<{ id: number }>('SELECT id FROM arrangement_drafts WHERE id = ?', [Number(d.id)])
          if (!exists) {
            run(
              `INSERT INTO arrangement_drafts
               (id, application_id, student_id, course_id, exam_room_id, exam_date, start_time, end_time, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                Number(d.id),
                Number(d.applicationId),
                Number(d.studentId),
                Number(d.courseId),
                Number(d.examRoomId),
                String(d.examDate),
                String(d.startTime),
                String(d.endTime),
                Number(d.createdBy),
              ],
            )
            addAuditLog('create', 'arrangement_draft', Number(d.id), req.userId!, '撤销清空，恢复草稿')
            restoredCount++
          }
        }
        break
      }
    }

    const drafts = queryAll<Record<string, unknown>>(
      `SELECT d.*,
              u.name AS studentName,
              c.name AS courseName,
              er.name AS examRoomName
       FROM arrangement_drafts d
       JOIN users u ON d.student_id = u.id
       JOIN courses c ON d.course_id = c.id
       JOIN exam_rooms er ON d.exam_room_id = er.id
       ORDER BY d.exam_date, d.start_time, d.id`,
    ).map(buildDraftRow)

    const count = countDraftUndoStack(req.userId!)

    res.json({
      success: true,
      data: {
        undoneAction: item.action,
        description: undoData.description as string,
        restoredCount,
        drafts,
        remainingUndoCount: count,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '撤销操作失败' })
  }
})

router.post('/drafts/undo-stack/clear', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    clearDraftUndoStack(req.userId!)
    res.json({ success: true, data: null })
  } catch (error) {
    res.status(500).json({ success: false, error: '清空撤销栈失败' })
  }
})

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

        const arrangement = queryOne<Record<string, unknown>>(
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
          const arr = buildArrangementRow(arrangement)
          createSnapshot(
            'create_arrangement',
            'arrangement',
            arr.id,
            { arrangement: arr },
            req.userId!,
          )
          created.push(arr)
          addAuditLog('create', 'arrangement', arr.id, req.userId!, `批量排考: 学生${app.student_id}, 课程${app.course_id}, 考场${room.id}`)

          createNotification(
            app.student_id,
            'exam_scheduled',
            '考试安排已生成',
            `您的${arr.courseName}考试已安排：${arr.examRoomName} ${examDate} ${startTime}-${endTime}`,
            'arrangement',
            arr.id,
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

    const arrangements = queryAll<Record<string, unknown>>(sql, params).map(buildArrangementRow)
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

    const updated = queryOne<Record<string, unknown>>(
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

    res.json({ success: true, data: updated ? buildArrangementRow(updated) : null })
  } catch (error) {
    res.status(500).json({ success: false, error: '取消排考安排失败' })
  }
})

export default router
