# OnPlayerConnected 与 Rust 服务器列表人数

日期：2026-10-23，Asia/Shanghai。

用户观察：其他程序批量控制的账号触发 Welcome.cs 的 `OnPlayerConnected`，能够持续留服，但 Rust 游戏内服务器列表人数没有增加。完整插件、控制程序、服务端运行状态和同一时间的查询记录尚未取得。

**如果事件确实来自标准 Oxide 调用路径，且玩家持续存在于正常活跃列表，原版逻辑应当将其计入对外发布的 `cp` 人数。没有可见游戏窗口、使用程序控制或玩家不移动，本身不能解释人数长期不增加。** 游戏浏览器最终显示哪个字段仍需客户端证据，不能将 `cp` 与 A2S_INFO 的 `players` 字段直接视为同一个数。

## 已核实的调用路径

分析使用 Steam App 258550 / Depot 258551 / Manifest `93946663446561466` 的原始服务端程序集，以及固定提交 `aa85087dbf8ae6129d0c28da7680915f3ff56895` 的 Oxide 源码。它们不是从目标服务器取得的二进制，不能据此保证目标没有修改或插件干预。

| 环节 | 核实结果 | 证据定位 |
| --- | --- | --- |
| 玩家初始化 | `BasePlayer.PlayerInit` 先将玩家加入 `activePlayerList` | Assembly-CSharp.dll，方法 token `0x06001aa1`；IL_003D–IL_0043 |
| Oxide 事件 | `IOnPlayerConnected` 注入 `BasePlayer.PlayerInit`，InjectionIndex 225；随后调用公开 `OnPlayerConnected` | 固定提交的 Rust.opj 和 RustHooks.cs |
| 人数标签 | `ServerMgr.UpdateServerInformation` 从 `activePlayerList.Count` 取得 `cp{1}` 的值，格式化后写入 Steam GameTags | 同程序集；IL_0186、IL_01A1、IL_01A6，以及 `set_GameTags` 调用 |
| 更新调度 | `StartSteamServer` 将该更新安排在启动后 2 秒首次调用，之后每 30 秒一次 | 同程序集；`InvokeRepeating("UpdateServerInformation", 2f, 30f)` |

这使“只发送了最初的认证请求”不足以解释用户描述的标准事件。事件仍不能单独证明客户端地图已加载完、持续状态同步正常，或特定 EAC 策略的验证结果。

30 秒是这份服务端代码更新信息的调度周期，不是整个浏览器必定刷新的时限。Steam 发布、查询代理和浏览器缓存可能另外引入延迟。若持续多分钟且重新刷新仍不变，仅凭这个周期也不能解释。

## Steam 玩家资料还有另一条更新路径

静态代码显示：

```text
Auth_Steam.Run 的成功路径
  → IPlatformService.UpdatePlayerSession(steamId, name)
  → SteamPlatform.UpdatePlayerSession
  → SteamServer.UpdatePlayer(steamId, name, 0)
  → ISteamGameServer.BUpdateUserData
```

`BeginPlayerSession` 则调用 Steam `BeginAuthSession`；`EndPlayerSession` 调用 `EndSession`。因此，应区分游戏内部活跃列表、Steam 认证会话、Steam 玩家资料和对外服务器查询。

[Steamworks 文档](https://partner.steamgames.com/doc/api/ISteamGameServer#BUpdateUserData)说明 `BUpdateUserData` 更新服务器浏览器和匹配界面中的玩家资料，并可能返回失败。当前托管 `SteamServer.UpdatePlayer` 丢弃其布尔返回值。**这里只观察到可能失败的接口和返回值处理，没有观察到目标服务器发生失败，也没有证据证明这个接口失败就会造成目标 A2S_INFO 人数不变。** 原生 Steam SDK 的人数生成细节未在本轮解析。

另外，`server.censorplayerlist` 在这段认证代码中选择随机化的玩家名，然后仍然执行 `UpdatePlayerSession`，不能据此直接解释“人数不增加”。Steam 全游戏并发人数 API `SteamUserStats.PlayerCountAsync` 与单台服务器人数无关。

## 怎样定位这一次的差异

需要同一时间、同一台服务器的四组数值。最好记录账号加入前、加入后，以及超过数次 30 秒周期后的状态。

| 观察位置 | 需要记录 | 如何取得 |
| --- | --- | --- |
| 服务器内部 | 指定 SteamID 是否在活跃玩家名单、活跃总人数、是否仍有网络连接 | 管理员控制台 `status`；必要时由管理员只读检查 `BasePlayer.activePlayerList` 和 `net.connection` |
| Rust 人数标签 | GameTags 中的 `cpN`、`mpN` | 仓库的 A2S 查询工具输出 `info.result.tags` |
| Steam 查询人数 | A2S_INFO 的 `players`、`maxPlayers`、`bots` | 同一次查询的 `info.result` |
| 游戏浏览器 | 手动刷新后的显示人数、观察时间、所选服务器端点 | Rust 游戏内查看 |

```powershell
node .\rust-research\query-server.mjs --host 202.189.21.138 --port 28017
```

这个命令只读取公开信息，不会建立玩家连接。单次查询也不能识别某个 SteamID 是否计入。

| 同时观察到的结果 | 优先检查方向 |
| --- | --- |
| 活跃人数、cp、A2S_INFO players 都增加，界面不增加 | 浏览器缓存、刷新路径，以及所选端点是否相同 |
| 活跃人数和 cp 增加，A2S_INFO players 不增加 | Steam 查询发布状态、原生 SDK 玩家会话/资料状态、查询代理；还需确认 Rust 浏览器选取哪个字段 |
| 活跃人数增加，但跨多个周期 cp 不变 | 信息更新是否执行、标签是否被插件覆盖、查询是否经过代理或指向另一实例 |
| 欢迎提示出现，但指定账号不在正常活跃列表 | 事件是否由插件主动调用、NPC 或其他非标准对象处理、提示是否对应当前连接 |

这些是排查分支，不是已确认的故障原因。普通玩家通常无法看到完整 `status`；如果没有管理员配合，可以先对照 cp、A2S_INFO 和游戏界面，但不能仅凭外部查询确认某个账号的内部状态。

## 结论和限制

标准事件加上持续留服，比一条“正在连接”的消息提供更多证据；它仍不能揭示其他程序实际采用了独立协议客户端、隐藏或远程游戏进程，还是服务端插件配合。批量控制也不能单独证明没有游戏客户端或已经绕过 EAC。

当前最有依据的结论是：**应检查内部活跃人数与对外发布/显示的人数是否一致，而不能把“没有启动可见游戏客户端”当成人数不增加的正常规则。实际原因仍未定位。** 这次没有登录目标服务器，也没有得到有效 EAC 会话。

方法 token、模块 SHA-256、MVID 和选取的 IL 上下文见 [player-count-evidence.json](./player-count-evidence.json)。公开资料元数据见 [player-count-sources.json](./player-count-sources.json)。原始程序集、完整反编译文件和网页快照未提交。
