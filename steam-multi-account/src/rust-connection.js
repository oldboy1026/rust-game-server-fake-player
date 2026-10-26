import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { ApiError } from './errors.js';

export const RUST_WORKER = fileURLToPath(new URL('../../tools/rust-research/rust-peer.py', import.meta.url));
export const RUST_DLL_SHA256 = '5bd99d127e7453bf04793681bf8e6e25db8abebe16f9f15583da34807ed1aa44';
// Exact inspected builds only; export names alone do not establish ABI compatibility.
export const RUST_DLL_PROFILES = Object.freeze({
  [RUST_DLL_SHA256]: 'rust-client-x64',
  a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21: 'rust-dedicated-x64',
});
const RUNTIME_ERRORS = Object.freeze({
  rust_runtime_unconfigured: '本机尚未配置 Rust 连接运行库。请配置已验证兼容的 RakNet.dll 和 64 位 Python；连接尚未发起。',
  rust_runtime_unsupported: '本机 Rust 运行库版本不受支持。请重新运行运行库配置脚本；连接尚未发起。',
});
export function rustRuntimeErrorMessage(error) {
  return error instanceof ApiError && Object.hasOwn(RUNTIME_ERRORS, error.code) ? RUNTIME_ERRORS[error.code] : null;
}
const STAGES = new Set([
  'native_wrapper_created', 'native_wrapper_closed', 'native_create_failed',
  'native_start_failed', 'native_connect_start_failed', 'transport_connect_started',
  'transport_connection_request_accepted', 'transport_connection_attempt_failed',
  'transport_already_connected', 'transport_new_incoming_connection',
  'transport_no_free_incoming_connections', 'transport_disconnection_notification',
  'transport_connection_lost', 'transport_connection_banned', 'transport_invalid_password',
  'transport_incompatible_protocol_version', 'receive_deadline_reached',
  'invalid_receive_length', 'null_receive_data', 'identity_requested', 'identity_sent',
  'approved', 'ready_sent', 'world_received', 'eac_required', 'disconnect_reason_received',
  'input_validated', 'approval_received_ready_not_requested',
  'protected_or_unsupported_encryption_required', 'approval_schema_invalid',
  'unexpected_approval', 'repeated_identity_request', 'identity_native_send_failed',
  'ready_native_send_failed', 'server_queue_update_received', 'invalid_server_guid',
  'local_setup_or_native_call_failed', 'input_rejected', 'transport_connection_rate_limited',
  'self_entity_observed', 'finish_loading_observed', 'stop_requested', 'control_eof',
  'control_input_closed', 'invalid_control_command', 'interrupted',
  'respawn_sent', 'respawn_native_send_failed', 'respawn_alive_observed',
  'wake_neutral_sent', 'wake_press_sent', 'wake_release_sent', 'wake_awake_observed',
  'wake_unconfirmed', 'wake_interrupted', 'tick_native_send_failed', 'wake_release_unavailable',
  'connection_keepalive_started', 'connection_keepalive_send_failed', 'connection_keepalive_stalled',
]);
const CATEGORIES = new Set(['steam_auth', 'eac_required', 'eos_identity_required',
  'protocol_mismatch', 'server_full', 'banned', 'other', 'unknown', 'player_timeout', 'steam_ticket_reused']);
