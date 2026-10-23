import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ApiError } from './accounts.js';
import { FreeCatalog } from './catalog.js';

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    request.resume();
    throw new ApiError(415, 'Use Content-Type: application/json.');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 16384) {
        chunks.length = 0;
        reject(new ApiError(413, 'Request body exceeds 16 KiB.'));
      } else chunks.push(chunk);
    });
    request.on('error', () => reject(new ApiError(400, 'Could not read request body.')));
    request.on('end', () => {
      if (size > 16384) return;
      try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
        resolve(input);
      } catch { reject(new ApiError(400, 'Body must be a JSON object.')); }
    });
  });
}

export function createApiServer({ manager, apiKey, onShutdown, catalog = new FreeCatalog(), log = () => {} }) {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/details.js', ['details.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ].map(([path, [file, type]]) => [path, { type, body: readFileSync(new URL(`../public/${file}`, import.meta.url)) }]));
  const server = createServer(async (request, response) => {
    try {
      const port = server.address().port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host)) {
        throw new ApiError(403, 'Only a loopback host is allowed.');
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      const path = url.pathname;
      if (request.method === 'GET' && assets.has(path)) {
        const asset = assets.get(path);
        response.writeHead(200, {
          'Content-Type': asset.type, 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://*.steamstatic.com https://*.akamaihd.net https://*.steamusercontent.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        });
        response.end(asset.body);
        return;
      }
      if (request.method === 'GET' && path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true });
      const actual = Buffer.from(request.headers.authorization || '');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        request.resume();
        return send(response, 401, { error: 'A valid Bearer API key is required.' });
      }
      // The local dashboard may call the API; other website origins remain blocked.
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
        throw new ApiError(403, 'Browser cross-origin requests are disabled.');
      }
      if (path === '/v1/service/shutdown' && request.method === 'POST') {
        const input = await readJson(request);
        if (Object.keys(input).length) throw new ApiError(400, 'Shutdown body must be {}.');
        if (!onShutdown) throw new ApiError(503, 'Shutdown is unavailable.');
        send(response, 202, { stopping: true });
        setImmediate(onShutdown);
        return;
      }
      if (path === '/v1/accounts' && request.method === 'GET') {
        return send(response, 200, { accounts: manager.list() });
      }
      if (path === '/v1/free-games' && request.method === 'GET') {
        return send(response, 200, await catalog.search(url.searchParams.get('term') || '', Number(url.searchParams.get('start') || 0)));
      }
      const route = path.match(/^\/v1\/accounts\/([a-zA-Z0-9_-]{1,64})(?:\/(login|guard|logout|details|profile-refresh|web-refresh|games|inventory|free-license|idle|rust-auth-check|rust-connect|rust-session))?$/);
      if (!route) throw new ApiError(404, 'Route not found.');
      const [, id, action] = route;
      if (action === 'rust-session') {
        if (request.method === 'POST') return send(response, 202, manager.features(id).startRustSession(await readJson(request)));
        if (request.method === 'GET') return send(response, 200, manager.features(id).rustSessionStatus());
        if (request.method === 'DELETE') return send(response, 200, manager.features(id).stopRustSession());
      }
      if (request.method === 'POST' && action === 'rust-connect') {
        return send(response, 200, await manager.features(id).rustConnect(await readJson(request)));
      }
      if (request.method === 'POST' && action === 'rust-auth-check') {
        const input = await readJson(request);
        if (Object.keys(input).length) throw new ApiError(400, '请求体必须是 {}。');
        return send(response, 200, await manager.features(id).rustAuthCheck());
      }
      if (request.method === 'GET' && action === 'details') return send(response, 200, manager.details(id));
      if (request.method === 'GET' && action === 'games') return send(response, 200, await manager.features(id).games(url.searchParams.get('refresh') === '1'));
      if (request.method === 'GET' && action === 'inventory') {
        return send(response, 200, await manager.features(id).inventory({
          appId: Number(url.searchParams.get('appId') || 753), contextId: url.searchParams.get('contextId') || '6',
          startAssetId: url.searchParams.get('startAssetId') || '', refresh: url.searchParams.get('refresh') === '1',
        }));
      }
      if (request.method === 'POST' && ['profile-refresh', 'web-refresh', 'free-license', 'idle'].includes(action)) {
        const input = await readJson(request);
        if (['profile-refresh', 'web-refresh'].includes(action) && Object.keys(input).length) throw new ApiError(400, '请求体必须是 {}。');
        if (action === 'profile-refresh') return send(response, 200, await manager.features(id).refreshProfile());
        if (action === 'web-refresh') return send(response, 202, manager.features(id).refreshWeb());
        if (action === 'free-license') return send(response, 200, await manager.features(id).claim(input));
        if (Object.keys(input).some(key => key !== 'appIds')) throw new ApiError(400, '挂机参数只接受 appIds。');
        return send(response, 200, manager.setIdle(id, input.appIds));
      }
      if (!action && request.method === 'GET') return send(response, 200, manager.view(manager.get(id)));
      if (!action && request.method === 'DELETE') {
        manager.remove(id);
        return send(response, 200, { deleted: true, id });
      }
      if (request.method === 'POST' && action === 'login') {
        return send(response, 202, manager.login(id, await readJson(request)));
      }
      if (request.method === 'POST' && action === 'guard') {
        const input = await readJson(request);
        if (Object.keys(input).some(key => key !== 'code')) throw new ApiError(400, 'Unknown guard field.');
        return send(response, 202, manager.submitGuard(id, input.code));
      }
      if (request.method === 'POST' && action === 'logout') {
        const input = await readJson(request);
        if (Object.keys(input).length) throw new ApiError(400, 'Logout body must be {}.');
        return send(response, 200, manager.logout(id));
      }
      throw new ApiError(405, 'Method not allowed.');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) log({ event: 'request_error', message: 'Internal error. Check the data directory and restart if needed.' });
      send(response, status, { error: status === 500 ? 'Internal service error.' : error.message });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
