/**
 * 文件系统鲁棒性工具：
 * - atomicWriteDir: 写到临时目录，全部成功后再原子 rename 到目标（避免半成品目录残留）
 * - safeRemoveDir: 安全删除目录（带路径校验）
 * - safeRemoveFile: 安全删除文件
 *
 * 设计原则：文件操作失败不静默，配合 db.transaction() 保证"DB 与文件系统最终一致"。
 */
const fs = require('fs');
const path = require('path');

// 校验目标路径必须落在 root 下，防目录穿越
function assertWithin(root, target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`路径越界: ${target} 不在 ${root} 下`);
  }
  return resolved;
}

// 原子写入目录：先写到 <dir>.tmp-<rand>/，成功后 rename 覆盖目标
// 步骤：1)清理旧 tmp 2)解压/写入到 tmp 3)删除旧目标 4)rename tmp->目标
// 若中途失败，调用 cleanup 回滚 tmp 目录
async function atomicWriteDir(rootDir, targetDir, populateFn) {
  const tmpDir = `${targetDir}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  assertWithin(rootDir, tmpDir);
  assertWithin(rootDir, targetDir);

  try {
    // 清理可能残留的同名 tmp
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // 由调用方填充内容
    await populateFn(tmpDir);

    // 删除旧目标（如果存在）
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    // 原子 rename（同分区）
    fs.renameSync(tmpDir, targetDir);
  } catch (err) {
    // 失败时清理 tmp，避免残留垃圾
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    throw err;
  }
}

// 安全删除目录（带路径校验）
function safeRemoveDir(rootDir, targetDir) {
  const resolved = assertWithin(rootDir, targetDir);
  if (fs.existsSync(resolved)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

// 安全删除文件（带路径校验）
function safeRemoveFile(rootDir, targetFile) {
  const resolved = assertWithin(rootDir, targetFile);
  if (fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

module.exports = { assertWithin, atomicWriteDir, safeRemoveDir, safeRemoveFile };