export function safeMetadata(result) {
  const clean = { abi: 'windows-x64' };
  if (typeof result.dllSha256 === 'string' && Object.hasOwn(RUST_DLL_PROFILES, result.dllSha256)) {
    clean.dllSha256 = result.dllSha256;
  }
  for (const key of ['created', 'closed', 'transportConnected', 'identitySent', 'approved',
    'readySent', 'playerConnected', 'eacVerified', 'selfEntityObserved', 'finishLoadingObserved',
    'respawnOnDeadEnabled', 'respawnAttempted', 'respawnSent', 'respawnAliveObserved',
    'tickWakeEnabled', 'wakeAttempted', 'wakePressSent', 'wakeReleaseSent', 'wakeAwakeObserved']) {
    if (typeof result[key] === 'boolean') clean[key] = result[key];
  }
  if (Number.isSafeInteger(result.tickPacketsSent) && result.tickPacketsSent >= 0 && result.tickPacketsSent <= 3) {
    clean.tickPacketsSent = result.tickPacketsSent;
  }
  if (Number.isSafeInteger(result.connectionKeepAliveSent) && result.connectionKeepAliveSent >= 0 && result.connectionKeepAliveSent <= 1e12) {
    clean.connectionKeepAliveSent = result.connectionKeepAliveSent;
  }
  if (Number.isSafeInteger(result.chatMessagesSent) && result.chatMessagesSent >= 0 && result.chatMessagesSent <= 1e12) {
    clean.chatMessagesSent = result.chatMessagesSent;
  }
  if (result.lastChat && Number.isSafeInteger(result.lastChat.id) && result.lastChat.id >= 1
      && result.lastChat.id <= 2147483647
      && ['sent', 'not_ready', 'rate_limited', 'send_failed'].includes(result.lastChat.status)) {
    clean.lastChat = { id: result.lastChat.id, status: result.lastChat.status };
  }
  if (['state_changed', 'unsupported_snapshot', 'entity_changed', 'self_rpc', 'position_update',
    'base_flags', 'destroyed', 'stale_snapshot', 'scheduler_stalled', 'shutdown'].includes(result.wakeInterruptionReason)) {
    clean.wakeInterruptionReason = result.wakeInterruptionReason;
  }
  if (result.wakeInterruptionReason === 'self_rpc' && Number.isSafeInteger(result.wakeInterruptionRpc)
      && result.wakeInterruptionRpc >= 0 && result.wakeInterruptionRpc < 2 ** 32) {
    clean.wakeInterruptionRpc = result.wakeInterruptionRpc;
  }
  if (['disabled', 'waiting_state', 'waiting_finish_loading', 'unsupported_state',
    'unsequenced_state', 'stale_state', 'sending', 'awaiting_confirmation', 'already_awake',
    'awake_observed', 'unconfirmed', 'interrupted', 'send_failed'].includes(result.wakeState)) {
    clean.wakeState = result.wakeState;
  }
  if (result.respawnSent === true && result.respawnAliveObserved === true
      && typeof result.respawnAliveAfterSeconds === 'number'
      && Number.isFinite(result.respawnAliveAfterSeconds)
      && result.respawnAliveAfterSeconds >= 0 && result.respawnAliveAfterSeconds <= 1e12) {
    clean.respawnAliveAfterSeconds = result.respawnAliveAfterSeconds;
  }
  for (const key of ['receivedPackets', 'sentPackets', 'startClientResult', 'elapsedSeconds', 'worldMessages', 'encryptionLevel', 'entityParseFailures']) {
    if (typeof result[key] === 'number' && Number.isFinite(result[key]) && result[key] >= 0 && result[key] <= 1e12) clean[key] = result[key];
  }
  if (Array.isArray(result.stages)) clean.stages = result.stages.filter(stage => STAGES.has(stage)).slice(0, 64);
  if (CATEGORIES.has(result.disconnectCategory)) clean.disconnectCategory = result.disconnectCategory;
  const ownState = result.ownPlayerState;
  if (ownState && typeof ownState === 'object' && !Array.isArray(ownState)) {
    if (ownState.observed === false && ownState.snapshots === 0) {
      clean.ownPlayerState = { observed: false, snapshots: 0 };
    } else if (ownState.observed === true
        && typeof ownState.sleeping === 'boolean' && typeof ownState.receivingSnapshot === 'boolean'
        && Number.isSafeInteger(ownState.snapshots) && ownState.snapshots > 0 && ownState.snapshots <= 1e12
        && typeof ownState.ageSeconds === 'number' && Number.isFinite(ownState.ageSeconds)
        && ownState.ageSeconds >= 0 && ownState.ageSeconds <= 1e12) {
      // Age is measured at this worker sample, alongside elapsedSeconds.
      // Only these booleans/counters survive; no IDs, flags or coordinates.
      clean.ownPlayerState = { observed: true, sleeping: ownState.sleeping,
        receivingSnapshot: ownState.receivingSnapshot, snapshots: ownState.snapshots,
        ageSeconds: ownState.ageSeconds };
      for (const key of ['spectating', 'wounded', 'connectedFlag', 'loadingAfterTransfer',
        'flagsFieldPresent', 'combatComponentObserved', 'combatStateFieldPresent']) {
        if (typeof ownState[key] === 'boolean') clean.ownPlayerState[key] = ownState[key];
      }
      if (['alive', 'dead', 'unknown'].includes(ownState.lifeState)) clean.ownPlayerState.lifeState = ownState.lifeState;
      if (ownState.healthPositive === null || typeof ownState.healthPositive === 'boolean') clean.ownPlayerState.healthPositive = ownState.healthPositive;
      for (const key of ['entityChanges', 'stateChanges']) {
        if (Number.isSafeInteger(ownState[key]) && ownState[key] >= 0 && ownState[key] <= 1e12) clean.ownPlayerState[key] = ownState[key];
      }
    }
  }
  for (const [name, pattern] of [['firstByteCounts', /^0x[0-9a-f]{2}$/], ['bitLengthCounts', /^\d{1,10}$/]]) {
    const values = result[name];
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      clean[name] = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
        pattern.test(key) && Number.isSafeInteger(value) && value >= 0 && value <= 1e9).slice(0, 256));
    }
  }
  return clean;
}

