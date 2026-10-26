# Steam 多账号在线服务

在一个 Windows 用户会话、一个 Node.js 服务中，使用 `steam-user` 为不同 Steam 账号分别维持 CM 连接和在线状态。通过本地 HTTP 接口登录及管理账号。

## 启动及添加账号

需要 Node.js 22 或更新版本。首次运行 `start.cmd` 会自动按 `package-lock.json` 安装依赖；也可先执行 `npm.cmd ci --registry=https://registry.npmjs.org --no-audit --no-fund`。

1. 双击 `start.cmd`，保持服务窗口运行；也可以在本目录执行 `npm.cmd start`。
2. 双击 `open-dashboard.cmd`，浏览器会打开管理页面并自动连接。在页面中添加账号、提交验证码及管理连接。

直接访问 `http://127.0.0.1:3210/` 也会显示管理页面；首次访问时，粘贴 `data/api-key.txt` 中的密钥，或点击“读取密钥文件”选择该文件。访问密钥只保存在当前标签页的会话中。锁定页面或关闭浏览器页面不会退出 Steam 账号。

## Rust 挂机页面

打开 `http://127.0.0.1:3210/rust`，或点击顶部“Rust 挂机”。页面直接显示 Steam 登录账号名，不需要填写管理 ID。

“服务器公共人数查询”独立于账号选择与登录。填写 IPv4 和**游戏端口**，查询端口可留空，按 Steam 登记精确匹配；查找失败可手动填写真实查询端口，不猜测相邻端口。显示 Facepunch 公共人数、cp、A2S players/bots 及可选 A2S_PLAYER 条目。Facepunch 接口只有聚合人数；玩家条目由服务器提供，可能空白或受限，不提供可验证 SteamID。公共映射未列出时显示未知，不当作 0。页面保留公共 Last-Modified、Age 和读取时间；本地缓存 30 秒、并发请求合并，手动查询，不跟随账号状态每 2.5 秒轮询。

接口为 `POST /v1/rust/server-query`，沿用本地 Bearer 和同源校验。JSON 示例：`{"host":"202.189.21.58","port":30921,"queryPort":30923,"includePlayers":true}`。`queryPort` 和 `includePlayers` 可省略。各数据源分别返回状态，部分查询失败仍可显示其他来源。不会发送 Steam 账号票据给公共接口。服务端实验插件与上传位置见 [server-upload/README.zh-CN.md](../server-upload/README.zh-CN.md)。

- 每行按 `账号:密码` 批量导入并登录，每批最多 200 个。密码中可以包含冒号；提交后输入区立即清空，密码不进入任务结果、账号日志或账号存储。
- 新账号需要邮箱/手机验证码、登录失败或超时会自动停止并移出；逐行显示原因。已有账号记录保留，已经在线的账号保留当前连接。本页不提交验证码。
- 勾选多个账号，批量登录 Steam、连接指定 IPv4 和游戏端口，或正常断开。查询端口可选填，默认游戏端口加一。账号会错开连接，已有活动 Rust 连接会跳过并保留。
- 服务器分组显示名称及本系统已入服、连接中账号数；可选择本组或筛选账号。名称通过公开 A2S 查询取得，失败时显示 IP 和端口。本系统人数独立于 Rust 公共游戏列表人数。
- 每个账号可查看最近 200 条连接事件与错误摘要。任务及日志仅保存在服务内存中；关闭网页仍继续，重启服务会清空记录。服务重启后 Steam 按原有设置恢复，Rust 连接需重新发起。
- 已入服账号可点“发送聊天”向当前服务器发送一条全服消息，间隔至少 5 秒。内容为最多 128 字的单行文本，不支持双引号、反斜杠、分号和控制字符。聊天正文不保存到本地连接日志。

聊天接口 `POST /v1/accounts/{id}/rust-chat` 接收 `{"text":"1"}`。返回 HTTP 202 和 `status: sent_to_transport` 表示当前游戏连接已调用原生发送，`serverConfirmed` 为 false；是否被服务器接收或广播需核对游戏内消息或服务端聊天记录。未入服返回 409，过快发送返回 429，等待发送结果超时返回 504。超时结果未知，程序不会自动重发。连接停止或工作进程关闭时会结束待处理请求，Steam 票据仍在工作进程完全退出后取消并清零。

