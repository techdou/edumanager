const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'edumanager-default-secret';

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
  
  const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({ token, username: admin.username, role: 'admin' });
});

// 学生注册（如果无管理员，自动成为管理员）
router.post('/student/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  
  const existing = db.get('SELECT id FROM students WHERE username = ?', [username]);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.run('INSERT INTO students (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  const studentId = result.lastInsertRowid;
  
  // 检查是否已有管理员
  const adminCount = db.query('SELECT id FROM admins');
  if (adminCount.length === 0) {
    // 第一个用户，自动成为管理员
    db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    const token = jwt.sign({ id: studentId, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username, role: 'admin' });
  }
  
  const token = jwt.sign({ id: studentId, username, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role: 'student' });
});

// 学生登录
router.post('/student/login', (req, res) => {
  const { username, password } = req.body;
  
  const student = db.get('SELECT * FROM students WHERE username = ?', [username]);
  
  if (!student) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  const valid = bcrypt.compareSync(password, student.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  // 检查是否也是管理员
  const admin = db.get('SELECT * FROM admins WHERE username = ?', [username]);
  const role = admin ? 'admin' : 'student';
  
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
  const result = db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  
  const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role: 'admin' });
});

module.exports = router;