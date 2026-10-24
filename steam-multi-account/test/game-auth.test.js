import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { RustAuthCheck } from '../src/game-auth.js';
import { AccountFeatures } from '../src/features.js';
import { createApiServer } from '../src/http.js';

const APP_ID = 252490;
const sid = '76561198000000001';
const steamID = value => ({ getSteamID64: () => value });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(options = {}) {
  const client = new EventEmitter();
  const buffers = [];
  const parsed = new WeakMap();
  const calls = [];
  let clock = 100000;
  let online = true;
  client.steamID = steamID(sid);
  client.active = [];
  const bytes = label => { const value = Buffer.from(`private-test-${label}`); buffers.push(value); return value; };
  const ticket = session => {
    const value = bytes(session ? 'session' : 'ownership');
    parsed.set(value, {
      appID: APP_ID, steamID: steamID(sid), hasValidSignature: true, isValid: true, isExpired: false,
      signature: value.subarray(0, 7), ...(session ? { authTicket: value.subarray(7, 12) } : {}),
    });
    return value;
  };
  client.getActiveAuthSessionTickets = () => client.active.slice();
  client.getAppOwnershipTicket = async appId => { calls.push(['ownership', appId]); return { appOwnershipTicket: ticket(false) }; };
  client.createAuthSessionTicket = async appId => {
    calls.push(['session', appId]);
    client.active.push({ appID: appId, steamID: steamID(sid) });
    return { sessionTicket: ticket(true) };
  };
  client.createEncryptedAppTicket = async (appId, userData) => {
    calls.push(['encrypted', appId]);
    assert.ok(Buffer.isBuffer(userData)); assert.equal(userData.length, 0);
    return { encryptedAppTicket: bytes('encrypted') };
  };
  client.cancelAuthSessionTickets = async appId => {
    calls.push(['cancel', appId]);
    const own = client.active.filter(item => item.appID === appId && item.steamID.getSteamID64() === sid);
    client.active = client.active.filter(item => !own.includes(item));
    return { canceledTicketCount: own.length };
  };
  client.gamesPlayed = () => { throw new Error('Unexpected gamesPlayed mutation'); };
  const checker = new RustAuthCheck({
    client, parseTicket: value => parsed.get(value), now: () => clock,
    requireOnline: () => { if (!online) throw new Error('offline-private-test'); },
    ensureCurrent: () => { if (!online) throw new Error('changed-private-test'); },
    ...options,
  });
  return { checker, client, buffers, parsed, calls, bytes, ticket, advance: ms => { clock += ms; }, setOnline: value => { online = value; } };
}

test('Rust issuance verifies ownership, cancels the session, wipes buffers, and returns only public metadata', async () => {
  const { checker, client, buffers, calls } = fixture();
  const result = await checker.check();
  assert.deepEqual(calls.map(call => call[0]), ['ownership', 'session', 'encrypted', 'cancel']);
  assert.ok(calls.every(call => call[1] === APP_ID));
  assert.deepEqual(result, {
    appId: APP_ID, status: 'issued_and_canceled',
    ownership: { status: 'verified', byteLength: 22, appId: APP_ID, signatureValid: true },
    authSession: { status: 'issued_and_canceled', byteLength: 20, appId: APP_ID, signatureValid: true },
    encryptedApp: { status: 'issued', byteLength: 22 },
    serverValidated: false, eacVerified: false, playerConnected: false,
    cleanup: { status: 'confirmed', canceledTicketCount: 1 },
  });
  assert.equal(client.active.length, 0);
  assert.ok(buffers.every(value => value.every(byte => byte === 0)));
  const json = JSON.stringify(result);
  for (const secret of ['private-test', sid, 'Buffer', 'gcToken', 'ticketCrc', 'authTicket', 'signature"']) assert.ok(!json.includes(secret));
});

test('existing own Rust tickets are protected; unrelated and foreign tickets survive a diagnostic', async () => {
  const f = fixture();
  const existing = { appID: APP_ID, steamID: steamID(sid) };
  f.client.active.push(existing);
  await assert.rejects(f.checker.check(), { status: 409 });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.client.active, [existing]);
  const foreign = { appID: APP_ID, steamID: steamID('76561198000000002') };
  const otherApp = { appID: 570, steamID: steamID(sid) };
  f.client.active = [foreign, otherApp];
  await f.checker.check();
  assert.deepEqual(f.client.active, [foreign, otherApp]);
});

