const express = require('express');
const router = express.Router();
const db = require('../db');
const { studentAuth } = require('../middleware/studentAuth');

// 上报阅读进度（Lecture 页节流调用）。upsert 语义：同一学生同一章节覆盖更新
router.post('/', studentAuth, (req, res) => {
  const lectureSlug = String(req.body.lectureSlug || '').trim();
  const chapterSlug = String(req.body.chapterSlug || '').trim();
  const lectureTitle = String(req.body.lectureTitle || '').trim() || null;
  const chapterTitle = String(req.body.chapterTitle || '').trim() || null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(req.body.progress) || 0)));

  if (!lectureSlug || !chapterSlug) {
    return res.status(400).json({ error: '缺少讲义或章节标识' });
  }

  db.run(`
    INSERT INTO user_progress (student_id, lecture_slug, chapter_slug, lecture_title, chapter_title, progress, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, lecture_slug, chapter_slug) DO UPDATE SET
      lecture_title = excluded.lecture_title,
      chapter_title = excluded.chapter_title,
      progress = excluded.progress,
      updated_at = CURRENT_TIMESTAMP
  `, [req.student.id, lectureSlug, chapterSlug, lectureTitle, chapterTitle, progress]);

  res.json({ success: true });
});

// 我的学习记录（最近 50 条），供 Profile / 学习中心远期切换到服务端数据
router.get('/mine', studentAuth, (req, res) => {
  const rows = db.query(`
    SELECT lecture_slug, chapter_slug, lecture_title, chapter_title, progress, updated_at
    FROM user_progress
    WHERE student_id = ?
    ORDER BY updated_at DESC
    LIMIT 50
  `, [req.student.id]);
  res.json(rows);
});

module.exports = router;
