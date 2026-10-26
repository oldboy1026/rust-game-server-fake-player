# RustJiaRen 参考源码与当前实现状态复核

2026-10-26，Asia/Shanghai。本轮目标由用户明确选择为 `202.189.21.58:30921`，查询端口 `30923`。用户确认当前电脑没有安装 Steam 和 Rust。

**本轮没有完成目标服的独立 EAC 认证，也没有验证公共人数修复。提供的参考实现是服务端人工构造连接资料、调用事件上报并修改 cp 的扩展，没有提供 Rust EAC 客户端实现。** 以下结论区分项目历史实测、源码观察与本轮公开查询。

## 最新进展：普通认证入服已经做过，EAC 仍然缺失

项目最新已同步提交为 `e8edc5d`。旧交接中的“没有建立过经过认证的 Rust 玩家连接”属于 2026-10-23 初始状态，已被后续证据更新：

| 要求 | 现有证据 | 当前结论 |
| --- | --- | --- |
| 独立 Steam 票据和 Rust 玩家连接 | 10月24–25日，在 `61.147.247.35:28015` 完成身份提交、Approval、Ready、自身实体、FinishLoading、持续连接及服务端票据验证；10月25日还有公共聊天核对 | 已有受限于该服安全配置的历史实测，详见 [独立连接](independent-connection-2026-10-24.md)和[聊天记录](independent-global-chat-2026-10-25.md)；本轮未重新执行 |
| 新目标 `202.189.21.58:30921` | 10月25日收到 EAC 消息后，worker 主动停止；未到 Approval/Ready | 尚未完成入服，见 [目标尝试记录](server-202-189-21-58-test-2026-10-25.md) |
| Rust 有效 EAC 会话 | 安装设置探测曾因缺少 ClientId 无法创建平台；官方客户端旧服连接发生在 secure=false 的环境 | 没有可验证的独立 EAC 会话，见 [设置探测](eac-installed-settings-test-2026-10-25.md)和[官方会话复核](official-eac-session-reuse-review-2026-10-25.md) |
| Facepunch 公共人数 | 已定位适用列表分支同时读取 cp 和公共映射；既有 Steam 认证成功、BUpdateUserData=true 等不足以解释后台采用条件 | 没有经过验证的修复，见 [人数查询链](count-query-reporting-deep-2026-10-24.md)和[原始上报观察](target-reporting-observer-2026-10-25.md) |

不能把旧服的普通入服证据推广到启用 EAC 的新目标，也不应继续把已经完成过的普通 Steam 认证描述为完全未实现。

## 新参考文件实际做了什么

读取范围为用户指定目录内的 10 个文件：7个 `.cs`、1个项目文件、1个解决方案和1个 PDB。只读取文本及计算哈希，未构建、加载或部署扩展。目录中未提供原始 DLL；反编译注释中的 MVID 不当作独立核验的二进制身份。原始源码、注释里的私人路径及 PDB 均未复制到仓库。

| 代码位置（相对参考目录） | 可直接观察到的行为 | 对用户目标的含义 |
| --- | --- | --- |
| `SimpleWS/SimpleWebSocketServer.cs:62`、`:67` | 随机生成四段数字的地址及60000–62999端口，写入新对象的 `ipaddress` | 这是对象字段赋值，不是取得网络 socket 的实际远端地址 |
| 同文件 `:64`、`:70` | `new Connection()` 后，使用提交来的票据调用 `BeginPlayerSession` | 可以请求 Steam 会话验证，不能据此认定存在 Rust 传输、玩家实体或 EAC 会话 |
| 同文件 `:79` | 直接以字面量成功状态调用 `Analytics.Azure.OnSteamAuth` | 该事件不是本次异步认证结果的回执 |
| 同文件 `:80`、`:81` | 等待固定15秒，调用 `Analytics.Azure.OnPlayerConnected` | 固定等待不能保证认证成功，也不等于正常玩家入服 |
| 同文件 `:140`、`:144` | 不等待异步 `JinRen` 完成，就发送 `status="ok"` | 即使验证失败，控制端也可能先收到“ok” |
| `Ext/RustJiaRen/OxideRustJiaRenHooks.cs:56`、`:79` | 订阅 Steam 验证回调；有正常网络连接或不在人工字典中的身份会跳过这条人工计数路径 | 这不是为已经正常连接的玩家修复漏发认证的实现 |
| 同文件 `:67` | 将标签改成正常活跃人数加内部 `FakePlayers` | 修改的是 cp，没有直接设置 Facepunch 公共映射的实现 |
| 同文件 `:84`、`:88` | 成功回调直接加一，失败直接减一并移出字典 | 代码未记录“本身份是否已计入”再去重或扣减，存在重复计数/负值的控制流可能；未作实服复现 |
| `Ext/RustJiaRen/Core.cs:48` | 将内部人工数等资料显示到控制台标题 | 标题不是入服或公共人数认证结果 |

**这里的 `Analytics.Azure.OnPlayerConnected(Connection)` 与 Oxide 的 `OnPlayerConnected(BasePlayer)` 不是同一个回调。** 所提供代码没有显示正常 RakNet 握手、ClientReady、BasePlayer.PlayerInit 或游戏状态同步路径，不能用它解释已经核实的标准 Welcome 回调；若其他组件另外创建玩家，需要那个组件的代码才能继续核对。

