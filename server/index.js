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

const authRoutes = require('./routes/auth');
const lectureRoutes = require('./routes/lecture');
const categoryRoutes = require('./routes/category');
const adminRoutes = require('./routes/admin');
const knowledgeRoutes = require('./routes/knowledge');

const app = express();
const PORT = config.port;

// 请求日志 + requestId（结构化，脱敏 query 中的 token）
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.on('finish', () => {
    const safeUrl = req.url.replace(/([?&]access_token=)[^&]+/i, '$1***');
    logger.info({ reqId: req.id, method: req.method, url: safeUrl, status: res.statusCode, ms: Date.now() - req.startTime || '-' }, 'req');
  });
  req.startTime = Date.now();
  next();
});

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// 健康检查（无需鉴权，供负载均衡/监控探活）
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
});

const lecturesRoot = path.resolve(__dirname, '../lectures');
app.get('/lectures/:lectureSlug/*', optionalStudentAuth, (req, res) => {
  const lecture = db.get('SELECT id, slug, category_id, is_public FROM lectures WHERE slug = ?', [req.params.lectureSlug]);
  if (!lecture) {
    return res.status(404).send('Lecture not found');
  }
  if (!canAccessLecture(req.student?.id, lecture)) {
    return res.status(403).send('Forbidden');
  }

  const requested = path.resolve(lecturesRoot, req.params.lectureSlug, req.params[0] || '');
  if (!requested.startsWith(`${lecturesRoot}${path.sep}`) || !fs.existsSync(requested)) {
    return res.status(404).send('File not found');
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

// 2) 进程级兜底：未捕获的异常/promise 拒绝绝不退出进程
process.on('uncaughtException', (err) => {
  logger.error({ err: err && err.stack ? err.stack : String(err) }, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason && reason.stack ? reason.stack : String(reason) }, 'unhandledRejection');
});

// 3) 优雅关闭：收到信号时停止接收新连接、等已接收请求处理完、关库
let server;
function shutdown(signal) {
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
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 启动数据库并监听（db.init 为同步，包裹 try/catch）
try {
  db.init();
  // 启动时自动备份一次（仅生产，避免开发时频繁备份）
  if (config.isProd) {
    db.backup('.startup') ;
  }
  server = app.listen(PORT, () => logger.info({ port: PORT }, 'server_started'));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error({ port: PORT }, 'port_in_use');
    } else {
      logger.error({ err: err && err.stack ? err.stack : String(err) }, 'listen_error');
    }
    process.exit(1);
  });
} catch (err) {
  logger.error({ err: err && err.stack ? err.stack : String(err) }, 'db_init_error');
  process.exit(1);
}
