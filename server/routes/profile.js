const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const adminAuth = require('../middleware/adminAuth');

const PROFILE_DIR = path.join(__dirname, '..', '..', 'data', 'profile');

// Ensure profile directory exists
if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

// Check if profile exists
router.get('/check', (req, res) => {
  const indexPath = path.join(PROFILE_DIR, 'index.html');
  res.json({ exists: fs.existsSync(indexPath) });
});

// Serve profile files (public, for iframe)
router.get('/:filename', (req, res) => {
  const filename = req.params.filename
  // Security: only allow files in profile dir
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(403).json({ error: '非法路径' });
  }
  const filePath = path.join(PROFILE_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' })
  }
  res.sendFile(filePath)
})

// Upload profile zip (admin only)
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'data', 'temp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true)
    } else {
      cb(new Error('只支持 ZIP 格式'))
    }
  }
})

router.post('/upload', adminAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' })
    }

    const zip = new AdmZip(req.file.path)
    const entries = zip.getEntries()

    // Check for index.html at root
    const hasIndex = entries.some(e => 
      e.entryName.replace(/\\/g, '/') === 'index.html' || 
      e.entryName.endsWith('/index.html')
    )

    if (!hasIndex) {
      // Cleanup temp file
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'ZIP 包中必须包含 index.html' })
    }

    // Clean existing profile
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true })
    fs.mkdirSync(PROFILE_DIR, { recursive: true })

    // Extract, flattening if zip has a root folder
    // Find common prefix if all entries share one
    const dirs = entries.filter(e => !e.isDirectory).map(e => {
      const parts = e.entryName.replace(/\\/g, '/').split('/')
      return parts.length > 1 ? parts[0] : null
    }).filter(Boolean)
    
    const allSameDir = dirs.length > 0 && dirs.every(d => d === dirs[0]) && dirs.length === entries.filter(e => !e.isDirectory).length

    entries.forEach(entry => {
      if (entry.isDirectory) return
      let entryName = entry.entryName.replace(/\\/g, '/')
      if (allSameDir) {
        entryName = entryName.substring(entryName.indexOf('/') + 1)
      }
      const targetPath = path.join(PROFILE_DIR, entryName)
      // Ensure subdirectory exists
      const dir = path.dirname(targetPath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(targetPath, entry.getData())
    })

    // Cleanup temp file
    fs.unlinkSync(req.file.path)

    res.json({ success: true, message: '个人主页已更新' })
  } catch (err) {
    console.error('[PROFILE UPLOAD]', err)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: '上传失败：' + err.message })
  }
})

// Delete profile (admin only)
router.delete('/upload', adminAuth, (req, res) => {
  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true })
    fs.mkdirSync(PROFILE_DIR, { recursive: true })
    res.json({ success: true, message: '个人主页已清除' })
  } catch (err) {
    res.status(500).json({ error: '操作失败' })
  }
})

module.exports = router