对原研究 manifest 的 `Assembly-CSharp.dll` 作 dnlib 静态读取，`Analytics.Azure.OnPlayerConnected`（token `0x06009272`）创建 EventRecord、读取连接资料并 SubmitPoint；`OnSteamAuth`（`0x06009288`）同样生成上报记录。两者不是玩家实体初始化或 EAC BeginSession 的替代接口。该程序集是研究版本，未声称与目标服当前二进制逐字节一致。

源码还在明文 WebSocket 上接收票据；所见处理路径没有认证检查，关闭事件只写日志而未完成会话清理。此样本不能直接作为承载真实账号票据的可部署集成。

## 对“同一电脑、不同IP”的修正

此前报告说明多路 UDP 出口可以让一台电脑表现为不同公网地址。这个网络结构仍然可行，但**本次源码提供了另一条直接可见的解释：服务端扩展人工写入随机地址字段。** 即使某个管理员日志读取了名为 `Connection.ipaddress` 的字段，字段也可能来自这种构造对象，不能仅凭名字把它当作内核观察到的实际连接。

因此，要证明真实多出口，应将日志与实际网络连接或服务端收包端点对应。本轮没有这类数据，也没有证据证明 `103.91.208.182:16666` 正在运行这份扩展，不能把本样本归因到该服务器。

## 目标服本轮公开查询

北京时间 **09:48:27–09:48:28** 并行读取同一目标的 A2S_INFO 和固定 Facepunch 公共接口：

| 来源 | 数值 |
| --- | ---: |
| A2S_INFO players | 65 |
| GameTags cp | 33 |
| bots | 0 |
| Facepunch 公共映射 | 33 |
| maxplayers 标签 | 200 |

游戏版本字符串为2635、changeset168909，回复的游戏端口30921与用户目标匹配。公共响应为HTTP200，Last-Modified为北京时间09:43:21、Age295、缓存命中。公共文件的版本时间早于当前 A2S 采样；两个33不是同一即时生成的后台结果。

按已经核对的适用普通列表分支，`min(cp, publicCount)` 此时为33。本机没有 Rust 客户端，没有实际观察游戏界面。65与33的差值不能直接认定为研究账号数或认证失败数；没有新建测试连接，也没有服务端实际名单，故此样本不构成人数修复实验。

## EAC 为什么仍未完成

本次重新读取的 [AntiCheatClient接口](https://dev.epicgames.com/docs/api-ref/interfaces/anti-cheat-client)列出了会话及消息接口；[BeginSession说明](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session)指出，调用成功后客户端才准备好与游戏服务端交换反作弊消息，切换游戏会话需要End后重新Begin。**BeginSession成功本身仍不是服务端最终接受认证的证明。** 页面正文从JSON数据中的MDX字符串读取，没有执行页面代码。

[Steam BeginAuthSession文档](https://partner.steamgames.com/doc/api/ISteamGameServer#BeginAuthSession)则明确，身份要等 `ValidateAuthTicketResponse_t` 成功回调才能确认。这与本扩展“接口先回ok、主动上报OK、固定等待”存在实际区别；Steam会话确认也不代替EAC消息交换。

用户已确认当前电脑没有 Steam/Rust。只读检查中3210服务未响应，没有Rust/EAC进程，之前E盘安装位置不可用；已检查的常见Steam目录也不存在。**未安装Steam桌面程序本身不阻止steam-user工作，但当前没有能验证该Rust产品EAC的官方运行环境或完整独立接入材料。** 本次参考只有服务端扩展源码，没有补齐此前缺少的Rust产品集成凭据、保护环境或EAC消息实现。

因此本轮没有重做一遍已知缺少前提的EOS负向探测，也没有把EAC消息忽略后继续、修改安全开关、人工创建玩家对象或构造上报事件当作认证完成。提供一个通用EOS产品、安装标识或复制旧会话，也没有本轮证据能使独立程序取得Rust的有效认证。

要推进实际验收，需要具备正常受保护Rust运行环境以取得同目标的EAC成功对照；若继续要求独立程序，则另外需要适用于该Rust产品和独立进程的有效接入材料与实现。安装官方游戏可以提供对照环境，**不代表独立程序认证会自动完成**。之后再在真实正常连接下配对认证结果、玩家实体、cp及多个新公共批次，才能判断人数是否被正确收录。

## 本轮交付及未完成项

已完成最新进展核对、参考源码分析、地址解释修正、人数公开快照，以及可重复运行的[只读源码审计工具](../tools/rust-research/audit-rustjiaren-source.mjs)。工具输出文件哈希和16个文本定位点，不是C#语义分析器；结论来自实际阅读对应方法，工具不建立玩家会话。

本轮未建立目标服新玩家连接、未生成经验证的Rust EAC会话、未验证公共人数修复。没有加载参考扩展、修改服务端设置、读取或发送现有账号票据、启动项目服务或关闭用户进程。源文件审计前后哈希一致。

同名JSON保存源码定位、哈希、静态方法引用、只读人数结果和官方来源获取元数据。证据说明的是本轮已完成的研究与具体缺口，不是上述三项功能的完成声明。
