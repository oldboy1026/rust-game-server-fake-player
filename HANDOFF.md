# 换电脑后的接续说明

最后整理日期：2026-10-24，Asia/Shanghai。

## 正在运行：单账号离服对照，必须恢复第三个账号

20:18 UTC RCON名单与本机账号仅在内存匹配，确认3个研究账号、0个其他玩家。`work/count-exclusive-window.mjs` exec session61686 正运行；20:21:41.830 UTC已正常断开第3账号，`work/count-exclusive-window-state.json` 的 restoreRequired=true。计划离服600秒，约20:31:42 UTC自动恢复，再观察600秒。**接续先读此状态并确认最终restoreRequired=false及第三账号重新entered_game，不能遗忘恢复。** 通过创建ignored `work/count-exclusive-window-stop` 可请求提早结束并进入finally恢复；不要强杀脚本。

20:20:42公共新批次已从3降为2，早于断开操作，不能归因于本次离服。20:20:43和20:21:14内部仍3个研究账号、无其他玩家，因此当前不存在“3个研究账号已全部可信收录”的证据。后续每30秒记录RCON匿名汇总和公共批次；本阶段不改服务器配置、不唤醒或重启会话。用户已答目前仅RCON权限，不能上传只读插件到目标服。

## 当前接续：临时统计开关已恢复，本地正常客户端对照待做

用户已提供目标RCON访问并明确同意：仅临时开启 `analytics.gameplay_analytics` 约12分钟，结束恢复False、不重启服务器。管理端点和密码仅保存在忽略的本机配置，不能写入提交或公开报告。

实际RCON19:44:23 UTC确认Players8；Gameplay=False、Tick=False、Performance=True、DryRun=False、EAC gameplay=True，gameplay_events使用Enabled的FPApi(server)。用户核对8人中3个是研究连接、5个是真实玩家，而列表仅3。不能仅归因于headless睡眠。

`work/rcon-gameplay-window.mjs` 已于19:49:32.939 UTC确认开启True，20:01:36.244 UTC恢复False，rollbackRequired=false；20:01:50 UTC另一次只读查询再次确认False。12分钟内Players始终8，Uploaded Bytes从98981增加到859058，但已观察公共新批次仍为3。DryRun=False且静态上传代码先检查HTTP成功才计字节；这仍不证明后台人数收录。被动WebRCON观察19:53–20:03未收到匹配上传诊断消息，不等于所有上传无错误。脱敏证据见 `gameplay-analytics-control-2026-10-24.json`。原始响应留work，不输出身份/管理端点/密码。

用户现已启动本地测试服 `127.0.0.1:20090`，查询20091；本地管理凭据仅存ignored配置。它在D:\RustServer\rustds运行，不应再称为完全未启动的副本。首次观察磁盘混用Rust.Global printable2634与Assembly-CSharp内联准入2635；此为更新前快照，后续变化见下一段及 `local-server-version-evidence-2026-10-24.json`。

后续更新：用户20:03–20:05 UTC更新并重启本地服，关键磁盘DLL恢复原版；新进程运行Protocol2635.289.1。正常客户端直连20:07:34观察Joining1→20:07:36 Players1，用户确认入世界，A2S/cp均1。随后只记录元数据的双socket本地UDP中转20093→20090已实际兼容本次正常客户端：20:10:35收到握手，20:11:04 Players1，用户确认进入世界，20:12:26离开并回直连。原版更新后的进程没有确认加载旧诊断插件，不得将旧进程0人基线当当前插件运行证据。CountDiagnostics0.1.1源码已准备、未实际编译执行。中转只记时间/方向/长度/首字节，不解码或保存认证载荷。

补充：0.1.1后已用现有SDK10.0.201/Roslyn5.3及16个本地Mono/服务端引用离线编译通过，未加载运行；源码SHA在 `count-diagnostics-build-2026-10-24.json`。中转20:14:48正常到期，共7722数据报；20093监听已关闭，20:15:40正常客户端直连Players1。修正后的中转生命周期仅语法复核，未重跑网络观察。远端只读确认Oxide2.0.7839；用户仅有RCON，不能上传源码，勿尝试控制台注入/任意代码执行来部署。

此前仅安装新的只读 `CountDiagnostics` Oxide源码，命令 `countdiag.snapshot`；0.1.0在旧进程编译/加载并取到0人/0连接基线，没有增加玩家或更改人数。现有pktmon在明确成功的3次loopback A2S查询中捕获0包，已停止且清空本次filter；不能拿空抓包推断客户端没发送。见 `local-test-server-observation-2026-10-24.json`。不要安装未知人数DLL或伪造上报。

