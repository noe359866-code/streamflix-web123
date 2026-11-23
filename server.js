import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const UPSTREAM = 'https://v3-cinemeta.strem.io';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'streamflix-web', uptime: process.uptime() }));
      return;
    }

    // Proxy opcional del catálogo (evita problemas de CORS en algunos navegadores)
    if (url.pathname.startsWith('/api/cinemeta/')) {
      const apiPath = url.pathname.slice('/api/cinemeta'.length);
      const allowed = /^\/(catalog|meta|stream)\//.test(apiPath) && !apiPath.includes('..');
      if (!allowed) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Ruta no permitida' }));
        return;
      }
      try {
        const upstream = await fetch(UPSTREAM + apiPath, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000)
        });
        const body = await upstream.text();
        res.writeHead(upstream.status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': upstream.ok ? 'public, max-age=300' : 'no-store',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(body);
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'No se pudo conectar al catálogo' }));
      }
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (pathname === '/') pathname = '/index.html';

    const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);

    // Path traversal guard: only serve inside public/
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let data;
    try {
      data = await readFile(filePath);
    } catch {
      // SPA fallback: any unknown route serves the shell
      try {
        data = await readFile(path.join(PUBLIC_DIR, 'index.html'));
      } catch {
        res.writeHead(500);
        res.end('Internal server error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`StreamFlix corriendo en http://${HOST}:${PORT}`);
});
