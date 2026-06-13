/* 胶量计算器 Service Worker —— 提供离线支持 */
const CACHE_VERSION = 'gluecalc-v1.0.0';
const RUNTIME_CACHE = 'gluecalc-runtime-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
];

const CDN_HOSTS = ['cdn.jsdelivr.net'];

/* ============ Install: 预缓存核心文件 ============ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('预缓存失败:', err))
  );
});

/* ============ Activate: 清理旧缓存 ============ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ============ Fetch: 缓存优先 + 回退网络 ============ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 导航请求：网络优先，离线回退到 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() =>
          caches.match('./index.html').then((c) => c || caches.match('./'))
        )
    );
    return;
  }

  // 同源静态资源：缓存优先
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((resp) => {
            if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            return resp;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // CDN 资源：缓存优先（支持离线使用导出库）
  if (CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(h))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((resp) => {
            if (!resp || resp.status !== 200) return resp;
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            return resp;
          })
          .catch(() => cached);
      })
    );
  }
});
