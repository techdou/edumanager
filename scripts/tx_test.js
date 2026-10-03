// Never initialize or clean up the real application's database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'edumanager-transaction-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DATA_DIR: path.join(directory, 'data'),
  LECTURES_DIR: path.join(directory, 'lectures'), UPLOADS_DIR: path.join(directory, 'uploads'),
  JWT_SECRET: 'temporary-transaction-test-secret-only'
});
const db = require('../server/db');
try {
  db.init();
  const before = db.get('SELECT COUNT(*) AS count FROM categories').count;
  assert.throws(() => db.transaction(() => {
    db.run("INSERT INTO categories(name) VALUES('__transaction_test__')");
    throw new Error('simulated write failure');
  }), /simulated write failure/);
  assert.equal(db.get('SELECT COUNT(*) AS count FROM categories').count, before);
  assert.equal(db.get("SELECT id FROM categories WHERE name='__transaction_test__'"), null);
  console.log('事务回滚验证通过，未访问业务数据库。');
} catch (error) {
  console.error('事务验证失败:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
