import { isIP } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createSteamNetwork } from '../../steam-multi-account/src/network.js';
import { RustPublicQuery } from '../../steam-multi-account/src/rust-public-query.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const STATUSES = new Set(['snapshot', 'normal_refresh_invoked', 'forbidden', 'invalid_target', 'cooldown_30_seconds',
  'target_not_a_ready_authenticated_player', 'protected_target_not_authenticated', 'steam_platform_unavailable',
  'server_platform_unavailable', 'incompatible_runtime_or_snapshot_failed', 'refresh_failed_or_partially_invoked']);

export function argumentsFrom(argv) {
  const allowed = new Set(['--host', '--port', '--query-port', '--steam-id', '--account', '--action', '--wait-seconds', '--out']);
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || options.has(argv[i]) || argv[i + 1] === undefined) throw new Error('invalid_arguments');
    options.set(argv[i], argv[i + 1]);
  }
  const port = Number(options.get('--port')), host = options.get('--host');
  const queryPort = options.has('--query-port') ? Number(options.get('--query-port')) : undefined;
  const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
  const action = options.get('--action') ?? 'snapshot';
  const steamId = options.get('--steam-id'), account = options.get('--account');
  const waitSeconds = Number(options.get('--wait-seconds') ?? (action === 'refresh' ? '35' : '0'));
  if (typeof host !== 'string' || isIP(host) !== 4 || !validPort(port) || (queryPort !== undefined && !validPort(queryPort))
    || !['snapshot', 'refresh'].includes(action) || (steamId && !/^\d{17}$/.test(steamId))
    || (account && !/^[A-Za-z0-9_-]{1,64}$/.test(account)) || (steamId && account)
    || (action === 'refresh' && !steamId && !account) || !Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 60) {
    throw new Error('invalid_arguments');
  }
  return { host, port, queryPort, steamId, account, action, waitSeconds, output: options.get('--out') };
}

export function filterReply(body) {
  if (body?.bridge !== 'RustPresenceBridge' || body.version !== '0.1.0' || !STATUSES.has(body.status) || body.backendAccepted !== null)
    throw new Error('unexpected_bridge_reply');
  const result = { bridge: body.bridge, version: body.version, status: body.status, backendAccepted: null };
  for (const key of ['playerUpdateReturned', 'serverInformationReturned']) if (typeof body[key] === 'boolean') result[key] = body[key];
  for (const key of ['snapshot', 'before', 'after']) {
    if (!body[key] || typeof body[key] !== 'object') continue;
    result[key] = {};
    for (const name of ['utc', 'activePlayers', 'networkConnections', 'secure', 'steamValid', 'steamLoggedOn',
      'eacInterfaceAvailable', 'targetRequested', 'targetActive', 'targetConnected', 'targetReceivingSnapshot',
      'targetNetworkConnected', 'targetNetworkAuthenticated', 'targetEacMapped', 'targetEacStatusAuthenticated']) {
      const value = body[key][name];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        || (name === 'utc' && typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)))) result[key][name] = value;
    }
  }
  return result;
}

export function rconCommand(url, command, { timeoutMs = 12000, WebSocketImpl = globalThis.WebSocket } = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = randomInt(1, 2147483647);
    let socket, done = false, sent = false;
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      try { socket?.close(); } catch {}
      if (error) reject(error); else resolvePromise(value);
    };
    const timer = setTimeout(() => finish(new Error(sent ? 'rcon_result_unknown' : 'rcon_connection_failed')), timeoutMs);
    try { socket = new WebSocketImpl(url); }
    catch { finish(new Error('rcon_connection_failed')); return; }
    socket.addEventListener('error', () => finish(new Error(sent ? 'rcon_result_unknown' : 'rcon_connection_failed')));
    socket.addEventListener('close', () => finish(new Error(sent ? 'rcon_result_unknown' : 'rcon_connection_closed')));
    socket.addEventListener('open', () => {
      if (done) { socket.close(); return; }
      try { socket.send(JSON.stringify({ Identifier: id, Message: command, Name: 'RustPresenceBridgeProbe' })); sent = true; }
      catch { finish(new Error('rcon_result_unknown')); }
    });
    socket.addEventListener('message', event => {
      if (done || typeof event.data !== 'string') return;
      if (event.data.length > 32768) { finish(new Error('rcon_response_too_large')); return; }
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.Identifier !== id) return;
      if (typeof frame.Message !== 'string' || !frame.Message.trim()) return;
      try { finish(null, filterReply(JSON.parse(frame.Message))); }
      catch { finish(new Error('unexpected_bridge_reply')); }
    });
  });
}

