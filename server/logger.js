/**
 * 极简结构化日志：JSON 行输出，便于 grep/采集。
 * 接口与 pino 兼容（logger.info(obj, msg)），未来可平滑替换为 pino。
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'];

function write(level, obj, msg) {
  if (LEVELS[level] > currentLevel) return;
  const record = { time: new Date().toISOString(), level, msg };
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    Object.assign(record, obj);
  } else if (obj !== undefined) {
    record.data = obj;
  }
  // 循环引用等场景 stringify 会抛错，兜底降级避免炸掉调用方（含全局错误处理器）
  let line;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({ time: record.time, level, msg: String(msg), note: 'stringify_failed' });
  }
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  error: (obj, msg) => write('error', obj, msg),
  warn: (obj, msg) => write('warn', obj, msg),
  info: (obj, msg) => write('info', obj, msg),
  debug: (obj, msg) => write('debug', obj, msg),
  child: (bindings) => ({
    error: (obj, msg) => write('error', { ...bindings, ...(typeof obj === 'object' ? obj : { data: obj }) }, msg),
    warn: (obj, msg) => write('warn', { ...bindings, ...(typeof obj === 'object' ? obj : { data: obj }) }, msg),
    info: (obj, msg) => write('info', { ...bindings, ...(typeof obj === 'object' ? obj : { data: obj }) }, msg),
    debug: (obj, msg) => write('debug', { ...bindings, ...(typeof obj === 'object' ? obj : { data: obj }) }, msg)
  })
};
