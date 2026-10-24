import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ApiError } from './errors.js';
import { validateRustDestination } from './rust-connection.js';
import { query } from '../../rust-research/query-server.mjs';

const ACTIVE = new Set(['connecting', 'receiving_world', 'player_initialized', 'entered_game', 'stopping']);
const CONNECTING = new Set(['connecting', 'receiving_world', 'player_initialized']);
const STAGES = {
  identity_sent: '已提交本账号的 Steam 身份。', approved: '服务器已批准连接。',
  ready_sent: '已提交加载就绪信息。', self_entity_observed: '已识别本账号的玩家实体。',
  finish_loading_observed: '已收到服务器完成入服通知。', respawn_sent: '已发送一次正常重生请求。',
  respawn_alive_observed: '重生请求后已收到存活快照。', eac_required: '服务器要求当前连接不支持的 EAC 会话，已停止。',
  protected_or_unsupported_encryption_required: '服务器要求当前连接不支持的受保护会话，已停止。',
  transport_connection_lost: '服务器网络连接丢失。', disconnect_reason_received: '服务器已结束连接。',
  native_wrapper_closed: 'Rust 网络连接已清理。',
  wake_neutral_sent: '已开始一次角色唤醒尝试。', wake_press_sent: '已发送普通唤醒输入。',
  wake_release_sent: '已释放唤醒按键，等待角色快照。',
  wake_awake_observed: '唤醒输入后已观察到角色清醒快照。',
  wake_unconfirmed: '未在等待时间内确认唤醒，不再重试。',
  wake_interrupted: '角色状态改变，唤醒尝试已停止。',
  tick_native_send_failed: '唤醒输入发送失败，连接已关闭。',
  wake_release_unavailable: '无法安全释放唤醒按键，连接已关闭。',
  connection_keepalive_started: '已开始维护玩家连接。',
  connection_keepalive_send_failed: '连接维护消息发送失败，连接已关闭。',
  connection_keepalive_stalled: '本机连接维护停顿过长，已关闭连接。',
};
const STEAM_STATES = { online: 'Steam 已登录。', connecting: '正在登录 Steam。', reconnecting: 'Steam 正在重连。',
  guard_required: '此账号需要验证码。', offline: 'Steam 已退出。', error: 'Steam 登录或连接失败。' };
const RUST_STATES = { connecting: '开始连接 Rust 服务器。', receiving_world: '正在接收服务器世界。',
  player_initialized: '本账号玩家已初始化。', entered_game: '本账号已进入服务器。',
  stopping: '正在断开 Rust 服务器。', closed: 'Rust 连接已关闭。', error: 'Rust 连接失败或已中断。' };
const FAILURE = { InvalidPassword: '账号或密码不正确。', AccountDisabled: '账号已停用。',
  RateLimitExceeded: 'Steam 暂时限制登录，请稍后重试。', AccessDenied: 'Steam 拒绝登录。',
  LogonSessionReplaced: '登录被其他会话替换。', Expired: '已保存的登录令牌过期。' };

function targetFrom(input) {
  const target = validateRustDestination(input, ['queryPort']);
  if (input.queryPort !== undefined && (!Number.isInteger(input.queryPort) || input.queryPort < 1 || input.queryPort > 65535))
    throw new ApiError(400, '查询端口必须是 1 到 65535 的整数。');
  return { ...target, queryPort: input.queryPort ?? (target.port < 65535 ? target.port + 1 : target.port) };
}
function errorMessage(account) { return FAILURE[account.lastError?.code] || (account.lastError ? '登录失败，请检查账号状态后重试。' : null); }
function boundedIds(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200
      || input.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)))
    throw new ApiError(400, '请选择 1 到 200 个账号。');
  return [...new Set(input)];
}

export class RustWorkspace {
  constructor(manager, { queryServer = query, loginTimeoutMs = 60000, pollMs = 200, connectSpacingMs = 5000 } = {}) {
    this.manager = manager;
    this.queryServer = queryServer;
    this.loginTimeoutMs = loginTimeoutMs;
    this.pollMs = pollMs;
    this.connectSpacingMs = connectSpacingMs;
    this.jobs = new Map();
    this.logs = new Map();
    this.observed = new Map();
    this.servers = new Map();
    this.busy = new Set();
    this.closed = false;
    this.timer = setInterval(() => { try { this.capture(); } catch {} }, 1000);
    this.timer.unref();
    this.capture();
  }

