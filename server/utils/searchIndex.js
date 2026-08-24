/**
 * 讲义全文搜索（SQLite FTS5）。
 *
 * 索引粒度：每章一行（chapter_slug 为空串的行代表讲义标题本身）。
 * tokenizer 用默认 unicode61：中文按字切分，MATCH 短语查询等价于子串匹配，
 * 无需外部分词器；英文按词匹配。
 *
 * 写入时机由应用层控制（上传/编辑/删除讲义时调用），
 * 因为索引内容来自 HTML 文件而非表字段，数据库触发器不适用。
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const logger = require('../logger');
const config = require('../config');

const lecturesRoot = config.lecturesDir;

const FTS_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS lectures_fts USING fts5(
    lecture_id UNINDEXED,
    chapter_slug UNINDEXED,
    chapter_title,
    content,
    tokenize = 'unicode61'
  )
`;

function ensureFtsTable() {
  db.query(FTS_DDL);
}

// HTML → 纯文本：去 script/style/标签，还原常见实体，压缩空白
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function readChapterText(chapterPath, entryFile) {
  try {
    const htmlPath = path.join(lecturesRoot, chapterPath, entryFile || 'index.html');
    if (!fs.existsSync(htmlPath)) return '';
    // 上限 2MB：防止异常巨大的 HTML 把内存和索引撑爆
    return stripHtml(fs.readFileSync(htmlPath, 'utf8').slice(0, 2 * 1024 * 1024));
  } catch {
    return '';
  }
}

/**
 * 重建单个讲义的索引行（先删旧行再插入，可重入）。
 * lectures 表需已有该讲义记录。
 */
function rebuildLectureIndex(lectureId) {
  const lecture = db.get('SELECT id, title FROM lectures WHERE id = ?', [lectureId]);
  if (!lecture) return;

  db.transaction(() => {
    db.run('DELETE FROM lectures_fts WHERE lecture_id = ?', [lectureId]);
    db.run('INSERT INTO lectures_fts (lecture_id, chapter_slug, chapter_title, content) VALUES (?, ?, ?, ?)',
      [lectureId, '', lecture.title, lecture.title]);
    const chapters = db.query('SELECT title, slug, path, entry_file FROM chapters WHERE lecture_id = ? ORDER BY order_index', [lectureId]);
    for (const chapter of chapters) {
      db.run('INSERT INTO lectures_fts (lecture_id, chapter_slug, chapter_title, content) VALUES (?, ?, ?, ?)',
        [lectureId, chapter.slug, chapter.title, `${chapter.title} ${readChapterText(chapter.path, chapter.entry_file)}`]);
    }
  });
}

function removeLectureIndex(lectureId) {
  db.run('DELETE FROM lectures_fts WHERE lecture_id = ?', [lectureId]);
}

/**
 * 全量重建（老库首次接入搜索时自动执行一次）。
 * 返回索引的讲义数。
 */
function rebuildAll() {
  const lectures = db.query('SELECT id FROM lectures');
  for (const lecture of lectures) {
    try {
      rebuildLectureIndex(lecture.id);
    } catch (err) {
      logger.error({ lectureId: lecture.id, err: String(err) }, 'fts_rebuild_lecture_error');
    }
  }
  logger.info({ count: lectures.length }, 'fts_rebuild_done');
  return lectures.length;
}

// 启动时：FTS 为空但库里有讲义 → 自动补建索引
function initSearchIndex() {
  ensureFtsTable();
  const ftsCount = db.get('SELECT COUNT(*) AS c FROM lectures_fts')?.c || 0;
  const lectureCount = db.get('SELECT COUNT(*) AS c FROM lectures')?.c || 0;
  if (lectureCount > 0 && Number(ftsCount) === 0) {
    rebuildAll();
  }
}

/**
 * 搜索。用户输入转成 FTS 短语查询（双引号包裹转义，空格连接为 AND），
 * 避免 FTS 语法字符（AND/OR/NEAR/* 等）导致查询报错。
 * @param {string} q 关键词
 * @param {(lectureId: number) => boolean} mayAccess 权限过滤（传入前已按学生/管理员算好）
 * @param {number} limit 最多返回讲义数
 */
function searchLectures(q, mayAccess, limit = 20) {
  const keywords = String(q || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.replace(/["]/g, ''))
    .filter(Boolean);
  if (keywords.length === 0) return [];

  const matchExpr = keywords.map(word => `"${word}"`).join(' ');
  let rows;
  try {
    rows = db.query(`
      SELECT lecture_id, chapter_slug, chapter_title,
             snippet(lectures_fts, 3, '「', '」', '…', 16) AS snippet,
             bm25(lectures_fts) AS rank
      FROM lectures_fts
      WHERE lectures_fts MATCH ?
      ORDER BY rank
      LIMIT 300
    `, [matchExpr]);
  } catch {
    return [];
  }

  // 按 lecture 聚合，每讲义最多 3 条命中章节；权限过滤
  const byLecture = new Map();
  for (const row of rows) {
    const lectureId = Number(row.lecture_id);
    if (byLecture.size >= limit && !byLecture.has(lectureId)) continue;
    if (!mayAccess(lectureId)) continue;
    if (!byLecture.has(lectureId)) {
      byLecture.set(lectureId, []);
    }
    const hits = byLecture.get(lectureId);
    if (hits.length < 3) {
      hits.push({
        chapter_slug: row.chapter_slug || null,
        chapter_title: row.chapter_title,
        snippet: row.snippet
      });
    }
  }

  const results = [];
  for (const [lectureId, hits] of byLecture) {
    const lecture = db.get(`
      SELECT l.id, l.title, l.slug, l.category_id, c.name AS category_name
      FROM lectures l LEFT JOIN categories c ON c.id = l.category_id
      WHERE l.id = ?
    `, [lectureId]);
    if (lecture) {
      results.push({ ...lecture, hits });
    }
  }
  return results.slice(0, limit);
}

module.exports = { initSearchIndex, rebuildLectureIndex, removeLectureIndex, searchLectures, stripHtml };
