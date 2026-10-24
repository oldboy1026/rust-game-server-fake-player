# BUpdateUserData 返回值观察设计复核（2026-10-24）

当前本地程序集可定位到一个具有托管 IL 的内部实例方法，可作为只观察 bool 结果的 Harmony postfix 目标。**这里只验证了目标身份、调用链和设计边界，没有安装补丁、执行服务器程序集或发起网络请求。** 返回 true 只能说明该层调用返回 true，不能证明 Rust 最终准入、EAC 会话或公共可信人数收录。

## 准确目标与发现方式

| 层 | 当前签名 | 静态证据 |
| --- | --- | --- |
| 观察目标 | `bool Steamworks.ISteamGameServer.BUpdateUserData(Steamworks.SteamId steamIDUser, string pchPlayerName, uint uScore)` | `Facepunch.Steamworks.Win64.dll`，token `06000220`；internal 类型、assembly 可见、instance、非泛型、非 virtual；47 字节托管 IL，ImplAttributes 为 IL，无 NoInlining / AggressiveInlining 标志 |
| 原生导入 | `static extern bool Steamworks.ISteamGameServer._BUpdateUserData(IntPtr self, Steamworks.SteamId steamIDUser, IntPtr pchPlayerName, uint uScore)` | token `0600021F`；private static P/Invoke，PreserveSig，无托管方法体；导入 `steam_api64!SteamAPI_ISteamGameServer_BUpdateUserData`，不是本设计补丁目标 |
| 公共包装 | `static void Steamworks.SteamServer.UpdatePlayer(Steamworks.SteamId steamid, string name, int score)` | token `060009B1`；IL_0008 调用内部 bool 方法，IL_000D 直接 pop；在该 void 包装上不能直接读取原 bool |
| 平台包装 | `void Rust.Platform.Steam.SteamPlatform.UpdatePlayerSession(ulong userId, string userName)` | token `0600004B`；instance，向公共包装传 score=0；同样没有 bool 返回 |

运行时应从现有 `Steamworks.SteamServer` 所在 Assembly 寻找完整名称 `Steamworks.ISteamGameServer`，用 `Instance | Public | NonPublic | DeclaredOnly` 和准确参数类型 `SteamId,string,uint` 查找 `BUpdateUserData`。验证唯一方法、DeclaringType、bool 返回、非 static、非抽象、非泛型、非 P/Invoke 且确有 IL。找不到或存在歧义时只报告观察器不可用；不能改为猜测重载、原生导入或反射执行目标。token 和偏移仅用于本版本证据，不能当跨更新发现规则。版本/哈希不匹配须标明与本基线不同。

最小观察签名为 `static void Postfix(bool __result)`，bool 必须按值传入。它无需接收 `__instance`、原方法参数或 `__args`，因此不接触用户身份、名称或资料。只做原子 true/false 计数和时间记录，不返回替代值，不用 ref/out 改结果，不设置任何参数，不添加跳过原方法的 prefix、重写 IL 的 transpiler 或吞掉原异常的 finalizer。受支持时可额外按值读取 Harmony 的 `bool __runOriginal` 并单独计数“原方法被跳过”，但须先确认当前 Harmony API；该标志本身不能排除其他 transpiler、postfix 或 native 层改写。

独立加载器复核随后确认本地 Harmony 2.3.1.1 支持上述可选参数：`CreateReplacement`（060000D0）将 postfix 纳入参数检查；一旦任一补丁声明 `__runOriginal`，即创建并初始化为 true 的 bool local，再传给 postfix 参数生成。`EmitCallParameter`（060000D8）读取该 local。不能单独依据该方法“无 local 时发 false”的回退分支判断参数失效。完整加载器与注入 IL 留在另一项 ignored 证据 `work/harmony-loader-static/loader-injection-private.il.txt`，本报告不重复加载器研究；最小观察仍无需此参数。

## 调用时序与线程

