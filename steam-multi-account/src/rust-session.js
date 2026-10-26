import { spawn } from 'node:child_process';
import { ApiError } from './errors.js';
import { validateRustAction } from './rust-actions.js';
import { readRustRuntime, rustRuntimeErrorMessage, safeMetadata, validateRustDestination } from './rust-connection.js';

const MAX_LINE_BYTES = 65536;
const STOP_GRACE_MS = 5000;
const CHAT_TIMEOUT_MS = 10000;

export function validateChat(input) {
  const text = input?.text;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1
      || typeof text !== 'string' || !text.trim() || !text.isWellFormed() || [...text].length > 128
      || Buffer.byteLength(text, 'utf8') > 512 || /[\u0000-\u001f\u007f-\u009f"\\;\u2028\u2029]/u.test(text)) {
    throw new ApiError(400, '聊天需为 1–128 字的单行文本，不支持引号、反斜杠、分号或控制字符。');
  }
  return text;
}
const REJECTION_MESSAGES = {
  steam_auth: '服务器未接受该账号的 Steam 认证。',
  steam_ticket_reused: '服务器报告 Steam 票据已被使用，请等待原会话清理后再连接。',
  player_timeout: '服务器因玩家响应超时（Unresponsive）断开连接。',
  eac_required: '服务器要求当前独立连接尚未建立的 EAC 会话，已停止连接。',
  eos_identity_required: '服务器要求当前独立连接尚未取得的 EOS 身份，已停止连接。',
  protocol_mismatch: '服务器未接受当前连接使用的协议或版本。',
  server_full: '服务器已满，连接已结束。',
  banned: '服务器拒绝该账号连接。',
  other: '服务器拒绝了本次连接。',
  unknown: '服务器拒绝了本次连接。',
};
const STAGE_ERRORS = [
  ['eac_required', REJECTION_MESSAGES.eac_required],
  ['protected_or_unsupported_encryption_required', '服务器要求当前独立连接尚不支持的受保护会话，已停止连接。'],
  ['native_create_failed', '无法创建独立 Rust 网络实例。'],
  ['native_start_failed', '独立 Rust 网络实例启动失败。'],
  ['native_connect_start_failed', '独立 Rust 网络实例未能开始连接。'],
  ['local_setup_or_native_call_failed', '独立 Rust 网络运行环境或原生调用失败。'],
  ['input_rejected', '独立 Rust 网络进程未接受本次身份输入。'],
  ['invalid_control_command', '独立 Rust 网络进程未接受本次停止指令。'],
  ['control_eof', '独立 Rust 网络进程的控制管道意外关闭。'],
  ['approval_schema_invalid', '服务器返回的批准数据无法按当前协议解析。'],
  ['unexpected_approval', '服务器返回了非预期的批准顺序。'],
  ['invalid_receive_length', '服务器返回了当前独立连接无法处理的数据长度。'],
  ['null_receive_data', '独立 Rust 网络实例未能读取接收数据。'],
  ['repeated_identity_request', '服务器重复请求身份，本次连接已停止。'],
  ['invalid_server_guid', '独立 Rust 网络实例未能取得有效的服务器标识。'],
  ['identity_native_send_failed', '独立 Rust 网络实例发送身份失败。'],
  ['ready_native_send_failed', '独立 Rust 网络实例发送就绪消息失败。'],
  ['tick_native_send_failed', '唤醒输入发送失败，连接已关闭。'],
  ['wake_release_unavailable', '角色状态已改变，无法安全释放唤醒输入，连接已关闭。'],
  ['connection_keepalive_send_failed', '连接维护消息发送失败，连接已关闭。'],
  ['connection_keepalive_stalled', '本机连接维护停顿过长，已关闭连接，请重新连接。'],
  ['action_release_unavailable', '角色状态已改变或操作已停止，无法安全释放动作，已关闭该账号连接。'],
  ['action_native_send_failed', '角色操作发送失败，已关闭该账号连接。'],
  ['transport_connection_attempt_failed', '无法与该服务器建立网络连接。'],
  ['transport_no_free_incoming_connections', '服务器当前没有可用连接位置。'],
  ['transport_connection_banned', '服务器拒绝了本次网络连接。'],
  ['transport_invalid_password', '服务器未接受本次网络连接密码。'],
  ['transport_incompatible_protocol_version', '服务器网络传输协议不兼容。'],
  ['transport_connection_rate_limited', '服务器限制了同一IP的连接数量或连接频率。'],
];

