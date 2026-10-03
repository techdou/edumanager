const express = require('express');
const router = express.Router();
const db = require('../db');
const { studentAuth } = require('../middleware/studentAuth');
const { canAccessLecture } = require('../utils/permissions');
router.use((req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });

function accessibleChapter(studentId, lectureSlug, chapterSlug) {
  const lecture = db.get('SELECT id, is_public, category_id FROM lectures WHERE slug = ?', [lectureSlug]);
  return !!lecture && canAccessLecture(studentId, lecture)
    && !!db.get('SELECT id FROM chapters WHERE lecture_id = ? AND slug = ?', [lecture.id, chapterSlug]);
}


function getOwnedNote(id, studentId) {
  return db.get('SELECT * FROM notes WHERE id = ? AND student_id = ?', [id, studentId]);
}

// 当前用户在指定讲义/章节下的笔记；不传参数则返回全部（Profile 汇总用）
router.get('/', studentAuth, (req, res) => {
  const lectureSlug = String(req.query.lectureSlug || '').trim();
  const chapterSlug = String(req.query.chapterSlug || '').trim();

  let sql = 'SELECT id, lecture_slug, chapter_slug, content, anchor, created_at, updated_at FROM notes WHERE student_id = ?';
  const params = [req.student.id];
  if (lectureSlug) {
    sql += ' AND lecture_slug = ?';
    params.push(lectureSlug);
  }
  if (chapterSlug) {
    sql += ' AND chapter_slug = ?';
    params.push(chapterSlug);
  }
  sql += ' ORDER BY updated_at DESC LIMIT 200';
  const access = new Map();
  const notes = db.query(sql, params).filter(note => {
    const key = JSON.stringify([note.lecture_slug, note.chapter_slug]);
    if (!access.has(key)) access.set(key, accessibleChapter(req.student.id, note.lecture_slug, note.chapter_slug));
    return access.get(key);
  });
  res.json(notes);
});

// 创建笔记
router.post('/', studentAuth, (req, res) => {
  const lectureSlug = String(req.body.lectureSlug || '').trim();
  const chapterSlug = String(req.body.chapterSlug || '').trim();
  const content = String(req.body.content || '').trim();
  const anchor = String(req.body.anchor || '').trim() || null;

  if (typeof req.body.lectureSlug !== 'string' || typeof req.body.chapterSlug !== 'string' || typeof req.body.content !== 'string' || !lectureSlug || !chapterSlug || !content) {
    return res.status(400).json({ error: '讲义、章节和笔记内容必填' });
  }
  if (content.length > 5000) {
    return res.status(400).json({ error: '笔记内容过长（上限 5000 字）' });
  }

  if (lectureSlug.length > 100 || chapterSlug.length > 100 || (anchor && anchor.length > 500)) {
    return res.status(400).json({ error: '讲义、章节或定位信息过长' });
  }
  if (!accessibleChapter(req.student.id, lectureSlug, chapterSlug)) return res.status(403).json({ error: '没有该章节的访问权限' });

  const result = db.run(
    'INSERT INTO notes (student_id, lecture_slug, chapter_slug, content, anchor) VALUES (?, ?, ?, ?, ?)',
    [req.student.id, lectureSlug, chapterSlug, content, anchor]
  );
  const note = db.get('SELECT id, lecture_slug, chapter_slug, content, anchor, created_at, updated_at FROM notes WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(note);
});

// 修改笔记（仅本人）
router.put('/:id', studentAuth, (req, res) => {
  const note = getOwnedNote(req.params.id, req.student.id);
  if (!note) {
    return res.status(404).json({ error: '笔记不存在' });
  }
  if (!accessibleChapter(req.student.id, note.lecture_slug, note.chapter_slug)) return res.status(403).json({ error: '没有该章节的访问权限' });
  const content = String(req.body.content || '').trim();
  if (typeof req.body.content !== 'string' || !content) {
    return res.status(400).json({ error: '笔记内容不能为空' });
  }
  if (content.length > 5000) {
    return res.status(400).json({ error: '笔记内容过长（上限 5000 字）' });
  }
  db.run('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, note.id]);
  res.json(db.get('SELECT id, lecture_slug, chapter_slug, content, anchor, created_at, updated_at FROM notes WHERE id = ?', [note.id]));
});

// 删除笔记（仅本人）
router.delete('/:id', studentAuth, (req, res) => {
  const note = getOwnedNote(req.params.id, req.student.id);
  if (!note) {
    return res.status(404).json({ error: '笔记不存在' });
  }
  db.run('DELETE FROM notes WHERE id = ?', [note.id]);
  res.json({ success: true });
});

module.exports = router;
