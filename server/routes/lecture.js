const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const logger = require('../logger');
const config = require('../config');

// 管理员权限中间件（用于需要管理员的操作）
const adminAuth = require('../middleware/adminAuth');
const { studentAuth, optionalStudentAuth } = require('../middleware/studentAuth');

const { filterAccessibleLectures, canAccessLecture } = require('../utils/permissions');
const { extractTOC } = require('../utils/tocExtractor');
const { atomicWriteDir, assertWithin } = require('../utils/fs');
const { extractLectureContent, inspectUpload, validateUpload } = require('../utils/upload');
const { rebuildLectureIndex, removeLectureIndex } = require('../utils/searchIndex');
const { processLectureHtml } = require('../utils/sanitizer');

// ZIP 上传配置
const upload = multer({
  dest: config.uploadsDir,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

const lecturesRoot = config.lecturesDir;
const { resolveContentFile } = require('../utils/contentFiles');
const coverRoot = config.lectureCoverDir;
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(lecturesRoot, { recursive: true });
fs.mkdirSync(coverRoot, { recursive: true });

function isValidSlug(slug) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(slug);
}

function safeLecturePath(slug) {
  const target = path.resolve(lecturesRoot, slug);
  if (!target.startsWith(`${path.resolve(lecturesRoot)}${path.sep}`)) {
    throw new Error('Invalid lecture path');
  }
  return target;
}

function cleanupUpload(file) {
  if (!file?.path) return;
  try { fs.rmSync(file.path, { force: true }); }
  catch (err) { logger.warn({ err: String(err) }, 'lecture_upload_cleanup_error'); }
}

function cleanupFiles(files = []) {
  files.forEach(cleanupUpload);
}

function isAllowedCover(file) {
  if (!file) return true;
  const ext = path.extname(file.originalname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
    && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
}

function saveCover(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const target = path.join(coverRoot, fileName);
  try {
    fs.renameSync(file.path, target);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    // DATA_DIR may live on a different volume from the incoming upload directory.
    try { fs.copyFileSync(file.path, target, fs.constants.COPYFILE_EXCL); }
    catch (copyError) { fs.rmSync(target, { force: true }); throw copyError; }
  }
  return fileName;
}

function safeCoverPath(relativePath) {
  const target = path.resolve(coverRoot, relativePath || '');
  if (!target.startsWith(`${path.resolve(coverRoot)}${path.sep}`)) {
    throw new Error('Invalid cover path');
  }
  return target;
}

function getPublicLecture(lecture) {
  let report = lecture.scan_report;
  if (typeof report === 'string') { try { report = JSON.parse(report); } catch { report = null; } }
  return {
    ...lecture,
    scan_report: report || null,
    cover_url: lecture.cover_path ? `/api/lectures/${lecture.id}/cover` : null
  };
}

function isHtmlFile(name) {
  return /\.(html?|xhtml)$/i.test(name);
}

function htmlTitle(filePath, fallback) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    if (title) return title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || fallback;
  } catch {}
  return fallback;
}

function chapterSlugFromName(name, used = new Set()) {
  const base = path.parse(name).name || name || 'chapter';
  let slug = base
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[?#/\\]+/g, '-')
    .slice(0, 80) || 'chapter';
  let next = slug;
  let index = 2;
  while (used.has(next)) {
    next = `${slug}-${index}`;
    index += 1;
  }
  used.add(next);
  return next;
}

function listHtmlFiles(root) {
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === '__MACOSX') continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (isHtmlFile(item.name)) {
        files.push(path.relative(root, fullPath).split(path.sep).join('/'));
      }
    }
  }
  walk(root);
  return files.sort((a, b) => {
    const aIndex = path.basename(a).toLowerCase() === 'index.html' ? 0 : 1;
    const bIndex = path.basename(b).toLowerCase() === 'index.html' ? 0 : 1;
    return aIndex - bIndex || a.localeCompare(b, 'zh-CN');
  });
}

function chooseEntry(files) {
  return files.find(file => path.basename(file).toLowerCase() === 'index.html')
    || files.find(file => path.basename(file).toLowerCase() === 'index.htm')
    || files[0];
}