// Only public, filtered worker metadata survives a run. The account keeps this
// manager across Steam reconnects so a retiring worker cannot overlap its next.
export class RustSession {
  #spawnWorker;
  #run = null;
  #activityListener = null;
  #status = {
    state: 'closed', host: null, port: null, startedAt: null, endedAt: null,
    metadata: safeMetadata({}), lastError: null,
  };

  constructor({ spawnWorker = spawn } = {}) { this.#spawnWorker = spawnWorker; }

  snapshot() {
    return { ...this.#status, metadata: safeMetadata(this.#status.metadata) };
  }

  isActive() { return this.#run !== null; }

  steamGameActivity() {
    if (!this.#run) return null;
    const activity = { game_id: 252490 };
    if (this.#status.metadata.transportConnected === true) {
      activity.game_ip_address = { v4: this.#status.host.split('.').reduce((value, part) => value * 256 + Number(part), 0) };
      activity.game_port = this.#status.port;
    }
    return activity;
  }

  setActivityListener(listener) { this.#activityListener = listener; }

  #notifyActivity() {
    // Presence reporting must never prevent ticket or transport cleanup.
    try { this.#activityListener?.(); } catch {}
  }

  start(auth, input, username, env = process.env) {
    const destination = validateRustDestination(input, ['respawnOnDead', 'wakeOnConnect']);
    if (Object.hasOwn(input, 'respawnOnDead') && typeof input.respawnOnDead !== 'boolean') {
      throw new ApiError(400, 'respawnOnDead 必须为布尔值。');
    }
    const respawnOnDead = Object.hasOwn(input, 'respawnOnDead') && input.respawnOnDead === true;
    if (Object.hasOwn(input, 'wakeOnConnect') && typeof input.wakeOnConnect !== 'boolean') {
      throw new ApiError(400, 'wakeOnConnect 必须为布尔值。');
    }
    const wakeOnConnect = input.wakeOnConnect === true;
    if (this.#run) throw new ApiError(409, '该账号的 Rust 会话或清理仍在进行，请先停止并等待结束。');
    let runtime;
    try { runtime = readRustRuntime(env); }
    catch (error) {
      const message = rustRuntimeErrorMessage(error);
      if (message) {
        const at = new Date().toISOString();
        this.#status = { state: 'error', ...destination, startedAt: at, endedAt: at,
          metadata: safeMetadata({ closed: true, playerConnected: false, eacVerified: false }),
          lastError: { code: error.code, message } };
        this.#notifyActivity();
      }
      throw error;
    }
    const run = { child: null, workerStarted: false, reachedEnteredGame: false, respawnOnDead, wakeOnConnect,
      stopRequested: false, stopSent: false, killTimer: null, failure: null,
      chatSequence: 0, chatRequest: null, nextChatAt: 0, actionSequence: 0, actionRequest: null, nextActionAt: 0 };
    this.#run = run;
    this.#status = {
      state: 'connecting', ...destination, startedAt: new Date().toISOString(), endedAt: null,
      metadata: safeMetadata({ dllSha256: runtime.sha256, closed: false, playerConnected: false, eacVerified: false,
        selfEntityObserved: false, finishLoadingObserved: false, respawnOnDeadEnabled: respawnOnDead,
        respawnAttempted: false, respawnSent: false, respawnAliveObserved: false,
        tickWakeEnabled: wakeOnConnect, tickPacketsSent: 0, wakeAttempted: false,
        wakePressSent: false, wakeReleaseSent: false, wakeAwakeObserved: false,
        wakeState: wakeOnConnect ? 'waiting_state' : 'disabled' }), lastError: null,
    };
    this.#notifyActivity();
    // The HTTP request returns immediately. This task owns the ticket through
    // worker close and the authentication lease's cancellation/zeroing step.
    void this.#execute(run, auth, runtime, destination, username);
    return this.snapshot();
  }

  stop() {
    if (this.#run) this.#requestStop(this.#run);
    return this.snapshot();
  }

  sendChat(input) {
    const text = validateChat(input), run = this.#run, child = run?.child;
    if (!run || run.stopRequested || this.#status.state !== 'entered_game'
        || this.#status.metadata.closed === true || !child?.stdin.writable || child.stdin.destroyed) {
      throw new ApiError(409, '该账号尚未完成入服，或连接已经结束。');
    }
    if (run.chatRequest) throw new ApiError(409, '上一条聊天仍在等待发送结果。');
    if (Date.now() < run.nextChatAt) throw new ApiError(429, '请间隔至少 5 秒再发送聊天。');
    if (run.chatSequence >= 2147483647) throw new ApiError(409, '本次连接的聊天请求已达到上限。');
    const id = ++run.chatSequence;
    run.nextChatAt = Date.now() + 5000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (run.chatRequest?.id === id) this.#finishChat(run,
          new ApiError(504, '等待聊天发送结果超时，结果未知，请先核对游戏内消息，勿重复发送。'));
      }, CHAT_TIMEOUT_MS);
      timer.unref();
      run.chatRequest = { id, resolve, reject, timer };
      try {
        child.stdin.write(`${JSON.stringify({ chat: { id, text } })}\n`, error => {
          if (error && run.chatRequest?.id === id) this.#finishChat(run, new ApiError(502, '聊天输入通道已关闭，发送结果未确认。'));
        });
      } catch { this.#finishChat(run, new ApiError(502, '聊天输入通道已关闭，发送结果未确认。')); }
    });
  }

  #finishChat(run, error, reply) {
    const request = run.chatRequest;
    if (!request) return;
    run.chatRequest = null;
    clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(reply);
  }

  sendAction(input) {
    const action = validateRustAction(input), run = this.#run, child = run?.child;
    if (!run || run.stopRequested || this.#status.state !== 'entered_game'
        || this.#status.metadata.closed === true || !child?.stdin.writable || child.stdin.destroyed) {
      throw new ApiError(409, '该账号尚未完成入服，或连接已经结束。');
    }
    if (run.actionRequest) throw new ApiError(409, '上一条操作仍在等待结果。');
    if (action.action !== 'stop' && Date.now() < run.nextActionAt) throw new ApiError(429, '请间隔至少 5 秒再操作。');
    if (run.actionSequence >= 2147483647) throw new ApiError(409, '本次连接的操作请求已达到上限。');
    const id = ++run.actionSequence;
    if (action.action !== 'stop') run.nextActionAt = Date.now() + 5000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#finishAction(run,
        new ApiError(504, '等待操作结果超时，结果未知，请先核对状态，勿重复操作。')), CHAT_TIMEOUT_MS);
      timer.unref();
      run.actionRequest = { id, resolve, reject, timer };
      try {
        child.stdin.write(`${JSON.stringify({ action: { id, ...action } })}\n`, error => {
          if (error && run.actionRequest?.id === id) this.#finishAction(run, new ApiError(502, '角色操作通道已关闭。'));
        });
      } catch { this.#finishAction(run, new ApiError(502, '角色操作通道已关闭。')); }
    });
  }

  #finishAction(run, error, reply) {
    const request = run.actionRequest;
    if (!request) return;
    run.actionRequest = null;
    clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(reply);
  }

  #requestStop(run) {
    this.#finishAction(run, new ApiError(409, '连接正在结束，角色操作结果未确认。'));
    this.#finishChat(run, new ApiError(409, '连接正在结束，聊天发送结果未确认。'));
    run.stopRequested = true;
    this.#status.state = 'stopping';
    const child = run.child;
    if (!child || run.stopSent) return;
    run.stopSent = true;
    // Leave stdin open while the worker shuts down and closes RakNet itself.
    if (child.stdin.writable && !child.stdin.destroyed) {
      try { child.stdin.write('{"stop":true}\n', () => {}); } catch {}
    }
    run.killTimer = setTimeout(() => {
      if (run.child === child) {
        try { child.kill(); } catch {}
      }
    }, STOP_GRACE_MS);
    run.killTimer.unref();
  }

  #fail(run, message) {
    run.failure ||= message;
    this.#requestStop(run);
  }

  #update(run, result) {
    const metadata = safeMetadata(result);
    const wasConnected = this.#status.metadata.transportConnected === true;
    this.#status.metadata = metadata;
    if (run.actionRequest?.id === metadata.lastAction?.id && run.actionRequest) {
      this.#finishAction(run, null, { ...metadata.lastAction, serverConfirmed: false });
    }
    if (run.chatRequest && run.chatRequest.id === metadata.lastChat?.id) {
      const status = metadata.lastChat.status;
      if (status === 'sent') this.#finishChat(run, null, { status: 'sent_to_transport',
        requestId: metadata.lastChat.id, serverConfirmed: false });
      else this.#finishChat(run, new ApiError(status === 'rate_limited' ? 429 : status === 'not_ready' ? 409 : 502,
        status === 'rate_limited' ? '请间隔至少 5 秒再发送聊天。' : status === 'not_ready' ? '游戏连接尚未就绪，聊天未发送。' : '游戏连接未能发出聊天消息。'));
    }
    if (!wasConnected && metadata.transportConnected === true) this.#notifyActivity();
    if (metadata.selfEntityObserved === true && metadata.finishLoadingObserved === true) {
      run.reachedEnteredGame = true;
    }
    if (run.stopRequested) return;
    if (metadata.selfEntityObserved === true && metadata.finishLoadingObserved === true) {
      this.#status.state = 'entered_game';
    } else if (metadata.selfEntityObserved === true) {
      this.#status.state = 'player_initialized';
    } else if (metadata.worldMessages > 0) {
      this.#status.state = 'receiving_world';
    }
  }

  #terminal(run) {
    const { metadata } = this.#status;
    if (!run.workerStarted) return { state: 'closed', lastError: null };
    const rejection = REJECTION_MESSAGES[metadata.disconnectCategory];
    if (rejection) return { state: 'error', lastError: run.reachedEnteredGame
      && ['other', 'unknown'].includes(metadata.disconnectCategory)
      ? '服务器已断开连接，当前未识别具体原因。' : rejection };
    for (const [stage, message] of STAGE_ERRORS) {
      if (metadata.stages?.includes(stage)) return { state: 'error', lastError: message };
    }
    if (run.stopRequested) return { state: 'closed', lastError: null };
    const remoteClosed = metadata.stages?.some(stage =>
      ['transport_disconnection_notification', 'transport_connection_lost'].includes(stage));
    if (run.reachedEnteredGame) return {
      state: 'closed', lastError: remoteClosed ? '服务器连接已断开。' : '独立 Rust 会话已结束。',
    };
    return { state: 'error', lastError: remoteClosed
      ? '服务器在确认进入世界前断开了连接。' : 'Rust 会话在确认进入世界前结束。' };
  }

  async #execute(run, auth, runtime, destination, username) {
    try {
      await auth.withSessionTicket(async ({ sessionTicket, steamId, signal }) => {
        // A stop received during Steam issuance still waits for the late ticket
        // to be canceled, but never starts a native process with that ticket.
        if (run.stopRequested || signal.aborted) return;
        await this.#worker(run, runtime, destination, username, sessionTicket, steamId, signal);
      });
      if (run.failure) throw new Error();
      Object.assign(this.#status, this.#terminal(run));
    } catch (error) {
      // Steam disconnect invalidates its generation after requesting a stop.
      // Cancellation failures remain errors, even after a requested shutdown.
      if (run.stopRequested && !run.failure && error instanceof ApiError && error.status === 409) {
        this.#status.state = 'closed';
      } else {
        this.#status.state = 'error';
        this.#status.lastError = run.failure || 'Rust 会话认证或清理失败，请检查账号连接后重试。';
      }
    } finally {
      this.#finishAction(run, new ApiError(409, '游戏连接已结束，角色操作结果未确认。'));
      this.#finishChat(run, new ApiError(409, '游戏连接已结束，聊天发送结果未确认。'));
      clearTimeout(run.killTimer);
      this.#status.endedAt = new Date().toISOString();
      if (this.#run === run) this.#run = null;
      this.#notifyActivity();
    }
  }

  #worker(run, runtime, destination, username, sessionTicket, steamId, signal) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this.#spawnWorker(runtime.python, [runtime.worker, '--dll', runtime.dll,
          '--sha256', runtime.sha256, '--host', destination.host,
          '--port', String(destination.port), '--persistent', '--stream',
          ...(run.respawnOnDead ? ['--respawn-on-dead'] : []),
          ...(run.wakeOnConnect ? ['--wake-on-connect'] : [])], {
          windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
        });
      } catch {
        run.failure = '独立 Rust 网络进程启动失败。';
        reject(new Error());
        return;
      }
      run.child = child;
      run.workerStarted = true;
      let pending = Buffer.alloc(0);
      let finalReceived = false;
      const abort = () => this.#requestStop(run);
      signal.addEventListener('abort', abort, { once: true });
      const consume = line => {
        if (run.failure) return;
        try {
          const result = JSON.parse(line.toString('utf8'));
          if (!result || typeof result !== 'object' || Array.isArray(result)
              || !['progress', 'final'].includes(result.type) || finalReceived) throw new Error();
          if (result.type === 'final') finalReceived = true;
          this.#update(run, result);
        } catch {
          this.#fail(run, '独立 Rust 网络进程返回了无效的状态数据。');
        }
      };
      child.stdout.on('data', chunk => {
        if (run.failure) return;
        let offset = 0;
        while (offset < chunk.length) {
          const newline = chunk.indexOf(0x0a, offset);
          const end = newline < 0 ? chunk.length : newline;
          const part = chunk.subarray(offset, end);
          if (pending.length + part.length > MAX_LINE_BYTES) {
            pending = Buffer.alloc(0);
            this.#fail(run, '独立 Rust 网络进程的状态数据超过限制。');
            return;
          }
          if (newline < 0) {
            pending = Buffer.concat([pending, part]);
            return;
          }
          consume(pending.length ? Buffer.concat([pending, part]) : part);
          pending = Buffer.alloc(0);
          if (run.failure) return;
          offset = newline + 1;
        }
      });
      // Native errors and diagnostics never reach account or HTTP responses.
      child.stderr.resume();
      child.stdout.on('error', () => this.#fail(run, '独立 Rust 网络进程的状态管道发生错误。'));
      child.on('error', () => this.#fail(run, '独立 Rust 网络进程发生错误。'));
      child.stdin.on('error', () => {
        if (!run.stopRequested && !finalReceived) this.#fail(run, '独立 Rust 网络进程的输入管道已关闭。');
      });
      child.on('close', code => {
        this.#finishAction(run, new ApiError(409, '游戏连接已结束，角色操作结果未确认。'));
        this.#finishChat(run, new ApiError(409, '游戏连接已结束，聊天发送结果未确认。'));
        clearTimeout(run.killTimer);
        signal.removeEventListener('abort', abort);
        run.child = null;
        if (pending.length) consume(pending);
        pending = Buffer.alloc(0);
        if (!run.failure && (code !== 0 || !finalReceived)) {
          run.failure = '独立 Rust 网络进程已结束，未取得完整的关闭结果。';
        }
        // Resolving here, instead of on exit/error/final, keeps the Steam lease
        // alive until the worker and all of its local pipes have closed.
        if (run.failure) reject(new Error());
        else resolve();
      });
      let identity;
      try {
        identity = Buffer.from(`${JSON.stringify({ steamId,
          username: String(username || 'Player').slice(0, 128),
          sessionTicketBase64: sessionTicket.toString('base64') })}\n`, 'utf8');
        child.stdin.write(identity, () => identity.fill(0));
      } catch {
        identity?.fill(0);
        this.#fail(run, '独立 Rust 网络进程的身份输入失败。');
      }
      if (signal.aborted || run.stopRequested) this.#requestStop(run);
    });
  }
}
