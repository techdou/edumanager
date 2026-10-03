const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { atomicWriteDir } = require('../server/utils/fs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-upload-files-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('publication waits for population and validation before committing', async t => {
  const root = fixture(t);
  const target = path.join(root, 'lecture');
  let committed = false;
  await atomicWriteDir(root, target, async stage => {
    await new Promise(resolve => setTimeout(resolve, 15));
    fs.writeFileSync(path.join(stage, 'index.html'), 'ready');
    return ['chapter'];
  }, { commit(value) {
    assert.deepEqual(value, ['chapter']);
    assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'ready');
    committed = true;
  }});
  assert.equal(committed, true);
});

test('database failure restores previous directory after slug change', async t => {
  const root = fixture(t);
  const original = path.join(root, 'old');
  const target = path.join(root, 'new');
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, 'index.html'), 'old');
  await assert.rejects(atomicWriteDir(root, target, async stage => {
    fs.writeFileSync(path.join(stage, 'index.html'), 'new');
  }, { sourceDir: original, commit() { throw new Error('database failed'); } }), /database failed/);
  assert.equal(fs.readFileSync(path.join(original, 'index.html'), 'utf8'), 'old');
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readdirSync(root).filter(name => name !== '.history'), ['old']);
});

test('first publication failure leaves no public directory', async t => {
  const root = fixture(t);
  const target = path.join(root, 'new');
  await assert.rejects(atomicWriteDir(root, target, async stage => {
    fs.writeFileSync(path.join(stage, 'index.html'), 'new');
  }, { commit() { throw new Error('database failed'); } }), /database failed/);
  assert.equal(fs.existsSync(target), false);
});

test('invalid replacement preserves old content', async t => {
  const root = fixture(t);
  const target = path.join(root, 'lecture');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'index.html'), 'old');
  await assert.rejects(atomicWriteDir(root, target, async () => { throw new Error('no HTML'); }), /no HTML/);
  assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'old');
});

test('ZIP extraction rejects traversal, symlinks and excessive expansion before writing', async t => {
  const { extractLectureContent } = require('../server/utils/upload');
  const root = fixture(t);
  for (const variant of ['traversal', 'symlink', 'size', 'depth']) {
    const zip = new AdmZip();
    const entryName = variant === 'depth' ? `${'a/'.repeat(70)}index.html` : 'index.html';
    zip.addFile(entryName, Buffer.from('<html>hello</html>'));
    if (variant === 'symlink') zip.getEntry(entryName).attr = (0o120777 << 16) >>> 0;
    let bytes = zip.toBuffer();
    if (variant === 'traversal') {
      // Preserve equal-length header names so this exercises archive path validation.
      bytes = Buffer.from(bytes.toString('binary').replaceAll('index.html', '../bad.htm'), 'binary');
    }
    if (variant === 'size') {
      const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      bytes.writeUInt32LE(70 * 1024 * 1024, central + 24);
    }
    const source = path.join(root, `${variant}.zip`);
    const target = path.join(root, variant);
    fs.writeFileSync(source, bytes);
    fs.mkdirSync(target);
    await assert.rejects(extractLectureContent({ path: source, originalname: `${variant}.zip` }, target));
    assert.deepEqual(fs.readdirSync(target), []);
  }
});

test('ZIP validates CRC and exact inflated length, HTML filenames reject paths', async t => {
  const { extractLectureContent } = require('../server/utils/upload');
  const root = fixture(t);
  const target = path.join(root, 'output');
  fs.mkdirSync(target);
  const source = path.join(root, 'source');
  fs.writeFileSync(source, '<html>test</html>');
  await assert.rejects(extractLectureContent({ path: source, originalname: '../outside.html' }, target));
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<html>valid</html>'));
  const bytes = zip.toBuffer();
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(123, central + 16);
  fs.writeFileSync(source, bytes);
  await assert.rejects(extractLectureContent({ path: source, originalname: 'bad.zip' }, target), /校验|CRC/);
});

test('ZIP stops forged small-size entries and rejects high expansion ratios', async t => {
  const { extractLectureContent } = require('../server/utils/upload');
  const root = fixture(t);
  const source = path.join(root, 'forged.zip');
  const target = path.join(root, 'output');
  fs.mkdirSync(target);
  const forged = new AdmZip();
  forged.addFile('index.html', Buffer.alloc(128 * 1024, 65));
  const bytes = forged.toBuffer();
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(10, central + 24);
  fs.writeFileSync(source, bytes);
  await assert.rejects(extractLectureContent({ path: source, originalname: 'forged.zip' }, target), /实际解压体积/);
  const bomb = new AdmZip();
  bomb.addFile('index.html', Buffer.alloc(2 * 1024 * 1024, 65));
  fs.writeFileSync(source, bomb.toBuffer());
  await assert.rejects(extractLectureContent({ path: source, originalname: 'bomb.zip' }, target), /膨胀比例/);
});

test('valid ZIP extracts nested assets and worker timeout is bounded', async t => {
  const { extractLectureContent, inspectUpload } = require('../server/utils/upload');
  const root = fixture(t);
  const source = path.join(root, 'valid.zip');
  const target = path.join(root, 'output');
  fs.mkdirSync(target);
  const zip = new AdmZip();
  zip.addFile('lesson/index.html', Buffer.from('<html>ok</html>'));
  zip.addFile('lesson/assets/style.css', Buffer.from('body { color: black; }'));
  fs.writeFileSync(source, zip.toBuffer());
  const info = await inspectUpload({ path: source, originalname: 'valid.zip' });
  assert.equal(info.htmlCount, 1);
  assert.equal(info.validated, true);
  await extractLectureContent({ path: source, originalname: 'valid.zip' }, target);
  assert.equal(fs.readFileSync(path.join(target, 'lesson/index.html'), 'utf8'), '<html>ok</html>');
  await assert.rejects(inspectUpload({ path: source, originalname: 'valid.zip' }, { timeoutMs: 1 }), /超时/);
});
