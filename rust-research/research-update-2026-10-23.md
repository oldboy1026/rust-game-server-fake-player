# 第二轮公开资料与原生传输研究

日期：2026-10-23，Asia/Shanghai。

本轮最有用的新结果是：**取得与原研究相同 Steam manifest 中的原始 `RakNet.dll`，静态确认它提供客户端传输入口，且当前托管封装的 29 个原生导入都能在它的导出表中找到。** 这增加了一条值得验证的实现路线：评估复用原生传输库，同时继续研究 Rust 应用层与 EOS/EAC 会话。

另外核对了一个可配置传输版本的 Node.js RakNet 绑定、Wireshark 的 RakNet 解析器，以及 Windows 抓包和 EOS 消息生命周期的官方资料。新增 65 条公开来源获取记录，46 条用于本轮结论，6 条因缺失或错误页面被排除；其余属于搜索发现或备用材料。完整地址、时间、SHA-256 和使用状态见 [web-sources-2026-10-23.json](./web-sources-2026-10-23.json)。

**没有启动 Rust 客户端、调用新下载 DLL、建立玩家连接或生成有效 EAC 会话。** 以下区分已经观察到的事实和下一步需要验证的判断。

## 1. 原生 RakNet 库：新增的直接证据

通过 SteamRE DepotDownloader 3.4.0、匿名专用服务器订阅，取得：

| 项目 | 实际值 |
| --- | --- |
| Steam App / Depot | 258550 / 258551 |
| Manifest | 93946663446561466，与第一轮原始程序集来源相同 |
| 文件 | `RustDedicated_Data/Plugins/x86_64/RakNet.dll` |
| 大小 | 312,656 字节；压缩下载 164,576 字节 |
| SHA-256 | `a6d10e2c45dc346f889301fcda97da317d0b20b80b393be401a8bb65fcb7cc21` |
| PE 格式 | x64，PE32+ |
| 静态导入库 | `WS2_32.dll`、`KERNEL32.dll` |
| 命名导出 | 36 个 |
| 与托管声明比对 | `Facepunch.Raknet.dll` 的 29 个原生导入全部找到对应名称 |

关键导出包括 `NET_Create`、`NET_StartClient`、`NET_StartServer`、`NET_Receive`、`NETRCV_RawData`、`NETSND_Start`、`NETSND_WriteBytes`、`NETSND_Send` 和 `NET_CloseConnection`。托管声明的库名为 `RakNet`，P/Invoke 标记使用 `CallConvWinapi`。完整签名、方法 token、文件来源和限制见 [native-transport-evidence.json](./native-transport-evidence.json)。

静态观察支持“专用服务器所带的原生库也包含客户端接口”。它尚不能证明这些接口在独立宿主中能完成连接，也没有证明它与用户实际安装的客户端文件、目标服务器二进制或运行时配置相同。名称匹配之后，还要核对参数宽度、结构体布局、布尔值封送、缓冲区所有权、生命周期及加载依赖。PE 中有证书表，不等于已验证签名有效，更不等于获得 EAC 会话资格。

该路线可能减少重新实现 RakNet 外层传输的工作；Rust 玩家状态、Steam/EOS 身份和反作弊消息仍各自需要完成。仓库仅提交静态结果、文件白名单和 [inspect-native.mjs](../tools/rust-research/inspect-native.mjs)，原始 DLL 留在本机。

### 发送可靠性也得到进一步核对

当前 `Peer::ToRaknetPacketReliability` 的 IL，与公开 RakNet `PacketPriority.h` 枚举对应如下：

| Rust SendMethod | Rust 值 | 原生传输值 | 公开 RakNet 名称 |
| --- | --- | --- | --- |
| Reliable | 0 | 3 | RELIABLE_ORDERED |
| ReliableUnordered | 1 | 2 | RELIABLE |
| Unreliable | 2 | 0 | UNRELIABLE |

这说明未来封装发送接口时，应保留可靠性差异。方法 token 和 IL 文本哈希保存在新的原生证据文件中；[公开枚举源码](https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/PacketPriority.h)用于核对名称。单凭这张表仍不能决定每类 Rust 消息实际使用哪个通道和发送方式。

## 2. 可用候选项目，逐个说明范围

