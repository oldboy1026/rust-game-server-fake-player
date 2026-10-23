import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { AccountManager } from '../src/accounts.js';
import { createApiServer } from '../src/http.js';
import { FreeCatalog } from '../src/catalog.js';
import { steamProxy } from '../src/network.js';
import { SteamAccountsApi } from '../client.js';

const sid = '76561198000000001';
export class FeatureClient extends EventEmitter {
  constructor() { super(); this.calls = []; this.gamesReads = 0; this.licenses = []; }
  logOn() {}
  logOff() { this.emit('disconnected', 0); }
  setPersona() {}
  gamesPlayed(ids, force) { this.calls.push({ ids, force }); }
  webLogOn() { this.webRequested = true; }
  async getPersonas() { return { personas: { [sid]: { player_name: '测试昵称', avatar_url_full: 'https://avatars.steamstatic.com/example_full.jpg' } } }; }
  async getSteamLevels() { return { users: { [sid]: 17 } }; }
  async getUserOwnedApps() { this.gamesReads++; return { app_count: 1, apps: [{ appid: 570, name: 'Dota 2', playtime_forever: 1234 }] }; }
  async requestFreeLicense(ids) { this.requestedIds = ids; return this.noGrant ? { grantedAppIds: [], grantedPackageIds: [] } : { grantedAppIds: ids, grantedPackageIds: [123] }; }
  online() { this.steamID = { getSteamID64: () => sid }; this.emit('loggedOn'); }
}

async function fixture({ fetchImpl = async () => { throw new Error('Unexpected external request.'); } } = {}) {
  const store = { saved: [], read() { return structuredClone(this.saved); }, write(accounts) { this.saved = structuredClone(accounts); } };
  const clients = [];
  const packageClaims = [];
  const manager = new AccountManager({
    store, createClient: () => { const client = new FeatureClient(); clients.push(client); return client; },
    onlinePersona: 1, resultNames: { 15: 'AccessDenied' }, currencyNames: { 23: 'CNY' },
    featureOptions: { fetchImpl, createStore: () => ({ setCookies() {}, async addFreeLicense(id) { packageClaims.push(id); } }) },
  });
  manager.login('one', { accountName: 'account_one', password: 'not-a-real-password' });
  await nextTurn(); clients[0].online(); await nextTurn();
  return { manager, client: clients[0], store, packageClaims };
}

test('profile combines Steam events, masks email, reads level, and excludes session secrets', async t => {
  const { manager, client } = await fixture(); t.after(() => manager.close());
  client.emit('accountInfo', '测试昵称', 'CN', 3, 0);
  client.emit('emailInfo', 'personal@example.com', true);
  client.emit('wallet', true, 23, 12.34);
  client.emit('accountLimitations', false, false, false, true);
  client.emit('vacBans', 0, []);
  client.emit('licenses', [{ package_id: 123 }]);
  client.emit('webSession', 'secret-session', ['sessionid=secret-session', `steamLoginSecure=${sid}%7C%7Csecret-token`]);
  const data = manager.details('one');
  assert.equal(data.profile.steamLevel, 17);
  assert.equal(data.profile.nickname, '测试昵称');
  assert.equal(data.profile.email, 'pe***@example.com');
  assert.equal(data.profile.wallet.balance, 12.34);
  assert.equal(data.profile.wallet.currencyCode, 'CNY');
  assert.equal(data.profile.licenseCount, 1);
  assert.equal(data.webReady, true);
  assert.ok(!JSON.stringify(data).includes('secret-token'));
  assert.ok(!JSON.stringify(data).includes('personal@example.com'));
});

test('game library caches reads and supports explicit refresh', async t => {
  const { manager, client } = await fixture(); t.after(() => manager.close());
  const features = manager.features('one');
  const result = await features.games();
  assert.equal(result.games[0].appId, 570);
  assert.equal(result.games[0].playtimeMinutes, 1234);
  await features.games(); assert.equal(client.gamesReads, 1);
  await features.games(true); assert.equal(client.gamesReads, 2);
});

test('inventory joins descriptions, uses private web cookies, and paginates without exposing them', async t => {
  const requests = [];
  const { manager, client } = await fixture({ fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), cookie: options.headers.Cookie });
    const next = new URL(url).searchParams.has('start_assetid');
    return Response.json({ success: 1, assets: [{ assetid: next ? '2' : '1', classid: '10', instanceid: '0', amount: '1' }], descriptions: [{ classid: '10', instanceid: '0', name: '测试卡牌', type: '集换式卡牌', tradable: 1, marketable: 1, descriptions: [{ type: 'text', value: '<b>纯文本展示</b>' }] }], total_inventory_count: 2, more_items: next ? 0 : 1, last_assetid: '1' });
  } }); t.after(() => manager.close());
  const features = manager.features('one');
  await assert.rejects(() => features.inventory(), { status: 409 });
  client.emit('webSession', 'private', ['sessionid=private', `steamLoginSecure=${sid}%7C%7Cprivate-token`]);
  const first = await features.inventory();
  assert.equal(first.items[0].name, '测试卡牌');
  assert.equal(first.more, true); assert.equal(first.nextAssetId, '1');
  assert.ok(!JSON.stringify(first).includes('private-token'));
  assert.ok(requests[0].cookie.includes('private-token'));
  await features.inventory(); assert.equal(requests.length, 1);
  const second = await features.inventory({ startAssetId: first.nextAssetId });
  assert.equal(second.items[0].assetId, '2'); assert.equal(second.more, false);
  assert.equal(requests[1].url.searchParams.get('start_assetid'), '1');
  await assert.rejects(() => features.inventory({ contextId: '../etc' }), { status: 400 });
});

