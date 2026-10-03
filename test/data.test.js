const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'edumanager-data-test-'));
process.env.DATA_DIR = path.join(isolated, 'app-data');
process.env.LECTURES_DIR = path.join(isolated, 'app-lectures');
process.env.BACKUP_DIR = path.join(isolated, 'app-backups');
process.env.JWT_SECRET = 'isolated-test-secret-never-production-12345';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
const db = require('../server/db');
const { createBackup, verifyBackup, restoreBackup, acquireDataLock } = require('../server/utils/backup');

test.after(() => { db.close(); fs.rmSync(isolated, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(isolated, 'fixture-'));
  const dataDir = path.join(root, 'data');
  const options = {
    dataDir,
    lecturesDir: path.join(root, 'lectures'),
    knowledgeDir: path.join(dataDir, 'knowledge'),
    lectureVersionsDir: path.join(dataDir, 'lecture-versions'),
    backupDir: path.join(dataDir, 'backups'),
    backupRetention: 2
  };
  const content = {
    'lectures/course/index.html': '<h1>Reliable course</h1>',
    'lectures/.history/course/index.html': '<h1>Previous course</h1>',
    'data/knowledge/notes.md': '# Classroom notes',
    'data/covers/lectures/cover.svg': '<svg/>',
    'data/covers/knowledge/cover.svg': '<svg>knowledge</svg>',
    'data/lecture-versions/course.json': '{"previous":true}'
  };
  for (const [filename, body] of Object.entries(content)) {
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    fs.writeFileSync(path.join(root, filename), body);
  }
  const database = new Database(path.join(dataDir, 'edumanager.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  db.migrate(database);
  database.prepare("INSERT INTO categories (name) VALUES ('original')").run();
  return { root, database, options, content };
}

function seedProgress(database) {
  database.exec(`INSERT INTO students (id, username, password_hash) VALUES (1, 'student', 'hash');
    INSERT INTO lectures (id, title, slug, zip_name) VALUES (1, 'One', 'one', 'one.zip'), (2, 'Two', 'two', 'two.zip');
    INSERT INTO chapters (id, lecture_id, title, slug, path) VALUES (1, 1, 'Chapter', 'chapter', 'chapter');`);
}

test('versioned migration is idempotent, adds historical columns and preserves orphan rows', () => {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`CREATE TABLE students (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT);
    INSERT INTO students VALUES (5, 'legacy', 'old-hash');
    CREATE TABLE lectures (id INTEGER PRIMARY KEY, title TEXT, slug TEXT UNIQUE, zip_name TEXT);
    INSERT INTO lectures VALUES (7, 'Old title', 'old-title', 'old.zip');
    CREATE TABLE knowledge_docs (id INTEGER PRIMARY KEY, title TEXT, url TEXT);
    INSERT INTO knowledge_docs VALUES (8, 'Old note', 'https://example.test');
    CREATE TABLE group_students (group_id INTEGER, student_id INTEGER, PRIMARY KEY (group_id, student_id));
    INSERT INTO group_students VALUES (999, 5);`);
  db.migrate(database);
  db.migrate(database);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 2);
  assert.equal(database.prepare('SELECT status FROM students WHERE id = 5').get().status, 'active');
  assert.equal(database.prepare('SELECT title, is_public FROM lectures WHERE id = 7').get().title, 'Old title');
  assert.equal(database.prepare('SELECT is_public FROM knowledge_docs WHERE id = 8').get().is_public, 0);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM group_students').get().n, 1);
  assert.deepEqual(db.audit(database).orphaned, [{ table: 'group_students', column: 'group_id', count: 1 }]);
  database.close();
});

test('failed migration rolls back schema and ledger together', () => {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE students (id INTEGER PRIMARY KEY); INSERT INTO students VALUES (1)');
  assert.throws(() => db.migrate(database));
  assert.deepEqual(database.pragma('table_info(students)').map(row => row.name), ['id']);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'schema_migrations'").get().n, 0);
  assert.equal(database.prepare('SELECT id FROM students').get().id, 1);
  database.close();
});

test('future database versions fail without rewriting data', () => {
  const database = new Database(':memory:');
  database.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT); INSERT INTO schema_migrations VALUES (999, 'future', 'now')");
  assert.throws(() => db.migrate(database), /拒绝降级/);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 1);
  database.close();
});

test('progress constraints enforce account, chapter ownership, values and cascade deletion', () => {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  db.migrate(database);
  seedProgress(database);
  const insert = database.prepare('INSERT INTO student_progress (student_id, lecture_id, chapter_id, position, completed) VALUES (?, ?, ?, ?, ?)');
  assert.throws(() => insert.run(99, 1, 1, 25, 0), /FOREIGN KEY/);
  assert.throws(() => insert.run(1, 2, 1, 25, 0), /FOREIGN KEY/);
  assert.throws(() => insert.run(1, 1, 1, 101, 0), /CHECK/);
  assert.throws(() => insert.run(1, 1, 1, -1, 0), /CHECK/);
  assert.throws(() => insert.run(1, 1, 1, 10, 2), /CHECK/);
  insert.run(1, 1, 1, 42.5, 0);
  assert.throws(() => insert.run(1, 1, 1, 50, 1), /UNIQUE/);
  database.exec('DELETE FROM chapters WHERE id = 1');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM student_progress').get().n, 0);
  database.exec("INSERT INTO chapters (id, lecture_id, title, slug, path) VALUES (1, 1, 'Chapter', 'chapter', 'chapter')");
  insert.run(1, 1, 1, 100, 1);
  database.exec('DELETE FROM students WHERE id = 1');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM student_progress').get().n, 0);
  database.close();
});

