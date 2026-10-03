const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const { optionalStudentAuth } = require('./middleware/studentAuth');
const { canAccessLecture } = require('./utils/permissions');
const { resolveContentFile } = require('./utils/contentFiles');

const authRoutes = require('./routes/auth');
const lectureRoutes = require('./routes/lecture');
const categoryRoutes = require('./routes/category');
const adminRoutes = require('./routes/admin');
const knowledgeRoutes = require('./routes/knowledge');
const progressRoutes = require('./routes/progress');

const app = express();
app.disable('x-powered-by');
const PORT = config.port;

// 请求日志 + requestId（结构化，脱敏 query 中的 token）
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.on('finish', () => {
    const safeUrl = req.originalUrl.replace(/([?&]access_token=)[^&]+/gi, '$1***');
    logger.info({ reqId: req.id, method: req.method, url: safeUrl, status: res.statusCode, ms: Date.now() - req.startTime || '-' }, 'req');
  });
  req.startTime = Date.now();
  next();
});

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 健康检查（无需鉴权，供负载均衡/监控探活）
app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    db.get('SELECT 1 AS ok');
    res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
  } catch {
    res.status(503).json({ ok: false });
  }
});

const lecturesRoot = config.lecturesDir;
app.get('/content-bridge.js', (req, res) => res.sendFile(path.join(__dirname, 'content-bridge.js')));
app.get('/lectures/:lectureSlug/*', optionalStudentAuth, (req, res) => {
  const lecture = db.get('SELECT id, slug, category_id, is_public FROM lectures WHERE slug = ?', [req.params.lectureSlug]);
  if (!lecture) {
    return res.status(404).send('Lecture not found');
  }
  if (!canAccessLecture(req.student?.id, lecture)) {
    return res.status(403).send('Forbidden');
  }

  const lectureRoot = path.resolve(lecturesRoot, lecture.slug);
  const requested = lectureRoot.startsWith(`${path.resolve(lecturesRoot)}${path.sep}`)
    ? resolveContentFile(lectureRoot, req.params[0] || '') : null;
  if (!requested) {
    return res.status(404).send('File not found');
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-same-site-none-cookies; frame-ancestors 'self'");
  if (/\.(html?|xhtml)$/i.test(requested)) {
    // Uploaded HTML keeps its own scripts but cannot access the app's origin/storage.
    if (req.method === 'HEAD') return res.type('html').end();
    return fs.readFile(requested, 'utf8', (err, html) => {
      if (err) return res.status(500).send('Lecture temporarily unavailable');
      const bridge = '<script src="/content-bridge.js"></script>';
      res.type('html').send(/<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${bridge}</body>`) : html + bridge);
    });
  }
  res.sendFile(requested);
});

const distPath = path.join(__dirname, '../client/dist');
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distPath, 'index.html'));
});

// ===== 全局错误兜底：单请求异常不拖垮进程 =====
// 1) 同步/路由内异常
app.use((err, req, res, next) => {
  logger.error({ reqId: req.id, err: err && err.stack ? err.stack : String(err) }, 'route_error');
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  if (err && err.name === 'SyntaxError') {
    return res.status(400).json({ error: '请求体格式错误' });
  }
  res.status(500).json({ error: '服务器内部错误' });
});

// 3) 优雅关闭：收到信号时停止接收新连接、等已接收请求处理完、关库
let server;
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown_start');
  if (!server) return process.exit(0);
  server.close((err) => {
    if (err) logger.error({ err: String(err) }, 'shutdown_error');
    try { db.close && db.close(); } catch (e) {}
    process.exit(0);
  });
  // 兜底：10 秒内没关完强制退出，避免僵尸进程
  setTimeout(() => {
    logger.warn('shutdown_force_exit');
    process.exit(1);
  }, 10000).unref();
}
async function start(port = PORT) {
  db.init();
  if (config.isProd) {
    await db.backup('.startup');
  }
  db.markLive();
  await new Promise((resolve, reject) => {
    server = app.listen(port, resolve);
    server.once('error', reject);
  });
  logger.info({ port: server.address().port }, 'server_started');
  return server;
}

if (require.main === module) {
  // After a fatal error, stop immediately; a process supervisor may safely restart us.
  const fatal = (err) => {
    logger.error({ err: err?.stack || String(err) }, 'fatal_error');
    try { db.close(); } catch {}
    process.exit(1);
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  start().catch(fatal);
}

module.exports = { app, start };
