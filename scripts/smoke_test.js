// Real HTTP/upload regressions use isolated directories and an ephemeral port.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', 'test/integration.test.js', 'test/upload-routes.test.js'], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit'
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
