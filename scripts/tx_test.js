// 验证事务回滚：在 DB 层模拟多步写失败，确认不留幽灵记录
const db = require('../server/db');
db.init();

const before = db.get('SELECT COUNT(*) c FROM categories').c;
console.log(`事务前分类数: ${before}`);

let rolledBack = false;
try {
  db.transaction(() => {
    db.run("INSERT INTO categories (name) VALUES ('__tx_test_should_not_exist__')");
    throw new Error('模拟失败');
  });
} catch (e) {
  rolledBack = true;
}

const after = db.get('SELECT COUNT(*) c FROM categories').c;
const ghost = db.get("SELECT id FROM categories WHERE name = '__tx_test_should_not_exist__'");

console.log(`事务后分类数: ${after}`);
console.log(`回滚生效: ${rolledBack && before === after ? '✓' : '✗'}`);
console.log(`无幽灵记录: ${!ghost ? '✓' : '✗ (存在脏数据)'}`);

// 清理冒烟测试注册的账号
db.run("DELETE FROM students WHERE username LIKE 'smoke_%'");
console.log('已清理冒烟测试账号');

db.close();
process.exit(before === after && !ghost ? 0 : 1);