function buildChapterCandidates(root) {
  const contentRoot = resolveContentRoot(root);
  const rootPrefix = path.relative(root, contentRoot).split(path.sep).join('/');
  const withPrefix = (dir) => [rootPrefix, dir].filter(Boolean).join('/');
  const htmlFiles = listHtmlFiles(contentRoot);
  if (htmlFiles.length === 0) return [];

  const rootHtml = htmlFiles.filter(file => !file.includes('/'));
  const grouped = new Map();
  htmlFiles
    .filter(file => file.includes('/'))
    .forEach(file => {
      const top = file.split('/')[0];
      if (!grouped.has(top)) grouped.set(top, []);
      grouped.get(top).push(file);
    });

  const chapters = [];
  if (rootHtml.length > 0) {
    const entry = chooseEntry(rootHtml);
    chapters.push({
      title: htmlTitle(path.join(contentRoot, entry), path.parse(entry).name),
      slugSource: entry,
      path: withPrefix(''),
      entryFile: entry
    });
  }

  for (const [top, files] of grouped.entries()) {
    const entry = chooseEntry(files);
    chapters.push({
      title: htmlTitle(path.join(contentRoot, entry), top),
      slugSource: top,
      path: withPrefix(path.dirname(entry) === '.' ? '' : path.dirname(entry)),
      entryFile: path.basename(entry)
    });
  }

  return chapters.length > 0 ? chapters : [{
    title: htmlTitle(path.join(contentRoot, htmlFiles[0]), path.parse(htmlFiles[0]).name),
    slugSource: htmlFiles[0],
    path: withPrefix(path.dirname(htmlFiles[0]) === '.' ? '' : path.dirname(htmlFiles[0])),
    entryFile: path.basename(htmlFiles[0])
  }];
}

function resolveContentRoot(root) {
  const rootHtml = fs.readdirSync(root, { withFileTypes: true })
    .some(item => item.isFile() && isHtmlFile(item.name));
  if (rootHtml) return root;

  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(item => item.isDirectory() && !item.name.startsWith('.') && item.name !== '__MACOSX');
  if (dirs.length !== 1) return root;

  const onlyDir = path.join(root, dirs[0].name);
  const nestedHtml = listHtmlFiles(onlyDir);
  return nestedHtml.length > 0 ? onlyDir : root;
}

// Upload mutations are serialized within this server process. Reads remain available
// while a ZIP is inspected; publication and the DB transaction contain no awaits.
let mutationQueue = Promise.resolve();
function serializeMutation(handler) {
  return (req, res, next) => {
    const task = mutationQueue.then(() => handler(req, res));
    mutationQueue = task.catch(() => {});
    task.catch(next);
  };
}

const versionRoot = path.join(config.dataDir, 'lecture-versions');
fs.mkdirSync(versionRoot, { recursive: true });

function versionFile(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid lecture id');
  return path.join(versionRoot, `${Number(id)}.json`);
}

function versionContent(version) {
  if (!version?.content || !/^[a-z0-9-]+$/i.test(version.content)) throw new Error('历史版本目录无效');
  return assertWithin(path.join(lecturesRoot, '.history'), path.join(lecturesRoot, '.history', version.content));
}

