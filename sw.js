// PWAとしてインストール可能にするための最小限のService Worker。
// 鉄道運行状況やイベント情報は常に最新である必要があるため、
// キャッシュはせず全リクエストをそのままネットワークに流すだけにしている。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request));
});
