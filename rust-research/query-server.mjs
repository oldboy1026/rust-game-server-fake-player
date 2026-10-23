import dgram from 'node:dgram';
import { isIP } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

class Reader {
  constructor(buffer, offset = 0) { this.buffer = buffer; this.offset = offset; }
  take(size) {
    if (!Number.isInteger(size) || size < 0 || this.offset + size > this.buffer.length) throw new Error('Truncated A2S response');
    const offset = this.offset; this.offset += size; return offset;
  }
  u8() { return this.buffer[this.take(1)]; }
  u16() { return this.buffer.readUInt16LE(this.take(2)); }
  u64() { return this.buffer.readBigUInt64LE(this.take(8)).toString(); }
  string() {
    const end = this.buffer.indexOf(0, this.offset);
    if (end < 0) throw new Error('Unterminated A2S string');
    const value = this.buffer.toString('utf8', this.offset, end); this.offset = end + 1; return value;
  }
}

export function parseInfo(buffer) {
  const reader = new Reader(buffer);
  if (reader.u8() !== 0x49) throw new Error('Expected A2S_INFO response');
  const protocol = reader.u8();
  const name = reader.string(), map = reader.string(), folder = reader.string(), game = reader.string();
  const appId16 = reader.u16(), players = reader.u8(), maxPlayers = reader.u8(), bots = reader.u8();
  const serverType = String.fromCharCode(reader.u8()), environment = String.fromCharCode(reader.u8());
  const passwordProtected = Boolean(reader.u8()), vacSecure = Boolean(reader.u8()), version = reader.string();
  const extra = {};
  if (reader.offset < buffer.length) {
    const flags = reader.u8();
    if (flags & 0x80) extra.gamePort = reader.u16();
    if (flags & 0x10) extra.serverSteamId = reader.u64();
    if (flags & 0x40) { extra.spectatorPort = reader.u16(); extra.spectatorName = reader.string(); }
    if (flags & 0x20) extra.tags = reader.string();
    if (flags & 0x01) extra.gameId64 = reader.u64();
  }
  return { protocol, name, map, folder, game, appId16, players, maxPlayers, bots, serverType, environment, passwordProtected, vacSecure, version, ...extra };
}

export function parseRules(buffer) {
  const reader = new Reader(buffer);
  if (reader.u8() !== 0x45) throw new Error('Expected A2S_RULES response');
  const count = reader.u16();
  const relevant = [];
  for (let index = 0; index < count; index++) {
    const name = reader.string(), value = reader.string();
    if (/eac|anticheat|secure|encryption|protocol|version|build/i.test(name)) relevant.push({ name, value });
  }
  return { count, relevant, note: 'Published rule strings are advisory; they do not prove the server enforces EAC.' };
}

export async function query(host, port, kind, { timeoutMs = 5000 } = {}) {
  if (isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('An IPv4 address and valid UDP query port are required');
  if (!['info', 'rules'].includes(kind)) throw new Error('Unsupported A2S query');
  const base = kind === 'info'
    ? Buffer.concat([Buffer.from([255, 255, 255, 255, 0x54]), Buffer.from('Source Engine Query\0')])
    : Buffer.from([255, 255, 255, 255, 0x56]);
  const first = kind === 'info' ? base : Buffer.concat([base, Buffer.from([255, 255, 255, 255])]);
  const socket = dgram.createSocket('udp4');
  return new Promise((resolve, reject) => {
    let finished = false, challenges = 0, splitId = null, splitTotal = null, receivedBytes = 0;
    const fragments = new Map();
    const finish = (error, result) => {
      if (finished) return; finished = true; clearTimeout(timer); socket.close();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('A2S query timed out')), timeoutMs);
    socket.on('error', error => finish(error));
    socket.on('message', (packet, source) => {
      if (source.address !== host || source.port !== port || packet.length < 5 || finished) return;
      try {
        const header = packet.readInt32LE(0);
        let payload;
        if (header === -1) payload = packet.subarray(4);
        else if (header === -2) {
          if (packet.length < 12) throw new Error('Truncated split A2S header');
          const id = packet.readUInt32LE(4), total = packet[8], number = packet[9];
          if (id & 0x80000000) throw new Error('Compressed A2S replies require a bzip2 decoder, which this tool does not include');
          if (!total || total > 64 || number >= total) throw new Error('Invalid split A2S header');
          if (splitId === null) { splitId = id; splitTotal = total; }
          if (id !== splitId || total !== splitTotal) return;
          if (!fragments.has(number)) { fragments.set(number, packet.subarray(12)); receivedBytes += packet.length - 12; }
          if (receivedBytes > 256 * 1024) throw new Error('A2S response exceeds size limit');
          if (fragments.size !== total) return;
          payload = Buffer.concat(Array.from({ length: total }, (_, index) => fragments.get(index)));
          if (payload.length >= 4 && payload.readInt32LE(0) === -1) payload = payload.subarray(4);
        } else return;
        if (payload[0] === 0x41) {
          if (payload.length < 5 || ++challenges > 2) throw new Error('Invalid or repeated A2S challenge');
          fragments.clear(); splitId = null; splitTotal = null; receivedBytes = 0;
          socket.send(Buffer.concat([base, payload.subarray(1, 5)]), port, host, error => { if (error) finish(error); });
          return;
        }
        const result = kind === 'info' ? parseInfo(payload) : parseRules(payload);
        finish(null, result);
      } catch (error) { finish(error); }
    });
    socket.send(first, port, host, error => { if (error) finish(error); });
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
  const host = option('--host', '202.189.21.138');
  const port = Number(option('--port', '28017'));
  const record = { observedAt: new Date().toISOString(), endpoint: { host, queryPort: port }, eacVerification: 'not established by A2S', playerLoginAttempted: false };
  for (const kind of ['info', 'rules']) {
    try { record[kind] = { ok: true, result: await query(host, port, kind) }; }
    catch (error) { record[kind] = { ok: false, error: error.message }; }
  }
  const json = JSON.stringify(record, null, 2);
  const output = option('--out', null);
  if (output) await writeFile(output, json + '\n');
  console.log(json);
  if (!record.info.ok) process.exitCode = 1;
}
