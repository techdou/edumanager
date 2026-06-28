/**
 * 数据迁移/完整性验证脚本。
 * 运行： node --env-file=.env scripts/verify_migration.js
 * 用新 db.js（better-sqlite3）打开现有库，核对行数与抽样数据。
 */
const db = require('../server/db');

function run() {
  db.init();
  console.log('=== 新引擎打开后的行数 ===');
  const counts = [
    ['admins', 'SELECT COUNT(*) c FROM admins'],
    ['students', 'SELECT COUNT(*) c FROM students'],
    ['categories', 'SELECT COUNT(*) c FROM categories'],
    ['lectures', 'SELECT COUNT(*) c FROM lectures'],
    ['chapters', 'SELECT COUNT(*) c FROM chapters'],
    ['user_activity', 'SELECT COUNT(*) c FROM user_activity'],
    ['knowledge_docs', 'SELECT COUNT(*) c FROM knowledge_docs'],
    ['groups', 'SELECT COUNT(*) c FROM groups'],
    ['group_students', 'SELECT COUNT(*) c FROM group_students'],
    ['group_category_permissions', 'SELECT COUNT(*) c FROM group_category_permissions']
  ];
  for (const [name, sql] of counts) {
    console.log(`${name}: ${db.get(sql).c}`);
  }
  console.log('\n=== 抽样：前 3 个 lecture ===');
  console.table(db.query('SELECT id, title, slug, category_id, is_public, layout_mode FROM lectures LIMIT 3'));
  console.log('\n=== 抽样：管理员 ===');
  console.table(db.query('SELECT id, username, created_at FROM admins'));
  console.log('\n=== 事务测试：回滚是否生效 ===');
  const before = db.get('SELECT COUNT(*) c FROM categories').c;
  try {
    db.transaction(() => {
      db.run("INSERT INTO categories (name) VALUES ('__rollback_test__')");
      throw new Error('force_rollback');
    });
  } catch (e) {
    // 预期回滚
  }
  const after = db.get('SELECT COUNT(*) c FROM categories').c;
  console.log(`事务回滚: ${before === after ? '✓ 生效（行数不变 ' + before + '）' : '✗ 失败'}`);
  db.close();
}
run();
