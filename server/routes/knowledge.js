const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const chardet = require('chardet');
const iconv = require('iconv-lite');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');
const adminAuth = require('../middleware/adminAuth');
const { resolveAdminFromToken } = require('../middleware/adminAuth');
const { optionalStudentAuth } = require('../middleware/studentAuth');
const { canAccessKnowledge, getAccessibleCategories } = require('../utils/permissions');

const router = express.Router();
const storageRoot = config.knowledgeDir;
const coverRoot = config.knowledgeCoverDir;
fs.mkdirSync(storageRoot, { recursive: true });
fs.mkdirSync(coverRoot, { recursive: true });

const upload = multer({
  dest: storageRoot,
  limits: { fileSize: 50 * 1024 * 1024 }
});

function normalizeDoc(body) {
  const title = String(body.title || '').trim();
  const url = String(body.url || '').trim();
  const summary = String(body.summary || '').trim() || null;
  const categoryId = body.categoryId ? Number(body.categoryId) : null;
  const source = String(body.source || 'feishu').trim() || 'feishu';
  const isFeatured = body.isFeatured === false
    || body.isFeatured === 0
    || body.isFeatured === '0'
    || body.isFeatured === 'false'
    ? 0
    : 1;
  const isPublic = body.isPublic === true
    || body.isPublic === 1
    || body.isPublic === '1'
    ? 1
    : 0;
  return { title, url, summary, categoryId, source, isFeatured, isPublic };
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getDoc(id) {
  return db.get(`
    SELECT d.id, d.title, d.url, d.summary, d.category_id, d.source,
           d.file_path, d.file_name, d.file_type, d.cover_path, d.is_featured, d.is_public,
           d.created_at, d.updated_at, c.name AS category_name
    FROM knowledge_docs d
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE d.id = ?
  `, [id]);
}

// 单个文档的访问判断：管理员放行，否则按 公开 OR 班级分类权限
function resolveAdmin(req, doc) {
  if (!doc) return false;
  const admin = resolveAdminFromToken(req.headers.authorization?.replace('Bearer ', ''));
  if (admin) return true;
  return canAccessKnowledge(req.student?.id, doc);
}

function getPublicDoc(row) {
  if (!row) return row;
  const fileUrl = row.file_path ? `/api/knowledge/${row.id}/file` : row.url;
  const coverUrl = row.cover_path ? `/api/knowledge/${row.id}/cover` : null;
  return { ...row, file_url: fileUrl, cover_url: coverUrl };
}

function safeFilePath(relativePath) {
  const target = path.resolve(storageRoot, relativePath || '');
  if (!target.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error('Invalid file path');
  }
  return target;
}

function detectMarkdownEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'utf8';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16-le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf16-be';

  const detected = chardet.detect(buffer);
  const normalized = String(detected || '').toLowerCase().replace(/[_\s]/g, '-');
  if (normalized.includes('gb') || normalized.includes('big5')) return detected;
  if (normalized.includes('utf-16')) return detected;
  return detected || 'utf8';
}

function decodeMarkdown(buffer) {
  const encoding = detectMarkdownEncoding(buffer);
  if (iconv.encodingExists(encoding)) {
    return { content: iconv.decode(buffer, encoding), encoding };
  }
  return { content: buffer.toString('utf8'), encoding: 'utf8' };
}

function isAllowedFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (['.md', '.markdown', '.mdown', '.mkd'].includes(ext)) return 'markdown';
  return null;
}

function cleanupFile(file) {
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
}