test('complete backup awaits SQLite, restores all content and refuses a nonempty destination', async () => {
  const { root, database, options, content } = fixture();
  try {
    const destination = await createBackup(database, options, '.manual');
    const manifest = verifyBackup(destination);
    assert.equal(manifest.files.length, Object.keys(content).length + 1);
    const restored = restoreBackup(destination, path.join(root, 'restored'));
    for (const [filename, body] of Object.entries(content)) assert.equal(fs.readFileSync(path.join(restored, filename), 'utf8'), body);
    const restoredDb = new Database(path.join(restored, 'data/edumanager.db'), { readonly: true });
    assert.equal(restoredDb.prepare('SELECT name FROM categories').get().name, 'original');
    restoredDb.close();
    assert.throws(() => restoreBackup(destination, restored), /全新空目录/);
    assert.throws(() => restoreBackup(destination), /必须显式/);
    const empty = path.join(root, 'existing-empty');
    fs.mkdirSync(empty);
    restoreBackup(destination, empty);
    assert.ok(fs.existsSync(path.join(empty, 'data/edumanager.db')));
  } finally { database.close(); }
});

test('corrupt or unlisted content fails verification before restoration creates a target', async () => {
  const { root, database, options } = fixture();
  try {
    const destination = await createBackup(database, options);
    fs.writeFileSync(path.join(destination, 'lectures/course/index.html'), 'tampered');
    assert.throws(() => verifyBackup(destination), /校验失败/);
    const target = path.join(root, 'must-stay-absent');
    assert.throws(() => restoreBackup(destination, target), /校验失败/);
    assert.equal(fs.existsSync(target), false);
    const next = await createBackup(database, options);
    fs.writeFileSync(path.join(next, 'data/unlisted-file'), 'bad');
    assert.throws(() => verifyBackup(next), /未登记/);
  } finally { database.close(); }
});

test('failed SQLite backup rejects without publishing a partial backup', async () => {
  const { database, options } = fixture();
  try {
    const fake = { backup: async () => { await new Promise(resolve => setImmediate(resolve)); throw new Error('disk full'); } };
    await assert.rejects(createBackup(fake, options), /disk full/);
    assert.deepEqual(fs.readdirSync(options.backupDir), []);
  } finally { database.close(); }
});

test('retention keeps successful complete backups and never prunes unrelated directories', async () => {
  const { database, options } = fixture();
  try {
    fs.mkdirSync(path.join(options.backupDir, 'keep-my-files'), { recursive: true });
    const first = await createBackup(database, options);
    await new Promise(resolve => setTimeout(resolve, 2));
    const second = await createBackup(database, options);
    await new Promise(resolve => setTimeout(resolve, 2));
    const third = await createBackup(database, options);
    assert.equal(fs.existsSync(first), false);
    assert.equal(fs.existsSync(second), true);
    assert.equal(fs.existsSync(third), true);
    assert.equal(fs.existsSync(path.join(options.backupDir, 'keep-my-files')), true);
  } finally { database.close(); }
});

test('recursive backup configuration and content symlinks fail safely', async () => {
  const { database, options } = fixture();
  try {
    await assert.rejects(createBackup(database, { ...options, backupDir: path.join(options.lecturesDir, 'backups') }), /不可互相包含/);
    fs.symlinkSync(options.dataDir, path.join(options.lecturesDir, 'secret-link'));
    await assert.rejects(createBackup(database, options), /符号链接/);
    assert.deepEqual(fs.readdirSync(options.backupDir), []);
  } finally { database.close(); }
});

test('directory lock blocks a second process and is released on close', () => {
  const root = fs.mkdtempSync(path.join(isolated, 'lock-'));
  const release = acquireDataLock(root);
  assert.throws(() => acquireDataLock(root), /停止服务/);
  const child = spawnSync(process.execPath, ['-e', "require('./server/utils/backup').acquireDataLock(process.argv[1])", root], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /停止服务/);
  release();
  release();
  const releaseAgain = acquireDataLock(root);
  releaseAgain();
  assert.equal(fs.existsSync(path.join(root, '.edumanager.lock')), false);
});

