// ==== PWA 서비스 워커 ====
// 이 앱은 이미 index.html의 ?v= 쿼리스트링으로 정적 자산 캐시 무효화를 직접 관리하고 있어서,
// 서비스 워커가 별도로 공격적인 캐싱을 할 필요는 없다. 여기서는 "설치 가능한 PWA" 요건(등록된
// 서비스 워커 + fetch 핸들러)을 만족시키면서, 온라인일 때는 항상 최신 응답을 쓰고 오프라인일
// 때만 마지막으로 받아둔 응답을 보여주는 최소한의 역할만 한다.
const CACHE_NAME = 'my-stock-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 저장/불러오기/계좌조회 등 API 호출(대부분 POST, 항상 최신이어야 함)은 캐시를 거치지 않고
  // 그대로 네트워크로 보낸다.
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
