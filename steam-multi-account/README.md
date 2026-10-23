# Steam 多账号在线服务

在一个 Windows 用户会话、一个 Node.js 服务中，使用 `steam-user` 为不同 Steam 账号分别维持 CM 连接和在线状态。通过本地 HTTP 接口登录及管理账号。

## 启动及添加账号

需要 Node.js 22 或更新版本。首次运行 `start.cmd` 会自动按 `package-lock.json` 安装依赖；也可先执行 `npm.cmd ci --registry=https://registry.npmjs.org --no-audit --no-fund`。

1. 双击 `start.cmd`，保持服务窗口运行；也可以在本目录执行 `npm.cmd start`。
2. 双击 `open-dashboard.cmd`，浏览器会打开管理页面并自动连接。在页面中添加账号、提交验证码及管理连接。

直接访问 `http://127.0.0.1:3210/` 也会显示管理页面；首次访问时，粘贴 `data/api-key.txt` 中的密钥，或点击“读取密钥文件”选择该文件。访问密钥只保存在当前标签页的会话中。锁定页面或关闭浏览器页面不会退出 Steam 账号。

也可以使用 PowerShell 脚本：打开另一个 PowerShell 窗口，进入本目录，执行以下命令。

```powershell
# 登录第一个账号：脚本会询问账号名、密码，以及需要时的 Steam Guard 验证码。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account1

# 登录第二个账号：第一个账号会继续保持连接。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account2

# 查看所有账号。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 list
```

`account1` / `account2` 是自定义的管理 ID；登录时输入的 `accountName` 必须是 Steam 登录账号名。每个 Steam 账号使用一个管理 ID。

## 账号详情、库存、免费入库与挂机

在账号卡片中点击“账号详情”，进入该账号的独立操作页面：

- **账号资料**：昵称、头像、Steam 等级、地区、隐藏部分内容的邮箱、钱包余额、授权设备、许可数量、账号限制、社区封禁和 VAC 状态。部分信息由 Steam 异步发送，尚未收到时会显示“等待 Steam 数据”。
- **游戏库**：查看可读取的游戏、AppID、总游玩时长和近两周时长；支持搜索和直接点击“挂机此游戏”。游戏隐私设置等因素可能影响 Steam 返回的列表。
- **库存**：预设 Steam 社区物品、CS2、Dota 2、TF2，也可输入自定义 AppID 和 ContextID。展示物品图片、名称、类型、数量、可交易/可上架状态和说明，并支持翻页。需要网页会话就绪；权限或网络错误会单独显示。
- **免费游戏入库**：从 Steam 商店搜索免费游戏并申请许可，也可手动输入 AppID 或免费包 SubID。AppID 使用免费按需许可接口，SubID 使用商店免费包领取接口。已拥有、地区限制、活动资格和领取类型都会影响结果；界面会区分新许可、没有发放新许可及错误。每个账号每小时最多申请 40 个许可，请求之间至少间隔 3 秒。
- **游戏挂机**：输入一个或多个 AppID，开始、更新或停止挂机。配置会加密保存并在重连、服务重启后恢复。账号在其他位置游戏时会暂停，结束后恢复；不会强制踢掉其他游戏会话。实际游戏时长以 Steam 记录为准，需要拥有对应游戏的使用权限。

“刷新资料”会重新查询昵称、头像和等级；“刷新网页会话”可用于库存和商店会话失效后的恢复。刷新网页会话后请等待几秒再读取库存。

资料、游戏库、库存和网页 Cookie 只在内存缓存；网页 Cookie 不通过本地 API 返回。邮箱默认只展示部分内容。挂机配置与账号令牌一起保存在加密账号文件中。

脚本中的密码输入会隐藏。账号凭据在本机输入即可。`state: online` 表示已登录并已向 Steam 设置在线状态。

服务重启后，会用已保存的刷新令牌自动恢复登录。主动执行 `logout` 的账号会保持退出，直到调用 `connect` 或重新登录。

```powershell
# 使用已有令牌重新连接。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 connect account1

# 退出并关闭该账号的自动恢复，保留令牌。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 logout account1

# 断开并删除本服务保存的账号资料和令牌。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 remove account1

# 停止整个服务；正在连接的账号会在下次启动时自动恢复。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 stop
```

