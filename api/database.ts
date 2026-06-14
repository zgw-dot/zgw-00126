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
    db.run(SCHEMA_SQL)
    db.run(SEED_SQL)
    saveDB()
  }

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
    'SELECT score FROM threshold_config ORDER BY updated_at DESC LIMIT 1',
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
