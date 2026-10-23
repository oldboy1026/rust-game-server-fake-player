import dgram from 'node:dgram';
import { closeSync, mkdirSync, mkdtempSync, openSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const LOOPBACK = '127.0.0.1';
const FRONT_PORT = 20093;
const SERVER_PORT = 20090;
const METADATA_LIMIT = 16 * 1024 * 1024;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function durationFromArgs(args) {
  if (!args.length) return 120;
  if (args.length !== 2 || args[0] !== '--seconds' || !/^\d+$/.test(args[1])) {
    throw new Error('arguments');
  }
  const seconds = Number(args[1]);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error('arguments');
  return seconds;
}

function bind(socket, port) {
  return new Promise((accept, reject) => {
    const onError = error => reject(error);
    socket.once('error', onError);
    socket.bind({ address: LOOPBACK, port, exclusive: true }, () => {
      socket.off('error', onError);
      accept();
    });
  });
}

function connect(socket) {
  return new Promise((accept, reject) => {
    const onError = error => reject(error);
    socket.once('error', onError);
    socket.connect(SERVER_PORT, LOOPBACK, () => {
      socket.off('error', onError);
      accept();
    });
  });
}

function close(socket) {
  return new Promise(accept => {
    try {
      socket.close(() => accept(true));
    } catch (error) {
      if (error?.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') {
        accept(true);
      } else {
        // Forwarding has already stopped. Do not let an unexpected close
        // failure keep the process alive or report successful cleanup.
        try { socket.unref(); } catch {}
        accept(false);
      }
    }
  });
}

async function run(seconds) {
  const workRoot = join(repoRoot, 'work');
  mkdirSync(workRoot, { recursive: true });
  const outputDirectory = mkdtempSync(join(workRoot, 'local-game-relay-'));
  const metadataPath = join(outputDirectory, 'metadata.jsonl');
  const metadataFd = openSync(metadataPath, 'wx', 0o600);
  const front = dgram.createSocket('udp4');
  const upstream = dgram.createSocket('udp4');
  const start = performance.now();
  const deadline = start + seconds * 1000;
  const startedAt = new Date().toISOString();
  const totals = {
    client_to_server: { packets: 0, bytes: 0, forwardedPackets: 0, forwardedBytes: 0 },
    server_to_client: { packets: 0, bytes: 0, forwardedPackets: 0, forwardedBytes: 0 },
  };
  const rejected = { nonLoopback: 0, otherClient: 0, invalidPeer: 0, beforeReady: 0 };
  let metadataBytes = 0;
  let clientPort;
  let upstreamPort;
  let ready = false;
  let stopping = false;
  let stopPromise;
  let finish;
  const completed = new Promise(accept => { finish = accept; });

  const stop = reason => {
    if (stopping) return stopPromise;
    stopping = true;
    ready = false;
    clearTimeout(timer);
    stopPromise = (async () => {
      const socketCloseResults = await Promise.all([close(front), close(upstream)]);
      const summary = {
        type: 'summary', startedAt, stoppedAt: new Date().toISOString(),
        elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(3)),
        requestedSeconds: seconds, stopReason: reason,
        frontend: `${LOOPBACK}:${FRONT_PORT}`, server: `${LOOPBACK}:${SERVER_PORT}`,
        separateEphemeralUpstream: true, clientObserved: clientPort !== undefined,
        totals, rejected, metadataBytes, metadataLimitBytes: METADATA_LIMIT,
        outputDirectory, socketsClosed: socketCloseResults.every(Boolean), metadataClosed: false, summaryWritten: false,
      };
      try { closeSync(metadataFd); summary.metadataClosed = true; } catch {}
      try {
        summary.summaryWritten = true;
        writeFileSync(join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
      } catch { summary.summaryWritten = false; }
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
      if (!['timeout', 'sigint', 'sigterm'].includes(reason) || !summary.socketsClosed || !summary.metadataClosed || !summary.summaryWritten) {
        process.exitCode = 1;
      }
      process.stdout.write(JSON.stringify(summary) + '\n');
      finish();
    })();
    return stopPromise;
  };

  const onInterrupt = () => { void stop('sigint'); };
  const onTerminate = () => { void stop('sigterm'); };
  const timer = setTimeout(() => { void stop('timeout'); }, seconds * 1000);
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  front.on('error', () => { void stop('frontend_error'); });
  upstream.on('error', () => { void stop('upstream_error'); });

  // Each accepted datagram is logged before forwarding. Synchronous, bounded
  // writes avoid an unbounded queue and stop forwarding immediately on failure.
  const forward = (direction, message, socket, port) => {
    if (stopping) return;
    if (performance.now() >= deadline) { void stop('timeout'); return; }
    const row = Buffer.from(JSON.stringify({
      direction, at: new Date().toISOString(),
      elapsedMs: Number((performance.now() - start).toFixed(3)),
      length: message.length, firstByte: message.length ? message[0] : null,
    }) + '\n');
    if (metadataBytes + row.length > METADATA_LIMIT) { void stop('metadata_limit'); return; }
    try {
      let offset = 0;
      while (offset < row.length) {
        const written = writeSync(metadataFd, row, offset, row.length - offset);
        if (!written) throw new Error('metadata');
        offset += written;
        metadataBytes += written;
      }
    } catch { void stop('metadata_write_error'); return; }
    const counter = totals[direction];
    counter.packets++;
    counter.bytes += message.length;
    const onSend = error => {
      if (error) { void stop('send_error'); return; }
      counter.forwardedPackets++;
      counter.forwardedBytes += message.length;
    };
    // No protocol parsing, packet synthesis, header edits, or payload logging.
    // Synchronous metadata writes can cross the deadline before the timer runs.
    if (performance.now() >= deadline) { void stop('timeout'); return; }
    try {
      if (port === undefined) socket.send(message, onSend);
      else socket.send(message, port, LOOPBACK, onSend);
    } catch { void stop('send_error'); }
  };

  front.on('message', (message, source) => {
    if (stopping) return;
    if (!ready) { rejected.beforeReady++; return; }
    if (source.address !== LOOPBACK) { rejected.nonLoopback++; return; }
    if ([FRONT_PORT, SERVER_PORT, upstreamPort].includes(source.port)) { rejected.invalidPeer++; return; }
    if (clientPort === undefined) clientPort = source.port;
    if (source.port !== clientPort) { rejected.otherClient++; return; }
    forward('client_to_server', message, upstream);
  });
  upstream.on('message', (message, source) => {
    if (stopping) return;
    if (!ready) { rejected.beforeReady++; return; }
    if (source.address !== LOOPBACK || source.port !== SERVER_PORT || clientPort === undefined) {
      rejected.invalidPeer++;
      return;
    }
    forward('server_to_client', message, front, clientPort);
  });

  try {
    await bind(front, FRONT_PORT);
    if (!stopping) await bind(upstream, 0);
    if (!stopping) { upstreamPort = upstream.address().port; await connect(upstream); }
    if (!stopping) {
      ready = true;
      process.stdout.write(JSON.stringify({
        type: 'ready', frontend: `${LOOPBACK}:${FRONT_PORT}`, server: `${LOOPBACK}:${SERVER_PORT}`,
        seconds, metadataLimitBytes: METADATA_LIMIT, outputDirectory,
      }) + '\n');
    }
  } catch { await stop('startup_error'); }
  await completed;
}

try {
  await run(durationFromArgs(process.argv.slice(2)));
} catch {
  process.exitCode = 1;
  process.stdout.write(JSON.stringify({ type: 'summary', stopReason: 'initialization_or_arguments_error', forwardingStarted: false }) + '\n');
  process.stderr.write('Use: node tools/rust-research/observe-local-game-relay.mjs [--seconds 10..600]\n');
}
