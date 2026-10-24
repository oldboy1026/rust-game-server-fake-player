import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { AccountManager } from '../src/accounts.js';
import { RustWorkspace } from '../src/rust-workspace.js';
import { createApiServer } from '../src/http.js';

class FakeClient extends EventEmitter {
  logOn(details) {
    this.details = details;
    if (details.accountName === 'guarded' || details.refreshToken === 'guard-token')
      this.emit('steamGuard', 'example.test', () => {}, false);
    else if (details.accountName === 'bad')
      this.emit('error', Object.assign(new Error('private error text'), { eresult: 5 }));
    else if (details.accountName !== 'timeout') this.emit('loggedOn');
  }
  steamID = { getSteamID64: () => 'test-identity' };
  setPersona() {}
  gamesPlayed() {}
  logOff() { this.stopped = true; }
}

function fixture(t, saved = [], options = {}) {
  const store = { saved: structuredClone(saved), read() { return structuredClone(this.saved); },
    write(value) { this.saved = structuredClone(value); } };
  const clients = [];
  const manager = new AccountManager({ store, createClient: () => {
    const client = new FakeClient(); clients.push(client); return client;
  }, onlinePersona: 1, resultNames: { 5: 'InvalidPassword' } });
  const workspace = new RustWorkspace(manager, { loginTimeoutMs: 100, pollMs: 2,
    connectSpacingMs: 0, queryServer: async () => ({ name: 'Local test server' }), ...options });
  t.after(() => { workspace.close(); manager.close(); });
  return { manager, workspace, store, clients };
}

async function completed(workspace, job) {
  for (let i = 0; i < 500; i++) {
    const view = workspace.getJob(job.id);
    if (view.state !== 'running') { assert.equal(view.completed, view.total); return view; }
    await delay(3);
  }
  assert.fail('Batch did not finish');
}

test('import isolates success, Guard, failure, timeout and malformed rows without exposing passwords', async t => {
  const { manager, workspace, clients, store } = fixture(t);
  const passwords = ['secret:with:colons ', 'guard-secret', 'bad-secret', 'timeout-secret'];
  const job = await completed(workspace, workspace.startImport({ text:
    `alpha:${passwords[0]}\nguarded:${passwords[1]}\nbad:${passwords[2]}\ntimeout:${passwords[3]}\nALPHA:duplicate-secret\ninvalid line with secret` }));
  assert.deepEqual([...manager.accounts.keys()], ['alpha']);
  assert.deepEqual(job.results.map(r => r.status).sort(), ['failed', 'failed', 'skipped', 'skipped', 'skipped', 'success']);
  assert.equal(clients.find(c => c.details?.accountName === 'alpha').details.password, passwords[0]);
  assert.ok(clients.filter(c => c.details?.accountName !== 'alpha').every(c => c.stopped));
  assert.deepEqual(store.saved.map(a => a.accountName), ['alpha']);
  const publicOutput = JSON.stringify({ job, overview: workspace.overview(), logs: workspace.accountLogs('alpha'), saved: store.saved });
  for (const value of [...passwords, 'duplicate-secret', 'invalid line with secret', 'private error text'])
    assert.ok(!publicOutput.includes(value));
  assert.equal(workspace.logs.size, 1);
});

test('Guard on an existing saved account cancels login while preserving the original record', async t => {
  const { manager, workspace, clients, store } = fixture(t, [{ id: 'existing', accountName: 'guarded', refreshToken: 'guard-token' }]);
  const job = await completed(workspace, workspace.startActions({ action: 'login', accountIds: ['existing'] }));
  assert.equal(job.results[0].status, 'skipped');
  assert.match(job.results[0].message, /原有账号保留/);
  assert.equal(manager.get('existing').state, 'offline');
  assert.equal(manager.get('existing').guardCallback, null);
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].refreshToken, 'guard-token');
  assert.ok(clients[0].stopped);
});

test('initial persistence failure rolls back a newly created import and cleanup failure is explicit', async t => {
  const first = fixture(t);
  const originalWrite = first.store.write.bind(first.store);
  let writes = 0;
  first.store.write = value => { if (++writes === 1) throw new Error('disk'); originalWrite(value); };
  const rolledBack = await completed(first.workspace, first.workspace.startImport({ text: 'alpha:private-pass' }));
  assert.equal(rolledBack.results[0].status, 'failed');
  assert.equal(first.manager.accounts.size, 0);
  assert.equal(first.store.saved.length, 0);

  const second = fixture(t);
  second.store.write = () => { throw new Error('persistent disk failure'); };
  const notRemoved = await completed(second.workspace, second.workspace.startImport({ text: 'alpha:private-pass' }));
  assert.match(notRemoved.results[0].message, /无法保存清理结果/);
  assert.equal(second.manager.get('alpha').client, null);
  assert.equal(second.manager.get('alpha').saved.autoConnect, false);
});

test('duplicate concurrent imports preserve the owner and closing a workspace cancels pending login', async t => {
  const { manager, workspace, clients } = fixture(t);
  const owner = workspace.startImport({ text: 'timeout:owner-pass' });
  const duplicate = await completed(workspace, workspace.startImport({ text: 'TIMEOUT:other-pass' }));
  assert.equal(duplicate.results[0].status, 'skipped');
  assert.equal(clients.length, 1);
  workspace.close();
  const ended = await completed(workspace, owner);
  assert.equal(ended.state, 'cancelled');
  assert.equal(manager.accounts.size, 0);
  assert.ok(clients[0].stopped);
});