function readVersion(id) {
  const filePath = versionFile(id);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeVersion(id, version) {
  const filePath = versionFile(id);
  if (!version) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  const temporary = `${filePath}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(version), { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function commitVersion(id, version, commit) {
  const previous = readVersion(id);
  writeVersion(id, version);
  try { return commit(); }
  catch (err) {
    try { writeVersion(id, previous); }
    catch (rollbackError) { err.message += `；历史记录回滚失败: ${rollbackError.message}`; }
    throw err;
  }
}

function snapshotVersion(lecture, chapters, contentDir) {
  if (!contentDir) return null;
  return {
    schema: 1,
    created_at: new Date().toISOString(),
    content: path.basename(contentDir),
    lecture: { title: lecture.title, zip_name: lecture.zip_name, cover_path: lecture.cover_path, layout_mode: lecture.layout_mode, scan_report: lecture.scan_report },
    chapters: chapters.map(chapter => ({
      title: chapter.title,
      slug: chapter.slug,
      // Keep paths relative so the version survives slug changes and backup restore.
      path: chapter.path === lecture.slug ? '' : chapter.path.slice(lecture.slug.length + 1),
      entry_file: chapter.entry_file || 'index.html',
      order_index: chapter.order_index
    }))
  };
}

function cleanupVersion(version, keepCover) {
  if (!version) return;
  try { fs.rmSync(versionContent(version), { recursive: true, force: true }); }
  catch (err) { logger.warn({ err: String(err) }, 'lecture_version_cleanup_error'); }
  if (version.lecture?.cover_path && !keepCover.includes(version.lecture.cover_path)) {
    cleanupSavedCover(version.lecture.cover_path);
  }
}

function cleanupSavedCover(coverPath) {
  if (!coverPath) return;
  try { fs.rmSync(safeCoverPath(coverPath), { force: true }); }
  catch (err) { logger.warn({ err: String(err) }, 'lecture_cover_cleanup_error'); }
}

function updatedLecture(id) {
  const lecture = db.get(`
    SELECT l.*, c.name as category_name FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id WHERE l.id = ?
  `, [id]);
  lecture.chapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [id]);
  return getPublicLecture(lecture);
}

function addChapters(lectureId, slug, title, candidates) {
  const usedSlugs = new Set();
  for (const [index, chapter] of candidates.entries()) {
    const chapterSlug = candidates.length === 1 ? slug : chapterSlugFromName(chapter.slugSource, usedSlugs);
    db.run(`INSERT INTO chapters (lecture_id, title, slug, path, entry_file, order_index)
      VALUES (?, ?, ?, ?, ?, ?)`, [lectureId, chapter.title || title, chapterSlug,
      chapter.path ? `${slug}/${chapter.path}` : slug, chapter.entryFile, index]);
  }
}

router.post('/precheck', adminAuth, (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过 200MB 限制' : '文件上传失败: ' + err.message });
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请选择 ZIP 或 HTML 文件' });
  try {
    res.json(await inspectUpload(file));
  } catch (err) {
    res.status(400).json({ error: err.message || 'ZIP 文件无法读取，请确认文件未损坏' });
  } finally {
    cleanupUpload(file);
  }
});

function fetchLectureList() {
  const lectures = db.query(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.scan_report, l.created_at,
           c.name as category_name
    FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id
    ORDER BY l.created_at DESC
  `);

  const chaptersByLecture = new Map();
  for (const chapter of db.query('SELECT id, lecture_id, title, slug, path, entry_file, order_index FROM chapters ORDER BY lecture_id, order_index')) {
    if (!chaptersByLecture.has(chapter.lecture_id)) chaptersByLecture.set(chapter.lecture_id, []);
    chaptersByLecture.get(chapter.lecture_id).push(chapter);
  }
  return lectures.map(lecture => getPublicLecture({ ...lecture, chapters: chaptersByLecture.get(lecture.id) || [] }));
}

// 讲义列表 - 未登录返回公开，登录后自动返回公开+有权限，管理员返回全部
router.get('/', optionalStudentAuth, (req, res) => {
  const allLectures = fetchLectureList();

  res.json(filterAccessibleLectures(req.student?.id, allLectures));
});