// The HTTP layer accepts a destination, never arbitrary executables or DLLs.
// Native runtime paths are configured by the local service operator.
export function validateRustDestination(input, optionalKeys = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['host', 'port', ...optionalKeys].includes(key))
      || typeof input.host !== 'string' || isIP(input.host) !== 4
      || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new ApiError(400, '需要有效的 IPv4 host 和游戏端口 port。');
  }
  return { host: input.host, port: input.port };
}

export function readRustRuntime(env = process.env) {
  let saved = {};
  if (!env.RUST_NATIVE_DLL || !env.RUST_PYTHON) {
    try {
      const directory = env.STEAM_DATA_DIR
        ? resolve(env.STEAM_DATA_DIR)
        : fileURLToPath(new URL('../data/', import.meta.url));
      saved = JSON.parse(readFileSync(join(directory, 'rust-runtime.json'), 'utf8').replace(/^\uFEFF/, ''));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    } catch { saved = {}; }
  }
  const dll = env.RUST_NATIVE_DLL || saved.dll;
  const python = env.RUST_PYTHON || saved.python;
  if (typeof dll !== 'string' || typeof python !== 'string' || !isAbsolute(dll) || !isAbsolute(python)) {
    throw Object.assign(new ApiError(503, RUNTIME_ERRORS.rust_runtime_unconfigured), { code: 'rust_runtime_unconfigured' });
  }
  // An environment DLL override must not inherit a different saved DLL's hash.
  const sha256 = env.RUST_NATIVE_SHA256 || (env.RUST_NATIVE_DLL ? RUST_DLL_SHA256 : saved.sha256 || RUST_DLL_SHA256);
  if (typeof sha256 !== 'string' || !Object.hasOwn(RUST_DLL_PROFILES, sha256)) {
    throw Object.assign(new ApiError(503, RUNTIME_ERRORS.rust_runtime_unsupported), { code: 'rust_runtime_unsupported' });
  }
  return { dll, python, worker: RUST_WORKER, sha256 };
}

export async function connectRust(auth, input, username, env = process.env) {
  validateRustDestination(input, ['seconds']);
  const seconds = input.seconds ?? 45;
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) {
    throw new ApiError(400, 'seconds 必须为 5 到 120 的整数。');
  }
  const { dll, python, sha256 } = readRustRuntime(env);
  let metadata;
  await auth.withSessionTicket(async ({ sessionTicket, steamId, signal }) => {
    if (signal.aborted) throw new ApiError(409, '账号会话已结束。');
    metadata = await new Promise((resolve, reject) => {
      const child = spawn(python, [RUST_WORKER, '--dll', dll, '--sha256', sha256,
        '--host', input.host, '--port', String(input.port), '--seconds', String(seconds)], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
      });
      let output = '';
      let failed = false;
      let settled = false;
      const stop = () => { failed = true; child.stdin.destroy(); child.kill(); };
      const timer = setTimeout(stop, (seconds + 15) * 1000);
      signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', chunk => {
        if (output.length + chunk.length > 65536) stop();
        else output += chunk.toString('utf8');
      });
      // Native errors or accidental diagnostics must not become API content.
      child.stderr.resume();
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
      };
      child.on('error', () => {
        failed = true;
        // Runtime errors (for example a failed kill) must not cancel an auth
        // ticket while its existing worker might still be using it.
        if (child.pid) return;
        if (settled) return;
        settled = true;
        cleanup();
        reject(new ApiError(502, '独立 Rust 网络进程启动失败。'));
      });
      child.stdin.on('error', () => { failed = true; });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        cleanup();
        if (failed || code !== 0) return reject(new ApiError(502, '独立 Rust 连接尝试已结束，未取得有效结果。'));
        try {
          const result = JSON.parse(output);
          if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
          resolve(safeMetadata(result));
        } catch {
          reject(new ApiError(502, '独立 Rust 网络进程没有返回有效的阶段结果。'));
        }
      });
      // Auth material travels only through an anonymous local pipe. Neither
      // the process command line nor the service API contains a ticket.
      child.stdin.end(JSON.stringify({ steamId, username: String(username || 'Player').slice(0, 128),
        sessionTicketBase64: sessionTicket.toString('base64') }));
    });
  });
  return metadata;
}