async function accountTarget(options) {
  const data = resolve(process.env.STEAM_DATA_DIR || resolve(root, 'steam-multi-account/data'));
  const key = (await readFile(resolve(data, 'api-key.txt'), 'utf8')).trim();
  const localPort = Number(process.env.PORT ?? 3210);
  if (!/^[a-f0-9]{64}$/.test(key) || !Number.isInteger(localPort) || localPort < 1 || localPort > 65535) throw new Error('local_service_configuration_invalid');
  async function local(path) {
    const response = await fetch(`http://127.0.0.1:${localPort}${path}`, {
      headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) throw new Error('local_account_lookup_failed');
    return response.json();
  }
  const account = await local(`/v1/accounts/${encodeURIComponent(options.account)}`);
  if (!/^\d{17}$/.test(account.steamId ?? '')) throw new Error('account_has_no_steam_id');
  if (options.action === 'refresh') {
    const session = await local(`/v1/accounts/${encodeURIComponent(options.account)}/rust-session`);
    if (session.state !== 'entered_game' || session.metadata?.closed === true
      || session.host !== options.host || session.port !== options.port) throw new Error('account_not_entered_at_target');
  }
  return account.steamId;
}

export async function main(argv) {
  let network;
  try {
    const options = argumentsFrom(argv);
    const rconHost = process.env.RUST_RCON_HOST || options.host;
    const rconPort = Number(process.env.RUST_RCON_PORT);
    const password = process.env.RUST_RCON_PASSWORD;
    if (!/^[A-Za-z0-9.-]+$/.test(rconHost) || !Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65535
      || !password || password.length > 1024) throw new Error('set_rust_rcon_environment');
    const steamId = options.account ? await accountTarget(options) : options.steamId;
    network = createSteamNetwork();
    const query = new RustPublicQuery({ fetchImpl: network.fetchImpl });
    const target = { host: options.host, port: options.port, ...(options.queryPort ? { queryPort: options.queryPort } : {}) };
    const record = { startedAt: new Date().toISOString(), target, action: options.action,
      targetSource: options.account ? 'local_project_account' : steamId ? 'explicit_steam_id' : 'aggregate_only',
      before: await query.server(target), bridge: null, after: null, publicCountChangeVerified: false };
    const protocol = process.env.RUST_RCON_TLS === '1' ? 'wss' : 'ws';
    const command = `rustpresencebridge.${options.action}${steamId ? ` ${steamId}` : ''}`;
    try {
      record.bridge = await rconCommand(`${protocol}://${rconHost}:${rconPort}/${encodeURIComponent(password)}`, command);
    } catch (error) {
      record.bridge = { status: error.message, backendAccepted: null };
    }
    if (record.bridge.status === 'normal_refresh_invoked' && options.waitSeconds) {
      console.error(`Normal refresh returned; waiting ${options.waitSeconds}s for a later observation.`);
      await delay(options.waitSeconds * 1000);
    }
    record.after = await query.server(target);
    const before = record.before.facepunch, after = record.after.facepunch;
    record.comparison = { publicCountDelta: before.ok && after.ok ? after.players - before.players : null,
      publicBatchChanged: !!before.headers?.['last-modified'] && !!after.headers?.['last-modified']
        && before.headers['last-modified'] !== after.headers['last-modified'],
      note: 'Aggregate observations cannot prove an account was counted or that the refresh caused a change.' };
    record.completedAt = new Date().toISOString();
    const json = JSON.stringify(record, null, 2);
    if (options.output) { const output = resolve(options.output); await mkdir(dirname(output), { recursive: true }); await writeFile(output, json + '\n'); }
    console.log(json);
    return ['snapshot', 'normal_refresh_invoked'].includes(record.bridge.status) ? 0 : 1;
  } catch (error) {
    const known = new Set(['invalid_arguments', 'local_service_configuration_invalid', 'local_account_lookup_failed',
      'account_has_no_steam_id', 'account_not_entered_at_target', 'set_rust_rcon_environment']);
    console.error(JSON.stringify({ error: known.has(error.message) ? error.message : 'bridge_probe_failed',
      usage: 'node tools/rust-research/presence-bridge.mjs --host IPv4 --port GAME_PORT [--query-port PORT] [--account ID | --steam-id SteamID64] [--action snapshot|refresh] [--wait-seconds 0..60] [--out work/report.json]' }));
    return 2;
  } finally { await network?.close()?.catch(() => {}); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
