const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

// Keep all administrator entry points on the same live-account checks.
function resolveAdminFromToken(token) {
  if (!token) return null;
  let decoded;
  try { decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); }
  catch { return null; }
  if (decoded.scope || decoded.role !== 'admin' || !Number.isInteger(decoded.id)
    || typeof decoded.username !== 'string') return null;
  const user = db.get('SELECT * FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
  if (!user || user.status !== 'active') return null;
  if (user.pwd_updated_at && (!Number.isFinite(decoded.iat) || decoded.iat < user.pwd_updated_at)) return null;
  if (!db.get('SELECT id FROM admins WHERE username = ?', [decoded.username])) return null;
  return decoded;
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: '未登录' });
  const admin = resolveAdminFromToken(token);
  if (!admin) return res.status(401).json({ error: '登录已过期' });
  req.admin = admin;
  next();
}

module.exports = adminAuth;
module.exports.resolveAdminFromToken = resolveAdminFromToken;
