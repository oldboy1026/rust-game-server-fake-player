# ObserverStateBridge 0.1.0

独立的 Oxide 只读状态桥，供已有 RCON 通道读取自写 `ReportingObserverFocused` 的汇总状态。它不是人数修复插件，不生成玩家或认证事件，也不安装 Harmony 补丁。

它与 `PlayerCountProbe` 是两个独立插件。增加或卸载本桥不需要替换 Probe 源码，也不会主动重置 Probe 的 focus 统计窗口、订阅或计数。本桥没有采样计时器或游戏事件钩子。

## 构建与验证范围

从仓库根目录执行，需要现有稳定 .NET SDK：

```powershell
./tools/rust-research/Build-ObserverStateBridge.ps1 -ServerDirectory '你的服务端根目录'
```

构建只读取服务端引用的元数据；默认产物、编译日志和输入 SHA 位于被 Git 忽略的 `work/observer-state-bridge-build/`。构建脚本使用仓库相对路径，不要求沿用原电脑目录。

源码已针对当前本地服务端/Oxide 引用离线编译通过。同一份源码在 CLR4 与独立桩环境中通过 **5 组、65 条断言**，包括 25 个无效 schema 案例、RCON 权限/零参数/限频、旧文件与未来时间、读取上限及自写观察器状态兼容性。测试没有加载游戏程序集，没有连接服务器或部署插件；这些结果不能替代实际 Oxide 命令派发、远端序列化和磁盘延迟验证。

## 读取命令

经复核后可将文件保持原名 `ObserverStateBridge.cs` 放入目标服的 `oxide/plugins/`，由正常 Oxide 编译加载。文件名、插件类名和卸载名均为 `ObserverStateBridge`。这份说明本身不表示已完成部署。

通过已有 RCON 调用：

```text
observerstatebridge.snapshot
```

命令要求 `arg.IsRcon`，不接受任何参数；游戏内管理员也不能通过此命令读取文件。单个插件实例按单调时钟限制为每秒至多一次。权限、参数或限频错误只返回固定类别，不回显参数。

## 固定文件与 schema

桥只从当前服务端 `UnityEngine.Application.dataPath` 推导根目录，读取固定的：

```text
HarmonyMods/ReportingObserverFocused-state.json
```

它不读取私有 focus 配置、旧观察器文件或调用者指定路径，不写文件，不反射执行程序集。状态文件和 HarmonyMods 目录有普通文件/重解析点检查；读取最多 4097 字节，超过 **4096 字节** 即拒绝。检查不能保证抵御管理员同时替换文件链接，字节上限也不能保证异常或网络文件系统的访问时延。

解析器只接受生产者 **0.1.0 的固定字段及顺序**，重新构造返回对象，绝不直接回传原始 JSON。未知、重复、多余、缺失、换序字段，非预期类型、转义、尾随内容或无效 UTF-8 会拒绝整份状态。

| 内容 | 约束与解释 |
| --- | --- |
| version、windowSeconds | 固定为 `0.1.0` 和 `180` |
| startedUtc、observedUtc | 精确 UTC 时间格式；分别为观察器窗口起点与状态写入时间 |
| status、focusStatus | 只接受观察器定义的固定枚举，不转发任意字符串 |
| focusIdCount | 0–20，须与 focusStatus 相符；不返回账号身份 |
| patchInstalled、unloaded | 生产者状态布尔值；桥不会自己核验或改变补丁 |
| total、research、other、unclassified | 各含 calls、accepted、rejected、skippedOriginal；均为调用次数，不能解释为独立玩家数 |
| writeErrors | 生产者记录的写盘错误次数 |

计数必须为 0–1,000,000,000 的整数。每组 `calls=accepted+rejected`，三个分类逐项之和必须等于 total；缺失有效 focus 时不能宣称已有 research/other 调用。这个上限也会拒绝把 17 位身份值伪装成计数的文件。

拒绝时只返回 `observer_state_missing`、`observer_state_not_regular`、`observer_state_oversized`、`observer_state_invalid_schema` 或 `observer_state_read_failed` 等固定类别，不返回路径、原异常或内容片段。读取成功只返回已验证的汇总对象，不包含身份、姓名、票据或密钥。

## 旧文件与结果解释

成功响应含 `retrievedUtc`、`snapshotAgeSeconds` 和 `observedWithin15Seconds`。`observer_state_available` 只表示读到了符合 schema 的文件，不能证明观察器仍在运行。未来时间的年龄为负，最近标志为 false；旧文件仍可作为历史记录返回。

应将 `startedUtc` 与本次实验预期窗口逐项对应，再检查 `observedUtc`、年龄、status、patchInstalled 和 unloaded。不要把上次加载留下的文件当成本次实时结果。桥不验证文件签名，服务器管理员可以替换文件。

`research/other` 仅代表观察器配置的内存分类；other 不自动等于真人。原方法返回 true、补丁已卸载或文件很新，都不能单独证明最终 EAC 认证、入世界、后台采用或公共可信人数收录。当前桥没有加入 Steamworks 方法摘要指纹命令；MVID 相同也不等于二进制 SHA 或全部代码相同。

## 收尾

完成读取后可独立卸载：

```text
oxide.unload ObserverStateBridge
```

若后续不再需要，应将本次 `ObserverStateBridge.cs` 移出目标服的 `oxide/plugins/`，防止下次启动自动加载。本桥不会卸载 `ReportingObserverFocused`、删除它的状态文件或清理它的私有配置；观察器本身仍需按自己的有限诊断契约正常卸载并核对结果。不要移动或删除其他插件。
