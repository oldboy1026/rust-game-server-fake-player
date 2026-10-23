/**
 * Read-only comparison of A2S counts and Facepunch's published trusted count.
 * Requires Node.js 22+ and the steam-multi-account project's dependencies.
 * No account, API key, Steam login, player connection or configuration change.
 *
 * From the repository root:
 * node ./tools/rust-research/observe-player-counts.mjs \
 *   --host 61.147.247.35 --game-port 28015 --query-port 28016 \
 *   --samples 20 --interval 30 --out ./work/player-count-observation.json
 *
 * --samples defaults to 1 (maximum 120); --interval is seconds, defaults to
 * 30 (minimum 10). SIGINT saves completed observations and closes networking.
 * The official URL is fixed: no cache-busting query parameters or credentials.
 * HTTP cache headers describe the response's age; a new request does not prove
 * the published count was refreshed. Missing counts are never converted to 0.
 */

import { isIP } from 'node:net';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { query } from '../../rust-research/query-server.mjs';

const TRUSTED_URL = 'https://api.facepunch.com/api/public/steamServers/playerCounts/rust';
const HEADER_NAMES = ['date', 'age', 'last-modified', 'cache-control', 'cf-cache-status'];
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const USAGE = 'node tools/rust-research/observe-player-counts.mjs --host IPv4 --game-port PORT --query-port PORT [--samples 1..120] [--interval SECONDS>=10] --out FILE.json';

function argumentsFrom(argv) {
  const allowed = new Set(['--host', '--game-port', '--query-port', '--samples', '--interval', '--out']);
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!allowed.has(flag) || options.has(flag) || value === undefined || value.startsWith('--')) throw new Error('invalid_arguments');
    options.set(flag, value);
  }
  const integer = (flag, fallback, minimum, maximum) => {
    const value = options.get(flag) ?? fallback;
    if (!/^\d+$/.test(value ?? '')) throw new Error('invalid_arguments');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error('invalid_arguments');
    return number;
  };
  const host = options.get('--host'), output = options.get('--out');
  if (isIP(host ?? '') !== 4 || !output?.trim() || output.includes('\0')) throw new Error('invalid_arguments');
  return {
    host,
    gamePort: integer('--game-port', undefined, 1, 65535),
    queryPort: integer('--query-port', undefined, 1, 65535),
    samples: integer('--samples', '1', 1, 120),
    intervalSeconds: integer('--interval', '30', 10, 2_147_483),
    output: resolve(output),
  };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function a2sObservation(options) {
  try {
    const result = await query(options.host, options.queryPort, 'info', { timeoutMs: 5000 });
    const players = count(result.players), bots = count(result.bots);
    const tags = typeof result.tags === 'string' ? result.tags.split(',') : [];
    const cpTags = tags.filter(tag => /^cp\d+$/.test(tag));
    const cp = cpTags.length === 1 ? count(Number(cpTags[0].slice(2))) : null;
    if (players === null || bots === null) return { observedAt: new Date().toISOString(), ok: false, error: 'invalid_response' };
    return { observedAt: new Date().toISOString(), ok: true, players, cp, bots };
  } catch (error) {
    // Classify only local parser/socket failures; never copy remote fields or
    // an exception message into stdout or the saved observations.
    const category = error?.message === 'A2S query timed out' ? 'timeout'
      : typeof error?.code === 'string' ? 'network_error' : 'invalid_response';
    return { observedAt: new Date().toISOString(), ok: false, error: category };
  }
}

function cacheHeaders(response) {
  return Object.fromEntries(HEADER_NAMES.map(name => {
    const value = response.headers.get(name);
    return [name, value === null ? null : value.replace(/[^\x20-\x7e]/g, '').slice(0, 512)];
  }));
}