## HTTP 接口

默认地址：`http://127.0.0.1:3210`。所有 `/v1/` 请求都需要请求头：

```text
Authorization: Bearer <data/api-key.txt 中的内容>
Content-Type: application/json
```

| 方法 | 路径 | JSON 请求体 | 含义 |
|---|---|---|---|
| GET | `/health` | 无 | 无需鉴权的存活检查 |
| GET | `/` | 无 | 管理页面，操作账号前需验证访问密钥 |
| POST | `/v1/service/shutdown` | `{}` | 停止整个服务并保留自动恢复设置 |
| GET | `/v1/accounts` | 无 | 列出所有账号状态 |
| GET | `/v1/accounts/{id}` | 无 | 查询单个账号状态 |
| POST | `/v1/accounts/{id}/login` | `{"accountName":"账号名","password":"密码"}` | 发起账号密码登录 |
| POST | `/v1/accounts/{id}/login` | `{}` | 用已保存的令牌重新登录 |
| POST | `/v1/accounts/{id}/guard` | `{"code":"ABCDE"}` | 提交当前登录需要的验证码 |
| POST | `/v1/accounts/{id}/logout` | `{}` | 退出并关闭自动恢复 |
| DELETE | `/v1/accounts/{id}` | 无 | 断开并删除本地保存的账号资料 |
| GET | `/v1/accounts/{id}/details` | 无 | 资料、网页会话状态、挂机状态及本次连接的领取记录 |
| POST | `/v1/accounts/{id}/profile-refresh` | `{}` | 刷新昵称、头像及等级 |
| POST | `/v1/accounts/{id}/web-refresh` | `{}` | 请求重新生成 Steam 网页会话 |
| GET | `/v1/accounts/{id}/games` | 无 | 游戏库；`?refresh=1` 强制刷新 |
| GET | `/v1/accounts/{id}/inventory` | 无 | 库存，见下面的查询参数 |
| GET | `/v1/free-games` | 无 | 商店免费游戏；查询参数 `term` 和 `start` |
| POST | `/v1/accounts/{id}/free-license` | `{"appIds":[570]}` 或 `{"packageId":123}` | 申请免费游戏或免费游戏包许可 |
| POST | `/v1/accounts/{id}/idle` | `{"appIds":[570,730]}` | 设置挂机，空数组停止 |

库存参数：`appId` 默认 753，`contextId` 默认 6，`startAssetId` 为上一页返回的 `nextAssetId`；`refresh=1` 强制刷新。每次最多返回 100 件物品。免费游戏列表返回 `nextStart`，可作为下一页 `start`；没有下一页时为 `null`。

`login` 和 `guard` 返回 HTTP **202**，表示已受理。继续查询状态，直到得到 `online`、`guard_required` 或 `error`。登录请求也可带 `authCode`（邮件验证码）或 `twoFactorCode`（手机验证码）。

需要验证码时的查询示例：

```json
{
  "id": "account1",
  "state": "guard_required",
  "guard": {
    "type": "totp",
    "emailDomain": null,
    "lastCodeWrong": false,
    "retryAfterSeconds": 0
  }
}
```

`type` 为 `email` 时使用邮件验证码，为 `totp` 时使用 Steam 手机令牌中的五位验证码。手机验证码错误后，等待 `retryAfterSeconds` 秒，再获取并提交新验证码。

状态含义：

| state | 含义 |
|---|---|
| `offline` | 当前未连接 |
| `connecting` | 正在登录 |
| `guard_required` | 等待提交 Steam Guard 验证码 |
| `online` | 已登录并设置在线状态 |
| `reconnecting` | 连接中断，`steam-user` 正在自动重连 |
| `error` | 登录或连接发生终止性错误，查看 `lastError` 后重新登录 |

常见 HTTP 错误：400 参数错误；401 API 密钥错误；404 账号不存在；409 当前状态冲突或重复账号；429 验证码重试冷却；500 本地存储或服务错误。

## 从自己的 Node.js 程序调用

根目录的 `client.js` 是一个可直接导入的 HTTP 客户端。先启动服务，再调用：

