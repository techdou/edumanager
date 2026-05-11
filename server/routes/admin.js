const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

router.use(adminAuth);

function parsePage(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 10, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeRole(role, fallback = 'student') {
  if (!role) return fallback;
  return role === 'admin' ? 'admin' : 'student';
}

function normalizeStatus(status, fallback = 'active') {
  if (!status) return fallback;
  return status === 'disabled' ? 'disabled' : 'active';
}

function getUserById(id) {
  return db.get(`
    SELECT s.id, s.username, s.email, s.status, s.last_login, s.created_at,
           CASE WHEN a.id IS NULL THEN 'student' ELSE 'admin' END AS role
    FROM students s
    LEFT JOIN admins a ON a.username = s.username
    WHERE s.id = ?
  `, [id]);
}

function activeAdminCount() {
  const row = db.get(`
    SELECT COUNT(*) AS count
    FROM students s
    INNER JOIN admins a ON a.username = s.username
    WHERE s.status = 'active'
  `);
  return Number(row?.count || 0);
}

function totalAdminCount() {
  const row = db.get('SELECT COUNT(*) AS count FROM admins');
  return Number(row?.count || 0);
}

function wouldRemoveLastAdmin(user, nextRole) {
  return user.role === 'admin' && nextRole !== 'admin' && totalAdminCount() <= 1;
}

function wouldRemoveLastActiveAdmin(user, nextRole, nextStatus) {
  if (user.role !== 'admin' || user.status !== 'active') return false;
  if (nextRole === 'admin' && nextStatus === 'active') return false;
  return activeAdminCount() <= 1;
}

function logActivity(user, activityType, role = user?.role || 'student', details = null) {
  if (!user) return;
  db.run(`
    INSERT INTO user_activity (user_id, username, role, activity_type, details)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, user.username, role, activityType, details]);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// 用户列表：分页、搜索、角色和状态筛选
router.get('/users', (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const search = String(req.query.search || '').trim();
  const role = req.query.role;
  const status = req.query.status;

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(s.username LIKE ? OR COALESCE(s.email, "") LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role === 'admin') {
    conditions.push('a.id IS NOT NULL');
  } else if (role === 'student') {
    conditions.push('a.id IS NULL');
  }

  if (status === 'active' || status === 'disabled') {
    conditions.push('s.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.get(`
    SELECT COUNT(*) AS total
    FROM students s
    LEFT JOIN admins a ON a.username = s.username
    ${whereClause}
  `, params);

  const items = db.query(`
    SELECT s.id, s.username, s.email, s.status, s.last_login, s.created_at,
           CASE WHEN a.id IS NULL THEN 'student' ELSE 'admin' END AS role
    FROM students s
    LEFT JOIN admins a ON a.username = s.username
    ${whereClause}
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset]);

  const total = Number(countRow?.total || 0);
  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
});

// 创建用户
router.post('/users', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const email = String(req.body.email || '').trim() || null;
  const role = normalizeRole(req.body.role);
  const status = normalizeStatus(req.body.status);

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }

  const existingStudent = db.get('SELECT id FROM students WHERE username = ?', [username]);
  const existingAdmin = db.get('SELECT id FROM admins WHERE username = ?', [username]);
  if (existingStudent || existingAdmin) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.run(`
    INSERT INTO students (username, password_hash, email, status)
    VALUES (?, ?, ?, ?)
  `, [username, passwordHash, email, status]);

  if (role === 'admin') {
    db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  }

  const user = getUserById(result.lastInsertRowid);
  logActivity(user, 'create_user', role, safeJson({ created_by: req.admin.username || req.admin.id }));
  res.status(201).json(user);
});

// 用户详情
router.get('/users/:id', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const activity = db.query(`
    SELECT id, activity_type, role, details, created_at
    FROM user_activity
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `, [user.id]);

  res.json({ ...user, recent_activity: activity });
});

// 编辑用户
router.put('/users/:id', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const username = req.body.username === undefined
    ? user.username
    : String(req.body.username || '').trim();
  const email = req.body.email === undefined
    ? user.email
    : String(req.body.email || '').trim() || null;
  const role = normalizeRole(req.body.role, user.role);
  const status = normalizeStatus(req.body.status, user.status);
  const password = req.body.password ? String(req.body.password) : '';

  if (!username) {
    return res.status(400).json({ error: '用户名必填' });
  }

  const duplicate = db.get('SELECT id FROM students WHERE username = ? AND id != ?', [username, user.id]);
  if (duplicate) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  if (wouldRemoveLastAdmin(user, role) || wouldRemoveLastActiveAdmin(user, role, status)) {
    return res.status(400).json({ error: '至少需要保留一个启用状态的管理员' });
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const studentHash = passwordHash || db.get('SELECT password_hash FROM students WHERE id = ?', [user.id]).password_hash;

  db.run(`
    UPDATE students
    SET username = ?, email = ?, status = ?${passwordHash ? ', password_hash = ?' : ''}
    WHERE id = ?
  `, passwordHash
    ? [username, email, status, passwordHash, user.id]
    : [username, email, status, user.id]);

  if (user.role === 'admin' && role === 'admin') {
    db.run('UPDATE admins SET username = ?, password_hash = ? WHERE username = ?', [username, studentHash, user.username]);
  } else if (user.role === 'admin' && role === 'student') {
    db.run('DELETE FROM admins WHERE username = ?', [user.username]);
  } else if (user.role === 'student' && role === 'admin') {
    db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, studentHash]);
  }

  const updated = getUserById(user.id);
  logActivity(updated, 'update_user', role, safeJson({ updated_by: req.admin.username || req.admin.id }));
  res.json(updated);
});

