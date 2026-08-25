// 開発中にブラウザで動作確認するための、ごく簡単なサーバーです。
// npm パッケージを使わず、Node.js に最初から入っている機能だけで作っています。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8080;

// ファイルの拡張子ごとに、ブラウザへ伝える種類(MIMEタイプ)の対応表
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  // "/" へのアクセスは index.html を返す
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // クエリパラメータ(?付き)を取り除く
  filePath = filePath.split('?')[0];
  const fullPath = path.join(process.cwd(), filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + filePath);
      return;
    }
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`開発用サーバーが起動しました: http://localhost:${PORT}`);
});
