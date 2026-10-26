# Rust+ 线索复核：伴侣认证、EAC 与公共人数

日期：2026-10-26。结论：Rust+ 可以补充地图、团队信息、设备控制和团队聊天；**本轮核对的公开实现没有提供为独立 Rust 玩家建立有效 EAC 会话的方案，也没有提供修复 Facepunch 公共人数的接口。** 这不是对所有私有实现的不存在证明。

## 聊天信息支持的判断

对方明确表示其方案也遇到“能进服但游戏列表人数不更新”，随后才说“好像要用到 Rust+”。因此，这段聊天没有展示一个解决公共人数或独立 EAC 的成功案例，也没有确定具体项目、插件名称、服务器保护模式或认证方法。对方所说的“无解”是其经验描述，不能作为技术上永远不可能的证明。

“服务器放插件”与“Rust+”可能分别用于服务端扩展和伴侣应用管理；没有插件源码，不能断定二者在其方案中的具体分工。标准 Rust+ 本身是 Rust Dedicated 的内置功能，正常启用不要求安装第三方玩家插件。

## 本轮查了哪些项目

读取仓库元数据，固定以下提交，再读取选定 README、连接实现、配对/凭据代码和 Protobuf。共检查五个项目的 24 份固定提交文件；不运行仓库程序，不下载其发布版可执行文件，也不导入账号凭据。

