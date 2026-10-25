# Rust 公共人数：网络项目与资料复核

2026-10-25。按用户要求重新搜索 GitHub、Steam 官方资料、Facepunch 公开资料及插件社区，并逐项核对相关项目。**本轮没有在已检查资料中找到经过验证、能修复 Facepunch 公共人数的完整实现。** 找到的是可核对的查询路径、不同工具的数据来源，以及需要排除的误匹配项目。

本轮记录 127 次公开网页/API请求，其中 103 次返回HTTP200；这不是有效技术来源的数量。包括 22 组仓库检索、7 组issue检索、2 组提交检索，并对下表 13 个项目作分层复核。源码、README、仅仓库信息的检查深度分别标明；完整查询、状态、版本、逐项结论和证据SHA见[同名JSON](public-count-web-survey-2026-10-25.json)。

## 最有用的源码结果

**GameDig 的 Rust 数字来自 cp。** [固定提交的 Rust 解析分支](https://github.com/gamedig/node-gamedig/blob/41f3773cc46fceb433931cfea4bb8b9001d678f5/protocols/valve.js#L145)对标签 `cp` 取整数并写入 `state.numplayers`；[Rust配置](https://github.com/gamedig/node-gamedig/blob/41f3773cc46fceb433931cfea4bb8b9001d678f5/lib/games.js#L2603)选择 `valve` 协议。该分支没有查询 Facepunch playerCounts。因此 GameDig、监控机器人或基于它的网站显示14，而游戏内适用公共上限的列表显示3，可能只是读取来源不同。这不是让公共人数变成14的修复。

**直接更新 steam-user 暂无本轮源码依据。** 本次取到上游HEAD `02818bd08090b58ff54f1d9ce0073319b8e1eef7` 的 `gameservers.js`、`appauth.js`、`apps.js`、README，换行归一化后四份全部与本机一致。[服务器查询包装](https://github.com/DoctorMcKay/node-steam-user/blob/02818bd08090b58ff54f1d9ce0073319b8e1eef7/components/gameservers.js#L39)依然将 `auth_players` 映射成 `players`，也仍有旧的IP对象/端口映射；本项目已有精确目标查询适配器处理这些差异。[活动发送实现](https://github.com/DoctorMcKay/node-steam-user/blob/02818bd08090b58ff54f1d9ce0073319b8e1eef7/components/apps.js#L75)没有提供后台采用回执。没有在这四份上游文件中发现当前缺失的公共人数补丁；不能据此排除其他分支或未检查的提交。

**Steam 的两个 players 字段仍要区分。** [2026-09-09固定版本schema](https://github.com/SteamDatabase/Protobufs/blob/f5b0600750b2d5634c78f654845b6d5954f700db/steam/steammessages_clientserver_gameservers.proto#L95)分别定义 `auth_players=3`、`players=8`、`query_port=2`、`game_port=9`。字段名及编号不是 Facepunch 的资格算法；此前真实CM认证人数14、公共人数3的差异仍没有被这些定义解释。

**第三方“Rust服务器浏览器”可能展示另一条来源。** [K4RLis 主页面](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/index.html#L334)使用BattleMetrics；它还提供[Steam数据适配](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/index.html#L713)，把Steam的 `s.players` 直接显示，配套[Worker](https://github.com/K4RLis/rust-server-browser/blob/aad7d3b4ea036339874610404d2a7bb0ec2e7221/cloudflare-worker.js#L42)查询 `IGameServersService/GetServerList`。[rust-servers-io](https://github.com/zachrynewycz/rust-servers-io/blob/1e70151b83d0bda970a0ce0df0831001743c4090/app/api/getPopularRustServers.ts#L10)同样读取BattleMetrics。这些代码没有实现 Facepunch 公共人数的生成。对比数字时必须注明来源，不能把第三方页面增长当作游戏公共列表已增长。

## 项目筛选结果

| 项目 | 复核深度 | 结果及适用边界 |
| --- | --- | --- |
| [gamedig/node-gamedig](https://github.com/gamedig/node-gamedig) | 已核对固定提交源码 | Rust 使用 Valve/A2S，人数取 cp 标签；不代表 Facepunch 公共人数 |
| [DoctorMcKay/node-steam-user](https://github.com/DoctorMcKay/node-steam-user) | 已核对固定提交源码并比对本机 | auth_players 与活动发送路径明确；四份文件与本机一致 |
| [SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs) | 已核对2026年9月 schema | auth_players、players、游戏端口和查询端口分别定义 |
| [K4RLis/rust-server-browser](https://github.com/K4RLis/rust-server-browser) | 已核对 HTML 和 Worker 源码 | BattleMetrics + 可选 Steam GetServerList，直接采用各自 players |
| [zachrynewycz/rust-servers-io](https://github.com/zachrynewycz/rust-servers-io) | 已核对固定提交源码 | 请求 BattleMetrics 的 players |
| [NexExMachina/Paranoid.BlacklistMonitor](https://github.com/NexExMachina/Paranoid.BlacklistMonitor) | 已核对固定提交源码 | 读取 Servers.Banned，属于封禁监控 |
| [Asbra/RustInterceptor](https://github.com/Asbra/RustInterceptor) | 已核对固定提交 README/目录 | 2016年的正常客户端代理和解析项目，不是当前独立客户端实现 |
| [pede/Anti-AFK-Rust](https://github.com/pede/Anti-AFK-Rust) | 已核对固定提交源码 | Windows SendKeys，需要已有游戏客户端 |
| [niktodrugoi/bot_rust](https://github.com/niktodrugoi/bot_rust) | 已核对说明及仓库信息 | Facepunch提交通知 Telegram 机器人 |
| [community-network/server-bot-rust](https://github.com/community-network/server-bot-rust) | 已核对说明及仓库信息 | Rust语言编写的 Battlefield 状态机器人 |
| [RELAY-CN/FakePlayer](https://github.com/RELAY-CN/FakePlayer) | 已核对说明及仓库信息 | Rusted Warfare 的项目，游戏不同 |
| [ProPython244/FakePlayersz](https://github.com/ProPython244/FakePlayersz) | 已核对仓库接口 | 宣传涉及Rust，但仓库size0、提交409、README404，没有可复核实现 |
| [ThatRatDev/Boiler](https://github.com/ThatRatDev/Boiler) | 已核对说明及仓库信息 | Godot的Facepunch.Steamworks原生库加载封装 |

[Anti-AFK的原始代码](https://github.com/pede/Anti-AFK-Rust/blob/5f18dd03fa86247cda1ffaca8be266dd67824ca3/antiafk_rust/Form1.vb#L22)只发送D按键；没有下载执行它。[黑名单监控代码](https://github.com/NexExMachina/Paranoid.BlacklistMonitor/blob/2bcd0de0a130f00d635e4eb3a75a937707761aa6/index.js#L72)读取 `response.data.Servers.Banned`，不是playerCounts。包含Facepunch API、FakePlayer、Rust、headless等关键词，都不能代替实际调用链及运行证据。

## 官方资料与现有实验怎样对上

[Valve认证文档](https://partner.steamgames.com/doc/features/auth)明确区分票据获取、服务端开始验证、异步验证结果及结束时取消/关闭认证。当前项目已观察真实验证与入服；本轮未找到“已有成功验证后，再调用一个额外人数认证函数”这一要求。

[AdvertiseGame官方文档](https://partner.steamgames.com/doc/api/ISteamUser#AdvertiseGame)写明：

> When you are using Steam authentication system this call is never required, the auth system automatically sets the appropriate rich presence.

这是原生SDK对正常认证及丰富状态的描述，不能证明自写CM客户端完全重现其内部关联，也没有规定Facepunch后台人数公式。它支持继续将手动关联视作假设，而非必需修复。

结合[本日三阶段真实实验](presence-association-experiment-2026-10-25.md)：真实身份关联已匹配，但名单稳定时两份较新公共数据仍为3。此次公开源码复核没有找到可以推翻该观察、或指定后台将该账号计入人数的接口。服务端cp已经正确，重写同一个cp没有解决另一个公共来源的依据。

Facepunch的[社区插件指南](https://support.facepunchstudios.com/hc/en-us/articles/360009062817-Guidelines-for-community-servers-using-plugins-mods)讨论Community/Modded分类，没有给出公共人数筛选算法；本轮不将它作为算法证据。

## 本次检索的限制

- Bing请求虽然成功，但多份结果与问题无关，已排除；Google/Jina、DuckDuckGo、Brave、Yahoo以及raw.githubusercontent本次请求存在连接失败。所需GitHub源码改由公开contents接口按固定提交读取。
- grep.app返回429，Sourcegraph、Mojeek、uMod返回403，未绕过访问限制。未使用GitHub账号或用户密钥进行代码搜索。
- Facepunch提交站的四种查询URL显示同一批最新提交，没有取得有效过滤结果；这不是“完整官方提交历史不存在相关实现”的证据。三个尝试的wiki路径返回404，也未用作支持来源。
- Codefling按本次标题检索返回0，宽泛搜索结果噪声较多；不能据此否定其他名称、私有插件或未公开实现。
- 已读取的仓库搜索只覆盖返回候选和选中项目，不是遍历全部GitHub。本轮没有找到可复现修复，不等于已经证明别人无法实现。

## 接下来的可验证方向

1. 下一次有限对照首先记录测试账号从登录起的真实 `playingState/blocked` 与可获得的自身游戏活动状态，补齐上一轮未记录的采用可见性；查询失败保持未知，不用发送成功代替后台接受。
2. 在同一已登记目标、稳定身份名单下，对照正常官方客户端与独立连接的真实差异。公共批次、Steam认证、入服、睡眠/输入、有效EAC分别记录；不再拿不同来源的网站人数作验收。
3. 围绕实际漏报或正规取得的逐账号采纳依据选择修复。当前资料仍不足以确定Facepunch后台规则，因此不据这些项目制作人数修改DLL、重放认证或构造活跃事件。

本轮仅网络只读检索及源码作为文本的分析；没有登录Steam、创建或停止游戏连接、加载DLL、执行下载项目、修改服务器配置或发送任何机器人/Discord通知。现有用户会话保持由用户管理。