test('one account has a single in-flight diagnostic and 60 seconds between encrypted attempts', async () => {
  const f = fixture();
  const pending = deferred();
  const original = f.client.createEncryptedAppTicket;
  f.client.createEncryptedAppTicket = async (...args) => { await pending.promise; return original(...args); };
  const first = f.checker.check();
  await nextTurn();
  await assert.rejects(f.checker.check(), { status: 409 });
  pending.resolve();
  await first;
  await assert.rejects(f.checker.check(), { status: 429 });
  f.advance(60000);
  await f.checker.check();
  assert.equal(f.calls.filter(call => call[0] === 'encrypted').length, 2);
});

test('an encrypted request failure counts toward cooldown, cancels the ticket, and sanitizes errors', async () => {
  const f = fixture();
  f.client.createEncryptedAppTicket = async () => { throw Object.assign(new Error('private-test-error-token'), { eresult: 84 }); };
  await assert.rejects(f.checker.check(), error => {
    assert.equal(error.status, 502);
    assert.ok(error.message.includes('RateLimitExceeded'));
    assert.ok(!error.message.includes('private-test'));
    return true;
  });
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
  await assert.rejects(f.checker.check(), { status: 429 });
});

test('a failed session issuance still cancels tickets activated before the error', async () => {
  const f = fixture();
  f.client.createAuthSessionTicket = async () => {
    f.client.active.push({ appID: APP_ID, steamID: steamID(sid) });
    throw Object.assign(new Error('private-test-auth-token'), { eresult: 3 });
  };
  await assert.rejects(f.checker.check(), error => error.status === 502 && error.message.includes('NoConnection') && !error.message.includes('private-test'));
  assert.equal(f.client.active.length, 0);
  assert.ok(f.calls.some(call => call[0] === 'cancel'));
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
});

test('incorrect ownership signature, app, or account stops before session issuance', async () => {
  for (const invalid of [{ hasValidSignature: false }, { appID: 570 }, { steamID: steamID('76561198000000002') }]) {
    const f = fixture();
    f.client.getAppOwnershipTicket = async () => {
      const value = f.ticket(false);
      Object.assign(f.parsed.get(value), invalid);
      return { appOwnershipTicket: value };
    };
    await assert.rejects(f.checker.check(), { status: 502 });
    assert.equal(f.calls.length, 0);
    assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
  }
});

test('a deadline and disconnect keep the claim until late session results and cancellation finish', async () => {
  const f = fixture({ deadlineMs: 15 });
  const session = deferred();
  const cancel = deferred();
  f.client.createAuthSessionTicket = async () => {
    await session.promise;
    f.client.active.push({ appID: APP_ID, steamID: steamID(sid) });
    return { sessionTicket: f.ticket(true) };
  };
  const originalCancel = f.client.cancelAuthSessionTickets;
  f.client.cancelAuthSessionTickets = async (...args) => { await cancel.promise; return originalCancel(...args); };
  await assert.rejects(f.checker.check(), { status: 504 });
  f.checker.disconnect(); // A reconnect of this same SteamUser cannot reuse this request.
  await assert.rejects(f.checker.check(), { status: 409 });
  session.resolve();
  await nextTurn();
  assert.equal(f.client.active.length, 1);
  assert.ok(f.buffers.some(value => value.some(byte => byte !== 0)));
  await assert.rejects(f.checker.check(), { status: 409 });
  cancel.resolve();
  await nextTurn();
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
  assert.ok(!f.calls.some(call => call[0] === 'encrypted'));
  f.client.createAuthSessionTicket = async () => { throw new Error('private-test-final'); };
  await assert.rejects(f.checker.check(), { status: 502 });
});

test('cancellation count mismatch fails safely and retains preexisting-ticket protection', async () => {
  const f = fixture();
  f.client.cancelAuthSessionTickets = async () => ({ canceledTicketCount: 0 });
  await assert.rejects(f.checker.check(), error => error.status === 502 && error.message.includes('取消未确认'));
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
  f.advance(60000);
  await assert.rejects(f.checker.check(), { status: 409 });
});