```javascript
import { SteamAccountsApi } from './client.js';

const api = new SteamAccountsApi(); // 自动读取本地 data/api-key.txt

// 首次登录：从你自己的交互输入或凭据管理器取得这两个值。
await api.login('account1', { accountName, password });

// 也可以独立发起另一个账号的登录：
await api.login('account2', {
  accountName: secondAccountName,
  password: secondPassword,
});

const account = await api.status('account1');
if (account.state === 'guard_required') {
  // code 是用户本次提供的 Steam Guard 验证码。
  // lastCodeWrong=true 时先等待 retryAfterSeconds，再取得新验证码。
  await api.submitGuard('account1', code);
}

console.log(await api.list());

// 以下各操作按需调用：
// await api.logout('account1');
// await api.login('account1');   // 以已保存的令牌恢复连接
// await api.remove('account1');
```

新增功能的 Node.js 调用：

```javascript
console.log(await api.details('account1'));
console.log(await api.games('account1'));
console.log(await api.inventory('account1', { appId: 753, contextId: '6' }));
console.log(await api.freeGames('Dota'));

// 以下操作会改变该账号的许可或游戏状态，按需调用。
await api.claimFreeGames('account1', [570]);
// await api.claimFreePackage('account1', 已知免费包SubID);
await api.startIdling('account1', [570]);
await api.stopIdling('account1');
```

`login` 返回后请轮询 `status`，例如每两秒一次；Steam Guard 请求可能在稍后才出现。

## 保存数据和运行配置

`data/` 首次启动时自动创建，已加入 `.gitignore`：

- `accounts.enc`：使用 AES-256-GCM 加密的账号资料、刷新令牌及邮件设备认证令牌。密码和验证码不写入磁盘。
- `key.dpapi`：Windows DPAPI 保护的加密密钥，绑定当前 Windows 用户及电脑。复制到其他电脑或 Windows 用户下通常无法解密，需要重新登录。
- `api-key.txt`：随机生成的本地接口密钥。不要公开或提交到代码仓库。
- `service.lock`：防止多个服务进程同时操作一份数据。正常退出时会删除；异常退出后会检查旧进程再清理。

请保护整个 `data/` 目录。DPAPI 防止直接读取密钥文件得到令牌；以同一个 Windows 用户运行的程序仍可解密。其他系统使用权限为 `0600` 的本地密钥文件。

环境变量可在启动前设置：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `PORT` | `3210` | HTTP 端口，始终仅监听 `127.0.0.1` |
| `STEAM_DATA_DIR` | 本项目的 `data` 目录 | 数据保存位置，建议使用绝对路径 |
| `STEAM_WEB_COMPAT` | `1` | 使用 Steam WebSocket 443 端口；设置 `0` 使用库的默认传输选择 |
| `STEAM_HTTP_PROXY` | 自动检测 | 库存与商店请求的 HTTP/HTTPS 代理地址；设置 `direct` 禁用代理 |

库存与商店请求优先使用 `STEAM_HTTP_PROXY`，其次是 `HTTPS_PROXY` / `HTTP_PROXY`，最后读取 Windows 已启用的静态系统代理。此设置作用于新增的网站读取和免费包领取，不改变已有 CM 登录连接的传输设置。修改后重启服务生效。

修改端口后，PowerShell 脚本使用 `-BaseUrl http://127.0.0.1:新端口`，Node 客户端传入 `{ baseUrl: 'http://127.0.0.1:新端口' }`。

网络临时中断时由库自动重连；密码、令牌失效或登录被替换等终止性错误会显示为 `error`，避免无限重试账号认证。令牌能续期时会自动保存新令牌；被撤销或失效后仍可能需要密码及 Steam Guard 重新登录。保持电脑唤醒、网络连通及服务进程运行，连接才能持续。

## 检查

```powershell
npm.cmd test
```

检查使用模拟 Steam 客户端验证多账号、验证码、重连状态、令牌恢复、HTTP 鉴权、加密存储，以及资料、库存、免费许可和挂机逻辑；不向 Steam 提交真实账号密码，也不会给真实账号领取游戏或设置挂机。真实账号登录需要在本机完成验证。

依赖：[steam-user 5.3.0](https://github.com/DoctorMcKay/node-steam-user)。依赖版本由 `package-lock.json` 锁定，可执行 `npm.cmd ci --registry=https://registry.npmjs.org` 重装。
