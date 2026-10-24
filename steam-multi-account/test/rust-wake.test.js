import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { RustSession } from '../src/rust-session.js';
import { safeMetadata } from '../src/rust-connection.js';

const env = { RUST_PYTHON: 'C:/synthetic/python.exe', RUST_NATIVE_DLL: 'C:/synthetic/RakNet.dll' };

test('wake option reaches the worker and auth remains leased until worker close', async () => {
  let active = false, finished = false, invocation;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => {};
  const session = new RustSession({ spawnWorker: (file, args, options) => {
    invocation = { file, args, options }; return child;
  } });
  const auth = { async withSessionTicket(consume) {
    active = true;
    try { await consume({ sessionTicket: Buffer.from('synthetic-private-ticket'), steamId: '1', signal: new AbortController().signal }); }
    finally { active = false; finished = true; }
  } };
  const view = session.start(auth, { host: '127.0.0.1', port: 1, wakeOnConnect: true }, 'Synthetic', env);
  assert.equal(view.metadata.tickWakeEnabled, true);
  assert.equal(invocation.args.filter(arg => arg === '--wake-on-connect').length, 1);
  assert.ok(!JSON.stringify(invocation).includes('synthetic-private-ticket'));
  assert.equal(invocation.options.shell, false);
  assert.equal(active, true);
  child.stdout.write(`${JSON.stringify({ type: 'progress', selfEntityObserved: true, finishLoadingObserved: true,
    tickWakeEnabled: true, tickPacketsSent: 3, wakePressSent: true, wakeReleaseSent: true,
    wakeAwakeObserved: true, wakeState: 'awake_observed', position: [123, 456, 789] })}\n`);
  assert.equal(session.snapshot().metadata.wakeState, 'awake_observed');
  assert.equal(session.snapshot().metadata.position, undefined);
  child.stdout.write(`${JSON.stringify({ type: 'final', closed: true, tickWakeEnabled: true,
    tickPacketsSent: 3, wakeState: 'awake_observed', wakeAwakeObserved: true })}\n`);
  assert.equal(active, true); // A final message alone does not release the ticket.
  child.emit('close', 0);
  await setImmediate();
  assert.equal(finished, true);
  assert.equal(active, false);
  assert.equal(session.isActive(), false);
});

test('wake remains opt-in and accepts strictly boolean options', async () => {
  let called = 0;
  const session = new RustSession();
  const auth = { async withSessionTicket() { called++; } };
  assert.throws(() => session.start(auth, { host: '127.0.0.1', port: 1, wakeOnConnect: 'true' }, 'Test', env), { status: 400 });
  assert.equal(called, 0);
  assert.equal(session.start(auth, { host: '127.0.0.1', port: 1 }, 'Test', env).metadata.tickWakeEnabled, false);
  await setImmediate();
});

test('wake metadata excludes untrusted values and private state', () => {
  const filtered = safeMetadata({ tickWakeEnabled: true, tickPacketsSent: 3,
    wakeAttempted: true, wakePressSent: true, wakeReleaseSent: false,
    wakeAwakeObserved: false, wakeState: 'sending', privateState: { uid: 'private', position: [1, 2, 3] },
    stages: ['wake_press_sent', 'untrusted-message'] });
  assert.equal(filtered.wakeReleaseSent, false);
  assert.equal(filtered.wakeAwakeObserved, false);
  assert.equal(filtered.tickPacketsSent, 3);
  assert.deepEqual(filtered.stages, ['wake_press_sent']);
  assert.equal(filtered.privateState, undefined);
  for (const invalid of [-1, 4, NaN, '3']) assert.equal(safeMetadata({ tickPacketsSent: invalid }).tickPacketsSent, undefined);
  assert.equal(safeMetadata({ wakeState: 'private text' }).wakeState, undefined);
  assert.equal(safeMetadata({ connectionKeepAliveSent: 42 }).connectionKeepAliveSent, 42);
  assert.equal(safeMetadata({ connectionKeepAliveSent: -1 }).connectionKeepAliveSent, undefined);
  assert.equal(safeMetadata({ wakeInterruptionReason: 'self_rpc', wakeInterruptionRpc: 12345 }).wakeInterruptionRpc, 12345);
  assert.equal(safeMetadata({ wakeInterruptionReason: 'private text', wakeInterruptionRpc: 12345 }).wakeInterruptionRpc, undefined);
});

test('post-entry disconnect messages distinguish response timeout from unknown rejection', async () => {
  for (const [category, expected] of [
    ['player_timeout', '服务器因玩家响应超时（Unresponsive）断开连接。'],
    ['unknown', '服务器已断开连接，当前未识别具体原因。'],
    ['steam_ticket_reused', '服务器报告 Steam 票据已被使用，请等待原会话清理后再连接。'],
  ]) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const session = new RustSession({ spawnWorker: () => child });
    const auth = { async withSessionTicket(consume) {
      await consume({ sessionTicket: Buffer.from('synthetic'), steamId: '1', signal: new AbortController().signal });
    } };
    session.start(auth, { host: '127.0.0.1', port: 1 }, 'Test', env);
    child.stdout.write(`${JSON.stringify({ type: 'progress', selfEntityObserved: true, finishLoadingObserved: true })}\n`);
    child.stdout.write(`${JSON.stringify({ type: 'final', closed: true, disconnectCategory: category })}\n`);
    child.emit('close', 0);
    await setImmediate();
    assert.equal(session.snapshot().lastError, expected);
  }
});

test('maintenance failures remain explicit through metadata filtering and worker cleanup', async () => {
  for (const [stage, expected] of [
    ['connection_keepalive_send_failed', '连接维护消息发送失败，连接已关闭。'],
    ['connection_keepalive_stalled', '本机连接维护停顿过长，已关闭连接，请重新连接。'],
  ]) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const session = new RustSession({ spawnWorker: () => child });
    const auth = { async withSessionTicket(consume) {
      await consume({ sessionTicket: Buffer.from('synthetic'), steamId: '1', signal: new AbortController().signal });
    } };
    session.start(auth, { host: '127.0.0.1', port: 1 }, 'Test', env);
    child.stdout.write(`${JSON.stringify({ type: 'final', closed: true, stages: [stage] })}\n`);
    child.emit('close', 0);
    await setImmediate();
    assert.equal(session.snapshot().lastError, expected);
    assert.equal(session.isActive(), false);
  }
});
