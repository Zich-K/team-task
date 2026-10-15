// 앱 설치(PC 크롬·엣지, 안드로이드)를 위한 최소 서비스 워커.
// 저장(캐시)은 하지 않는다 — 항상 최신 화면과 데이터를 서버에서 받는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
