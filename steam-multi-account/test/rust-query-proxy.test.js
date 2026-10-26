import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { RustQueryProxy, modifyQueryReply, proxyConfiguration } from '../src/rust-query-proxy.js';
import { query, parseInfo, parsePlayers } from '../../rust-research/query-server.mjs';
import { createApiServer } from '../src/http.js';

const prefix = Buffer.from([255, 255, 255, 255]);
const info = ({ players = 12, max = 200, tags = 'mp200,cp12,v2635', gamePort = 40176 } = {}) => {
  const app = Buffer.alloc(2); app.writeUInt16LE(252490 % 65536);
  const extraPort = Buffer.alloc(2); extraPort.writeUInt16LE(gamePort);
  return Buffer.concat([prefix, Buffer.from([0x49, 17]), Buffer.from('Fixture\0Map\0rust\0Rust\0'), app,
    Buffer.from([players, max, 0, 100, 119, 0, 1]), Buffer.from('2635\0'), Buffer.from([0xa0]), extraPort, Buffer.from(tags + '\0')]);
};
const players = () => Buffer.concat([prefix, Buffer.from([0x44, 1, 7]), Buffer.from('Original\0'), Buffer.alloc(8)]);
async function bind(socket) { socket.bind(0, '127.0.0.1'); await once(socket, 'listening'); return socket.address().port; }
async function close(socket) { return new Promise(resolve => { try { socket.close(resolve); } catch { resolve(); } }); }
async function sparePort() { const socket = dgram.createSocket('udp4'); const p = await bind(socket); await close(socket); return p; }
async function fixture(t, { challenge = false, split = false, response = info(), silent = false, timeoutMs = 500, idleMs = 500 } = {}) {
  const upstream = dgram.createSocket('udp4'), seen = [];
  const queryPort = await bind(upstream), proxy = new RustQueryProxy({ timeoutMs, idleMs });
  t.after(async () => { await proxy.stop(); await close(upstream); });
  upstream.on('message', (packet, peer) => {
    seen.push(peer.port);
    if (silent) return;
    if (challenge && packet.length === Buffer.concat([prefix, Buffer.from([0x54]), Buffer.from('Source Engine Query\0')]).length) {
      upstream.send(Buffer.concat([prefix, Buffer.from([0x41, 1, 2, 3, 4])]), peer.port, peer.address); return;
    }
    const value = packet[4] === 0x55 ? players() : response;
    if (!split) { upstream.send(value, peer.port, peer.address); return; }
    const chunks = [value.subarray(4, 24), value.subarray(24)];
    for (const i of [1, 0]) {
      const h = Buffer.alloc(12); h.writeInt32LE(-2); h.writeUInt32LE(17, 4); h[8] = 2; h[9] = i; h.writeUInt16LE(1200, 10);
      upstream.send(Buffer.concat([h, chunks[i]]), peer.port, peer.address);
    }
  });
  const configuration = { host: '127.0.0.1', gamePort: 40176, queryPort, listenPort: await sparePort(), addPlayers: 10 };
  await proxy.start(configuration);
  return { proxy, upstream, configuration, seen };
}