“死亡时尝试重生一次”默认关闭，只在观察到自己的死亡快照与完成加载后发送一次普通请求。入服完成、角色存活和公共列表收录分别判断；当前连接方式不支持要求额外 EAC 或受保护加密会话的服务器，遇到这些要求会停止。

也可以使用 PowerShell 脚本：打开另一个 PowerShell 窗口，进入本目录，执行以下命令。

```powershell
# 登录第一个账号：脚本会询问账号名、密码，以及需要时的 Steam Guard 验证码。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account1

# 登录第二个账号：第一个账号会继续保持连接。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 login account2

# 查看所有账号。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\steam.ps1 list
```

上面脚本的 `account1` / `account2` 是脚本使用的内部标识；网页会自动处理，用户只需填写 Steam 登录账号名和密码。

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
| GET | `/rust` | 无 | Rust 批量连接页面 |
| GET | `/v1/rust/overview` | 无 | 账号、服务器分组、本系统人数及近期任务 |
| POST | `/v1/rust/import` | `{"text":"账号:密码\\n另一个账号:密码"}` | 创建导入及登录任务，返回 202 |
| POST | `/v1/rust/actions` | `{"action":"login","accountIds":["内部标识"]}` | 对所选账号批量操作；action 支持 login/connect/disconnect |
| GET | `/v1/rust/jobs/{job}` | 无 | 查询本批次每账号的结果 |
| GET | `/v1/rust/accounts/{id}/logs` | 无 | 当前服务内存中的单账号日志 |
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
| POST | `/v1/accounts/{id}/rust-auth-check` | `{}` | 申请并取消 Rust Steam 会话票据，核对所有权及加密票据签发 |
| POST | `/v1/accounts/{id}/rust-chat` | `{"text":"连接测试"}` | 已入服账号发送一条普通全服聊天 |

`rust-auth-check` 仅检查固定 AppID `252490`。账号需在线；已有 Rust 会话票据时拒绝操作，同账号检查串行，加密票据申请尝试之间至少 60 秒。返回结果只有状态、长度、AppID、签名校验及取消数量；票据仅存内存，结束时清零，接口和日志均不输出票据。该检查不修改挂机配置或上报游戏活动，不连接游戏服务器；`serverValidated`、`eacVerified`、`playerConnected` 均为 `false`。成功仅表示 Steam 票据签发及本次会话票据取消得到确认，不能证明票据已被 Rust 服务器接受。请求超过 70 秒会返回 504，底层请求及清理继续执行，完成前拒绝再次检查。

库存参数：`appId` 默认 753，`contextId` 默认 6，`startAssetId` 为上一页返回的 `nextAssetId`；`refresh=1` 强制刷新。每次最多返回 100 件物品。免费游戏列表返回 `nextStart`，可作为下一页 `start`；没有下一页时为 `null`。

`login` 和 `guard` 返回 HTTP **202**，表示已受理。继续查询状态，直到得到 `online`、`guard_required` 或 `error`。登录请求也可带 `authCode`（邮件验证码）或 `twoFactorCode`（手机验证码）。

Rust 批量 `connect` 还需要 `target: {host, port, queryPort?}`，可选 `respawnOnDead` 和 `wakeOnConnect` 必须为布尔值。批量接口每次选择 1–200 个账号；导入接口 JSON 请求体上限为 128 KiB，其余接口仍为 16 KiB。`started` 仅表示连接/断开已发起，最终状态见 overview；验证码与错误结果不会包含原始密码行。内部标识由 overview 提供，仅供程序调用，网页不显示。

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
| `STEAM_CM_PROXY` | `auto` | Steam CM 登录复用已配置的 HTTP/系统代理；设置 `direct` 可单独让 CM 直连 |
| `STEAM_HTTP_PROXY` | 自动检测 | 库存与商店请求的 HTTP/HTTPS 代理地址；设置 `direct` 禁用代理 |
| `RUST_NATIVE_DLL` | 无 | 独立 Rust 研究连接使用的本机 x64 RakNet.dll 绝对路径；加载前核对已研究版本的 SHA-256 |
| `RUST_PYTHON` | 无 | 64 位 Windows Python 可执行文件的绝对路径 |

