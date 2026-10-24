import { createAccountDetails } from './details.js';

const $ = selector => document.querySelector(selector);
let apiKey = '';
let refreshing = false;
let knownAccounts = [], editingAccountId = null;
const cards = new Map();
const accountDetails = createAccountDetails({ request, notice, changed: () => refresh() });
const stateNames = { offline: '已退出', connecting: '正在登录', guard_required: '等待验证', online: '在线', reconnecting: '正在重连', error: '连接失败' };
const messages = {
  'A valid Bearer API key is required.': '访问密钥不正确，请重新连接。',
  'This account already has a connection or pending login; logout first.': '这个账号已有连接或正在登录，请先退出该账号。',
  'This Steam account is already registered under another id.': '这个 Steam 账号已经添加，请刷新账号列表后重新登录。',
  'No saved login; provide accountName and password.': '没有可用的登录令牌，请使用账号密码重新登录。',
  'This id belongs to a different account; use a new id or delete the old one.': '账号记录发生冲突，请刷新账号列表后重试。',
  'No pending Steam Guard request.': '当前没有等待提交的验证码，请刷新账号状态。',
  'InvalidPassword': '账号名或密码不正确，请重新登录。',
  'AccountDisabled': 'Steam 账号已被停用。',
  'RateLimitExceeded': 'Steam 暂时限制了请求，请稍后再试。',
  'LogonSessionReplaced': '这个账号的连接被另一次登录替换，请重新连接。',
  'AccessDenied': '登录授权已失效，请用密码重新登录。',
  'Expired': '登录令牌已过期，请用密码重新登录。',
  'Invalid Steam account name.': '请输入 Steam 登录账号名，仅支持字母、数字和下划线。',
};
function message(error) { return messages[error.message] || error.message || '操作失败，请稍后重试。'; }
function notice(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').classList.toggle('error', error);
  $('#notice').hidden = !text;
}
async function request(path, method = 'GET', body, token = apiKey) {
  let response;
  try {
    response = await fetch(path, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('无法连接本地服务，请确认 start.cmd 正在运行。'); }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
function setUnlocked(unlocked) {
  $('#unlock-panel').hidden = unlocked;
  $('#dashboard').hidden = !unlocked;
  $('#lock-button').hidden = !unlocked;
}
function lock() {
  accountDetails.close(true);
  apiKey = '';
  sessionStorage.removeItem('steam-api-key');
  $('#account-password').value = '';
  $('#api-key').value = '';
  $('#account-list').replaceChildren();
  cards.clear();
  setUnlocked(false);
}
async function unlock(value) {
  const candidate = value.trim();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error('请输入完整的 64 位访问密钥，或选择 data/api-key.txt 文件。');
  const result = await request('/v1/accounts', 'GET', undefined, candidate);
  apiKey = candidate;
  sessionStorage.setItem('steam-api-key', apiKey);
  $('#api-key').value = '';
  setUnlocked(true);
  notice('');
  render(result.accounts);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function addAction(parent, label, className, action) {
  const button = element('button', `button small ${className}`, label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await action(); await refresh(); }
    catch (error) { notice(message(error), true); }
    finally { button.disabled = false; }
  });
  parent.append(button);
}
function resetLoginForm() {
  $('#login-form').reset();
  editingAccountId = null;
  $('#account-name').readOnly = false;
  $('#login-title').textContent = '添加账号';
  $('#reset-form').hidden = true;
}
function editLogin(account) {
  editingAccountId = account.id;
  $('#account-name').value = account.accountName;
  $('#account-name').readOnly = true;
  $('#account-password').value = '';
  $('#login-title').textContent = '重新登录';
  $('#reset-form').hidden = false;
  $('#account-password').focus();
}
function renderCard(account) {
  const card = element('article', 'account-card');
  const top = element('div', 'card-top');
  const identity = element('div');
  identity.append(element('h3', 'account-name', account.accountName));
  if (account.nickname) identity.append(element('div', 'account-meta', `昵称 · ${account.nickname}`));
  if (account.steamId) identity.append(element('div', 'account-meta', `Steam ID · ${account.steamId}`));
  top.append(identity, element('span', `badge ${account.state}`, stateNames[account.state] || account.state));
  card.append(top);
  if (account.lastError && account.state === 'error') {
    card.append(element('div', 'card-error', messages[account.lastError.code] || account.lastError.message));
  }
  if (account.state === 'guard_required') {
    const box = element('form', 'guard-box');
    const prompt = account.guard.type === 'email' ? `请输入发送到 ${account.guard.emailDomain} 邮箱的验证码。` : '请输入 Steam 手机令牌中显示的五位验证码。';
    box.append(element('p', '', prompt));
    const row = element('div', 'inline');
    const input = element('input');
    input.type = 'text'; input.maxLength = 5; input.pattern = '[A-Za-z0-9]{5}'; input.required = true;
    input.placeholder = 'ABCDE'; input.autocomplete = 'off'; input.setAttribute('aria-label', `${account.accountName} 的 Steam Guard 验证码`);
    const button = element('button', 'button primary', '提交验证码');
    button.type = 'submit';
    row.append(input, button); box.append(row);
    box.append(element('p', 'guard-hint'));
    box.addEventListener('submit', async event => {
      event.preventDefault(); button.disabled = true; box.dataset.submitting = 'true';
      try {
        await request(`/v1/accounts/${account.id}/guard`, 'POST', { code: input.value.trim().toUpperCase() });
        input.value = ''; notice('验证码已提交，正在等待 Steam 登录结果。'); await refresh();
      } catch (error) { notice(message(error), true); }
      finally { box.dataset.submitting = 'false'; updateCooldowns(); }
    });
    card.append(box);
  }
  const actions = element('div', 'card-actions');
  addAction(actions, '账号详情', 'primary', async () => accountDetails.open(account.id));
  const active = !['offline', 'error'].includes(account.state);
  if (active) {
    addAction(actions, '退出连接', 'secondary', async () => {
      await request(`/v1/accounts/${account.id}/logout`, 'POST', {}); notice('该账号已退出，其他账号会继续保持连接。');
    });
  } else {
    if (account.hasSavedLogin) addAction(actions, '恢复连接', 'secondary', async () => {
      await request(`/v1/accounts/${account.id}/login`, 'POST', {}); notice('正在使用已保存的令牌恢复连接。');
    });
    addAction(actions, '密码登录', 'secondary', async () => editLogin(account));
  }
  addAction(actions, '删除账号', 'danger', async () => {
    if (!confirm(`删除 ${account.accountName}？这会断开连接，并删除本服务保存的登录令牌。`)) return;
    await request(`/v1/accounts/${account.id}`, 'DELETE'); notice('已删除本服务中保存的账号资料。');
    if (editingAccountId === account.id) resetLoginForm();
  });
  card.append(actions);
  if (account.state === 'reconnecting') card.append(element('p', 'card-note', '连接暂时中断，服务会自动尝试重连。'));
  else card.append(element('p', 'card-note', account.idle?.enabled ? `挂机 AppID：${account.idle.appIds.join(', ')}${account.idle.status === 'paused_other_session' ? ' · 其他位置游戏中，已暂停' : ''}` : account.autoConnect && account.hasSavedLogin ? '已保存登录令牌 · 服务重启后自动恢复' : ''));
  return card;
}
function render(accounts) {
  knownAccounts = accounts;
  $('#total-count').textContent = accounts.length;
  $('#online-count').textContent = accounts.filter(account => account.state === 'online').length;
  $('#pending-count').textContent = accounts.filter(account => ['connecting', 'reconnecting', 'guard_required'].includes(account.state)).length;
  $('#empty-state').hidden = accounts.length > 0;
  const remaining = new Set(accounts.map(account => account.id));
  for (const [id, entry] of cards) {
    if (!remaining.has(id)) { entry.node.remove(); cards.delete(id); }
  }
  for (const account of accounts) {
    // Polling must not erase a code the user is typing.
    const signature = JSON.stringify({ ...account, changedAt: undefined, guard: account.guard ? { ...account.guard, retryAfterSeconds: undefined } : null });
    let entry = cards.get(account.id);
    if (!entry || entry.signature !== signature) {
      const node = renderCard(account);
      if (entry) entry.node.replaceWith(node); else $('#account-list').append(node);
      entry = { node, signature }; cards.set(account.id, entry);
    }
    if (account.guard) entry.notBefore = Date.now() + account.guard.retryAfterSeconds * 1000;
  }
  updateCooldowns();
  $('#service-indicator').textContent = '● 服务已连接';
  $('#service-indicator').classList.remove('status-down');
  $('#updated-at').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  accountDetails.sync(accounts);
}
function updateCooldowns() {
  for (const entry of cards.values()) {
    const form = entry.node.querySelector('.guard-box');
    if (!form) continue;
    const remaining = Math.max(0, Math.ceil(((entry.notBefore || 0) - Date.now()) / 1000));
    form.querySelector('button').disabled = remaining > 0 || form.dataset.submitting === 'true';
    form.querySelector('.guard-hint').textContent = remaining > 0 ? `上一次验证码错误，请等待 ${remaining} 秒后获取新验证码。` : '';
  }
}
async function refresh() {
  if (!apiKey || refreshing) return;
  refreshing = true;
  try { render((await request('/v1/accounts')).accounts); }
  catch (error) {
    if (error.status === 401) lock();
    $('#service-indicator').textContent = '● 服务未连接';
    $('#service-indicator').classList.add('status-down');
    notice(message(error), true);
  } finally { refreshing = false; }
}
$('#unlock-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await unlock($('#api-key').value); } catch (error) { notice(message(error), true); }
  finally { button.disabled = false; }
});
$('#key-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024) throw new Error('请选择项目 data/api-key.txt 文件。');
    await unlock(await file.text());
  } catch (error) { notice(message(error), true); }
  finally { event.target.value = ''; }
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const password = $('#account-password').value;
  $('#account-password').value = '';
  try {
    const accountName = $('#account-name').value.trim();
    const existing = knownAccounts.find(account => account.accountName.toLowerCase() === accountName.toLowerCase());
    let internalId = editingAccountId || existing?.id || accountName;
    if (!editingAccountId && !existing && knownAccounts.some(account => account.id === internalId)) {
      internalId = `${accountName.slice(0, 55)}_${crypto.randomUUID().slice(0, 8)}`;
    }
    await request(`/v1/accounts/${encodeURIComponent(internalId)}/login`, 'POST', {
      accountName, password,
    });
    resetLoginForm(); notice('已发起登录，需要验证码时会显示在账号卡片中。'); await refresh();
  } catch (error) { notice(message(error), true); }
  finally { button.disabled = false; }
});
$('#reset-form').addEventListener('click', resetLoginForm);
$('#refresh-button').addEventListener('click', refresh);
$('#lock-button').addEventListener('click', () => { lock(); notice('页面已锁定。已有 Steam 连接继续运行。'); });
setInterval(refresh, 2500);
setInterval(updateCooldowns, 500);

// The launcher supplies the local key in a URL fragment, which is never sent in HTTP requests.
const fragment = new URLSearchParams(location.hash.slice(1));
const suppliedKey = fragment.get('key');
if (location.hash) history.replaceState(null, '', location.pathname);
const savedKey = suppliedKey || sessionStorage.getItem('steam-api-key');
if (savedKey) unlock(savedKey).catch(error => { lock(); notice(message(error), true); });
