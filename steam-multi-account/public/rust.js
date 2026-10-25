const $ = selector => document.querySelector(selector);
const steamStates = { offline: '已退出', connecting: '正在登录', guard_required: '需要验证', online: '在线', reconnecting: '正在重连', error: '登录失败' };
const rustStates = { closed: '未连接', idle: '未连接', stopped: '已断开', connecting: '正在连接', receiving_world: '接收世界', player_initialized: '玩家已初始化', entered_game: '已入服', stopping: '正在断开', error: '连接结束', failed: '连接失败' };
const jobKinds = { import: '导入并登录', login: '批量登录 Steam', connect: '批量连接服务器', disconnect: '批量断开连接' };
const resultLabels = { success: '成功', succeeded: '成功', failed: '失败', error: '失败', skipped: '已跳过', started: '已发起', pending: '等待', queued: '等待', running: '处理中', completed: '完成', connected: '已连接', disconnected: '已断开' };
let apiKey = '', overview = { accounts: [], servers: [], jobs: [], counts: {} };
let refreshing = false, requesting = false, viewVersion = 0, serverFilter = null;
let logAccount = null, logRevision = 0, loadingLogs = false;
let chatAccount = null, chatSending = false;
const selected = new Set(), expandedJobs = new Map(), receivedJobs = new Map();
const accountRows = new Map(), serverCards = new Map();
let emptyServers = null;

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
function date(value) {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', { hour12: false }) : '时间未知';
}
function errorText(error) { return typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : ''; }
function notice(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').classList.toggle('error', error);
  $('#notice').hidden = !text;
}
function connected(account) { return account.rust?.connected === true; }
function active(account) { return !!account.rust && !['closed', 'idle', 'error', 'failed', 'stopped'].includes(account.rust.state); }
function connecting(account) { return active(account) && !connected(account) && account.rust.state !== 'stopping'; }
function endpoint(server) { return server?.host && server?.port ? `${server.host}:${server.port}` : ''; }
function sameServer(account, server) { return account.rust?.host === server.host && Number(account.rust?.port) === Number(server.port); }
function serverName(server) { return typeof server?.name === 'string' && server.name.trim() ? server.name : '服务器名称待获取'; }
function badge(text, style = '') { return element('span', `badge ${style}`, text); }
function button(text, className, action) {
  const result = element('button', `button ${className}`, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}
function syncChildren(parent, nodes) {
  // Leave matching nodes in place. Moving an existing input or button during
  // polling can interrupt a click and discard its keyboard focus.
  const keep = new Set(nodes);
  for (const child of [...parent.children]) if (!keep.has(child)) child.remove();
  let next = parent.firstElementChild;
  for (const node of nodes) {
    if (node === next) next = next.nextElementSibling;
    else parent.insertBefore(node, next);
  }
}

async function request(path, method = 'GET', body, token = apiKey) {
  let response;
  try {
    response = await fetch(path, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('无法连接本地服务，请确认服务正在运行。'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('服务返回了无法读取的结果，请稍后刷新。'); }
  if (!response.ok) {
    const error = new Error(result.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return result;
}
function setUnlocked(value) {
  $('#unlock-panel').hidden = value;
  $('#rust-dashboard').hidden = !value;
  $('#lock-button').hidden = !value;
  $('#import-shortcut').hidden = !value;
}
function lock() {
  ++viewVersion; apiKey = ''; requesting = false; selected.clear(); receivedJobs.clear(); expandedJobs.clear(); serverFilter = null;
  sessionStorage.removeItem('steam-api-key');
  $('#api-key').value = ''; $('#import-text').value = ''; updateImportCount();
  $('#target-respawn').checked = false;
  $('#target-wake').checked = false;
  overview = { accounts: [], servers: [], jobs: [], counts: {} };
  logAccount = null; ++logRevision;
  if ($('#logs-dialog').open) $('#logs-dialog').close();
  $('#logs-list').replaceChildren();
  chatAccount = null; chatSending = false; $('#chat-text').value = '';
  if ($('#chat-dialog').open) $('#chat-dialog').close();
  accountRows.clear(); serverCards.clear();
  $('#account-rows').replaceChildren(); $('#server-groups').replaceChildren();
  setUnlocked(false);
}
function handleError(error) {
  if (error.status === 401) lock();
  notice(error.status === 401 ? '访问密钥已失效，请重新连接。' : error.message || '操作失败，请稍后重试。', true);
}
async function unlock(value) {
  const candidate = value.trim();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error('请输入完整的 64 位访问密钥，或读取 data/api-key.txt 文件。');
  const version = ++viewVersion;
  const result = await request('/v1/rust/overview', 'GET', undefined, candidate);
  if (version !== viewVersion) return;
  apiKey = candidate; sessionStorage.setItem('steam-api-key', candidate);
  $('#api-key').value = ''; setUnlocked(true); notice('');
  render(result);
}
function filteredAccounts() {
  const term = $('#account-search').value.trim().toLowerCase(), filter = $('#account-filter').value;
  return overview.accounts.filter(account => {
    if (serverFilter && !sameServer(account, serverFilter)) return false;
    if (filter === 'connected' && !connected(account)) return false;
    if (filter === 'connecting' && !connecting(account)) return false;
    if (filter === 'not-connected' && connected(account)) return false;
    if (filter === 'steam-online' && account.steamState !== 'online') return false;
    if (filter === 'steam-offline' && account.steamState === 'online') return false;
    return !term || [account.accountName, account.nickname, account.rust?.serverName, endpoint(account.rust)].some(value => typeof value === 'string' && value.toLowerCase().includes(term));
  });
}
function updateControls() {
  const rows = filteredAccounts(), selectedVisible = rows.filter(account => selected.has(account.id)).length;
  $('#select-all').checked = rows.length > 0 && selectedVisible === rows.length;
  $('#select-all').indeterminate = selectedVisible > 0 && selectedVisible < rows.length;
  $('#select-all').disabled = rows.length === 0 || requesting;
  $('#selection-summary').textContent = `共 ${overview.accounts.length} 个账号 · 当前显示 ${rows.length} 个 · 已选择 ${selected.size} 个${selected.size > selectedVisible ? `（其中 ${selected.size - selectedVisible} 个在当前筛选之外）` : ''}`;
  for (const id of ['batch-login', 'batch-connect', 'batch-disconnect']) $('#' + id).disabled = requesting || selected.size === 0;
  $('#clear-selection').disabled = requesting || selected.size === 0;
  $('#import-submit').disabled = requesting;
  $('#server-filter').hidden = !serverFilter;
  $('#server-filter-name').textContent = serverFilter ? `服务器：${serverName(serverFilter)} · ${endpoint(serverFilter)}` : '';
  $('#chat-submit').disabled = chatSending || !chatAccount || !connected(overview.accounts.find(a => a.id === chatAccount.id) || {});
}
function renderServers() {
  const keys = new Set(overview.servers.map(endpoint));
  for (const [key, entry] of serverCards) if (!keys.has(key)) { entry.card.remove(); serverCards.delete(key); }
  const groups = overview.servers.map(server => {
    const key = endpoint(server);
    let entry = serverCards.get(key);
    if (!entry) {
      entry = { card: element('article', 'server-group'), title: element('h3'), address: element('p', 'server-endpoint'), connected: element('strong'), connecting: element('strong'), server };
      const counts = element('div', 'server-counts');
      for (const [value, label] of [[entry.connected, '已入服'], [entry.connecting, '连接中']]) {
        const item = element('span'); item.append(value, document.createTextNode(label)); counts.append(item);
      }
      const controls = element('div', 'toolbar');
      entry.show = button('查看账号', 'secondary small', () => { serverFilter = { ...entry.server }; renderServers(); renderAccounts(); });
      entry.choose = button('选择本组', 'secondary small', () => {
        selected.clear();
        for (const account of overview.accounts) if (sameServer(account, entry.server) && active(account)) selected.add(account.id);
        serverFilter = { ...entry.server }; $('#account-filter').value = 'all'; $('#account-search').value = '';
        renderServers(); renderAccounts(); $('#accounts-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      controls.append(entry.show, entry.choose);
      entry.card.append(entry.title, entry.address, counts, controls);
      serverCards.set(key, entry);
    }
    entry.server = server;
    entry.card.classList.toggle('selected', !!serverFilter && endpoint(serverFilter) === key);
    entry.title.textContent = serverName(server); entry.address.textContent = key;
    entry.connected.textContent = number(server.connectedAccounts); entry.connecting.textContent = number(server.connectingAccounts);
    entry.show.disabled = requesting; entry.choose.disabled = requesting;
    return entry.card;
  });
  if (!groups.length) {
    emptyServers ||= element('p', 'muted', '暂无服务器连接。选择账号并填写目标服务器后，即可开始连接。');
    groups.push(emptyServers);
  }
  syncChildren($('#server-groups'), groups);
}
function snapshotCell(account) {
  const cell = element('td'), own = account.rust?.metadata?.ownPlayerState;
  if (own?.observed !== true) { cell.append(element('span', 'cell-secondary', '尚未观察到快照')); return cell; }
  const state = ['alive', 'dead'].includes(own.lifeState) ? own.lifeState : 'unknown';
  const label = { alive: '存活', dead: '死亡', unknown: '状态未知' }[state];
  cell.append(element('span', `snapshot-state ${state}`, label));
  if (account.rust?.metadata?.tickWakeEnabled) {
    const wake = account.rust.metadata;
    const label = wake.wakeState === 'awake_observed' ? '已观察到唤醒'
      : wake.wakeState === 'already_awake' ? '原已清醒'
      : wake.wakeState === 'unconfirmed' ? '唤醒未确认'
      : wake.wakeState === 'interrupted' ? '唤醒已中止'
      : wake.wakeState === 'send_failed' ? '唤醒发送失败'
      : wake.wakeReleaseSent ? '等待唤醒确认' : '等待唤醒条件';
    cell.append(element('span', 'cell-secondary', label));
  }
  const age = typeof own.ageSeconds === 'number' && Number.isFinite(own.ageSeconds) && own.ageSeconds >= 0 ? `${own.ageSeconds.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 秒` : '未知';
  cell.append(element('span', 'cell-secondary', `采样时快照年龄 ${age}`));
  if (!active(account)) cell.append(element('span', 'cell-secondary', '历史快照 · 连接已结束'));
  else cell.append(element('span', 'cell-secondary', '最近收到的角色快照'));
  return cell;
}
function renderAccounts() {
  const ids = new Set(overview.accounts.map(account => account.id));
  for (const [id, entry] of accountRows) if (!ids.has(id)) { entry.row.remove(); accountRows.delete(id); }
  const rows = filteredAccounts().map(account => {
    let entry = accountRows.get(account.id);
    if (!entry) {
      entry = { row: element('tr'), checkbox: element('input'), name: element('td'), steam: element('td'), rust: element('td'), server: element('td'), snapshot: element('td'), account, signature: null };
      const selectCell = element('td', 'check-cell'), logs = element('td');
      entry.checkbox.type = 'checkbox';
      entry.checkbox.addEventListener('change', () => {
        if (entry.checkbox.checked) selected.add(entry.account.id); else selected.delete(entry.account.id);
        entry.row.classList.toggle('selected', entry.checkbox.checked); updateControls();
      });
      selectCell.append(entry.checkbox);
      logs.append(button('查看日志', 'secondary small', () => openLogs(entry.account)));
      entry.chat = button('发送聊天', 'secondary small', () => openChat(entry.account));
      logs.append(entry.chat);
      entry.row.append(selectCell, entry.name, entry.steam, entry.rust, entry.server, entry.snapshot, logs);
      accountRows.set(account.id, entry);
    }
    entry.account = account;
    entry.chat.disabled = requesting || chatSending || !connected(account);
    entry.row.classList.toggle('selected', selected.has(account.id));
    entry.checkbox.checked = selected.has(account.id); entry.checkbox.disabled = requesting;
    entry.checkbox.setAttribute('aria-label', `选择账号 ${account.accountName}`);
    const signature = JSON.stringify([account.accountName, account.nickname, account.steamState, account.hasSavedLogin,
      account.lastError, account.rust?.state, connected(account), account.rust?.elapsedSeconds,
      account.rust?.lastError, account.rust?.host, account.rust?.port, account.rust?.serverName, account.rust?.metadata?.ownPlayerState,
      account.rust?.metadata?.wakeState]);
    if (entry.signature !== signature) {
      entry.signature = signature;
      entry.name.replaceChildren(element('span', 'table-account-name', account.accountName || '账号名称未知'));
      if (account.nickname) entry.name.append(element('span', 'cell-secondary', account.nickname));
      entry.steam.replaceChildren(badge(steamStates[account.steamState] || '状态未知', account.steamState === 'online' ? 'online' : ['connecting', 'reconnecting'].includes(account.steamState) ? 'connecting' : ['error', 'guard_required'].includes(account.steamState) ? 'error' : ''));
      if (account.steamState === 'guard_required') entry.steam.append(element('span', 'cell-secondary', '本页不提交验证码；批量任务将跳过'));
      else if (account.steamState !== 'online' && !account.hasSavedLogin) entry.steam.append(element('span', 'cell-secondary', '需用密码导入登录'));
      entry.rust.replaceChildren(badge(rustStates[account.rust?.state] || '未连接', connected(account) ? 'online' : connecting(account) ? 'connecting' : account.rust?.state === 'error' ? 'error' : ''));
      if (active(account)) entry.rust.append(element('span', 'cell-secondary', `本次运行 ${Math.floor(number(account.rust?.elapsedSeconds))} 秒`));
      const failure = errorText(account.rust?.lastError) || errorText(account.lastError);
      if (failure) entry.rust.append(element('span', 'cell-secondary cell-error', failure));
      entry.server.replaceChildren();
      if (endpoint(account.rust)) {
        entry.server.append(element('span', 'table-server-name', account.rust.serverName || '服务器名称待获取'), element('span', 'cell-secondary', endpoint(account.rust)));
        if (!active(account)) entry.server.append(element('span', 'cell-secondary', '上次连接目标'));
      } else entry.server.append(element('span', 'cell-secondary', '尚未连接服务器'));
      entry.snapshot.replaceChildren(...snapshotCell(account).childNodes);
    }
    return entry.row;
  });
  syncChildren($('#account-rows'), rows);
  $('#accounts-empty').hidden = rows.length > 0;
  $('#accounts-empty').textContent = overview.accounts.length ? '没有符合当前筛选条件的账号。' : '还没有账号。可在下方批量导入，或前往 Steam 账号页面添加。';
  updateControls();
}
function mergedJobs() {
  const entries = new Map(receivedJobs);
  for (const job of overview.jobs) { if (job?.id) entries.set(job.id, job); }
  return [...entries.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 15);
}
function runningJob(job) { return ['pending', 'queued', 'running', 'processing'].includes(job.state); }
function renderJobs() {
  const jobs = mergedJobs(), running = jobs.filter(runningJob).length;
  $('#jobs-running').textContent = running ? `${running} 个任务进行中` : '等待新任务';
  $('#job-list').replaceChildren(...jobs.map(job => {
    const details = element('details', 'job-entry');
    details.open = expandedJobs.has(job.id) ? expandedJobs.get(job.id) : runningJob(job);
    details.addEventListener('toggle', () => expandedJobs.set(job.id, details.open));
    const summary = element('summary'), complete = number(job.completed), total = number(job.total);
    const status = runningJob(job) ? '处理中' : job.state === 'failed' ? '任务失败' : job.state === 'cancelled' ? '已取消' : '已完成';
    summary.append(element('span', 'job-title', jobKinds[job.kind] || '批量任务'), badge(status, runningJob(job) ? 'connecting' : job.state === 'failed' ? 'error' : job.state === 'cancelled' ? '' : 'online'), element('span', 'job-count', `${complete} / ${total} 个已处理`), element('span', 'job-time', date(job.createdAt)));
    const progress = element('div', 'job-progress'), fill = element('span');
    fill.style.width = `${total > 0 ? Math.min(100, complete / total * 100) : 0}%`; progress.append(fill);
    const results = element('ul', 'job-results');
    for (const result of Array.isArray(job.results) ? job.results : []) {
      const item = element('li');
      const statusClass = ['success', 'succeeded', 'completed', 'connected', 'disconnected'].includes(result.status) ? 'result-success' : ['failed', 'error'].includes(result.status) ? 'result-failed' : result.status === 'skipped' ? 'result-skipped' : result.status === 'started' ? 'result-started' : '';
      item.append(element('span', 'job-account', result.accountName || '账号'), element('span', statusClass, resultLabels[result.status] || '处理中'), element('span', 'job-message', typeof result.message === 'string' ? result.message : ''));
      results.append(item);
    }
    if (!results.children.length) results.append(element('li', 'job-message', runningJob(job) ? '任务已排队，等待处理结果。' : '本次任务没有账号处理记录。'));
    details.append(summary, progress, results); return details;
  }));
  if (!jobs.length) $('#job-list').append(element('p', 'muted', '批量操作开始后，可在这里查看每个账号的处理结果。'));
}
function render(data) {
  overview = { accounts: Array.isArray(data.accounts) ? data.accounts : [], servers: Array.isArray(data.servers) ? data.servers : [], jobs: Array.isArray(data.jobs) ? data.jobs : [], counts: data.counts || {} };
  const ids = new Set(overview.accounts.map(account => account.id));
  for (const id of selected) if (!ids.has(id)) selected.delete(id);
  for (const job of overview.jobs) if (job?.id) receivedJobs.delete(job.id);
  $('#count-total').textContent = number(overview.counts.total);
  $('#count-steam').textContent = number(overview.counts.steamOnline);
  $('#count-connected').textContent = number(overview.counts.connected);
  $('#count-connecting').textContent = number(overview.counts.connecting);
  $('#sync-status').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  $('#sync-status').classList.remove('error');
  renderServers(); renderAccounts(); renderJobs();
}
async function refresh() {
  if (!apiKey || refreshing) return;
  refreshing = true; const version = viewVersion;
  try {
    const result = await request('/v1/rust/overview');
    if (version === viewVersion && apiKey) render(result);
  } catch (error) {
    if (version !== viewVersion) return;
    $('#sync-status').textContent = '读取失败 · 保留上次状态'; $('#sync-status').classList.add('error');
    handleError(error);
  } finally { refreshing = false; }
}
function readTarget() {
  const host = $('#target-host').value.trim(), port = Number($('#target-port').value), queryText = $('#target-query-port').value.trim();
  const octets = host.split('.');
  if (octets.length !== 4 || octets.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) throw new Error('请输入有效的服务器 IPv4 地址。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('游戏端口应为 1 到 65535 的整数。');
  const target = { host, port };
  if (queryText) {
    const queryPort = Number(queryText);
    if (!Number.isInteger(queryPort) || queryPort < 1 || queryPort > 65535) throw new Error('查询端口应为 1 到 65535 的整数。');
    target.queryPort = queryPort;
  }
  return target;
}
async function submitAction(action) {
  if (!apiKey || requesting || !selected.size) return;
  if (selected.size > 200) { notice('每批最多处理 200 个账号，请调整所选范围。', true); return; }
  const payload = { action, accountIds: [...selected] };
  try {
    if (action === 'connect') { payload.target = readTarget(); payload.respawnOnDead = $('#target-respawn').checked === true;
      if ($('#target-wake').checked) payload.wakeOnConnect = true; }
  } catch (error) { notice(error.message, true); return; }
  await submitJob('/v1/rust/actions', payload, `${jobKinds[action]}任务已提交。`);
}
async function submitJob(path, payload, text) {
  const version = viewVersion; requesting = true; renderAccounts(); renderServers();
  try {
    const response = await request(path, 'POST', payload), job = response.job || response;
    if (version !== viewVersion || !apiKey) return;
    if (job?.id) { receivedJobs.set(job.id, job); expandedJobs.set(job.id, true); renderJobs(); }
    notice(text); await refresh();
  } catch (error) { if (version === viewVersion) handleError(error); }
  finally { if (version === viewVersion) { requesting = false; renderAccounts(); renderServers(); } }
}
function updateImportCount() {
  const count = $('#import-text').value.split(/\r?\n/).filter(line => line.trim()).length;
  $('#import-count').textContent = count ? `待处理 ${count} 行` : '尚未输入账号';
}
async function loadLogs() {
  if (!apiKey || !logAccount) return;
  const account = logAccount, revision = ++logRevision, version = viewVersion; loadingLogs = true;
  $('#logs-status').textContent = '正在读取连接日志…'; $('#logs-refresh').disabled = true;
  try {
    const response = await request(`/v1/rust/accounts/${encodeURIComponent(account.id)}/logs`);
    if (revision !== logRevision || version !== viewVersion || logAccount?.id !== account.id) return;
    const logs = Array.isArray(response.logs) ? response.logs : [];
    $('#logs-list').replaceChildren(...logs.map(log => {
      const row = element('article', `log-entry ${['error', 'warn'].includes(log.level) ? log.level : ''}`), time = element('time', '', date(log.at)), content = element('div');
      if (typeof log.at === 'string') time.dateTime = log.at;
      if (log.event) content.append(element('p', 'log-event', { steam: 'Steam 登录', rust: 'Rust 连接', life_state: '角色快照', operation: '操作记录' }[log.event] || '连接进度'));
      content.append(element('p', '', typeof log.message === 'string' ? log.message : ''));
      row.append(time, content); return row;
    }));
    if (!logs.length) $('#logs-list').append(element('p', 'compact-empty', '这个账号尚无连接日志。'));
    $('#logs-status').textContent = `共 ${logs.length} 条记录 · 更新于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  } catch (error) {
    if (revision !== logRevision || version !== viewVersion) return;
    $('#logs-status').textContent = error.message || '日志读取失败，请稍后重试。';
    if (error.status === 401) handleError(error);
  } finally { if (revision === logRevision) { loadingLogs = false; $('#logs-refresh').disabled = false; } }
}
function openLogs(account) {
  logAccount = { id: account.id, accountName: account.accountName };
  $('#logs-title').textContent = `${account.accountName} 的连接日志`;
  $('#logs-list').replaceChildren(); $('#logs-dialog').showModal(); void loadLogs();
}

function openChat(account) {
  if (!connected(account) || chatSending) return;
  chatAccount = { id: account.id, accountName: account.accountName };
  $('#chat-target').textContent = `${account.accountName} · ${endpoint(account.rust)}`;
  $('#chat-text').value = ''; $('#chat-status').textContent = '每次发送一条，间隔至少 5 秒。';
  updateControls(); $('#chat-dialog').showModal(); $('#chat-text').focus();
}
$('#chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!apiKey || !chatAccount || chatSending) return;
  const version = viewVersion, account = chatAccount, text = $('#chat-text').value;
  chatSending = true; updateControls(); $('#chat-status').textContent = '正在发送…';
  try {
    await request(`/v1/accounts/${encodeURIComponent(account.id)}/rust-chat`, 'POST', { text });
    if (version !== viewVersion || chatAccount?.id !== account.id) return;
    $('#chat-text').value = '';
    $('#chat-status').textContent = '消息已发出，尚未确认服务器接收。请在游戏内核对。';
  } catch (error) {
    if (version !== viewVersion || chatAccount?.id !== account.id) return;
    $('#chat-status').textContent = error.message;
    if (error.status === 401) handleError(error);
  } finally { if (version === viewVersion) { chatSending = false; renderAccounts(); } }
});
$('#chat-close').addEventListener('click', () => $('#chat-dialog').close());
$('#chat-dialog').addEventListener('close', () => { chatAccount = null; $('#chat-text').value = ''; });

$('#unlock-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { await unlock($('#api-key').value); } catch (error) { handleError(error); }
  finally { submit.disabled = false; }
});
$('#key-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 1024) throw new Error('请选择项目 data/api-key.txt 文件。'); await unlock(await file.text()); }
  catch (error) { handleError(error); } finally { event.target.value = ''; }
});
$('#lock-button').addEventListener('click', () => { lock(); notice('页面已锁定，服务中的连接继续运行。'); });
$('#refresh-button').addEventListener('click', refresh);
$('#account-search').addEventListener('input', renderAccounts);
$('#account-filter').addEventListener('change', renderAccounts);
$('#clear-server-filter').addEventListener('click', () => { serverFilter = null; renderServers(); renderAccounts(); });
$('#clear-selection').addEventListener('click', () => { selected.clear(); renderAccounts(); });
$('#select-all').addEventListener('change', event => { for (const account of filteredAccounts()) { if (event.target.checked) selected.add(account.id); else selected.delete(account.id); } renderAccounts(); });
$('#batch-login').addEventListener('click', () => submitAction('login'));
$('#batch-disconnect').addEventListener('click', () => submitAction('disconnect'));
$('#connect-form').addEventListener('submit', event => { event.preventDefault(); void submitAction('connect'); });
$('#import-text').addEventListener('input', updateImportCount);
$('#import-form').addEventListener('submit', event => {
  event.preventDefault(); if (!apiKey || requesting) return;
  const text = $('#import-text').value;
  if (!text.trim()) { notice('请先输入账号与密码，每行一个账号。', true); return; }
  if (text.split(/\r?\n/).filter(line => line.trim()).length > 200) { notice('每批最多导入 200 个账号，请减少输入行数。', true); return; }
  if (new TextEncoder().encode(JSON.stringify({ text })).byteLength > 128 * 1024) { notice('本批输入超过 128 KiB，请分批导入。', true); return; }
  $('#import-text').value = ''; updateImportCount();
  void submitJob('/v1/rust/import', { text }, '导入任务已提交。需要验证的账号将跳过，请查看任务结果。');
});
$('#logs-close').addEventListener('click', () => $('#logs-dialog').close());
$('#logs-dialog').addEventListener('close', () => { logAccount = null; ++logRevision; loadingLogs = false; });
$('#logs-dialog').addEventListener('click', event => {
  if (event.target !== $('#logs-dialog')) return;
  const box = $('#logs-dialog').getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('#logs-dialog').close();
});
$('#logs-refresh').addEventListener('click', () => { if (!loadingLogs) void loadLogs(); });
setInterval(() => { void refresh(); }, 2500);
const fragment = new URLSearchParams(location.hash.slice(1)), suppliedKey = fragment.get('key');
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
const savedKey = suppliedKey || sessionStorage.getItem('steam-api-key');
if (savedKey) unlock(savedKey).catch(error => { lock(); handleError(error); });