库存、商店请求与 Steam CM 登录优先使用 `STEAM_HTTP_PROXY`，其次是 `HTTPS_PROXY` / `HTTP_PROXY`，最后读取 Windows 已启用的静态系统代理。`STEAM_HTTP_PROXY=direct` 禁用这条代理配置；`STEAM_CM_PROXY=direct` 只让 CM 直连。Rust 游戏 UDP 连接继续使用其自身网络路径。修改后重启服务生效。

修改端口后，PowerShell 脚本使用 `-BaseUrl http://127.0.0.1:新端口`，Node 客户端传入 `{ baseUrl: 'http://127.0.0.1:新端口' }`。

网络临时中断时由库自动重连；密码、令牌失效或登录被替换等终止性错误会显示为 `error`，避免无限重试账号认证。令牌能续期时会自动保存新令牌；被撤销或失效后仍可能需要密码及 Steam Guard 重新登录。保持电脑唤醒、网络连通及服务进程运行，连接才能持续。

## 独立 Rust 连接研究接口

`POST /v1/accounts/{id}/rust-connect` 接受 `{"host":"目标IPv4","port":28015,"seconds":60}`。账号须在线，且先配置上述两个本机路径；时长范围为 5 到 120 秒。接口等待此次连接结束及票据清理后返回阶段、消息数量和固定拒绝分类。票据只通过匿名本机管道传给独立网络进程，不出现在 API 返回、命令行或磁盘中。

程序从 Steam 申请并核验新会话票据，在收到 Rust 身份请求后提交身份；只在审批指定不加密时发送经过当前版本核对的最小 Ready。遇到 EAC 数据或受保护消息要求时结束该尝试。`approved`、`readySent`、`worldMessages` 分别记录协议进展；只有本账号自身实体及发给它的精确 FinishLoading RPC 都已观察到，`playerConnected` 才为 true。`eacVerified` 始终为 false。

持续连接使用 `POST /v1/accounts/{id}/rust-session`，请求体为 `{"host":"目标IPv4","port":28015}`；立即返回 202。`GET` 同一路径查询状态，`DELETE` 优雅断开。`entered_game` 表示已经确认本账号的玩家实体和 FinishLoading。网页“账号详情 → Rust 服务器连接”提供相同操作；关闭页面后连接继续，停止服务或退出 Steam 账号会断开。

请求可选严格布尔值 `respawnOnDead`，默认 `false`。设为 `true` 时，仅在同一自身实体的精确 FinishLoading 已观察到、最新完整自身快照不超过 10 秒且 `lifeState=dead` 后，经已认证游戏连接尝试一次固定 `respawn`；发送失败也不重试。自身实体变化会清除该实体的 FinishLoading 门控。服务端仍检查死亡状态及重生冷却；此选项不发送 PlayerTick、唤醒或移动，也不改变遇到 EAC 或受保护加密时停止的行为。

网页连接区提供“死亡时尝试重生一次”复选框，打开账号详情时默认不选。连接期间显示该会话实际启用的设置并禁止修改；选择后在下次连接提交，未提交的选择不会被状态刷新覆盖。进度显示最近角色快照的存活/死亡/未知状态及采样时快照年龄；连接结束后明确标为历史记录，不代表当前在线状态。

`metadata.respawnOnDeadEnabled`、`respawnAttempted` 和 `respawnSent` 分别记录开关、尝试及原生发送结果。只有发送后收到同一自身实体的完整 `alive` 快照，`respawnAliveObserved` 才为 `true`，并附 `respawnAliveAfterSeconds`；未观察到时保持 `false`。实体消息序号尚未核对，因此这只表示发送之后接收到 alive，不是服务端命令确认或因果证明，也不能证明已计入游戏列表人数。

