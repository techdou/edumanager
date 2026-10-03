/** Filesystem publication with compensation if the synchronous DB commit fails. */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function assertWithin(root, target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`路径越界: ${target} 不在 ${root} 下`);
  }
  return resolved;
}

// All awaits happen before publication. The rename + DB commit block is synchronous,
// so another request in this Node process cannot observe a half-published version.
// A retained previousDir lives under .history, never under a lecture's public path.
async function atomicWriteDir(rootDir, targetDir, populateFn, options = {}) {
  targetDir = assertWithin(rootDir, targetDir);
  const sourceDir = assertWithin(rootDir, options.sourceDir || targetDir);
  const tmpDir = fs.mkdtempSync(path.join(rootDir, '.upload-stage-'));
  let previousDir = null;
  let published = false;
  try {
    const value = await populateFn(tmpDir);
    if (sourceDir !== targetDir && fs.existsSync(targetDir)) {
      throw new Error('目标目录已存在，不能覆盖其他讲义');
    }
    if (fs.existsSync(sourceDir)) {
      if (fs.lstatSync(sourceDir).isSymbolicLink()) throw new Error('讲义目录不能是符号链接');
      const historyRoot = path.join(rootDir, '.history');
      fs.mkdirSync(historyRoot, { recursive: true });
      if (fs.lstatSync(historyRoot).isSymbolicLink()) throw new Error('历史目录不能是符号链接');
      previousDir = path.join(historyRoot, randomUUID());
      fs.renameSync(sourceDir, previousDir);
    }
    fs.renameSync(tmpDir, targetDir);
    published = true;
    const result = options.commit?.(value, previousDir);
    if (result && typeof result.then === 'function') {
      throw new Error('目录发布的数据库提交必须同步完成');
    }
    if (previousDir && !options.retainPrevious) {
      // Publication is already committed. Cleanup failures must not roll it back.
      try { fs.rmSync(previousDir, { recursive: true, force: true }); } catch {}
      previousDir = null;
    }
    return { value, result, previousDir };
  } catch (err) {
    try {
      if (published) fs.rmSync(targetDir, { recursive: true, force: true });
      if (previousDir) fs.renameSync(previousDir, sourceDir);
    } catch (rollbackError) {
      err.message += `；目录回滚失败: ${rollbackError.message}`;
      err.rollbackError = rollbackError;
    }
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function safeRemoveDir(rootDir, targetDir) {
  const resolved = assertWithin(rootDir, targetDir);
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
}

function safeRemoveFile(rootDir, targetFile) {
  const resolved = assertWithin(rootDir, targetFile);
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}

module.exports = { assertWithin, atomicWriteDir, safeRemoveDir, safeRemoveFile };