## 最新：正常客户端对照完成，自身仍Sleeping

19:13:29–19:36:15 UTC两段48份只读采样已完成。用户退出到主菜单后，约19:24:30 UTC确认重新进入世界。三个独立账号全程保持不变，最后约30分钟留服且票据验证。Facepunch 19:15/19:20批次为5，19:25及19:30为4，19:35为3；用户也确认刷新收藏显示4。A2S/cp末段10/8、GMS8。不要将总人数变化唯一归因于用户，也未证明任一独立账号计入可信人数。见 `normal-client-count-control-2026-10-24.json`。

对照结束后已19:36:50正常关闭服务，19:37:02启动含ownPlayerState的新版本，并错开恢复三账号。19:37:55诊断三者Sleeping=true、ReceivingSnapshot=false，各4份自身快照，年龄14–24秒。当前管理服务exec session9053；下一步先GET会话状态，勿无故断开。没有发送PlayerTick。两帧纯输入候选有录制时ModelState为空及已醒竞态；尚未实现或执行。用户随后已提供RCON，见顶部的新观察。只读命令准备见 `rcon-player-count-observation.md`；不安装未知人数DLL或改统计。

## 最新接续：列表人数研究仍未完成

最新问题、运行实验和限制先读 `rust-research/player-count-update-2026-10-24.md`。用户确认目标 `61.147.247.35:28015`（查询 `28016`）的社区、收藏、历史列表均显示 5。三个独立会话已观察到自身实体、FinishLoading 和 Steam 接收方票据验证完成；A2S/cp 在三会话重连后从 `10/8` 增到 `13/11`，Steam CM GMS 精确目标认证人数为 11，而 Facepunch 公共人数服务多个新批次仍为 5。没有有效 EAC 会话。

尚未解决列表人数问题，不得将新增 Steam 活动上报或诊断接口称为已证修复。`D:\RustServer` 仅为用户提供的分析副本，不是远端当前运行目录。未启动、修改该副本或安装 DLL。优先继续对照另一条 `GameServers.GetServerList` 的统计及实际客户端可信人数消费路径。账号和网络原始记录留在忽略目录，勿输出凭据。当前阶段不应无故断开研究会话。

后续已恢复实际客户端消费闭环：公共接口回调→人数映射→按游戏IP+ConnectionPort查表→共享模型有限人数上限；客户端有一分钟请求阈值，与所观察的约五分钟远端批次分开解释。`GameServers.GetServerList` 目前未返回目标计数，不能当作空服证据。19:00代理修复让Steam CM复用现有系统HTTP代理，解决直连冷启动目录超时；19:03短暂Steam重连后，19:06:52已正常恢复三会话。继续工作先查实时状态，别把这些历史快照当作当前在线保证。

## 最新接续：独立 Steam 票据与原生传输已实测

**更新：当前目标已完成独立真实玩家入服。** `rust-session` 持续模式已匹配本账号实体和精确FinishLoading，确认PlayerInit→EnterGame；保持146.922秒后API优雅断开成功，再从网页重连成功。A2S人数9/cp7→10/cp8→断开后9/cp7。当前没有有效EAC受保护会话；服务器允许该连接的配置不能推广到其他secure目标。新网页路径：账号详情→Rust服务器连接。继续工作前先GET rust-session查询，避免打断已在线会话。

本机data/rust-runtime.json已保存Python和RakNet.dll路径；未提交。正常start.cmd可读取，不再需要每次手设环境变量。GET/POST/DELETE /v1/accounts/{id}/rust-session分别查询/连接/停止；关闭网页继续连接，服务重启后需重新点击连接。研究证据及限制见最新独立连接报告和player-admission-evidence-2026-10-24.json。此前“尚未独立入服”表述是历史状态。

网页重连后快照已运行271.672秒，接收59449条消息，仍为entered_game。原Steam/Rust进程保留作观察基线；没有进行两者全部退出后的重连实验。程序自行登录Steam和取得新票据，不使用原客户端会话或IPC；仍需兼容RakNet.dll。未实现或发送PlayerTick，不保证无限期留服。

先读 `rust-research/independent-connection-2026-10-24.md` 及同名 JSON。独立 Python + 安装目录 RakNet.dll 已与 `61.147.247.35:28015` 建立传输连接，收到 accepted 与 RequestUserInformation，未启动新的 Steam/Rust 客户端。独立 Steam 服务已取得并核验所有权及240字节会话票据，取得143字节加密应用票据，诊断票据取消确认。它们尚不能证明Rust玩家入服或有效EAC。

