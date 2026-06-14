import initSqlJs, { type Database } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = path.resolve(__dirname, '..', 'data', 'db.sqlite')

let db: Database | null = null

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')),
    grade TEXT,
    class_no TEXT
);

CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    semester TEXT NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    score REAL NOT NULL,
    UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS qualifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    qualified INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'auto',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','overridden')),
    reason TEXT,
    overridden_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    qualification_id INTEGER NOT NULL REFERENCES qualifications(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
    reject_reason TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arrangements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    exam_room_id INTEGER NOT NULL REFERENCES exam_rooms(id),
    exam_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
    cancel_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS arrangement_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    exam_room_id INTEGER NOT NULL REFERENCES exam_rooms(id),
    exam_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS threshold_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score REAL NOT NULL,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operation_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    snapshot_data TEXT NOT NULL,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    reverted INTEGER NOT NULL DEFAULT 0,
    reverted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    related_entity_type TEXT,
    related_entity_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS draft_undo_stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK(action IN ('add','update','delete','clear','batch_add')),
    undo_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    semester TEXT NOT NULL,
    exam_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stat_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade TEXT NOT NULL,
    subject_ids TEXT NOT NULL,
    semester TEXT NOT NULL,
    score_ranges TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stat_report_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES stat_reports(id),
    subject_id INTEGER NOT NULL REFERENCES courses(id),
    average_score REAL NOT NULL,
    pass_rate REAL NOT NULL,
    score_distribution TEXT NOT NULL,
    below_threshold INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stat_report_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES stat_reports(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER NOT NULL REFERENCES courses(id),
    current_score REAL NOT NULL,
    previous_score REAL,
    score_change REAL,
    class_rank INTEGER,
    grade_rank INTEGER,
    previous_class_rank INTEGER,
    previous_grade_rank INTEGER,
    rank_change TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const SEED_SQL = `
INSERT OR IGNORE INTO users (id, username, password, name, role, grade, class_no) VALUES
    (1, 'admin', 'admin123', '教务管理员', 'admin', NULL, NULL),
    (2, 'teacher1', 'teacher123', '张老师', 'teacher', NULL, NULL),
    (3, 'student1', 'student123', '李同学', 'student', '2023级', '1班'),
    (4, 'student2', 'student123', '王同学', 'student', '2023级', '1班'),
    (5, 'student3', 'student123', '赵同学', 'student', '2023级', '2班'),
    (6, 'student4', 'student123', '钱同学', 'student', '2023级', '2班'),
    (7, 'student5', 'student123', '孙同学', 'student', '2023级', '1班'),
    (8, 'student6', 'student123', '周同学', 'student', '2024级', '1班'),
    (9, 'student7', 'student123', '吴同学', 'student', '2024级', '1班'),
    (10, 'student8', 'student123', '郑同学', 'student', '2024级', '2班');

INSERT OR IGNORE INTO courses (id, name, code, semester, teacher_id) VALUES
    (1, '高等数学', 'MATH101', '2025-2026-1', 2),
    (2, '大学英语', 'ENG101', '2025-2026-1', 2),
    (3, '数据结构', 'CS201', '2025-2026-1', 2),
    (4, '高等数学', 'MATH101', '2024-2025-2', 2),
    (5, '大学英语', 'ENG101', '2024-2025-2', 2),
    (6, '高等数学', 'MATH101', '2024-2025-1', 2),
    (7, '大学英语', 'ENG101', '2024-2025-1', 2);

INSERT OR IGNORE INTO grades (student_id, course_id, score) VALUES
    (3, 1, 85), (3, 2, 78), (3, 3, 92),
    (3, 4, 82), (3, 5, 75),
    (3, 6, 78), (3, 7, 72),
    (4, 1, 56), (4, 2, 62), (4, 3, 48),
    (4, 4, 58), (4, 5, 60),
    (4, 6, 55), (4, 7, 58),
    (5, 1, 72), (5, 2, 88), (5, 3, 65),
    (5, 4, 70), (5, 5, 85),
    (5, 6, 68), (5, 7, 82),
    (6, 1, 90), (6, 2, 85), (6, 3, 88),
    (6, 4, 88), (6, 5, 82),
    (6, 6, 85), (6, 7, 80),
    (7, 1, 45), (7, 2, 52), (7, 3, 58),
    (7, 4, 48), (7, 5, 55),
    (7, 6, 42), (7, 7, 50),
    (8, 1, 75), (8, 2, 80), (8, 3, 70),
    (9, 1, 65), (9, 2, 70), (9, 3, 60),
    (10, 1, 88), (10, 2, 92), (10, 3, 85);

INSERT OR IGNORE INTO threshold_config (id, score, updated_by) VALUES (1, 60, 1);

INSERT OR IGNORE INTO exam_rooms (id, name, capacity, location) VALUES
    (1, '第一考场', 30, '教学楼A101'),
    (2, '第二考场', 40, '教学楼A102'),
    (3, '第三考场', 50, '教学楼B201');

INSERT OR IGNORE INTO notification_config (event_type, enabled) VALUES
    ('application_approved', 1),
    ('application_rejected', 1),
    ('exam_scheduled', 1),
    ('qualification_cancelled', 1),
    ('low_score_alert', 1);
`

export function saveDB(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(DB_PATH, buffer)
}

export async function initDB(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()

  const dir = path.dirname(DB_PATH)
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    db = new SQL.Database()
  }

  db.run(SCHEMA_SQL)
  db.run(SEED_SQL)
  saveDB()

  return db
}

export function getDB(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.')
  }
  return db
}

