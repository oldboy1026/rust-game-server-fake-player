import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ApiError } from './accounts.js';
import { FreeCatalog } from './catalog.js';
import { RustWorkspace } from './rust-workspace.js';
import { RustPublicQuery } from './rust-public-query.js';
import { RustQueryProxy } from './rust-query-proxy.js';
import { query as a2sQuery } from '../../rust-research/query-server.mjs';

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function readJson(request, maximumBytes = 16384) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    request.resume();
    throw new ApiError(415, 'Use Content-Type: application/json.');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maximumBytes) {
        chunks.length = 0;
        reject(new ApiError(413, maximumBytes === 16384 ? 'Request body exceeds 16 KiB.' : '导入内容超过 128 KiB。'));
      } else chunks.push(chunk);
    });
    request.on('error', () => reject(new ApiError(400, 'Could not read request body.')));
    request.on('end', () => {
      if (size > maximumBytes) return;
      try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
        resolve(input);
      } catch { reject(new ApiError(400, 'Body must be a JSON object.')); }
    });
  });
}

export function createApiServer({ manager, apiKey, onShutdown, catalog = new FreeCatalog(), log = () => {}, rustWorkspaceOptions = {}, rustPublicQueryOptions = {} }) {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const rustWorkspace = new RustWorkspace(manager, rustWorkspaceOptions);
  const rustPublicQuery = new RustPublicQuery(rustPublicQueryOptions);
  const queryProxy = new RustQueryProxy();
  let samplingProxy = false;
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/details.js', ['details.js', 'text/javascript; charset=utf-8']],
    ['/i18n.js', ['i18n.js', 'text/javascript; charset=utf-8']],
    ['/about', ['about.html', 'text/html; charset=utf-8']],
    ['/about/', ['about.html', 'text/html; charset=utf-8']],
    ['/about.html', ['about.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/rust', ['rust.html', 'text/html; charset=utf-8']],
    ['/rust/', ['rust.html', 'text/html; charset=utf-8']],
    ['/rust.html', ['rust.html', 'text/html; charset=utf-8']],
    ['/rust.js', ['rust.js', 'text/javascript; charset=utf-8']],
    ['/rust.css', ['rust.css', 'text/css; charset=utf-8']],
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
      if (path === '/v1/rust/overview' && request.method === 'GET') return send(response, 200, rustWorkspace.overview());
      if (path === '/v1/rust/query-proxy') {
        if (request.method === 'GET') return send(response, 200, queryProxy.status());
        if (request.method === 'POST') {
          try { return send(response, 200, await queryProxy.start(await readJson(request))); }
          catch (error) { if (error.proxyInputError) throw new ApiError(400, error.message); throw error; }
        }
        if (request.method === 'DELETE') {
          try { return send(response, 200, await queryProxy.stop()); }
          catch (error) { if (error.proxyInputError) throw new ApiError(409, error.message); throw error; }
        }
      }
      if (path === '/v1/rust/query-proxy/sample' && request.method === 'POST') {
        const input = await readJson(request);
        if (Object.keys(input).length) throw new ApiError(400, '采样请求体必须是 {}。');
        if (samplingProxy) throw new ApiError(429, '代理对照采样正在进行。');
        const state = queryProxy.status();
        if (!state.running) throw new ApiError(409, '请先启动查询代理。');
        samplingProxy = true;
        try {
          const sample = async (host, port) => {
            try {
              const info = await a2sQuery(host, port, 'info', { timeoutMs: 3500 });
              if (info.folder !== 'rust' || (info.gamePort !== undefined && info.gamePort !== state.configuration.gamePort))
                return { ok: false, error: 'server_identity_mismatch' };
              const cp = (info.tags || '').split(',').filter(tag => /^cp\d+$/.test(tag));
              return { ok: true, observedAt: new Date().toISOString(), players: info.players, maxPlayers: info.maxPlayers,
                cp: cp.length === 1 ? Number(cp[0].slice(2)) : null };
            } catch { return { ok: false, error: 'a2s_query_failed' }; }
          };
          const config = state.configuration;
          const [original, proxied, facepunch] = await Promise.all([
            sample(config.host, config.queryPort), sample('127.0.0.1', config.listenPort),
            rustPublicQuery.publicCount(`${config.host}:${config.gamePort}`),
          ]);
          if (queryProxy.startedAt !== state.startedAt || !queryProxy.listener) throw new ApiError(409, '代理已变化，请重新采样。');
          return send(response, 200, { observedAt: new Date().toISOString(), configuration: config, original, proxied, facepunch,
            publicPathVerified: false, queryProxy: queryProxy.status() });
        } finally { samplingProxy = false; }
      }
      if (path === '/v1/rust/server-query' && request.method === 'POST')
        return send(response, 200, await rustPublicQuery.server(await readJson(request)));
      if (path === '/v1/rust/import' && request.method === 'POST')
        return send(response, 202, rustWorkspace.startImport(await readJson(request, 128 * 1024)));
      if (path === '/v1/rust/actions' && request.method === 'POST')
        return send(response, 202, rustWorkspace.startActions(await readJson(request)));
      const rustJob = path.match(/^\/v1\/rust\/jobs\/([a-f0-9-]{36})$/);
      if (rustJob && request.method === 'GET') return send(response, 200, rustWorkspace.getJob(rustJob[1]));
      const rustLogs = path.match(/^\/v1\/rust\/accounts\/([a-zA-Z0-9_-]{1,64})\/logs$/);
      if (rustLogs && request.method === 'GET') return send(response, 200, rustWorkspace.accountLogs(rustLogs[1]));
      if (path === '/v1/free-games' && request.method === 'GET') {
        return send(response, 200, await catalog.search(url.searchParams.get('term') || '', Number(url.searchParams.get('start') || 0)));
      }
      const route = path.match(/^\/v1\/accounts\/([a-zA-Z0-9_-]{1,64})(?:\/(login|guard|logout|details|profile-refresh|web-refresh|games|inventory|free-license|idle|rust-auth-check|rust-connect|rust-session|rust-chat|rust-action|rust-steam-count))?$/);
      if (!route) throw new ApiError(404, 'Route not found.');
      const [, id, action] = route;
      if (action === 'rust-action' && request.method === 'POST') {
        return send(response, 202, await manager.features(id).sendRustAction(await readJson(request, 1024)));
      }
      if (action === 'rust-chat' && request.method === 'POST') {
        return send(response, 202, await manager.features(id).sendRustChat(await readJson(request, 2048)));
      }
      if (action === 'rust-steam-count' && request.method === 'GET') {
        return send(response, 200, await manager.features(id).rustSteamCount());
      }
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
  server.once('close', () => { rustWorkspace.close(); queryProxy.close(); });
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
