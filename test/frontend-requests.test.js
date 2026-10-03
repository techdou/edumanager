const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function script(relative) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  return (source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1] || source).replace(/^import .+$/gm, '');
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('slow precheck A cannot replace the selected file B result or leave the spinner active', async () => {
  const calls = [];
  const axios = { post: () => { const item = deferred(); calls.push(item); return item.promise; } };
  const expose = new Function('ref', 'onMounted', 'onUnmounted', 'useRouter', 'axios', 'FormData', 'AbortController', script('client/src/views/admin/Upload.vue') + '\nreturn { file, zipCheck, precheckLoading, precheckFile };');
  const state = expose(value => ({ value }), () => {}, () => {}, () => ({}), axios, class { append() {} }, AbortController);
  state.file.value = { name: 'A.zip' }; const a = state.precheckFile();
  state.file.value = { name: 'B.zip' }; const b = state.precheckFile();
  calls[1].resolve({ data: { name: 'B', htmlCount: 1 } }); await b;
  calls[0].resolve({ data: { name: 'A', htmlCount: 2 } }); await a;
  assert.equal(state.zipCheck.value.name, 'B');
  assert.equal(state.precheckLoading.value, false);
  state.file.value = null; await state.precheckFile();
  assert.equal(state.zipCheck.value, null);
});

test('HTTP interceptor preserves explicit authorization and uses admin credentials for admin resource operations', () => {
  let intercept;
  const api = { interceptors: { request: { use: fn => { intercept = fn; } }, response: { use() {} } } };
  const source = script('client/src/lib/http.js').replace(/^export .+$/gm, '');
  new Function('axios', 'authHeaders', 'clearAuth', 'loginLocation', 'window', source)({ create: () => api }, admin => ({ Authorization: admin ? 'Bearer ADMIN' : 'Bearer STUDENT' }), () => {}, () => {}, { location: { pathname: '/admin/lectures' } });
  const explicit = intercept({ url: '/api/lectures', headers: { Authorization: 'Bearer EXPLICIT' } });
  assert.equal(explicit.headers.Authorization, 'Bearer EXPLICIT');
  assert.equal(intercept({ url: '/api/lectures', headers: {} }).headers.Authorization, 'Bearer ADMIN');
});

test('late lecture response cannot replace the current chapter; only the current frame can report progress', async () => {
  const requests = [];
  const route = { params: { slug: 'a' } };
  const api = { get: url => {
    if (url.startsWith('/api/lectures/detail/')) { const item = deferred(); requests.push(item); return item.promise; }
    return Promise.resolve({ data: {} });
  }, head: async () => ({}) };
  const noop = () => {};
  const values = {
    ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
    onMounted: noop, onUnmounted: noop, watch: noop, useRoute: () => route, api,
    buildChapterSrc: (lecture, chapter) => `/lectures/${chapter.path}/${chapter.entry_file || 'index.html'}`,
    ensureContentSession: async () => {}, getToken: () => '', authHeaders: () => ({}), loginLocation: () => '/login',
    cachedProgress: () => [], loadProgress: async () => [], cacheProgress: noop, saveProgress: async () => {},
    window: { innerWidth: 1024 }, AbortController, setTimeout: () => 0, clearTimeout: noop, clearInterval: noop
  };
  const expose = new Function(...Object.keys(values), script('client/src/views/Lecture.vue') + '\nreturn { loadLecture, lecture, loading, ready, iframeError, handleTocMessage, viewerFrame, readProgress, completed };');
  const state = expose(...Object.values(values));
  const a = state.loadLecture();
  route.params.slug = 'b'; const b = state.loadLecture();
  requests[1].resolve({ data: { id: 2, slug: 'b', chapters: [{ id: 22, slug: 'b', path: 'b', entry_file: 'index.html' }] } });
  await b;
  requests[0].resolve({ data: { id: 1, slug: 'a', chapters: [{ id: 11, slug: 'a', path: 'a' }] } });
  await a;
  assert.equal(state.lecture.value.slug, 'b');
  assert.equal(state.loading.value, false);
  assert.equal(state.ready.value, true);
  const contentWindow = {};
  state.viewerFrame.value = { contentWindow };
  state.handleTocMessage({ source: {}, data: { type: 'reading-progress', progress: 90 } });
  assert.equal(state.readProgress.value, 0);
  state.handleTocMessage({ source: contentWindow, data: { type: 'reading-progress', progress: 100 } });
  assert.equal(state.readProgress.value, 100);
  assert.equal(state.completed.value, false);
});
