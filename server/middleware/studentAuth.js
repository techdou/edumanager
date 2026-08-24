const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

const JWT_SECRET = config.jwtSecret;

function studentAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('SELECT id, username, status, pwd_updated_at FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    if (!user || user.status === 'disabled') {
      return res.status(401).json({ error: '登录已过期' });
    }
    // 密码修改后旧 token 立即失效（iat 早于 pwd_updated_at 即拒绝）
    if (user.pwd_updated_at && decoded.iat && decoded.iat < user.pwd_updated_at) {
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
    const user = db.get('SELECT id, username, status, pwd_updated_at FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    const valid = user
      && user.status !== 'disabled'
      && !(user.pwd_updated_at && decoded.iat && decoded.iat < user.pwd_updated_at);
    req.student = valid
      ? { id: decoded.id, username: decoded.username, role: decoded.role }
      : null;
  } catch {
    req.student = null;
  }
  next();
}

module.exports = { studentAuth, optionalStudentAuth };