重连抓包内43,425个数据报、39,378个ACK、11个NAK已精确解析；数据报偏移8帧起点和ACK时间字段对应上游UDT时间字段分支。身份所有七个长度前缀u32LE；两次Ready均为982字节protobuf+头。此前“内部可靠消息/分片未解码”的记录已由新证据更新。

`steam-multi-account/src/game-auth.js` 提供脱敏诊断和互斥的内部票据lease，断线会abort并等待取消/清零。新增 `rust-connect` 限时研究API和Python worker，遇EAC/保护要求结束尝试。服务启动前配置 `RUST_NATIVE_DLL` 和 `RUST_PYTHON` 的本机绝对路径。原始票据不得复制到命令行、报告或Git；不能复用抓包中的EOS身份或他人票据。

首次独立身份尝试已实际运行60.078秒：Approved(encryption=0)→最小Ready→10078应用消息（1320 Entities/6257 EntityPosition/935 RPC），没有EAC或拒绝，由本地期限关闭。下一步明确匹配自身实体和FinishLoading，以及更长留服验证；不能把此阶段直接标为有效EAC。

## 最新接续：真实客户端已观测

2026-10-24 在用户的新电脑上启动了 Steam 管理服务（`http://127.0.0.1:3210/`，`/health` 成功）。用户提供 Rust 安装目录 `E:\SteamLibrary\steamapps\common\Rust`，客户端已运行。先阅读新增的 `rust-research/client-observation-2026-10-24.md` 和同名 JSON，再参考下面的历史研究。

当前客户端日志：protocol `2635.289.1`、changeset `168909`；Steam build ID `26140533`。客户端是 IL2CPP，metadata 版本字段 39。当前实际游戏目标为 `61.147.247.35:28015`，查询为 `28016`，与此前两台目标分开记录。

已完成 90 秒会话基线和 300 秒正常重连观察，主捕获共 107,740 包。两次完整 RakNet 离线握手的版本字节均为 6。MTU 位置按 BE 为 30725、LE 为 1400；不能直接套用上游默认字节序。RakNet security 标志为 0 不代表 EAC 状态。内部可靠消息、分片、应用载荷和加密边界仍未解码。

对当前服务器的四次独立 A2S 样本均为 players 比 cp 多 2（14/12 → 12/10），未取得服务端活跃名单或浏览器刷新显示，差异原因未定位。现有目标不能用于证明旧目标的 EAC 策略。仍未实现 Rust 独立玩家客户端或验证独立 EAC 会话。

新增复核工具：`tools/rust-research/capture-client.ps1`、`analyze-capture.mjs`。主采集原始资料在被忽略的 `captures/20261024-011608/`、`captures/20261024-reconnect/`，静态资料在 `work/`，不得推送。另外两段 10 秒采集分别复核正常清理与启动日志写入失败场景，结果均已停止并清空本次过滤器；对应 `captures/20261024-tool-validation/`、`captures/20261024-final-validation/`。下文所述“未安装客户端/未抓包”是 2026-10-23 历史状态，已由此次观察更新。

## 用户目标与当前进度

用户希望在一个 Windows 用户会话内，通过 Node.js 接口同时保持多个 Steam 账号在线，查看账号和库存、领取免费游戏，并进一步研究不启动完整 Rust 客户端的玩家入服与持续连接。

目前提供的 Steam 服务使用 `steam-user@5.3.0`，支持独立连接、Steam Guard、令牌加密存储、自动重连、账号详情、游戏库、库存、免费 AppID/SubID 许可申请，以及保存和恢复 `gamesPlayed()` 配置。账号在其他位置游戏时会暂停本服务的游戏活动设置。

Rust 部分已完成有证据依据的服务端静态研究和公开服务器查询。**没有建立过经过认证的 Rust 玩家连接，也没有生成或验证有效的 Rust EAC 客户端会话。** 不能把 A2S 查询成功、Steam 显示“正在玩 Rust”或应用层字段分析当成玩家入服成功。

已有服务测试曾在原电脑通过 15 项；此记录不代表在新电脑、当前提交或真实 Rust 客户端上重新验证。

## 当前接续点

原电脑没有安装 Rust，也无法启动游戏。用户计划晚上在另一台 Windows 电脑上继续，让 Codex 分析 Rust 安装目录，并由用户正常启动客户端、连接服务器，配合观察日志和网络活动。

**尚未获得客户端安装目录；尚未检查抓包工具和实际权限；尚未开始抓包。** 此仓库没有可直接运行的 Rust 无客户端入服程序。

建议先阅读：