  close() { this.closed = true; clearInterval(this.timer); }
  addLog(id, message, level = 'info', event = 'operation') {
    const entries = this.logs.get(id) || [];
    entries.push({ at: new Date().toISOString(), level, event, message });
    this.logs.set(id, entries.slice(-200));
  }
  session(account) {
    try {
      return account.features?.rustSessionStatus() || account.rustSession?.snapshot()
        || { state: 'closed', metadata: {} };
    } catch { return { state: 'closed', metadata: {} }; }
  }
  capture() {
    for (const [id, account] of this.manager.accounts) {
      const s = this.session(account), previous = this.observed.get(id) || {};
      if (account.state !== previous.steamState && STEAM_STATES[account.state])
        this.addLog(id, STEAM_STATES[account.state], account.state === 'error' ? 'error' : 'info', 'steam');
      if (s.state !== previous.rustState && (s.startedAt || ACTIVE.has(s.state)) && RUST_STATES[s.state])
        this.addLog(id, RUST_STATES[s.state], s.state === 'error' ? 'error' : 'info', 'rust');
      const seen = previous.startedAt === s.startedAt ? (previous.stages || new Set()) : new Set();
      for (const stage of s.metadata?.stages || []) if (!seen.has(stage)) {
        if (STAGES[stage]) this.addLog(id, STAGES[stage], 'info', stage);
        seen.add(stage);
      }
      const own = s.metadata?.ownPlayerState;
      if (own?.observed && own.lifeState !== previous.lifeState && ['alive', 'dead'].includes(own.lifeState))
        this.addLog(id, `最近角色快照：${own.lifeState === 'alive' ? '存活' : '死亡'}。`, 'info', 'life_state');
      this.observed.set(id, { steamState: account.state, rustState: s.state, startedAt: s.startedAt,
        stages: seen, lifeState: own?.lifeState });
    }
    for (const id of this.observed.keys()) if (!this.manager.accounts.has(id)) this.observed.delete(id);
    for (const id of this.logs.keys()) if (!this.manager.accounts.has(id)) this.logs.delete(id);
  }
  accountLogs(id) {
    const account = this.manager.get(id);
    this.capture();
    return { accountName: account.saved.accountName, logs: [...(this.logs.get(id) || [])] };
  }
  server(target) {
    const key = `${target.host}:${target.port}`;
    let entry = this.servers.get(key);
    if (!entry) {
      entry = { ...target, name: key, queriedAt: 0, pending: null };
      this.servers.set(key, entry);
    }
    if (target.queryPort && target.queryPort !== entry.queryPort) {
      entry.queryPort = target.queryPort; entry.queriedAt = 0;
    }
    if (!entry.pending && Date.now() - entry.queriedAt > 300000) {
      entry.pending = Promise.resolve().then(() => this.queryServer(entry.host,
        entry.queryPort || Math.min(65535, entry.port + 1), 'info', { timeoutMs: 3000 })).then(info => {
        const name = typeof info.name === 'string' ? info.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160) : '';
        if (name) entry.name = name;
        entry.queriedAt = Date.now();
      }).catch(() => { entry.queriedAt = Date.now() - 270000; }).finally(() => { entry.pending = null; });
    }
    return entry;
  }
  overview() {
    this.capture();
    const groups = new Map();
    const accounts = [...this.manager.accounts.values()].map(account => {
      const view = this.manager.view(account), session = this.session(account);
      const connected = session.state === 'entered_game' && session.metadata?.closed !== true;
      let serverName = null;
      if (session.host && session.port) {
        const server = this.server({ host: session.host, port: session.port });
        serverName = server.name;
        if (ACTIVE.has(session.state)) {
          const key = `${session.host}:${session.port}`;
          const group = groups.get(key) || { host: session.host, port: session.port, name: serverName,
            connectedAccounts: 0, connectingAccounts: 0, accountNames: [] };
          if (connected) { group.connectedAccounts++; group.accountNames.push(view.accountName); }
          else if (CONNECTING.has(session.state)) group.connectingAccounts++;
          groups.set(key, group);
        }
      }
      return { id: view.id, accountName: view.accountName, nickname: view.nickname, steamState: view.state,
        hasSavedLogin: view.hasSavedLogin, lastError: errorMessage(account),
        rust: { state: session.state, host: session.host || null, port: session.port || null,
          serverName, connected, elapsedSeconds: session.metadata?.elapsedSeconds || 0,
          metadata: session.metadata || {}, lastError: session.lastError || null } };
    });
    return { accounts, servers: [...groups.values()], jobs: [...this.jobs.values()].map(job => this.jobView(job)),
      counts: { total: accounts.length, steamOnline: accounts.filter(a => a.steamState === 'online').length,
        connected: accounts.filter(a => a.rust.connected).length,
        connecting: accounts.filter(a => CONNECTING.has(a.rust.state)).length } };
  }
  jobView(job) {
    return { id: job.id, kind: job.kind, state: job.state, total: job.total, completed: job.completed,
      createdAt: job.createdAt, completedAt: job.completedAt, results: job.results.map(r => ({ ...r })) };
  }
  getJob(id) {
    const job = this.jobs.get(id);
    if (!job) throw new ApiError(404, '没有找到这批操作记录。');
    return this.jobView(job);
  }
  newJob(kind, total) {
    if (this.closed || this.manager.closed) throw new ApiError(503, '本地服务正在停止。');
    if ([...this.jobs.values()].filter(j => j.state === 'running').length >= 4)
      throw new ApiError(409, '已有多批任务正在进行，请等待当前批次。');
    for (const [id, job] of this.jobs) if (this.jobs.size >= 20 && job.state !== 'running') this.jobs.delete(id);
    const job = { id: randomUUID(), kind, state: 'running', total, completed: 0,
      createdAt: new Date().toISOString(), completedAt: null, results: [] };
    this.jobs.set(job.id, job);
    return job;
  }
  result(job, accountName, status, message, line) {
    job.results.push({ accountName, status, message, ...(line ? { line } : {}) });
    job.completed++;
  }
  finish(job) {
    job.state = this.closed || this.manager.closed ? 'cancelled' : 'complete';
    job.completedAt = new Date().toISOString();
    this.capture();
  }
  findName(name) {
    return [...this.manager.accounts.values()].find(a => a.saved.accountName.toLowerCase() === name.toLowerCase());
  }
  async loginOne(account, credentials) {
    const name = credentials?.accountName || account.saved.accountName;
    if (account?.state === 'online') return { status: 'success', message: '已在线，保留现有连接。' };
    if (account?.client) return { status: 'skipped', message: '账号已有登录或验证请求，已跳过。' };
    const lock = name.toLowerCase();
    if (this.busy.has(lock)) return { status: 'skipped', message: '账号正在另一批操作中，已跳过。' };
    this.busy.add(lock);
    const wasNew = !account;
    let id = account?.saved.id || name.toLowerCase();
    if (wasNew && this.manager.accounts.has(id)) id = `a_${randomUUID().replaceAll('-', '')}`;
    let owned, client;
    const cleanup = () => {
      const current = this.manager.accounts.get(id);
      if (!current) return true;
      if (current !== owned || (current.client && current.client !== client)) return false;
      try {
        if (wasNew) { this.manager.remove(id); this.logs.delete(id); this.observed.delete(id); }
        else this.manager.logout(id);
        return true;
      } catch {
        // A storage error must not leave a Guard callback or a login running.
        current.saved.autoConnect = false;
        this.manager.stopClient(current);
        this.manager.change(current, 'offline');
        return false;
      }
    };
    const cleanupFailure = () => ({ status: 'failed', message: '本次登录已停止，但无法保存清理结果；请检查本地存储后移除失败项。' });
    try {
      try { this.manager.login(id, credentials || {}); }
      catch (error) {
        // login() can create the account before its first persistence fails.
        const current = this.manager.accounts.get(id);
        if (current && (current === account || (wasNew && current.saved.accountName.toLowerCase() === lock))) {
          owned = current; client = current.client;
        }
        throw error;
      }
      owned = this.manager.get(id); client = owned.client;
      this.addLog(id, '批量登录已开始。');
      const deadline = Date.now() + this.loginTimeoutMs;
      while (!this.closed && !this.manager.closed) {
        const current = this.manager.accounts.get(id);
        if (current !== owned || (current.client && current.client !== client))
          return { status: 'skipped', message: '账号状态已被其他操作更新，已跳过。' };
        if (current.state === 'online') {
          this.addLog(id, wasNew ? '账号导入并登录成功。' : '批量登录成功。');
          return { status: 'success', message: wasNew ? '导入成功，已登录。' : '登录成功。' };
        }
        if (current.state === 'guard_required') {
          if (!cleanup()) return cleanupFailure();
          return { status: 'skipped', message: wasNew ? '需要邮箱或手机验证码，已跳过并移出。' : '需要验证码，已跳过；原有账号保留。' };
        }
        if (current.state === 'error' || current.state === 'offline') {
          const message = errorMessage(current) || '登录失败。';
          if (!cleanup()) return cleanupFailure();
          return { status: 'failed', message: `${message}${wasNew ? '未成功导入，已移出。' : '原有账号保留。'}` };
        }
        if (Date.now() >= deadline) break;
        await delay(this.pollMs);
      }
      if (!cleanup()) return cleanupFailure();
      return { status: 'failed', message: wasNew ? '登录超时或任务取消，未导入的账号已移出。' : '登录超时或任务取消，已停止本次尝试。' };
    } catch {
      if (owned && !cleanup()) return cleanupFailure();
      return { status: 'failed', message: wasNew ? '未能导入账号，未保留失败项。' : '未能登录，请检查账号状态。' };
    } finally { this.busy.delete(lock); }
  }
  startImport(input) {
    if (!input || Object.keys(input).some(k => k !== 'text') || typeof input.text !== 'string'
        || !input.text.trim() || Buffer.byteLength(input.text) > 128 * 1024)
      throw new ApiError(400, '请输入每行一个账号:密码，最多 128 KiB。');
    const lines = input.text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line, i) => ({ line, number: i + 1 })).filter(e => e.line.trim());
    if (lines.length > 200) throw new ApiError(400, '每批最多导入 200 个账号。');
    const entries = [], seen = new Set();
    for (const row of lines) {
      const colon = row.line.indexOf(':'), name = colon < 0 ? '' : row.line.slice(0, colon).trim();
      const password = colon < 0 ? '' : row.line.slice(colon + 1);
      const validName = /^[A-Za-z0-9_]{1,64}$/.test(name);
      let reason = null;
      if (!validName || !password || password.length > 512 || password.includes('\0')) reason = '格式不正确，应为账号:密码。';
      else if (seen.has(name.toLowerCase())) reason = '本批账号重复，已跳过。';
      if (validName) seen.add(name.toLowerCase());
      entries.push({ accountName: validName ? name : `第 ${row.number} 行`, password: reason ? null : password,
        line: row.number, reason });
    }
    const job = this.newJob('import', entries.length);
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        try {
          if (this.closed || this.manager.closed) this.result(job, entry.accountName, 'skipped', '服务已停止，未导入。', entry.line);
          else if (entry.reason) this.result(job, entry.accountName, 'skipped', entry.reason, entry.line);
          else {
            const result = await this.loginOne(this.findName(entry.accountName), { accountName: entry.accountName, password: entry.password });
            this.result(job, entry.accountName, result.status, result.message, entry.line);
          }
        } catch {
          this.result(job, entry.accountName, 'failed', '本次导入发生本地错误，请检查账号状态。', entry.line);
        } finally { entry.password = null; }
      }
    };
    void Promise.all([worker(), worker()]).finally(() => { entries.length = 0; this.finish(job); });
    return this.jobView(job);
  }
  startActions(input) {
    if (!input || Object.keys(input).some(k => !['action', 'accountIds', 'target', 'respawnOnDead', 'wakeOnConnect'].includes(k))
        || !['login', 'connect', 'disconnect'].includes(input.action)) throw new ApiError(400, '请选择批量登录、连接或断开。');
    const ids = boundedIds(input.accountIds);
    const accounts = ids.map(id => this.manager.get(id));
    const target = input.action === 'connect' ? targetFrom(input.target) : null;
    if (input.respawnOnDead !== undefined && typeof input.respawnOnDead !== 'boolean')
      throw new ApiError(400, '死亡时重生选项必须是布尔值。');
    if (input.wakeOnConnect !== undefined && typeof input.wakeOnConnect !== 'boolean')
      throw new ApiError(400, '入服后唤醒选项必须是布尔值。');
    if (target) this.server(target);
    const job = this.newJob(input.action, accounts.length);
    void (async () => {
      for (const [index, account] of accounts.entries()) {
        const name = account.saved.accountName, id = account.saved.id;
        try {
          if (this.closed || this.manager.closed) { this.result(job, name, 'skipped', '服务已停止，未执行。'); continue; }
          if (this.manager.accounts.get(id) !== account) { this.result(job, name, 'skipped', '账号已移除，已跳过。'); continue; }
          if (input.action === 'login') {
            const result = await this.loginOne(account);
            this.result(job, name, result.status, result.message);
          } else if (input.action === 'connect') {
            const existing = this.session(account);
            if (ACTIVE.has(existing.state)) { this.result(job, name, 'skipped', '已有 Rust 连接，已保留。'); continue; }
            this.manager.features(id).startRustSession({ host: target.host, port: target.port,
              respawnOnDead: input.respawnOnDead === true, wakeOnConnect: input.wakeOnConnect === true });
            this.addLog(id, `连接目标：${this.server(target).name}（${target.host}:${target.port}）。`);
            this.result(job, name, 'started', '连接已发起，进度见账号状态。');
            if (index < accounts.length - 1) await delay(this.connectSpacingMs);
          } else {
            if (!account.rustSession || !ACTIVE.has(this.session(account).state)) {
              this.result(job, name, 'skipped', '当前没有活动 Rust 连接。'); continue;
            }
            account.rustSession.stop();
            this.addLog(id, '已请求断开 Rust 服务器。');
            this.result(job, name, 'started', '正在正常断开并清理票据。');
          }
        } catch {
          this.result(job, name, 'failed', input.action === 'connect' && account.state !== 'online'
            ? '请先登录 Steam 后再连接。' : '操作未成功，请查看该账号日志和状态。');
          this.addLog(id, '批量操作未成功，请检查账号状态。', 'error');
        }
      }
    })().catch(() => {}).finally(() => this.finish(job));
    return this.jobView(job);
  }
}
