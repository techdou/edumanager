const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'edumanager-default-secret';

function studentAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('SELECT id, username, status FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    if (!user || user.status === 'disabled') {
      return res.status(401).json({ error: '登录已过期' });
    }
    req.student = { id: decoded.id, username: decoded.username, role: decoded.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function optionalStudentAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;
  if (!token) {
    req.student = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('SELECT id, username, status FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    if (!user || user.status === 'disabled') {
      req.student = null;
    } else {
      req.student = { id: decoded.id, username: decoded.username, role: decoded.role };
    }
  } catch {
    req.student = null;
  }
  next();
}

module.exports = { studentAuth, optionalStudentAuth };
