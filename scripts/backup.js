/**
 * 手动备份数据库。运行： node --env-file=.env scripts/backup.js
 */
const db = require('../server/db');
db.init();
const path = db.backup('.manual');
if (path) console.log('备份完成:', path);
else console.error('备份失败');
db.close();