本机可在被忽略的 `data/rust-runtime.json` 保存 `{"dll":"RakNet.dll绝对路径","python":"Python绝对路径"}`，环境变量优先。该文件只存本机路径，迁移电脑后需重新配置。持续会话目前不自动恢复；服务重启后先等待账号上线，再连接服务器。

请求可选严格布尔值 `wakeOnConnect`，默认 `false`；账号详情和 Rust 页面对应“入服后尝试唤醒一次”。例如单账号请求 `{"host":"127.0.0.1","port":28015,"wakeOnConnect":true}`。命令行 worker 对应 `--wake-on-connect`。后端代码更新需要重新启动服务才能接受新选项，现有运行中的会话不会自动启用；本批没有重启用户服务。

启用后，只在已批准的无加密连接、同一自身实体的 FinishLoading、两秒内有序完整自身快照、存活且有正健康值、已连接且不在接收快照/旁观/受伤/转移状态时，尝试一次普通 `PlayerTick` 唤醒。初版只支持有接地模型状态、静止、无父实体/坐骑、非水中及非特殊移动姿态；从自身完整快照取得位置、视角和模型，按无父实体的直立/蹲伏眼位构造完整输入。未支持状态等待后续快照，不猜测坐标或执行管理员唤醒命令。

一次尝试最多三帧，间隔设计为 50 毫秒：中立 → 蹲伏键 `64` → 中立释放。按可靠有序通道 0 发送，每一帧显式写出所有 Tick、Input、ModelState 和向量分量，包括零值，覆盖服务端旧 ProtoDelta 基线。该过程收起活动物品，不发送攻击。自身未知 RPC、销毁、真实位置改变或基础实体 flags 改变使保留状态失效；已核对的 UI/宠物元数据 RPC 和位置未变的同步回包允许继续，单独的视角回包不刷新完整状态年龄。按下后不能安全释放时关闭本账号连接，发送失败也关闭，不重试。

第一帧 Tick 会启动服务端的玩家响应计时。启用唤醒且已发送 Tick 后，独立发送普通无参数 owner RPC `ClientKeepConnectionAlive`，设计间隔 100 毫秒，独立于唤醒成功或中断状态；不循环发送旧坐标或按键。已核对目标 `server.playertimeout=60`，RPC 接收先检查 `antihack.rpcstallthreshold=0.8`，因此每两秒才发送维护消息仍会超时。本机维护间隔超过 500 毫秒则关闭自己的连接并提示重新连接，不突发补发、不更改服务端门槛。维护原生发送失败也关闭。此功能不包含持续 PlayerTick、走路、地形碰撞或完整 Rust 客户端；自定义门槛、网络或调度停顿仍可能导致断开。

`metadata.tickWakeEnabled`、`tickPacketsSent`、`wakeAttempted`、`wakePressSent`、`wakeReleaseSent`、`wakeAwakeObserved`、`wakeState` 区分开关、尝试、发送、释放与观察结果。仅在按下后五秒内收到同一实体、更大有序序号、可用完整自身状态且 Sleeping 已清除时记录 `wakeAwakeObserved=true`；三帧完成但没有该快照时为 `awaiting_confirmation`，超时为 `unconfirmed`。`awake_observed` 同时要求释放帧已发送。发送成功不等于服务端处理成功，也不是唤醒因果或公共列表计数证明。坐标、实体 ID、完整 flags 和输入内容均不进入状态 API。

离线验证：`python -B tools/rust-research/test_rust_player_tick.py` 和 `python -B tools/rust-research/test_rust_peer.py` 从仓库根目录运行；Node 验证在本目录运行 `npm.cmd test`。可使用 .NET 10 SDK 执行 `tools/rust-research/Test-PlayerTickInterop.ps1 -ServerDirectory <Rust服务端目录>`，用本机真实 Rust.Data 解码器验证三帧覆盖非零旧状态并可重新完整序列化；输出在 ignored work 中，不启动游戏或网络。2026-10-25 已实际观察到三帧完成后自身 Sleeping 清除；留服回归结果见 `../rust-research/connection-timeout-fix-2026-10-25.md`。