正常路径由 `ConnectionAuth/<AuthorisationRoutine>d__6::MoveNext` 在 IL_003D 创建 `Auth_Steam.Run(connection)`，随后 IL_0042 使用 `MonoBehaviour.StartCoroutine` 调度。Steam 协程取得成功状态后，在 `Auth_Steam/<Run>d__1::MoveNext` IL_02D0 调 `UpdatePlayerSession`，继而同步到达 bool 目标。该正常游戏协程路径按 Unity 的主线程调度工作，不是观察器自身创建的后台任务；静态 IL 不能证明插件或其他运行补丁永远不会从其他线程调用它。

这一资料更新先于外层认证协程随后在 IL_0069 调度的 `Auth_EAC.Run`，也先于其他后续认证流程。因此即使 bool 返回 true，该账号仍可能在后续认证阶段退出。计数是方法调用次数，不是唯一玩家或最终成功入服数。

postfix 在原调用线程同步执行。应使用 Interlocked/Volatile 处理汇总，避免访问 Unity 对象、扫描玩家、写文件、打印日志、同步等待、网络或调用 Oxide API。若需验证线程，可在初始化主线程保留线程号，仅输出“与初始化线程相同/不同”的聚合次数，避免逐调用保留运行身份信息。

## 返回值、内联和其他补丁

内部方法先创建 UTF-8 临时字符串，在 IL_0017 进入原生导入，将 bool 保存于局部变量，finally 释放临时字符串，最后 IL_002D/002E 返回。普通 postfix 只观察正常返回路径；字符串构造、原生调用或 Dispose 抛异常时不会有一个可计作 false 的正常结果，不能把“未触发”解释为 Steam 拒绝。

目标没有 NoInlining 标志；47 字节及 finally 也不足以静态判断当前 Mono JIT 是否会内联。两个外层包装更小，但外层被内联并不自动等于内部目标失去可观测性。补丁注册成功不证明已编译调用会经过 detour；尤其在服务器已运行后安装，已有编译/内联调用可能使零次观察失去解释力。不能仅为补计数去主动补发资料或重复认证。先对一名正常客户端的真实连接验证 postfix 确实触发，并记录观察器从何时开始工作。

在安装前后检查 Harmony 已知目标补丁状态。其他 prefix 可能跳过原方法，transpiler 可能改变方法体，postfix 顺序也可能使观察值已被改变。只要存在未复核的其他补丁，就将结果标记为“当前补丁链返回值”，不能直接写成未经修改的原生调用回执。Harmony 的补丁清单也不能排除其他 detour 系统，故运行时仍保留该限制。

## 异常与卸载

观察器必须在自己的计数路径内处理异常，不将观察异常带回真实认证流程；禁止记录异常文本，因为其中可能包含外部模块的运行数据。它不能捕获或改变原方法异常。补丁安装出现部分成功或异常时，尝试按准确目标及自己的 postfix MethodInfo 清理，并核对自身补丁是否残留；失败须保留为明确诊断状态，不能报告 monitoring=true。

卸载先原子设置 stopping，令新到达和已在途的观察只做无操作返回；再只移除本插件自己的 postfix、解除已有事件订阅并销毁计时器。禁止全局 UnpatchAll 或移除其他插件的补丁。移除后核对自身 patch 是否残留，并使已捕获的静态 sink/实例引用始终可安全返回；unpatch 不代表所有在途调用已经瞬时退出。卸载时不等待主线程忙循环、不触发资料发布或认证。注册、正常触发、重载/卸载及零观察的实际行为仍需在授权本地服验证。

## 本轮证据与下一步

重新静态读取了本地 `Facepunch.Steamworks.Win64.dll`、`Rust.Platform.Steam.dll` 和 `Assembly-CSharp.dll`，均以 dnlib 当作数据读取。哈希与 `server-reporting-paths-2026-10-24.json` 基线一致。复核未执行插件、修改人数、修改认证、连接服务器或更改服务器配置。原始 metadata/IL 在 ignored `work/bupdate-observation-design/`，公开摘要只含方法与汇总设计信息。

下一步是先验证正规 Harmony 环境与准确补丁登记，再在授权测试服观察一次真实连接，确认目标会触发、返回计数和原有事件时序，并做卸载核验。只有取得正常触发证据后才能解释 true/false；无论何值，都仍需另行核对公共可信人数，不能据此宣布列表问题已修复。
