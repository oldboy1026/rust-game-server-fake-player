# ReportingObserver 0.1.0

Rust 自带 Harmony 加载器使用的有限被动诊断 DLL。它只观察正常 `BUpdateUserData` 托管包装的返回值，不重发请求，不生成玩家、人数、认证或统计事件。返回 true 仅表示该方法正常返回 true，不能证明最终 EAC 认证、玩家准入或公共可信人数收录。

与 `ReportingDiagnostics.cs` 的 Oxide 入口不同，本源码实现官方 `IHarmonyModHooks`。依赖使用服务器自身文件，不需要替换任何游戏 DLL 或另带 Harmony。

## 构建

从仓库根目录执行，需要现有稳定 .NET SDK：

```powershell
./tools/rust-research/Build-ReportingObserver.ps1 -ServerDirectory '你的服务端根目录'
```

构建只读取服务端引用的元数据，产物和构建记录默认位于被 Git 忽略的 `work/reporting-observer-build`。当前源码固定本轮 Steamworks 模块 MVID 与精确方法签名；不同版本会拒绝安装，不能去掉校验后直接推广。

## 有限诊断契约

经审查、针对实际运行版本验证后，DLL 放服务端根目录的 `HarmonyMods`，由管理员使用正常命令加载和卸载：

```text
harmony.load ReportingObserver
harmony.unload ReportingObserver
```

源码没有自动补丁属性。加载时先检查精确目标及已有补丁链；已有其他补丁会拒绝安装。只安装返回 void、以值参数接收 `__result` 与 `__runOriginal` 的 postfix，不接收任何身份/姓名/分数参数。原方法未执行时单独累计 skipped；原方法异常不计为 false。卸载只移除自身确切 postfix，并检查残留。

结果写入 `HarmonyMods/ReportingObserver-state.json`，只有固定状态、时间与汇总计数，后台每秒更新，不输出异常原文或认证资料。`calls/accepted/rejected` 是回调计数，不能解释为独立账号数。并发时计数分别读取，不是事务快照。

加载后最多观察180秒，截止时间用单调时钟，并在postfix自身检查，因此不依赖后台写盘是否及时。到期停止计数和定时更新，但仍必须显式卸载；只有 matching `startedUtc`、`unloaded=true`、`patchInstalled=false` 才算本次插件自检清理完成。不要快速重载：旧程序集的异步最终快照完成前可能覆盖同路径的新文件。

卸载不等待磁盘写入，避免阻塞游戏线程；最终快照在后台序列化写入。加载器不会释放已加载程序集，但正常卸载会移除其补丁与计时器。完成有限实验后移出本次 DLL，避免下次服务端启动自动扫描它。

热加载可能错过已经编译/内联的调用者。补丁已登记但计数0不能解释为上报失败；必须有真实正常流程触发，且前后核对没有新增其他目标补丁。CLR4隔离验证与实际服务端Mono运行证据分别记录，不能混为同一环境。

具体编译、隔离验证和本地实际运行结果见研究目录后续的独立报告；本文中的命令本身不是部署或人数修复成功的证明。未知 `FakePlayers.dll` 不属于本诊断工具，也不应放入本实验加载目录。
