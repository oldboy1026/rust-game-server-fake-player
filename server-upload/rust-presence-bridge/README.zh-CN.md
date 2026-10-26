# RustPresenceBridge：已编译的服务器扩展 DLL

这是根据 RustJiaRen DLL 的扩展加载方式与 Steam 上报路径新写的独立实现。可配合本项目 Node.js 程序做一个指定真实账号的原版上报刷新实验。**已编译成功，尚未在目标服加载或验证公共人数改变。**

## 1. 下载与放置

交付 DLL：`dist/Oxide.Ext.RustPresenceBridge.dll`。不要改名。

停服后，仅将此 DLL 放到运行 RustDedicated 的服务器根目录下：

```text
<Rust服务器根目录>/RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll
```

Windows 示例：`D:\RustServer\RustDedicated_Data\Managed\Oxide.Ext.RustPresenceBridge.dll`。
Linux 示例：`/home/rust/server/RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll`，需要目标安装具备兼容的 Oxide/Rust 托管程序集；本次只用 Windows 参考集编译，没有验证 Linux 加载。

这是 **Oxide 扩展 DLL**，与上一轮的 `.cs` 插件不同；不要放到 `oxide/plugins`、`oxide/extensions` 或 `HarmonyMods`。服务器必须已装与当前 Rust 匹配的 Oxide/uMod，纯原版服务器不能加载。不要用本包替换 Oxide.Core.dll、Oxide.Rust.dll 或其他官方 DLL。

若已安装原来的 `Oxide.Ext.RustJiaRen.dll`，请在停服期间备份并移出服务器加载目录，避免它继续叠加 FakePlayers、改写 cp 而干扰对照。然后启动服务器。本扩展不支持热重载，更新、安装、移除均使用完整重启。

启动日志应出现 RustPresenceBridge 扩展及 `Rust Presence Bridge v0.1.0` 核心插件加载记录。以实际日志和下方命令响应确认加载；“编译成功”不等于目标服已兼容。

## 2. 服务器控制台 / 已有管理员 RCON

```text
rustpresencebridge.snapshot
rustpresencebridge.snapshot 你的17位SteamID64
rustpresencebridge.refresh 你的17位SteamID64
```

只能由服务器控制台、RCON 或 authLevel>=2 的管理员执行。无需另开端口或接收 Steam 票据。输出为 JSON，包含 bridge/version/status、时间、聚合人数、目标连接状态；不输出目标 SteamID、昵称、IP、票据。

快照显示 activePlayers、networkConnections、publishedTags、Steam 及 EAC 的本地状态。`secure=false` 下的 EAC 本地状态不能作为受保护认证证据。

刷新要求：目标存在于活跃 BasePlayer 列表；其 net.connection 与真实 Network.Net.sv.connections 中的对象相同；连接中 SteamID 与指定 ID 匹配；连接正常、网络已认证、已完成世界快照。secure 开启时，还必须具备 EAC 接口、玩家映射和本地认证状态。只调用已安装游戏中的 `UpdatePlayerSession(ulong,string)` 与原版零参数 `UpdateServerInformation()`，全局冷却 30 秒。目标尚停在 EAC 或不存在时拒绝刷新。

返回 `normal_refresh_invoked` 时：`playerUpdateReturned`、`serverInformationReturned` 应均为 true。原版 Steam 包装返回 void，故 `backendAccepted` **始终为 null**；这不是原生 Steam bool、EAC 成功回执或 Facepunch 公共人数收录回执。失败可能发生在部分调用之后，脚本不会自动重试。

常见状态：

| status | 含义 |
| --- | --- |
| snapshot | 已读取本地快照 |
| normal_refresh_invoked | 两个正常刷新方法完成调用，后台结果未知 |
| target_not_a_ready_authenticated_player | 目标不存在、连接不匹配、未认证或仍加载中 |
| protected_target_not_authenticated | secure 下缺少所需本地 EAC 状态 |
| incompatible_runtime_or_snapshot_failed | 当前程序集类型/成员与参考不兼容，或服务器尚未就绪；提交加载日志和原始状态以便定位 |
| refresh_failed_or_partially_invoked | 查看两项 Returned 字段，可能已完成部分调用 |
| cooldown_30_seconds | 等待 30 秒再手动操作 |

## 3. 与本项目 Node.js 程序配合

在本仓库根目录执行。需要 Node.js 22+ 和已安装的 `steam-multi-account` 依赖。服务器已有 WebRCON 必须可达；**RCON 端口、游戏端口、查询端口是不同用途，不能把 30923 当 RCON 端口。** 此脚本不改服务器 RCON 配置。

