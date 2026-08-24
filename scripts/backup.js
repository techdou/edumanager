/**
 * 手动备份数据库。运行： node --env-file=.env scripts/backup.js
 * db.backup 是异步 API，必须 await 完成后才能 close（否则备份被中断）
 */
const db = require('../server/db');
db.init();

(async () => {
  const path = await db.backup('.manual');
  if (path) {
    console.log('备份完成:', path);
  } else {
    console.error('备份失败');
    process.exitCode = 1;
  }
  db.close();
})();
