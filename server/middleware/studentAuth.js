const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { contentCookie } = require('../utils/contentSession');

function authenticate(req, allowContentCookie = false) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const cookie = !bearer && allowContentCookie ? contentCookie(req) : null;
  const token = bearer || cookie;
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch { return null; }
  if ((cookie && decoded.scope !== 'content') || (!cookie && decoded.scope)) return null;
  if (!Number.isInteger(decoded.id) || typeof decoded.username !== 'string') return null;
  // Database failures are server failures, not expired sessions.
  const user = db.get('SELECT * FROM students WHERE id = ? AND username = ?', [decoded.id, decoded.username]);
  if (!user || user.status !== 'active') return null;
  const loginIat = cookie ? decoded.login_iat ?? decoded.iat : decoded.iat;
  if (user.pwd_updated_at && (!Number.isFinite(loginIat) || loginIat < user.pwd_updated_at)) return null;
  const admin = db.get('SELECT id FROM admins WHERE username = ?', [user.username]);
  return { id: user.id, username: user.username, role: admin ? 'admin' : 'student', exp: decoded.exp, iat: loginIat };
}

function studentAuth(req, res, next) {
  req.student = authenticate(req);
  if (!req.student) return res.status(401).json({ error: '登录已失效，请重新登录' });
  next();
}

function optionalStudentAuth(req, res, next) {
  req.student = authenticate(req, true);
  next();
}

module.exports = { studentAuth, optionalStudentAuth };
