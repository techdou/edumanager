const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// 分类列表
router.get('/', (req, res) => {
  const categories = db.query('SELECT * FROM categories ORDER BY created_at DESC');
  res.json(categories);
});

// 创建分类（需管理员）
router.post('/', adminAuth, (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '分类名称必填' });
  }
  
  const result = db.run('INSERT INTO categories (name) VALUES (?)', [name]);
  res.json({ id: result.lastInsertRowid, name });
});

// 删除分类（需管理员）
router.delete('/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  
  // 检查是否有讲义使用此分类
  const lectures = db.query('SELECT id FROM lectures WHERE category_id = ?', [id]);
  if (lectures.length > 0) {
    return res.status(400).json({ error: '该分类下有讲义，无法删除' });
  }
  
  db.run('DELETE FROM categories WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;