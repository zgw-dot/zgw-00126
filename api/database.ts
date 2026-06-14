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
    role TEXT NOT NULL CHECK(role IN ('student','teacher','admin'))
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
`

const SEED_SQL = `
INSERT OR IGNORE INTO users (id, username, password, name, role) VALUES
    (1, 'admin', 'admin123', '教务管理员', 'admin'),
    (2, 'teacher1', 'teacher123', '张老师', 'teacher'),
    (3, 'student1', 'student123', '李同学', 'student'),
    (4, 'student2', 'student123', '王同学', 'student'),
    (5, 'student3', 'student123', '赵同学', 'student');

INSERT OR IGNORE INTO courses (id, name, code, semester, teacher_id) VALUES
    (1, '高等数学', 'MATH101', '2025-2026-1', 2),
    (2, '大学英语', 'ENG101', '2025-2026-1', 2),
    (3, '数据结构', 'CS201', '2025-2026-1', 2);

INSERT OR IGNORE INTO threshold_config (id, score, updated_by) VALUES (1, 60, 1);

INSERT OR IGNORE INTO exam_rooms (id, name, capacity, location) VALUES
    (1, '第一考场', 30, '教学楼A101'),
    (2, '第二考场', 40, '教学楼A102'),
    (3, '第三考场', 50, '教学楼B201');

INSERT OR IGNORE INTO notification_config (event_type, enabled) VALUES
    ('application_approved', 1),
    ('application_rejected', 1),
    ('exam_scheduled', 1),
    ('qualification_cancelled', 1);
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