| 候选 | 核对到的内容 | 对本项目的帮助与限制 |
| --- | --- | --- |
| [extremeheat/node-raknet-native](https://github.com/extremeheat/node-raknet-native/tree/d66fe85a36a63633e6382fd089bf3f0d7a49e024) | Node.js 原生绑定；固定源码中的包版本 1.2.3，声明 ISC；有通用 Client/Server；可配置 protocolVersion | 是值得验证的 Node.js 传输候选。尚未安装、编译或验证 Node 22 和当前 Rust 兼容性 |
| [Asbra/RustInterceptor](https://github.com/Asbra/RustInterceptor/tree/4bc4d8ac2879e268342c1c4185d5998ecb4b9303) | 2016-12-01 的 Rust 客户端/服务器代理、包解析；依赖当时游戏的 Rust.Data.dll、UnityEngine.dll 和 RakNet.dll；MIT | 有历史封装与解析参考价值。它仍需要实际客户端，源码年代早于当前协议和 EOS 路径 |
| [b23r0/rust-raknet](https://github.com/b23r0/rust-raknet/tree/7599b2498c8cc1aa6f141ee00ca4aad3ba5f6e6c) | 以 Rust 编程语言实现的异步可靠 UDP/RakNet 库，所查 Cargo 版本 1.4.0 | 可作为传输实现候选；项目名称不表示已经支持 Facepunch Rust 玩家认证 |
| [PrismarineJS/bedrock-protocol](https://github.com/PrismarineJS/bedrock-protocol/tree/c9e1fbf21dc6abde8d89920996575791b79e66cf) | 明确面向 Minecraft Bedrock，带自己的序列化、Xbox 身份和加密 | 有传输分层参考价值；其游戏消息和身份流程不能据此套用到 Rust |
| [facebookarchive/RakNet](https://github.com/facebookarchive/RakNet/tree/1a169895a900c9fc4841c556e16514182b75faf8) | 原始公开实现，源码版本 4.081，公开传输协议常量 6 | 提供握手、可靠性、分片和重传的可核对基础；当前 Rust 所用的原生修改仍需比对 |

`raknet-native` 的源码将 `protocolVersion` 传给 `SetProtocolVersion`，其 gitlink 固定到 `extremeheat/fb-raknet` 的 `424ae0fcb5902171c10b5aa4fcc48c45dc984633`。这个 fork 的默认协议常量也是 **6**，README 的 Minecraft 示例显式设置为 **10**。这些数值属于 RakNet 传输层，**目标 Rust 实际使用的该值尚未观察到**。第一轮查到的 Rust 应用协议 **2635** 和身份报文标记 **228** 是另外两个字段，不能混作传输版本参数。

还有一个实现时容易踩到的细节：固定提交中的 `lib/RakNet.js` 实际发送 `encapsulated` 事件时传入 `{ buffer, address, guid }` 对象；README 部分示例把参数当成 Buffer。未来调用应以核对过的实际源码为准。

相关源文件：[原生 Client 实现](https://github.com/extremeheat/node-raknet-native/blob/d66fe85a36a63633e6382fd089bf3f0d7a49e024/src/RakClient.cpp)、[JS 包装](https://github.com/extremeheat/node-raknet-native/blob/d66fe85a36a63633e6382fd089bf3f0d7a49e024/lib/RakNet.js)、[固定子模块接口](https://github.com/extremeheat/fb-raknet/blob/424ae0fcb5902171c10b5aa4fcc48c45dc984633/Source/RakPeerInterface.h)。

## 3. Wireshark 已有 RakNet 解析器

[Wireshark 官方字段表](https://www.wireshark.org/docs/dfref/r/raknet.html)列出 RakNet 协议、可靠性、排序、ACK/NAK 和分片相关字段。核对的 [packet-raknet.c](https://github.com/wireshark/wireshark/blob/fe168fe75ceda882ef00271041ee8e53d7ab5dad/epan/dissectors/packet-raknet.c)具有 UDP 启发式识别，以及按会话保存解析状态的逻辑。

这可以帮助从真实客户端抓包中识别传输层结构，减少从零编写解析器的工作。应从启动连接之前开始保存数据，因为启发式识别和会话状态依赖早期握手信息。能识别 RakNet 外层，也不表示它能解释当前 Rust 的应用消息。

源码对于其所识别的 RakNet 加密会话，明确显示“Encrypted message”，并注明相关解密尚未支持。这里的 RakNet 会话加密，与 Rust/EOS 的应用消息保护还需分别辨认；本轮没有确定目标启用了哪些加密层。不能因 Wireshark 的显示名称就认定目标使用了某个具体加密配置。

## 4. 抓包准备得到的具体改进

本轮依据 [pktmon start](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-start)、[过滤器](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-filter-add)、[转换](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-etl2pcap)和 [dumpcap](https://www.wireshark.org/docs/man-pages/dumpcap.html)官方文档，整理了 [客户端观察方案](./client-observation-plan.md)。

- pktmon 默认每包只保存 **128 字节**；协议观察应显式使用 `--pkt-size 0` 保存完整包。
- pktmon 的多个过滤器以“至少匹配一个”的方式组合；同一条过滤器内的条件需要同时满足。用一条过滤器写两个端口，不表示“匹配其中一个端口”。
- pktmon 默认循环日志会覆盖最早的事件。观察握手时需要保留开头，方案使用可保留前序文件的模式并安排明确停止。
- 一个包可能在 Windows 网络栈的多个组件被观察到。应保留 ETL，并在转换时按组件核对，避免把组件重复记录误判成真正网络重传。
- `dumpcap -s 0` 使用足够大的 snapshot length 保存完整包。方案给出过滤到目标地址及游戏/查询端口的限时采集模板。
- Unity 官方资料提供 Player 日志位置与 `-logFile` 参数，但具体 Rust 文件位置需要本机确认。首轮观察保留正常启动条件；Unity 通用启动参数的存在不能证明 Rust 会以相同方式工作。

这些是已经查证的工具行为和准备步骤。本轮没有在用户的新电脑上运行抓包。

## 5. EOS/EAC 的补充事实

新核对的官方 API 资料增加了三个具体约束：

1. [AddNotifyMessageToServer](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-add-notify-message-to-server)说明：回调只在成功 BeginSession 到对应 EndSession 之间、ClientServer 模式下触发；回调从 `EOS_Platform_Tick` 的调用线程发出。数据是应交给服务端官方接收接口的 opaque binary。注册了回调，并不代表已经产生有效会话数据。
2. [BeginSession](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session)说明：离开一个游戏会话、连接另一个会话时，需要结束旧会话再开始新会话。这使后续断线/重连研究必须跟踪会话生命周期，不能只分析一次登录报文。
3. [ProtectMessage](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-protect-message)将 NetProtect 明确定义为可选的游戏消息加密功能。API 存在、认证完成，以及目标是否实际保护了某段游戏数据，是分别需要证据的问题。

官方集成文档还确认：反作弊消息经游戏自己的网络层传递，认证完成状态与会话数据处理之间存在持续过程。这与原始服务端中的 EAC 消息分发路径一致，但仍没有揭示可在独立程序中伪造有效 Rust 反作弊证明的方法。

## 6. 本轮明确排除的结果

公开检索存在大量同名或范围不同的结果，包括 Rust 编程语言库、Minecraft/SA-MP 机器人、Rust+ 伴侣程序和没有可核实实现的宣传。GitHub 检索只读取了有限结果页，不能据此断言所有公开或私有实现都不存在。

尝试访问的三个 Facepunch 客户端命令页面和两个猜测的 GitHub 仓库地址返回 404，均未用作事实依据。另一个 Epic FAQ 通过文本渲染器返回 HTTP 200，但正文明确写出目标 404；这条也被排除。其余 Epic 动态文档保留实际获取地址及哈希，标注通过第三方文本渲染读取。

## 7. 下一次实际推进的优先级

1. 在装有 Rust 的电脑记录真实客户端版本、相关文件哈希、原生库导出和日志位置，与本轮服务端库比对。
2. 按观察方案取得一次完整的正常连接与至少 10 分钟稳定停留的数据，先解决目标传输版本、实际封装与加密层未知的问题。
3. 在具备可观察结果后，评估复用原生 `RakNet.dll` 与通用 `raknet-native` 两条传输路线，分别记录它们能推进到哪个连接阶段。
4. 结合实际客户端证据继续核对 EOS/EAC 初始化与持续会话。只有真实玩家初始化、必要认证成功且持续在线，才可报告入服实现完成。

本轮增加了原生传输证据、可验证的候选库和具体采集准备，完整 Rust 独立客户端与有效 EAC 会话仍待实现。
