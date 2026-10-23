import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AccountManager } from '../src/accounts.js';
import { createApiServer } from '../src/http.js';
import { EncryptedStore, loadApiKey } from '../src/store.js';
import { SteamAccountsApi } from '../client.js';
import { request as httpRequest } from 'node:http';

class FakeClient extends EventEmitter {
  logOn(details) { this.loginDetails = details; }
  gamesPlayed(ids) { this.playing = ids; }
  logOff() { this.stopped = true; this.emit('disconnected', 0); }
  setPersona(value) { this.persona = value; }
  online(steamId = '76561198000000001') {
    this.steamID = { getSteamID64: () => steamId };
    this.emit('loggedOn');
  }
}

function fixture(saved = []) {
  const store = {
    saved: structuredClone(saved),
    read() { return structuredClone(this.saved); },
    write(accounts) { this.saved = structuredClone(accounts); },
  };
  const clients = [];
  const manager = new AccountManager({
    store, createClient: () => { const client = new FakeClient(); clients.push(client); return client; },
    onlinePersona: 1, resultNames: { 5: 'InvalidPassword' },
  });
  return { store, clients, manager };
}

test('two accounts connect independently, persist tokens, and reconnect after disconnection', async t => {
  const { manager, clients, store } = fixture();
  t.after(() => manager.close());
  manager.login('one', { accountName: 'first', password: 'secret-one' });
  manager.login('two', { accountName: 'second', password: 'secret-two' });
  await nextTurn();
  assert.equal(clients.length, 2);
  assert.equal(clients[0].loginDetails.accountName, 'first');
  assert.notEqual(clients[0].loginDetails.logonID, clients[1].loginDetails.logonID);
  clients[0].emit('refreshToken', 'token-one');
  clients[1].emit('refreshToken', 'token-two');
  clients[0].online();
  clients[1].online('76561198000000002');
  assert.deepEqual(manager.list().map(account => account.state), ['online', 'online']);
  assert.equal(clients[0].persona, 1);
  assert.ok(!JSON.stringify(manager.list()).includes('token-one'));
  assert.ok(!JSON.stringify(store.saved).includes('secret-one'));
  clients[0].emit('disconnected', 0);
  assert.equal(manager.list()[0].state, 'reconnecting');
  assert.equal(manager.list()[1].state, 'online');
  clients[0].online();
  assert.equal(manager.list()[0].state, 'online');
});

test('Steam Guard is one-shot, reports incorrect-code cooldown, and never stores the code', async t => {
  const { manager, clients, store } = fixture();
  t.after(() => manager.close());
  manager.login('one', { accountName: 'first', password: 'secret' });
  await nextTurn();
  let submitted;
  clients[0].emit('steamGuard', 'mail.example', code => { submitted = code; }, false);
  assert.equal(manager.list()[0].guard.type, 'email');
  manager.submitGuard('one', 'abc12');
  assert.equal(submitted, 'ABC12');
  assert.throws(() => manager.submitGuard('one', 'ABC12'), { status: 409 });
  clients[0].emit('steamGuard', null, () => {}, true);
  assert.equal(manager.list()[0].guard.type, 'totp');
  assert.throws(() => manager.submitGuard('one', 'ABC12'), { status: 429 });
  assert.ok(!JSON.stringify(store.saved).includes('ABC12'));
});

test('logout ignores stale callbacks, preserves saved login, and disables restart restoration', async () => {
  const { manager, clients, store } = fixture();
  manager.login('one', { accountName: 'first', password: 'secret' });
  await nextTurn();
  clients[0].emit('refreshToken', 'good-token');
  clients[0].online();
  manager.logout('one');
  clients[0].emit('refreshToken', 'stale-token');
  clients[0].emit('error', new Error('late secret message'));
  clients[0].online();
  assert.equal(manager.list()[0].state, 'offline');
  assert.equal(store.saved[0].refreshToken, 'good-token');
  manager.close();
  const restored = fixture(store.saved);
  restored.manager.restore();
  await delay(20);
  assert.equal(restored.clients.length, 0);
  restored.manager.login('one');
  await nextTurn();
  assert.equal(restored.clients[0].loginDetails.refreshToken, 'good-token');
  assert.equal(restored.clients[0].loginDetails.password, undefined);
  restored.manager.close();
});

test('restart restores enabled accounts and stores renewed refresh tokens', async () => {
  const first = fixture();
  first.manager.login('one', { accountName: 'first', password: 'secret' });
  await nextTurn();
  first.clients[0].emit('refreshToken', 'old-token');
  first.manager.close();
  const second = fixture(first.store.saved);
  second.manager.restore();
  await delay(20);
  assert.equal(second.clients.length, 1);
  assert.equal(second.clients[0].loginDetails.refreshToken, 'old-token');
  second.clients[0].emit('refreshToken', 'renewed-token');
  assert.equal(second.store.saved[0].refreshToken, 'renewed-token');
  second.manager.close();
});

