# 服务器上传包：公共人数刷新验证

另有独立的[管理员模拟网络视图](RustTestNetworkView.zh-CN.md)，只显示明确标记的测试IP/延迟，不改写真实连接、其他插件日志或公共人数；与本页刷新工具分开使用。

**需要已编译 DLL：** 请使用 [RustPresenceBridge 扩展及说明](rust-presence-bridge/README.zh-CN.md)，二进制在该目录的 `dist/Oxide.Ext.RustPresenceBridge.dll`。它放在 `RustDedicated_Data/Managed`，与下文 `.cs` 插件的目录不同。两者是相同刷新思路的两种交付形式，实验时选择一种即可。

此包是新写的 Oxide/uMod Rust 插件，不依赖提供的 RustJiaRen 扩展。它可以对已经完成正常入服的一个指定玩家重发原版 Steam 玩家资料，然后调用原版服务器信息更新。是否改变 Facepunch 公共人数，需要实服对照；目前未验证成功。它不能使停在 EAC 阶段的独立程序获得准入。

## 上传位置

找到运行 `RustDedicated` 的服务器根目录（面板中的游戏根目录），仅上传：

```text
本包 RustPresenceRefresh.cs → <Rust服务器根目录>/oxide/plugins/RustPresenceRefresh.cs
```

Windows 示例：`D:\RustServer\oxide\plugins\RustPresenceRefresh.cs`。
Linux 示例：`/home/rust/server/oxide/plugins/RustPresenceRefresh.cs`。
实际以服务器已有 `oxide/plugins` 目录为准，文件名与大小写保持一致。不要放进 `RustDedicated_Data/Managed`、`HarmonyMods` 或 `oxide/extensions`。

前提是服务器已安装与当前 Rust 版本匹配的 Oxide/uMod。本机只有部分参考 DLL，尚未用目标版本完整引用编译，也没有在目标服加载过；上传后以 Oxide 编译日志确认兼容性。纯原版服不能直接加载这个 `.cs` 文件。

## 加载与命令

上传通常自动加载。在服务器控制台或已有受保护的管理员 RCON 执行：

```text
oxide.load RustPresenceRefresh
rustpresence.snapshot
rustpresence.snapshot 你的17位SteamID64
rustpresence.refresh 你的17位SteamID64
```

若已经加载，更新文件后用 `oxide.reload RustPresenceRefresh`。命令只允许服务器控制台、RCON 或 authLevel>=2 管理员；无需开放任何新端口，无需给插件密码、票据或账号文件。输出只含状态和聚合人数，不主动输出目标昵称、IP 或 SteamID。

`normal_refresh_invoked` 只表示两个原版方法完成调用。底层 Steam bool 返回被原版包装丢弃，输出 `backendAccepted: null`，不能理解为公共后台已采用。

`target_not_a_ready_authenticated_player` 表示该账号还没有完成正常连接/认证/世界加载。停在 EAC 的独立程序会属于这种情况；先用一个正常客户端玩家做对照，不能用这个插件替代客户端认证。启用 secure 时额外要求存在 EAC 接口、玩家映射和本地认证状态；这些本地状态也不是完整 EAC 会话证明。

每次只刷新指定的一个现有玩家，全局冷却 30 秒。不新增 Connection、不填造 IP、不调用伪造的认证/分析事件、不直接改 cp，也不改 EAC 设置。插件不自动定时刷新、不改配置、不写持久化文件；原版更新仍可能触发现有其他插件的 `OnServerInformationUpdated` 钩子，因此它们若改写 cp，最终标签仍可能受影响。

## 配合本地网页验证

1. 打开本地 `/rust` 页面，“服务器公共人数查询”输入目标 **游戏**地址 `202.189.21.58:30921`。查询端口可留空自动查找，或明确填 `30923`。勾选玩家列表可读取 A2S_PLAYER，可能为空/隐藏，不含可验证 SteamID。
2. 先查询并记录 Facepunch 人数、cp、A2S 人数、`Last-Modified`、`Age`、时间；在服务器执行 `rustpresence.snapshot SteamID64`。这不是同一时刻生成的三份数据。
3. 只用一个已完成正常入服的测试账号执行 `rustpresence.refresh SteamID64`，保留返回结果。独立程序必须先真正完成准入才适用；当前目标的 EAC 阻塞尚未解决。
4. 30 秒之后再查网页，并继续观察 **Last-Modified 变化后的多个公共数据批次**。若后台几分钟未更新，等待其自然更新，不要靠连续刷新把同一缓存当成新批次。未列出表示未知，不能当 0。
5. 用正常客户端进出服作为对照，避免同时批量连接其他账号。即使公共人数上升，也不能仅凭聚合数字确定某个账号被计入；需要服务端实际名单与受控进出时序。稳定人数也不能单独证明刷新无效。

Facepunch 映射只读，没有公开的“设置人数”接口。A2S players、cp 和 Facepunch 人数分别显示，不能把 cp 上升当作公共人数修复。原参考文件中的随机地址和 FakePlayers 不是经过验证的真实玩家连接。

## 卸载

```text
oxide.unload RustPresenceRefresh
```

然后删除 `oxide/plugins/RustPresenceRefresh.cs`，否则重启可能再次加载。无需删除其他插件或重启服务器；本插件不持有认证会话、补丁或定时器。
