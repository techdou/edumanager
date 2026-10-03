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
const config = require('./config');
const logger = require('./logger');
const { createBackup, acquireDataLock } = require('./utils/backup');

let db;
let releaseLock;
let backupInProgress = false;
let live = false;

// 新库基线；已有库通过下方有版本记录的迁移补齐。
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
  `CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category_id ON knowledge_docs(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_featured ON knowledge_docs(is_featured)`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_lecture_id ON chapters(lecture_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lectures_category_id ON lectures(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lectures_is_public ON lectures(is_public)`
];

// Each version is committed together with its ledger entry. Historical rows are never deleted.
const COMPATIBLE_COLUMNS = {
  admins: { created_at: 'DATETIME' },
  students: { email: 'TEXT', status: "TEXT DEFAULT 'active'", last_login: 'DATETIME', real_name: 'TEXT', created_at: 'DATETIME' },
  categories: { created_at: 'DATETIME' },
  lectures: { category_id: 'INTEGER', cover_path: 'TEXT', description: 'TEXT', layout_mode: "TEXT DEFAULT 'system'", is_public: 'INTEGER DEFAULT 0', created_at: 'DATETIME' },
  chapters: { entry_file: "TEXT DEFAULT 'index.html'", order_index: 'INTEGER DEFAULT 0' },
  user_activity: { user_id: 'INTEGER', role: "TEXT DEFAULT 'student'", details: 'TEXT', created_at: 'DATETIME' },
  knowledge_docs: { summary: 'TEXT', category_id: 'INTEGER', source: "TEXT DEFAULT 'feishu'", file_path: 'TEXT', file_name: 'TEXT', file_type: 'TEXT', cover_path: 'TEXT', is_featured: 'INTEGER DEFAULT 1', is_public: 'INTEGER DEFAULT 0', created_at: 'DATETIME', updated_at: 'DATETIME' },
  groups: { description: 'TEXT', created_at: 'DATETIME' }
};

const MIGRATIONS = [
  { version: 1, name: 'baseline_and_legacy_columns', apply(database) {
    for (const sql of SCHEMA_STATEMENTS.filter(sql => sql.startsWith('CREATE TABLE'))) database.exec(sql);
    for (const [table, columns] of Object.entries(COMPATIBLE_COLUMNS)) {
      const existing = new Set(database.pragma(`table_info(${table})`).map(column => column.name));
      for (const [column, definition] of Object.entries(columns)) {
        if (!existing.has(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
    for (const sql of SCHEMA_STATEMENTS.filter(sql => sql.startsWith('CREATE INDEX'))) database.exec(sql);
    database.exec("UPDATE students SET status = 'active' WHERE status IS NULL OR status = ''");
    database.exec(`INSERT OR IGNORE INTO students (username, password_hash, status, created_at)
      SELECT username, password_hash, 'active', COALESCE(created_at, CURRENT_TIMESTAMP) FROM admins`);
  } },
  { version: 2, name: 'account_learning_progress', apply(database) {
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_id_lecture ON chapters(id, lecture_id)`);
    database.exec(`CREATE TABLE student_progress (
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
      chapter_id INTEGER NOT NULL,
      position REAL NOT NULL DEFAULT 0 CHECK(position >= 0 AND position <= 100),
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, lecture_id, chapter_id),
      FOREIGN KEY (chapter_id, lecture_id) REFERENCES chapters(id, lecture_id) ON DELETE CASCADE
    )`);
    database.exec('CREATE INDEX idx_student_progress_updated ON student_progress(student_id, updated_at)');
  } }
];

function migrate(database) {
  database.transaction(() => {
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = new Set(database.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
    if ([...applied].some(version => version > MIGRATIONS.at(-1).version)) throw new Error('数据库版本高于当前程序，拒绝降级启动');
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      migration.apply(database);
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    }
  })();
}

