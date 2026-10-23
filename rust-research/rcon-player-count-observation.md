# 管理员/RCON 人数与上报只读采样

目标是区分服务器活跃人数、事件生成和上传状态。下面的命令已在本地分析副本的注册表与方法体中核实；尚未在远端执行。本地副本不代表远端版本、插件或运行配置。

取得授权的 RCON 后，记录时间，逐行执行下面九条。变量命令后面不要加值、引号或其他参数。

```text
global.serverinfo
analytics.stats
analytics.tablestats
analytics.uploaderstats
analytics.gameplay_analytics
analytics.gameplay_tick_analytics
analytics.performance_analytics
analytics.dryrun
server.eac_gameplay_data
```

至少间隔 6 分钟，再记录时间并重复前四条；如果配置可能变化，也重复五条 getter。六分钟用于跨过本地默认五分钟事件批次，不保证公共人数已更新。若同时观察公共人数，应保存至少两个新发布批次及对应客户端刷新结果；全局批次更新本身也不证明目标服务器已重新计算。

保留以下汇总结果即可：

| 输出 | 关注内容 |
| --- | --- |
| `global.serverinfo` | Players、Joining、Queued、MaxPlayers、Protocol；Players 来源为活跃列表人数 |
| `analytics.stats` | 两次 SerializedCount、SerializedSize、UploadedSize、QueueCount 的变化 |
| `analytics.tablestats` | 服务器事件表选择的 uploader、上传间隔及序列化计数变化 |
| `analytics.uploaderstats` | 对应 uploader 的 Enabled、序列化计数；这里不是每个 uploader 的成功上传字节数 |
| 五条 getter | gameplay、tick、performance、DryRun 与 EAC gameplay 数据开关的实际值 |

判断时注意：

- `analytics.dryrun=true` 时，Enabled 和 UploadedSize 增长都不能证明发生网络上传。本地 Facepunch uploader 会跳过 HTTP 请求，但仍增加上传字节计数。
- Enabled=false 或队列下降并不等于上传成功：本地管理循环会清空禁用 uploader 对应的队列及累积数据。
- gameplay analytics 关闭会停掉周期玩家聚合；performance analytics 即使启用，相关事件默认也可能改为每小时生成。六分钟安静不能据此判定上报失败。
- 实际上传成功也不能证明某个账号计入公共可信人数。`server.eac_gameplay_data` 只控制额外 EAC 数据，不是 EAC 会话认证结果。
- 若远端提示命令不存在或无权限，保留该响应，先确认版本与权限。远端插件还可能拦截命令。

这一轮仅采汇总值。不要收集原始 `status`、批量枚举 analytics 配置或读取连接字符串/容器地址等敏感配置；不要设置值、flush、reset、重启或安装插件/DLL。上述汇总命令无需提供账号密码、RCON 密码或玩家标识到研究记录。

注册与方法证据：`ConsoleGen..cctor 06000203` 中的 `global.serverinfo`、三个 analytics stats 命令和五个变量 getter；`Admin.ServerInfo 06009E79`、`Analytics.Stats 06009228`、`TableStats 06009229`、`UploaderStats 0600922A`。本地控制台 `Command.DefaultCall 0600003B` 在无参数时跳过 setter。完整哈希、过滤条件和上传路径见 `trusted-count-reporting-evidence-2026-10-24.json`。
