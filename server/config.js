/**
 * 集中式配置：所有可变参数从环境变量读取，启动时强校验关键项。
 * 避免散落的硬编码端口/密钥/路径。
 */
const path = require('path');
const fs = require('fs');

// Production keys must be explicit and must not be copied placeholders.
const JWT_SECRET = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === 'production';
const placeholderSecret = /(?:请替换|替换为|至少\d+|__dev_only|change[-_ ]?me|your[-_ ]?(?:jwt[-_ ]?)?secret|replace[-_ ]?(?:me|this))/i;
if (!JWT_SECRET || JWT_SECRET.trim().length < 32 || JWT_SECRET !== JWT_SECRET.trim() || placeholderSecret.test(JWT_SECRET)) {
  throw new Error(`${isProd ? '生产环境' : '开发环境'} JWT_SECRET 必须为至少 32 字符的随机密钥，不能使用模板或开发默认值`);
}


const port = Number(process.env.PORT) || 3142;

// CORS 白名单：逗号分隔，默认允许本机 dev server
const corsOrigin = (() => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true; // 未配置时维持旧行为（允许所有），但建议生产显式设置
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();

// 路径
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const lecturesDir = process.env.LECTURES_DIR ? path.resolve(process.env.LECTURES_DIR) : path.join(rootDir, 'lectures');
const dbPath = path.join(dataDir, 'edumanager.db');
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(dataDir, 'backups');
const backupRetention = Number(process.env.BACKUP_RETENTION ?? 7);
if (!Number.isInteger(backupRetention) || backupRetention < 1) {
  throw new Error('BACKUP_RETENTION 必须为大于 0 的整数');
}

// 确保关键目录存在
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(lecturesDir, { recursive: true });

module.exports = {
  port,
  jwtSecret: JWT_SECRET,
  corsOrigin,
  rootDir,
  dataDir,
  lecturesDir,
  dbPath,
  backupDir,
  backupRetention,
  lectureVersionsDir: path.join(dataDir, 'lecture-versions'),
  uploadsDir: process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(dataDir, 'uploads'),
  knowledgeDir: path.join(dataDir, 'knowledge'),
  lectureCoverDir: path.join(dataDir, 'covers', 'lectures'),
  knowledgeCoverDir: path.join(dataDir, 'covers', 'knowledge'),
  isProd,
  isDev: !isProd
};
