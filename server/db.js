const initSqlJs = require('sql.js');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let db;

// 初始化数据库
async function initDb() {
  const SQL = await initSqlJs();
  
  const dbPath = path.join(__dirname, '../data/edumanager.db');
  
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
        order_index INTEGER DEFAULT 0
      )
    `);
    
  }
  
  saveDb();
  return db;
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
