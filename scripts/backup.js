/** Full backup while the service is stopped. Never reads .env automatically. */
const db = require('../server/db');

async function main() {
  try {
    db.init();
    const destination = await db.backup('.manual');
    console.log('完整备份完成:', destination);
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error('备份失败:', error.message);
  process.exitCode = 1;
});
