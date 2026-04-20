const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// ZIP 上传配置
const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// 讲义列表
router.get('/', (req, res) => {
  const lectures = db.query(`
    SELECT l.id, l.title, l.slug, l.zip_name, l.category_id, l.created_at,
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
    return { ...lecture, chapters };
  });
  
  res.json(lecturesWithChapters);
});

// 上传 ZIP 讲义
router.post('/', upload.single('file'), (req, res) => {
  const { title, slug, categoryId } = req.body;
  const file = req.file;
  
  if (!file || !title || !slug || !categoryId) {
    return res.status(400).json({ error: '所有字段必填' });
  }
  
  if (!file.originalname.endsWith('.zip')) {
    return res.status(400).json({ error: '仅支持 ZIP 文件' });
  }
  
  try {
    // 解压 ZIP
    const zip = new AdmZip(file.path);
    const zipName = path.parse(file.originalname).name;
    const extractPath = path.join(__dirname, '../../lectures', slug);
    
    // 确保目录存在
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    zip.extractAllTo(extractPath, true);
    
    // 创建讲义记录
    const result = db.run(`
      INSERT INTO lectures (title, slug, zip_name, category_id) VALUES (?, ?, ?, ?)
    `, [title, slug, zipName, categoryId]);
    
    const lectureId = result.lastInsertRowid;
    
    // 分析目录结构，创建章节
    const entries = zip.getEntries();
    const directories = entries
      .filter(e => e.isDirectory && !e.entryName.startsWith('.'))
      .map(e => e.entryName.replace(/\/$/, '').split('/')[0])
      .filter((d, i, arr) => d && arr.indexOf(d) === i);
    
    if (directories.length === 0) {
      // 单层 ZIP：没有子目录，直接把解压内容当作唯一章节
      const htmlFiles = entries
        .filter(e => !e.isDirectory && e.entryName.endsWith('.html'));
      
      if (htmlFiles.length > 0) {
        const chapterDir = slug;
        const chapterPath = path.join(extractPath, chapterDir);
        fs.mkdirSync(chapterPath, { recursive: true });
        
        // 移动所有文件到章节目录
        entries.forEach(entry => {
          if (!entry.isDirectory && !entry.entryName.startsWith('.') && !entry.entryName.includes('/')) {
            const targetPath = path.join(chapterPath, path.basename(entry.entryName));
            const isIndex = path.basename(entry.entryName).endsWith('.html');
            const finalName = isIndex ? 'index.html' : path.basename(entry.entryName);
            fs.writeFileSync(path.join(chapterPath, finalName), entry.getData());
          }
        });
        
        db.run(`
          INSERT INTO chapters (lecture_id, title, slug, path, order_index) VALUES (?, ?, ?, ?, ?)
        `, [lectureId, title, slug, `${slug}/${slug}`, 0]);
      }
    } else {
      directories.forEach((dir, index) => {
        const dirPath = path.join(extractPath, dir);
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
        `, [lectureId, dir, dir, `${slug}/${dir}`, index]);
        }
      });
    }
    
    // 删除临时文件
    fs.unlinkSync(file.path);
    
    const chapters = db.query('SELECT * FROM chapters WHERE lecture_id = ? ORDER BY order_index', [lectureId]);
    
    res.json({ 
      id: lectureId, 
      title, 
      slug, 
      chapters
    });
    
  } catch (err) {
    console.error('ZIP 处理错误:', err);
    res.status(500).json({ error: 'ZIP 解压失败' });
  }
});

// 删除讲义
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  const lecture = db.get('SELECT * FROM lectures WHERE id = ?', [id]);
  if (!lecture) {
    return res.status(404).json({ error: '讲义不存在' });
  }
  
  // 删除数据库记录
  db.run('DELETE FROM chapters WHERE lecture_id = ?', [id]);
  db.run('DELETE FROM lectures WHERE id = ?', [id]);
  
  // 删除文件目录
  const lecturePath = path.join(__dirname, '../../lectures', lecture.slug);
  if (fs.existsSync(lecturePath)) {
    fs.rmSync(lecturePath, { recursive: true });
  }
  
  res.json({ success: true });
});

module.exports = router;