import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { RustSession, validateChat } from '../src/rust-session.js';
import { safeMetadata } from '../src/rust-connection.js';
import { createApiServer } from '../src/http.js';

const env = { RUST_PYTHON: 'C:/synthetic/python.exe', RUST_NATIVE_DLL: 'C:/synthetic/RakNet.dll' };
function setup() {
  const child = new EventEmitter(), controls = [];
  for (const key of ['stdin', 'stdout', 'stderr']) child[key] = new PassThrough();
  child.kill = () => {};
  child.stdin.on('data', bytes => controls.push(JSON.parse(bytes.toString('utf8'))));
  let leased = false;
  const auth = { async withSessionTicket(consume) {
    leased = true;
    try { await consume({ sessionTicket: Buffer.from('synthetic'), steamId: '1', signal: new AbortController().signal }); }
    finally { leased = false; }
  } };
  const session = new RustSession({ spawnWorker: () => child });
  const progress = metadata => child.stdout.write(`${JSON.stringify({ type: 'progress', selfEntityObserved: true, finishLoadingObserved: true, ...metadata })}\n`);
  const close = async () => {
    child.stdout.write('{"type":"final","closed":true}\n'); child.emit('close', 0); await setImmediate();
  };
  return { session, child, controls, auth, progress, close, leased: () => leased };
}

test('chat validation rejects command injection and invalid Unicode before touching a worker', () => {
  assert.equal(validateChat({ text: '连接测试 hello 😀' }), '连接测试 hello 😀');
  assert.equal(validateChat({ text: '😀'.repeat(128) }).length, 256);
  for (const body of [null, [], {}, { text: '' }, { text: ' ' }, { text: 'x'.repeat(129) },
    { text: 'a\nb' }, { text: 'a\rb' }, { text: 'a";quit' }, { text: 'a\\b' }, { text: 'a;b' },
    { text: '\ud800' }, { text: 'a\u2028b' }, { text: 'hello', command: 'quit' }]) {
    assert.throws(() => validateChat(body), { status: 400 });
  }
  assert.throws(() => new RustSession().sendChat({ text: 'hello' }), { status: 409 });
});

test('chat waits for its exact worker acknowledgement and never claims server delivery', async () => {
  const f = setup(); f.session.start(f.auth, { host: '127.0.0.1', port: 1 }, 'Test', env);
  assert.throws(() => f.session.sendChat({ text: 'hello' }), { status: 409 });
  f.progress({});
  let settled = false;
  const result = f.session.sendChat({ text: 'private chat' }).then(x => { settled = true; return x; });
  assert.deepEqual(f.controls.at(-1), { chat: { id: 1, text: 'private chat' } });
  assert.throws(() => f.session.sendChat({ text: 'another' }), { status: 409 });
  f.progress({ lastChat: { id: 2, status: 'sent' } }); await setImmediate();
  assert.equal(settled, false);
  f.progress({ lastChat: { id: 1, status: 'sent', text: 'private chat' }, chatMessagesSent: 1 });
  assert.deepEqual(await result, { status: 'sent_to_transport', requestId: 1, serverConfirmed: false });
  assert.equal(f.leased(), true);
  assert.ok(!JSON.stringify(f.session.snapshot()).includes('private chat'));
  assert.throws(() => f.session.sendChat({ text: 'another' }), { status: 429 });
  await f.close(); assert.equal(f.leased(), false);
});

test('stopping and worker exit reject pending chat without retrying or releasing the lease early', async () => {
  for (const stop of [true, false]) {
    const f = setup(); f.session.start(f.auth, { host: '127.0.0.1', port: 1 }, 'Test', env); f.progress({});
    const pending = f.session.sendChat({ text: 'hello' });
    const rejected = assert.rejects(pending, { status: 409 });
    if (stop) { f.session.stop(); assert.equal(f.leased(), true); }
    await f.close(); await rejected;
    assert.equal(f.controls.filter(x => x.chat).length, 1);
  }
});

test('HTTP chat route requires authentication and returns the worker result', async t => {
  const apiKey = 'a'.repeat(64), calls = [];
  const manager = { accounts: new Map(), features: id => ({ sendRustChat: async body => {
    calls.push({ id, body }); return { status: 'sent_to_transport', requestId: 7, serverConfirmed: false };
  } }) };
  const server = createApiServer({ manager, apiKey, log: () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/v1/accounts/one/rust-chat`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  assert.deepEqual(calls, []);
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: 'sent_to_transport', requestId: 7, serverConfirmed: false });
  assert.deepEqual(calls, [{ id: 'one', body: { text: 'hello' } }]);
});

test('chat metadata never accepts arbitrary worker text or invalid request IDs', () => {
  assert.deepEqual(safeMetadata({ lastChat: { id: 2, status: 'sent', text: 'private' }, chatMessagesSent: 1 }).lastChat, { id: 2, status: 'sent' });
  for (const value of [{ id: -1, status: 'sent' }, { id: true, status: 'sent' }, { id: 1, status: 'private text' }]) {
    assert.equal(safeMetadata({ lastChat: value }).lastChat, undefined);
  }
});