// Detail and lists share live account and category permissions.
router.get('/detail/:slug', optionalStudentAuth, (req, res) => {
  const lecture = db.get('SELECT * FROM lectures WHERE slug = ?', [req.params.slug]);
  if (!lecture) return res.status(404).json({ error: '讲义不存在' });
  if (!canAccessLecture(req.student?.id, lecture)) return res.status(403).json({ error: '无权限访问该讲义' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(updatedLecture(lecture.id));
});

// 学生的学习中心列表
router.get('/my', studentAuth, (req, res) => {
  const allLectures = fetchLectureList();
  const filtered = filterAccessibleLectures(req.student.id, allLectures);
  res.json(filtered);
});

// Validate the staged content completely before publishing it and committing rows.
router.post('/', adminAuth, (req, res, next) => {
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }])(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过 200MB 限制' : '文件上传失败: ' + err.message });
    next();
  });
}, serializeMutation(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const slug = String(req.body.slug || '').trim();
  const categoryId = Number(req.body.categoryId);
  const layoutMode = req.body.layoutMode === 'native' ? 'native' : 'system';
  const isPublic = req.body.isPublic === '1' || req.body.isPublic === true ? 1 : 0;
  const file = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  let coverPath = null;
  let scanReport = null;
  const sanitize = req.body.sanitize !== '0';
  let committed = false;
  try {
    if (!file || !title || !slug || !categoryId) return res.status(400).json({ error: '所有字段必填' });
    if (!isValidSlug(slug)) return res.status(400).json({ error: 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位' });
    if (!db.get('SELECT id FROM categories WHERE id = ?', [categoryId])) return res.status(400).json({ error: '分类不存在' });
    if (db.get('SELECT id FROM lectures WHERE slug = ?', [slug])) return res.status(400).json({ error: 'URL 标识已存在' });
    if (!isAllowedCover(cover)) return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
    validateUpload(file);
    const extractPath = safeLecturePath(slug);
    if (fs.existsSync(extractPath)) return res.status(409).json({ error: '讲义目录已存在，请先检查历史文件' });
    const publication = await atomicWriteDir(lecturesRoot, extractPath, async stage => {
      await extractLectureContent(file, stage);
      scanReport = processLectureHtml(stage, fs, path, { sanitize });
      const chapters = buildChapterCandidates(stage);
      if (!chapters.length) throw new Error('未找到可用 HTML 文件');
      return chapters;
    }, { commit(candidates) {
      coverPath = saveCover(cover);
      const id = db.transaction(() => {
        const result = db.run(`INSERT INTO lectures (title, slug, zip_name, category_id, cover_path, layout_mode, is_public, scan_report)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [title, slug, path.parse(file.originalname).name, categoryId, coverPath, layoutMode, isPublic, JSON.stringify(scanReport)]);
        addChapters(result.lastInsertRowid, slug, title, candidates);
        rebuildLectureIndex(result.lastInsertRowid);
        return result.lastInsertRowid;
      });
      committed = true;
      return id;
    }});
    res.json({ ...updatedLecture(publication.result), sanitized: sanitize });
  } catch (err) {
    logger.error({ reqId: req.id, err: String(err), slug }, 'lecture_upload_error');
    res.status(/ZIP|HTML|文件名|上传文件/.test(err.message) ? 400 : 500).json({ error: err.message || '讲义处理失败' });
  } finally {
    cleanupFiles([file, cover]);
    if (!committed && coverPath) cleanupSavedCover(coverPath);
  }
}));

router.get('/:id/cover', optionalStudentAuth, (req, res) => {
  const lecture = db.get('SELECT id, category_id, is_public, cover_path FROM lectures WHERE id = ?', [req.params.id]);
  if (!lecture?.cover_path) {
    return res.status(404).send('Cover not found');
  }

  if (!canAccessLecture(req.student?.id, lecture)) {
    return res.status(403).json({ error: '无权限访问该讲义' });
  }
  const coverPath = resolveContentFile(coverRoot, lecture.cover_path);
  res.setHeader('Cache-Control', 'private, no-store');
  if (!coverPath) {
    return res.status(404).send('Cover not found');
  }
  res.sendFile(coverPath);
});

// 删除讲义
router.delete('/:id', adminAuth, serializeMutation((req, res) => {
  const { id } = req.params;

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }

  // 事务：先删 DB 记录，成功后再删文件。
  // 文件删除失败不影响 DB 一致性（最多残留孤儿文件，可后续清理），
  // 但 DB 必须原子，避免"chapters 删了 lectures 还在"
  db.transaction(() => {
    db.run('DELETE FROM chapters WHERE lecture_id = ?', [id]);
    db.run('DELETE FROM lectures WHERE id = ?', [id]);
    removeLectureIndex(id);
  });

  // 删除文件目录（DB 已提交，文件删除失败只记日志）
  const lecturePath = safeLecturePath(lecture.slug);
  try {
    if (fs.existsSync(lecturePath)) {
      fs.rmSync(lecturePath, { recursive: true, force: true });
    }
  } catch (err) {
    logger.error({ reqId: req.id, slug: lecture.slug, err: String(err) }, 'lecture_delete_file_error');
  }

  if (lecture.cover_path) {
    try {
      const coverPath = safeCoverPath(lecture.cover_path);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    } catch (err) {
      logger.error({ reqId: req.id, err: String(err) }, 'lecture_delete_cover_error');
    }
  }

  try {
    const version = readVersion(lecture.id);
    cleanupVersion(version, []);
    writeVersion(lecture.id, null);
  } catch (err) {
    logger.warn({ err: String(err), id }, 'lecture_version_cleanup_error');
  }

  res.json({ success: true });
}));

router.put('/:id/category', adminAuth, serializeMutation((req, res) => {
  const { id } = req.params;
  const categoryId = Number(req.body.categoryId);

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }
  if (!categoryId) {
    return res.status(400).json({ error: '请选择分类' });
  }

  const category = db.get('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!category) {
    return res.status(400).json({ error: '分类不存在' });
  }

  db.run('UPDATE lectures SET category_id = ? WHERE id = ?', [categoryId, id]);
  const updated = db.get(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.scan_report, l.created_at,
           c.name as category_name
    FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `, [id]);
  updated.chapters = db.query(`
    SELECT id, lecture_id, title, slug, path, entry_file, order_index
    FROM chapters WHERE lecture_id = ? ORDER BY order_index
  `, [id]);
  res.json(getPublicLecture(updated));
}));

// 公开展示开关
router.put('/:id/public', adminAuth, serializeMutation((req, res) => {
  const { id } = req.params;
  const isPublic = req.body.is_public === 1 || req.body.is_public === true ? 1 : 0;

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }

  db.run('UPDATE lectures SET is_public = ? WHERE id = ?', [isPublic, id]);
  const updated = db.get(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.scan_report, l.created_at,
           c.name as category_name
    FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `, [id]);
  updated.chapters = db.query(`
    SELECT id, lecture_id, title, slug, path, entry_file, order_index
    FROM chapters WHERE lecture_id = ? ORDER BY order_index
  `, [id]);
  res.json(getPublicLecture(updated));
}));

// Metadata-only changes and replacement uploads share the same mutation lock.
router.put('/:id', adminAuth, (req, res, next) => {
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }])(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过 200MB 限制' : '文件上传失败: ' + err.message });
    next();
  });
}, serializeMutation(async (req, res) => {
  const { id } = req.params;
  const title = String(req.body.title || '').trim();
  const requestedSlug = String(req.body.slug || '').trim();
  const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
  const layoutMode = req.body.layoutMode === 'native' ? 'native' : 'system';
  const isPublic = req.body.isPublic === '1' || req.body.isPublic === true ? 1 : 0;
  const cover = req.files?.cover?.[0];
  const file = req.files?.file?.[0];
  let savedCover = null;
  let newScanReport = null;
  let committed = false;
  try {
    const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
    if (!lecture) return res.status(404).json({ error: '讲义不存在' });
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    const slug = requestedSlug || lecture.slug;
    if (!isValidSlug(slug)) return res.status(400).json({ error: 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位' });
    if (db.get('SELECT id FROM lectures WHERE slug = ? AND id != ?', [slug, id])) return res.status(400).json({ error: 'URL 标识已存在' });
    if (categoryId && !db.get('SELECT id FROM categories WHERE id = ?', [categoryId])) return res.status(400).json({ error: '分类不存在' });
    if (!isAllowedCover(cover)) return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
    if (file) validateUpload(file);
    const oldPath = safeLecturePath(lecture.slug);
    const newPath = safeLecturePath(slug);
    if (oldPath !== newPath && fs.existsSync(newPath)) return res.status(409).json({ error: '目标讲义目录已存在' });
    const oldChapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [id]);
    const oldVersion = readVersion(lecture.id);
    let newVersion = oldVersion;
    const commit = candidates => {
      savedCover = saveCover(cover);
      return db.transaction(() => {
        if (candidates) {
          db.run('DELETE FROM chapters WHERE lecture_id = ?', [id]);
          addChapters(id, slug, title, candidates);
        } else if (slug !== lecture.slug) {
          for (const chapter of oldChapters) {
            const relative = chapter.path === lecture.slug ? '' : chapter.path.slice(lecture.slug.length + 1);
            db.run('UPDATE chapters SET path = ? WHERE id = ?', [relative ? `${slug}/${relative}` : slug, chapter.id]);
          }
        }
        db.run(`UPDATE lectures SET title = ?, slug = ?, zip_name = ?, category_id = ?, cover_path = ?, layout_mode = ?, is_public = ?, scan_report = ? WHERE id = ?`,
          [title, slug, file ? path.parse(file.originalname).name : lecture.zip_name, categoryId || lecture.category_id,
            savedCover || lecture.cover_path, layoutMode, isPublic, newScanReport ?? lecture.scan_report, id]);
        rebuildLectureIndex(id);
      });
    };
    if (file) {
      await atomicWriteDir(lecturesRoot, newPath, async stage => {
        await extractLectureContent(file, stage);
        newScanReport = JSON.stringify(processLectureHtml(stage, fs, path, { sanitize: req.body.sanitize !== '0' }));
        const candidates = buildChapterCandidates(stage);
        if (!candidates.length) throw new Error('未找到可用 HTML 文件');
        return candidates;
      }, {
        sourceDir: oldPath,
        retainPrevious: true,
        commit(candidates, previousDir) {
          newVersion = snapshotVersion(lecture, oldChapters, previousDir);
          commitVersion(lecture.id, newVersion, () => commit(candidates));
          committed = true;
        }
      });
      cleanupVersion(oldVersion, [savedCover || lecture.cover_path, newVersion?.lecture.cover_path]);
    } else {
      let renamed = false;
      try {
        if (oldPath !== newPath) {
          fs.renameSync(oldPath, newPath);
          renamed = true;
        }
        commit(null);
        committed = true;
      } catch (err) {
        if (renamed) fs.renameSync(newPath, oldPath);
        throw err;
      }
    }
    if (savedCover && lecture.cover_path !== newVersion?.lecture.cover_path) cleanupSavedCover(lecture.cover_path);
    res.json(updatedLecture(id));
  } catch (err) {
    logger.error({ reqId: req.id, id, err: String(err) }, 'lecture_update_error');
    res.status(/ZIP|HTML|文件名|上传文件/.test(err.message) ? 400 : 500).json({ error: '更新失败: ' + err.message });
  } finally {
    cleanupFiles([cover, file]);
    if (!committed && savedCover) cleanupSavedCover(savedCover);
  }
}));

router.get('/:id/versions', adminAuth, (req, res, next) => {
  try {
    const lecture = db.get('SELECT id FROM lectures WHERE id = ?', [req.params.id]);
    if (!lecture) return res.status(404).json({ error: '讲义不存在' });
    const version = readVersion(lecture.id);
    res.json(version && fs.existsSync(versionContent(version)) ? [{
      id: 'previous', created_at: version.created_at, title: version.lecture.title,
      zip_name: version.lecture.zip_name, chapter_count: version.chapters.length
    }] : []);
  } catch (err) { next(err); }
});

router.post('/:id/restore', adminAuth, serializeMutation(async (req, res) => {
  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [req.params.id]);
  if (!lecture) return res.status(404).json({ error: '讲义不存在' });
  try {
    const version = readVersion(lecture.id);
    if (!version || !fs.existsSync(versionContent(version))) return res.status(404).json({ error: '没有可恢复的上一版' });
    const oldChapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [lecture.id]);
    await atomicWriteDir(lecturesRoot, safeLecturePath(lecture.slug), async stage => {
      await fs.promises.cp(versionContent(version), stage, { recursive: true, dereference: false });
      // Older snapshots must never reintroduce symlinks or escaped chapter paths.
      const walk = directory => {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
          if (item.isSymbolicLink()) throw new Error('历史版本包含符号链接');
          if (item.isDirectory()) walk(path.join(directory, item.name));
          else if (!item.isFile()) throw new Error('历史版本包含特殊文件');
        }
      };
      walk(stage);
      for (const chapter of version.chapters) {
        const candidate = assertWithin(stage, path.resolve(stage, chapter.path, chapter.entry_file));
        if (!fs.statSync(candidate).isFile()) throw new Error('历史章节 HTML 不存在');
      }
    }, {
      retainPrevious: true,
      commit(value, previousDir) {
        const nextVersion = snapshotVersion(lecture, oldChapters, previousDir);
        commitVersion(lecture.id, nextVersion, () => db.transaction(() => {
          db.run('DELETE FROM chapters WHERE lecture_id = ?', [lecture.id]);
          for (const chapter of version.chapters) {
            db.run(`INSERT INTO chapters (lecture_id, title, slug, path, entry_file, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
              [lecture.id, chapter.title, version.chapters.length === 1 ? lecture.slug : chapter.slug,
                chapter.path ? `${lecture.slug}/${chapter.path}` : lecture.slug, chapter.entry_file, chapter.order_index]);
          }
          db.run('UPDATE lectures SET title = ?, zip_name = ?, cover_path = ?, layout_mode = ?, scan_report = ? WHERE id = ?',
            [version.lecture.title, version.lecture.zip_name, version.lecture.cover_path, version.lecture.layout_mode, version.lecture.scan_report || null, lecture.id]);
          rebuildLectureIndex(lecture.id);
        }));
      }
    });
    cleanupVersion(version, [lecture.cover_path, version.lecture.cover_path]);
    res.json(updatedLecture(lecture.id));
  } catch (err) {
    logger.error({ reqId: req.id, id: lecture.id, err: String(err) }, 'lecture_restore_error');
    res.status(500).json({ error: '恢复失败: ' + err.message });
  }
}));

