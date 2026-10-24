# 2026-10-24 恢复观察：自身死亡状态与连接中断

本轮没有修复 Rust 游戏列表人数。三个研究账号完成了已有入服检查，但自身实体完整快照均为 `dead`，随后三个连接全部中断；不能继续称它们在线。

## 观察范围

只读采样从 `2026-10-24T05:51:50.469Z` 开始，最近样本 `2026-10-24T06:07:36.450Z`。当前记录 31 份，RCON 可用 30 份；全量观察失败 1 份，A2S 超时 1 份，可信服务网络失败 1 份。
采样已于 `2026-10-24T06:07:37.710Z` 结束。UTC 时间加 8 小时为北京时间。采样脚本只读；主任务在独立操作中恢复了三个研究连接，报告整理过程未发起新实验。

账号以本次观察序号 1–3 表示。原始身份、管理端点、账号秘密和原始服务端回复不在此报告内。逐样本脱敏证据、来源文件 SHA256 和独立会话快照见同名 JSON。

## 已观察的结果

1. `05:56:13.173Z` 的三个会话均为 `entered_game`，已匹配自身实体并观察到精确 `FinishLoading`；当时 Steam 票据为 active，且接收方验证已观察到。三个自身快照都为 `lifeState=dead`、`sleeping=false`、`connectedFlag=true`、`receivingSnapshot=true`，各收到三份自身快照。
2. 完整快照中的 `dead` 与睡眠标志不同。`sleeping=false` 不能解释为已醒来的正常存活角色。静态链确认 `BaseCombatEntity.Die` 先设置 health 为 0、lifestate 为 Dead，`BasePlayer.OnDied` 调用 `EndSleeping`，所以死亡后睡眠标志为 false 有正常生命周期解释。此链未证明死亡导致可信人数不计入。`healthPositive=null` 仅代表没有观察到显式 health 字段。
3. `05:56:00.934Z`、`05:56:32.205Z`、`05:57:03.508Z` 三份在服样本中，RCON 都为 11（研究 3、其余 8），A2S 都为 14；cp 从 8 更新为 11，而可信服务 `05:56:31 GMT` 新批次仍为 7。观察持续较短，不能据此证明账号永久不计入。
4. `05:57:34.799Z` 样本已是研究 0、三会话 stopping。独立 `05:59:22.801Z` 快照中，三会话均已 error，记录 `transport_connection_lost`，各会话持续 106.484 / 101.469 / 96.437 秒，票据 `active=false`。API 留存的旧自身快照不能当作当前仍在服。
5. 后续其余账号人数从 8 变为 9，未核对身份集合。不能用总数稳定或变化推断相同人群，也不能把公开人数变化唯一归因于本次研究账号。
6. `06:06:32 GMT` 的可信新批次从 7 增至 8，首次于 `06:06:34.849Z` 观察到；此时研究账号已离服、其余账号为 9。这不是研究账号被计入的证据。

## 解释边界与下一步

这些记录支持增加生命状态诊断，尚不能解释连接丢失原因，或证明死亡与可信人数存在因果关系。Steam 票据验证、RCON 玩家状态、A2S、cp 与 Facepunch 可信人数是不同证据；本轮未验证有效 EAC 会话。

`receivingSnapshot=true` 来自最后收到的自身完整快照，之后没有新快照；它不等于当前仍在加载。API、RCON、A2S 与可信查询也存在秒级执行差，不能当作同一瞬间。

诊断的 `entityParseFailures` 是所有 Entity 的解析失败计数，不能称作自身实体解析失败。静态生命周期摘录在本机 ignored 的 `work/state-review-today/own-state.il.txt`，其 SHA256 保存在 JSON。

下一步应先核对普通自身重生与连接稳定性，再以存活状态及跨越多个可信新批次的有限观察做对照；暂不能把发送命令、连接成功或新诊断字段称为列表人数修复。

## 逐样本汇总

| UTC | RCON | 研究 | 其余 | A2S | cp | 可信 | 会话状态 |
|---|---:|---:|---:|---:|---:|---:|---|
| 05:51:50.500 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:52:21.835 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:52:53.114 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:53:24.404 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:53:55.705 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:54:27.010 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:54:58.305 | 8 | 0 | 8 | 11 | 8 | 7 | closed,closed,closed |
| 05:55:30.889 | — | — | — | — | — | — | observation_failed |
| 05:56:00.934 | 11 | 3 | 8 | 14 | 8 | 7 | entered_game,entered_game,entered_game |
| 05:56:32.205 | 11 | 3 | 8 | 14 | 11 | 7 | entered_game,entered_game,entered_game |
| 05:57:03.508 | 11 | 3 | 8 | 14 | 11 | 7 | entered_game,entered_game,entered_game |
| 05:57:34.799 | 8 | 0 | 8 | — | — | — | stopping,stopping,stopping |
| 05:58:13.092 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 05:58:44.397 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 05:59:15.694 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 05:59:47.003 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 06:00:18.301 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 06:00:49.595 | 8 | 0 | 8 | 11 | 8 | 7 | error,error,error |
| 06:01:20.901 | 8 | 0 | 8 | 12 | 8 | 7 | error,error,error |
| 06:01:52.197 | 8 | 0 | 8 | 12 | 8 | 7 | error,error,error |
| 06:02:23.506 | 8 | 0 | 8 | 12 | 8 | 7 | error,error,error |
| 06:02:54.792 | 9 | 0 | 9 | 12 | 8 | 7 | error,error,error |
| 06:03:26.098 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:03:57.422 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:04:28.693 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:05:00.028 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:05:31.284 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:06:02.602 | 9 | 0 | 9 | 12 | 9 | 7 | error,error,error |
| 06:06:33.893 | 9 | 0 | 9 | 12 | 9 | 8 | error,error,error |
| 06:07:05.162 | 9 | 0 | 9 | 12 | 9 | 8 | error,error,error |
| 06:07:36.450 | 9 | 0 | 9 | 12 | 9 | 8 | error,error,error |

“—”表示该样本没有可用数据，不代表零人。可信批次及各查询具体时间见 JSON。