test('AccountFeatures routes diagnostic state through disconnect without changing gamesPlayed', async () => {
  const f = fixture();
  const features = new AccountFeatures({ account: { saved: { steamId: sid }, state: 'online' }, client: f.client, current: () => true, persist() {} });
  // Use the same real Steam parser entry point injection as the isolated tests.
  features.rustAuth.parseTicket = value => f.parsed.get(value);
  const pending = deferred();
  f.client.createAuthSessionTicket = async () => {
    await pending.promise;
    f.client.active.push({ appID: APP_ID, steamID: steamID(sid) });
    return { sessionTicket: f.ticket(true) };
  };
  const request = features.rustAuthCheck();
  const rejection = assert.rejects(request, { status: 409 });
  await nextTurn();
  features.disconnect();
  pending.resolve();
  await rejection;
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
});

test('HTTP Rust diagnostic requires authentication, accepts only {}, and exposes only its result', async t => {
  let checks = 0;
  const manager = { accounts: new Map(), features(id) { assert.equal(id, 'one'); return { async rustAuthCheck() { checks++; return { appId: APP_ID, status: 'issued_and_canceled', playerConnected: false }; } }; } };
  const server = createApiServer({ manager, apiKey: 'test-api-key' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/v1/accounts/one/rust-auth-check`;
  const headers = { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' };
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"appId":570}' })).status, 400);
  assert.equal(checks, 0);
  const response = await fetch(url, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { appId: APP_ID, status: 'issued_and_canceled', playerConnected: false });
  assert.equal(checks, 1);
});

test('an internal lease shares exclusivity, ignores callback returns, and cancels and wipes before resolving', async () => {
  const f = fixture();
  const pending = deferred();
  let ticket, signal;
  const lease = f.checker.withSessionTicket(async context => {
    assert.equal(context.steamId, sid);
    ticket = context.sessionTicket;
    signal = context.signal;
    assert.equal(signal.aborted, false);
    assert.ok(ticket.some(byte => byte !== 0));
    await pending.promise;
    return ticket; // A consumer cannot turn the lease's return value into an export.
  });
  await nextTurn();
  await assert.rejects(f.checker.check(), { status: 409 });
  await assert.rejects(f.checker.withSessionTicket(() => {}), { status: 409 });
  pending.resolve();
  assert.equal(await lease, undefined);
  assert.equal(signal.aborted, true);
  assert.ok(ticket.every(byte => byte === 0));
  assert.equal(f.client.active.length, 0);
  assert.deepEqual(f.calls.map(call => call[0]), ['session', 'cancel']);
});

test('disconnect aborts a running lease worker and waits for its cancellation', async () => {
  const f = fixture();
  const stopped = deferred();
  let signal;
  const lease = f.checker.withSessionTicket(async context => {
    signal = context.signal;
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    await stopped.promise;
  });
  const rejection = assert.rejects(lease, { status: 409 });
  await nextTurn();
  f.checker.disconnect();
  assert.equal(signal.aborted, true);
  await assert.rejects(f.checker.withSessionTicket(() => {}), { status: 409 });
  stopped.resolve();
  await rejection;
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
});

test('a disconnected lease cancels a late ticket without passing it to the consumer', async () => {
  const f = fixture();
  const pending = deferred();
  let called = false;
  const original = f.client.createAuthSessionTicket;
  f.client.createAuthSessionTicket = async (...args) => { await pending.promise; return original(...args); };
  const lease = f.checker.withSessionTicket(() => { called = true; });
  const rejection = assert.rejects(lease, { status: 409 });
  f.checker.disconnect();
  pending.resolve();
  await rejection;
  assert.equal(called, false);
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
});

test('lease failures are sanitized and cleaned up, and encrypted cooldown does not block leases', async () => {
  const f = fixture();
  await f.checker.check();
  await assert.rejects(f.checker.check(), { status: 429 });
  await assert.rejects(f.checker.withSessionTicket(() => { throw new Error('private-test-worker-ticket'); }), error => {
    assert.equal(error.status, 502);
    assert.ok(!error.message.includes('private-test'));
    return true;
  });
  assert.equal(f.client.active.length, 0);
  assert.ok(f.buffers.every(value => value.every(byte => byte === 0)));
  assert.equal(f.calls.filter(call => call[0] === 'encrypted').length, 1);
});
