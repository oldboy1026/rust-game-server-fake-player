import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** HTTP client for other local Node.js programs. No Steam credentials are written here. */
export class SteamAccountsApi {
  constructor({ baseUrl = 'http://127.0.0.1:3210', apiKey, dataDirectory } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    const data = dataDirectory || process.env.STEAM_DATA_DIR || fileURLToPath(new URL('./data', import.meta.url));
    this.apiKey = apiKey || readFileSync(join(data, 'api-key.txt'), 'utf8').trim();
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  path(id, action = '') {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid account id.');
    return `/v1/accounts/${id}${action ? `/${action}` : ''}`;
  }

  async list() { return (await this.request('GET', '/v1/accounts')).accounts; }
  status(id) { return this.request('GET', this.path(id)); }
  login(id, credentials) { return this.request('POST', this.path(id, 'login'), credentials ?? {}); }
  submitGuard(id, code) { return this.request('POST', this.path(id, 'guard'), { code }); }
  logout(id) { return this.request('POST', this.path(id, 'logout'), {}); }
  remove(id) { return this.request('DELETE', this.path(id)); }
  details(id) { return this.request('GET', this.path(id, 'details')); }
  games(id, refresh = false) { return this.request('GET', this.path(id, 'games') + (refresh ? '?refresh=1' : '')); }
  inventory(id, { appId = 753, contextId = '6', startAssetId = '', refresh = false } = {}) {
    return this.request('GET', this.path(id, 'inventory') + '?' + new URLSearchParams({ appId, contextId, startAssetId, refresh: refresh ? '1' : '0' }));
  }
  refreshProfile(id) { return this.request('POST', this.path(id, 'profile-refresh'), {}); }
  refreshWeb(id) { return this.request('POST', this.path(id, 'web-refresh'), {}); }
  startIdling(id, appIds) { return this.request('POST', this.path(id, 'idle'), { appIds }); }
  stopIdling(id) { return this.startIdling(id, []); }
  claimFreeGames(id, appIds) { return this.request('POST', this.path(id, 'free-license'), { appIds }); }
  claimFreePackage(id, packageId) { return this.request('POST', this.path(id, 'free-license'), { packageId }); }
  freeGames(term = '', start = 0) { return this.request('GET', '/v1/free-games?' + new URLSearchParams({ term, start })); }
  shutdown() { return this.request('POST', '/v1/service/shutdown', {}); }
}
