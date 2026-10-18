// オフラインでも、ネットが遅くてもすぐ開けるように、サイトのファイルとフォントを端末に保存しておく。
//
// - サイトのファイルは、保存済みのものを先に使う（ネットを待たない）。
//   サイトを更新したときは、下の CACHE の名前を変える。すると新しいファイルが裏で保存され、次に開いたときから新しくなる。
// - フォント（Google Fonts）は、保存分があればそれを使い、裏で最新に更新する。
const CACHE = 'parka-v5';
const FONT_CACHE = 'parka-fonts-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'images/hoodie.jpg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' で、ブラウザ側の古い保存を使わず、いつも最新のファイルを取りにいく
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit && url.hostname === 'fonts.gstatic.com') return hit; // フォントのファイルは中身が変わらないので、保存分をそのまま使う
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('index.html')))
  );
});
