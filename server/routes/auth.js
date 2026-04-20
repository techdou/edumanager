const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = 'edumanager-secret-key-2024';

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

// 学生注册
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
  db.run('INSERT INTO students (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  
  const token = jwt.sign({ username, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
  
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
  
  const token = jwt.sign({ id: student.id, username: student.username, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: student.username, role: 'student' });
});

module.exports = router;