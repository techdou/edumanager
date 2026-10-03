const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumanager-merge-data-'));
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'merge-data-tests-only-at-least-32-characters',
  DATA_DIR: path.join(root, 'data'), LECTURES_DIR: path.join(root, 'lectures'), LOG_LEVEL: 'error'
});
const db = require('../server/db');
test.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

function legacyDatabase() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`CREATE TABLE students (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT);
    INSERT INTO students VALUES (1, 'legacy-student', 'hash');
    CREATE TABLE lectures (id INTEGER PRIMARY KEY, title TEXT, slug TEXT UNIQUE, zip_name TEXT);
    INSERT INTO lectures VALUES (1, 'Legacy course', 'course', 'course.zip');
    CREATE TABLE chapters (id INTEGER PRIMARY KEY, lecture_id INTEGER, title TEXT, slug TEXT, path TEXT);
    INSERT INTO chapters VALUES (1, 1, 'First chapter', 'chapter', 'course');
    CREATE TABLE user_progress (student_id INTEGER, lecture_slug TEXT, chapter_slug TEXT,
      lecture_title TEXT, chapter_title TEXT, progress REAL, updated_at TEXT,
      PRIMARY KEY(student_id, lecture_slug, chapter_slug));
    INSERT INTO user_progress VALUES (1,'course','chapter','Legacy course','First chapter',100,'2026-10-02 12:00:00');
    INSERT INTO user_progress VALUES (1,'archived','unmatched','Archived course','Old chapter',45,'2026-09-30 12:00:00');
    CREATE TABLE notes (id INTEGER PRIMARY KEY, student_id INTEGER, lecture_slug TEXT, chapter_slug TEXT,
      content TEXT, anchor TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO notes VALUES(3,1,'course','chapter','Preserve my notes','heading','2026-10-01','2026-10-02');`);
  return database;
}

test('main legacy progress, notes and authentication fields migrate without data loss', () => {
  const database = legacyDatabase();
  try {
    db.migrate(database);
    db.migrate(database);
    assert.equal(database.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 3);
    assert.deepEqual(database.prepare('SELECT student_id,lecture_id,chapter_id,position,completed,updated_at FROM student_progress').get(), {
      student_id: 1, lecture_id: 1, chapter_id: 1, position: 100, completed: 0, updated_at: '2026-10-02 12:00:00'
    });
    assert.equal(database.prepare('SELECT COUNT(*) n FROM user_progress').get().n, 2);
    assert.equal(database.prepare('SELECT content FROM notes WHERE id=3').get().content, 'Preserve my notes');
    assert.equal(database.prepare('SELECT pwd_updated_at FROM students').get().pwd_updated_at, 0);
    assert.equal(database.prepare('SELECT scan_report FROM lectures').get().scan_report, null);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
  } finally { database.close(); }
});

test('version two upgrade preserves newer canonical progress over duplicate legacy data', () => {
  const database = legacyDatabase();
  try {
    db.migrate(database);
    database.exec(`UPDATE student_progress SET position=42.5, completed=1;
      DELETE FROM schema_migrations WHERE version=3;
      ALTER TABLE students DROP COLUMN pwd_updated_at;
      ALTER TABLE lectures DROP COLUMN scan_report`);
    db.migrate(database);
    assert.deepEqual(database.prepare('SELECT position,completed FROM student_progress').get(), { position: 42.5, completed: 1 });
    assert.equal(database.prepare('SELECT COUNT(*) n FROM user_progress').get().n, 2);
    assert.equal(database.prepare('SELECT COUNT(*) n FROM notes').get().n, 1);
  } finally { database.close(); }
});

test('legacy progress API and canonical API share values and explicit completion with access checks', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  db.init();
  db.run("INSERT INTO students(id,username,password_hash) VALUES(1,'api-student','unused')");
  db.run("INSERT INTO lectures(id,title,slug,zip_name,is_public) VALUES(1,'Public course','public','public.zip',1),(2,'Private course','private','private.zip',0)");
  db.run("INSERT INTO chapters(id,lecture_id,title,slug,path) VALUES(1,1,'First','first','public'),(2,2,'Second','second','private')");
  const app = express();
  app.use(express.json());
  app.use('/api/progress', require('../server/routes/progress'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/progress`;
  const token = jwt.sign({ id: 1, username: 'api-student', role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = (suffix, method = 'GET', body) => fetch(base + suffix, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    let response = await request('', 'POST', { lectureSlug: 'public', chapterSlug: 'first', progress: 100 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).completed, false);
    response = await request('/1/1', 'PUT', { position: 90, completed: true });
    assert.equal(response.status, 200);
    response = await request('', 'POST', { lectureSlug: 'public', chapterSlug: 'first', progress: 42.5 });
    assert.equal((await response.json()).completed, true);
    const legacy = await (await request('/mine')).json();
    assert.equal(legacy[0].progress, 42.5);
    assert.equal(legacy[0].completed, true);
    const canonical = await (await request('')).json();
    assert.equal(canonical[0].position, 42.5);
    assert.equal(db.get('SELECT COUNT(*) n FROM user_progress').n, 0);
    assert.equal((await request('', 'POST', { lectureSlug: 'private', chapterSlug: 'second', progress: 20 })).status, 403);
    assert.equal((await request('', 'POST', { lectureSlug: 'missing', chapterSlug: 'first', progress: 20 })).status, 404);
    assert.equal((await request('', 'POST', { lectureSlug: 'public', chapterSlug: 'first', progress: 101 })).status, 400);
    assert.equal((await request('', 'POST', { lectureSlug: 'public', chapterSlug: 'first', progress: 'bad' })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
