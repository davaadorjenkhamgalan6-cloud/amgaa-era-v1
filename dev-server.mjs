// Компьютер дээрээ турших: `npm install` → `npm run dev` → http://localhost:3000
// Vercel-ийн ажиллагааг дуурайна: public/ → хуудас, api/*.js → функц.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

// .env файлаас AI түлхүүрийг уншина (GEMINI_API_KEY=... гэх мэт). Энэ файл GitHub руу орохгүй.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    try {
      const mod = await import(`./api/${name}.js`);
      let raw = '';
      for await (const chunk of req) raw += chunk;
      req.body = raw ? JSON.parse(raw) : {};
      const shim = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(d) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); return this; },
      };
      await mod.default(req, shim);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join('public', rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log(`AMGAA ERA: http://localhost:${PORT}`));