test('INFO changes only players, preserves cp and source packet, and never wraps', () => {
  const original = info(), copy = Buffer.from(original), result = modifyQueryReply(original, 10);
  assert.equal(parseInfo(result.packet.subarray(4)).players, 22);
  assert.equal(parseInfo(result.packet.subarray(4)).tags, 'mp200,cp12,v2635');
  assert.deepEqual(original, copy); assert.equal(result.cp, 12);
  assert.equal(modifyQueryReply(info({ players: 250, max: 255 }), 50).proxiedPlayers, 255);
  assert.deepEqual(modifyQueryReply(original, 0).packet, original);
  assert.equal(modifyQueryReply(info({ players: 210, max: 200 }), 50).proxiedPlayers, 210);
});
test('PLAYER entries are explicit test records, retain real record and unique indices', () => {
  const original = players(), result = modifyQueryReply(original, 3, 2);
  const parsed = parsePlayers(result.packet.subarray(4));
  assert.equal(parsed.count, 2); assert.equal(parsed.players[0].name, 'Original');
  assert.equal(parsed.players[1].name, '[A2S TEST] 1');
  assert.equal(parsed.players[1].durationSeconds, 0);
  assert.notEqual(parsed.players[0].index, parsed.players[1].index);
  assert.equal(original[5], 1);
});
test('challenge is unchanged; malformed and unknown replies reject without reading past buffers', () => {
  const challenge = Buffer.concat([prefix, Buffer.from([0x41, 1, 0, 0, 0])]);
  assert.deepEqual(modifyQueryReply(challenge, 10).packet, challenge);
  for (let size = 0; size < 6; size++) assert.throws(() => modifyQueryReply(Buffer.alloc(size), 10));
  assert.throws(() => modifyQueryReply(Buffer.concat([prefix, Buffer.from([0x49])]), 10));
  assert.throws(() => modifyQueryReply(info(), 256));
});
test('configuration rejects public dashboard listeners, self loops and invalid counts', () => {
  const input = { host: '127.0.0.1', gamePort: 1, queryPort: 2, listenPort: 3, addPlayers: 10 };
  assert.throws(() => proxyConfiguration({ ...input, listenHost: '0.0.0.0' }));
  assert.throws(() => proxyConfiguration({ ...input, listenPort: 2 }));
  for (const addPlayers of [-1, 51, 1.5, '10']) assert.throws(() => proxyConfiguration({ ...input, addPlayers }));
  assert.equal(proxyConfiguration(input).listenHost, '127.0.0.1');
});
test('UDP challenge round trip retains upstream source socket and edits a real reply', async t => {
  const { proxy, configuration: c, seen } = await fixture(t, { challenge: true });
  const result = await query('127.0.0.1', c.listenPort, 'info', { timeoutMs: 1500 });
  assert.equal(result.players, 22); assert.match(result.tags, /cp12/);
  assert.equal(seen.length, 2); assert.equal(seen[0], seen[1]);
  assert.equal(proxy.status().counters.modifiedReplies, 1);
  assert.equal(proxy.status().lastInfo.originalPlayers, 12);
  assert.equal(proxy.status().publicPathVerified, false);
  await proxy.stop(); assert.equal(proxy.status().activeQueryClients, 0);
});
test('out-of-order split upstream replies reassemble and large output splits again', async t => {
  const { configuration: c } = await fixture(t, { split: true, response: info({ tags: 'cp12,' + 'x'.repeat(2400) }) });
  const result = await query('127.0.0.1', c.listenPort, 'info', { timeoutMs: 1500 });
  assert.equal(result.players, 22); assert.equal(result.tags.length, 2405);
});
test('PLAYER UDP response yields only test placeholders and exposes no names in proxy metrics', async t => {
  const { proxy, configuration: c } = await fixture(t);
  const result = await query('127.0.0.1', c.listenPort, 'players', { timeoutMs: 1500 });
  assert.equal(result.count, 11); assert.equal(result.players[1].name, '[A2S TEST] 1');
  assert.ok(!JSON.stringify(proxy.status()).includes('Original'));
});
test('silent upstream times out and releases its bounded query socket', async t => {
  const { proxy, configuration: c } = await fixture(t, { silent: true, timeoutMs: 40 });
  await assert.rejects(query('127.0.0.1', c.listenPort, 'info', { timeoutMs: 180 }));
  assert.equal(proxy.status().activeQueryClients, 0); assert.equal(proxy.status().lastError, 'upstream_timeout');
});
test('bad upstream cannot crash proxy; idle clients expire; non-query datagrams are dropped', async t => {
  const { proxy, configuration: c } = await fixture(t, { response: Buffer.from([1, 2]), idleMs: 40 });
  await assert.rejects(query('127.0.0.1', c.listenPort, 'info', { timeoutMs: 180 }));
  assert.equal(proxy.status().counters.upstreamErrors, 1);
  const sender = dgram.createSocket('udp4'); await bind(sender);
  sender.send(Buffer.from('not a game transport proxy'), c.listenPort, '127.0.0.1');
  await delay(25); await close(sender);
  assert.equal(proxy.status().counters.droppedRequests, 1);
});
test('API auth, loopback restriction, three-way sample and socket cleanup', async t => {
  const { configuration: c } = await fixture(t);
  const manager = { list: () => [], accounts: new Map() };
  const server = createApiServer({ manager, apiKey: 'fixture-key', rustPublicQueryOptions: {
    fetchImpl: async () => new Response(JSON.stringify({ '127.0.0.1:40176': 4 }), { headers: { 'last-modified': 'Mon, 26 Oct 2026 00:00:00 GMT' } }),
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, authorized = true) => fetch(url + path, { method,
    headers: { ...(authorized ? { Authorization: 'Bearer fixture-key' } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await request('/v1/rust/query-proxy', 'GET', undefined, false)).status, 401);
  const config = { ...c, listenPort: await sparePort() };
  assert.equal((await request('/v1/rust/query-proxy', 'POST', { ...config, listenHost: '0.0.0.0' })).status, 400);
  assert.equal((await request('/v1/rust/query-proxy', 'POST', config)).status, 200);
  const response = await request('/v1/rust/query-proxy/sample', 'POST', {}), sample = await response.json();
  assert.equal(response.status, 200); assert.equal(sample.original.players, 12); assert.equal(sample.proxied.players, 22);
  assert.equal(sample.facepunch.players, 4); assert.equal(sample.publicPathVerified, false);
  assert.equal((await request('/v1/rust/query-proxy', 'DELETE')).status, 200);
  assert.equal((await request('/v1/rust/query-proxy/sample', 'POST', {})).status, 409);
});
