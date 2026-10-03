const jwt = require('jsonwebtoken');
const config = require('../config');

const COOKIE_NAME = 'edumanager_content';
const COOKIE_PATHS = ['/lectures', '/api/knowledge', '/api/lectures'];

function contentCookie(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return null;
  const url = (req.originalUrl || req.url).split('?')[0];
  if (!COOKIE_PATHS.some(prefix => url === prefix || url.startsWith(`${prefix}/`))) return null;
  const item = (req.headers.cookie || '').split(';').find(value => value.trim().startsWith(`${COOKIE_NAME}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.trim().slice(COOKIE_NAME.length + 1)); } catch { return null; }
}

function cookieOptions(path) {
  // Opaque lecture frames need SameSite=None subresource cookies. The frame's
  // allow-same-site-none-cookies policy keeps this read-only session usable.
  return { path, httpOnly: true, sameSite: path === '/lectures' ? 'none' : 'strict', secure: true };
}

function issueContentSession(req, res) {
  // A content credential can only read files, never authenticate a write API.
  const remaining = Math.min(1800, req.student.exp - Math.floor(Date.now() / 1000));
  if (remaining <= 0) return res.status(401).json({ error: '登录已失效，请重新登录' });
  const token = jwt.sign({ id: req.student.id, username: req.student.username, scope: 'content' }, config.jwtSecret, { expiresIn: remaining });
  for (const path of COOKIE_PATHS) res.cookie(COOKIE_NAME, token, { ...cookieOptions(path), maxAge: remaining * 1000 });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ expiresAt: Date.now() + remaining * 1000 });
}

function clearContentSession(req, res) {
  for (const path of COOKIE_PATHS) res.clearCookie(COOKIE_NAME, cookieOptions(path));
  res.json({ success: true });
}

module.exports = { contentCookie, issueContentSession, clearContentSession };