1. `rust-research/研究报告.md`
2. `rust-research/evidence.json`
3. `rust-research/protocol-map.json`
4. `steam-multi-account/README.md`

2026-10-23 后续又完成了一轮公开资料与原生库研究，接着阅读 `rust-research/research-update-2026-10-23.md`、`rust-research/native-transport-evidence.json` 和 `rust-research/client-observation-plan.md`。新增 65 条来源记录保存在 `web-sources-2026-10-23.json`，原始第一轮证据保持独立。

新增的主要线索：相同 Steam manifest 的 x64 `RakNet.dll` 静态导出 36 个函数，包含 NET_StartClient，托管封装的 29 个原生导入全部匹配。没有加载或执行它。后续可优先评估复用原生传输；另有 `extremeheat/node-raknet-native` 的通用 Node.js 绑定候选，仍需实际兼容性证据。RakNet 传输版本、Rust 应用协议 2635 和身份标记 228 是不同字段。

观察准备已补充 Wireshark RakNet 解析器、完整包采集、阶段时间线和日志关联方案。pktmon 默认每包仅保存 128 字节，默认循环日志还可能覆盖开头。客户端未安装、未取得目录、未开始抓包的状态仍然成立。

用户已明确要求：每批文件更新后提交并推送到 Gitee，并核对远端提交；此偏好已写入 AGENTS.md。

新增人数问题：用户确认 Welcome.cs 使用 `OnPlayerConnected`，账号能持续留服，但 Rust 游戏内服务器列表人数不增加。详见 `rust-research/player-count-diagnosis.md`、`player-count-evidence.json` 和 `player-count-sources.json`。标准 Oxide 钩子位于 PlayerInit 的活跃列表添加之后；原版服务端每 30 秒将 `activePlayerList.Count` 写入 `cp` 标签。不能再简单归因于只到初始认证或短暂连接，也不能未经核对就把 cp 当成 A2S_INFO players 或 Rust 浏览器最终显示值。Steam 玩家资料另经 UpdatePlayerSession → BUpdateUserData 更新；本轮没有观察到实际调用失败或确认其对 A2S 人数字段的影响。下一步需要同一时刻的内部活跃列表、cp、A2S_INFO players 和手动刷新后的浏览器人数。目标服务端状态、完整 Welcome.cs 和控制程序均未取得；原因尚未定位。本轮没有新建玩家连接。

用户随后新增研究对象 `103.91.208.182:16666`（查询 16668），称一台电脑控制大量真实账号，不启动游戏客户端，每账号不同 IP/端口，持续留服且 Rust 玩家列表更新；地址来自服务器管理员插件或日志。详见 `rust-research/server-103-91-208-182.md` 与对应 observation.json。2026-10-23 15:38（北京时间）Steam GetServersAtAddress 证实登记的游戏/查询端口相符，但本机 A2S 初次及重试均超时；同时旧目标查询成功，1/150、cp1。未取得新目标人数或 EAC 配置。多 socket、多可路由地址/UDP 出口结构能解释网络现象，不能据此确认具体客户端和认证机制。地址字段的静态调用链已记录，但尚未取得管理员插件具体字段；没有建立玩家连接。两个目标的查询与用户观察需要分别保存。

## 在新电脑上的下一步

1. 获取用户提供的 Rust 安装目录，确认当前客户端版本、目录结构和普通客户端日志位置。静态读取程序集作为数据分析，区分托管程序集、原生网络组件和 EAC 组件。
2. 盘点本机已有工具，例如 pktmon、netsh trace、Wireshark/dumpcap/tshark 和 Npcap，以及实际 Windows 权限。先确认工具是否存在，不能预先承诺能观察全部进程内部操作。
3. 准备一次有阶段时间标记的正常客户端观察：启动 → 登录 → 连接目标 → 加载 → 进入世界 → 静止停留 → 断开。抓包开始前与用户协调启动时机。
4. 对照客户端日志与包的端点、方向、大小和时间，区分 Steam/EOS 通信、Rust 游戏端口和 A2S 查询。加密流量只能直接看到密文，抓包不自动产生明文、可复用会话或有效 EAC 认证。
5. 将新发现与现有服务端证据核对，记录可直接观察到的事实和仍缺少的部分。EAC 可能限制调试器、进程内存访问等观察手段。

原始抓包、客户端日志与机器资料放在被忽略的 `captures/` 或本地 `work/` 中。不得把登录令牌、Cookie、实际认证票据或其他账号秘密写入提交和公开报告。

## 目标服务器