// 更新章节信息
router.put('/:id/chapters', adminAuth, serializeMutation((req, res) => {
  const { id } = req.params;
  const chapters = req.body.chapters;

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ error: '章节数据无效' });
  }

  try {
    // 验证所有章节 ID 是否属于该讲义
    const existingChapters = db.query('SELECT id FROM chapters WHERE lecture_id = ?', [id]);
    const existingIds = new Set(existingChapters.map(c => c.id));

    for (const chapter of chapters) {
      if (!existingIds.has(chapter.id)) {
        return res.status(400).json({ error: '章节 ID 不属于该讲义' });
      }
    }

    // 事务：批量更新章节标题和排序，保证全部成功或全部不变
    db.transaction(() => {
      chapters.forEach((chapter, index) => {
        const title = String(chapter.title || '').trim();
        if (!title) {
          throw new Error('章节标题不能为空');
        }
        db.run('UPDATE chapters SET title = ?, order_index = ? WHERE id = ?', [title, index, chapter.id]);
      });
      rebuildLectureIndex(id);
    });

    const updated = db.get(`
      SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.scan_report, l.created_at,
             c.name as category_name
      FROM lectures l
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE l.id = ?
    `, [id]);
    updated.chapters = db.query(`
      SELECT id, lecture_id, title, slug, path, entry_file, order_index
      FROM chapters WHERE lecture_id = ? ORDER BY order_index
    `, [id]);
    res.json(getPublicLecture(updated));
  } catch (err) {
    console.error('更新章节错误:', err);
    res.status(500).json({ error: '更新章节失败: ' + err.message });
  }
}));
router.get('/toc/:lectureSlug/:chapterSlug', optionalStudentAuth, (req, res) => {
  const { lectureSlug, chapterSlug } = req.params;
  const chapter = db.get(`
    SELECT c.path, c.entry_file, l.id, l.slug as lecture_slug, l.category_id, l.is_public
    FROM chapters c
    INNER JOIN lectures l ON l.id = c.lecture_id
    WHERE l.slug = ? AND c.slug = ?
  `, [lectureSlug, chapterSlug]);

  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  if (!canAccessLecture(req.student?.id, chapter)) {
    return res.status(403).json({ error: '无权限访问该讲义' });
  }

  const htmlPath = resolveContentFile(path.join(lecturesRoot, chapter.lecture_slug), path.relative(path.join(lecturesRoot, chapter.lecture_slug), path.join(lecturesRoot, chapter.path, chapter.entry_file || 'index.html')));
  
  if (!htmlPath) {
    return res.status(404).json({ error: 'HTML file not found' });
  }
  
  try {
    const toc = extractTOC(htmlPath);
    res.json(toc);
  } catch (err) {
    console.error('TOC extraction error:', err);
    res.status(500).json({ error: 'TOC extraction failed' });
  }
});

module.exports = router;
