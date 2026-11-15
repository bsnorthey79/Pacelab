// PaceLab service worker — cache-first so the app works offline at the nets.
const VERSION = 'pacelab-v8';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/analysis.js', 'js/db.js', 'js/pose.js', 'js/charts.js', 'js/programme.js',
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
// App code: network first (so updates arrive straight away), falling back to the cache offline.
// Pose model files: cache first (large and never change).
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const put = res => { if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };
  if (url.pathname.includes('/mediapipe/')) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(put)));
    return;
  }
  e.respondWith(fetch(req).then(put).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
