const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edumanager-integration-'));
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'integration-only-secret-at-least-32-characters',
  DATA_DIR: path.join(root, 'data'), LECTURES_DIR: path.join(root, 'lectures'),
  UPLOADS_DIR: path.join(root, 'uploads'), LOG_LEVEL: 'error'
});
const db = require('../server/db');
const { start } = require('../server/index');
let server, base;
const tokens = {};
let memberCookie;
function auth(name) { return { Authorization: `Bearer ${tokens[name]}` }; }
async function request(url, options = {}) {
  const response = await fetch(base + url, options);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
function json(body, name) { return { headers: { 'Content-Type': 'application/json', ...(name ? auth(name) : {}) }, body: JSON.stringify(body) }; }

before(async () => {
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [index, name] of ['admin', 'member', 'outsider'].entries()) {
    const id = index + 1;
    db.run('INSERT INTO students(id,username,password_hash,real_name) VALUES(?,?,?,?)', [id, name, 'unused', name]);
    tokens[name] = jwt.sign({ id, username: name, role: name === 'admin' ? 'admin' : 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
  db.run("INSERT INTO admins(username,password_hash) VALUES('admin','unused')");
  db.run("INSERT INTO categories(id,name) VALUES(1,'可访问'),(2,'不可访问')");
  db.run("INSERT INTO groups(id,name) VALUES(1,'测试班级')");
  db.run('INSERT INTO group_students VALUES(1,2)');
  db.run('INSERT INTO group_category_permissions VALUES(1,1)');
  for (const [id, slug, category, publicFlag] of [[1,'public',2,1],[2,'private',1,0],[3,'restricted',2,0]]) {
    db.run('INSERT INTO lectures(id,title,slug,zip_name,category_id,is_public) VALUES(?,?,?,?,?,?)', [id,slug,slug,`${slug}.zip`,category,publicFlag]);
    db.run('INSERT INTO chapters(id,lecture_id,title,slug,path) VALUES(?,?,?,?,?)', [id,id,`${slug}章节`,slug,slug]);
    fs.mkdirSync(path.join(process.env.LECTURES_DIR,slug),{recursive:true});
    fs.writeFileSync(path.join(process.env.LECTURES_DIR,slug,'index.html'),`<html><body><h1>${slug}</h1><img src="image.svg"></body></html>`);
    fs.writeFileSync(path.join(process.env.LECTURES_DIR,slug,'image.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  }
  fs.symlinkSync(path.join(process.env.LECTURES_DIR,'private','index.html'),path.join(process.env.LECTURES_DIR,'public','escape.html'));
  for (const [id,publicFlag] of [[1,1],[2,0]]) {
    const name=`doc${id}.md`;
    fs.writeFileSync(path.join(process.env.DATA_DIR,'knowledge',name),`# document ${id}`);
    db.run('INSERT INTO knowledge_docs(id,title,url,category_id,file_path,file_type,is_public) VALUES(?,?,?,?,?,?,?)', [id,name,`/api/knowledge/${id}/file`,1,name,'markdown',publicFlag]);
  }
});

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  fs.rmSync(root,{recursive:true,force:true});
});

test('health checks database and unknown APIs return JSON 404', async () => {
  assert.equal((await request('/health')).status,200);
  const missing=await request('/api/nonexistent');
  assert.equal(missing.status,404); assert.equal(typeof missing.data.error,'string');
});
test('lecture and knowledge lists enforce public, class and admin visibility', async () => {
  assert.deepEqual((await request('/api/lectures')).data.map(r=>r.id),[1]);
  assert.deepEqual((await request('/api/lectures',{headers:auth('member')})).data.map(r=>r.id).sort(),[1,2]);
  assert.equal((await request('/api/lectures',{headers:auth('admin')})).data.length,3);
  assert.deepEqual((await request('/api/knowledge')).data.map(r=>r.id),[1]);
  assert.equal((await request('/api/knowledge',{headers:auth('member')})).data.length,2);
  assert.equal((await request('/api/knowledge',{headers:auth('admin')})).data.length,2);
});
test('private files reject anonymous readers and full tokens in URLs', async () => {
  assert.equal((await request('/lectures/private/index.html')).status,403);
  assert.equal((await request(`/lectures/private/index.html?access_token=${tokens.member}`)).status,403);
  for(const url of ['/api/knowledge/2/file','/api/knowledge/2/markdown']) assert.equal((await request(url)).status,403);
});
test('content session authenticates entry and its relative assets without exposing login token', async () => {
  assert.equal((await request('/api/auth/content-session',{method:'POST'})).status,401);
  const session=await request('/api/auth/content-session',{method:'POST',headers:auth('member')});
  assert.equal(session.status,200);
  const cookies=session.headers.getSetCookie().filter(c=>!c.includes('Expires=Thu, 01 Jan 1970'));
  assert.equal(cookies.length,3);
  assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('Secure')));
  assert.ok(cookies[0].includes('SameSite=None'));
  memberCookie=cookies[0].split(';')[0];
  assert.ok(!memberCookie.includes(tokens.member));
  const html=await request('/lectures/private/index.html',{headers:{Cookie:memberCookie}});
  assert.equal(html.status,200); assert.match(html.data,/content-bridge\.js/);
  assert.match(html.headers.get('content-security-policy'),/sandbox allow-scripts allow-same-site-none-cookies;/);
  assert.ok(!html.headers.get('content-security-policy').includes('allow-same-origin'));
  assert.equal((await request('/lectures/private/image.svg',{headers:{Cookie:memberCookie}})).status,200);
  assert.equal((await request('/api/knowledge/2/file',{headers:{Cookie:memberCookie}})).status,200);
});
test('content cookies and content tokens cannot authorize API writes or profile access', async () => {
  const contentToken=memberCookie.split('=')[1];
  assert.equal((await request('/api/progress',{headers:{Cookie:memberCookie}})).status,401);
  assert.equal((await request('/api/progress',{headers:{Authorization:`Bearer ${contentToken}`}})).status,401);
  assert.equal((await request('/api/admin/users',{headers:{Authorization:`Bearer ${contentToken}`}})).status,401);
  assert.equal((await request('/api/progress/2/2',{method:'PUT',...json({position:20}),headers:{...json({}).headers,Cookie:memberCookie}})).status,401);
});
test('encoded traversal, symlinks and foreign lectures remain inaccessible', async () => {
  for(const url of ['/lectures/public/..%2fprivate/index.html','/lectures/public/%2e%2e%2fprivate/index.html','/lectures/public/escape.html']) {
    assert.equal((await request(url)).status,404,url);
  }
  assert.equal((await request('/lectures/restricted/index.html',{headers:{Cookie:memberCookie}})).status,403);
  assert.equal((await request('/api/knowledge/2/file',{headers:auth('outsider')})).status,403);
});
test('cover sessions enforce permission and reject symlinks including lecture root aliases', async () => {
  const covers=path.join(process.env.DATA_DIR,'covers','lectures');
  fs.writeFileSync(path.join(covers,'test.png'),'cover fixture');
  db.run("UPDATE lectures SET cover_path='test.png' WHERE id=2");
  assert.equal((await request('/api/lectures/2/cover')).status,403);
  const allowed=await request('/api/lectures/2/cover',{headers:{Cookie:memberCookie}});
  assert.equal(allowed.status,200); assert.match(allowed.headers.get('cache-control'),/no-store/);
  fs.symlinkSync(path.join(process.env.LECTURES_DIR,'private','index.html'),path.join(covers,'escape.png'));
  db.run("UPDATE lectures SET cover_path='escape.png' WHERE id=2");
  assert.equal((await request('/api/lectures/2/cover',{headers:{Cookie:memberCookie}})).status,404);
  db.run('INSERT INTO lectures(id,title,slug,zip_name,is_public) VALUES(4,?,?,?,1)',['alias','alias','alias.zip']);
  fs.symlinkSync(path.join(process.env.LECTURES_DIR,'private'),path.join(process.env.LECTURES_DIR,'alias'));
  assert.equal((await request('/lectures/alias/index.html')).status,404);
  db.run('DELETE FROM lectures WHERE id=4');
});
test('expired content credential is rejected and logout expires all cookie paths', async () => {
  const expired=jwt.sign({id:2,username:'member',scope:'content'},process.env.JWT_SECRET,{expiresIn:-1});
  assert.equal((await request('/lectures/private/index.html',{headers:{Cookie:`edumanager_content=${expired}`}})).status,403);
  const logout=await request('/api/auth/logout',{method:'POST'});
  assert.equal(logout.status,200);
  assert.equal(logout.headers.getSetCookie().length,3);
  assert.ok(logout.headers.getSetCookie().every(c=>c.includes('Expires=Thu, 01 Jan 1970')));
});
test('revoked class membership and disabled accounts invalidate existing content access', async () => {
  db.run('DELETE FROM group_students WHERE student_id=2');
  assert.equal((await request('/lectures/private/image.svg',{headers:{Cookie:memberCookie}})).status,403);
  db.run('INSERT INTO group_students VALUES(1,2)');
  db.run("UPDATE students SET status='disabled' WHERE id=2");
  assert.equal((await request('/api/knowledge/2/file',{headers:{Cookie:memberCookie}})).status,403);
  db.run("UPDATE students SET status='active' WHERE id=2");
  db.run("UPDATE students SET status='disabled' WHERE id=1");
  assert.deepEqual((await request('/api/lectures',{headers:auth('admin')})).data.map(r=>r.id),[1]);
  db.run("UPDATE students SET status='active' WHERE id=1");
});
test('knowledge creation defaults private and public flag can be explicitly changed', async () => {
  const added=await request('/api/knowledge',{method:'POST',...json({title:'新资料',url:'https://example.com',categoryId:1},'admin')});
  assert.equal(added.status,201); assert.equal(added.data.is_public,0);
  const update=await request(`/api/knowledge/${added.data.id}`,{method:'PUT',...json({title:'公开资料',url:'https://example.com',categoryId:1,isPublic:true},'admin')});
  assert.equal(update.status,200); assert.equal(update.data.is_public,1);
  assert.ok((await request('/api/knowledge')).data.some(d=>d.id===added.data.id));
});
test('progress is account-scoped, persistent and completion is independent of scroll position', async () => {
  const saved=await request('/api/progress/2/2',{method:'PUT',...json({position:100},'member')});
  assert.equal(saved.status,200); assert.equal(saved.data.completed,false); assert.equal(saved.data.lectureSlug,'private');
  await request('/api/progress/2/2',{method:'PUT',...json({position:80,completed:true},'member')});
  const updated=await request('/api/progress/2/2',{method:'PUT',...json({position:20},'member')});
  assert.equal(updated.data.completed,true); assert.equal(updated.data.position,20);
  assert.equal((await request('/api/progress',{headers:auth('member')})).data.length,1);
  assert.deepEqual((await request('/api/progress',{headers:auth('outsider')})).data,[]);
  assert.equal(db.get('SELECT COUNT(*) AS count FROM student_progress').count,1);
});
test('progress refuses invalid values, wrong chapter ownership and unauthorized lectures', async () => {
  for(const body of [{position:-1},{position:101},{position:'50'},{position:NaN},{position:50,completed:'yes'}]) {
    assert.equal((await request('/api/progress/2/2',{method:'PUT',...json(body,'member')})).status,400);
  }
  assert.equal((await request('/api/progress/2/1',{method:'PUT',...json({position:20},'member')})).status,404);
  assert.equal((await request('/api/progress/3/3',{method:'PUT',...json({position:20},'member')})).status,403);
  db.run('DELETE FROM group_students WHERE student_id=2');
  assert.deepEqual((await request('/api/progress',{headers:auth('member')})).data,[]);
  db.run('INSERT INTO group_students VALUES(1,2)');
});
test('invalid login input is a 400 response, not a hung async handler', async () => {
  for(const url of ['/api/auth/admin/login','/api/auth/student/login']) {
    assert.equal((await request(url,{method:'POST',...json({username:'admin'})})).status,400);
  }
});
test('database failure returns health 503 rather than a false healthy result', async () => {
  db.close();
  assert.equal((await request('/health')).status,503);
  db.init(); db.markLive();
  assert.equal((await request('/api/progress',{headers:auth('member')})).data[0].position,20);
});
