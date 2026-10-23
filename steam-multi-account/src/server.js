import SteamUser from 'steam-user';
import { mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccountManager } from './accounts.js';
import { createApiServer } from './http.js';
import { EncryptedStore, loadApiKey } from './store.js';
import { createSteamNetwork } from './network.js';
import { FreeCatalog } from './catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = resolve(process.env.STEAM_DATA_DIR || join(root, 'data'));
const port = Number(process.env.PORT || 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1-65535.');
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

// A second process must never rotate tokens or overwrite the same account store.
const lockPath = join(dataDirectory, 'service.lock');
let lockFd;
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lockFd = openSync(lockPath, 'wx', 0o600);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let pid;
      try { pid = Number(readFileSync(lockPath, 'utf8').trim()); } catch {}
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid data/service.lock; stop all service processes before removing it.');
      try {
        process.kill(pid, 0);
      } catch (probeError) {
        if (probeError.code === 'ESRCH') { unlinkSync(lockPath); continue; }
        throw new Error('Cannot verify an existing service process.');
      }
      throw new Error('Another service process is already using this data directory.');
    }
  }
  throw new Error('Could not acquire the service lock.');
}

acquireLock();
writeSync(lockFd, String(process.pid));
process.on('exit', () => {
  if (lockFd !== undefined) {
    closeSync(lockFd);
    try { unlinkSync(lockPath); } catch {}
  }
});

const log = event => console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
const store = new EncryptedStore(dataDirectory);
const network = createSteamNetwork();
const manager = new AccountManager({
  store,
  createClient: () => new SteamUser({
    autoRelogin: true, renewRefreshTokens: true, dataDirectory: null, saveAppTickets: false,
    webCompatibilityMode: process.env.STEAM_WEB_COMPAT !== '0',
    enablePicsCache: false, changelistUpdateInterval: 0,
  }),
  onlinePersona: SteamUser.EPersonaState.Online,
  resultNames: SteamUser.EResult,
  currencyNames: SteamUser.ECurrencyCode,
  featureOptions: network,
  log,
});
const apiKey = loadApiKey(dataDirectory);
const server = createApiServer({ manager, apiKey, log, onShutdown: shutdown, catalog: new FreeCatalog(network) });
server.on('error', error => {
  log({ event: 'server_error', code: error.code, message: 'Could not start the local HTTP server.' });
  manager.close();
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  log({ event: 'ready', url: `http://127.0.0.1:${port}`, apiKeyFile: join(dataDirectory, 'api-key.txt'), websiteProxy: network.usingProxy });
  manager.restore();
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  log({ event: 'stopping' });
  manager.close();
  network.close()?.catch(() => {});
  server.close();
  server.closeIdleConnections();
  // Allow Steam up to four seconds to acknowledge graceful logoff.
  setTimeout(() => process.exit(0), 4500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
