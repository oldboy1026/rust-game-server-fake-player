import dgram from 'node:dgram';
import { isIP } from 'node:net';
import { randomInt } from 'node:crypto';
import { parseInfo, parsePlayers } from '../../rust-research/query-server.mjs';

const header = Buffer.from([255, 255, 255, 255]);
const now = () => new Date().toISOString();
const port = n => Number.isInteger(n) && n > 0 && n < 65536;
const fail = message => Object.assign(new Error(message), { proxyInputError: true });

export function proxyConfiguration(input, { publicListener = false } = {}) {
  if (!input || Object.keys(input).some(k => !['host', 'gamePort', 'queryPort', 'listenPort', 'listenHost', 'addPlayers'].includes(k))
      || isIP(input.host) !== 4 || !port(input.gamePort) || !port(input.queryPort)
      || !port(input.listenPort) || !Number.isInteger(input.addPlayers) || input.addPlayers < 0 || input.addPlayers > 50
      || (input.listenHost !== undefined && !['127.0.0.1', ...(publicListener ? ['0.0.0.0'] : [])].includes(input.listenHost))) {
    throw fail('代理参数需要 IPv4、游戏/查询/监听端口及 0–50 个测试条目；本地管理端仅监听 127.0.0.1。');
  }
  const result = { ...input, listenHost: input.listenHost || '127.0.0.1' };
  if ((result.host === '127.0.0.1' || result.listenHost === '0.0.0.0') && result.queryPort === result.listenPort)
    throw fail('监听端口与上游查询端口不能相同。');
  return result;
}

// Full, uncompressed A2S datagrams only. Existing entry bytes are preserved.
export function modifyQueryReply(packet, addPlayers, knownMaxPlayers = 255) {
  if (!Number.isInteger(addPlayers) || addPlayers < 0 || addPlayers > 50) throw fail('Invalid test count.');
  if (packet.length < 5 || packet.readInt32LE(0) !== -1) throw new Error('invalid_reply');
  if (packet[4] === 0x41) {
    if (packet.length !== 9) throw new Error('invalid_challenge');
    return { packet, kind: 'challenge' };
  }
  if (packet[4] === 0x49) {
    const info = parseInfo(packet.subarray(4));
    let offset = 6;
    for (let i = 0; i < 4; i++) {
      const end = packet.indexOf(0, offset);
      if (end < 0) throw new Error('invalid_info');
      offset = end + 1;
    }
    offset += 2;
    const desired = Math.max(info.players, Math.min(255, info.maxPlayers, info.players + addPlayers));
    const modified = Buffer.from(packet); modified[offset] = desired;
    const tags = (info.tags || '').split(',').filter(tag => /^cp\d+$/.test(tag));
    return { packet: modified, kind: 'info', originalPlayers: info.players, proxiedPlayers: desired,
      maxPlayers: info.maxPlayers, cp: tags.length === 1 ? Number(tags[0].slice(2)) : null };
  }
  if (packet[4] === 0x44) {
    const players = parsePlayers(packet.subarray(4));
    const desired = Math.max(players.count, Math.min(255, knownMaxPlayers, players.count + addPlayers));
    const parts = [Buffer.from(packet)], indices = new Set(players.players.map(p => p.index));
    parts[0][5] = desired;
    let index = 0;
    for (let i = players.count; i < desired; i++) {
      while (indices.has(index)) index++;
      indices.add(index);
      parts.push(Buffer.from([index]), Buffer.from(`[A2S TEST] ${i - players.count + 1}\0`, 'utf8'), Buffer.alloc(8));
    }
    return { packet: Buffer.concat(parts), kind: 'players', originalPlayers: players.count, proxiedPlayers: desired };
  }
  if (packet[4] === 0x45) return { packet, kind: 'rules' };
  throw new Error('unexpected_reply_type');
}

