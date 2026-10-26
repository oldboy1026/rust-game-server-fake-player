import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { RustSession } from '../src/rust-session.js';
import { validateRustAction } from '../src/rust-actions.js';
import { safeMetadata } from '../src/rust-connection.js';
import { createApiServer } from '../src/http.js';

test('actions accept fixed controls and require explicit flat-area confirmation', () => {
  assert.deepEqual(validateRustAction({ action: 'wake' }), { action: 'wake', flatGround: false });
  assert.deepEqual(validateRustAction({ action: 'jump', flatGround: true }), { action: 'jump', flatGround: true });
  assert.throws(() => validateRustAction({ action: 'suicide' }), { status: 400 });
  assert.deepEqual(validateRustAction({ action: 'suicide', confirmDeath: true }), { action: 'suicide', flatGround: false, confirmDeath: true });
  for (const input of [null, [], {}, { action: 'kill' }, { action: 'jump' }, { action: 'forward', flatGround: 1 },
    { action: 'wake', position: [1, 2, 3] }, { action: 'stop', flatGround: null }]) {
    assert.throws(() => validateRustAction(input), { status: 400 });
  }
  assert.throws(() => new RustSession().sendAction({ action: 'wake' }), { status: 409 });
});

test('exact action receipt, stop during cooldown and worker cleanup preserve ticket ownership', async () => {
  const child = new EventEmitter(), controls = [];
  for (const key of ['stdin', 'stdout', 'stderr']) child[key] = new PassThrough();
  child.kill = () => {};
  child.stdin.on('data', data => controls.push(JSON.parse(data.toString('utf8'))));
  let leased = false;
  const auth = { async withSessionTicket(callback) {
    leased = true;
    try { await callback({ sessionTicket: Buffer.from('synthetic'), steamId: '1', signal: new AbortController().signal }); }
    finally { leased = false; }
  } };
  const session = new RustSession({ spawnWorker: () => child });
  session.start(auth, { host: '127.0.0.1', port: 1 }, 'Test', { RUST_PYTHON: 'C:/synthetic/python.exe', RUST_NATIVE_DLL: 'C:/synthetic/RakNet.dll' });
  const progress = value => child.stdout.write(`${JSON.stringify({ type: 'progress', selfEntityObserved: true, finishLoadingObserved: true, ...value })}\n`);
  assert.throws(() => session.sendAction({ action: 'wake' }), { status: 409 });
  progress({});
  let settled = false;
  const pending = session.sendAction({ action: 'wake' }).then(result => { settled = true; return result; });
  assert.deepEqual(controls.at(-1), { action: { id: 1, action: 'wake', flatGround: false } });
  progress({ lastAction: { id: 2, action: 'wake', status: 'started' } }); await setImmediate();
  assert.equal(settled, false);
  progress({ lastAction: { id: 1, action: 'wake', status: 'started', position: 'private' } });
  assert.deepEqual(await pending, { id: 1, action: 'wake', status: 'started', serverConfirmed: false });
  assert.throws(() => session.sendAction({ action: 'wake' }), { status: 429 });
  const stop = session.sendAction({ action: 'stop' });
  const stopped = assert.rejects(stop, { status: 409 });
  session.stop();
  assert.equal(leased, true);
  child.stdout.write('{"type":"final","closed":true}\n'); child.emit('close', 0);
  await stopped; await setImmediate();
  assert.equal(leased, false);
  assert.ok(!JSON.stringify(session.snapshot()).includes('private'));
});

test('action route requires Bearer key and returns honest worker status', async t => {
  const apiKey = 'b'.repeat(64), calls = [];
  const manager = { accounts: new Map(), features: id => ({ sendRustAction: async body => {
    calls.push({ id, body }); return { id: 1, action: 'wake', status: 'stale_state', serverConfirmed: false };
  } }) };
  const server = createApiServer({ manager, apiKey, log: () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/v1/accounts/test/rust-action`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  assert.equal(calls.length, 0);
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: '{"action":"wake"}' });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, 'stale_state');
  assert.deepEqual(calls, [{ id: 'test', body: { action: 'wake' } }]);
});

test('action metadata excludes positions, arbitrary text and malformed receipts', () => {
  assert.deepEqual(safeMetadata({ lastAction: { id: 1, action: 'forward', status: 'sent', position: [10, 20, 30] } }).lastAction,
    { id: 1, action: 'forward', status: 'sent' });
  for (const receipt of [{ id: true, action: 'wake', status: 'sent' }, { id: 1, action: 'quit', status: 'sent' }, { id: 1, action: 'wake', status: 'private' }]) {
    assert.equal(safeMetadata({ lastAction: receipt }).lastAction, undefined);
  }
  assert.deepEqual(safeMetadata({ stages: ['action_release_unavailable', 'action_native_send_failed'] }).stages,
    ['action_release_unavailable', 'action_native_send_failed']);
});
