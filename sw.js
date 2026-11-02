// ガレキ積み帳 オフライン用サービスワーカー
// 画面を更新したら VERSION の数字を上げると、スマホ側も新しい版に切り替わります。
const VERSION = "v23";
const SHELL = ["./", "./index.html", "./app.js", "./events.js", "./privacy.html", "./terms.html", "./legal.css", "./legal.js",
  "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Googleのログインやドライブとの通信には関わらない
  if (url.host.endsWith("googleapis.com") && !url.host.startsWith("fonts.")) return;
  if (url.host === "accounts.google.com") return;

  // 画面（ページ）：ネット優先、つながらなければ保存済みの版
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // アプリのファイル：ネット優先で最新を取り、つながらなければ保存済み
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Googleフォント：保存済みを優先
  if (url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return r;
      }))
    );
  }
});