export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T[] {
  const database = getDB()
  const stmt = database.prepare(sql)
  stmt.bind(params as (string | number | null | Uint8Array)[])
  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T | null {
  const results = queryAll<T>(sql, params)
  return results.length > 0 ? results[0] : null
}

export function run(sql: string, params: unknown[] = []): void {
  const database = getDB()
  database.run(sql, params as (string | number | null | Uint8Array)[])
  saveDB()
}

export function getThreshold(): number {
  const row = queryOne<{ score: number }>(
    'SELECT score FROM threshold_config ORDER BY id DESC LIMIT 1',
  )
  return row ? row.score : 60
}

export function recalculateQualifications(): void {
  const threshold = getThreshold()
  const database = getDB()

  const existing = queryAll<{
    student_id: number
    course_id: number
  }>('SELECT student_id, course_id FROM qualifications WHERE source = ? AND status = ?', ['auto', 'active'])

  const existingSet = new Set(
    existing.map((r) => `${r.student_id}-${r.course_id}`),
  )

  const grades = queryAll<{
    student_id: number
    course_id: number
    score: number
  }>('SELECT student_id, course_id, score FROM grades')

  const stmt = database.prepare(
    'INSERT INTO qualifications (student_id, course_id, qualified, source, status) VALUES (?, ?, ?, ?, ?)',
  )

  for (const grade of grades) {
    const key = `${grade.student_id}-${grade.course_id}`
    if (existingSet.has(key)) {
      database.run(
        'UPDATE qualifications SET qualified = ?, updated_at = datetime(\'now\') WHERE student_id = ? AND course_id = ? AND source = ? AND status = ?',
        [grade.score < threshold ? 1 : 0, grade.student_id, grade.course_id, 'auto', 'active'],
      )
    } else {
      stmt.bind([
        grade.student_id,
        grade.course_id,
        grade.score < threshold ? 1 : 0,
        'auto',
        'active',
      ])
      stmt.step()
      stmt.reset()
    }
  }
  stmt.free()
  saveDB()
}

export function addAuditLog(
  action: string,
  entityType: string,
  entityId: number,
  operatorId: number,
  detail?: string,
): void {
  run(
    'INSERT INTO audit_log (action, entity_type, entity_id, operator_id, detail) VALUES (?, ?, ?, ?, ?)',
    [action, entityType, entityId, operatorId, detail || null],
  )
}

export function createSnapshot(
  operationType: string,
  targetType: string,
  targetId: number,
  snapshotData: Record<string, unknown>,
  operatorId: number,
): number {
  const database = getDB()
  database.run(
    'INSERT INTO operation_snapshots (operation_type, target_type, target_id, snapshot_data, operator_id) VALUES (?, ?, ?, ?, ?)',
    [operationType, targetType, targetId, JSON.stringify(snapshotData), operatorId],
  )
  const result = queryOne<{ id: number }>('SELECT last_insert_rowid() AS id')
  saveDB()
  return result?.id || 0
}

export function deleteOldSameDaySnapshots(operationType: string, operatorId: number): void {
  run(
    `DELETE FROM operation_snapshots
     WHERE operation_type = ?
       AND operator_id = ?
       AND reverted = 0
       AND DATE(created_at) = DATE('now')`,
    [operationType, operatorId],
  )
}

export function listSnapshots(
  limit = 20,
  offset = 0,
  operationType?: string,
  operatorId?: number,
): OperationSnapshot[] {
  let sql = `
    SELECT os.*, u.name AS operatorName
    FROM operation_snapshots os
    JOIN users u ON os.operator_id = u.id
    WHERE 1=1
  `
  const params: unknown[] = []

  if (operationType) {
    sql += ' AND os.operation_type = ?'
    params.push(operationType)
  }

  if (operatorId) {
    sql += ' AND os.operator_id = ?'
    params.push(operatorId)
  }

  sql += ' ORDER BY os.id DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const rows = queryAll<{
    id: number
    operation_type: string
    target_type: string
    target_id: number
    snapshot_data: string
    operator_id: number
    reverted: number
    reverted_at: string | null
    created_at: string
    operatorName: string
  }>(sql, params)

  return rows.map((row) => ({
    id: row.id,
    operationType: row.operation_type,
    targetType: row.target_type,
    targetId: row.target_id,
    snapshotData: JSON.parse(row.snapshot_data),
    operatorId: row.operator_id,
    reverted: row.reverted === 1,
    revertedAt: row.reverted_at || undefined,
    createdAt: row.created_at,
    operatorName: row.operatorName,
  }))
}