async function boundedJson(response) {
  if (!response.body) throw new Error('invalid_json');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('response_too_large');
      parts.push(value);
    }
    try { return JSON.parse(Buffer.concat(parts, size).toString('utf8')); }
    catch { throw new Error('invalid_json'); }
  } finally {
    // cancel() is harmless after a completed body and releases a partial body
    // after an abort or size failure before the network dispatcher is closed.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function trustedObservation(network, options, stopSignal) {
  const timeoutSignal = AbortSignal.timeout(15_000);
  const signal = AbortSignal.any([stopSignal, timeoutSignal]);
  let metadata = {};
  try {
    const response = await network.fetchImpl(TRUSTED_URL, {
      signal,
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    metadata = { status: response.status, headers: cacheHeaders(response) };
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { observedAt: new Date().toISOString(), ok: false, error: 'http_error', ...metadata };
    }
    // The full map exists only transiently while parsing the public response.
    // Persist and emit only the requested server's numeric entry.
    const body = await boundedJson(response);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_response');
    const key = `${options.host}:${options.gamePort}`;
    if (!Object.hasOwn(body, key)) return { observedAt: new Date().toISOString(), ok: false, error: 'target_not_listed', ...metadata };
    const players = count(body[key]);
    if (players === null) throw new Error('invalid_response');
    return { observedAt: new Date().toISOString(), ok: true, players, ...metadata };
  } catch (error) {
    const known = new Set(['invalid_json', 'invalid_response', 'response_too_large']);
    const category = stopSignal.aborted ? 'aborted'
      : timeoutSignal.aborted ? 'timeout'
        : known.has(error?.message) ? error.message : 'network_error';
    return { observedAt: new Date().toISOString(), ok: false, error: category, ...metadata };
  }
}

async function save(output, record) {
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', 'utf8');
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function main() {
  let options;
  try { options = argumentsFrom(process.argv.slice(2)); }
  catch {
    console.error(JSON.stringify({ error: 'invalid_arguments', usage: USAGE }));
    process.exitCode = 2;
    return;
  }
  const stop = new AbortController();
  const onInterrupt = () => stop.abort();
  process.on('SIGINT', onInterrupt);
  const record = {
    version: 1,
    startedAt: new Date().toISOString(),
    target: { host: options.host, gamePort: options.gamePort, queryPort: options.queryPort },
    trustedSource: TRUSTED_URL,
    requestedSamples: options.samples,
    intervalSeconds: options.intervalSeconds,
    interrupted: false,
    samples: [],
  };
  let network, failure = null;
  try {
    await mkdir(dirname(options.output), { recursive: true });
    await save(options.output, record);
    try {
      const { createSteamNetwork } = await import('../../steam-multi-account/src/network.js');
      network = createSteamNetwork();
    }
    catch { throw new Error('network_setup_failed'); }
    for (let index = 0; index < options.samples && !stop.signal.aborted; index++) {
      const started = Date.now();
      const observedAt = new Date(started).toISOString();
      const [a2s, facepunch] = await Promise.all([
        a2sObservation(options),
        trustedObservation(network, options, stop.signal),
      ]);
      const sample = { sample: index + 1, observedAt, a2s, facepunch };
      record.samples.push(sample);
      record.interrupted = stop.signal.aborted;
      await save(options.output, record);
      console.log(JSON.stringify(sample));
      if (index + 1 < options.samples && !stop.signal.aborted) {
        const remaining = Math.max(0, options.intervalSeconds * 1000 - (Date.now() - started));
        try { await delay(remaining, undefined, { signal: stop.signal }); }
        catch (error) { if (!stop.signal.aborted) throw error; }
      }
    }
  } catch (error) {
    failure = error?.message === 'network_setup_failed' ? 'network_setup_failed' : 'observation_or_output_failed';
  } finally {
    record.interrupted = stop.signal.aborted;
    record.completedAt = new Date().toISOString();
    if (failure) record.error = failure;
    try { await network?.close(); }
    catch { failure ??= 'network_cleanup_failed'; record.error = failure; }
    try { await save(options.output, record); }
    catch { failure = 'output_write_failed'; }
    process.off('SIGINT', onInterrupt);
  }
  if (failure) console.error(JSON.stringify({ error: failure }));
  process.exitCode = failure ? 1 : stop.signal.aborted ? 130 : 0;
}

await main();
