import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { readRustRuntime, RUST_DLL_SHA256, safeMetadata } from '../src/rust-connection.js';
import { RustSession } from '../src/rust-session.js';

const dedicatedHash = 'a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21';

test('saved runtime selects inspected dedicated build and environment override never inherits its hash', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rust-runtime-'));
  try {
    const config = { dll: resolve(directory, 'RakNet.dll'), python: resolve(directory, 'python.exe'), sha256: dedicatedHash };
    const env = { STEAM_DATA_DIR: directory };
    writeFileSync(join(directory, 'rust-runtime.json'), JSON.stringify(config));
    assert.equal(readRustRuntime(env).sha256, dedicatedHash);
    assert.equal(readRustRuntime({ ...env, RUST_NATIVE_DLL: resolve(directory, 'client.dll') }).sha256, RUST_DLL_SHA256);
    assert.equal(readRustRuntime({ ...env, RUST_NATIVE_DLL: config.dll, RUST_NATIVE_SHA256: dedicatedHash }).sha256, dedicatedHash);
    writeFileSync(join(directory, 'rust-runtime.json'), JSON.stringify({ ...config, sha256: '0'.repeat(64) }));
    let ticketRequests = 0;
    const session = new RustSession();
    assert.throws(() => session.start({ withSessionTicket() { ticketRequests++; } },
      { host: '127.0.0.1', port: 1 }, 'Synthetic', env), { code: 'rust_runtime_unsupported', status: 503 });
    assert.equal(ticketRequests, 0);
    assert.equal(session.snapshot().state, 'error');
    assert.equal(session.snapshot().metadata.dllSha256, undefined);
    // Old configs without a hash keep the original client build contract.
    delete config.sha256;
    writeFileSync(join(directory, 'rust-runtime.json'), JSON.stringify(config));
    assert.equal(readRustRuntime(env).sha256, RUST_DLL_SHA256);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('selected native hash reaches worker and status without being relabelled as the client build', async () => {
  let invocation;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const session = new RustSession({ spawnWorker: (file, args) => { invocation = args; return child; } });
  const auth = { async withSessionTicket(consume) {
    await consume({ sessionTicket: Buffer.from('synthetic'), steamId: '1', signal: new AbortController().signal });
  } };
  const status = session.start(auth, { host: '127.0.0.1', port: 1 }, 'Synthetic', {
    RUST_NATIVE_DLL: resolve('synthetic/RakNet.dll'), RUST_PYTHON: resolve('synthetic/python.exe'),
    RUST_NATIVE_SHA256: dedicatedHash,
  });
  assert.equal(invocation[invocation.indexOf('--sha256') + 1], dedicatedHash);
  assert.equal(status.metadata.dllSha256, dedicatedHash);
  child.stdout.write(`${JSON.stringify({ type: 'final', dllSha256: dedicatedHash, closed: true, stages: ['eac_required'] })}\n`);
  child.emit('close', 0);
  await setImmediate();
  assert.equal(session.snapshot().metadata.dllSha256, dedicatedHash);
  assert.equal(session.snapshot().state, 'error');
  assert.match(session.snapshot().lastError, /EAC/);
  for (const hash of [undefined, 'private-path', '0'.repeat(64), '__proto__']) {
    assert.equal(safeMetadata({ dllSha256: hash }).dllSha256, undefined);
  }
});
