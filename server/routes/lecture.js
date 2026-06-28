const express = require('express');
const router = express.Router();
const multer = require('multer');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const jwt = require('jsonwebtoken');
const db = require('../db');
const logger = require('../logger');
const config = require('../config');

// 管理员权限中间件（用于需要管理员的操作）
const adminAuth = require('../middleware/adminAuth');
const { studentAuth, optionalStudentAuth } = require('../middleware/studentAuth');

const JWT_SECRET = config.jwtSecret;
const { filterAccessibleLectures, canAccessLecture } = require('../utils/permissions');
const { extractTOC } = require('../utils/tocExtractor');
const { atomicWriteDir } = require('../utils/fs');

// ZIP 上传配置
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

const lecturesRoot = config.lecturesDir;
const coverRoot = config.lectureCoverDir;
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(lecturesRoot, { recursive: true });
fs.mkdirSync(coverRoot, { recursive: true });

function isValidSlug(slug) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(slug);
}

function safeLecturePath(slug) {
  const target = path.resolve(lecturesRoot, slug);
  if (!target.startsWith(`${lecturesRoot}${path.sep}`)) {
    throw new Error('Invalid lecture path');
  }
  return target;
}

function cleanupUpload(file) {
  if (file?.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
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
  fs.renameSync(file.path, path.join(coverRoot, fileName));
  return fileName;
}

function safeCoverPath(relativePath) {
  const target = path.resolve(coverRoot, relativePath || '');
  if (!target.startsWith(`${coverRoot}${path.sep}`)) {
    throw new Error('Invalid cover path');
  }
  return target;
}

function getPublicLecture(lecture) {
  return {
    ...lecture,
    cover_url: lecture.cover_path ? `/api/lectures/${lecture.id}/cover` : null
  };
}

function isHtmlFile(name) {
  return /\.(html?|xhtml)$/i.test(name);
}

function normalizeZipPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
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

// 解压/拷贝讲义内容到临时目录（供 atomicWriteDir 调用）。
// 成功返回 populated 的目录，失败抛错（由 atomicWriteDir 负责清理 tmp）
function extractLectureContent(uploadFile, destDir) {
  const isZip = uploadFile.originalname.toLowerCase().endsWith('.zip');
  const isSingleHtml = isHtmlFile(uploadFile.originalname);
  if (!isZip && !isSingleHtml) {
    throw new Error('仅支持 ZIP 或 HTML 文件');
  }
  if (isSingleHtml) {
    fs.renameSync(uploadFile.path, path.join(destDir, uploadFile.originalname));
    return;
  }
  // 优先用 config 探测到的解压器，避免硬编码 unar/unzip
  const cmd = config.unarchiver || 'unzip';
  if (cmd === 'unar') {
    execFileSync('unar', ['-o', destDir, uploadFile.path], { encoding: 'utf-8' });
  } else {
    execFileSync('unzip', ['-o', uploadFile.path, '-d', destDir], { encoding: 'utf-8' });
  }
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

function inspectZip(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries().filter(entry => !entry.entryName.startsWith('__MACOSX/'));
  const htmlFiles = entries
    .filter(entry => !entry.isDirectory && isHtmlFile(entry.entryName))
    .map(entry => normalizeZipPath(entry.entryName));
  const groups = new Map();
  htmlFiles.forEach(file => {
    const parts = file.split('/').filter(Boolean);
    const key = parts.length > 1 ? parts[0] : '(根目录)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  });

  const chapters = [...groups.entries()].map(([name, files]) => ({
    name,
    preferredHtml: chooseEntry(files),
    hasIndex: files.some(file => path.basename(file).toLowerCase() === 'index.html'),
    htmlCount: files.length
  }));
  const missingIndex = chapters.filter(item => !item.hasIndex);

  return {
    entryCount: entries.length,
    htmlCount: htmlFiles.length,
    mode: chapters.length > 1 ? 'multi-chapter' : 'single-page',
    rootHasIndex: htmlFiles.some(name => name.toLowerCase() === 'index.html'),
    rootHtml: htmlFiles.filter(name => !name.includes('/')),
    chapters,
    missingIndex,
    warnings: [
      ...(htmlFiles.length === 0 ? ['未找到 HTML 文件'] : []),
      ...(missingIndex.length > 0 ? [`${missingIndex.length} 个章节未使用 index.html，系统会保留原文件名并自动指向可用 HTML`] : [])
    ]
  };
}

router.post('/precheck', adminAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过 200MB 限制' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: '请选择 ZIP 或 HTML 文件' });
  }
  if (isHtmlFile(file.originalname)) {
    const result = {
      entryCount: 1,
      htmlCount: 1,
      mode: 'single-page',
      rootHasIndex: path.basename(file.originalname).toLowerCase() === 'index.html',
      rootHtml: [file.originalname],
      chapters: [{
        name: path.parse(file.originalname).name,
        preferredHtml: file.originalname,
        hasIndex: path.basename(file.originalname).toLowerCase() === 'index.html',
        htmlCount: 1
      }],
      missingIndex: path.basename(file.originalname).toLowerCase() === 'index.html' ? [] : [{
        name: path.parse(file.originalname).name,
        preferredHtml: file.originalname,
        hasIndex: false,
        htmlCount: 1
      }],
      warnings: path.basename(file.originalname).toLowerCase() === 'index.html'
        ? []
        : ['该 HTML 不是 index.html，系统会保留原文件名并自动作为入口']
    };
    cleanupUpload(file);
    return res.json(result);
  }
  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    cleanupUpload(file);
    return res.status(400).json({ error: '仅支持 ZIP 或 HTML 文件' });
  }

  try {
    const result = inspectZip(file.path);
    cleanupUpload(file);
    res.json(result);
  } catch (err) {
    console.error('ZIP 预检错误:', err);
    cleanupUpload(file);
    res.status(400).json({ error: 'ZIP 文件无法读取，请确认文件未损坏' });
  }
});

function fetchLectureList() {
  const lectures = db.query(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.created_at,
           c.name as category_name
    FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id
    ORDER BY l.created_at DESC
  `);

  return lectures.map(lecture => {
    const chapters = db.query(`
      SELECT id, lecture_id, title, slug, path, entry_file, order_index
      FROM chapters WHERE lecture_id = ? ORDER BY order_index
    `, [lecture.id]);
    return getPublicLecture({ ...lecture, chapters });
  });
}

// 讲义列表 - 未登录返回公开，登录后自动返回公开+有权限，管理员返回全部
router.get('/', optionalStudentAuth, (req, res) => {
  const allLectures = fetchLectureList();

  // 检查是否是管理员请求
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') {
        const admin = db.get('SELECT id FROM admins WHERE username = ?', [decoded.username]);
        if (admin) return res.json(allLectures);
      }
    } catch {}
  }

  res.json(filterAccessibleLectures(req.student?.id, allLectures));
});

// 学生的学习中心列表
router.get('/my', studentAuth, (req, res) => {
  const allLectures = fetchLectureList();
  const filtered = filterAccessibleLectures(req.student.id, allLectures);
  res.json(filtered);
});

// 上传 ZIP 讲义
router.post('/', adminAuth, (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过 200MB 限制' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const title = String(req.body.title || '').trim();
  const slug = String(req.body.slug || '').trim();
  const categoryId = Number(req.body.categoryId);
  const layoutMode = req.body.layoutMode === 'native' ? 'native' : 'system';
  const isPublic = req.body.isPublic === '1' || req.body.isPublic === true ? 1 : 0;
  const file = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  
  if (!file || !title || !slug || !categoryId) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '所有字段必填' });
  }

  if (!isValidSlug(slug)) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位' });
  }

  const category = db.get('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!category) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '分类不存在' });
  }

  const existing = db.get('SELECT id FROM lectures WHERE slug = ?', [slug]);
  if (existing) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: 'URL 标识已存在' });
  }
  
  const isZip = file.originalname.toLowerCase().endsWith('.zip');
  const isSingleHtml = isHtmlFile(file.originalname);
  if (!isZip && !isSingleHtml) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '仅支持 ZIP 或 HTML 文件' });
  }

  if (!isAllowedCover(cover)) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
  }
  
  let coverPath = null;
  try {
    const zipName = path.parse(file.originalname).name;
    const extractPath = safeLecturePath(slug);
    coverPath = saveCover(cover);

    // 1) 原子写入讲义目录：先解压到 <slug>.tmp-xxx/，成功后再替换正式目录
    //    这样解压失败/中断不会留下半成品目录
    atomicWriteDir(lecturesRoot, extractPath, (tmpDir) => {
      extractLectureContent(file, tmpDir);
    });
    // 临时上传文件已被 extractLectureContent 处理（rename 或解压），清理引用
    cleanupUpload(file);

    // 2) 解析章节候选（在事务外做，避免文件 IO 占用事务）
    const chapterCandidates = buildChapterCandidates(extractPath);
    if (chapterCandidates.length === 0) {
      throw new Error('未找到可用 HTML 文件');
    }

    // 3) 事务：INSERT lectures + 多条 INSERT chapters 必须原子完成
    //    中途失败自动回滚，不会留下"无章节的幽灵讲义"
    const lectureId = db.transaction(() => {
      const result = db.run(`
        INSERT INTO lectures (title, slug, zip_name, category_id, cover_path, layout_mode, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [title, slug, zipName, categoryId, coverPath, layoutMode, isPublic]);
      const newLectureId = result.lastInsertRowid;

      const usedSlugs = new Set();
      chapterCandidates.forEach((chapter, index) => {
        const chapterSlug = chapterCandidates.length === 1
          ? slug
          : chapterSlugFromName(chapter.slugSource, usedSlugs);
        const chapterPath = chapter.path ? `${slug}/${chapter.path}` : slug;
        db.run(`
          INSERT INTO chapters (lecture_id, title, slug, path, entry_file, order_index) VALUES (?, ?, ?, ?, ?, ?)
        `, [newLectureId, chapter.title || title, chapterSlug, chapterPath, chapter.entryFile, index]);
      });
      return newLectureId;
    });

    const chapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [lectureId]);

    res.json({
      id: lectureId,
      title,
      slug,
      layout_mode: layoutMode,
      cover_url: coverPath ? `/api/lectures/${lectureId}/cover` : null,
      chapters
    });

  } catch (err) {
    logger.error({ reqId: req.id, err: err && err.stack ? err.stack : String(err), slug }, 'lecture_upload_error');
    cleanupFiles([file, cover]);
    if (coverPath) {
      const savedCoverPath = safeCoverPath(coverPath);
      if (fs.existsSync(savedCoverPath)) fs.unlinkSync(savedCoverPath);
    }
    const msg = err && err.message ? err.message : '上传失败';
    res.status(500).json({ error: msg.includes('HTML') || msg.includes('ZIP') ? msg : '讲义处理失败' });
  }
});