在本机 PowerShell 中设置现有连接信息，密码不回显：

```powershell
$env:RUST_RCON_HOST = '202.189.21.58'
$env:RUST_RCON_PORT = Read-Host '现有 WebRCON 端口'
$taskRconSecret = Read-Host 'RCON 密码' -AsSecureString
$env:RUST_RCON_PASSWORD = [Net.NetworkCredential]::new('', $taskRconSecret).Password
# 若现有 WebRCON 使用 TLS，设置 $env:RUST_RCON_TLS='1'；默认 ws。
```

继续使用已有受保护管理通道；如果通过 SSH 隧道连接，把 RUST_RCON_HOST 设为 127.0.0.1、端口设为隧道端口。无需在聊天中提供密码。

先读服务器总体快照，不做刷新：

```powershell
node tools/rust-research/presence-bridge.mjs --host 202.189.21.58 --port 30921 --query-port 30923 --action snapshot --out work/presence-before.json
```

对本地项目账号读取状态，用本地账号管理 ID 替换示例：

```powershell
node tools/rust-research/presence-bridge.mjs --host 202.189.21.58 --port 30921 --query-port 30923 --account 本地账号管理ID --action snapshot --out work/presence-account.json
```

目标已经通过独立程序完成正常入服后，手动刷新一个账号：

```powershell
node tools/rust-research/presence-bridge.mjs --host 202.189.21.58 --port 30921 --query-port 30923 --account 本地账号管理ID --action refresh --wait-seconds 35 --out work/presence-refresh.json
```

`--account` 从本机服务读取 SteamID。刷新前额外要求本项目会话为 entered_game 且游戏地址匹配，否则在本机拒绝。服务使用自定义 PORT/STEAM_DATA_DIR 时，本脚本继承相同环境变量。也可以用 `--steam-id 17位SteamID64` 替代 `--account`，针对正常官方客户端玩家做对照；服务器仍独立验证真实连接。两种目标参数不能同时使用。

脚本只传递命令和目标 SteamID，不发送 Steam 登录密码、API key、Cookie 或票据到 RCON。RCON 凭据不进入输出。结果仅保存聚合查询数据和受限的扩展状态；命令超时返回 rcon_result_unknown 时，可能已执行，不自动重试。结束后清理本机临时环境变量：

```powershell
Remove-Item Env:RUST_RCON_PASSWORD
Remove-Variable taskRconSecret
```

## 4. 如何判断公共人数

脚本记录刷新前后 Facepunch/cp/A2S 数字、Last-Modified、Age，计算 publicCountDelta 和 publicBatchChanged。35 秒不保证公共后台更新；若 Last-Modified 相同，继续通过网页手动观察后续多个新批次，不要把连续命中缓存当成新数据。聚合人数差也不能证明某账号被采用或刷新造成变化，因此 publicCountChangeVerified 保持 false。

本扩展没有公开的“设置 Facepunch 人数”接口。原参考 DLL 的人工 Connection、随机地址、手动 OK 分析事件及 FakePlayers/cp 累加，不是经验证的公共人数更新方法；这里没有复制这些行为。已有其他插件仍可能在原版更新钩子里改 cp，需纳入对照。

当前独立程序在目标 `202.189.21.58:30921` 仍停在 EAC。这个 DLL 不建立或转移 EAC 客户端会话，也不会把该状态写为入服成功。请先用一个已正常入服的官方客户端账号检查部署、状态和刷新调用，再验证满足准入条件的独立连接。

## 5. 构建、依据与卸载

源码为 Extension.cs、RuntimeAdapter.cs、Json.cs，编译命令：

```powershell
.\server-upload\rust-presence-bridge\Build.ps1 -ReferenceDirectory 'D:\RustServer\RustDedicated_Data\Managed'
```

本包构建引用 Oxide.Rust 2.0.7839、Oxide.Core 2.0.4143 和本地参考游戏 DLL；运行时对游戏类型、成员和方法签名做受限检查，类型变化时返回失败，不对未知成员进行写操作。编译来源与二进制 SHA256 见 `dist/build.json`。原参考 DLL 只作静态元数据/IL检查，未执行、补丁、分发。

卸载：停服，移走 `RustDedicated_Data/Managed/Oxide.Ext.RustPresenceBridge.dll` 后重启。没有新增配置、数据库、后台服务器、人工玩家或持久化票据需要清理。
