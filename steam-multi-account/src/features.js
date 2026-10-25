import SteamStore from 'steamstore';
import { ApiError } from './errors.js';
import { RustAuthCheck } from './game-auth.js';
import { connectRust } from './rust-connection.js';
import { RustSession } from './rust-session.js';
import { queryRustSteamCount, queryRustSteamServerListCount } from './rust-server-query.js';

export function appIds(value, max = 32) {
  if (!Array.isArray(value) || value.length > max || value.some(id => !Number.isInteger(id) || id < 1 || id > 0xffffffff)) {
    throw new ApiError(400, `appIds 必须是最多 ${max} 个有效 AppID 组成的数组。`);
  }
  return [...new Set(value)];
}
function maskEmail(address) {
  const [name, domain] = String(address || '').split('@');
  return domain ? `${name.slice(0, 2)}***@${domain}` : null;
}
export function safeImage(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['steamstatic.com', 'akamaihd.net', 'steamusercontent.com', 'cloudflare.steamstatic.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    return url.href;
  } catch { return null; }
}
function upstreamError(error, operation, resultNames) {
  const reason = resultNames?.[error?.eresult];
  return new ApiError(502, `${operation}失败${reason ? `（${reason}）` : '，请检查 Steam 网络连接或账号权限'}。`);
}

export class AccountFeatures {
  constructor({ account, client, current, persist, resultNames = {}, currencyNames = {}, fetchImpl = fetch, createStore = () => new SteamStore({ timeout: 12000 }) }) {
    Object.assign(this, { account, client, current, persist, resultNames, currencyNames, fetchImpl, createStore });
    this.profile = {};
    this.cookies = [];
    this.storeClient = null;
    this.profileWarnings = [];
    this.inventoryCache = new Map();
    this.inventoryPending = new Map();
    this.claimHistory = [];
    this.claimBusy = false;
    this.blocked = false;
    this.idleStartedAt = null;
    this.idleReportedAt = null;
    this.rustAuth = new RustAuthCheck({ client, requireOnline: () => this.requireOnline(), ensureCurrent: () => this.ensureCurrent() });
    this.rustSession = account.rustSession ||= new RustSession();
    this.rustSession.setActivityListener(() => this.applyIdle());
    const on = (event, handler) => client.on(event, (...args) => { if (current()) handler(...args); });
    on('accountInfo', (name, country, authedMachines, flags) => Object.assign(this.profile, { nickname: name, country, authedMachines, accountFlags: flags }));
    on('emailInfo', (address, validated) => Object.assign(this.profile, { email: maskEmail(address), emailValidated: validated }));
    on('accountLimitations', (limited, communityBanned, locked, canInviteFriends) => Object.assign(this.profile, { limited, communityBanned, locked, canInviteFriends }));
    on('vacBans', (numBans, bannedAppIds) => Object.assign(this.profile, { vacBans: numBans, bannedAppIds }));
    on('wallet', (hasWallet, currency, balance) => { this.profile.wallet = { hasWallet, currency, currencyCode: currencyNames[currency] || String(currency), balance }; });
    on('licenses', licenses => { this.profile.licenseCount = licenses.length; this.gamesCachedAt = 0; });
    on('webSession', (_sessionId, cookies) => {
      try {
        const store = createStore();
        store.setCookies(cookies);
        this.cookies = cookies.map(cookie => cookie.split(';', 1)[0]);
        this.storeClient = store;
        this.inventoryCache.clear();
      } catch {
        this.disconnect();
        this.profileWarnings.push('Steam 网页会话初始化失败，请刷新网页会话。');
      }
    });
    on('playingState', (blocked, playingApp) => {
      const wasBlocked = this.blocked;
      this.blocked = Boolean(blocked);
      this.externalAppId = blocked ? playingApp : null;
      if (blocked && !wasBlocked) { this.idleStartedAt = null; client.gamesPlayed([]); }
      if (!blocked && wasBlocked) this.applyIdle();
    });
    on('user', (sid, persona) => {
      if (sid.getSteamID64() === account.saved.steamId) this.setPersona(persona);
    });
  }