export function countSnapshots(operationType?: string, operatorId?: number): number {
  let sql = 'SELECT COUNT(*) AS cnt FROM operation_snapshots WHERE 1=1'
  const params: unknown[] = []

  if (operationType) {
    sql += ' AND operation_type = ?'
    params.push(operationType)
  }

  if (operatorId) {
    sql += ' AND operator_id = ?'
    params.push(operatorId)
  }

  const row = queryOne<{ cnt: number }>(sql, params)
  return row?.cnt || 0
}

export function getAllGrades(): Array<Record<string, unknown>> {
  return queryAll('SELECT * FROM grades')
}

export function getAllQualifications(): Array<Record<string, unknown>> {
  return queryAll('SELECT * FROM qualifications')
}

export function clearGrades(): void {
  run('DELETE FROM grades')
}

export function clearQualifications(): void {
  run('DELETE FROM qualifications')
}

export function bulkInsertGrades(grades: Array<{ student_id: number; course_id: number; score: number }>): void {
  const database = getDB()
  const stmt = database.prepare(
    'INSERT INTO grades (student_id, course_id, score) VALUES (?, ?, ?)',
  )
  for (const g of grades) {
    stmt.bind([g.student_id, g.course_id, g.score])
    stmt.step()
    stmt.reset()
  }
  stmt.free()
  saveDB()
}

