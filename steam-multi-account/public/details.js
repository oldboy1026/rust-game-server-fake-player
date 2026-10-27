import { tr, locale } from './i18n.js';
const $ = selector => document.querySelector(selector);
const states = { offline: tr('已退出'), connecting: tr('正在登录'), guard_required: tr('等待验证'), online: tr('在线'), reconnecting: tr('正在重连'), error: tr('连接失败') };
const idleStates = { stopped: tr('已停止'), running: tr('挂机中'), pending: tr('正在提交'), waiting_connection: tr('等待账号上线'), paused_other_session: tr('其他位置正在游戏，已暂停') };
const rustStates = { closed: tr('未连接'), connecting: tr('正在连接'), receiving_world: tr('正在接收世界'), player_initialized: tr('玩家已初始化'), entered_game: tr('已进入服务器'), stopping: tr('正在断开'), error: tr('连接结束') };
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function image(url, className, alt) {
  const img = node('img', className);
  img.src = url; img.alt = alt; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { img.hidden = true; });
  return img;
}
function yesNo(value) { return value === undefined || value === null ? tr('等待 Steam 数据') : value ? tr('是') : tr('否'); }
function shown(value) { return value === undefined || value === null ? tr('等待 Steam 数据') : String(value); }
function date(value) { return value ? new Date(value).toLocaleString(locale, { hour12: false }) : '—'; }