  requireOnline() {
    if (!this.current() || this.account.state !== 'online') throw new ApiError(409, '请先登录该账号并等待状态变为在线。');
  }
  requireWeb() {
    this.requireOnline();
    if (!this.cookies.length) throw new ApiError(409, 'Steam 网页会话尚未就绪，请稍后重试或点击“刷新网页会话”。');
  }
  ensureCurrent(client = this.client) {
    if (!this.current() || this.client !== client) throw new ApiError(409, '账号连接已更改，请刷新后重试。');
  }
  setPersona(persona) {
    if (!persona) return;
    Object.assign(this.profile, {
      nickname: persona.player_name || this.profile.nickname,
      avatarUrl: safeImage(persona.avatar_url_full || persona.avatar_url_medium),
      personaState: persona.persona_state,
      lastLogon: persona.last_logon || null,
      lastLogoff: persona.last_logoff || null,
    });
  }
  snapshot() {
    const config = this.account.saved.idle || { enabled: false, appIds: [] };
    return {
      profile: { ...this.profile, profileUrl: this.account.saved.steamId ? `https://steamcommunity.com/profiles/${this.account.saved.steamId}/` : null },
      profileUpdatedAt: this.profileUpdatedAt || null,
      warnings: this.profileWarnings,
      webReady: Boolean(this.cookies.length && this.current() && this.account.state === 'online'),
      idle: {
        ...config,
        status: !config.enabled ? 'stopped' : this.account.state !== 'online' ? 'waiting_connection' : this.blocked ? 'paused_other_session' : this.idleReportedAt ? 'running' : 'pending',
        startedAt: this.idleStartedAt, reportedAt: this.idleReportedAt,
        externalAppId: this.externalAppId || null,
      },
      claims: this.claimHistory.slice(-10).reverse(),
    };
  }
  onLoggedOn() {
    this.blocked = Boolean(this.client.playingState?.blocked);
    this.externalAppId = this.client.playingState?.appid || null;
    this.applyIdle();
    if (typeof this.client.getPersonas === 'function') this.refreshProfile().catch(() => {});
  }
  disconnect() {
    this.rustSession.stop();
    this.rustAuth.disconnect();
    this.cookies = [];
    this.storeClient = null;
    this.idleStartedAt = null;
    this.idleReportedAt = null;
    this.inventoryCache.clear();
  }
  rustAuthCheck() { return this.rustAuth.check(); }
  rustConnect(input) { return connectRust(this.rustAuth, input, this.profile.nickname || this.account.saved.accountName); }
  startRustSession(input) {
    this.requireOnline();
    return this.rustSession.start(this.rustAuth, input, this.profile.nickname || this.account.saved.accountName);
  }
  rustSessionStatus() {
    return { ...this.rustSession.snapshot(), steamAuthentication: this.rustAuth.activeSessionStatus() };
  }
  stopRustSession() { return this.rustSession.stop(); }
  sendRustChat(input) { this.requireOnline(); return this.rustSession.sendChat(input); }
  async rustSteamCount() {
    this.requireOnline();
    const { host, port } = this.rustSession.snapshot();
    if (!host) throw new ApiError(409, '请先选择并连接 Rust 服务器。');
    const key = `${host}:${port}`;
    this.rustSteamCountPending ||= new Map();
    if (this.rustSteamCountPending.has(key)) return this.rustSteamCountPending.get(key);
    const pending = Promise.all([
      queryRustSteamCount(this.client, { host, port }, () => this.requireOnline()),
      queryRustSteamServerListCount(this.client, { host, port }, () => this.requireOnline()),
    ]).then(([result, serverList]) => ({ host, port, ...result, serverList }));
    this.rustSteamCountPending.set(key, pending);
    try { return await pending; }
    finally { if (this.rustSteamCountPending.get(key) === pending) this.rustSteamCountPending.delete(key); }
  }
  async refreshProfile() {
    this.requireOnline();
    if (this.profilePending) return this.profilePending;
    this.profilePending = (async () => {
      const sid = this.account.saved.steamId;
      const results = await Promise.allSettled([
        this.client.getPersonas([sid]), this.client.getSteamLevels([sid]),
      ]);
      this.ensureCurrent();
      this.profileWarnings = [];
      if (results[0].status === 'fulfilled') this.setPersona(results[0].value.personas?.[sid]);
      else this.profileWarnings.push('昵称或头像暂时无法刷新。');
      if (results[1].status === 'fulfilled') this.profile.steamLevel = results[1].value.users?.[sid] ?? null;
      else this.profileWarnings.push('Steam 等级暂时无法刷新。');
      this.profileUpdatedAt = new Date().toISOString();
      return this.snapshot();
    })();
    try { return await this.profilePending; }
    finally { this.profilePending = null; }
  }
  refreshWeb() {
    this.requireOnline();
    if (this.webRequestedAt && Date.now() - this.webRequestedAt < 15000) throw new ApiError(429, '请等待至少 15 秒再刷新网页会话。');
    this.webRequestedAt = Date.now();
    this.client.webLogOn();
    return { requested: true };
  }
  async games(refresh = false) {
    this.requireOnline();
    if (!refresh && this.gamesCache && Date.now() - this.gamesCachedAt < 30000) return this.gamesCache;
    if (this.gamesPending) return this.gamesPending;
    this.gamesPending = (async () => {
      try {
        const response = await this.client.getUserOwnedApps(this.account.saved.steamId, { includePlayedFreeGames: true, skipUnvettedApps: false });
        this.ensureCurrent();
        const games = (response.apps || []).map(app => ({
          appId: app.appid, name: app.name || `App ${app.appid}`,
          playtimeMinutes: app.playtime_forever || 0, recentMinutes: app.playtime_2weeks || 0,
          iconUrl: safeImage(app.img_icon_url),
        })).sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
        this.gamesCachedAt = Date.now();
        return this.gamesCache = { total: response.app_count ?? games.length, games, fetchedAt: new Date().toISOString() };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw upstreamError(error, '游戏库读取', this.resultNames);
      }
    })();
    try { return await this.gamesPending; } finally { this.gamesPending = null; }
  }
  async inventory({ appId = 753, contextId = '6', startAssetId = '', refresh = false } = {}) {
    this.requireWeb();
    appIds([appId], 1);
    if (!/^\d{1,20}$/.test(String(contextId)) || (startAssetId && !/^\d{1,20}$/.test(startAssetId))) throw new ApiError(400, '库存 ContextID 或翻页标识无效。');
    const key = `${appId}/${contextId}/${startAssetId}`;
    const cached = this.inventoryCache.get(key);
    if (!refresh && cached && Date.now() - cached.at < 30000) return cached.data;
    if (this.inventoryPending.has(key)) return this.inventoryPending.get(key);
    const pending = (async () => {
      const url = new URL(`https://steamcommunity.com/inventory/${this.account.saved.steamId}/${appId}/${contextId}`);
      url.search = new URLSearchParams({ l: 'schinese', count: '100', ...(startAssetId ? { start_assetid: startAssetId } : {}) });
      try {
        const response = await this.fetchImpl(url, { headers: { Cookie: this.cookies.join('; '), Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
        if ([401, 403].includes(response.status)) throw new ApiError(response.status, '库存暂不可访问，请检查库存隐私设置或刷新 Steam 网页会话。');
        if (response.status === 429) throw new ApiError(429, 'Steam 库存接口请求过于频繁，请稍后重试。');
        if (!response.ok) throw new ApiError(502, `Steam 库存接口暂不可用（HTTP ${response.status}）。`);
        const body = await response.json();
        this.ensureCurrent();
        if (body.success !== 1 && body.success !== true) throw new ApiError(502, 'Steam 未返回有效库存，请确认 AppID、ContextID 和库存权限。');
        const descriptions = new Map((body.descriptions || []).map(item => [`${item.classid}_${item.instanceid || '0'}`, item]));
        const items = (body.assets || []).map(asset => {
          const item = descriptions.get(`${asset.classid}_${asset.instanceid || '0'}`) || {};
          return {
            assetId: asset.assetid, classId: asset.classid, amount: asset.amount,
            name: item.market_hash_name || item.name || `物品 ${asset.assetid}`, type: item.type || '',
            iconUrl: item.icon_url ? safeImage(`https://community.steamstatic.com/economy/image/${item.icon_url}`) : null,
            tradable: item.tradable === 1, marketable: item.marketable === 1,
            descriptions: (item.descriptions || []).filter(line => line.type === 'text').map(line => line.value).slice(0, 6),
            tags: (item.tags || []).map(tag => tag.localized_tag_name).filter(Boolean),
          };
        });
        const data = { appId, contextId: String(contextId), total: body.total_inventory_count ?? items.length, items, more: Boolean(body.more_items), nextAssetId: body.more_items ? body.last_assetid : null, fetchedAt: new Date().toISOString() };
        this.inventoryCache.set(key, { at: Date.now(), data });
        return data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, '库存读取失败，请检查到 steamcommunity.com 的网络连接。');
      }
    })();
    this.inventoryPending.set(key, pending);
    try { return await pending; } finally { this.inventoryPending.delete(key); }
  }
  setIdle(value) {
    const ids = appIds(value);
    if (ids.length) this.requireOnline();
    const previous = this.account.saved.idle;
    this.account.saved.idle = { enabled: ids.length > 0, appIds: ids, updatedAt: new Date().toISOString() };
    try { this.persist(); } catch (error) { this.account.saved.idle = previous; throw error; }
    this.idleStartedAt = null;
    this.idleReportedAt = null;
    this.applyIdle();
    return this.snapshot().idle;
  }
  applyIdle() {
    if (!this.current() || this.account.state !== 'online') return;
    const config = this.account.saved.idle;
    if (this.blocked) return;
    let playing = config?.enabled ? [...config.appIds] : [];
    // This is the real independent Rust session. Report it while it owns its
    // transport/ticket, and restore the saved idle selection after cleanup.
    const rustActivity = this.rustSession.steamGameActivity();
    if (rustActivity) playing = [...playing.filter(appId => appId !== 252490), rustActivity];
    this.client.gamesPlayed(playing);
    if (config?.enabled) {
      this.idleStartedAt ||= new Date().toISOString();
      this.idleReportedAt = new Date().toISOString();
    }
  }
  async claim(input) {
    this.requireOnline();
    if (Object.keys(input).some(key => !['appIds', 'packageId'].includes(key))) throw new ApiError(400, '免费入库参数无效。');
    if ((input.appIds !== undefined) === (input.packageId !== undefined)) throw new ApiError(400, '请提供 appIds 或 packageId 中的一种。');
    const ids = input.appIds !== undefined ? appIds(input.appIds, 5) : appIds([input.packageId], 1);
    if (!ids.length) throw new ApiError(400, '请至少选择一个游戏。');
    if (input.packageId !== undefined) this.requireWeb();
    if (this.claimBusy) throw new ApiError(409, '当前账号正在处理另一个免费入库请求。');
    const recent = this.claimHistory.filter(entry => Date.now() - Date.parse(entry.at) < 3600000);
    if (recent.reduce((count, entry) => count + entry.requested.length, 0) + ids.length > 40) throw new ApiError(429, '本服务每个账号每小时最多申请 40 个免费许可，请稍后再试。');
    if (recent.length && Date.now() - Date.parse(recent.at(-1).at) < 3000) throw new ApiError(429, '请等待 3 秒再发起免费入库。');
    this.claimBusy = true;
    const entry = { at: new Date().toISOString(), type: input.packageId === undefined ? 'app' : 'package', requested: ids };
    this.claimHistory.push(entry);
    this.claimHistory = this.claimHistory.slice(-100);
    try {
      if (input.packageId !== undefined) {
        if ((this.client.licenses || []).some(license => license.package_id === input.packageId)) {
          Object.assign(entry, { status: 'already_owned', message: '账号已拥有该游戏包。' });
        } else {
          await this.storeClient.addFreeLicense(input.packageId);
          this.ensureCurrent();
          Object.assign(entry, { status: 'granted', grantedPackageIds: ids, message: 'Steam 已接受免费游戏包入库请求。' });
        }
      } else {
        const result = await this.client.requestFreeLicense(ids);
        this.ensureCurrent();
        const granted = Boolean(result.grantedPackageIds?.length || result.grantedAppIds?.length);
        Object.assign(entry, { ...result, status: granted ? 'granted' : 'not_granted', message: granted ? 'Steam 已发放免费游戏许可。' : 'Steam 没有发放新许可：可能已经拥有，或该游戏不支持此方式领取。' });
      }
      this.gamesCachedAt = 0;
      return entry;
    } catch (error) {
      entry.status = 'failed';
      const safe = error instanceof ApiError ? error : upstreamError(error, '免费入库', this.resultNames);
      entry.message = safe.message;
      throw safe;
    } finally { this.claimBusy = false; }
  }
}
