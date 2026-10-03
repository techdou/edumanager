const fs = require('fs');
const path = require('path');

function resolveContentFile(root, relative) {
  try {
    const base = path.resolve(root);
    if (fs.lstatSync(base).isSymbolicLink()) return null;
    const candidate = path.resolve(base, relative);
    if (!candidate.startsWith(`${base}${path.sep}`)) return null;
    const realBase = fs.realpathSync(base);
    const realFile = fs.realpathSync(candidate);
    if (!realFile.startsWith(`${realBase}${path.sep}`) || !fs.statSync(realFile).isFile()) return null;
    return realFile;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EINVAL', 'ERR_INVALID_ARG_VALUE'].includes(error.code)) return null;
    throw error;
  }
}

module.exports = { resolveContentFile };