test('cancel before scheduled login prevents connection; deleting removes the saved account', async () => {
  const { manager, clients, store } = fixture();
  manager.login('one', { accountName: 'first', password: 'secret' });
  manager.remove('one');
  await nextTurn();
  assert.equal(clients[0].loginDetails, undefined);
  assert.deepEqual(store.saved, []);
  manager.close();
});

test('HTTP endpoints enforce auth, input validation, distinct accounts, and sanitized failures', async t => {
  const { manager, clients } = fixture();
  const key = 'a'.repeat(64);
  let shutdownRequested = false;
  const server = createApiServer({ manager, apiKey: key, onShutdown: () => { shutdownRequested = true; } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { manager.close(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const sdk = new SteamAccountsApi({ baseUrl: url, apiKey: key });
  const request = (path, method = 'GET', body, headers = {}) => fetch(`${url}${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal((await fetch(`${url}/health`)).status, 200);
  const dashboard = await fetch(`${url}/`);
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.headers.get('content-type').startsWith('text/html'));
  assert.ok(dashboard.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  const html = await dashboard.text();
  assert.ok(html.includes('Steam 多账号管理'));
  assert.ok(!html.includes(key));
  assert.equal((await fetch(`${url}/app.js`)).status, 200);
  assert.equal((await fetch(`${url}/styles.css`)).status, 200);
  const foreignHostStatus = await new Promise((resolveStatus, reject) => {
    const probe = httpRequest(`${url}/health`, { headers: { Host: 'external.example' } }, response => {
      response.resume(); resolveStatus(response.statusCode);
    });
    probe.on('error', reject); probe.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(`${url}/v1/accounts`)).status, 401);
  assert.deepEqual(await sdk.list(), []);
  assert.equal((await request('/v1/accounts', 'GET', undefined, { Origin: url })).status, 200);
  assert.equal((await request('/v1/accounts', 'GET', undefined, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await request('/v1/accounts/one/login', 'POST', { accountName: 'first' })).status, 400);
  assert.equal((await request('/v1/accounts/one/login', 'POST', null)).status, 400);
  assert.equal((await request('/v1/accounts/one/login', 'POST', { password: 'x'.repeat(17000) })).status, 413);
  assert.equal((await request('/v1/accounts/one/login', 'POST', { accountName: 'first', password: 'secret', authCode: 12345 })).status, 400);
  assert.equal((await request('/v1/accounts/one/login', 'POST', { accountName: 'first', password: 'secret' }, { Origin: url })).status, 202);
  await nextTurn();
  assert.equal((await request('/v1/accounts/two/login', 'POST', { accountName: 'FIRST', password: 'secret' })).status, 409);
  assert.equal((await request('/v1/accounts/one/login', 'POST', {})).status, 409);
  await assert.rejects(() => sdk.login('one'), { status: 409 });
  let submitted;
  clients[0].emit('steamGuard', null, code => { submitted = code; }, false);
  assert.equal((await sdk.submitGuard('one', 'abc12')).state, 'connecting');
  assert.equal(submitted, 'ABC12');
  clients[0].emit('error', Object.assign(new Error('do not expose password secret'), { eresult: 5 }));
  const status = await sdk.status('one');
  assert.equal(status.state, 'error');
  assert.equal(status.lastError.code, 'InvalidPassword');
  assert.ok(!JSON.stringify(status).includes('secret'));
  assert.equal((await sdk.logout('one')).state, 'offline');
  assert.equal((await sdk.remove('one')).deleted, true);
  assert.equal((await request('/v1/accounts/one')).status, 404);
  assert.equal((await sdk.shutdown()).stopping, true);
  await nextTurn();
  assert.equal(shutdownRequested, true);
});

test('saved account encryption survives restart, detects tampering, and API key stays stable', t => {
  const parent = resolve(import.meta.dirname, '../work');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'store-test-'));
  t.after(() => {
    assert.ok(directory.startsWith(`${parent}\\`) || directory.startsWith(`${parent}/`));
    rmSync(directory, { recursive: true, force: true });
  });
  const store = new EncryptedStore(directory);
  const accounts = [{ id: 'one', accountName: 'first', refreshToken: 'sensitive-login-token' }];
  store.write(accounts);
  const saved = readFileSync(join(directory, 'accounts.enc'), 'utf8');
  assert.ok(!saved.includes('sensitive-login-token'));
  assert.deepEqual(new EncryptedStore(directory).read(), accounts);
  assert.equal(loadApiKey(directory), loadApiKey(directory));
  const damaged = JSON.parse(saved);
  const bytes = Buffer.from(damaged.content, 'base64');
  bytes[0] ^= 1;
  damaged.content = bytes.toString('base64');
  writeFileSync(join(directory, 'accounts.enc'), JSON.stringify(damaged));
  assert.throws(() => store.read());
});
