# 当前官方客户端 EAC 会话复用检查

2026-10-25，北京时间。**官方 EAC 模块确已加载，当前账号实际在服；但这条连接所在服务器关闭了 secure 路径，不能作为完整 EAC 后端认证成功的证据，也没有验证出能交给独立程序复用的会话。**

## 当前连接的直接证据

本次官方 RustClient 与 EasyAntiCheat_EOS 进程均从20:39:36持续运行。当前bootstrap日志20:39:37明确记录“Successfully initialized the Easy Anti-Cheat module”；游戏日志20:40:11记录“[EAC] Logging in with Steam ticket...”，20:40:12连接 `61.147.247.35:28015`。本次目标是旧服务器，并非之前要求EAC消息的 `202.189.21.58:30921`。

只读读取本机Steam活动身份，并与目标实际名单精确比对，20:48:29与20:50:52均在服；ConnectedSeconds496→639，末次Health100，RustClient与EAC进程ID和启动时间不变。本机身份未匹配到项目保存的39个账号，因此不能把它的身份结果归给项目中的其他测试账号。公开报告不包含身份、昵称、地址来源或位置。

## 服务端实际安全状态

读取服务器已有 PlayerCountProbe 0.1.0 的snapshot，没有安装、重载或修改插件：

| 项目 | 20:49及20:50读数 |
| --- | --- |
| effectiveSecure | false |
| effectiveEncryption | 0 |
| eacInterfaceAvailable | false |
| EAC映射句柄总数 | 0 |
| 实际玩家 | 4 |
| networkAuthenticated | 4 |
| eacStatusAuthenticated计数 | 4 |

最后一项不能独立证明后端EAC认证。参考原版EACServer.OnJoinGame的静态代码显示，secure关闭或编辑器分支会直接调用OnAuthenticatedLocal和OnAuthenticatedRemote；因此内部状态计数可以在无受保护交换时被置为完成。这里将原版IL作为解释参考，不声称与远端当前模块逐字节一致；当前安全标志、接口和句柄读数来自实时诊断。

客户端日志没有显示EOS Connect完成或EAC RemoteAuthComplete回调。客户端模块加载与服务器受保护认证是两个观察层次，不能只根据EAC进程运行、Steam票据登录开始、已进入世界或内部认证计数，就宣称当前连接有可复用的安全会话。

## 能复用什么

保留官方客户端作为实际玩家，可以用于普通入服、游玩和人数观察的对照。当前证据不支持把它的EAC会话复制、转移给独立worker，或用于另一个账号。此轮只读检查，没有读取进程内存、提取认证材料、注入、重放消息或执行会话转移。

本轮直接读取的[官方AntiCheatClient接口](https://dev.epicgames.com/docs/api-ref/interfaces/anti-cheat-client)列出Begin/End、消息回调和Protect/Unprotect等操作，未找到当前程序可用的已记录会话导出/导入接口。此结论限于已查接口，不断言厂商没有任何定制集成方式。[BeginSession文档](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-begin-session)还要求离开旧会话、进入另一会话时EndSession后重新BeginSession；[消息回调文档](https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-client-add-notify-message-to-server)限定成功Begin到End之间的同一生命周期。

要验证真正受保护的入服，后续需要官方客户端连接实际启用EAC的服务器，并取得对应会话认证证据；本轮保留当前连接，没有替用户切服。即使后来验证成功，也不能自动推出独立程序可接管该会话。

## 保存与清理

全部原始日志、身份、名单仅保存在ignored work/official-eac-session-review-20261025。报告JSON固定24项证据SHA；没有生产代码修改，验证范围为实际日志、两次名单/诊断、身份匹配和证据隐私核对，无新增单元测试。

首个只读server-check驱动已保存全部三条命令结果并请求关闭RCON，但Node进程仍存活，随后精确匹配并停止该单一驱动，退出1；不能称它自然退出。最终复核驱动完成结果与RCON关闭后按限时逻辑退出0。没有关闭RustClient、EAC或项目主服务，没有修改账号、游戏连接或服务端设置，也无待清理的本轮新玩家。
