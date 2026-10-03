// ZIP parsing runs off the HTTP thread. Inflate streams enforce actual output limits,
// rather than trusting only the size fields supplied by an uploaded archive.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { Readable, Transform, Writable } = require('stream');
const { pipeline } = require('stream/promises');
const { createInflateRaw } = require('zlib');
const AdmZip = require('adm-zip');
const { file, destination, limits } = workerData;
const isHtml = name => /\.(html?|xhtml)$/i.test(name);
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function entryPath(name) {
  if (!name || /[\\\u0000-\u001f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name)) {
    throw new Error('ZIP 包含不安全路径');
  }
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.length > limits.maxDepth || parts.some(part => !part || part === '.' || part === '..' || part.includes(':') || /[. ]$/.test(part))) {
    throw new Error('ZIP 包含越界路径或目录层级过深');
  }
  if (name.length > 1024 || parts.some(part => Buffer.byteLength(part) > 255)) throw new Error('ZIP 文件路径过长');
  return parts.join('/');
}

function describe(entries, totalBytes) {
  const html = entries.filter(entry => !entry.directory && isHtml(entry.name) && !entry.name.split('/').some(p => p.startsWith('.') || p === '__MACOSX')).map(entry => entry.name);
  if (!html.length) throw new Error('未找到可用 HTML 文件');
  const groups = new Map();
  for (const name of html) {
    const group = name.includes('/') ? name.split('/')[0] : '(根目录)';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(name);
  }
  const chapters = [...groups].map(([name, files]) => ({
    name,
    preferredHtml: files.find(value => /(^|\/)index\.html?$/i.test(value)) || files[0],
    hasIndex: files.some(value => /(^|\/)index\.html$/i.test(value)),
    htmlCount: files.length
  }));
  const missingIndex = chapters.filter(chapter => !chapter.hasIndex);
  return {
    validated: true,
    entryCount: entries.length,
    htmlCount: html.length,
    uncompressedBytes: totalBytes,
    mode: chapters.length > 1 ? 'multi-chapter' : 'single-page',
    rootHasIndex: html.some(name => name.toLowerCase() === 'index.html'),
    rootHtml: html.filter(name => !name.includes('/')),
    chapters,
    missingIndex,
    warnings: missingIndex.length ? [`${missingIndex.length} 个章节未使用 index.html，系统会保留原文件名并自动指向可用 HTML`] : []
  };
}

async function run() {
  if (!/\.zip$/i.test(file.originalname)) {
    const size = fs.statSync(file.path).size;
    if (size > limits.maxEntryBytes) throw new Error('HTML 文件超过 64MB 限制');
    if (destination) await fs.promises.copyFile(file.path, path.join(destination, file.originalname), fs.constants.COPYFILE_EXCL);
    return describe([{ name: file.originalname, directory: false }], size);
  }
  const zip = new AdmZip(file.path);
  const rawEntries = zip.getEntries();
  if (rawEntries.length > limits.maxEntries) throw new Error('ZIP 文件数量超过 5000 限制');
  let totalBytes = 0;
  const names = new Map();
  const entries = rawEntries.map(entry => {
    const name = entryPath(entry.entryName);
    const folded = name.normalize('NFC').toLowerCase();
    if (names.has(folded)) throw new Error('ZIP 包含重复或大小写冲突路径');
    names.set(folded, entry.isDirectory);
    const fileType = (entry.attr >>> 16) & 0o170000;
    if (fileType && fileType !== 0o100000 && fileType !== 0o040000) throw new Error('ZIP 不允许符号链接或特殊文件');
    if (entry.header.encrypted || (entry.header.flags & 1)) throw new Error('不支持加密 ZIP');
    if (![0, 8].includes(entry.header.method)) throw new Error('ZIP 使用了不支持的压缩方式');
    const size = entry.header.size;
    const compressedSize = entry.header.compressedSize;
    if (size > limits.maxEntryBytes) throw new Error('ZIP 单个文件超过 64MB 限制');
    totalBytes += size;
    if (totalBytes > limits.maxTotalBytes) throw new Error('ZIP 解压体积超过 512MB 限制');
    if (size > 1024 * 1024 && size / Math.max(compressedSize, 1) > limits.maxRatio) throw new Error('ZIP 压缩膨胀比例过高');
    return { name, directory: entry.isDirectory, entry };
  });
  for (const { name } of entries) {
    const parts = name.normalize('NFC').toLowerCase().split('/');
    parts.pop();
    while (parts.length) {
      if (names.get(parts.join('/')) === false) throw new Error('ZIP 文件与目录路径冲突');
      parts.pop();
    }
  }
  const result = describe(entries, totalBytes);
  let actualTotal = 0;
  for (const { name, directory, entry } of entries) {
    if (directory) continue;
    let actual = 0;
    let crc = 0xffffffff;
    const bounded = new Transform({ transform(chunk, encoding, callback) {
      actual += chunk.length;
      actualTotal += chunk.length;
      if (actual > entry.header.size || actual > limits.maxEntryBytes || actualTotal > limits.maxTotalBytes) {
        return callback(new Error('ZIP 实际解压体积超过声明或限制'));
      }
      for (const value of chunk) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
      callback(null, chunk);
    }});
    const compressed = entry.getCompressedData();
    if (compressed.length !== entry.header.compressedSize) throw new Error('ZIP 压缩数据不完整');
    let sink;
    if (destination) {
      const target = path.join(destination, name);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      sink = fs.createWriteStream(target, { flags: 'wx', mode: 0o644 });
    } else {
      sink = new Writable({ write(chunk, encoding, callback) { callback(); } });
    }
    const streams = [Readable.from([compressed])];
    if (entry.header.method === 8) streams.push(createInflateRaw());
    streams.push(bounded, sink);
    await pipeline(...streams);
    if (actual !== entry.header.size || ((crc ^ 0xffffffff) >>> 0) !== entry.header.crc) {
      throw new Error('ZIP 文件 CRC 或大小校验失败');
    }
  }
  return result;
}

run().then(result => parentPort.postMessage({ result }), err => parentPort.postMessage({ error: err.message }));
