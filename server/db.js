/**
 * 数据库层（better-sqlite3 实现）。
 *
 * 相比旧的 sql.js 实现：
 * - 原生 SQLite，崩溃自动恢复（WAL），不再有"全量 export + 覆盖写"的丢数据风险
 * - 支持事务（transaction()），供多步写操作保证原子性
 * - 外键约束启用
 * - query/run/get 接口与旧实现完全兼容，routes 零改动
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

let db;

// ===== 规范化 Schema（取代旧版 ALTER TABLE 堆叠补字段的方式）=====
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
    last_login DATETIME,
    real_name TEXT,
    pwd_updated_at INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS lectures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    zip_name TEXT NOT NULL,
    category_id INTEGER,
    cover_path TEXT,
    description TEXT,
    layout_mode TEXT DEFAULT 'system',
    is_public INTEGER DEFAULT 0,
    scan_report TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecture_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    path TEXT NOT NULL,
    entry_file TEXT DEFAULT 'index.html',
    order_index INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    activity_type TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT,
    category_id INTEGER,
    source TEXT DEFAULT 'feishu',
    file_path TEXT,
    file_name TEXT,
    file_type TEXT,
    cover_path TEXT,
    is_featured INTEGER DEFAULT 1,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS group_students (
    group_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS group_category_permissions (
    group_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, category_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_progress (
    student_id INTEGER NOT NULL,
    lecture_slug TEXT NOT NULL,
    chapter_slug TEXT NOT NULL,
    lecture_title TEXT,
    chapter_title TEXT,
    progress INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, lecture_slug, chapter_slug)
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    lecture_slug TEXT NOT NULL,
    chapter_slug TEXT NOT NULL,
    content TEXT NOT NULL,
    anchor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category_id ON knowledge_docs(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_featured ON knowledge_docs(is_featured)`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_lecture_id ON chapters(lecture_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lectures_category_id ON lectures(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lectures_is_public ON lectures(is_public)`,
  `CREATE INDEX IF NOT EXISTS idx_user_progress_updated ON user_progress(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_student ON notes(student_id)`
];

// 初始化
function initDb() {
  try {
    db = new Database(config.dbPath);
    // WAL 模式：写不阻塞读，崩溃后自动恢复，无全量落盘风险
    db.pragma('journal_mode = WAL');
    // 正常 + FULL 同步：兼顾性能与数据安全（崩溃时损坏概率极低）
    db.pragma('synchronous = NORMAL');
    // 启用外键约束
    db.pragma('foreign_keys = ON');
    // 占用 busy 超时 5s，避免偶发锁冲突直接抛错
    db.pragma('busy_timeout = 5000');

    // 建 schema
    for (const sql of SCHEMA_STATEMENTS) {
      db.exec(sql);
    }

    // 迁移：老库补 pwd_updated_at 列（改密码后旧 token 失效用，unixepoch 秒）
    const studentCols = db.prepare('PRAGMA table_info(students)').all().map(col => col.name);
    if (!studentCols.includes('pwd_updated_at')) {
      db.exec('ALTER TABLE students ADD COLUMN pwd_updated_at INTEGER NOT NULL DEFAULT 0');
    }

    // 迁移：老库补 lectures.scan_report 列（上传内容安全扫描报告 JSON）
    const lectureCols = db.prepare('PRAGMA table_info(lectures)').all().map(col => col.name);
    if (!lectureCols.includes('scan_report')) {
      db.exec('ALTER TABLE lectures ADD COLUMN scan_report TEXT');
    }

    // 旧库迁移兼容：如果 admins 表里有数据但 students 表里没有对应记录，
    // 则插入（保持与旧 ensureSchema 一致的自愈逻辑）
    ensureAdminStudentSync();

    // 兜底：历史数据可能有 status 为空
    db.prepare("UPDATE students SET status = 'active' WHERE status IS NULL OR status = ''").run();

    logger.info({ dbPath: config.dbPath }, 'db_ready');
    return db;
  } catch (err) {
    logger.error({ err: err && err.stack ? err.stack : String(err) }, 'db_init_error');
    throw err;
  }
}

// 旧 ensureSchema 的等价逻辑：每个 admin 在 students 表里也应有对应记录
function ensureAdminStudentSync() {
  const admins = query('SELECT username, password_hash, created_at FROM admins');
  const insertStudent = db.prepare(`
    INSERT OR IGNORE INTO students (username, password_hash, status, created_at)
    VALUES (?, ?, 'active', ?)
  `);
  for (const admin of admins) {
    insertStudent.run(admin.username, admin.password_hash, admin.created_at);
  }
}

// ===== 与旧版兼容的查询接口 =====
// query: 返回行数组（SELECT）；对写操作返回 []（保持与旧版 sql.js 实现一致）
const WRITE_PREFIXES = ['INSERT', 'UPDATE', 'DELETE', 'ALTER', 'CREATE', 'DROP', 'REPLACE', 'TRUNCATE'];

function isWriteSql(sql) {
  const first = sql.trim().toUpperCase().match(/^[A-Z]+/);
  return first ? WRITE_PREFIXES.includes(first[0]) : false;
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (isWriteSql(sql)) {
    stmt.run(...params);
    return [];
  }
  return stmt.all(...params);
}

// run: 执行写操作，返回 { lastInsertRowid }
function run(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return { lastInsertRowid: result.lastInsertRowid };
}

// get: 返回单行或 null
function get(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

// ===== 新增能力：事务（供 P1-3 使用）=====
// 用法： db.transaction(() => { db.run(...); db.run(...); })()
function transaction(fn) {
  return db.transaction(fn)();
}

// 暴露底层 prepared statement（性能敏感场景）
function prepare(sql) {
  return db.prepare(sql);
}

// 关闭（优雅关闭时调用）
function close() {
  try {
    if (db) db.close();
    logger.info('db_closed');
  } catch (e) {
    logger.error({ err: String(e) }, 'db_close_error');
  }
}

// 在线备份（启动时调用一次，及手动触发）。
// better-sqlite3 的 db.backup() 是异步 API（返回 Promise）：
// 同步 try/catch 捕不到失败，必须 async/await，否则失败被误报为成功
async function backup(suffix = '') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(config.dataDir, `edumanager.db.backup${suffix}.${ts}`);
  try {
    await db.backup(backupPath);
    logger.info({ backupPath }, 'db_backup_done');
    return backupPath;
  } catch (e) {
    logger.error({ err: String(e) }, 'db_backup_error');
    return null;
  }
}

module.exports = {
  init: initDb,
  query,
  run,
  get,
  transaction,
  prepare,
  close,
  backup
};
