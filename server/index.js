const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const lectureRoutes = require('./routes/lecture');
const categoryRoutes = require('./routes/category');

const app = express();
const PORT = 3142;

// 初始化数据库
db.init().then(() => {
  console.log('✅ Database initialized');
  
  // 中间件
  app.use(cors());
  app.use(express.json());
  
  // 静态文件 - 讲义目录
  app.use('/lectures', express.static(path.join(__dirname, '../lectures')));
  
  // API 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/lectures', lectureRoutes);
  app.use('/api/categories', categoryRoutes);
  
  // 前端静态文件（生产时由 Vite 构建）
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  // 所有其他路由返回前端入口
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
  
  app.listen(PORT, () => {
    console.log(`✅ EduManager running at http://localhost:${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api`);
    console.log(`🎓 Student: http://localhost:${PORT}`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('❌ Database init failed:', err);
});