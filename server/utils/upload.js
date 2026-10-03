const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const LIMITS = Object.freeze({
  maxUploadBytes: 200 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntries: 5000,
  maxDepth: 32,
  maxRatio: 200,
  timeoutMs: 60000
});

function validateUpload(file) {
  const name = String(file?.originalname || '');
  if (!name || /[\\/\u0000-\u001f]/.test(name) || /^[A-Za-z]:/.test(name) || name.length > 255) {
    throw new Error('文件名包含不安全路径');
  }
  if (!/\.(zip|html?|xhtml)$/i.test(name)) throw new Error('仅支持 ZIP 或 HTML 文件');
  const stat = fs.lstatSync(file.path);
  if (!stat.isFile() || stat.size === 0 || stat.size > LIMITS.maxUploadBytes) {
    throw new Error('上传文件为空或超过 200MB 限制');
  }
}

function runWorker(file, destination, options = {}) {
  validateUpload(file);
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'upload-worker.js'), {
      workerData: { file, destination, limits: { ...LIMITS, ...options } },
      resourceLimits: { maxOldGenerationSizeMb: 256 }
    });
    let settled = false;
    const settle = async (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Wait until the worker can no longer write before the caller removes staging.
      await worker.terminate();
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => settle(new Error('ZIP 校验或解压超时，请缩小文件后重试')), options.timeoutMs || LIMITS.timeoutMs);
    worker.once('message', message => settle(message.error ? new Error(message.error) : null, message.result));
    worker.once('error', err => settle(err));
    worker.once('exit', code => {
      if (!settled) settle(new Error(`ZIP 处理进程异常退出 (${code})`));
    });
  });
}

async function inspectUpload(file, options) {
  return runWorker(file, null, options);
}

async function extractLectureContent(file, destination, options) {
  return runWorker(file, destination, options);
}

module.exports = { LIMITS, validateUpload, inspectUpload, extractLectureContent };
