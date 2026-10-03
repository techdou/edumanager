const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const express = require('express');
const jwt = require('jsonwebtoken');

// Isolated SQLite and storage: never load deployment configuration or .env.
test('knowledge writes preserve database and file consistency', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-knowledge-routes-'));
  const config = {
    knowledgeDir: path.join(root, 'knowledge'),
    knowledgeCoverDir: path.join(root, 'covers'),
    jwtSecret: 'knowledge-test-only-secret-at-least-32-characters'
  };
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE admins(id INTEGER PRIMARY KEY, username TEXT);
    CREATE TABLE students(id INTEGER PRIMARY KEY, username TEXT, status TEXT, pwd_updated_at TEXT);
    CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE knowledge_docs(id INTEGER PRIMARY KEY, title TEXT, url TEXT, summary TEXT,
      category_id INTEGER, source TEXT, file_path TEXT, file_name TEXT, file_type TEXT,
      cover_path TEXT, is_featured INTEGER, is_public INTEGER, created_at TEXT, updated_at TEXT);
    INSERT INTO admins VALUES(1, 'admin');
    INSERT INTO students(id, username, status) VALUES(1, 'admin', 'active');
  `);
  let failWrite;
  const db = {
    get: (sql, values = []) => database.prepare(sql).get(...values) || null,
    query: (sql, values = []) => database.prepare(sql).all(...values),
    run: (sql, values = []) => {
      if (failWrite?.test(sql)) throw new Error('injected database failure');
      return database.prepare(sql).run(...values);
    },
    transaction: fn => database.transaction(fn)()
  };
  const cleanupErrors = [];
  require.cache[require.resolve('../server/config')] = { exports: config };
  require.cache[require.resolve('../server/db')] = { exports: db };
  require.cache[require.resolve('../server/logger')] = { exports: { error: (...args) => cleanupErrors.push(args) } };
  const app = express();
  app.use(express.json());
  app.use('/api/knowledge', require('../server/routes/knowledge'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const originalUnlink = fs.unlinkSync;
  t.after(async () => {
    fs.unlinkSync = originalUnlink;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/knowledge`;
  const auth = { Authorization: `Bearer ${jwt.sign({ id: 1, username: 'admin', role: 'admin' }, config.jwtSecret)}` };
  const form = ({ file, cover = 'new-cover' } = {}) => {
    const body = new FormData();
    body.set('title', 'Sample'); body.set('url', 'https://example.com/sample');
    if (file) body.set('file', new Blob([file], { type: 'text/markdown' }), 'sample.md');
    if (cover) body.set('cover', new Blob([cover], { type: 'image/png' }), 'cover.png');
    return body;
  };
  const request = (suffix, method, body) => fetch(base + suffix, { method, headers: auth, body });
  const assertNoFiles = () => {
    assert.deepEqual(fs.readdirSync(config.knowledgeDir), []);
    assert.deepEqual(fs.readdirSync(config.knowledgeCoverDir), []);
    assert.equal(db.get('SELECT COUNT(*) AS count FROM knowledge_docs').count, 0);
  };
  async function failedWrite(pattern, suffix, body) {
    failWrite = pattern;
    try { return await request(suffix, 'POST', body); }
    finally { failWrite = null; }
  }

  await t.test('link insert failure removes its newly stored cover', async () => {
    assert.equal((await failedWrite(/INSERT INTO knowledge_docs/, '', form())).status, 500);
    assertNoFiles();
  });
  await t.test('file insert failure removes both document and cover', async () => {
    assert.equal((await failedWrite(/INSERT INTO knowledge_docs/, '/upload', form({ file: '# New' }))).status, 500);
    assertNoFiles();
  });
  await t.test('file URL update failure rolls back insert and removes all uploads', async () => {
    assert.equal((await failedWrite(/UPDATE knowledge_docs SET url/, '/upload', form({ file: '# New' }))).status, 500);
    assertNoFiles();
  });
  await t.test('missing document file cleans up an uploaded temporary cover', async () => {
    assert.equal((await request('/upload', 'POST', form())).status, 400);
    assertNoFiles();
  });
  await t.test('updating a nonexistent document cleans up its temporary cover', async () => {
    assert.equal((await request('/9999', 'PUT', form())).status, 404);
    assertNoFiles();
  });

  const created = await request('', 'POST', form({ cover: 'original-cover' }));
  assert.equal(created.status, 201);
  let doc = await created.json();
  let oldCover = doc.cover_path;
  await t.test('failed cover update retains original bytes and removes new cover', async () => {
    failWrite = /UPDATE knowledge_docs/;
    let response;
    try { response = await request(`/${doc.id}`, 'PUT', form()); }
    finally { failWrite = null; }
    assert.equal(response.status, 500);
    assert.equal(db.get('SELECT cover_path FROM knowledge_docs WHERE id = ?', [doc.id]).cover_path, oldCover);
    assert.equal(fs.readFileSync(path.join(config.knowledgeCoverDir, oldCover), 'utf8'), 'original-cover');
    assert.deepEqual(fs.readdirSync(config.knowledgeCoverDir), [oldCover]);
    assert.deepEqual(fs.readdirSync(config.knowledgeDir), []);
  });
  await t.test('successful cover update publishes new cover and removes old one', async () => {
    const response = await request(`/${doc.id}`, 'PUT', form({ cover: 'replacement-cover' }));
    assert.equal(response.status, 200);
    doc = await response.json();
    assert.notEqual(doc.cover_path, oldCover);
    assert.equal(fs.existsSync(path.join(config.knowledgeCoverDir, oldCover)), false);
    assert.equal(fs.readFileSync(path.join(config.knowledgeCoverDir, doc.cover_path), 'utf8'), 'replacement-cover');
    oldCover = doc.cover_path;
  });
  await t.test('old-cover cleanup failure logs error without undoing a committed update', async () => {
    fs.unlinkSync = filePath => {
      if (filePath === path.join(config.knowledgeCoverDir, oldCover)) throw Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
      return originalUnlink(filePath);
    };
    let response;
    try { response = await request(`/${doc.id}`, 'PUT', form({ cover: 'latest-cover' })); }
    finally { fs.unlinkSync = originalUnlink; }
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.notEqual(saved.cover_path, oldCover);
    assert.equal(db.get('SELECT cover_path FROM knowledge_docs WHERE id = ?', [doc.id]).cover_path, saved.cover_path);
    assert.equal(fs.readFileSync(path.join(config.knowledgeCoverDir, saved.cover_path), 'utf8'), 'latest-cover');
    assert.equal(cleanupErrors.length, 1);
    assert.equal(cleanupErrors[0][1], 'knowledge_cleanup_file_error');
  });
  await t.test('successful file upload preserves its document and committed cover', async () => {
    const response = await request('/upload', 'POST', form({ file: '# Saved document', cover: 'saved-cover' }));
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(saved.url, `/api/knowledge/${saved.id}/file`);
    assert.equal(db.get('SELECT file_path FROM knowledge_docs WHERE id = ?', [saved.id]).file_path, saved.file_path);
    assert.equal(fs.readFileSync(path.join(config.knowledgeDir, saved.file_path), 'utf8'), '# Saved document');
    assert.equal(fs.readFileSync(path.join(config.knowledgeCoverDir, saved.cover_path), 'utf8'), 'saved-cover');
    assert.deepEqual(fs.readdirSync(config.knowledgeDir), [saved.file_path]);
  });

});
