const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');

const JWT_SECRET = config.jwtSecret;

/**
 * 从 Authorization token 解析有效管理员。
 * 校验与 adminAuth 完全一致：admins 表存在 + students 账号启用 + 密码未被修改（pwd_updated_at）。
 * 供需要"管理员旁路"的路由复用（如讲义/知识库列表），避免各自手写校验导致行为漂移。
 * 无效或非管理员 token 返回 null。
 */
function resolveAdminFromToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return null;
    const admin = db.get('SELECT id FROM admins WHERE username = ?', [decoded.username]);
    const user = db.get('SELECT id, username, status, pwd_updated_at FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
    if (!admin || !user || user.status === 'disabled') return null;
    if (user.pwd_updated_at && decoded.iat && decoded.iat < user.pwd_updated_at) return null;
    return decoded;
  } catch {
    return null;
  }
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  const admin = resolveAdminFromToken(token);
  if (!admin) {
    return res.status(401).json({ error: '登录已过期' });
  }
  req.admin = admin;
  next();
}

module.exports = adminAuth;
module.exports.resolveAdminFromToken = resolveAdminFromToken;
