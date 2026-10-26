import { isIP } from 'node:net';
import { query } from '../../rust-research/query-server.mjs';
import { ApiError } from './accounts.js';

export const PUBLIC_COUNTS_URL = 'https://api.facepunch.com/api/public/steamServers/playerCounts/rust';
const HEADER_NAMES = ['date', 'age', 'last-modified', 'cache-control', 'cf-cache-status'];
const now = () => new Date().toISOString();
const validPort = value => Number.isInteger(value) && value >= 1 && value <= 65535;

async function jsonResponse(fetchImpl, url, maximumBytes) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(8000), redirect: 'error', headers: { accept: 'application/json' },
  });
  const headers = Object.fromEntries(HEADER_NAMES.map(name => [name, response.headers.get(name)?.slice(0, 512) ?? null]));
  if (!response.ok) { await response.body?.cancel(); throw new Error('http_error'); }
  if (!response.body) throw new Error('invalid_response');
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new Error('response_too_large');
      parts.push(value);
    }
    return { body: JSON.parse(Buffer.concat(parts, size).toString('utf8')), headers };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function failure(error) {
  const known = ['http_error', 'response_too_large', 'invalid_response'];
  return { ok: false, observedAt: now(), error: error?.message === 'A2S query timed out' || error?.name === 'TimeoutError'
    ? 'timeout' : known.includes(error?.message) ? error.message : 'query_failed' };
}

export class RustPublicQuery {
  constructor({ fetchImpl = globalThis.fetch, queryImpl = query, cacheMs = 30000 } = {}) {
    this.fetchImpl = fetchImpl; this.queryImpl = queryImpl; this.cacheMs = cacheMs;
    this.cached = null; this.inflight = null; this.active = 0;
  }

  async publicCount(endpoint) {
    let localCacheHit = true;
    if (!this.cached || this.cached.expires <= Date.now()) {
      localCacheHit = false;
      if (!this.inflight) {
        this.inflight = (async () => {
          let value;
          try {
            const result = await jsonResponse(this.fetchImpl, PUBLIC_COUNTS_URL, 4 * 1024 * 1024);
            if (!result.body || typeof result.body !== 'object' || Array.isArray(result.body)) throw new Error('invalid_response');
            value = { ok: true, ...result, observedAt: now() };
          } catch (error) { value = failure(error); }
          this.cached = { value, expires: Date.now() + (value.ok ? this.cacheMs : 5000) };
          return value;
        })().finally(() => { this.inflight = null; });
      }
      await this.inflight;
    }
    const value = this.cached.value;
    const metadata = { observedAt: value.observedAt, headers: value.headers ?? {}, localCacheHit, source: PUBLIC_COUNTS_URL };
    if (!value.ok) return { ...value, ...metadata };
    if (!Object.hasOwn(value.body, endpoint)) return { ...metadata, ok: false, error: 'target_not_listed', players: null };
    const players = value.body[endpoint];
    if (!Number.isSafeInteger(players) || players < 0) return { ...metadata, ok: false, error: 'invalid_response', players: null };
    return { ...metadata, ok: true, players };
  }

  async discover(host, port) {
    try {
      const { body } = await jsonResponse(this.fetchImpl,
        `https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/?addr=${encodeURIComponent(host)}`, 1024 * 1024);
      const matches = (Array.isArray(body?.response?.servers) ? body.response.servers : [])
        .filter(server => Number(server.appid) === 252490 && Number(server.gameport) === port)
        .map(server => typeof server.addr === 'string' ? server.addr.split(':') : [])
        .filter(parts => parts.length === 2 && parts[0] === host && /^\d+$/.test(parts[1]) && validPort(Number(parts[1])));
      const ports = [...new Set(matches.map(parts => Number(parts[1])))];
      return ports.length === 1 ? { ok: true, queryPort: ports[0], source: 'steam_registration' }
        : { ok: false, error: ports.length ? 'ambiguous_query_port' : 'query_port_not_found' };
    } catch (error) { return failure(error); }
  }

  async server(input) {
    if (Object.keys(input).some(key => !['host', 'port', 'queryPort', 'includePlayers'].includes(key))
      || typeof input.host !== 'string' || isIP(input.host) !== 4 || !validPort(input.port)
      || (input.queryPort !== undefined && !validPort(input.queryPort))
      || (input.includePlayers !== undefined && typeof input.includePlayers !== 'boolean')) {
      throw new ApiError(400, '请填写 IPv4、有效的游戏端口和可选的查询端口。');
    }
    if (this.active >= 4) throw new ApiError(429, '查询过于频繁，请等待当前查询完成。');
    this.active++;
    try {
      const endpoint = `${input.host}:${input.port}`;
      const [facepunch, udp] = await Promise.all([
        this.publicCount(endpoint),
        (async () => {
          const discovery = input.queryPort ? { ok: true, queryPort: input.queryPort, source: 'provided' }
            : await this.discover(input.host, input.port);
          if (!discovery.ok) return { discovery, a2s: { ok: false, error: 'query_port_required' }, players: { ok: false, error: 'not_queried' } };
          const safeQuery = async kind => {
            try {
              const result = await this.queryImpl(input.host, discovery.queryPort, kind, { timeoutMs: 3000 });
              return { ok: true, observedAt: now(), result };
            }
            catch (error) { return failure(error); }
          };
          const [info, players] = await Promise.all([safeQuery('info'), input.includePlayers ? safeQuery('players') : { ok: false, error: 'not_requested' }]);
          if (!info.ok) return { discovery, a2s: info, players: { ok: false, error: 'server_identity_unverified' } };
          if (info.result.gamePort !== undefined && info.result.gamePort !== input.port) {
            return { discovery, a2s: { ok: false, error: 'game_port_mismatch' }, players: { ok: false, error: 'game_port_mismatch' } };
          }
          if (info.result.folder !== 'rust') return { discovery, a2s: { ok: false, error: 'not_rust_server' }, players: { ok: false, error: 'not_rust_server' } };
          const tags = (info.result.tags ?? '').split(',').filter(tag => /^cp\d+$/.test(tag));
          const cp = tags.length === 1 ? Number(tags[0].slice(2)) : null;
          return { discovery, a2s: { ...info, cp: Number.isSafeInteger(cp) ? cp : null }, players };
        })(),
      ]);
      return { queriedAt: now(), target: { host: input.host, port: input.port, endpoint }, facepunch, ...udp };
    } finally { this.active--; }
  }
}
