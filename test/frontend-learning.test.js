const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = () => import(pathToFileURL(path.resolve(__dirname, '../client/src/lib/learning.mjs')).href);

test('login return target keeps an internal chapter, query and anchor', async () => {
  const { safeReturnPath } = await load();
  assert.equal(safeReturnPath('/lecture/course/chapter?view=full#part-2'), '/lecture/course/chapter?view=full#part-2');
});
test('login return target rejects external, backslash and login-loop destinations', async () => {
  const { safeReturnPath } = await load();
  for (const unsafe of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%2f%2fevil.invalid', '/%5cevil.invalid', '/%0aevil', '/login?redirect=/learn', '/register', '/admin']) {
    assert.equal(safeReturnPath(unsafe), '/learn', unsafe);
  }
});
const lectures = [
  { id: 1, title: 'AI 入门', slug: 'ai', category_id: 10, category_name: '计算机', chapters: [{ id: 11, title: '提示词实践' }, { id: 12, title: '模型基础' }] },
  { id: 2, title: '数据分析', slug: 'data', category_id: 20, category_name: '统计', chapters: [{ id: 21, title: '图表实践' }] }
];
test('chapter search keeps only matching chapter destinations in authorized input', async () => {
  const { searchLectures } = await load();
  const result = searchLectures(lectures, '提示词');
  assert.deepEqual(result.map(row => [row.id, row.chapters.map(chapter => chapter.id)]), [[1, [11]]]);
  assert.equal(lectures[0].chapters.length, 2, 'search must not mutate the source list');
});
test('title/category searches support text and category filtering together', async () => {
  const { searchLectures } = await load();
  assert.equal(searchLectures(lectures, 'ai')[0].chapters.length, 2);
  assert.equal(searchLectures(lectures, '计算机', '10').length, 1);
  assert.equal(searchLectures(lectures, '实践', 20)[0].id, 2);
  assert.deepEqual(searchLectures([], 'secret'), []);
});
test('scrolling to 100 percent does not mark learning complete', async () => {
  const { progressItem } = await load();
  assert.equal(progressItem({ position: 100 }).completed, false);
  assert.equal(progressItem({ position: 8, completed: 1 }).completed, true);
  assert.equal(progressItem({ position: 250 }).progress, 100);
  assert.equal(progressItem({ position: -4 }).progress, 0);
  assert.equal(progressItem({ position: 20, updated_at: '2026-10-03 04:00:00' }).updatedAt, Date.parse('2026-10-03T04:00:00Z'));
});
test('chapter destinations encode non-ASCII titles and reserved path characters', async () => {
  const { chapterUrl } = await load();
  assert.equal(chapterUrl('course', '第一章?'), '/lecture/course/%E7%AC%AC%E4%B8%80%E7%AB%A0%3F');
  assert.equal(chapterUrl('course', 'course'), '/lecture/course');
});
