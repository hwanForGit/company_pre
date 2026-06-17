const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  // 임시 저장 엔드포인트: 브라우저가 큰 data-URI를 디스크로 직접 씀
  if (req.method === 'POST' && req.url.startsWith('/__save')) {
    const u = new URL(req.url, 'http://x');
    const name = (u.searchParams.get('f') || 'tmp').replace(/[^a-z0-9_-]/gi, '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        fs.writeFileSync(path.join(root, 'assets', 'outcomes', name + '.datauri.txt'), body);
        res.writeHead(200); res.end('ok');
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8765, () => console.log('listening on 8765'));
