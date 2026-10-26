import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pool } from './db.js';
import { HttpError, routes, type Handler } from './routes.js';

const PORT = Number(process.env.PORT || 8080);
const WEB_DIR = path.resolve(process.env.WEB_DIR || 'web/dist');
const MAX_BODY = 64 * 1024;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const compiled = routes.map(([method, pattern, handler]) => {
  const names: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n: string) => (names.push(n), '([^/]+)')) + '$');
  return { method, re, names, handler };
});

const match = (method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null => {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)])) };
  }
  return null;
};

const readBody = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Demasiados datos.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON no válido.'));
      }
    });
    req.on('error', reject);
  });

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

// Contra peticiones falsificadas desde otras webs: los cambios exigen una cabecera propia
// (otra web no puede ponerla sin permiso CORS, que aquí no se da) y, si hay Origin, que sea este mismo host.
const isSafeWrite = (req: http.IncomingMessage) => {
  if (req.headers['x-ig-panel'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host || new URL(origin).host === req.headers['x-forwarded-host'];
  } catch {
    return false;
  }
};

const serveStatic = async (pathname: string, res: http.ServerResponse) => {
  let file = path.join(WEB_DIR, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB_DIR)) file = path.join(WEB_DIR, 'index.html');
  let info = await stat(file).catch(() => null);
  if (!info || info.isDirectory()) {
    file = path.join(WEB_DIR, 'index.html'); // la web decide la pantalla
    info = await stat(file).catch(() => null);
  }
  if (!info) return sendJson(res, 404, { error: 'No encontrado' });
  const isAsset = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(file).pipe(res);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const method = req.method ?? 'GET';
  try {
    if (url.pathname === '/healthz') {
      await pool.query('SELECT 1');
      return sendJson(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) {
      const found = match(method, url.pathname);
      if (!found) throw new HttpError(404, 'No existe.');
      if (method !== 'GET' && !isSafeWrite(req)) throw new HttpError(403, 'Petición no permitida.');
      const body = method === 'GET' ? undefined : await readBody(req);
      const reply = await found.handler({ method, params: found.params, query: url.searchParams, body });
      return sendJson(res, reply.status ?? 200, reply.body);
    }
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Método no permitido.');
    return await serveStatic(url.pathname, res);
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error(`${method} ${url.pathname}`, e);
    return sendJson(res, 500, { error: 'Algo ha fallado en el panel. Revisa los registros de la app.' });
  }
});

server.listen(PORT, () => console.log(`IG panel escuchando en :${PORT}`));

const stop = () => {
  server.close(() => void pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