- 游戏地址：`202.189.21.138:28015`
- 查询地址：`202.189.21.138:28017`
- 用户说明：最新版本，开启 EAC；没有提供服务器管理权限。
- 2026-10-23 14:10:54 的公开查询：protocol `2635`、build/changeset `168909`、标签 `ptrak`、3/150 人。
- `ptrak` 支持 RakNet 传输判断。VAC secure 标记为 true，不能据此证明 EAC 的具体执行配置。
- 完整查询记录见 `rust-research/target-query.json`。先重新查询，不能假定服务器一直保持同一版本。

## 已核对的关键技术事实

- 当前研究版本的连接标记为 `228 / 0xE4`，protocol 为 `2635`。
- Rust 应用层消息头是消息枚举加 `140`；它位于传输/加密封装内部，不能直接当作完整 UDP 报文。
- 服务端请求身份 → 客户端提交身份 → Steam/EAC 等准入 → 队列 → Approval → ClientReady → 玩家初始化。
- 身份读取顺序包含 SteamID、协议、OS、用户名、分支、Steam token、anticheatId、anticheatToken、changeset、构建时间和语言。具体类型和长度检查见 `protocol-map.json`。
- 玩家更新使用 `ProtoDelta<PlayerTick>` 和上一条状态作为基线，不能假定定时发送常量字节即可持续连接。
- 当前原始服务端使用 Epic Online Services。Steam 游戏会话票据、EOS 身份和 EAC 受保护会话各有自己的作用。
- EOS 共同登录封装使用 `ExternalCredentialType.SteamAppTicket=1`，官方文档指 Steam Encrypted App Ticket；这不等同于 Steam auth session ticket，也不证明真实 Rust 客户端已完成 EOS 登录。
- EAC 代码有 RegisterClient、ReceiveMessageFromClient、ProtectMessage/UnprotectMessage 和异步认证状态处理；前期准入是否等待完整后端认证取决于配置。
- 自己创建 EOS 产品、取得 Steam 票据或观察到反作弊消息，都不能据此断言获得 Rust 产品的有效 EAC 会话。
- 原生 RakNet 兼容、完整序列化与增量封装、真实客户端发送节奏、Rust 产品下的受保护会话仍需实际证据。

## 复核研究来源

使用 SteamRE DepotDownloader 3.4.0，对 Steam 专用服务器 App `258550` 进行匿名下载，仅取得 7 个原始程序集：

| Depot | Manifest |
| --- | --- |
| 258551 | 93946663446561466 |
| 258554 | 2507054976021021832 |

静态工具为 dnlib 4.5.0。`evidence.json` 保存 7 个模块的 SHA-256、MVID 和 24 条方法记录；`protocol-map.json` 保存 28 个应用消息和 4 组部分 schema。原始游戏程序集、反编译中间文件和下载的第三方二进制未随仓库提交，可按 `tools/rust-research/README.md` 在本机获取和复核。

此前使用过 Oxide 2.0.7839 交叉核对，最终证据采用 Steam 原始文件。不要混淆 Steam build ID、游戏 changeset、网络 protocol。

## Steam 服务与迁移

- 需要 Node.js 22 或更新版本。`steam-multi-account/start.cmd` 在缺少依赖时执行 `npm ci`。
- 默认 HTTP 地址：`http://127.0.0.1:3210/`。管理页面可直接打开，`/v1/` API 需要 `Authorization: Bearer <本机 data/api-key.txt 内容>`。
- 使用 `open-dashboard.cmd` 可以自动带上本机密钥打开管理页面。不要把带密钥的 URL 粘贴到日志或聊天中。
- `data/accounts.enc` 使用 AES-GCM 保存账号资料；Windows 密钥由 DPAPI CurrentUser 保护，绑定电脑和用户。新电脑需要重新登录并完成 Steam Guard。
- 本仓库不包含账号数据、API 密钥、Cookie、刷新令牌、日志或 `node_modules`。原电脑运行中的服务也没有因本次上传而迁移或停止。
- 服务器代码和静态资源在启动时加载，修改后需要正常重启服务。不要启动两个服务同时访问同一个数据目录。
- 可复用 `steam-multi-account/src/network.js` 的 `createSteamNetwork()`。它支持环境变量和 Windows 静态代理检测；原电脑上普通 Node fetch 曾超时，代理配置属于各电脑本地设置。

## 给下一次 Codex 的提示词

> 请先阅读 HANDOFF.md 和 rust-research/研究报告.md，接着核实本机环境。我现在有安装 Rust 的电脑，会提供游戏目录并手动启动游戏。请先分析版本、文件和日志，再准备正常客户端连接过程的网络观察，结合时间线与现有证据更新研究。请准确区分观察事实、推断和未完成部分，保护所有账号凭据。
