# 换电脑后的接续说明

最后整理日期：2026-10-24，Asia/Shanghai。

## 最新接续：独立 Steam 票据与原生传输已实测

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
