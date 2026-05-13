const express = require('express');
const router = express.Router();
const multer = require('multer');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('../db');

// 管理员权限中间件（用于需要管理员的操作）
const adminAuth = require('../middleware/adminAuth');
const { studentAuth, optionalStudentAuth } = require('../middleware/studentAuth');
const { filterAccessibleLectures, canAccessLecture } = require('../utils/permissions');
const { extractTOC } = require('../utils/tocExtractor');

// ZIP 上传配置
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

const lecturesRoot = path.resolve(__dirname, '../../lectures');
const coverRoot = path.resolve(__dirname, '../../data/covers/lectures');
fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
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

// 讲义列表 - 未登录返回公开，登录后自动返回公开+有权限
router.get('/', optionalStudentAuth, (req, res) => {
  const allLectures = fetchLectureList();

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
    
    // 清理旧目录
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true, force: true });
    }
    fs.mkdirSync(extractPath, { recursive: true });
    
    if (isSingleHtml) {
      fs.renameSync(file.path, path.join(extractPath, file.originalname));
    } else {
      // 使用 unar 解压（正确处理 Windows 中文文件名 GBK 编码）
      try {
        execFileSync('unar', ['-o', extractPath, file.path], { encoding: 'utf-8' });
      } catch (e) {
        // fallback 到 unzip
        execFileSync('unzip', ['-o', file.path, '-d', extractPath], { encoding: 'utf-8' });
      }
    }
    
    // 创建讲义记录
    const result = db.run(`
      INSERT INTO lectures (title, slug, zip_name, category_id, cover_path, layout_mode, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [title, slug, zipName, categoryId, coverPath, layoutMode, isPublic]);
    
    const lectureId = result.lastInsertRowid;
    
    const chapterCandidates = buildChapterCandidates(extractPath);
    if (chapterCandidates.length === 0) {
      throw new Error('未找到可用 HTML 文件');
    }
    const usedSlugs = new Set();
    chapterCandidates.forEach((chapter, index) => {
      const chapterSlug = chapterCandidates.length === 1
        ? slug
        : chapterSlugFromName(chapter.slugSource, usedSlugs);
      const chapterPath = chapter.path ? `${slug}/${chapter.path}` : slug;
      db.run(`
        INSERT INTO chapters (lecture_id, title, slug, path, entry_file, order_index) VALUES (?, ?, ?, ?, ?, ?)
      `, [lectureId, chapter.title || title, chapterSlug, chapterPath, chapter.entryFile, index]);
    });
    
    // 删除临时文件
    cleanupUpload(file);
    
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
    console.error('ZIP 处理错误:', err);
    cleanupFiles([file, cover]);
    if (coverPath) {
      const savedCoverPath = safeCoverPath(coverPath);
      if (fs.existsSync(savedCoverPath)) fs.unlinkSync(savedCoverPath);
    }
    res.status(500).json({ error: 'ZIP 解压失败' });
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
  
  // 删除数据库记录
  db.run('DELETE FROM chapters WHERE lecture_id = ?', [id]);
  db.run('DELETE FROM lectures WHERE id = ?', [id]);
  
  // 删除文件目录
  const lecturePath = safeLecturePath(lecture.slug);
  if (fs.existsSync(lecturePath)) {
    fs.rmSync(lecturePath, { recursive: true, force: true });
  }

  if (lecture.cover_path) {
    const coverPath = safeCoverPath(lecture.cover_path);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
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

// Get TOC for a specific chapter
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
