/**
 * EduManager Service Worker（离线阅读）
 *
 * 策略：
 * - /lectures/* 静态讲义：cache-first（学生打开过的讲义自动离线可读），LRU 上限 300 项
 * - 其余 GET（页面/静态资源）：network-first，离线时回退缓存
 * - /api/* 与所有写请求：不缓存
 */
const LECTURE_CACHE = 'edumanager-lectures-v1';
const SHELL_CACHE = 'edumanager-shell-v1';
const LECTURE_CACHE_MAX = 300;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== LECTURE_CACHE && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  // FIFO 淘汰：请求顺序即访问顺序的近似
  await Promise.all(keys.slice(0, keys.length - maxItems).map(key => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 讲义静态内容：cache-first，打开过即离线可读
  if (url.pathname.startsWith('/lectures/')) {
    event.respondWith((async () => {
      const cache = await caches.open(LECTURE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          trimCache(LECTURE_CACHE, LECTURE_CACHE_MAX);
        }
        return response;
      } catch (err) {
        return new Response('离线且未缓存该讲义内容', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // API 不缓存
  if (url.pathname.startsWith('/api/')) return;

  // SPA 外壳与静态资源：network-first
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
        trimCache(SHELL_CACHE, 60);
      }
      return response;
    } catch (err) {
      const cached = await cache.match(request);
      if (cached) return cached;
      // 导航请求离线时回退到已缓存的外壳
      if (request.mode === 'navigate') {
        const shell = await cache.match('/');
        if (shell) return shell;
      }
      return new Response('离线', { status: 503 });
    }
  })());
});