test('idling persists, resumes after reconnect, and yields to other playing sessions', async t => {
  const { manager, client, store } = await fixture(); t.after(() => manager.close());
  const state = manager.setIdle('one', [570, 730, 570]);
  assert.deepEqual(state.appIds, [570, 730]);
  assert.equal(state.status, 'running');
  assert.deepEqual(store.saved[0].idle.appIds, [570, 730]);
  assert.deepEqual(client.calls.at(-1).ids, [570, 730]);
  assert.equal(client.calls.at(-1).force, undefined);
  client.emit('playingState', true, 440);
  assert.equal(manager.details('one').idle.status, 'paused_other_session');
  assert.deepEqual(client.calls.at(-1).ids, []);
  client.emit('playingState', false, 0);
  assert.deepEqual(client.calls.at(-1).ids, [570, 730]);
  const calls = client.calls.length;
  client.emit('playingState', false, 570); assert.equal(client.calls.length, calls);
  client.emit('disconnected', 0);
  assert.equal(manager.details('one').idle.status, 'waiting_connection');
  client.online(); assert.deepEqual(client.calls.at(-1).ids, [570, 730]);
  manager.setIdle('one', []); assert.deepEqual(client.calls.at(-1).ids, []);
  assert.equal(store.saved[0].idle.enabled, false);
  assert.throws(() => manager.setIdle('one', [-1]), { status: 400 });
});

test('free license results distinguish grants and no grant; packages require web session', async t => {
  const { manager, client, packageClaims } = await fixture(); t.after(() => manager.close());
  const features = manager.features('one');
  const first = await features.claim({ appIds: [570] });
  assert.equal(first.status, 'granted'); assert.deepEqual(client.requestedIds, [570]);
  await assert.rejects(() => features.claim({ appIds: [730] }), { status: 429 });
  features.claimHistory[0].at = new Date(Date.now() - 4000).toISOString();
  client.noGrant = true;
  assert.equal((await features.claim({ appIds: [730] })).status, 'not_granted');
  await assert.rejects(() => features.claim({ packageId: 500 }), { status: 409 });
  client.emit('webSession', 'private', ['sessionid=private']);
  features.claimHistory.at(-1).at = new Date(Date.now() - 4000).toISOString();
  assert.equal((await features.claim({ packageId: 500 })).status, 'granted');
  assert.deepEqual(packageClaims, [500]);
  await assert.rejects(() => features.claim({ appIds: [], packageId: 500 }), { status: 400 });
});

test('authenticated feature HTTP routes work through Node SDK; idling stops while offline', async t => {
  const { manager } = await fixture();
  const server = createApiServer({ manager, apiKey: 'c'.repeat(64) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { manager.close(); server.closeAllConnections(); server.close(); });
  const api = new SteamAccountsApi({ baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'c'.repeat(64) });
  assert.equal((await api.details('one')).profile.steamLevel, 17);
  assert.equal((await api.games('one')).total, 1);
  assert.equal((await api.startIdling('one', [570])).enabled, true);
  assert.equal((await api.claimFreeGames('one', [570])).status, 'granted');
  await api.logout('one');
  assert.equal((await api.stopIdling('one')).enabled, false);
  await assert.rejects(() => api.startIdling('one', [570]), { status: 409 });
});

test('catalog parses Steam store results and uses returned page length for pagination', async () => {
  let requests = 0;
  const catalog = new FreeCatalog({ fetchImpl: async () => { requests++; return Response.json({ total_count: 100, results_html: '<a class="search_result_row" href="https://store.steampowered.com/app/570/"><span class="title">Dota &amp; test</span><img src="https://evil.example/image.png"></a><a class="search_result_row" href="https://store.steampowered.com/app/730/"><span class="title">Counter-Strike 2</span></a>' }); } });
  const result = await catalog.search();
  assert.equal(result.games.length, 2); assert.equal(result.nextStart, 2);
  assert.equal(result.games[0].name, 'Dota & test'); assert.equal(result.games[0].imageUrl, null);
  await catalog.search(); assert.equal(requests, 1);
  await assert.rejects(() => catalog.search('', -1), { status: 400 });
});

test('website requests honor explicit, environment, and Windows proxy settings', () => {
  assert.equal(steamProxy({ STEAM_HTTP_PROXY: 'direct' }, 'win32', () => { throw new Error(); }), null);
  assert.equal(steamProxy({ HTTPS_PROXY: 'http://127.0.0.1:8888' }, 'linux'), 'http://127.0.0.1:8888/');
  assert.equal(steamProxy({}, 'win32', () => ({ enabled: true, server: 'http=127.0.0.1:8888;https=127.0.0.1:9999' })), 'http://127.0.0.1:9999/');
  assert.equal(steamProxy({}, 'win32', () => ({ enabled: false, server: '127.0.0.1:8888' })), null);
  assert.throws(() => steamProxy({ STEAM_HTTP_PROXY: 'socks5://127.0.0.1:8888' }, 'linux'));
});