function validRequest(packet) {
  if (packet.length < 5 || packet.readInt32LE(0) !== -1) return false;
  if ([0x55, 0x56].includes(packet[4])) return packet.length === 9;
  if (packet[4] !== 0x54) return false;
  const prefix = Buffer.concat([header, Buffer.from([0x54]), Buffer.from('Source Engine Query\0')]);
  return [prefix.length, prefix.length + 4].includes(packet.length) && packet.subarray(0, prefix.length).equals(prefix);
}

function splitReply(packet) {
  if (packet.length <= 1200) return [packet];
  const payload = packet.subarray(4), total = Math.ceil(payload.length / 1188), id = randomInt(0x7fffffff);
  if (total > 64) throw new Error('reply_too_large');
  return Array.from({ length: total }, (_, i) => {
    const prefix = Buffer.alloc(12); prefix.writeInt32LE(-2); prefix.writeUInt32LE(id, 4);
    prefix[8] = total; prefix[9] = i; prefix.writeUInt16LE(1200, 10);
    return Buffer.concat([prefix, payload.subarray(i * 1188, (i + 1) * 1188)]);
  });
}

export class RustQueryProxy {
  constructor({ timeoutMs = 3000, idleMs = 30000, maxClients = 64, maxRequestsPerSecond = 80 } = {}) {
    this.timeoutMs = timeoutMs; this.idleMs = idleMs; this.maxClients = maxClients; this.maxRequestsPerSecond = maxRequestsPerSecond;
    this.listener = null; this.clients = new Map(); this.busy = false; this.stats = {};
    this.knownMaxPlayers = 255;
  }
  status() {
    return { running: !!this.listener, changing: this.busy, configuration: this.config || null,
      listener: this.listener ? this.listener.address() : null, activeQueryClients: this.clients.size,
      startedAt: this.startedAt || null, counters: { ...this.stats }, lastInfo: this.lastInfo || null,
      lastPlayers: this.lastPlayers || null, lastError: this.lastError || null,
      publicPathVerified: false, effectiveEacEstablished: false };
  }
  async start(input, options = {}) {
    if (this.closed || this.busy || this.listener) throw fail('代理已经启动、关闭或正在变更，请先停止。');
    const config = proxyConfiguration(input, options);
    this.busy = true;
    const listener = dgram.createSocket('udp4');
    try {
      await new Promise((resolve, reject) => {
        listener.once('error', reject); listener.bind(config.listenPort, config.listenHost, resolve);
      });
      if (this.closed) throw new Error('closed');
      listener.removeAllListeners('error');
      this.config = config; this.listener = listener; this.startedAt = now();
      this.stats = { requests: 0, responses: 0, modifiedReplies: 0, droppedRequests: 0, upstreamErrors: 0 };
      this.lastError = this.lastInfo = this.lastPlayers = null; this.knownMaxPlayers = 255;
      this.rateWindow = Date.now(); this.rateCount = 0;
      listener.on('message', (packet, peer) => this.accept(packet, peer));
      listener.on('error', () => { this.lastError = 'listener_error'; void this.stop(); });
      return { ...this.status(), changing: false };
    } catch (error) {
      try { listener.close(); } catch {}
      throw fail(error.code === 'EADDRINUSE' ? 'UDP 监听端口已被占用。' : '无法启动 UDP 测试代理。');
    } finally { this.busy = false; }
  }
  removeClient(key) {
    const client = this.clients.get(key); if (!client) return;
    clearTimeout(client.timer); clearTimeout(client.idle);
    this.clients.delete(key); try { client.socket.close(); } catch {}
  }
  accept(packet, peer) {
    if (!this.listener) return;
    if (Date.now() - this.rateWindow >= 1000) { this.rateWindow = Date.now(); this.rateCount = 0; }
    if (!validRequest(packet) || ++this.rateCount > this.maxRequestsPerSecond) { this.stats.droppedRequests++; return; }
    const key = `${peer.address}:${peer.port}`;
    let client = this.clients.get(key);
    if (!client) {
      if (this.clients.size >= this.maxClients) { this.stats.droppedRequests++; return; }
      client = { socket: dgram.createSocket('udp4'), peer, pending: false };
      this.clients.set(key, client);
      client.socket.on('message', (reply, source) => {
        if (source.address !== this.config.host || source.port !== this.config.queryPort || !client.pending) return;
        try { this.receive(client, reply); }
        catch { this.stats.upstreamErrors++; this.lastError = 'invalid_or_unsupported_upstream_reply'; this.removeClient(key); }
      });
      client.socket.on('error', () => { this.stats.upstreamErrors++; this.lastError = 'upstream_error'; this.removeClient(key); });
    }
    if (client.pending) { this.stats.droppedRequests++; return; }
    clearTimeout(client.idle); client.pending = true; client.type = packet[4];
    client.fragments = new Map(); client.bytes = 0; client.split = null;
    client.timer = setTimeout(() => { this.stats.upstreamErrors++; this.lastError = 'upstream_timeout'; this.removeClient(key); }, this.timeoutMs);
    this.stats.requests++;
    client.socket.send(packet, this.config.queryPort, this.config.host, error => {
      if (error) { this.stats.upstreamErrors++; this.lastError = 'upstream_error'; this.removeClient(key); }
    });
  }
  receive(client, packet) {
    if (packet.length < 5) throw new Error('short_reply');
    if (packet.readInt32LE(0) === -2) {
      if (packet.length < 12) throw new Error('short_split_reply');
      const id = packet.readUInt32LE(4), total = packet[8], index = packet[9];
      if ((id & 0x80000000) || !total || total > 64 || index >= total) throw new Error('unsupported_split_reply');
      if (!client.split) client.split = { id, total };
      if (client.split.id !== id || client.split.total !== total) throw new Error('mismatched_split_reply');
      if (!client.fragments.has(index)) { client.fragments.set(index, packet.subarray(12)); client.bytes += packet.length - 12; }
      if (client.bytes > 256 * 1024) throw new Error('oversized_reply');
      if (client.fragments.size !== total) return;
      packet = Buffer.concat(Array.from({ length: total }, (_, i) => client.fragments.get(i)));
      if (packet.length < 4 || packet.readInt32LE(0) !== -1) packet = Buffer.concat([header, packet]);
    }
    if (packet.readInt32LE(0) !== -1 || (packet[4] !== 0x41 && packet[4] !== ({ 84: 0x49, 85: 0x44, 86: 0x45 })[client.type]))
      throw new Error('unexpected_reply');
    const result = modifyQueryReply(packet, this.config.addPlayers, this.knownMaxPlayers);
    const { packet: modified, ...metadata } = result;
    if (result.kind === 'info') { this.knownMaxPlayers = result.maxPlayers; this.lastInfo = { ...metadata, observedAt: now() }; }
    if (result.kind === 'players') this.lastPlayers = { ...metadata, observedAt: now() };
    if (!modified.equals(packet)) this.stats.modifiedReplies++;
    clearTimeout(client.timer); client.pending = false;
    client.idle = setTimeout(() => this.removeClient(`${client.peer.address}:${client.peer.port}`), this.idleMs);
    for (const part of splitReply(modified)) this.listener?.send(part, client.peer.port, client.peer.address, () => {});
    this.stats.responses++;
  }
  async stop() {
    if (this.busy) throw fail('代理正在变更，请稍后重试。');
    this.busy = true;
    try {
      const listener = this.listener; this.listener = null;
      for (const key of this.clients.keys()) this.removeClient(key);
      if (listener) await new Promise(resolve => { try { listener.close(resolve); } catch { resolve(); } });
      return { ...this.status(), changing: false };
    } finally { this.busy = false; }
  }
  close() {
    this.closed = true;
    for (const key of this.clients.keys()) this.removeClient(key);
    const listener = this.listener; this.listener = null;
    if (listener) { try { listener.close(); } catch {} }
  }
}