function cleanupFiles(files = []) {
  files.forEach(cleanupFile);
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

// 知识文档列表：管理员看全部；未登录只看 is_public=1；学生看 公开 + 所在班级可访问分类
router.get('/', optionalStudentAuth, (req, res) => {
  const featuredOnly = req.query.featured === '1';
  const docs = db.query(`
    SELECT d.id, d.title, d.url, d.summary, d.category_id, d.source,
           d.file_path, d.file_name, d.file_type, d.cover_path, d.is_featured, d.is_public,
           d.created_at, d.updated_at, c.name AS category_name
    FROM knowledge_docs d
    LEFT JOIN categories c ON c.id = d.category_id
    ${featuredOnly ? 'WHERE d.is_featured = 1' : ''}
    ORDER BY d.is_featured DESC, d.updated_at DESC, d.id DESC
  `);

  const admin = resolveAdminFromToken(req.headers.authorization?.replace('Bearer ', ''));
  if (admin) {
    return res.json(docs.map(getPublicDoc));
  }

  const accessibleCategories = req.student ? getAccessibleCategories(req.student.id) : [];
  const visible = docs.filter(doc =>
    doc.is_public === 1 || accessibleCategories.includes(doc.category_id)
  );
  res.json(visible.map(getPublicDoc));
});

router.post('/', adminAuth, (req, res, next) => {
  upload.fields([{ name: 'cover', maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ error: '封面图上传失败: ' + err.message });
    next();
  });
}, (req, res) => {
  const cover = req.files?.cover?.[0];
  const doc = normalizeDoc(req.body);
  if (!doc.title || !doc.url) {
    cleanupFile(cover);
    return res.status(400).json({ error: '标题和链接必填' });
  }
  if (!isValidUrl(doc.url)) {
    cleanupFile(cover);
    return res.status(400).json({ error: '请输入有效的 http/https 链接' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) {
      cleanupFile(cover);
      return res.status(400).json({ error: '分类不存在' });
    }
  }
  if (!isAllowedCover(cover)) {
    cleanupFile(cover);
    return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
  }

  const coverPath = saveCover(cover);
  const result = db.run(`
    INSERT INTO knowledge_docs (title, url, summary, category_id, source, cover_path, is_featured, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [doc.title, doc.url, doc.summary, doc.categoryId, doc.source, coverPath, doc.isFeatured, doc.isPublic]);
  res.status(201).json(getPublicDoc(getDoc(result.lastInsertRowid)));
});

router.post('/upload', adminAuth, (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过 50MB 限制' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const file = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  if (!file) return res.status(400).json({ error: '请选择文件' });

  const fileType = isAllowedFile(file);
  if (!fileType) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '仅支持 PDF 和 Markdown 文件' });
  }
  if (!isAllowedCover(cover)) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
  }

  const doc = normalizeDoc({
    ...req.body,
    url: `/api/knowledge/file/${file.filename}`,
    source: fileType
  });
  if (!doc.title) {
    cleanupFiles([file, cover]);
    return res.status(400).json({ error: '标题必填' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) {
      cleanupFiles([file, cover]);
      return res.status(400).json({ error: '分类不存在' });
    }
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const storedName = `${file.filename}${ext}`;
  const storedPath = path.join(storageRoot, storedName);
  fs.renameSync(file.path, storedPath);
  const coverPath = saveCover(cover);

  // 事务：INSERT 与 UPDATE url 必须原子
  const result = db.transaction(() => {
    const r = db.run(`
      INSERT INTO knowledge_docs (title, url, summary, category_id, source, file_path, file_name, file_type, cover_path, is_featured, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [doc.title, `/api/knowledge/${0}/file`, doc.summary, doc.categoryId, fileType, storedName, file.originalname, fileType, coverPath, doc.isFeatured, doc.isPublic]);
    db.run('UPDATE knowledge_docs SET url = ? WHERE id = ?', [`/api/knowledge/${r.lastInsertRowid}/file`, r.lastInsertRowid]);
    return r;
  });
  res.status(201).json(getPublicDoc(getDoc(result.lastInsertRowid)));
});

