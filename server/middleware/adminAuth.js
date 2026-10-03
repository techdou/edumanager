const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

const JWT_SECRET = config.jwtSecret;

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
  if (decoded.scope) return res.status(401).json({ error: '请使用管理员登录凭证' });
  if (decoded.role !== 'admin') {
    return res.status(403).json({ error: '无管理员权限' });
  }
  const admin = db.get('SELECT id FROM admins WHERE username = ?', [decoded.username]);
  const user = db.get('SELECT id, status FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
  if (!admin || !user || user.status !== 'active') {
    return res.status(401).json({ error: '登录已过期' });
  }
  req.admin = decoded;
  next();
}

module.exports = adminAuth;
