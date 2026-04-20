const jwt = require('jsonwebtoken');

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
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = adminAuth;