export function createAccountDetails({ request, notice, changed }) {
  let currentId = null;
  let generation = 0;
  let busy = false;
  let selectedTab = 'profile';
  let games = [];
  let gameLimit = 100;
  let libraryLoaded = false;
  let inventoryLoaded = false;
  let inventoryCursor = null;
  let inventorySource = null;
  let freeLoaded = false;
  let freeNext = null;
  let freeTerm = '';
  let latest = null;
  let rustRevision = 0, rustPending = false, rustSessionView = null;
  const buttonOperations = new Map();
  let libraryRevision = 0, inventoryRevision = 0, freeRevision = 0;
  const context = () => {
    const id = currentId, version = generation;
    return { id, valid: () => id !== null && currentId === id && generation === version, api: (suffix, method = 'GET', body) => request(`/v1/accounts/${id}/${suffix}`, method, body) };
  };
  async function run(button, operation) {
    if (!currentId || button?.disabled) return;
    const ctx = context();
    const operationId = Symbol();
    if (button) { buttonOperations.set(button, operationId); button.disabled = true; }
    try { await operation(ctx); }
    catch (error) { if (ctx.valid()) notice(error.message || tr('操作失败，请稍后重试。'), true); }
    finally {
      if (button && buttonOperations.get(button) === operationId) {
        buttonOperations.delete(button); button.disabled = false;
      }
    }
  }
  function action(parent, label, operation, style = 'secondary') {
    const button = node('button', `button small ${style}`, label);
    button.type = 'button';
    button.addEventListener('click', () => run(button, operation));
    parent.append(button); return button;
  }
  function paint(data) {
    latest = data;
    $('#detail-name').textContent = data.accountName;
    $('#detail-identity').textContent = `${data.accountName} · ${data.steamId || tr('Steam ID 待获取')}`;
    $('#detail-state').className = `badge ${data.state}`;
    $('#detail-state').textContent = states[data.state] || data.state;
    $('#detail-web-state').textContent = data.webReady ? tr('Steam 网页会话已就绪') : tr('Steam 网页会话未就绪');
    $('#detail-avatar').hidden = !data.profile.avatarUrl;
    if (data.profile.avatarUrl) $('#detail-avatar').src = data.profile.avatarUrl;
    $('#detail-profile-link').hidden = !data.profile.profileUrl;
    if (data.profile.profileUrl) $('#detail-profile-link').href = data.profile.profileUrl;
    const p = data.profile;
    const fields = [
      [tr('昵称'), p.nickname], [tr('Steam 等级'), p.steamLevel], [tr('登录地区'), p.country], [tr('邮箱（已隐藏部分）'), p.email],
      [tr('邮箱已验证'), yesNo(p.emailValidated)], [tr('授权设备数'), p.authedMachines],
      [tr('钱包余额'), p.wallet ? `${p.wallet.balance} ${p.wallet.currencyCode}` : undefined],
      [tr('拥有钱包'), yesNo(p.wallet?.hasWallet)], [tr('游戏包许可数'), p.licenseCount],
      [tr('受限账号'), yesNo(p.limited)], [tr('社区封禁'), yesNo(p.communityBanned)], [tr('账号锁定'), yesNo(p.locked)],
      [tr('可邀请好友'), yesNo(p.canInviteFriends)], [tr('VAC 封禁数'), p.vacBans],
      [tr('上次登录'), date(p.lastLogon)], [tr('本服务连接时间'), date(data.lastConnectedAt)],
    ];
    $('#profile-fields').replaceChildren(...fields.map(([label, value]) => {
      const entry = node('div'); entry.append(node('dt', '', label), node('dd', '', shown(value))); return entry;
    }));
    $('#profile-warnings').textContent = (data.warnings || []).map(value => tr(value)).join(' ');
    const idle = data.idle;
    $('#idle-state').textContent = idleStates[idle.status] || idle.status;
    $('#idle-state').className = `badge ${idle.status === 'running' ? 'online' : ''}`;
    $('#idle-games').textContent = idle.appIds.length ? tr`指定游戏 AppID：${idle.appIds.join(', ')}` : tr('当前没有挂机游戏。');
    $('#idle-time').textContent = idle.reportedAt ? tr`最近提交于 ${date(idle.reportedAt)}${idle.externalAppId ? tr` · 其他位置游戏：${idle.externalAppId}` : ''}` : idle.externalAppId ? tr`其他位置正在运行 AppID ${idle.externalAppId}` : '';
    $('#claim-history').replaceChildren(...(data.claims || []).map(entry => {
      const row = node('div', 'claim-entry');
      row.append(node('span', '', `${entry.type === 'package' ? 'SubID' : 'AppID'} ${entry.requested.join(', ')} · ${date(entry.at)}`), node('p', entry.status === 'failed' ? 'error-text' : '', tr(entry.message) || tr('正在请求 Steam…')));
      return row;
    }));
    if (!data.claims?.length) $('#claim-history').append(node('p', 'muted', tr('本次连接还没有领取记录。')));
  }
  async function refresh() {
    if (!currentId || busy) return;
    const ctx = context(); busy = true;
    try {
      const data = await ctx.api('details');
      if (ctx.valid()) paint(data);
      if (ctx.valid() && selectedTab === 'rust') await loadRust(ctx);
    }
    catch (error) { if (ctx.valid()) notice(error.message, true); }
    finally { busy = false; }
  }
  function selectTab(tab) {
    selectedTab = tab;
    document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-pressed', String(button.dataset.tab === tab)); });
    document.querySelectorAll('.detail-panel').forEach(panel => { panel.hidden = panel.id !== `tab-${tab}`; });
    if (tab === 'library' && !libraryLoaded) run(null, ctx => loadGames(ctx));
    if (tab === 'inventory' && !inventoryLoaded) run(null, ctx => loadInventory(ctx));
    if (tab === 'free' && !freeLoaded) run(null, ctx => loadFree(ctx));
    if (tab === 'rust') run(null, ctx => loadRust(ctx));
  }
  async function loadRust(ctx) {
    const revision = ++rustRevision;
    const session = await ctx.api('rust-session');
    if (!ctx.valid() || revision !== rustRevision) return;
    rustSessionView = session;
    const active = !['closed', 'error'].includes(session.state);
    $('#rust-state').textContent = rustStates[session.state] || tr('正在连接');
    $('#rust-state').className = `badge ${session.state === 'entered_game' ? 'online' : session.state === 'error' ? 'error' : active ? 'connecting' : ''}`;
    renderRustControls();
    if (!$('#rust-host').value && session.host) { $('#rust-host').value = session.host; $('#rust-port').value = session.port; }
    $('#rust-target').textContent = session.host ? `${session.host}:${session.port}${session.startedAt ? tr` · 开始于 ${date(session.startedAt)}` : ''}` : tr('尚未建立服务器连接。');
    const metadata = session.metadata || {};
    const progress = [];
    if (session.startedAt) {
      if (!active) progress.push(tr('连接已结束，以下为历史记录'));
      progress.push(tr`已接收 ${Number(metadata.receivedPackets || 0).toLocaleString(locale)} 条消息`, tr`运行 ${Math.floor(metadata.elapsedSeconds || 0)} 秒`);
      if (metadata.finishLoadingObserved) progress.push(tr('已观察到入服完成'));
      else if (metadata.selfEntityObserved) progress.push(tr('已确认本账号玩家实体'));
      const ownState = metadata.ownPlayerState;
      if (ownState?.observed === true) {
        const lifeState = { alive: tr('存活'), dead: tr('死亡'), unknown: tr('未知') }[ownState.lifeState] || tr('未知');
        const age = typeof ownState.ageSeconds === 'number' && Number.isFinite(ownState.ageSeconds) && ownState.ageSeconds >= 0
          ? tr`${ownState.ageSeconds.toLocaleString(locale, { maximumFractionDigits: 1 })} 秒` : tr('未知');
        progress.push(tr`最近角色快照：${lifeState}（采样时快照年龄 ${age}）`);
      } else progress.push(tr('尚未观察到角色快照'));
      if (metadata.tickWakeEnabled) {
        const wakeLabels = { waiting_state: tr('等待可用角色状态'), waiting_finish_loading: tr('等待入服完成'),
          unsupported_state: tr('当前角色状态不支持唤醒'), unsequenced_state: tr('等待有序角色快照'),
          stale_state: tr('等待新的角色快照'), sending: tr('正在发送唤醒输入'),
          awaiting_confirmation: tr('按键已释放，等待唤醒确认'), already_awake: tr('角色已经清醒'),
          awake_observed: tr('已观察到清醒快照'), unconfirmed: tr('尚未确认唤醒'),
          interrupted: tr('唤醒已中止'), send_failed: tr('唤醒输入发送失败') };
        progress.push(tr`唤醒：${wakeLabels[metadata.wakeState] || tr('等待状态')}`);
      }
    }
    $('#rust-progress').textContent = progress.join(' · ');
    $('#rust-error').textContent = typeof session.lastError === 'string' ? tr(session.lastError) : '';
  }
  function renderRustControls() {
    const active = rustSessionView && !['closed', 'error'].includes(rustSessionView.state);
    $('#rust-connect').disabled = rustPending || !rustSessionView || active || latest?.state !== 'online';
    $('#rust-disconnect').disabled = rustPending || !active || rustSessionView?.state === 'stopping';
    $('#rust-host').disabled = rustPending || !rustSessionView || active;
    $('#rust-port').disabled = rustPending || !rustSessionView || active;
    $('#rust-respawn-on-dead').disabled = rustPending || !rustSessionView || active;
    $('#rust-wake-on-connect').disabled = rustPending || !rustSessionView || active;
    // Active settings come from the running session. Closed-session refreshes
    // leave the user's next connection choice intact.
    if (active && typeof rustSessionView.metadata?.respawnOnDeadEnabled === 'boolean') {
      $('#rust-respawn-on-dead').checked = rustSessionView.metadata.respawnOnDeadEnabled;
    }
    if (active && typeof rustSessionView.metadata?.tickWakeEnabled === 'boolean') {
      $('#rust-wake-on-connect').checked = rustSessionView.metadata.tickWakeEnabled;
    }
  }
  async function rustAction(operation) {
    if (!currentId || rustPending || !rustSessionView) return;
    const ctx = context();
    rustPending = true; ++rustRevision; renderRustControls();
    try { await operation(ctx); }
    catch (error) { if (ctx.valid()) notice(error.message || tr('Rust 连接操作失败。'), true); }
    finally {
      if (ctx.valid()) {
        try { await loadRust(ctx); } catch (error) { if (ctx.valid()) notice(error.message, true); }
        if (!ctx.valid()) return;
        rustPending = false; renderRustControls();
      }
    }
  }
  function renderGames() {
    const term = $('#library-search').value.trim().toLowerCase();
    const filtered = games.filter(game => game.name.toLowerCase().includes(term) || String(game.appId).includes(term));
    $('#library-list').replaceChildren(...filtered.slice(0, gameLimit).map(game => {
      const row = node('article', 'game-row');
      if (game.iconUrl) row.append(image(game.iconUrl, 'game-icon', ''));
      const title = node('div', 'grow');
      title.append(node('h3', '', game.name), node('p', 'muted', tr`AppID ${game.appId} · 总计 ${(game.playtimeMinutes / 60).toFixed(1)} 小时 · 近两周 ${(game.recentMinutes / 60).toFixed(1)} 小时`));
      row.append(title);
      action(row, tr('挂机此游戏'), async ctx => {
        await ctx.api('idle', 'POST', { appIds: [game.appId] });
        if (!ctx.valid()) return;
        $('#idle-apps').value = String(game.appId); selectTab('idle');
        notice(tr`已为 ${game.name} 提交挂机状态。`); await refresh(); await changed();
      });
      return row;
    }));
    $('#library-more').hidden = filtered.length <= gameLimit;
    if (games.length && !filtered.length) $('#library-list').append(node('p', 'muted', tr('没有匹配的游戏。')));
  }
  async function loadGames(ctx, force = false) {
    const revision = ++libraryRevision;
    $('#library-message').textContent = tr('正在读取游戏库…');
    try {
      const data = await ctx.api(`games${force ? '?refresh=1' : ''}`);
      if (!ctx.valid() || revision !== libraryRevision) return;
      games = data.games; libraryLoaded = true; gameLimit = 100;
      $('#library-count').textContent = tr`共 ${data.total} 个游戏 · 数据更新于 ${date(data.fetchedAt)}`;
      $('#library-message').textContent = games.length ? '' : tr('没有读取到可见游戏。游戏隐私设置、免费游戏是否玩过等因素可能影响列表。');
      renderGames();
    } catch (error) {
      if (ctx.valid() && revision === libraryRevision) $('#library-message').textContent = error.message;
      throw error;
    }
  }
  function inventoryNodes(items) {
    return items.map(item => {
      const card = node('article', 'inventory-item');
      if (item.iconUrl) card.append(image(item.iconUrl, 'item-image', item.name));
      card.append(node('h3', '', item.name), node('p', 'muted', tr`${item.type} · 数量 ${item.amount}`));
      const badges = node('div', 'item-tags');
      badges.append(node('span', 'badge', item.tradable ? tr('可交易') : tr('不可交易')), node('span', 'badge', item.marketable ? tr('可上架市场') : tr('不可上架市场')));
      card.append(badges, node('p', 'field-help', tr`物品 ID ${item.assetId}`));
      if (item.descriptions.length) { const detail = node('details'); detail.append(node('summary', '', tr('物品说明')), ...item.descriptions.map(text => node('p', 'field-help', text))); card.append(detail); }
      return card;
    });
  }
  async function loadInventory(ctx, more = false, force = false) {
    const revision = ++inventoryRevision;
    const source = more ? inventorySource : { appId: Number($('#inventory-app').value), contextId: $('#inventory-context').value.trim() };
    const params = new URLSearchParams({ ...source, refresh: force ? '1' : '0', ...(more ? { startAssetId: inventoryCursor } : {}) });
    $('#inventory-message').textContent = tr('正在读取库存…');
    try {
      const data = await ctx.api(`inventory?${params}`);
      if (!ctx.valid() || revision !== inventoryRevision) return;
      inventoryLoaded = true; inventorySource = source; inventoryCursor = data.nextAssetId;
      if (!more) $('#inventory-list').replaceChildren();
      $('#inventory-list').append(...inventoryNodes(data.items));
      $('#inventory-more').hidden = !data.more;
      $('#inventory-message').textContent = tr`库存共 ${data.total} 件，已加载 ${$('#inventory-list').children.length} 件。`;
    } catch (error) {
      if (ctx.valid() && revision === inventoryRevision) { $('#inventory-message').textContent = error.message; if (!more) { $('#inventory-list').replaceChildren(); $('#inventory-more').hidden = true; } }
      throw error;
    }
  }
  async function claim(ctx, body) {
    const result = await ctx.api('free-license', 'POST', body);
    if (!ctx.valid()) return;
    libraryLoaded = false;
    notice(result.message, ['not_granted', 'failed'].includes(result.status));
    await refresh();
  }
  async function loadFree(ctx, more = false) {
    const revision = ++freeRevision;
    $('#free-message').textContent = tr('正在从 Steam 商店读取免费游戏…');
    try {
      const params = new URLSearchParams({ term: freeTerm, start: more ? freeNext : 0 });
      const data = await request(`/v1/free-games?${params}`);
      if (!ctx.valid() || revision !== freeRevision) return;
      freeLoaded = true; freeNext = data.nextStart;
      if (!more) $('#free-list').replaceChildren();
      $('#free-list').append(...data.games.map(game => {
        const card = node('article', 'catalog-item');
        if (game.imageUrl) card.append(image(game.imageUrl, 'catalog-image', ''));
        card.append(node('h3', '', game.name), node('p', 'muted', `AppID ${game.appId}${game.discount ? ` · ${game.discount}` : ''}`));
        const actions = node('div', 'toolbar');
        action(actions, tr('免费入库'), ctx => claim(ctx, { appIds: [game.appId] }), 'primary');
        const link = node('a', 'external-link', tr('商店 ↗')); link.href = game.storeUrl; link.target = '_blank'; link.rel = 'noreferrer noopener'; actions.append(link); card.append(actions);
        return card;
      }));
      $('#free-message').textContent = data.games.length ? tr`Steam 商店共返回 ${data.total} 个结果，按当前地区及商店规则显示。` : tr('没有找到匹配的免费游戏。');
      $('#free-more').hidden = data.nextStart === null;
    } catch (error) {
      if (ctx.valid() && revision === freeRevision) { $('#free-message').textContent = error.message; if (!more) { $('#free-list').replaceChildren(); $('#free-more').hidden = true; } }
      throw error;
    }
  }
  function close(clear = false) {
    currentId = null; generation++; busy = false;
    $('#account-detail').hidden = true; $('#dashboard').classList.remove('show-details');
    if (clear) { $('#profile-fields').replaceChildren(); $('#inventory-list').replaceChildren(); $('#library-list').replaceChildren(); $('#free-list').replaceChildren(); $('#detail-avatar').removeAttribute('src'); $('#detail-name').textContent = tr('账号详情'); $('#detail-identity').textContent = ''; $('#claim-history').replaceChildren(); }
  }
  async function open(id) {
    generation++; currentId = id; busy = false; latest = null;
    for (const button of buttonOperations.keys()) button.disabled = false;
    buttonOperations.clear();
    games = []; libraryLoaded = false; inventoryLoaded = false; freeLoaded = false;
    $('#library-list').replaceChildren(); $('#inventory-list').replaceChildren(); $('#free-list').replaceChildren();
    $('#library-search').value = ''; $('#idle-apps').value = ''; $('#free-search').value = ''; freeTerm = '';
    $('#rust-host').value = ''; $('#rust-port').value = '28015';
    $('#rust-respawn-on-dead').checked = false;
    $('#rust-wake-on-connect').checked = false;
    rustRevision++; rustPending = false; rustSessionView = null;
    $('#rust-state').textContent = tr('正在读取'); $('#rust-state').className = 'badge';
    $('#rust-target').textContent = ''; $('#rust-progress').textContent = ''; $('#rust-error').textContent = '';
    renderRustControls();
    $('#inventory-more').hidden = true; $('#library-more').hidden = true; $('#free-more').hidden = true;
    $('#detail-name').textContent = tr('正在读取账号…'); $('#profile-fields').replaceChildren();
    $('#dashboard').classList.add('show-details'); $('#account-detail').hidden = false;
    selectTab('profile'); await refresh();
    if (latest) $('#idle-apps').value = latest.idle.appIds.join(', ');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#detail-back').addEventListener('click', () => close());
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  $('#profile-refresh').addEventListener('click', event => run(event.currentTarget, async ctx => { await ctx.api('profile-refresh', 'POST', {}); if (ctx.valid()) { notice(tr('账号资料已刷新。')); await refresh(); } }));
  $('#web-refresh').addEventListener('click', event => run(event.currentTarget, async ctx => { await ctx.api('web-refresh', 'POST', {}); if (ctx.valid()) notice(tr('已请求刷新 Steam 网页会话，请稍后重试库存。')); }));
  $('#library-refresh').addEventListener('click', event => run(event.currentTarget, ctx => loadGames(ctx, true)));
  $('#library-search').addEventListener('input', () => { gameLimit = 100; renderGames(); });
  $('#library-more').addEventListener('click', () => { gameLimit += 100; renderGames(); });
  $('#inventory-preset').addEventListener('change', event => {
    if (event.target.value === 'custom') return;
    const [appId, contextId] = event.target.value.split('/'); $('#inventory-app').value = appId; $('#inventory-context').value = contextId;
  });
  $('#inventory-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, ctx => loadInventory(ctx, false, true)); });
  $('#inventory-more').addEventListener('click', event => run(event.currentTarget, ctx => loadInventory(ctx, true)));
  $('#free-search-form').addEventListener('submit', event => { event.preventDefault(); freeTerm = $('#free-search').value.trim(); run(event.submitter, ctx => loadFree(ctx)); });
  $('#free-more').addEventListener('click', event => run(event.currentTarget, ctx => loadFree(ctx, true)));
  $('#free-claim-form').addEventListener('submit', event => { event.preventDefault(); const id = Number($('#free-id').value); run(event.submitter, ctx => claim(ctx, $('#free-kind').value === 'package' ? { packageId: id } : { appIds: [id] })); });
  $('#idle-form').addEventListener('submit', event => {
    event.preventDefault();
    const values = $('#idle-apps').value.trim().split(/[,，\s]+/);
    if (!values.length || values.some(value => !/^\d+$/.test(value))) { notice(tr('请输入有效的数字 AppID，用逗号或空格分隔。'), true); return; }
    run(event.submitter, async ctx => { await ctx.api('idle', 'POST', { appIds: values.map(Number) }); if (ctx.valid()) { notice(tr('已保存并提交游戏挂机配置。')); await refresh(); await changed(); } });
  });
  $('#idle-stop').addEventListener('click', event => run(event.currentTarget, async ctx => { await ctx.api('idle', 'POST', { appIds: [] }); if (ctx.valid()) { notice(tr('已停止该账号的游戏挂机。')); await refresh(); await changed(); } }));
  $('#rust-form').addEventListener('submit', event => {
    event.preventDefault();
    rustAction(async ctx => {
      await ctx.api('rust-session', 'POST', { host: $('#rust-host').value.trim(), port: Number($('#rust-port').value), respawnOnDead: $('#rust-respawn-on-dead').checked === true,
        ...($('#rust-wake-on-connect').checked ? { wakeOnConnect: true } : {}) });
      if (ctx.valid()) notice(tr('已开始连接 Rust 服务器。'));
    });
  });
  $('#rust-disconnect').addEventListener('click', () => rustAction(async ctx => {
    await ctx.api('rust-session', 'DELETE');
    if (ctx.valid()) notice(tr('正在断开 Rust 服务器连接。'));
  }));
  return { open, close, refresh, sync(accounts) { if (!currentId) return; if (!accounts.some(account => account.id === currentId)) close(true); else refresh(); } };
}
