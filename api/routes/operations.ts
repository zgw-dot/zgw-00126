import { Router, type Request, type Response } from 'express'
import {
  queryAll,
  queryOne,
  run,
  addAuditLog,
  getSnapshotById,
  listSnapshots,
  markSnapshotReverted,
  type OperationSnapshot,
} from '../database.js'
import { authMiddleware, requireRole } from '../middleware.js'

const router = Router()

router.use(authMiddleware)
router.use(requireRole('admin'))

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 20
    const snapshots = listSnapshots(limit)
    res.json({ success: true, data: snapshots })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取操作列表失败' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const snapshot = getSnapshotById(Number(id))

    if (!snapshot) {
      res.status(404).json({ success: false, error: '操作记录不存在' })
      return
    }

    res.json({ success: true, data: snapshot })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取操作详情失败' })
  }
})

router.post('/:id/revert', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const snapshot = getSnapshotById(Number(id))

    if (!snapshot) {
      res.status(404).json({ success: false, error: '操作记录不存在' })
      return
    }

    if (snapshot.operatorId !== req.userId) {
      res.status(403).json({ success: false, error: '只能撤销自己的操作' })
      return
    }

    if (snapshot.reverted) {
      res.status(400).json({ success: false, error: '该操作已被撤销过' })
      return
    }

    let resultMessage = ''

    switch (snapshot.operationType) {
      case 'override_qualification':
        resultMessage = await revertOverrideQualification(snapshot, req.userId!)
        break
      case 'approve_application':
        resultMessage = await revertApproveApplication(snapshot, req.userId!)
        break
      case 'reject_application':
        resultMessage = await revertRejectApplication(snapshot, req.userId!)
        break
      case 'create_arrangement':
        resultMessage = await revertCreateArrangement(snapshot, req.userId!)
        break
      default:
        res.status(400).json({ success: false, error: `不支持撤销的操作类型: ${snapshot.operationType}` })
        return
    }

    markSnapshotReverted(Number(id))
    addAuditLog('revert', 'operation', Number(id), req.userId!, resultMessage)

    res.json({ success: true, data: { message: resultMessage } })
  } catch (error) {
    console.error('Revert error:', error)
    const message = error instanceof Error ? error.message : '撤销操作失败'
    res.status(400).json({ success: false, error: message })
  }
})

async function revertOverrideQualification(snapshot: OperationSnapshot, operatorId: number): Promise<string> {
  const data = snapshot.snapshotData as {
    originalQualification: {
      id: number
      student_id: number
      course_id: number
      qualified: number
      source: string
      status: string
      reason: string | null
      overridden_by: number | null
    }
    newQualified: boolean
    reason: string
  }

  const origQual = data.originalQualification

  const newQual = queryOne<{ id: number }>(
    `SELECT id FROM qualifications
     WHERE student_id = ? AND course_id = ? AND source = 'manual_override' AND status = 'active'
     ORDER BY id DESC LIMIT 1`,
    [origQual.student_id, origQual.course_id],
  )

  if (newQual) {
    const arrangements = queryAll<{ id: number; exam_date: string }>(
      `SELECT a.id, a.exam_date FROM arrangements a
       JOIN applications app ON a.application_id = app.id
       WHERE app.qualification_id = ? AND a.status = 'scheduled'`,
      [newQual.id],
    )

    for (const arr of arrangements) {
      if (isDatePassed(arr.exam_date)) {
        throw new Error(`存在已过期的排考（ID: ${arr.id}），无法撤销资格覆盖`)
      }
    }

    for (const arr of arrangements) {
      run(
        'UPDATE arrangements SET status = ?, cancel_reason = ? WHERE id = ?',
        ['cancelled', '撤销资格覆盖，级联取消排考', arr.id],
      )
      addAuditLog('cancel_cascade', 'arrangement', arr.id, operatorId, '撤销资格覆盖级联取消排考')
    }

    const apps = queryAll<{ id: number }>(
      'SELECT id FROM applications WHERE qualification_id = ?',
      [newQual.id],
    )
    for (const app of apps) {
      run('UPDATE applications SET status = ? WHERE id = ?', ['withdrawn', app.id])
      addAuditLog('withdraw_cascade', 'application', app.id, operatorId, '撤销资格覆盖级联撤回申请')
    }

    run('UPDATE qualifications SET status = ? WHERE id = ?', ['cancelled', newQual.id])
  }

  run(
    'UPDATE qualifications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [origQual.status, origQual.id],
  )

  addAuditLog('revert_override', 'qualification', origQual.id, operatorId, `撤销资格覆盖，恢复原资格状态: ${origQual.status}`)

  return `已撤销资格覆盖操作，原资格记录（ID: ${origQual.id}）已恢复为 ${origQual.status} 状态`
}