export function bulkInsertQualifications(
  quals: Array<{
    student_id: number
    course_id: number
    qualified: number
    source: string
    status: string
    reason?: string | null
    overridden_by?: number | null
    created_at?: string
    updated_at?: string
  }>,
): void {
  const database = getDB()
  const stmt = database.prepare(
    `INSERT INTO qualifications
     (student_id, course_id, qualified, source, status, reason, overridden_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const q of quals) {
    stmt.bind([
      q.student_id,
      q.course_id,
      q.qualified,
      q.source,
      q.status,
      q.reason || null,
      q.overridden_by || null,
      q.created_at || new Date().toISOString(),
      q.updated_at || new Date().toISOString(),
    ])
    stmt.step()
    stmt.reset()
  }
  stmt.free()
  saveDB()
}

export interface OperationSnapshot {
  id: number
  operationType: string
  targetType: string
  targetId: number
  snapshotData: Record<string, unknown>
  operatorId: number
  reverted: boolean
  revertedAt?: string
  createdAt: string
  operatorName?: string
}

export function getSnapshotById(id: number): OperationSnapshot | null {
  const row = queryOne<{
    id: number
    operation_type: string
    target_type: string
    target_id: number
    snapshot_data: string
    operator_id: number
    reverted: number
    reverted_at: string | null
    created_at: string
  }>('SELECT * FROM operation_snapshots WHERE id = ?', [id])

  if (!row) return null

  return {
    id: row.id,
    operationType: row.operation_type,
    targetType: row.target_type,
    targetId: row.target_id,
    snapshotData: JSON.parse(row.snapshot_data),
    operatorId: row.operator_id,
    reverted: row.reverted === 1,
    revertedAt: row.reverted_at || undefined,
    createdAt: row.created_at,
  }
}

export function markSnapshotReverted(id: number): void {
  run(
    'UPDATE operation_snapshots SET reverted = 1, reverted_at = datetime(\'now\') WHERE id = ?',
    [id],
  )
}

export function buildSnapshotOperation(
  operationType: string,
  targetType: string,
  targetId: number,
  snapshotData: Record<string, unknown>,
  operatorId: number,
): { sql: string; params: unknown[] } {
  return {
    sql: 'INSERT INTO operation_snapshots (operation_type, target_type, target_id, snapshot_data, operator_id) VALUES (?, ?, ?, ?, ?)',
    params: [operationType, targetType, targetId, JSON.stringify(snapshotData), operatorId],
  }
}

export function buildAuditLogOperation(
  action: string,
  entityType: string,
  entityId: number,
  operatorId: number,
  detail?: string,
): { sql: string; params: unknown[] } {
  return {
    sql: 'INSERT INTO audit_log (action, entity_type, entity_id, operator_id, detail) VALUES (?, ?, ?, ?, ?)',
    params: [action, entityType, entityId, operatorId, detail || null],
  }
}

export function execTransaction(operations: Array<{ sql: string; params: unknown[] }>): void {
  const database = getDB()
  database.run('BEGIN TRANSACTION')
  try {
    for (const op of operations) {
      database.run(op.sql, op.params as (string | number | null | Uint8Array)[])
    }
    database.run('COMMIT')
    saveDB()
  } catch (e) {
    database.run('ROLLBACK')
    throw e
  }
}

export function isNotificationEnabled(eventType: string): boolean {
  const row = queryOne<{ enabled: number }>(
    'SELECT enabled FROM notification_config WHERE event_type = ?',
    [eventType],
  )
  return row ? row.enabled === 1 : true
}

export function createNotification(
  userId: number,
  eventType: 'application_approved' | 'application_rejected' | 'exam_scheduled' | 'qualification_cancelled',
  title: string,
  content: string,
  relatedEntityType?: string,
  relatedEntityId?: number,
): void {
  if (!isNotificationEnabled(eventType)) return
  run(
    'INSERT INTO notifications (user_id, title, content, type, related_entity_type, related_entity_id) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, title, content, eventType, relatedEntityType || null, relatedEntityId || null],
  )
}

export interface NotificationRow {
  id: number
  user_id: number
  title: string
  content: string
  type: string
  is_read: number
  related_entity_type: string | null
  related_entity_id: number | null
  created_at: string
}

export function listNotifications(userId: number): NotificationRow[] {
  return queryAll<NotificationRow>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC',
    [userId],
  )
}

export function getUnreadNotificationCount(userId: number): number {
  const row = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId],
  )
  return row?.cnt || 0
}

export function markNotificationRead(id: number, userId: number): void {
  run(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId],
  )
}

export function markAllNotificationsRead(userId: number): void {
  run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId],
  )
}

export function getNotificationConfig(): Array<{ eventType: string; enabled: boolean }> {
  const rows = queryAll<{ event_type: string; enabled: number }>(
    'SELECT event_type, enabled FROM notification_config',
  )
  return rows.map((r) => ({ eventType: r.event_type, enabled: r.enabled === 1 }))
}

export function updateNotificationConfig(eventType: string, enabled: boolean): void {
  run(
    'UPDATE notification_config SET enabled = ?, updated_at = datetime(\'now\') WHERE event_type = ?',
    [enabled ? 1 : 0, eventType],
  )
}

export type DraftUndoAction = 'add' | 'update' | 'delete' | 'clear' | 'batch_add'

export interface DraftUndoStackItem {
  id: number
  operatorId: number
  operatorName?: string
  action: DraftUndoAction
  undoData: Record<string, unknown>
  createdAt: string
}

export function pushDraftUndo(
  operatorId: number,
  action: DraftUndoAction,
  undoData: Record<string, unknown>,
): number {
  run(
    'INSERT INTO draft_undo_stack (operator_id, action, undo_data) VALUES (?, ?, ?)',
    [operatorId, action, JSON.stringify(undoData)],
  )
  const result = queryOne<{ id: number }>('SELECT last_insert_rowid() AS id')
  const stackCount = countDraftUndoStack(operatorId)
  if (stackCount > 20) {
    const excess = queryAll<{ id: number }>(
      'SELECT id FROM draft_undo_stack WHERE operator_id = ? ORDER BY id ASC LIMIT ?',
      [operatorId, stackCount - 20],
    )
    for (const row of excess) {
      run('DELETE FROM draft_undo_stack WHERE id = ?', [row.id])
    }
  }
  return result?.id || 0
}

export function popDraftUndo(operatorId: number): DraftUndoStackItem | null {
  const row = queryOne<{
    id: number
    operator_id: number
    action: string
    undo_data: string
    created_at: string
  }>(
    'SELECT * FROM draft_undo_stack WHERE operator_id = ? ORDER BY id DESC LIMIT 1',
    [operatorId],
  )
  if (!row) return null
  run('DELETE FROM draft_undo_stack WHERE id = ?', [row.id])
  return {
    id: row.id,
    operatorId: row.operator_id,
    action: row.action as DraftUndoAction,
    undoData: JSON.parse(row.undo_data),
    createdAt: row.created_at,
  }
}

export function listDraftUndoStack(operatorId: number, limit = 20): DraftUndoStackItem[] {
  const rows = queryAll<{
    id: number
    operator_id: number
    action: string
    undo_data: string
    created_at: string
    operatorName: string
  }>(
    `SELECT dus.*, u.name AS operatorName
     FROM draft_undo_stack dus
     JOIN users u ON dus.operator_id = u.id
     WHERE dus.operator_id = ?
     ORDER BY dus.id DESC
     LIMIT ?`,
    [operatorId, limit],
  )
  return rows.map((row) => ({
    id: row.id,
    operatorId: row.operator_id,
    operatorName: row.operatorName,
    action: row.action as DraftUndoAction,
    undoData: JSON.parse(row.undo_data),
    createdAt: row.created_at,
  }))
}

export function countDraftUndoStack(operatorId: number): number {
  const row = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM draft_undo_stack WHERE operator_id = ?',
    [operatorId],
  )
  return row?.cnt || 0
}

export function clearDraftUndoStack(operatorId?: number): void {
  if (operatorId !== undefined) {
    run('DELETE FROM draft_undo_stack WHERE operator_id = ?', [operatorId])
  } else {
    run('DELETE FROM draft_undo_stack')
  }
}

export interface ScoreRange {
  min: number
  max: number
  label: string
}

export interface CreateReportParams {
  name: string
  grade: string
  subjectIds: number[]
  semester: string
  scoreRanges: ScoreRange[]
  createdBy: number
}

export interface ReportSubjectData {
  subjectId: number
  subjectName: string
  averageScore: number
  passRate: number
  scoreDistribution: Record<string, number>
  belowThreshold: boolean
}

export interface ReportStudentData {
  studentId: number
  studentName: string
  grade: string
  classNo: string
  subjectId: number
  subjectName: string
  currentScore: number
  previousScore?: number
  scoreChange?: number
  classRank: number
  gradeRank: number
  previousClassRank?: number
  previousGradeRank?: number
  rankChange?: string
  changeMarker?: 'up' | 'down' | 'same'
}

export interface StatReport {
  id: number
  name: string
  grade: string
  subjectIds: number[]
  semester: string
  scoreRanges: ScoreRange[]
  createdBy: number
  createdAt: string
  creatorName?: string
  subjects?: ReportSubjectData[]
  students?: ReportStudentData[]
}

export function getGradesByGradeAndSubject(
  grade: string,
  subjectId: number,
  semester: string,
): Array<{
  student_id: number
  student_name: string
  class_no: string
  score: number
  course_id: number
  course_name: string
}> {
  return queryAll(`
    SELECT g.student_id, u.name AS student_name, u.class_no,
           g.score, g.course_id, c.name AS course_name
    FROM grades g
    JOIN users u ON g.student_id = u.id
    JOIN courses c ON g.course_id = c.id
    WHERE u.grade = ? AND g.course_id = ? AND c.semester = ?
  `, [grade, subjectId, semester])
}

export function getPreviousSemesterGrades(
  grade: string,
  subjectCode: string,
  currentSemester: string,
): Array<{
  student_id: number
  score: number
  semester: string
}> {
  return queryAll(`
    SELECT g.student_id, g.score, c.semester
    FROM grades g
    JOIN users u ON g.student_id = u.id
    JOIN courses c ON g.course_id = c.id
    WHERE u.grade = ? AND c.code = ? AND c.semester < ?
    ORDER BY c.semester DESC
  `, [grade, subjectCode, currentSemester])
}

export function createStatReport(params: CreateReportParams): number {
  const subjectIdsStr = JSON.stringify(params.subjectIds)
  const scoreRangesStr = JSON.stringify(params.scoreRanges)
  const database = getDB()

  database.run(
    'INSERT INTO stat_reports (name, grade, subject_ids, semester, score_ranges, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [params.name, params.grade, subjectIdsStr, params.semester, scoreRangesStr, params.createdBy],
  )

  const result = database.exec('SELECT last_insert_rowid() AS id')
  const id = result && result[0] && result[0].values[0] && result[0].values[0][0] as number
  saveDB()
  return id || 0
}

export function insertReportSubject(
  reportId: number,
  subjectId: number,
  averageScore: number,
  passRate: number,
  scoreDistribution: Record<string, number>,
  belowThreshold: boolean,
): void {
  run(
    'INSERT INTO stat_report_subjects (report_id, subject_id, average_score, pass_rate, score_distribution, below_threshold) VALUES (?, ?, ?, ?, ?, ?)',
    [
      reportId,
      subjectId,
      averageScore,
      passRate,
      JSON.stringify(scoreDistribution),
      belowThreshold ? 1 : 0,
    ],
  )
}

export function insertReportStudent(data: {
  reportId: number
  studentId: number
  subjectId: number
  currentScore: number
  previousScore?: number
  scoreChange?: number
  classRank: number
  gradeRank: number
  previousClassRank?: number
  previousGradeRank?: number
  rankChange?: string
}): void {
  run(
    `INSERT INTO stat_report_students
     (report_id, student_id, subject_id, current_score, previous_score, score_change,
      class_rank, grade_rank, previous_class_rank, previous_grade_rank, rank_change)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.reportId,
      data.studentId,
      data.subjectId,
      data.currentScore,
      data.previousScore ?? null,
      data.scoreChange ?? null,
      data.classRank,
      data.gradeRank,
      data.previousClassRank ?? null,
      data.previousGradeRank ?? null,
      data.rankChange ?? null,
    ],
  )
}

