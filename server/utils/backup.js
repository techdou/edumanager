/** Offline, complete backups. Call before listening, or after stopping the service. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATABASE_FILE = 'data/edumanager.db';
const CONTENT_DIRS = ['lectures', 'data/knowledge', 'data/covers', 'data/lecture-versions'];

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filename, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, bytes));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function filesUnder(root, base = root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`备份不接受符号链接: ${path.relative(base, filename)}`);
    if (entry.isDirectory()) result.push(...filesUnder(filename, base));
    else if (entry.isFile()) result.push(path.relative(base, filename).split(path.sep).join('/'));
    else throw new Error(`备份不接受特殊文件: ${path.relative(base, filename)}`);
  }
  return result;
}

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(source)) return;
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`备份源不可为符号链接: ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    else throw new Error(`备份不接受符号链接或特殊文件: ${from}`);
  }
}

function checkDatabase(filename) {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const checks = database.pragma('integrity_check');
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok') throw new Error('备份数据库完整性校验失败');
  } finally {
    database.close();
  }
}

function verifyBackup(directory) {
  const root = path.resolve(directory);
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('备份目录不可为符号链接');
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.lstatSync(manifestPath).isFile() || fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error('无效备份清单');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || manifest.database !== DATABASE_FILE || !Array.isArray(manifest.files)) throw new Error('不支持的备份清单');
  const actual = new Set(filesUnder(root).filter(name => name !== 'manifest.json'));
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !actual.has(file.path) || seen.has(file.path)) throw new Error('备份文件列表不匹配');
    const allowed = file.path === DATABASE_FILE || CONTENT_DIRS.some(dir => file.path.startsWith(`${dir}/`));
    if (!allowed || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('无效备份文件记录');
    const filename = path.join(root, file.path);
    if (fs.statSync(filename).size !== file.size || hashFile(filename) !== file.sha256) throw new Error(`备份文件校验失败: ${file.path}`);
    seen.add(file.path);
  }
  if (!seen.has(DATABASE_FILE) || seen.size !== actual.size) throw new Error('备份文件缺失或包含未登记文件');
  checkDatabase(path.join(root, DATABASE_FILE));
  return manifest;
}

function pruneBackups(root, retention, keep) {
  const backups = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^backup-[\dT-]+Z(?:[.\w-]*)-[a-f0-9]{8}$/.test(entry.name))
    .map(entry => path.join(root, entry.name))
    .filter(directory => {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
        return manifest.version === 1 && manifest.database === DATABASE_FILE;
      } catch { return false; }
    })
    .sort().reverse();
  const retained = new Set([keep, ...backups.filter(directory => directory !== keep).slice(0, retention - 1)]);
  for (const directory of backups) if (!retained.has(directory)) fs.rmSync(directory, { recursive: true });
}

async function createBackup(database, options, suffix = '') {
  const retention = options.backupRetention ?? 7;
  if (!Number.isInteger(retention) || retention < 1) throw new Error('备份保留数量必须为正整数');
  const backupRoot = path.resolve(options.backupDir);
  const sources = [
    [options.lecturesDir, 'lectures'],
    [options.knowledgeDir, 'data/knowledge'],
    [path.join(options.dataDir, 'covers'), 'data/covers'],
    [options.lectureVersionsDir || path.join(options.dataDir, 'lecture-versions'), 'data/lecture-versions']
  ];
  fs.mkdirSync(backupRoot, { recursive: true });
  const realBackupRoot = fs.realpathSync(backupRoot);
  for (const [source] of sources) {
    const realSource = fs.existsSync(source) ? fs.realpathSync(source) : path.resolve(source);
    if (contains(realSource, realBackupRoot) || contains(realBackupRoot, realSource)) throw new Error('备份目录与内容目录不可互相包含');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSuffix = suffix.replace(/[^\w.-]/g, '').slice(0, 40);
  const name = `backup-${stamp}${safeSuffix}-${crypto.randomBytes(4).toString('hex')}`;
  const temporary = fs.mkdtempSync(path.join(backupRoot, '.partial-'));
  const destination = path.join(backupRoot, name);
  try {
    fs.mkdirSync(path.join(temporary, 'data'));
    // File copies are synchronous; the caller must not start serving writes until this Promise resolves.
    for (const [source, relative] of sources) copyTree(source, path.join(temporary, relative));
    await database.backup(path.join(temporary, DATABASE_FILE));
    // Store a standalone database: readonly verification must not create WAL/SHM sidecars.
    const snapshot = new Database(path.join(temporary, DATABASE_FILE));
    try { snapshot.pragma('journal_mode = DELETE'); } finally { snapshot.close(); }
    checkDatabase(path.join(temporary, DATABASE_FILE));
    const manifest = {
      version: 1,
      created_at: new Date().toISOString(),
      database: DATABASE_FILE,
      consistency: 'offline-single-process',
      files: filesUnder(temporary).map(relative => ({
        path: relative,
        size: fs.statSync(path.join(temporary, relative)).size,
        sha256: hashFile(path.join(temporary, relative))
      }))
    };
    fs.writeFileSync(path.join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    verifyBackup(temporary);
    fs.renameSync(temporary, destination);
    pruneBackups(backupRoot, retention, destination);
    return destination;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function restoreBackup(backupDirectory, destination) {
  if (!destination) throw new Error('必须显式提供全新空恢复目录');
  const source = fs.realpathSync(path.resolve(backupDirectory));
  const target = path.resolve(destination);
  if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory() || fs.readdirSync(target).length)) throw new Error('恢复目标必须是全新空目录，禁止覆盖现有数据');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const realTarget = path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  if (contains(source, realTarget) || contains(realTarget, source)) throw new Error('恢复目录不能包含备份目录或位于其中');
  const manifest = verifyBackup(source);
  const stage = fs.mkdtempSync(path.join(path.dirname(target), '.restore-'));
  try {
    for (const directory of CONTENT_DIRS) fs.mkdirSync(path.join(stage, directory), { recursive: true });
    for (const file of manifest.files) {
      const to = path.join(stage, file.path);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(source, file.path), to, fs.constants.COPYFILE_EXCL);
      if (hashFile(to) !== file.sha256) throw new Error(`恢复文件校验失败: ${file.path}`);
    }
    checkDatabase(path.join(stage, DATABASE_FILE));
    // Claim the target exclusively. An already existing empty directory is removed only if still empty.
    if (fs.existsSync(target)) fs.rmdirSync(target);
    fs.mkdirSync(target, { mode: 0o700 });
    try {
      for (const entry of fs.readdirSync(stage)) fs.renameSync(path.join(stage, entry), path.join(target, entry));
    } catch (error) {
      // Do not delete a destination after publication starts: preserve it for diagnosis.
      throw new Error(`恢复发布失败，已保留目标目录: ${error.message}`);
    }
    return target;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function acquireDataLock(dataDirectory) {
  const directory = path.join(dataDirectory, '.edumanager.lock');
  const ownerPath = path.join(directory, 'owner.json');
  const owner = { pid: process.pid, hostname: os.hostname(), token: crypto.randomBytes(16).toString('hex') };
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try { previous = JSON.parse(fs.readFileSync(ownerPath, 'utf8')); } catch { throw new Error('数据目录锁信息不完整；确认服务已停后检查 .edumanager.lock'); }
    if (previous.hostname !== os.hostname() || !Number.isSafeInteger(previous.pid) || previous.pid < 1) throw new Error('数据目录由其他实例锁定');
    try {
      process.kill(previous.pid, 0);
      throw new Error('数据目录正在使用，请先停止服务后再执行备份或迁移');
    } catch (probeError) {
      if (probeError.code !== 'ESRCH') throw probeError;
    }
    // Exactly one contender may reclaim this stale directory. Unknown/partial locks fail closed.
    try { fs.mkdirSync(path.join(directory, 'recovery')); } catch { throw new Error('数据目录锁正在恢复，请稍后重试'); }
    const current = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    if (current.token !== previous.token || current.pid !== previous.pid) {
      fs.rmdirSync(path.join(directory, 'recovery'));
      throw new Error('数据目录锁已由新实例接管');
    }
    const retired = `${directory}.stale-${owner.token}`;
    fs.renameSync(directory, retired);
    fs.rmSync(retired, { recursive: true });
    return acquireDataLock(dataDirectory);
  }
  try { fs.writeFileSync(ownerPath, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); }
  catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
      if (current.token === owner.token) fs.rmSync(directory, { recursive: true });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}

module.exports = { createBackup, verifyBackup, restoreBackup, acquireDataLock };
