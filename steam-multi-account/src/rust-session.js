import { spawn } from 'node:child_process';
import { ApiError } from './errors.js';
import { readRustRuntime, safeMetadata, validateRustDestination } from './rust-connection.js';

const MAX_LINE_BYTES = 65536;
const STOP_GRACE_MS = 5000;
const REJECTION_MESSAGES = {
  steam_auth: '服务器未接受该账号的 Steam 认证。',
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
  ['transport_connection_attempt_failed', '无法与该服务器建立网络连接。'],
  ['transport_no_free_incoming_connections', '服务器当前没有可用连接位置。'],
  ['transport_connection_banned', '服务器拒绝了本次网络连接。'],
  ['transport_invalid_password', '服务器未接受本次网络连接密码。'],
  ['transport_incompatible_protocol_version', '服务器网络传输协议不兼容。'],
  ['transport_connection_rate_limited', '服务器限制了本次连接频率。'],
];

// Only public, filtered worker metadata survives a run. The account keeps this
// manager across Steam reconnects so a retiring worker cannot overlap its next.
export class RustSession {
  #run = null;
  #status = {
    state: 'closed', host: null, port: null, startedAt: null, endedAt: null,
    metadata: safeMetadata({}), lastError: null,
  };

  snapshot() {
    return { ...this.#status, metadata: safeMetadata(this.#status.metadata) };
  }

  start(auth, input, username, env = process.env) {
    const destination = validateRustDestination(input);
    const runtime = readRustRuntime(env);
    if (this.#run) throw new ApiError(409, '该账号的 Rust 会话或清理仍在进行，请先停止并等待结束。');
    const run = { child: null, workerStarted: false, reachedEnteredGame: false,
      stopRequested: false, stopSent: false, killTimer: null, failure: null };
    this.#run = run;
    this.#status = {
      state: 'connecting', ...destination, startedAt: new Date().toISOString(), endedAt: null,
      metadata: safeMetadata({ closed: false, playerConnected: false, eacVerified: false,
        selfEntityObserved: false, finishLoadingObserved: false }), lastError: null,
    };
    // The HTTP request returns immediately. This task owns the ticket through
    // worker close and the authentication lease's cancellation/zeroing step.
    void this.#execute(run, auth, runtime, destination, username);
    return this.snapshot();
  }

  stop() {
    if (this.#run) this.#requestStop(this.#run);
    return this.snapshot();
  }

  #requestStop(run) {
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
    this.#status.metadata = metadata;
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
    if (rejection) return { state: 'error', lastError: rejection };
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
      clearTimeout(run.killTimer);
      this.#status.endedAt = new Date().toISOString();
      if (this.#run === run) this.#run = null;
    }
  }

  #worker(run, runtime, destination, username, sessionTicket, steamId, signal) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(runtime.python, [runtime.worker, '--dll', runtime.dll,
          '--sha256', runtime.sha256, '--host', destination.host,
          '--port', String(destination.port), '--persistent', '--stream'], {
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