export function listStatReports(grade?: string): StatReport[] {
  let sql = `
    SELECT sr.*, u.name AS creator_name
    FROM stat_reports sr
    JOIN users u ON sr.created_by = u.id
    WHERE 1=1
  `
  const params: unknown[] = []

  if (grade) {
    sql += ' AND sr.grade = ?'
    params.push(grade)
  }

  sql += ' ORDER BY sr.created_at DESC'

  const rows = queryAll<{
    id: number
    name: string
    grade: string
    subject_ids: string
    semester: string
    score_ranges: string
    created_by: number
    created_at: string
    creator_name: string
  }>(sql, params)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grade: row.grade,
    subjectIds: JSON.parse(row.subject_ids),
    semester: row.semester,
    scoreRanges: JSON.parse(row.score_ranges),
    createdBy: row.created_by,
    createdAt: row.created_at,
    creatorName: row.creator_name,
  }))
}

export function getStatReport(reportId: number): StatReport | null {
  const reportRow = queryOne<{
    id: number
    name: string
    grade: string
    subject_ids: string
    semester: string
    score_ranges: string
    created_by: number
    created_at: string
  }>('SELECT * FROM stat_reports WHERE id = ?', [reportId])

  if (!reportRow) return null

  const subjectRows = queryAll<{
    id: number
    subject_id: number
    average_score: number
    pass_rate: number
    score_distribution: string
    below_threshold: number
  }>('SELECT * FROM stat_report_subjects WHERE report_id = ?', [reportId])

  const studentRows = queryAll<{
    id: number
    student_id: number
    subject_id: number
    current_score: number
    previous_score: number | null
    score_change: number | null
    class_rank: number
    grade_rank: number
    previous_class_rank: number | null
    previous_grade_rank: number | null
    rank_change: string | null
  }>('SELECT * FROM stat_report_students WHERE report_id = ?', [reportId])

  const subjects: ReportSubjectData[] = subjectRows.map((s) => {
    const course = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [s.subject_id])
    return {
      subjectId: s.subject_id,
      subjectName: course?.name || '',
      averageScore: s.average_score,
      passRate: s.pass_rate,
      scoreDistribution: JSON.parse(s.score_distribution),
      belowThreshold: s.below_threshold === 1,
    }
  })

  const studentMap = new Map<string, ReportStudentData>()
  for (const s of studentRows) {
    const student = queryOne<{ name: string; grade: string; class_no: string }>(
      'SELECT name, grade, class_no FROM users WHERE id = ?',
      [s.student_id],
    )
    const course = queryOne<{ name: string }>('SELECT name FROM courses WHERE id = ?', [s.subject_id])

    let changeMarker: 'up' | 'down' | 'same' | undefined
    if (s.score_change !== null) {
      if (s.score_change > 0) changeMarker = 'up'
      else if (s.score_change < 0) changeMarker = 'down'
      else changeMarker = 'same'
    }

    studentMap.set(`${s.student_id}-${s.subject_id}`, {
      studentId: s.student_id,
      studentName: student?.name || '',
      grade: student?.grade || '',
      classNo: student?.class_no || '',
      subjectId: s.subject_id,
      subjectName: course?.name || '',
      currentScore: s.current_score,
      previousScore: s.previous_score ?? undefined,
      scoreChange: s.score_change ?? undefined,
      classRank: s.class_rank,
      gradeRank: s.grade_rank,
      previousClassRank: s.previous_class_rank ?? undefined,
      previousGradeRank: s.previous_grade_rank ?? undefined,
      rankChange: s.rank_change ?? undefined,
      changeMarker,
    })
  }

  return {
    id: reportRow.id,
    name: reportRow.name,
    grade: reportRow.grade,
    subjectIds: JSON.parse(reportRow.subject_ids),
    semester: reportRow.semester,
    scoreRanges: JSON.parse(reportRow.score_ranges),
    createdBy: reportRow.created_by,
    createdAt: reportRow.created_at,
    subjects,
    students: Array.from(studentMap.values()),
  }
}