// Report old relationships without silently removing user data or adding invalid constraints.
function audit(database) {
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  const relationships = [
    ['chapters', 'lecture_id', 'lectures'], ['lectures', 'category_id', 'categories'],
    ['knowledge_docs', 'category_id', 'categories'], ['group_students', 'group_id', 'groups'],
    ['group_students', 'student_id', 'students'], ['group_category_permissions', 'group_id', 'groups'],
    ['group_category_permissions', 'category_id', 'categories']
  ];
  const orphaned = [];
  for (const [child, column, parent] of relationships) {
    if (!tables.has(child) || !tables.has(parent) || !database.pragma(`table_info(${child})`).some(field => field.name === column)) continue;
    const count = database.prepare(`SELECT COUNT(*) AS count FROM ${child} c LEFT JOIN ${parent} p ON c.${column} = p.id WHERE c.${column} IS NOT NULL AND p.id IS NULL`).get().count;
    if (count) orphaned.push({ table: child, column, count });
  }
  return {
    integrity: database.pragma('integrity_check'),
    foreignKeyViolations: database.pragma('foreign_key_check'),
    orphaned,
    migrations: tables.has('schema_migrations') ? database.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all() : []
  };
}

function initDb() {
  if (db?.open) return db;
  try {
    releaseLock = acquireDataLock(config.dataDir);
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    const report = audit(db);
    if (report.integrity.some(row => row.integrity_check !== 'ok') || report.foreignKeyViolations.length) {
      throw new Error('数据库完整性校验失败，请运行迁移审计并从已验证备份恢复');
    }
    if (report.orphaned.length) logger.warn({ orphaned: report.orphaned }, 'db_legacy_orphans_detected');
    live = false;
    logger.info({ dbPath: config.dbPath }, 'db_ready');
    return db;
  } catch (err) {
    if (db?.open) db.close();
    if (releaseLock) { releaseLock(); releaseLock = null; }
    logger.error({ err: err.stack || String(err) }, 'db_init_error');
    throw err;
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
  if (backupInProgress && isWriteSql(sql)) throw new Error('备份过程中禁止写数据库');
  const stmt = db.prepare(sql);
  if (isWriteSql(sql)) {
    stmt.run(...params);
    return [];
  }
  return stmt.all(...params);
}

// run: 执行写操作，返回 { lastInsertRowid }
function run(sql, params = []) {
  if (backupInProgress) throw new Error('备份过程中禁止写数据库');
  const result = db.prepare(sql).run(...params);
  return { lastInsertRowid: result.lastInsertRowid };
}

// get: 返回单行或 null
function get(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

// 同步事务：db.transaction(() => { db.run(...); db.run(...); })
function transaction(fn) {
  if (backupInProgress) throw new Error('备份过程中禁止写数据库');
  return db.transaction(fn)();
}

// 暴露底层 prepared statement（性能敏感场景）
function prepare(sql) {
  return db.prepare(sql);
}

// The server marks the database live immediately before listen, preventing unsafe in-process backups.
function markLive() { live = true; }

function close() {
  if (backupInProgress) throw new Error('备份尚未完成，不能关闭数据库');
  if (db?.open) db.close();
  if (releaseLock) { releaseLock(); releaseLock = null; }
  live = false;
  logger.info('db_closed');
}

async function backup(suffix = '') {
  if (!db?.open) throw new Error('数据库尚未初始化');
  if (live) throw new Error('完整备份需要先停止服务');
  if (backupInProgress) throw new Error('已有备份正在执行');
  backupInProgress = true;
  try {
    const backupPath = await createBackup(db, config, suffix);
    logger.info({ backupPath }, 'db_backup_done');
    return backupPath;
  } catch (error) {
    logger.error({ err: error.message }, 'db_backup_error');
    throw error;
  } finally {
    backupInProgress = false;
  }
}

module.exports = {
  init: initDb,
  query, run, get, transaction, prepare, close, backup, markLive,
  migrate, audit
};
