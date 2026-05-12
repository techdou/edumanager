const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { studentAuth } = require('../middleware/studentAuth');
const { getStudentGroups, getAccessibleCategories } = require('../utils/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'edumanager-default-secret';

function logUserActivity(user, activityType, role, details = null) {
  if (!user) return;
  db.run(`
    INSERT INTO user_activity (user_id, username, role, activity_type, details)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, user.username, role, activityType, details]);
}

// 管理员登录
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  const admin = db.get('SELECT * FROM admins WHERE username = ?', [username]);
  
  if (!admin) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  let user = db.get('SELECT * FROM students WHERE username = ?', [admin.username]);
  if (!user) {
    const result = db.run(`
      INSERT INTO students (username, password_hash, status)
      VALUES (?, ?, 'active')
    `, [admin.username, admin.password_hash]);
    user = db.get('SELECT * FROM students WHERE id = ?', [result.lastInsertRowid]);
  }

  if (user.status === 'disabled') {
    return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
  }
  
  db.run('UPDATE students SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  logUserActivity(user, 'login', 'admin');
  
  const token = jwt.sign({ id: user.id, username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({ token, username: admin.username, role: 'admin' });
});

// 学生注册（如果无管理员，自动成为管理员）
router.post('/student/register', (req, res) => {
  const { username, password, email, real_name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }

  if (!real_name) {
    return res.status(400).json({ error: '真实姓名必填' });
  }

  const existing = db.get('SELECT id FROM students WHERE username = ?', [username]);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.run('INSERT INTO students (username, password_hash, email, real_name) VALUES (?, ?, ?, ?)', [username, passwordHash, email || null, real_name]);
  const studentId = result.lastInsertRowid;
  const student = db.get('SELECT * FROM students WHERE id = ?', [studentId]);

  // 检查是否已有管理员
  const adminCount = db.query('SELECT id FROM admins');
  if (adminCount.length === 0) {
    db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    logUserActivity(student, 'register', 'admin');
    const token = jwt.sign({ id: studentId, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username, role: 'admin', real_name });
  }

  logUserActivity(student, 'register', 'student');
  const token = jwt.sign({ id: studentId, username, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role: 'student', real_name });
});

// 学生登录
router.post('/student/login', (req, res) => {
  const { username, password } = req.body;
  
  const student = db.get('SELECT * FROM students WHERE username = ?', [username]);
  
  if (!student) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (student.status === 'disabled') {
    return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
  }
  
  const valid = bcrypt.compareSync(password, student.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  // 检查是否也是管理员
  const admin = db.get('SELECT * FROM admins WHERE username = ?', [username]);
  const role = admin ? 'admin' : 'student';

  db.run('UPDATE students SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [student.id]);
  logUserActivity(student, 'login', role);
  
  const token = jwt.sign({ id: student.id, username: student.username, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: student.username, role });
});

// 管理员注册（仅第一个）
router.post('/admin/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  
  const count = db.query('SELECT id FROM admins');
  if (count.length > 0) {
    return res.status(403).json({ error: '管理员账号已存在，无法重复注册' });
  }
  
  const passwordHash = bcrypt.hashSync(password, 10);
  const existingStudent = db.get('SELECT id FROM students WHERE username = ?', [username]);
  if (existingStudent) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  const result = db.run(`
    INSERT INTO students (username, password_hash, status)
    VALUES (?, ?, 'active')
  `, [username, passwordHash]);
  const adminUser = db.get('SELECT * FROM students WHERE id = ?', [result.lastInsertRowid]);
  logUserActivity(adminUser, 'register', 'admin');
  
  const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role: 'admin' });
});

// 学生个人资料
router.get('/student/profile', studentAuth, (req, res) => {
  const student = db.get('SELECT id, username, email, real_name, created_at FROM students WHERE id = ?', [req.student.id]);
  if (!student) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const groups = getStudentGroups(req.student.id);
  const accessibleCategories = getAccessibleCategories(req.student.id);
  const categoryNames = accessibleCategories.length > 0
    ? db.query(`SELECT id, name FROM categories WHERE id IN (${accessibleCategories.map(() => '?').join(',')})`, accessibleCategories)
    : [];

  res.json({ ...student, groups, accessibleCategories: categoryNames });
});

module.exports = router;
