const express = require('express');
const db = require('../db');
const { studentAuth } = require('../middleware/studentAuth');
const { canAccessLecture, filterAccessibleLectures } = require('../utils/permissions');

const router = express.Router();
router.use(studentAuth);
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const SELECT_PROGRESS = `
  SELECT p.lecture_id, p.chapter_id, p.position, p.completed, p.updated_at,
    l.slug AS lectureSlug, c.slug AS chapterSlug, l.title AS lectureTitle, c.title AS chapterTitle,
    l.category_id, l.is_public
  FROM student_progress p JOIN lectures l ON l.id = p.lecture_id
  JOIN chapters c ON c.id = p.chapter_id AND c.lecture_id = l.id
`;

function serialize(row) {
  const { category_id, is_public, ...progress } = row;
  return { ...progress, completed: !!progress.completed };
}

router.get('/', (req, res) => {
  const rows = db.query(`${SELECT_PROGRESS} WHERE p.student_id = ? ORDER BY p.updated_at DESC, p.chapter_id DESC`, [req.student.id]);
  res.json(filterAccessibleLectures(req.student.id, rows).map(serialize));
});

router.put('/:lectureId/:chapterId', (req, res) => {
  const lectureId = Number(req.params.lectureId);
  const chapterId = Number(req.params.chapterId);
  const { position, completed } = req.body;
  if (!Number.isSafeInteger(lectureId) || !Number.isSafeInteger(chapterId) || lectureId < 1 || chapterId < 1
    || typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 100
    || (completed !== undefined && typeof completed !== 'boolean')) {
    return res.status(400).json({ error: '学习位置应为 0 至 100，完成状态应为布尔值' });
  }
  const lecture = db.get('SELECT id, category_id, is_public FROM lectures WHERE id = ?', [lectureId]);
  const chapter = db.get('SELECT id FROM chapters WHERE id = ? AND lecture_id = ?', [chapterId, lectureId]);
  if (!lecture || !chapter) return res.status(404).json({ error: '讲义或章节不存在' });
  if (!canAccessLecture(req.student.id, lecture)) return res.status(403).json({ error: '没有该讲义的学习权限' });
  db.run(`INSERT INTO student_progress (student_id, lecture_id, chapter_id, position, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(student_id, lecture_id, chapter_id) DO UPDATE SET
      position = excluded.position,
      completed = CASE WHEN ? THEN excluded.completed ELSE student_progress.completed END,
      updated_at = excluded.updated_at`,
  [req.student.id, lectureId, chapterId, position, completed ? 1 : 0, completed !== undefined ? 1 : 0]);
  res.json(serialize(db.get(`${SELECT_PROGRESS} WHERE p.student_id = ? AND p.lecture_id = ? AND p.chapter_id = ?`, [req.student.id, lectureId, chapterId])));
});

module.exports = router;