export function getStudentGradeHistory(
  studentId: number,
): Array<{
  courseId: number
  courseName: string
  courseCode: string
  semester: string
  score: number
  classRank?: number
  gradeRank?: number
}> {
  const grades = queryAll<{
    course_id: number
    course_name: string
    course_code: string
    semester: string
    score: number
    class_no: string
    grade: string
  }>(`
    SELECT g.course_id, c.name AS course_name, c.code AS course_code,
           c.semester, g.score, u.class_no, u.grade
    FROM grades g
    JOIN courses c ON g.course_id = c.id
    JOIN users u ON g.student_id = u.id
    WHERE g.student_id = ?
    ORDER BY c.semester DESC
  `, [studentId])

  return grades.map((g) => {
    const classRanks = queryAll<{ student_id: number; score: number }>(`
      SELECT g.student_id, g.score
      FROM grades g
      JOIN users u ON g.student_id = u.id
      WHERE g.course_id = ? AND u.class_no = ? AND u.grade = ?
      ORDER BY g.score DESC
    `, [g.course_id, g.class_no, g.grade])

    const gradeRanks = queryAll<{ student_id: number; score: number }>(`
      SELECT g.student_id, g.score
      FROM grades g
      JOIN users u ON g.student_id = u.id
      WHERE g.course_id = ? AND u.grade = ?
      ORDER BY g.score DESC
    `, [g.course_id, g.grade])

    const classRank = classRanks.findIndex((r) => r.student_id === studentId) + 1
    const gradeRank = gradeRanks.findIndex((r) => r.student_id === studentId) + 1

    return {
      courseId: g.course_id,
      courseName: g.course_name,
      courseCode: g.course_code,
      semester: g.semester,
      score: g.score,
      classRank: classRank || undefined,
      gradeRank: gradeRank || undefined,
    }
  })
}

