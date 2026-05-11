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

function inspectZip(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries().filter(entry => !entry.entryName.startsWith('__MACOSX/'));
  const htmlFiles = entries
    .filter(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html'))
    .map(entry => entry.entryName);
  const directories = new Set();

  entries.forEach(entry => {
    const parts = entry.entryName.split('/').filter(Boolean);
    if (parts.length > 1) directories.add(parts[0]);
  });

  const topLevelDirs = [...directories].filter(name => !name.startsWith('.'));
  const rootHasIndex = htmlFiles.some(name => name.toLowerCase() === 'index.html');
  const rootHtml = htmlFiles.filter(name => !name.includes('/'));
  const chapterChecks = topLevelDirs.map(name => ({
    name,
    hasIndex: htmlFiles.some(file => file.toLowerCase() === `${name.toLowerCase()}/index.html`),
    htmlCount: htmlFiles.filter(file => file.startsWith(`${name}/`)).length
  }));
  const missingIndex = chapterChecks.filter(item => !item.hasIndex);

  return {
    entryCount: entries.length,
    htmlCount: htmlFiles.length,
    mode: topLevelDirs.length > 0 ? 'multi-chapter' : 'single-page',
    rootHasIndex,
    rootHtml,
    chapters: chapterChecks,
    missingIndex,
    warnings: [
      ...(htmlFiles.length === 0 ? ['未找到 HTML 文件'] : []),
      ...(topLevelDirs.length === 0 && !rootHasIndex && rootHtml.length > 0 ? ['根目录未找到 index.html，上传时会自动把第一个 HTML 重命名为 index.html'] : []),
      ...(missingIndex.length > 0 ? [`${missingIndex.length} 个章节目录缺少 index.html，上传时会尝试使用目录内第一个 HTML 文件替代`] : [])
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
    return res.status(400).json({ error: '请选择 ZIP 文件' });
  }
  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    cleanupUpload(file);
    return res.status(400).json({ error: '仅支持 ZIP 文件' });
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

// 讲义列表
router.get('/', (req, res) => {
  const lectures = db.query(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.created_at,
           c.name as category_name
    FROM lectures l 
    LEFT JOIN categories c ON l.category_id = c.id 
    ORDER BY l.created_at DESC
  `);
  
  // 获取每个讲义的章节
  const lecturesWithChapters = lectures.map(lecture => {
    const chapters = db.query(`
      SELECT id, lecture_id, title, slug, path, order_index 
      FROM chapters WHERE lecture_id = ? ORDER BY order_index
    `, [lecture.id]);
    return getPublicLecture({ ...lecture, chapters });
  });
  
  res.json(lecturesWithChapters);
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
  
  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '仅支持 ZIP 文件' });
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
    
    // 使用 unar 解压（正确处理 Windows 中文文件名 GBK 编码）
    try {
      execFileSync('unar', ['-o', extractPath, file.path], { encoding: 'utf-8' });
    } catch (e) {
      // fallback 到 unzip
      execFileSync('unzip', ['-o', file.path, '-d', extractPath], { encoding: 'utf-8' });
    }
    
    // 创建讲义记录
    const result = db.run(`
      INSERT INTO lectures (title, slug, zip_name, category_id, cover_path) VALUES (?, ?, ?, ?, ?)
    `, [title, slug, zipName, categoryId, coverPath]);
    
    const lectureId = result.lastInsertRowid;
    
    // 分析目录结构，创建章节
    const topLevelDirs = fs.readdirSync(extractPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));
    
    if (topLevelDirs.length === 0) {
      // 单层 ZIP：没有子目录
      const htmlFiles = fs.readdirSync(extractPath).filter(f => f.endsWith('.html'));
      if (htmlFiles.length > 0) {
        // 重命名第一个 HTML 文件为 index.html
        if (!fs.existsSync(path.join(extractPath, 'index.html'))) {
          fs.renameSync(path.join(extractPath, htmlFiles[0]), path.join(extractPath, 'index.html'));
        }
        db.run(`
          INSERT INTO chapters (lecture_id, title, slug, path, order_index) VALUES (?, ?, ?, ?, ?)
        `, [lectureId, title, slug, slug, 0]);
      }
    } else {
      topLevelDirs.forEach((dir, index) => {
        const dirPath = path.join(extractPath, dir.name);
        let indexPath = path.join(dirPath, 'index.html');
        
        // 如果没有 index.html，找目录里任意 .html 文件并重命名
        if (!fs.existsSync(indexPath)) {
          const htmlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
          if (htmlFiles.length > 0) {
            fs.renameSync(path.join(dirPath, htmlFiles[0]), indexPath);
          }
        }
        
        if (fs.existsSync(indexPath)) {
          db.run(`
            INSERT INTO chapters (lecture_id, title, slug, path, order_index) VALUES (?, ?, ?, ?, ?)
          `, [lectureId, dir.name, dir.name, `${slug}/${dir.name}`, index]);
        }
      });
    }
    
    // 删除临时文件
    cleanupUpload(file);
    
    const chapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [lectureId]);
    
    res.json({ 
      id: lectureId, 
      title, 
      slug, 
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
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.cover_path, l.created_at,
           c.name as category_name
    FROM lectures l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `, [id]);
  updated.chapters = db.query(`
    SELECT id, lecture_id, title, slug, path, order_index
    FROM chapters WHERE lecture_id = ? ORDER BY order_index
  `, [id]);
  res.json(getPublicLecture(updated));
});

// Get TOC for a specific chapter
router.get('/toc/:lectureSlug/:chapterSlug', (req, res) => {
  const { lectureSlug, chapterSlug } = req.params;
  const chapter = db.get(`
    SELECT c.path
    FROM chapters c
    INNER JOIN lectures l ON l.id = c.lecture_id
    WHERE l.slug = ? AND c.slug = ?
  `, [lectureSlug, chapterSlug]);

  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  const htmlPath = path.join(lecturesRoot, chapter.path, 'index.html');
  
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
