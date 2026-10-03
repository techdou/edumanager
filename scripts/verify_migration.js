/** Read-only integrity and orphan audit: does not run migrations or modify records. */
const Database = require('better-sqlite3');
const config = require('../server/config');
const { audit } = require('../server/db');
let database;
try {
  database = new Database(config.dbPath, { readonly: true, fileMustExist: true });
  const report = audit(database);
  console.log(JSON.stringify(report, null, 2));
  if (report.integrity.some(row => row.integrity_check !== 'ok') || report.foreignKeyViolations.length || report.orphaned.length) process.exitCode = 1;
} catch (error) {
  console.error('迁移审计失败:', error.message);
  process.exitCode = 1;
} finally {
  if (database) database.close();
}
