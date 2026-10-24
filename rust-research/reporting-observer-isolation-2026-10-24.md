# ReportingObserver 离线 Harmony 隔离验证（2026-10-24）

**最终源码在 Windows 现有 CLR 4 下完成实际 Harmony 隔离验证：8 组、38 次断言通过。** 使用现有官方 Harmony 2.3.1.1 和自编玩具方法，没有加载 Steam/Rust/Unity 游戏程序集、部署插件、接触服务器或发起网络请求。这证明的是被测 Observer 逻辑与该隔离运行时的行为，不能替代实际服务器 Mono、官方加载器或真实客户端触发验证。

将最终公开 `ReportingObserver.cs` 按原字节复制到 ignored `work/observer-isolation/`，与自建 `IHarmonyModHooks`、参数类及 `UnityEngine.Application` 空白替身共同编译，使用安装目录现有的官方 `0Harmony.dll`。最终源码 SHA256 为 `8a2105b4f93b743423a621e80976b3621a0a3c9d9a106b82f05d29432a988757`，运行结束时与公开源码仍一致。使用现有 .NET SDK 10.0.201 的 csc，引用 Windows 已安装的 Framework 4 标准库，再由系统 CLR `4.0.30319.42000` 执行；未 restore、下载、安装运行时或替换 Harmony。编译与执行退出码均为 0。

验证时使用**同一源码的私有 postfix 方法**，实际由官方 Harmony 安装到自编 NoInlining bool/try-finally 玩具方法上。为了不伪造真实目标模块，harness 不更改真实发现规则，而仅用反射设置隔离 Observer 的玩具目标、Harmony 实例和观察截止时间。已通过：

- 不存在真实目标模块时，原版 `OnLoaded` 拒绝安装、保持未观察状态，并写出可解析的拒绝汇总 JSON。
- 原始 true、false 结果保持，原方法和 finally 各执行一次；计数为 calls=2、accepted=1、rejected=1。
- 原始异常的同一个对象正常透出，finally 仍执行，异常退出不误计为 false 或 skipped。
- 把单调时钟截止时间设为已经过期后，postfix 自行停止计数；即使没有 Timer 驱动，原 true 和 finally 仍正常执行，所有计数保持不变。这里没有等待真实 180 秒。
- 在玩具目标追加自编第三方 prefix，使其跳过原方法时，`__runOriginal=false`，只增加 skippedOriginal=1，并保留该 prefix 的玩具返回值。
- 调用源码 `RemoveOwnPatch` 精确移除本 Observer，第三方 prefix 仍登记并生效，Observer 不再计数。
- 调用源码 `OnUnloaded` 关闭观察、移除自身补丁并记录卸载状态，同时保留第三方 prefix 的行为。
- 运行时程序集审计确认没有加载真实 Steam、Rust 或 Unity 游戏程序集；仅有自编程序、官方 Harmony、标准 Framework 库及 Harmony 生成的辅助程序集。

较早一次使用 .NET 10.0.5 的尝试保留为独立兼容性证据：在旧源码 SHA `dcdb2c5150a83d30b2829967553b4208457932a795097ed98591910f0ccdf14c` 下，编译成功、6 次前置断言通过，但首次 `Harmony.Patch` 失败。异常链为 `HarmonySharedState` 初始化失败 → `MonoMod.Utils.ReflectionHelper` 初始化失败 → `MethodAccessException`，涉及库访问 `System.Reflection.Emit.SignatureHelper.GetMethodSigHelper`。最终 CLR 4 成功不抹去该 .NET 10 兼容边界；也没有通过修改访问控制或库来规避它。

真实游戏目标发现成功、官方加载器注册、正常客户端触发、真实服务器 Mono JIT/热加载覆盖、完整 Timer 与 180 秒现实时间过程、最终后台文件持久化和公共可信人数均未在此隔离测试中验证。卸载检查使用的 Observer 没有成功发现真实目标，因此未创建运行中的真实 Timer；不能将补丁清理通过扩大为所有定时器竞态已经测过。

自编 harness、stubs、完整编译参数、最终源码快照、CLR 4 成功记录和 .NET 10 失败记录均独立保留在 ignored `work/observer-isolation/`。可复核摘要在同名 JSON。玩具目标显式禁用了内联，结果不能推广为真实服务器 Mono 的热加载/JIT 覆盖证明。