router.put('/:id', adminAuth, (req, res, next) => {
  upload.fields([{ name: 'cover', maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ error: '封面图上传失败: ' + err.message });
    next();
  });
}, (req, res) => {
  const existing = getDoc(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '知识文档不存在' });
  }

  const cover = req.files?.cover?.[0];
  const doc = normalizeDoc(req.body);
  if (!doc.title || (!doc.url && !existing.file_type)) {
    cleanupFile(cover);
    return res.status(400).json({ error: '标题和链接必填' });
  }
  if (!existing.file_type && !isValidUrl(doc.url)) {
    cleanupFile(cover);
    return res.status(400).json({ error: '请输入有效的 http/https 链接' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) {
      cleanupFile(cover);
      return res.status(400).json({ error: '分类不存在' });
    }
  }
  if (!isAllowedCover(cover)) {
    cleanupFile(cover);
    return res.status(400).json({ error: '封面图仅支持 JPG、PNG、WebP' });
  }

  const coverPath = saveCover(cover);
  if (coverPath && existing.cover_path) {
    const previousCover = safeCoverPath(existing.cover_path);
    if (fs.existsSync(previousCover)) fs.unlinkSync(previousCover);
  }

  db.run(`
    UPDATE knowledge_docs
    SET title = ?, url = ?, summary = ?, category_id = ?, source = ?,
        cover_path = COALESCE(?, cover_path), is_featured = ?, is_public = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    doc.title,
    existing.file_type ? existing.url : doc.url,
    doc.summary,
    doc.categoryId,
    existing.file_type ? existing.source : doc.source,
    coverPath,
    doc.isFeatured,
    existing.file_type ? doc.isPublic : existing.is_public,
    req.params.id
  ]);
  res.json(getPublicDoc(getDoc(req.params.id)));
});

router.get('/:id/file', optionalStudentAuth, (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc || !doc.file_path) {
    return res.status(404).send('File not found');
  }
  if (!resolveAdmin(req, doc)) {
    return res.status(403).send('Forbidden');
  }

  const filePath = safeFilePath(doc.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  if (doc.file_type === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name || 'document.pdf')}"`);
    return fs.createReadStream(filePath).pipe(res);
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  return fs.createReadStream(filePath).pipe(res);
});

router.get('/:id/markdown', optionalStudentAuth, (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc || doc.file_type !== 'markdown' || !doc.file_path) {
    return res.status(404).json({ error: 'Markdown 文档不存在' });
  }
  if (!resolveAdmin(req, doc)) {
    return res.status(403).json({ error: '无权限访问该文档' });
  }

  const filePath = safeFilePath(doc.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Markdown 文件不存在' });
  }

  const decoded = decodeMarkdown(fs.readFileSync(filePath));
  res.json({ content: decoded.content, encoding: decoded.encoding });
});

router.get('/:id/cover', optionalStudentAuth, (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc || !doc.cover_path) {
    return res.status(404).send('Cover not found');
  }
  // 封面与文档本体同权限：非公开文档的封面也不能被未授权用户枚举
  if (!resolveAdmin(req, doc)) {
    return res.status(403).send('Forbidden');
  }

  const coverPath = safeCoverPath(doc.cover_path);
  if (!fs.existsSync(coverPath)) {
    return res.status(404).send('Cover not found');
  }
  res.sendFile(coverPath);
});

router.delete('/:id', adminAuth, (req, res) => {
  const existing = getDoc(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '知识文档不存在' });
  }
  // 先删 DB 记录（事务），再删文件。文件删除失败仅记日志，不影响一致性
  db.transaction(() => {
    db.run('DELETE FROM knowledge_docs WHERE id = ?', [req.params.id]);
  });
  if (existing.file_path) {
    try {
      const filePath = safeFilePath(existing.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      logger.error({ reqId: req.id, id: req.params.id, err: String(err) }, 'knowledge_delete_file_error');
    }
  }
  if (existing.cover_path) {
    try {
      const coverPath = safeCoverPath(existing.cover_path);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    } catch (err) {
      logger.error({ reqId: req.id, id: req.params.id, err: String(err) }, 'knowledge_delete_cover_error');
    }
  }
  res.json({ success: true });
});

module.exports = router;
