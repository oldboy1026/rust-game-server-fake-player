# ReportingObserverFocused：第二阶段只读返回值观察

这是独立的自写Harmony候选观察器，用于把原 `BUpdateUserData` 的正常返回按指定账号分类，补齐旧观察器“只能看总数、不能归属账号”的缺口。它不补发资料、不调用原方法、不改参数、返回值、认证或人数。

**第一阶段只上传 PlayerCountProbe.cs。** 先取得目标真实运行快照和模块/框架信息，再决定本候选是否适用；当前未在目标服或Rust Mono加载。MVID一致不等于整个文件SHA一致，不能仅凭相同MVID宣称目标二进制与本机完全相同。

离线构建：

```powershell
./tools/rust-research/Build-ReportingObserverFocused.ps1 -ServerDirectory '你的服务端目录'
```

候选精确检查当前Steamworks MVID、SteamId类型/Value字段和托管方法签名；拒绝已有任何Harmony补丁链，仅安装自己的值参数postfix。若运行环境不匹配或已打补丁，会报告拒绝状态，不尝试覆盖或绕过。

分类配置只从固定 `HarmonyMods/ReportingObserverFocused-private.json` 读取一次，格式是只含 `researchIds` 字符串数组的JSON对象。身份由现有私有账号信息生成，最多20个唯一17位十进制字符串、文件最多4096字节。实际身份不放入Git、公开说明或日志。没有、为空或非法配置时明确记为unclassified，不能把未分类当作other；other也不自动等于真人。

状态写入固定 `HarmonyMods/ReportingObserverFocused-state.json`，仅时间、状态与三组计数，无身份、姓名、票据或参数。`calls/accepted/rejected`是正常返回的被观察调用，`skippedOriginal`单独记录后来其他补丁跳过原方法的情况；原方法抛出的异常保持原样，不能用这些计数证明无异常、最终准入、HTTP采用或trusted收录。

本观察器有180秒单调时钟计数截止，postfix自身也检查截止；到期清除用于匹配的身份数组并停止计数。**到期不自动卸载补丁**。有限窗口结束仍需官方管理员命令 `harmony.unload ReportingObserverFocused`，等待同一startedUtc的 `unloaded=true/patchInstalled=false`，然后按SHA移出自己复制的DLL和私有配置。官方加载命令是 `harmony.load ReportingObserverFocused`。卸载不卸载AppDomain程序集；异步最终写入完成前不要重载。

当前使用真实本机引用编译通过，同源代码在官方Harmony2.3.1.1/Windows CLR4上通过11组219断言，含25个非法配置case、600次并发调用、结果/原异常保持、截止和精确卸载保留第三方补丁。隔离目标是自编玩具方法；真实游戏目标成功发现、Rust Mono热加载、完整180秒墙钟窗口和公共人数效果仍未验证。旧 `ReportingObserver` 源码及历史观察没有改写。
