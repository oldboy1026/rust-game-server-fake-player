# 本地玩家数量诊断

`CountDiagnostics.cs` 是供本地 Oxide Rust 测试服使用的只读插件源。`0.1.0` 已在更新前本地测试服编译运行，空服基线计数均为0；`0.1.1` 新增安全配置与认证聚合字段并完成离线编译。当前源码 `0.1.2` 再增加Steam接口可用性及后台登录状态，已使用17个本地引用离线编译通过，0错误0警告，尚未部署或运行；历史运行结果不能代替当前版本验证。

需要使用时，将源码放入**本地测试服**的 `oxide/plugins/CountDiagnostics.cs`，由该服的 Oxide 加载。随后在服务器控制台、本地测试服 RCON，或 `authLevel >= 2` 的管理员客户端控制台手动执行一次：

```text
countdiag.snapshot
```

命令无需参数，每次只返回一份 JSON。普通玩家收到 `{"error":"forbidden"}`。权限等级仅用于授权判断，不出现在输出中。移除本地插件文件即可由 Oxide 卸载。

| JSON 字段 | 含义 |
| --- | --- |
| `utc` | 本次采样的 UTC 时间 |
| `activeListEntries` | `BasePlayer.activePlayerList.Count` 原始列表项数 |
| `activeNonNull` | 活跃列表中非空托管对象引用数；`ReferenceEquals` 不排除 Unity 已销毁但仍留在列表的引用 |
| `activeSleeping` / `activeAwake` | 上述非空引用中 `IsSleeping()` 为真 / 假的数量 |
| `activeReceivingSnapshot` | 上述非空引用中 `IsReceivingSnapshot` 为真的数量 |
| `activeConnected` | 上述非空引用中 `IsConnected` 为真的数量 |
| `sleepingListEntries` | `BasePlayer.sleepingPlayerList.Count` 原始列表项数 |
| `networkConnectionEntries` | `Network.Net.sv.connections.Count` 原始连接项数 |
| `networkConnectedConnections` | 网络列表中非空连接的 `connected` 字段为真的数量 |
| `networkAuthenticatedConnections` | 网络列表中非空连接的 `isAuthenticated` getter 为真的数量 |
| `serverSecure` | 实际运行的 `Network.Net.sv.secure` 布尔值 |
| `serverEncryption` | 实际运行的 `Network.Net.sv.encryption` 整数值 |
| `steamInterfaceValid` | Steam游戏服务器接口指针是否非空 |
| `steamLoggedOn` | 接口有效时读取原生Steam后台登录状态；接口无效时为 `null` |
| `interfaceAvailable` | `EACServer.ValidInterface`，即当前 EAC 接口引用可用性 |
| `eacAuthenticatedConnections` | 网络列表中非空连接的 `EACServer.IsAuthenticated(connection)` 为真的数量 |

列表或网络服务器暂不可用时，对应字段为 `null`。`activeSleeping + activeAwake = activeNonNull`；快照和连接计数可能与睡眠状态重叠。睡眠列表和活跃列表是分别读取的集合，不能直接相加推算人数。网络连接列表可能包括尚在认证或加载的连接，连接项数不等同于已入服玩家数。

当前 DLL 中 `IsReceivingSnapshot` 读取玩家标志位 8，`IsSleeping()` 读取标志位 16；服务器端 `IsConnected` 检查网络服务器与玩家网络连接引用是否存在。它们均不验证有效 EAC 会话或 Facepunch 可信人数资格。

`serverSecure` 和 `serverEncryption` 读取网络服务器实例字段，而非仅回显同名配置变量；它们不证明每个连接当前已受保护。`networkAuthenticatedConnections` 的 getter 只比较五类本地认证状态字符串；插件只调用该 getter，不提取或输出这些字符串。它与 EAC 状态字典中的认证判断不同，也不等同于有效受保护 EAC 会话。

`steamInterfaceValid` 只表示本地Steam接口存在；该检查通过不表示已登录Steam后台。`steamLoggedOn` 调用只读 `SteamServer.LoggedOn` → `BLoggedOn`，有助于区别本地查询仍可答复与后台登录状态。它不触发登录、重连或上报，也不证明单个玩家认证、EAC会话或Facepunch收录。