async function revertApproveApplication(snapshot: OperationSnapshot, operatorId: number): Promise<string> {
  const data = snapshot.snapshotData as {
    application: {
      id: number
      student_id: number
      course_id: number
      qualification_id: number
      status: string
      reject_reason: string | null
      reviewed_by: number | null
      reviewed_at: string | null
    }
  }

  const app = data.application

  const arrangements = queryAll<{ id: number; exam_date: string }>(
    'SELECT id, exam_date FROM arrangements WHERE application_id = ? AND status = ?',
    [app.id, 'scheduled'],
  )

  for (const arr of arrangements) {
    if (isDatePassed(arr.exam_date)) {
      throw new Error(`存在已过期的排考（ID: ${arr.id}），无法撤销审批`)
    }
  }

  for (const arr of arrangements) {
    run(
      'UPDATE arrangements SET status = ?, cancel_reason = ? WHERE id = ?',
      ['cancelled', '撤销审批通过，级联取消排考', arr.id],
    )
    addAuditLog('cancel_cascade', 'arrangement', arr.id, operatorId, '撤销审批级联取消排考')
  }

  run(
    'UPDATE applications SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
    [app.status, app.reject_reason, app.reviewed_by, app.reviewed_at, app.id],
  )

  addAuditLog('revert_approve', 'application', app.id, operatorId, '撤销审批通过，申请恢复为待审核状态')

  return `已撤销审批通过操作，申请（ID: ${app.id}）已恢复为 ${app.status} 状态`
}

async function revertRejectApplication(snapshot: OperationSnapshot, operatorId: number): Promise<string> {
  const data = snapshot.snapshotData as {
    application: {
      id: number
      student_id: number
      course_id: number
      qualification_id: number
      status: string
      reject_reason: string | null
      reviewed_by: number | null
      reviewed_at: string | null
    }
  }

  const app = data.application

  run(
    'UPDATE applications SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
    [app.status, app.reject_reason, app.reviewed_by, app.reviewed_at, app.id],
  )

  addAuditLog('revert_reject', 'application', app.id, operatorId, '撤销拒绝，申请恢复为待审核状态')

  return `已撤销拒绝操作，申请（ID: ${app.id}）已恢复为 ${app.status} 状态`
}

async function revertCreateArrangement(snapshot: OperationSnapshot, operatorId: number): Promise<string> {
  const data = snapshot.snapshotData as {
    arrangement: {
      id: number
      application_id: number
      student_id: number
      course_id: number
      exam_room_id: number
      exam_date: string
      start_time: string
      end_time: string
      status: string
    }
  }

  const arr = data.arrangement

  if (isDatePassed(arr.exam_date)) {
    throw new Error(`考试日期（${arr.exam_date}）已过，无法撤销排考`)
  }

  const currentArr = queryOne<{ status: string }>(
    'SELECT status FROM arrangements WHERE id = ?',
    [arr.id],
  )

  if (!currentArr || currentArr.status !== 'scheduled') {
    throw new Error('该排考不存在或已被取消')
  }

  run(
    'UPDATE arrangements SET status = ?, cancel_reason = ? WHERE id = ?',
    ['cancelled', '撤销排考创建', arr.id],
  )

  addAuditLog('revert_create', 'arrangement', arr.id, operatorId, '撤销排考创建')

  return `已撤销排考创建操作，排考（ID: ${arr.id}）已取消`
}

function isDatePassed(dateStr: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const examDate = new Date(dateStr)
  examDate.setHours(0, 0, 0, 0)
  return examDate < today
}

export default router
