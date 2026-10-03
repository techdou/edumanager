/** Public lecture offline reading and PWA shell. Private resources never enter caches. */
const LECTURE_CACHE = 'edumanager-public-lectures-v2';
const SHELL_CACHE = 'edumanager-shell-v2';
const LECTURE_CACHE_MAX = 300;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('edumanager-') && key !== LECTURE_CACHE && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxItems)).map(key => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/lectures/')) {
    event.respondWith((async () => {
      const cache = await caches.open(LECTURE_CACHE);
      try {
        // Recheck access on every online visit so revocation/replacement takes effect.
        const response = await fetch(request);
        const policy = response.headers.get('cache-control') || '';
        if (response.ok && /(?:^|,)\s*public(?:\s|,|$)/i.test(policy) && !/no-store|private/i.test(policy)) {
          await cache.put(request, response.clone());
          await trimCache(LECTURE_CACHE, LECTURE_CACHE_MAX);
        } else {
          await cache.delete(request);
        }
        return response;
      } catch {
        return (await cache.match(request)) || new Response('离线且未缓存该公开讲义内容', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Shell and static assets contain no account data; API responses are excluded above.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('cache-control') || '')) {
        await cache.put(request, response.clone());
        await trimCache(SHELL_CACHE, 60);
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match('/');
        if (shell) return shell;
      }
      return new Response('离线', { status: 503 });
    }
  })());
});
