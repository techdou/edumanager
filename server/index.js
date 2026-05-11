const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const lectureRoutes = require('./routes/lecture');
const categoryRoutes = require('./routes/category');
const adminRoutes = require('./routes/admin');
const knowledgeRoutes = require('./routes/knowledge');

const app = express();
const PORT = 3142;

app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);

app.use('/lectures', express.static(path.join(__dirname, '../lectures'), { fallthrough: false }));

const distPath = path.join(__dirname, '../client/dist');
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.get('*', (req, res) => {
  console.log('[CATCHALL]', req.url);
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distPath, 'index.html'));
});

db.init().then(() => {
  app.listen(PORT, () => console.log('[START] Server on', PORT));
}).catch(err => {
  console.error('[START] DB error:', err);
});
