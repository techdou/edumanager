/**
 * 端到端冒烟测试：启动真实服务，跑关键 API 流程。
 * 运行： node --env-file=.env scripts/smoke_test.js
 * 它会启动一个子进程跑 server，测试后关闭。
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3199; // 用独立端口避免冲突
const BASE = `http://localhost:${PORT}`;

function req(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`${BASE}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  // 启动服务
  const server = spawn(process.execPath, ['--env-file=.env', 'server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe'
  });
  server.stderr.on('data', () => {}); // 吞掉日志

  // 等服务就绪
  await new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const r = await req('GET', '/health');
        if (r.status === 200) { clearInterval(timer); resolve(); }
      } catch {}
    }, 300);
    setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
  });
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. 健康检查
    const h = await req('GET', '/health');
    check('健康检查 /health', h.status === 200 && h.data.ok === true);

    // 2. 公开讲义列表
    const lectures = await req('GET', '/api/lectures');
    check('公开讲义列表', lectures.status === 200 && Array.isArray(lectures.data), `${lectures.data.length} 条`);

    // 3. 分类列表
    const cats = await req('GET', '/api/categories');
    check('分类列表', cats.status === 200 && Array.isArray(cats.data), `${cats.data.length} 个`);

    // 4. 错误密码登录 → 401
    const badLogin = await req('POST', '/api/auth/student/login', { username: 'nouser', password: 'x' });
    check('错误登录返回 401', badLogin.status === 401);

    // 5. 管理员接口无 token → 401
    const noAuth = await req('GET', '/api/admin/users');
    check('管理员接口鉴权', noAuth.status === 401);

    // 6. 无效 token → 401
    const badToken = await req('GET', '/api/admin/users', {}, { Authorization: 'Bearer invalid.token.here' });
    check('无效 token 被拒', badToken.status === 401);

    // 7. 注册（唯一用户名）成功
    const testUser = `smoke_${Date.now()}`;
    const reg = await req('POST', '/api/auth/student/register', {
      username: testUser, password: 'test1234', real_name: '冒烟测试', email: 's@t.test'
    });
    check('学生注册', reg.status === 200 && !!reg.data.token, `role=${reg.data.role}`);

    // 8. 用注册的 token 访问学习中心
    const myLectures = await req('GET', '/api/lectures/my', null, { Authorization: `Bearer ${reg.data.token}` });
    check('学习中心鉴权', myLectures.status === 200, `${myLectures.data.length} 条可访问`);

    // 9. 无 token 访问 my → 401
    const myNoAuth = await req('GET', '/api/lectures/my');
    check('学习中心需登录', myNoAuth.status === 401);

    // 10. JSON 格式错误 → 400（非 500 崩溃）
    const badJson = await new Promise((resolve) => {
      const r = http.request(`${BASE}/api/auth/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 10 }
      }, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({status:res.statusCode})); });
      r.on('error', resolve);
      r.write('{bad json!');
      r.end();
    });
    check('JSON 错误返回 400', badJson.status === 400, `实际 ${badJson.status}`);
  } finally {
    server.kill();
  }

  // 汇总
  const passed = results.filter(r => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} 通过 ===`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((e) => { console.error('测试异常:', e); process.exit(1); });
