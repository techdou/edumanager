const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exitCode = 1;
      count++;
    }
  }
}
for (const directory of ['server', 'scripts', 'test']) check(path.join(root, directory));
if (!process.exitCode) console.log(`语法检查通过: ${count} 个文件`);
