const CACHE = 'uw-mobile-v3';
const SHELL = [
  '/unifiedwp/m/login',
  '/unifiedwp/m/home',
  '/unifiedwp/m/leave',
  '/unifiedwp/m/wfh',
  '/unifiedwp/mobile/css/mobile.css',
  '/unifiedwp/mobile/js/api.js',
  '/unifiedwp/mobile/js/login.js',
  '/unifiedwp/mobile/js/home.js',
  '/unifiedwp/mobile/js/tasks.js',
  '/unifiedwp/mobile/js/services.js',
  '/unifiedwp/mobile/js/leave.js',
  '/unifiedwp/mobile/js/wfh.js',
  '/unifiedwp/assets/logo.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Network-only: API calls and dynamic theme CSS
  if (url.pathname.startsWith('/unifiedwp/api/')) return;
  if (url.pathname === '/unifiedwp/theme.css') return;

  // Cache-first for immutable static assets (JS, CSS, images)
  if (
    url.pathname.startsWith('/unifiedwp/mobile/') ||
    url.pathname.startsWith('/unifiedwp/assets/')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Stale-while-revalidate for shell HTML pages — instant from cache, refresh in background
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(res => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || networkFetch;
        })
      )
    );
  }
});
