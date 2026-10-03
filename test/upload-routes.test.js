const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const express = require('express');
const jwt = require('jsonwebtoken');
const AdmZip = require('adm-zip');

// Load the router against an isolated in-memory database and temporary directories.
// Neither the real config module nor .env is executed by these tests.
test('lecture upload, replacement and previous-version HTTP regressions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-upload-routes-'));
  const config = {
    dataDir: path.join(root, 'data'), lecturesDir: path.join(root, 'lectures'),
    lectureCoverDir: path.join(root, 'covers'), uploadsDir: path.join(root, 'uploads'),
    jwtSecret: 'local-upload-test-secret-at-least-32-characters'
  };
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE admins(id INTEGER PRIMARY KEY, username TEXT);
    CREATE TABLE students(id INTEGER PRIMARY KEY, username TEXT, status TEXT);
    CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE lectures(id INTEGER PRIMARY KEY, title TEXT, slug TEXT UNIQUE, zip_name TEXT,
      category_id INTEGER, cover_path TEXT, layout_mode TEXT, is_public INTEGER, created_at TEXT);
    CREATE TABLE chapters(id INTEGER PRIMARY KEY, lecture_id INTEGER, title TEXT, slug TEXT,
      path TEXT, entry_file TEXT, order_index INTEGER);
    INSERT INTO admins VALUES(1, 'admin');
    INSERT INTO students VALUES(1, 'admin', 'active');
    INSERT INTO categories VALUES(1, 'Test');
  `);
  let failWrite = null;
  const db = {
    get: (sql, values = []) => database.prepare(sql).get(...values) || null,
    query: (sql, values = []) => database.prepare(sql).all(...values),
    run: (sql, values = []) => {
      if (failWrite?.test(sql)) throw new Error('injected database failure');
      return database.prepare(sql).run(...values);
    },
    transaction: fn => database.transaction(fn)()
  };
  require.cache[require.resolve('../server/config')] = { exports: config };
  require.cache[require.resolve('../server/db')] = { exports: db };
  const router = require('../server/routes/lecture');
  const app = express();
  app.use(express.json());
  app.use('/api/lectures', router);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/lectures`;
  const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, config.jwtSecret);
  const auth = { Authorization: `Bearer ${token}` };
  const html = title => `<html><head><title>${title}</title></head><body>${title}</body></html>`;
  const form = ({ title = 'Original', slug = 'course', content, cover, filename = 'index.html' } = {}) => {
    const body = new FormData();
    body.set('title', title); body.set('slug', slug); body.set('categoryId', '1');
    if (content !== undefined) body.set('file', new Blob([content], { type: 'text/html' }), filename);
    if (cover) body.set('cover', new Blob([cover], { type: 'image/png' }), 'cover.png');
    return body;
  };
  const request = (suffix, method, body) => fetch(base + suffix, { method, headers: auth, body });
  const currentHTML = () => fs.readFileSync(path.join(config.lecturesDir, 'course', 'index.html'), 'utf8');
  let lecture;
  let originalCover;

  await t.test('first upload is immediately readable with committed chapters', async () => {
    const response = await request('', 'POST', form({ content: html('Original'), cover: 'original-cover' }));
    assert.equal(response.status, 200, await response.clone().text());
    lecture = await response.json();
    assert.equal(lecture.chapters.length, 1);
    assert.equal(currentHTML(), html('Original'));
    originalCover = db.get('SELECT cover_path FROM lectures WHERE id = ?', [lecture.id]).cover_path;
    assert.deepEqual(fs.readdirSync(config.uploadsDir), []);
  });

  await t.test('private cover and list use live account status', async () => {
    assert.equal((await fetch(base + `/${lecture.id}/cover`)).status, 403);
    assert.equal((await request(`/${lecture.id}/cover`, 'GET')).status, 200);
    assert.equal((await (await request('', 'GET')).json()).length, 1);
    database.prepare("UPDATE students SET status = 'disabled' WHERE id = 1").run();
    assert.equal((await request(`/${lecture.id}/cover`, 'GET')).status, 403);
    assert.deepEqual(await (await request('', 'GET')).json(), []);
    database.prepare("UPDATE students SET status = 'active' WHERE id = 1").run();
  });

  await t.test('first-upload DB failure removes content, cover and temporary uploads', async () => {
    failWrite = /INSERT INTO chapters/;
    const response = await request('', 'POST', form({ slug: 'failed', content: html('Failed'), cover: 'new-cover' }));
    failWrite = null;
    assert.equal(response.status, 500);
    assert.equal(fs.existsSync(path.join(config.lecturesDir, 'failed')), false);
    assert.equal(db.get('SELECT id FROM lectures WHERE slug = ?', ['failed']), null);
    assert.deepEqual(fs.readdirSync(config.lectureCoverDir), [originalCover]);
    assert.deepEqual(fs.readdirSync(config.uploadsDir), []);
  });

  await t.test('invalid replacement cannot remove original content or cover', async () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('no html'));
    const response = await request(`/${lecture.id}`, 'PUT', form({ content: zip.toBuffer(), cover: 'new-cover', filename: 'invalid.zip' }));
    assert.equal(response.status, 400);
    assert.equal(currentHTML(), html('Original'));
    assert.deepEqual(fs.readdirSync(config.lectureCoverDir), [originalCover]);
    assert.deepEqual(fs.readdirSync(config.uploadsDir), []);
  });

  await t.test('replacement and slug-change DB failure rolls back content, chapters, cover and history', async () => {
    failWrite = /INSERT INTO chapters/;
    const response = await request(`/${lecture.id}`, 'PUT', form({ slug: 'renamed', content: html('New'), cover: 'new-cover' }));
    failWrite = null;
    assert.equal(response.status, 500);
    assert.equal(currentHTML(), html('Original'));
    assert.equal(fs.existsSync(path.join(config.lecturesDir, 'renamed')), false);
    assert.equal(db.get('SELECT slug FROM lectures WHERE id = ?', [lecture.id]).slug, 'course');
    assert.deepEqual(fs.readdirSync(config.lectureCoverDir), [originalCover]);
    assert.deepEqual(await (await request(`/${lecture.id}/versions`, 'GET')).json(), []);
  });

  await t.test('metadata-only slug DB failure restores original path and cover', async () => {
    failWrite = /UPDATE lectures/;
    const response = await request(`/${lecture.id}`, 'PUT', form({ slug: 'renamed', cover: 'new-cover' }));
    failWrite = null;
    assert.equal(response.status, 500);
    assert.equal(currentHTML(), html('Original'));
    assert.equal(fs.existsSync(path.join(config.lecturesDir, 'renamed')), false);
    assert.deepEqual(fs.readdirSync(config.lectureCoverDir), [originalCover]);
  });

  await t.test('replacement exposes one protected recoverable version', async () => {
    const response = await request(`/${lecture.id}`, 'PUT', form({ title: 'Second', content: html('Second'), cover: 'second-cover' }));
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(currentHTML(), html('Second'));
    const versions = await (await request(`/${lecture.id}/versions`, 'GET')).json();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].title, 'Original');
    assert.equal(versions[0].chapter_count, 1);
    assert.equal(fs.readdirSync(path.join(config.lecturesDir, '.history')).length, 1);
    assert.equal(fs.readFileSync(path.join(config.lectureCoverDir, originalCover), 'utf8'), 'original-cover');
  });

  await t.test('restore DB failure leaves current content and recoverable version intact', async () => {
    failWrite = /INSERT INTO chapters/;
    const response = await request(`/${lecture.id}/restore`, 'POST');
    failWrite = null;
    assert.equal(response.status, 500);
    assert.equal(currentHTML(), html('Second'));
    const versions = await (await request(`/${lecture.id}/versions`, 'GET')).json();
    assert.equal(versions[0].title, 'Original');
    assert.equal(fs.readdirSync(path.join(config.lecturesDir, '.history')).length, 1);
  });

  await t.test('restore swaps content and cover while keeping current access settings', async () => {
    const response = await request(`/${lecture.id}/restore`, 'POST');
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(currentHTML(), html('Original'));
    const restored = await response.json();
    assert.equal(restored.cover_path, originalCover);
    assert.equal(restored.slug, 'course');
    const versions = await (await request(`/${lecture.id}/versions`, 'GET')).json();
    assert.equal(versions[0].title, 'Second');
    assert.equal(fs.readdirSync(path.join(config.lecturesDir, '.history')).length, 1);
  });

  await t.test('next replacement retires the older version and its unreferenced cover', async () => {
    const response = await request(`/${lecture.id}`, 'PUT', form({ title: 'Third', content: html('Third'), cover: 'third-cover' }));
    assert.equal(response.status, 200, await response.clone().text());
    const versions = await (await request(`/${lecture.id}/versions`, 'GET')).json();
    assert.equal(versions[0].title, 'Original');
    assert.equal(fs.readdirSync(path.join(config.lecturesDir, '.history')).length, 1);
    assert.equal(fs.readdirSync(config.lectureCoverDir).length, 2);
    assert.equal((await request(`/${lecture.id}/restore`, 'POST')).status, 200);
    assert.equal(currentHTML(), html('Original'));
  });

  await t.test('restoration after renaming keeps the new URL and remaps chapter paths', async () => {
    assert.equal((await request(`/${lecture.id}`, 'PUT', form({ slug: 'new-course' }))).status, 200);
    const response = await request(`/${lecture.id}/restore`, 'POST');
    assert.equal(response.status, 200, await response.clone().text());
    const restored = await response.json();
    assert.equal(restored.slug, 'new-course');
    assert.equal(restored.chapters[0].path, 'new-course');
    assert.equal(fs.readFileSync(path.join(config.lecturesDir, 'new-course/index.html'), 'utf8'), html('Third'));
    assert.equal(fs.existsSync(path.join(config.lecturesDir, 'course')), false);
  });

  await t.test('version endpoints require admin and deletion cleans both versions', async () => {
    assert.equal((await fetch(base + `/${lecture.id}/versions`)).status, 401);
    assert.equal((await fetch(base + `/${lecture.id}/restore`, { method: 'POST' })).status, 401);
    const response = await request(`/${lecture.id}`, 'DELETE');
    assert.equal(response.status, 200);
    assert.equal(fs.existsSync(path.join(config.lecturesDir, 'new-course')), false);
    assert.deepEqual(fs.readdirSync(path.join(config.lecturesDir, '.history')), []);
    assert.deepEqual(fs.readdirSync(path.join(config.dataDir, 'lecture-versions')), []);
    assert.deepEqual(fs.readdirSync(config.lectureCoverDir), []);
  });
});