test('db backup refuses serving mode and protects an in-flight backup from premature close', async () => {
  db.init();
  const pending = db.backup('.unit');
  assert.throws(() => db.close(), /备份尚未完成/);
  assert.throws(() => db.run("INSERT INTO categories (name) VALUES ('during backup')"), /禁止写/);
  const destination = await pending;
  assert.ok(fs.existsSync(path.join(destination, 'manifest.json')));
  db.markLive();
  await assert.rejects(db.backup(), /停止服务/);
  const child = spawnSync(process.execPath, ['scripts/backup.js'], { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /停止服务/);
  db.close();
});

test('a dead process lock can recover, while unknown lock ownership remains protected', () => {
  const root = fs.mkdtempSync(path.join(isolated, 'stale-lock-'));
  const child = spawnSync(process.execPath, ['-e', "require('./server/utils/backup').acquireDataLock(process.argv[1]); console.log(process.pid)", root], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(child.status, 0);
  assert.ok(fs.existsSync(path.join(root, '.edumanager.lock/owner.json')));
  const release = acquireDataLock(root);
  const owner = JSON.parse(fs.readFileSync(path.join(root, '.edumanager.lock/owner.json'), 'utf8'));
  assert.equal(owner.pid, process.pid);
  release();
  fs.mkdirSync(path.join(root, '.edumanager.lock'));
  assert.throws(() => acquireDataLock(root), /锁信息不完整/);
  assert.ok(fs.existsSync(path.join(root, '.edumanager.lock')));
});

test('backup, verification and restoration CLI report failure with nonzero status', () => {
  const root = fs.mkdtempSync(path.join(isolated, 'cli-'));
  const backupDir = path.join(root, 'not-a-directory');
  fs.writeFileSync(backupDir, 'cannot write a backup here');
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, DATA_DIR: path.join(root, 'data'), LECTURES_DIR: path.join(root, 'lectures'), BACKUP_DIR: backupDir };
  const backup = spawnSync(process.execPath, ['scripts/backup.js'], { cwd, env, encoding: 'utf8' });
  assert.equal(backup.status, 1);
  assert.match(backup.stderr, /备份失败/);
  assert.equal(fs.existsSync(path.join(env.DATA_DIR, '.edumanager.lock')), false);
  const restore = spawnSync(process.execPath, ['scripts/restore.js'], { cwd, env, encoding: 'utf8' });
  assert.equal(restore.status, 1);
  assert.match(restore.stderr, /用法/);
  const verify = spawnSync(process.execPath, ['scripts/verify_backup.js', path.join(root, 'missing')], { cwd, env, encoding: 'utf8' });
  assert.equal(verify.status, 1);
});

test('migration audit is read-only and reports historical orphans with nonzero status', () => {
  const { database, options } = fixture();
  database.exec('INSERT INTO group_students (group_id, student_id) VALUES (999, 888)');
  const before = database.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
  const child = spawnSync(process.execPath, ['scripts/verify_migration.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATA_DIR: options.dataDir, LECTURES_DIR: options.lecturesDir },
    encoding: 'utf8'
  });
  assert.equal(child.status, 1);
  assert.match(child.stdout, /"orphaned"/);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM group_students').get().n, 1);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, before);
  database.close();
});

test('configuration isolates upload storage and rejects invalid retention and production secrets', () => {
  const root = fs.mkdtempSync(path.join(isolated, 'config-'));
  const cwd = path.resolve(__dirname, '..');
  const baseEnv = { ...process.env, DATA_DIR: path.join(root, 'data'), LECTURES_DIR: path.join(root, 'lectures'), BACKUP_RETENTION: '3', NODE_ENV: 'production' };
  delete baseEnv.UPLOADS_DIR;
  const probe = env => spawnSync(process.execPath, ['-e', "const c = require('./server/config'); console.log(JSON.stringify({ uploadsDir: c.uploadsDir, backupRetention: c.backupRetention, isProd: c.isProd, hasUnarchiver: Object.hasOwn(c, 'unarchiver') }))"], { cwd, env, encoding: 'utf8' });
  const valid = probe(baseEnv);
  assert.equal(valid.status, 0);
  assert.deepEqual(JSON.parse(valid.stdout), { uploadsDir: path.join(baseEnv.DATA_DIR, 'uploads'), backupRetention: 3, isProd: true, hasUnarchiver: false });
  assert.doesNotMatch(valid.stderr, /unar|unzip/);
  const custom = probe({ ...baseEnv, UPLOADS_DIR: path.join(root, 'incoming') });
  assert.equal(custom.status, 0);
  assert.equal(JSON.parse(custom.stdout).uploadsDir, path.join(root, 'incoming'));
  for (const secret of ['', 'too-short', '请替换为至少48字节的随机十六进制字符串'.repeat(2), '__dev_only_insecure_secret_do_not_use_in_prod__', 'your_jwt_secret_please_change_me_to_random_string']) {
    const result = probe({ ...baseEnv, JWT_SECRET: secret });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /生产环境 JWT_SECRET/);
  }
  for (const retention of ['0', '-1', '1.5', 'not-a-number']) {
    const result = probe({ ...baseEnv, BACKUP_RETENTION: retention });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BACKUP_RETENTION/);
  }
  const development = probe({ ...baseEnv, NODE_ENV: 'development', JWT_SECRET: '' });
  assert.equal(development.status, 0);
  assert.equal(JSON.parse(development.stdout).isProd, false);
});
