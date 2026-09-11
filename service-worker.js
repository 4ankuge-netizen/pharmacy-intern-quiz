// オフラインでもクイズが使えるようにする仕組みと、
// 新しいバージョンを配ったときに自動で切り替わる仕組みをまとめたファイルです。

// キャッシュの名前にバージョン番号をつける。
// 問題データやコードを更新したら、このバージョン番号を上げること。
const CACHE_VERSION = 'v11';
const CACHE_NAME = `pharmacy-quiz-${CACHE_VERSION}`;

// オフラインでも表示できるようにしておきたいファイルの一覧
const APP_SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/quiz-engine.js',
  './js/storage.js',
  './js/stats.js',
  './js/report-code.js',
  './data/questions.json',
  './data/categories.json',
  './data/report-form.json',
  './manifest.json',
  './icons/icon.svg',
];

// インストール時:一覧のファイルをキャッシュに保存する
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  // 新しいService Workerをすぐに有効化の待機列に進める
  self.skipWaiting();
});

// 有効化時:古いバージョンのキャッシュを削除する(自動更新の仕組み)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('pharmacy-quiz-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// リクエストが来たら:まずキャッシュを見て、なければネットワークから取りに行く
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
