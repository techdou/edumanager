/** Restore only to an explicitly provided, new empty directory. */
const { restoreBackup } = require('../server/utils/backup');
const [source, destination] = process.argv.slice(2);
try {
  if (!source || !destination || process.argv.length !== 4) throw new Error('用法: node scripts/restore.js <备份目录> <全新空恢复目录>');
  const target = restoreBackup(source, destination);
  console.log('恢复校验完成:', target);
  console.log('恢复布局: <目标>/data 与 <目标>/lectures。确认后通过 DATA_DIR 和 LECTURES_DIR 指向新目录启动。');
} catch (error) {
  console.error('恢复失败:', error.message);
  process.exitCode = 1;
}
