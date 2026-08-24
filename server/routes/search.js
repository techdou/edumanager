const express = require('express');
const db = require('../db');
const router = express.Router();
const { optionalStudentAuth } = require('../middleware/studentAuth');
const { resolveAdminFromToken } = require('../middleware/adminAuth');
const { getAccessibleCategories } = require('../utils/permissions');
const { searchLectures } = require('../utils/searchIndex');

// GET /api/search?q=关键词
// 权限模型与讲义列表一致：管理员搜全部；学生搜 公开+所在班级可访问分类；未登录只搜公开
router.get('/', optionalStudentAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ q, results: [] });
  }

  const admin = resolveAdminFromToken(req.headers.authorization?.replace('Bearer ', ''));
  let mayAccess;
  if (admin) {
    mayAccess = () => true;
  } else {
    const accessibleCategories = req.student ? getAccessibleCategories(req.student.id) : null;
    const cache = new Map();
    mayAccess = (lectureId) => {
      if (cache.has(lectureId)) return cache.get(lectureId);
      const lecture = db.get('SELECT category_id, is_public FROM lectures WHERE id = ?', [lectureId]);
      const ok = !!lecture && (
        lecture.is_public === 1
        || (accessibleCategories && accessibleCategories.includes(lecture.category_id))
      );
      cache.set(lectureId, ok);
      return ok;
    };
  }

  const results = searchLectures(q, mayAccess);
  res.json({ q, results });
});

module.exports = router;