持续会话开始后会报告实际 Rust 游戏活动；传输连接后附上真实游戏地址，结束清理后恢复保存的挂机配置。账号在其他 Steam 会话游戏时，活动报告继续遵守暂停规则。此报告不保证外部可信人数或游戏列表人数更新。

`src/rust-auth-association.js` 是供受控研究使用的实验模块，当前未接入网页或常规会话。它将当前独占票据的 AppID、CRC、GC token、Steam 连接代次与成功的 `authTicketStatus` 关联；验证者还须等于刚查询到的目标游戏服务器身份。只有同一真实会话已经入服时才可取得带精确 `steam_id_gs` 的活动数据，票据取消、身份不匹配或连接代次变化立即失效。模块本身只观察和构造数据，不发送活动或认证请求；实验驱动另行选择是否发送。2026-10-25 已完成单账号同连接的 6→11→6 分钟对照：关联阶段真实名单/cp 均为14，两个较新的公共批次均为3，未观察人数增加；还原阶段另有自然玩家变化。候选仍未接入常规服务，不是已验证修复，详见 `rust-research/presence-association-experiment-2026-10-25.md`。

`GET /v1/accounts/{id}/rust-session` 的 `steamAuthentication` 返回本账号 Rust 票据活动及验证观察状态，不返回票据或身份字段。`GET /v1/accounts/{id}/rust-steam-count` 通过当前 Steam 连接只读查询最近所选游戏地址的 GMS 认证人数，另在 `serverList` 保留 `GameServers.GetServerList` 的状态和人数；该 `players` 字段不保证等同于认证人数。缺失或失败保持未知值。它们与服务器 A2S、`cp` 和 Facepunch 可信人数是不同来源，不能用单个数值证明某账号已计入 Rust 列表。

2026-10-25 的网络资料复核见 [公共人数项目与源码调查](../rust-research/public-count-web-survey-2026-10-25.md)。GameDig 的 Rust 人数取自 `cp`，部分第三方浏览器使用 BattleMetrics 或 Steam `GetServerList.players`；这些值不能直接作为 Facepunch 公共人数修复的验收。已核对的四份 steam-user 上游文件与本机一致，本轮尚未找到可验证的公共人数修复实现。

`metadata.ownPlayerState` 观察本账号完整实体快照中的生命与玩家标志。`observed=false` 表示未知；观察成功后提供 `sleeping`、`receivingSnapshot`、`lifeState`（alive/dead/unknown）、`healthPositive`（布尔或未显式观察时的 null）、观战/受伤/连接/切换加载标志、字段是否出现、快照和状态变化计数、`ageSeconds`。Sleeping=false 不能单独证明角色存活或已醒；entered_game 也只表示此前确认入服。年龄以最近一次 worker 报告时刻计算，解析失败时保留旧状态并继续增加年龄；目前未核对消息序号，不能把旧快照当作当前服务器状态。`entityParseFailures` 统计所有 Entity 的解析失败。诊断不输出玩家 ID、坐标、生命值数值或原始标志，也不发送唤醒或移动输入。

历史研究已在当时目标配置下确认自身实体及 FinishLoading，并观察数分钟持续连接；2026-10-25 新增的一次 PlayerTick 已实际观察到唤醒，随后补上唤醒后的连接维护。有效 EAC 受保护会话仍未实现，遇到 EAC 或非零加密要求继续停止，不能保证其他服务器兼容或无限期留服。历史实测时原有 Steam/Rust 客户端保留作观察基线，尚未进行两者全部退出后的重连实验；本程序不调用它们的会话或 IPC。

## 检查

```powershell
npm.cmd test
```

检查使用模拟 Steam 客户端验证多账号、验证码、重连状态、令牌恢复、HTTP 鉴权、加密存储，以及资料、库存、免费许可和挂机逻辑；不向 Steam 提交真实账号密码，也不会给真实账号领取游戏或设置挂机。真实账号登录需要在本机完成验证。

依赖：[steam-user 5.3.0](https://github.com/DoctorMcKay/node-steam-user)。依赖版本由 `package-lock.json` 锁定，可执行 `npm.cmd ci --registry=https://registry.npmjs.org` 重装。