test('batch connect validates selection and target, counts only entered sessions, and logs per account', async t => {
  const { manager, workspace } = fixture(t, ['one', 'two', 'three'].map(id => ({ id, accountName: id })));
  const starts = [];
  for (const account of manager.accounts.values()) {
    account.state = 'online';
    let snapshot = { state: 'closed', metadata: {} };
    account.features = {
      profile: {}, snapshot: () => ({}), disconnect() {},
      rustSessionStatus: () => snapshot,
      startRustSession(target) {
        starts.push({ id: account.saved.id, target });
        if (account.saved.id === 'two') throw new Error('isolated error');
        snapshot = { state: 'connecting', ...target, metadata: {} };
      },
    };
    account.rustSession = { stop() { snapshot = { ...snapshot, state: 'closed', metadata: { closed: true } }; },
      enter() { snapshot = { ...snapshot, state: 'entered_game', startedAt: 'now',
        metadata: { ownPlayerState: { observed: true, lifeState: 'alive' }, stages: ['finish_loading_observed'] } }; } };
  }
  assert.throws(() => workspace.startActions({ action: 'connect', accountIds: [], target: {} }), { status: 400 });
  assert.throws(() => workspace.startActions({ action: 'connect', accountIds: ['one'], target: { host: 'invalid', port: 1 } }), { status: 400 });
  assert.throws(() => workspace.startActions({ action: 'connect', accountIds: ['one'], target: { host: '127.0.0.1', port: 1 }, respawnOnDead: 'true' }), { status: 400 });
  assert.throws(() => workspace.startActions({ action: 'connect', accountIds: ['one'], target: { host: '127.0.0.1', port: 1 }, wakeOnConnect: 'true' }), { status: 400 });
  const job = await completed(workspace, workspace.startActions({ action: 'connect', accountIds: ['one', 'one', 'two', 'three'],
    target: { host: '127.0.0.1', port: 20090, queryPort: 20091 } }));
  assert.deepEqual(job.results.map(r => r.status), ['started', 'failed', 'started']);
  assert.equal(starts.length, 3);
  assert.ok(starts.every(s => s.target.respawnOnDead === false));
  assert.ok(starts.every(s => s.target.wakeOnConnect === false));
  manager.get('one').rustSession.enter();
  const view = workspace.overview();
  assert.equal(view.counts.connected, 1);
  assert.equal(view.counts.connecting, 1);
  assert.equal(view.servers[0].name, 'Local test server');
  assert.equal(view.servers[0].connectedAccounts, 1);
  assert.deepEqual(view.servers[0].accountNames, ['one']);
  assert.ok(workspace.accountLogs('one').logs.some(l => l.event === 'finish_loading_observed'));
  assert.ok(!workspace.accountLogs('two').logs.some(l => l.event === 'finish_loading_observed'));
  const first = manager.get('one');
  const realStatus = first.features.rustSessionStatus;
  first.features.rustSessionStatus = () => ({ ...realStatus(), metadata: { closed: true } });
  assert.equal(workspace.overview().counts.connected, 0);
  assert.equal(workspace.overview().servers[0].connectingAccounts, workspace.overview().counts.connecting);
  first.features.rustSessionStatus = realStatus;
  await completed(workspace, workspace.startActions({ action: 'disconnect', accountIds: ['one', 'three'] }));
  assert.equal(workspace.overview().counts.connected, 0);
  assert.equal(workspace.overview().servers.length, 0);
  await completed(workspace, workspace.startActions({ action: 'connect', accountIds: ['one'],
    target: { host: '127.0.0.1', port: 20090 }, wakeOnConnect: true }));
  assert.equal(starts.at(-1).target.wakeOnConnect, true);
});

test('Rust HTTP routes protect batch operations and accept bounded imports larger than the old 16 KiB limit', async t => {
  const { manager } = fixture(t);
  const key = 'a'.repeat(64);
  const server = createApiServer({ manager, apiKey: key, rustWorkspaceOptions: { loginTimeoutMs: 100, pollMs: 2,
    queryServer: async () => ({ name: 'Test' }) } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, extra = {}) => fetch(url + path, { method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await fetch(url + '/rust')).status, 200);
  assert.equal((await fetch(url + '/rust.js')).status, 200);
  assert.equal((await fetch(url + '/v1/rust/overview')).status, 401);
  assert.equal((await request('/v1/rust/import', 'POST', { text: 'alpha:pass' }, { Origin: 'https://example.test' })).status, 403);
  const imported = await request('/v1/rust/import', 'POST', { text: `alpha:pass\n${'invalid row\n'.repeat(190)}` });
  assert.equal(imported.status, 202);
  const job = await imported.json();
  let result;
  for (let i = 0; i < 100; i++) {
    result = await (await request(`/v1/rust/jobs/${job.id}`)).json();
    if (result.state !== 'running') break;
    await delay(3);
  }
  assert.equal(result.completed, result.total);
  assert.equal((await request('/v1/rust/accounts/alpha/logs')).status, 200);
  assert.equal((await request('/v1/rust/import', 'POST', { text: 'z'.repeat(20000) })).status, 202);
  assert.equal((await request('/v1/rust/import', 'POST', { text: 'z'.repeat(132000) })).status, 413);
  assert.equal((await request('/v1/rust/actions', 'POST', { action: 'connect', accountIds: ['missing'], target: { host: '127.0.0.1', port: 20090 } })).status, 404);
});
