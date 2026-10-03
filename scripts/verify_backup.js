const { verifyBackup } = require('../server/utils/backup');
try {
  const [directory] = process.argv.slice(2);
  if (!directory || process.argv.length !== 3) throw new Error('用法: node scripts/verify_backup.js <备份目录>');
  const manifest = verifyBackup(directory);
  console.log(`备份校验通过: ${manifest.files.length} 个文件，创建时间 ${manifest.created_at}`);
} catch (error) {
  console.error('备份校验失败:', error.message);
  process.exitCode = 1;
}