export function getStudentsInGradeAndClass(
  grade: string,
  classNo?: string,
): Array<{ id: number; name: string; class_no: string }> {
  let sql = 'SELECT id, name, class_no FROM users WHERE role = ? AND grade = ?'
  const params: unknown[] = ['student', grade]

  if (classNo) {
    sql += ' AND class_no = ?'
    params.push(classNo)
  }

  return queryAll(sql, params)
}

export function bulkCreateNotification(
  userIds: number[],
  eventType: string,
  title: string,
  content: string,
  relatedEntityType?: string,
  relatedEntityId?: number,
): void {
  if (!isNotificationEnabled(eventType)) return

  for (const userId of userIds) {
    run(
      'INSERT INTO notifications (user_id, title, content, type, related_entity_type, related_entity_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title, content, eventType, relatedEntityType || null, relatedEntityId || null],
    )
  }
}

export function getDistinctGrades(): string[] {
  const rows = queryAll<{ grade: string }>(
    "SELECT DISTINCT grade FROM users WHERE grade IS NOT NULL AND role = 'student' ORDER BY grade DESC",
  )
  return rows.map((r) => r.grade)
}

export function getCoursesBySemester(semester: string): Array<{ id: number; name: string; code: string }> {
  return queryAll<{ id: number; name: string; code: string }>(
    'SELECT id, name, code FROM courses WHERE semester = ? ORDER BY name',
    [semester],
  )
}

export function getDistinctSemesters(): string[] {
  const rows = queryAll<{ semester: string }>(
    'SELECT DISTINCT semester FROM courses ORDER BY semester DESC',
  )
  return rows.map((r) => r.semester)
}
