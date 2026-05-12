const initSqlJs = require('sql.js');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let db;

// 初始化数据库
async function initDb() {
  const SQL = await initSqlJs();
  
  const dbPath = path.join(__dirname, '../data/edumanager.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    
    db.run(`
      CREATE TABLE admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE lectures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        zip_name TEXT NOT NULL,
        category_id INTEGER,
        cover_path TEXT,
        layout_mode TEXT DEFAULT 'system',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lecture_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        path TEXT NOT NULL,
        entry_file TEXT DEFAULT 'index.html',
        order_index INTEGER DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        activity_type TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE knowledge_docs (
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
  }

  ensureSchema();
  
  saveDb();
  return db;
}

function getTableColumns(table) {
  return query(`PRAGMA table_info(${table})`).map(column => column.name);
}

function ensureColumn(table, column, definition) {
  const columns = getTableColumns(table);
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function ensureSchema() {
  ensureColumn('students', 'email', 'email TEXT');
  ensureColumn('students', 'status', "status TEXT DEFAULT 'active'");
  ensureColumn('students', 'last_login', 'last_login DATETIME');
  ensureColumn('students', 'real_name', 'real_name TEXT');
  ensureColumn('lectures', 'cover_path', 'cover_path TEXT');
  ensureColumn('lectures', 'is_public', 'is_public INTEGER DEFAULT 0');
  ensureColumn('lectures', 'layout_mode', "layout_mode TEXT DEFAULT 'system'");
  ensureColumn('chapters', 'entry_file', "entry_file TEXT DEFAULT 'index.html'");

  db.run(`
    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      activity_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ensureColumn('knowledge_docs', 'file_path', 'file_path TEXT');
  ensureColumn('knowledge_docs', 'file_name', 'file_name TEXT');
  ensureColumn('knowledge_docs', 'file_type', 'file_type TEXT');
  ensureColumn('knowledge_docs', 'cover_path', 'cover_path TEXT');
  ensureColumn('knowledge_docs', 'is_public', 'is_public INTEGER DEFAULT 0');

  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS group_students (
      group_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, student_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS group_category_permissions (
      group_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, category_id)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category_id ON knowledge_docs(category_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_knowledge_docs_featured ON knowledge_docs(is_featured)');
  db.run("UPDATE students SET status = 'active' WHERE status IS NULL OR status = ''");

  const admins = query('SELECT username, password_hash, created_at FROM admins');
  admins.forEach(admin => {
    const student = get('SELECT id FROM students WHERE username = ?', [admin.username]);
    if (!student) {
      db.run(`
        INSERT INTO students (username, password_hash, status, created_at)
        VALUES (?, ?, 'active', ?)
      `, [admin.username, admin.password_hash, admin.created_at]);
    }
  });
}

// 保存数据库到文件
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = path.join(__dirname, '../data/edumanager.db');
  fs.writeFileSync(dbPath, buffer);
}

// 查询辅助函数
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  const op = sql.trim().toUpperCase().split(' ')[0];
  if (['INSERT', 'UPDATE', 'DELETE', 'ALTER'].includes(op)) saveDb();
  return results;
}

function run(sql, params = []) {
  db.run(sql, params);
  // Get last_insert_rowid BEFORE saveDb (saveDb resets it to 0 in sql.js)
  const lastId = query('SELECT last_insert_rowid() as id')[0].id;
  saveDb();
  return { lastInsertRowid: lastId };
}

function get(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

module.exports = {
  init: initDb,
  query,
  run,
  get
};
