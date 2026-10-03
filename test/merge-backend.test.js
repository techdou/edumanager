const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

// Real migrations and HTTP routes, with no project .env or user data.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumanager-merge-backend-'));
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'merge-backend-test-only-at-least-32-characters',
  DATA_DIR: path.join(root, 'data'), LECTURES_DIR: path.join(root, 'lectures'),
  UPLOADS_DIR: path.join(root, 'uploads'), LOG_LEVEL: 'error'
});
const db = require('../server/db');
const { start } = require('../server/index');
let server, base, lecture, originalReport;
const tokens = {};
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` });
async function request(url, options = {}) {
  const response = await fetch(base + url, options);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
const json = (body, name) => ({ headers: { 'Content-Type': 'application/json', ...auth(name) }, body: JSON.stringify(body) });
function upload(content, sanitize) {
  const body = new FormData();
  body.set('title', 'Merge course'); body.set('slug', 'merge-course'); body.set('categoryId', '1');
  body.set('file', new Blob([content], { type: 'text/html' }), 'index.html');
  if (sanitize !== undefined) body.set('sanitize', sanitize);
  return body;
}
const search = (word, name) => request(`/api/search?q=${encodeURIComponent(word)}`, { headers: name ? auth(name) : {} });
const storedHtml = () => fs.readFileSync(path.join(process.env.LECTURES_DIR, 'merge-course', 'index.html'), 'utf8');

before(async () => {
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [index, name] of ['admin', 'member', 'outsider'].entries()) {
    const id = index + 1;
    db.run('INSERT INTO students(id,username,password_hash,real_name) VALUES(?,?,?,?)', [id, name, 'unused', name]);
    tokens[name] = jwt.sign({ id, username: name, role: name === 'admin' ? 'admin' : 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
  db.run("INSERT INTO admins(username,password_hash) VALUES('admin','unused')");
  db.run("INSERT INTO categories(id,name) VALUES(1,'Merge category')");
  db.run("INSERT INTO groups(id,name) VALUES(1,'Merge group')");
  db.run('INSERT INTO group_students VALUES(1,2)');
  db.run('INSERT INTO group_category_permissions VALUES(1,1)');
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('staged sanitization persists the report and indexes authorized Chinese substrings', async () => {
  const response = await request('/api/lectures', { method: 'POST', headers: auth('admin'), body: upload('<html><body><h1>Merge course</h1><p onclick="alert(1)">深入学习机器学习算法 alphaindex</p><a href="javascript:alert(1)">link</a><script>window.secretindex=1</script></body></html>') });
  assert.equal(response.status, 200);
  lecture = response.data;
  originalReport = lecture.scan_report;
  assert.equal(response.data.sanitized, true);
  assert.equal(originalReport.scripts, 1);
  assert.equal(originalReport.eventAttrs, 1);
  assert.equal(originalReport.jsUrls, 1);
  assert.doesNotMatch(storedHtml(), /<script|onclick=|javascript:/i);
  const detail = await request('/api/lectures/detail/merge-course', { headers: auth('member') });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.scan_report, originalReport);
  for (const term of ['alphaindex', '学习', '机器学习']) {
    const found = await search(term, 'member');
    assert.equal(found.status, 200);
    assert.deepEqual(found.data.results.map(row => row.id), [lecture.id]);
    assert.deepEqual((await search(term)).data.results, []);
    assert.deepEqual((await search(term, 'outsider')).data.results, []);
  }
  assert.deepEqual((await search('secretindex', 'admin')).data.results, []);
  assert.equal((await search('x'.repeat(201), 'admin')).status, 400);
});

test('replacement and previous-version restore keep content, scan report and full-text index together', async () => {
  const replacement = '<html><body><h1>New lesson</h1><p>betaindex</p><script>window.localFeature=1</script></body></html>';
  const replaced = await request(`/api/lectures/${lecture.id}`, { method: 'PUT', headers: auth('admin'), body: upload(replacement, '0') });
  assert.equal(replaced.status, 200);
  assert.match(storedHtml(), /window.localFeature/);
  assert.equal(replaced.data.scan_report.scripts, 1);
  assert.deepEqual((await search('alphaindex', 'admin')).data.results, []);
  assert.deepEqual((await search('betaindex', 'member')).data.results.map(row => row.id), [lecture.id]);
  const restored = await request(`/api/lectures/${lecture.id}/restore`, { method: 'POST', headers: auth('admin') });
  assert.equal(restored.status, 200);
  assert.match(storedHtml(), /alphaindex/);
  assert.doesNotMatch(storedHtml(), /window.localFeature/);
  assert.deepEqual(restored.data.scan_report, originalReport);
  assert.deepEqual((await search('betaindex', 'admin')).data.results, []);
  assert.deepEqual((await search('alphaindex', 'member')).data.results.map(row => row.id), [lecture.id]);
});

test('full-text write failure rolls back publication and keeps the previous recoverable version', async () => {
  const before = storedHtml();
  const historyBefore = fs.readFileSync(path.join(process.env.DATA_DIR, 'lecture-versions', `${lecture.id}.json`), 'utf8');
  const originalRun = db.run;
  db.run = (sql, params) => {
    if (/INSERT INTO lectures_fts/.test(sql)) throw new Error('injected index failure');
    return originalRun(sql, params);
  };
  let failed;
  try {
    failed = await request(`/api/lectures/${lecture.id}`, { method: 'PUT', headers: auth('admin'), body: upload('<html><body>failedindex</body></html>') });
  } finally { db.run = originalRun; }
  assert.equal(failed.status, 500);
  assert.equal(storedHtml(), before);
  assert.equal(fs.readFileSync(path.join(process.env.DATA_DIR, 'lecture-versions', `${lecture.id}.json`), 'utf8'), historyBefore);
  assert.deepEqual((await search('failedindex', 'member')).data.results, []);
  assert.deepEqual((await search('alphaindex', 'member')).data.results.map(row => row.id), [lecture.id]);
});

test('notes enforce account ownership, chapter validity and live category access', async () => {
  const payload = { lectureSlug: 'merge-course', chapterSlug: 'merge-course', content: 'Member-only note', anchor: '#lesson' };
  assert.equal((await request('/api/notes', { method: 'POST', ...json(payload, 'outsider') })).status, 403);
  assert.equal((await request('/api/notes', { method: 'POST', ...json({ ...payload, chapterSlug: 'missing' }, 'member') })).status, 403);
  const added = await request('/api/notes', { method: 'POST', ...json(payload, 'member') });
  assert.equal(added.status, 201);
  assert.deepEqual((await request('/api/notes', { headers: auth('outsider') })).data, []);
  assert.equal((await request(`/api/notes/${added.data.id}`, { method: 'PUT', ...json({ content: 'foreign write' }, 'outsider') })).status, 404);
  assert.equal((await request(`/api/notes/${added.data.id}`, { method: 'DELETE', headers: auth('outsider') })).status, 404);
  assert.equal((await request('/api/notes', { headers: auth('member') })).data[0].content, payload.content);
  db.run('DELETE FROM group_students WHERE student_id=2');
  try {
    assert.deepEqual((await request('/api/notes', { headers: auth('member') })).data, []);
    assert.equal((await request(`/api/notes/${added.data.id}`, { method: 'PUT', ...json({ content: 'revoked write' }, 'member') })).status, 403);
    assert.deepEqual((await search('alphaindex', 'member')).data.results, []);
  } finally { db.run('INSERT INTO group_students VALUES(1,2)'); }
  assert.equal((await request(`/api/notes/${added.data.id}`, { method: 'PUT', ...json({ content: 'Updated note' }, 'member') })).status, 200);
  assert.equal((await request(`/api/notes/${added.data.id}`, { method: 'DELETE', headers: auth('member') })).status, 200);
});

test('fresh content cookies preserve login time so password changes revoke both credentials', async () => {
  const now = Math.floor(Date.now() / 1000);
  const oldLogin = jwt.sign({ id: 2, username: 'member', role: 'student', iat: now - 120 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const issued = await request('/api/auth/content-session', { method: 'POST', headers: { Authorization: `Bearer ${oldLogin}` } });
  assert.equal(issued.status, 200);
  const cookie = issued.headers.getSetCookie()[0].split(';')[0];
  const decoded = jwt.verify(cookie.slice(cookie.indexOf('=') + 1), process.env.JWT_SECRET);
  assert.equal(decoded.login_iat, now - 120);
  assert.ok(decoded.iat >= now);
  assert.ok(decoded.exp >= now + 1799);
  assert.equal((await request('/lectures/merge-course/index.html', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request('/api/notes', { headers: { Cookie: cookie } })).status, 401);
  db.run('UPDATE students SET pwd_updated_at=? WHERE id=2', [now - 30]);
  try {
    assert.equal((await request('/lectures/merge-course/index.html', { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await request('/api/auth/student/profile', { headers: { Authorization: `Bearer ${oldLogin}` } })).status, 401);
    assert.equal((await request('/api/auth/content-session', { method: 'POST', headers: { Authorization: `Bearer ${oldLogin}` } })).status, 401);
  } finally { db.run('UPDATE students SET pwd_updated_at=0 WHERE id=2'); }
});

test('administrator role changes and password revocation remove all privileged entry points', async () => {
  const now = Math.floor(Date.now() / 1000);
  const olderAdmin = jwt.sign({ id: 1, username: 'admin', role: 'admin', iat: now - 120 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  db.run('UPDATE students SET pwd_updated_at=? WHERE id=1', [now - 30]);
  try {
    assert.equal((await request('/api/admin/users', { headers: { Authorization: `Bearer ${olderAdmin}` } })).status, 401);
    assert.deepEqual((await search('alphaindex', 'admin')).data.results.map(row => row.id), [lecture.id]);
    assert.deepEqual((await request('/api/search?q=alphaindex', { headers: { Authorization: `Bearer ${olderAdmin}` } })).data.results, []);
  } finally { db.run('UPDATE students SET pwd_updated_at=0 WHERE id=1'); }
  db.run("DELETE FROM admins WHERE username='admin'");
  try {
    assert.equal((await request('/api/admin/users', { headers: auth('admin') })).status, 401);
    assert.equal((await request('/api/lectures/detail/merge-course', { headers: auth('admin') })).status, 403);
    assert.deepEqual((await search('alphaindex', 'admin')).data.results, []);
  } finally { db.run("INSERT INTO admins(username,password_hash) VALUES('admin','unused')"); }
});

test('registration validates credential types and concurrent bootstrap creates one administrator', async () => {
  for (const route of ['student/register', 'admin/register']) {
    for (const payload of [{ username: {}, password: 'valid' }, { username: 'new', password: [] }, { username: 'new', password: '你'.repeat(25) }]) {
      assert.equal((await request(`/api/auth/${route}`, { method: 'POST', ...json({ ...payload, real_name: 'Tester' }, 'member') })).status, 400);
    }
  }
  db.run("DELETE FROM admins WHERE username='admin'");
  try {
    const responses = await Promise.all(['bootstrap-a', 'bootstrap-b'].map(username => request('/api/auth/admin/register', { method: 'POST', ...json({ username, password: 'test-bootstrap-password' }, 'member') })));
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 403]);
    assert.equal(db.get('SELECT COUNT(*) AS count FROM admins').count, 1);
    const registered = responses.find(row => row.status === 200).data;
    assert.ok(db.get('SELECT id FROM students WHERE username=?', [registered.username]));
  } finally {
    db.run("DELETE FROM admins WHERE username LIKE 'bootstrap-%'");
    db.run("DELETE FROM students WHERE username LIKE 'bootstrap-%'");
    db.run("INSERT INTO admins(username,password_hash) VALUES('admin','unused')");
  }
});
