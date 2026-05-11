const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const chardet = require('chardet');
const iconv = require('iconv-lite');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
const storageRoot = path.resolve(__dirname, '../../data/knowledge');
fs.mkdirSync(storageRoot, { recursive: true });

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
  const isFeatured = body.isFeatured === false || body.isFeatured === 0 ? 0 : 1;
  return { title, url, summary, categoryId, source, isFeatured };
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
           d.file_path, d.file_name, d.file_type, d.is_featured,
           d.created_at, d.updated_at, c.name AS category_name
    FROM knowledge_docs d
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE d.id = ?
  `, [id]);
}

function getPublicDoc(row) {
  if (!row) return row;
  const fileUrl = row.file_path ? `/api/knowledge/${row.id}/file` : row.url;
  return { ...row, file_url: fileUrl };
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

router.get('/', (req, res) => {
  const featuredOnly = req.query.featured === '1';
  const docs = db.query(`
    SELECT d.id, d.title, d.url, d.summary, d.category_id, d.source,
           d.file_path, d.file_name, d.file_type, d.is_featured,
           d.created_at, d.updated_at, c.name AS category_name
    FROM knowledge_docs d
    LEFT JOIN categories c ON c.id = d.category_id
    ${featuredOnly ? 'WHERE d.is_featured = 1' : ''}
    ORDER BY d.is_featured DESC, d.updated_at DESC, d.id DESC
  `);
  res.json(docs.map(getPublicDoc));
});

router.post('/', adminAuth, (req, res) => {
  const doc = normalizeDoc(req.body);
  if (!doc.title || !doc.url) {
    return res.status(400).json({ error: '标题和链接必填' });
  }
  if (!isValidUrl(doc.url)) {
    return res.status(400).json({ error: '请输入有效的 http/https 链接' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) return res.status(400).json({ error: '分类不存在' });
  }

  const result = db.run(`
    INSERT INTO knowledge_docs (title, url, summary, category_id, source, is_featured)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [doc.title, doc.url, doc.summary, doc.categoryId, doc.source, doc.isFeatured]);
  res.status(201).json(getPublicDoc(getDoc(result.lastInsertRowid)));
});

router.post('/upload', adminAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过 50MB 限制' });
      }
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请选择文件' });

  const fileType = isAllowedFile(file);
  if (!fileType) {
    cleanupFile(file);
    return res.status(400).json({ error: '仅支持 PDF 和 Markdown 文件' });
  }

  const doc = normalizeDoc({
    ...req.body,
    url: `/api/knowledge/file/${file.filename}`,
    source: fileType
  });
  if (!doc.title) {
    cleanupFile(file);
    return res.status(400).json({ error: '标题必填' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) {
      cleanupFile(file);
      return res.status(400).json({ error: '分类不存在' });
    }
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const storedName = `${file.filename}${ext}`;
  const storedPath = path.join(storageRoot, storedName);
  fs.renameSync(file.path, storedPath);

  const result = db.run(`
    INSERT INTO knowledge_docs (title, url, summary, category_id, source, file_path, file_name, file_type, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [doc.title, `/api/knowledge/${0}/file`, doc.summary, doc.categoryId, fileType, storedName, file.originalname, fileType, doc.isFeatured]);
  db.run('UPDATE knowledge_docs SET url = ? WHERE id = ?', [`/api/knowledge/${result.lastInsertRowid}/file`, result.lastInsertRowid]);
  res.status(201).json(getPublicDoc(getDoc(result.lastInsertRowid)));
});

router.put('/:id', adminAuth, (req, res) => {
  const existing = getDoc(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '知识文档不存在' });
  }

  const doc = normalizeDoc(req.body);
  if (!doc.title || !doc.url) {
    return res.status(400).json({ error: '标题和链接必填' });
  }
  if (!isValidUrl(doc.url)) {
    return res.status(400).json({ error: '请输入有效的 http/https 链接' });
  }
  if (doc.categoryId) {
    const category = db.get('SELECT id FROM categories WHERE id = ?', [doc.categoryId]);
    if (!category) return res.status(400).json({ error: '分类不存在' });
  }

  db.run(`
    UPDATE knowledge_docs
    SET title = ?, url = ?, summary = ?, category_id = ?, source = ?, is_featured = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [doc.title, doc.url, doc.summary, doc.categoryId, doc.source, doc.isFeatured, req.params.id]);
  res.json(getPublicDoc(getDoc(req.params.id)));
});

router.get('/:id/file', (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc || !doc.file_path) {
    return res.status(404).send('File not found');
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

router.get('/:id/markdown', (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc || doc.file_type !== 'markdown' || !doc.file_path) {
    return res.status(404).json({ error: 'Markdown 文档不存在' });
  }

  const filePath = safeFilePath(doc.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Markdown 文件不存在' });
  }

  const decoded = decodeMarkdown(fs.readFileSync(filePath));
  res.json({ content: decoded.content, encoding: decoded.encoding });
});

router.delete('/:id', adminAuth, (req, res) => {
  const existing = getDoc(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '知识文档不存在' });
  }
  if (existing.file_path) {
    const filePath = safeFilePath(existing.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.run('DELETE FROM knowledge_docs WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
