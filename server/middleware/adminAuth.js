const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'edumanager-default-secret';

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: '无管理员权限' });
    }
    const admin = db.get('SELECT id FROM admins WHERE username = ?', [decoded.username]);
    const user = db.get('SELECT id, status FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    if (!admin || !user || user.status === 'disabled') {
      return res.status(401).json({ error: '登录已过期' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = adminAuth;