// 删除用户
router.delete('/users/:id', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (user.role === 'admin' && totalAdminCount() <= 1) {
    return res.status(400).json({ error: '至少需要保留一个启用状态的管理员' });
  }

  db.run('DELETE FROM admins WHERE username = ?', [user.username]);
  db.run('DELETE FROM students WHERE id = ?', [user.id]);
  logActivity(user, 'delete_user', user.role, safeJson({ deleted_by: req.admin.username || req.admin.id }));
  res.json({ success: true });
});

// 启用/禁用用户
router.put('/users/:id/toggle-status', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
  if (wouldRemoveLastActiveAdmin(user, user.role, nextStatus)) {
    return res.status(400).json({ error: '至少需要保留一个启用状态的管理员' });
  }

  db.run('UPDATE students SET status = ? WHERE id = ?', [nextStatus, user.id]);
  const updated = getUserById(user.id);
  logActivity(updated, nextStatus === 'active' ? 'enable_user' : 'disable_user', user.role);
  res.json(updated);
});

// 总览统计
router.get('/stats/overview', (req, res) => {
  const totalUsers = db.get('SELECT COUNT(*) AS count FROM students')?.count || 0;
  const todayNewUsers = db.get(`
    SELECT COUNT(*) AS count
    FROM students
    WHERE date(created_at) = date('now')
  `)?.count || 0;
  const totalLectures = db.get('SELECT COUNT(*) AS count FROM lectures')?.count || 0;
  const totalCategories = db.get('SELECT COUNT(*) AS count FROM categories')?.count || 0;
  const disabledUsers = db.get("SELECT COUNT(*) AS count FROM students WHERE status = 'disabled'")?.count || 0;

  res.json({
    totalUsers,
    todayNewUsers,
    totalLectures,
    totalCategories,
    disabledUsers
  });
});

// 最近 7 天注册趋势
router.get('/stats/registrations', (req, res) => {
  const rows = db.query(`
    SELECT date(created_at) AS date, COUNT(*) AS count
    FROM students
    WHERE date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
  `);
  const countsByDate = new Map(rows.map(row => [row.date, Number(row.count)]));
  const trend = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
    trend.push({ date: key, count: countsByDate.get(key) || 0 });
  }

  res.json(trend);
});

// 活跃用户统计
router.get('/stats/active-users', (req, res) => {
  const activeToday = db.get(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM user_activity
    WHERE activity_type = 'login' AND date(created_at) = date('now')
  `)?.count || 0;
  const active7Days = db.get(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM user_activity
    WHERE activity_type = 'login' AND datetime(created_at) >= datetime('now', '-6 days')
  `)?.count || 0;
  const recentLogins = db.query(`
    SELECT user_id, username, role, created_at
    FROM user_activity
    WHERE activity_type = 'login'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  const dailyRows = db.query(`
    SELECT date(created_at) AS date, COUNT(DISTINCT user_id) AS count
    FROM user_activity
    WHERE activity_type = 'login'
      AND date(created_at) >= date('now', '-29 days')
    GROUP BY date(created_at)
  `);

  res.json({
    activeToday,
    active7Days,
    recentLogins,
    daily: dailyRows.map(row => ({ date: row.date, count: Number(row.count) }))
  });
});

// 分类列表
router.get('/categories', (req, res) => {
  const categories = db.query(`
    SELECT c.id, c.name, c.created_at, COUNT(l.id) AS lecture_count
    FROM categories c
    LEFT JOIN lectures l ON l.category_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.json(categories);
});

// 创建分类
router.post('/categories', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: '分类名称必填' });
  }

  const existing = db.get('SELECT id FROM categories WHERE name = ?', [name]);
  if (existing) {
    return res.status(400).json({ error: '分类名称已存在' });
  }

  const result = db.run('INSERT INTO categories (name) VALUES (?)', [name]);
  const category = db.get('SELECT id, name, created_at, 0 AS lecture_count FROM categories WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(category);
});

// 更新分类
router.put('/categories/:id', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: '分类名称必填' });
  }

  const category = db.get('SELECT id FROM categories WHERE id = ?', [req.params.id]);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }

  const duplicate = db.get('SELECT id FROM categories WHERE name = ? AND id != ?', [name, req.params.id]);
  if (duplicate) {
    return res.status(400).json({ error: '分类名称已存在' });
  }

  db.run('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id]);
  const updated = db.get(`
    SELECT c.id, c.name, c.created_at, COUNT(l.id) AS lecture_count
    FROM categories c
    LEFT JOIN lectures l ON l.category_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `, [req.params.id]);
  res.json(updated);
});

// 删除分类
router.delete('/categories/:id', (req, res) => {
  const category = db.get('SELECT id FROM categories WHERE id = ?', [req.params.id]);
  if (!category) {
    return res.status(404).json({ error: '分类不存在' });
  }

  const lectures = db.query('SELECT id FROM lectures WHERE category_id = ?', [req.params.id]);
  if (lectures.length > 0) {
    return res.status(400).json({ error: '该分类下有讲义，无法删除' });
  }

  db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