router.get('/:id/cover', (req, res) => {
  const lecture = db.get('SELECT cover_path FROM lectures WHERE id = ?', [req.params.id]);
  if (!lecture?.cover_path) {
    return res.status(404).send('Cover not found');
  }

  const coverPath = safeCoverPath(lecture.cover_path);
  if (!fs.existsSync(coverPath)) {
    return res.status(404).send('Cover not found');
  }
  res.sendFile(coverPath);
});

// 删除讲义
router.delete('/:id', adminAuth, (req, res) => {
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

  res.json({ success: true });
});

router.put('/:id/category', adminAuth, (req, res) => {
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
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.created_at,
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
});

// 公开展示开关
router.put('/:id/public', adminAuth, (req, res) => {
  const { id } = req.params;
  const isPublic = req.body.is_public === 1 || req.body.is_public === true ? 1 : 0;

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }

  db.run('UPDATE lectures SET is_public = ? WHERE id = ?', [isPublic, id]);
  const updated = db.get(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.created_at,
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
});

// 更新讲义基本信息（支持封面+内容重新上传）
router.put('/:id', adminAuth, (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过 200MB 限制' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const { id } = req.params;
  const title = String(req.body.title || '').trim();
  const slug = String(req.body.slug || '').trim();
  const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
  const layoutMode = req.body.layoutMode === 'native' ? 'native' : 'system';
  const isPublic = req.body.isPublic === '1' || req.body.isPublic === true ? 1 : 0;
  const cover = req.files?.cover?.[0];
  const file = req.files?.file?.[0]; // 重新上传的内容文件

  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    cleanupUpload(cover);
    cleanupUpload(file);
    return res.status(404).json({ error: '讲义不存在' });
  }

  if (!title) {
    cleanupUpload(cover);
    cleanupUpload(file);
    return res.status(400).json({ error: '标题不能为空' });
  }

  let oldSlug = lecture.slug;
  let newSlug = null;
  if (slug && slug !== oldSlug) {
    if (!isValidSlug(slug)) {
      cleanupUpload(cover);
      cleanupUpload(file);
      return res.status(400).json({ error: 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位' });
    }
    const existing = db.get('SELECT id FROM lectures WHERE slug = ? AND id != ?', [slug, id]);
    if (existing) {
      cleanupUpload(cover);
      cleanupUpload(file);
      return res.status(400).json({ error: 'URL 标识已存在' });
    }
    newSlug = slug;
  }

  if (categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [categoryId]);
    if (!category) {
      cleanupUpload(cover);
      cleanupUpload(file);
      return res.status(400).json({ error: '分类不存在' });
    }
  }

  if (!isAllowedCover(cover)) {
    cleanupUpload(cover);
    cleanupUpload(file);
    return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
  }

  let coverPath = lecture.cover_path;
  try {
    // 处理新封面上传
    if (cover) {
      if (lecture.cover_path) {
        const oldCoverPath = safeCoverPath(lecture.cover_path);
        if (fs.existsSync(oldCoverPath)) fs.unlinkSync(oldCoverPath);
      }
      coverPath = saveCover(cover);
    }

    const activeSlug = newSlug || oldSlug;

    // === 阶段 1：文件系统操作（事务外，因为涉及外部解压）===
    // 内容重传：原子写入，避免半成品目录
    let rebuiltChapters = null;
    if (file) {
      const isZip = file.originalname.toLowerCase().endsWith('.zip');
      const isSingleHtml = isHtmlFile(file.originalname);
      if (!isZip && !isSingleHtml) {
        cleanupUpload(file);
        return res.status(400).json({ error: '仅支持 ZIP 或 HTML 文件' });
      }

      const extractPath = safeLecturePath(activeSlug);
      atomicWriteDir(lecturesRoot, extractPath, (tmpDir) => {
        extractLectureContent(file, tmpDir);
      });
      cleanupUpload(file);

      const chapterCandidates = buildChapterCandidates(extractPath);
      if (chapterCandidates.length === 0) {
        throw new Error('未找到可用 HTML 文件');
      }
      // 预计算章节，待事务内写入
      const usedSlugs = new Set();
      rebuiltChapters = chapterCandidates.map((chapter, index) => {
        const chapterSlug = chapterCandidates.length === 1
          ? activeSlug
          : chapterSlugFromName(chapter.slugSource, usedSlugs);
        const chapterPath = chapter.path ? `${activeSlug}/${chapter.path}` : activeSlug;
        return {
          title: chapter.title || title,
          slug: chapterSlug,
          path: chapterPath,
          entryFile: chapter.entryFile,
          orderIndex: index
        };
      });
    } else if (newSlug && newSlug !== oldSlug) {
      // 仅改 slug：原子重命名目录
      const oldPath = safeLecturePath(oldSlug);
      const newPath = safeLecturePath(newSlug);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }

    // === 阶段 2：数据库事务（slug 更新/章节路径更新/章节重建/讲义更新 全部原子）===
    db.transaction(() => {
      // slug 变更 → 更新所有章节的 path 前缀
      if (newSlug && newSlug !== oldSlug) {
        const chapters = db.query('SELECT id, path FROM chapters WHERE lecture_id = ?', [id]);
        const escapedOld = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        chapters.forEach(chapter => {
          const newChapterPath = chapter.path.replace(new RegExp('^' + escapedOld), newSlug);
          db.run('UPDATE chapters SET path = ? WHERE id = ?', [newChapterPath, chapter.id]);
        });
      }

      // 内容重传 → 删除旧章节，写入新章节
      if (rebuiltChapters) {
        db.run('DELETE FROM chapters WHERE lecture_id = ?', [id]);
        rebuiltChapters.forEach(ch => {
          db.run(`
            INSERT INTO chapters (lecture_id, title, slug, path, entry_file, order_index)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [id, ch.title, ch.slug, ch.path, ch.entryFile, ch.orderIndex]);
        });
      }

      // 更新讲义主记录
      const updateFields = [];
      const updateValues = [];
      if (title) { updateFields.push('title = ?'); updateValues.push(title); }
      if (newSlug) { updateFields.push('slug = ?'); updateValues.push(newSlug); }
      if (categoryId) { updateFields.push('category_id = ?'); updateValues.push(categoryId); }
      if (coverPath !== lecture.cover_path) { updateFields.push('cover_path = ?'); updateValues.push(coverPath); }
      updateFields.push('layout_mode = ?'); updateValues.push(layoutMode);
      updateFields.push('is_public = ?'); updateValues.push(isPublic);
      updateValues.push(id);
      db.run(`UPDATE lectures SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    });

    const updated = db.get(`
      SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.created_at,
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
    logger.error({ reqId: req.id, id, err: err && err.stack ? err.stack : String(err) }, 'lecture_update_error');
    cleanupUpload(cover);
    cleanupUpload(file);
    if (coverPath && coverPath !== lecture.cover_path) {
      const savedCoverPath = safeCoverPath(coverPath);
      if (fs.existsSync(savedCoverPath)) fs.unlinkSync(savedCoverPath);
    }
    res.status(500).json({ error: '更新失败: ' + err.message });
  }
});

// 更新章节信息
router.put('/:id/chapters', adminAuth, (req, res) => {
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
    });

    const updated = db.get(`
      SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.layout_mode, l.is_public, l.created_at,
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
});
router.get('/toc/:lectureSlug/:chapterSlug', optionalStudentAuth, (req, res) => {
  const { lectureSlug, chapterSlug } = req.params;
  const chapter = db.get(`
    SELECT c.path, c.entry_file, l.id, l.category_id, l.is_public
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

  const htmlPath = path.join(lecturesRoot, chapter.path, chapter.entry_file || 'index.html');
  
  if (!fs.existsSync(htmlPath)) {
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