| 项目 | 固定提交 | 核对结果 |
| --- | --- | --- |
| [liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js/tree/75915f25fc7c1718f7c23c419953f4655840fade) | `75915f25` | Node.js 伴侣库；WebSocket、playerId/playerToken、地图、团队和设备请求。最适合现有 Node.js 项目作为可选管理通道 |
| [Pronwan/rustplus-desktop](https://github.com/Pronwan/rustplus-desktop/tree/9e9f3e41c472ba11268bec56615e86b79adbc0a5) | `9e9f3e41` | 伴侣应用桌面界面，使用 RustPlusApi；连接验证针对伴侣 socket 和设备，不是 Rust 游戏/EAC 准入验证 |
| [alexemanuelol/rustplusplus](https://github.com/alexemanuelol/rustplusplus/tree/8f7300e4e3dd68392f2b01ead5d711697f63ac63) | `8f7300e4` | 基于 rustplus.js 的 Discord 管理机器人；凭据流程指向伴侣配对与推送服务 |
| [olijeffers0n/rustplus](https://github.com/olijeffers0n/rustplus/tree/ca3d251fac2e4fb8a97419ac4baab00087e38e9e) | `ca3d251f` | Python 伴侣 API；同类 WebSocket 与 AppRequest 协议 |
| [HandyS11/RustPlusApi](https://github.com/HandyS11/RustPlusApi/tree/f61d403280c656addd103a09238e270e867cdc7e) | `f61d4032` | C# 伴侣库；包含原生凭据获取、Steam 网页登录、FCM 和摄像头协议，仍是 Rust+ 的认证/功能范围 |

在这批核对的连接、配对和协议源码中没有找到 Rust EAC 客户端会话实现。没有把只读到 README 的项目当作完整源码审计，也没有把认证相关类名当作 EAC 能力证明。

## 协议证据：它认证的是伴侣应用

1. [Rust+ 官方服务器文档](https://wiki.facepunch.com/rust/rust-companion-server)说明 Companion Server 使用独立 TCP 端口，可用 `app.info` 查看，`app.port` 配置；默认端口按游戏/RCON 端口规则计算。不能把游戏端口或 A2S 查询端口直接当作伴侣端口，也没有据此扫描当前目标。
2. [rustplus.js 的连接代码](https://github.com/liamcottle/rustplus.js/blob/75915f25fc7c1718f7c23c419953f4655840fade/rustplus.js#L62)创建 `ws://server:port`，或可选伴侣代理 URL。该代理只改变伴侣消息的路由，不是受保护 Rust 游戏客户端。
3. [AppRequest 定义](https://github.com/liamcottle/rustplus.js/blob/75915f25fc7c1718f7c23c419953f4655840fade/rustplus.proto#L134)包含序号、`playerId`、`playerToken` 及 getInfo/getMap/getTeamInfo/sendTeamMessage 等请求。这个协议不是我们现有 worker 使用的游戏传输、Steam 准入和 EAC 消息路径。
4. [RustPlusApi 的连接定义](https://github.com/HandyS11/RustPlusApi/blob/f61d403280c656addd103a09238e270e867cdc7e/src/RustPlusApi/RustPlusConnection.cs#L12)明确说明 Port 是 Rust+ companion app 端口，与游戏内连接端口不同；PlayerToken 是伴侣配对凭据。
5. [SteamLoginService](https://github.com/HandyS11/RustPlusApi/blob/f61d403280c656addd103a09238e270e867cdc7e/src/RustPlusApi.Fcm.Registration/Steps/SteamLoginService.cs#L13)的 Steam 登录获取的是 Facepunch 伴侣登录回调中的身份与 token；“原生获取全部凭据”不能理解为生成 Rust 游戏的 EAC 证明。

还核对了容易误读的 `getNexusAuth`：公开协议返回 `serverId` 和 `playerToken`。本机 protocol2635 服务端 `CompanionServer.Handlers.NexusAuth` 的实现先检查 Nexus `appKey`，随后调用 `UserPersistance.GetOrGenerateAppToken`，将返回值写入 AppNexusAuth.playerToken。它仍然是应用令牌，不是 EAC 的 BeginSession、消息验证或客户端完整性证明。

## 人数字段：新增了直接的服务端依据

[AppInfo.players](https://github.com/liamcottle/rustplus.js/blob/75915f25fc7c1718f7c23c419953f4655840fade/rustplus.proto#L223)是服务器信息响应字段。

只读静态检查本机已有、已记录 SHA256 的 protocol2635 Assembly-CSharp.dll 后，`CompanionServer.Handlers.Info.Execute()` 的路径为：

```text
读取 BasePlayer.activePlayerList
调用 get_Count()
写入 ProtoBuf.AppInfo.players
```

该方法构造信息响应并发送给伴侣连接；这个读取/回复路径不提交、增加或认证 Facepunch 公共人数。**因此，即使 Rust+ 显示五人，也不能证明公共映射收录了五人。** 新增 Rust+ 查询可以成为另一项内部人数对照，不能作为公共计数修复。

当前 `AppRequest` 没有“增加公共人数”“注册 EAC 会话”或普通 BasePlayer 行走/跳跃输入。摄像头 `cameraInput` 是远程摄像头/设备控制的协议，不能仅凭名称视为正常玩家移动。`getTeamInfo` 也只提供其权限允许的团队成员信息，不保证完整服务器玩家名单。

## EAC 官方资料复核

本轮通过浏览器重新渲染并读取了：

- [EOS_AntiCheatClient_BeginSession](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session)：成功返回表示客户端可以开始与服务器/对等端交换反作弊消息；它本身不等于服务端已经接受认证。
- [AntiCheatClient 接口](https://dev.epicgames.com/docs/api-ref/interfaces/anti-cheat-client)：包括消息收发回调、完整性事件和会话接口。
- [Using Anti-Cheat](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/using-anti-cheat)：包括产品配置的客户端模块、引导启动、完整性目录/密钥，以及客户端/服务端会话注册和消息交互。文档说明完整性目录缺失或未加载会阻止进入受保护多人会话。

Rust+ 的 companion token 没有替代这些条件的公开接口。给自己的程序配置另一个 EOS 产品，也不能据此推出它能通过 Rust 产品的校验。Steam 登录、Rust 游戏 Steam 票据、Rust+ 登录和 EAC 受保护会话需要分别验证。

资料没有据此证明“独立程序在任何授权条件下永远不可能接入”；但本轮没有获得支持独立程序接入 Rust 产品的官方集成配置，也没有生成经 Rust 服务端验证的 EAC 会话。

## 对当前项目有用和无效的方向

| 目标 | Rust+ 线索的价值 |
| --- | --- |
| 读取地图、服务器内部人数、队伍状态 | 可以作为独立管理/观测通道；需要真实 app.port 和合法配对凭据，部分功能还需要团队权限 |
| 人工发送团队聊天、读取设备状态 | 公开库支持；团队聊天与现有全服聊天不同 |
| 创建正常玩家游戏连接 | 本轮核对的 Rust+ 协议不提供；继续由独立游戏连接模块负责 |
| 有效 Rust EAC 客户端会话 | 没找到能由 Rust+ 提供的实现或令牌转换接口 |
| 修复 Facepunch 公共人数 | 没找到；Rust+ getInfo 的人数来源是服务器内部活跃列表 |

本轮只完成研究与证据整理。没有给正在运行的项目安装 Rust+ 依赖、尝试配对、登录第三方凭据网站、向目标伴侣端口发起连接、改服务器插件或配置、重启本地服务、改变现有账号会话。没有因这条线索把 `eacVerified` 改为 true，也没有修改人数显示来掩盖差异。

## 检索范围与复核方式

49 次 HTTP 读取均返回200，包括五个项目的元数据/树/固定提交文件、GitHub 搜索、官方资料及一次搜索引擎查询；HTTP200不等于有效技术证据。GitHub `rustplus` 项目搜索共返回140项，本轮仅取前12项作为发现候选；`rustplus EAC` 的仓库与 issue 查询为0；`rustplus "player count"` 的 issue 查询为2。没有把这些有限查询解释为全网不存在实现。

`"rust+" EAC` 查询有101项，返回的首批主要是 Rust 游戏/编程语言或 EAC 工具同名结果，不能当作 Rust+ companion 实现。Bing 这次返回了与任务无关的页面，未当作技术来源。Epic 的 HTTP 原文主要为网页加载框架，因此以浏览器实际渲染的三份文档为内容证据。

相邻 JSON 保存固定提交、全部 HTTP URL/状态/哈希，以及浏览器文档和静态导出证据的哈希。原文、检索计划和静态导出脚本在 workspace 的 ignored `work/rustplus-review-20261026/`，游戏 DLL 不随 Git 分发。本轮没有代码改动，因此没有重新运行连接或回归测试；校验文档链接对应的固定文件、导出关键调用和全部证据哈希。
