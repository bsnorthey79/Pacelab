// PaceLab service worker — cache-first so the app works offline at the nets.
const VERSION = 'pacelab-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/analysis.js', 'js/db.js', 'js/pose.js', 'js/charts.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'mediapipe/pose.js', 'mediapipe/pose_web.binarypb', 'mediapipe/pose_solution_packed_assets_loader.js',
  'mediapipe/pose_solution_packed_assets.data', 'mediapipe/pose_solution_simd_wasm_bin.js',
  'mediapipe/pose_solution_simd_wasm_bin.wasm', 'mediapipe/pose_landmark_full.tflite',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
