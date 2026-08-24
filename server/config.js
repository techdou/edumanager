/**
 * 集中式配置：所有可变参数从环境变量读取，启动时强校验关键项。
 * 避免散落的硬编码端口/密钥/路径。
 */
const path = require('path');
const fs = require('fs');

// JWT_SECRET 强校验：缺失或过短直接拒绝启动，杜绝默认密钥伪造 token。
// 不提供任何兜底值——源码里的公开兜底密钥等于允许伪造任意管理员 token
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[CONFIG] 致命错误：未设置 JWT_SECRET 环境变量（或长度不足 32）。');
  console.error('[CONFIG] 请在项目根目录 .env 文件中设置 JWT_SECRET=<至少32位随机字符串>');
  console.error('[CONFIG] 示例生成：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
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

// 确保关键目录存在
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(lecturesDir, { recursive: true });

// 依赖探测：优先用外部解压器（编码兼容更好），缺失时降级 adm-zip 纯 JS 解压
function detectUnarchiver() {
  const { execFileSync } = require('child_process');
  for (const cmd of ['unar', 'unzip']) {
    try {
      execFileSync(cmd, ['-v'], { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return null;
}
const unarchiver = detectUnarchiver();
if (!unarchiver) {
  console.warn('[CONFIG] 警告：未检测到 unar 或 unzip，ZIP 解压将降级为 adm-zip（纯 JS，GB编码文件名可能乱码）。');
}

module.exports = {
  port,
  jwtSecret: JWT_SECRET,
  corsOrigin,
  rootDir,
  dataDir,
  lecturesDir,
  dbPath,
  uploadsDir: path.join(__dirname, 'uploads'),
  knowledgeDir: path.join(dataDir, 'knowledge'),
  lectureCoverDir: path.join(dataDir, 'covers', 'lectures'),
  knowledgeCoverDir: path.join(dataDir, 'covers', 'knowledge'),
  unarchiver,
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV !== 'production'
};
