const express = require('express');
const db = require('../db');
const router = express.Router();
const { optionalStudentAuth } = require('../middleware/studentAuth');
const { canAccessLecture } = require('../utils/permissions');
const { searchLectures } = require('../utils/searchIndex');

// GET /api/search?q=关键词
// 权限模型与讲义列表一致：管理员搜全部；学生搜 公开+所在班级可访问分类；未登录只搜公开
router.get('/', optionalStudentAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ q, results: [] });
  }

  if (q.length > 200) return res.status(400).json({ error: '关键词最多 200 字' });
  res.setHeader('Cache-Control', 'private, no-store');
  const cache = new Map();
  const mayAccess = lectureId => {
    if (!cache.has(lectureId)) {
      const lecture = db.get('SELECT category_id, is_public FROM lectures WHERE id = ?', [lectureId]);
      cache.set(lectureId, !!lecture && canAccessLecture(req.student?.id, lecture));
    }
    return cache.get(lectureId);
  };

  const results = searchLectures(q, mayAccess);
  res.json({ q, results });
});

module.exports = router;