已核对 `EACServer.ValidInterface` 与 `IsAuthenticated(Connection)` 均为 public static 只读查询：前者比较接口引用与 null，后者 `TryGetValue` 后判断本地状态枚举是否等于 2。其静态初始化器只创建本地字典和初始值，不注册客户端或启动认证。`interfaceAvailable` 为真只说明接口引用存在；`eacAuthenticatedConnections` 是本地缓存状态计数。两者分别采样，没有按接口可用性改写认证计数，也不能证明后端当前认可或 Facepunch 可信人数资格。

插件只遍历活跃对象及网络连接以累加上述状态，不读取身份、坐标或网络端点；回复只序列化显式列出的聚合值，不序列化原始玩家或连接对象。它不调用认证、注册或消息接口，不添加玩家、唤醒、变更 A2S/Steam 标签或 analytics，不创建伪造人数，不写文件，不设置定时器或自动采样。输出不含账号、玩家或实体身份、权限等级、认证状态文本、坐标、网络端点或认证票据。

本地未注册到公共服务的测试服，只能对照本地列表和真实客户端状态，**无法据此证实 Facepunch 收录或公共可信人数规则**。如需对照，应手动在正常客户端入服、加载完成、睡眠或退出各阶段各采一份，并分别记录客户端行为；插件不执行这些操作。

静态兼容性依据（本地分析副本，2026-10-24）：

| 程序集 | 已核对成员 |
| --- | --- |
| `Assembly-CSharp.dll` | public static `BasePlayer.activePlayerList` / `sleepingPlayerList`；public `IsSleeping()`、`IsReceivingSnapshot`、`IsConnected`；public static `EACServer.ValidInterface` 及 `IsAuthenticated(Connection)` |
| `Assembly-CSharp-firstpass.dll` | public static `Network.Net.sv`，类型为 `Network.Server` |
| `Facepunch.Network.dll` | public `Network.Server.connections`，类型为 `List<Network.Connection>`；public `secure: Boolean`、`encryption: Int32`；public `Connection.connected: Boolean`、`authLevel: UInt32`、`isAuthenticated` getter |
| `Facepunch.Console.dll` | public `ConsoleSystem.Arg.Connection`、`IsRcon`、`ReplyWith(object)`；该回复重载用 JSON 序列化选定对象 |
| `Facepunch.System.dll` | public `ListHashSet<T>.Count` 和 `GetEnumerator()` |
| `Facepunch.Steamworks.Win64.dll` | public static `Steamworks.SteamServer.IsValid`、`LoggedOn`；后者读取 `BLoggedOn` |
| `Oxide.Rust.dll` / `Oxide.CSharp.dll` | public `Oxide.Plugins.RustPlugin` 与 `Info`、`Description`、`ConsoleCommand` 属性 |

核对使用 dnlib 读取元数据与方法 IL，未执行所分析的游戏程序集。中间记录位于忽略目录 `work/steam-ticket-review/countdiag-metadata.txt`；换版本后需重新核对，静态核对不代替实际编译和运行结果。

`0.1.1` 的离线编译使用本机已有 .NET SDK `10.0.201` 中的 Roslyn C# 编译器 `5.3.0-2.26153.122`，通过响应文件直接调用编译器，引用本地测试服的 Managed DLL 元数据；没有 NuGet restore、下载、执行游戏程序集、安装插件或连接 RCON。首次缺少 `Facepunch.UnityEngine.dll` 引用，补齐该现有本地引用后编译成功，无源码修正，无编译错误或警告。源码及全部引用在编译前后哈希一致。

忽略目录中的 `work/countdiag-build-safe.json` 记录源码 SHA-256、编译器、16 个实际引用及其哈希、诊断和输出位置；响应文件及编译 DLL 仅保存在 `work/countdiag-build/`。编译成功只核对语法、可访问成员和引用类型，不代表 Oxide 实际加载或运行成功。部署只需源码，不随源码包分发编译 DLL 或第三方 DLL。

0.1.2的独立编译另存`work/countdiag-build-012-safe.json`及`work/countdiag-build-012/`，保留0.1.1记录；新增的第17个引用是现有`Facepunch.Steamworks.Win64.dll`。脱敏编译证据为`rust-research/count-diagnostics-build-0.1.2-2026-10-24.json`，源码SHA-256为`5e6df0256bc933e615cae9a621770e2423e2461fff4b7fcb38d9cc1c93a51f3a`。
