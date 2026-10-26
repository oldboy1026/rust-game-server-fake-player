# Steam 多账号管理与 Rust 连接研究

**2026-10-26 当前状态：** 用户已恢复研究，目标为 `202.189.21.58:30921`。独立程序已在此前关闭secure的目标上完成Steam认证、真实入服和公共聊天；有效Rust EAC会话及Facepunch公共人数修复仍未完成。请先阅读 [最新参考源码复核与接续条件](rust-research/rustjiaren-review-2026-10-26.md) 和 [HANDOFF.md](HANDOFF.md)。[10月24日归档](rust-research/FINAL-ARCHIVE-2026-10-24.md)保留当日历史状态。

这个项目包含可运行的 Node.js Steam 多账号管理服务，以及 Rust 2635 协议、EOS/EAC 会话的研究资料。

**已实现 Steam 多账号管理，并在 `61.147.247.35:28015` 通过独立 Node.js/Python 程序完成真实账号入服和持续连接。程序自行登录 Steam、取得票据和建立 Rust 传输，不调用 Steam 桌面客户端或 Rust 游戏进程。当前没有实现有效 EAC 受保护会话，结果限于已验证的服务器配置。**

实测期间原有 Steam/Rust 客户端保留作观察基线；尚未进行将两者全部退出后的重复连接。独立程序仍需要本机兼容版本的 `RakNet.dll` 和 64 位 Python。

## 在另一台 Windows 电脑继续

安装 Git 和 Node.js 22 或更新版本，在 PowerShell 中执行：

```powershell
git clone https://gitee.com/oldboy1026/demo-rust-player-no-client-in-server.git
cd demo-rust-player-no-client-in-server
```

先让 Codex 阅读 [HANDOFF.md](./HANDOFF.md)，再提供那台电脑上的 Rust 游戏安装目录。

启动 Steam 管理服务：

```powershell
cd steam-multi-account
.\start.cmd
```

启动脚本会在首次运行时安装锁定版本的依赖。服务运行后，双击 `open-dashboard.cmd`，或访问 <http://127.0.0.1:3210/> 并读取本机新生成的 `data/api-key.txt`。

新电脑需要重新登录 Steam 并完成 Steam Guard。账号数据由本机生成并加密保存，旧电脑的 Windows DPAPI 数据不能直接作为新电脑的登录状态使用。

## 目录

| 路径 | 内容 |
| --- | --- |
| [steam-multi-account/](./steam-multi-account/) | HTTP API、中文管理页面、Node.js SDK、Windows 启动脚本和已有测试 |
| [rust-research/研究报告.md](./rust-research/研究报告.md) | 已完成的协议和 EAC 研究、证据依据及待验证问题 |
| [rust-research/protocol-map.json](./rust-research/protocol-map.json) | 应用消息、连接状态、身份字段和部分 Protobuf schema |
| [rust-research/evidence.json](./rust-research/evidence.json) | 原始服务端程序集哈希、manifest、方法定位和分析记录 |
| [rust-research/research-update-2026-10-23.md](./rust-research/research-update-2026-10-23.md) | 第二轮公开资料、原生传输库证据和候选项目核对 |
| [rust-research/client-observation-plan.md](./rust-research/client-observation-plan.md) | 在有游戏的电脑上进行正常连接观察的准备与命令模板 |
| [rust-research/player-count-diagnosis.md](./rust-research/player-count-diagnosis.md) | OnPlayerConnected、内部活跃列表与外部人数差异的证据和排查方法 |
| [rust-research/server-103-91-208-182.md](./rust-research/server-103-91-208-182.md) | 新服务器的公开登记核对、查询记录与多出口会话分析 |
| [rust-research/rustjiaren-review-2026-10-26.md](./rust-research/rustjiaren-review-2026-10-26.md) | 新参考扩展的人工地址/上报路径、当前EAC缺口和目标人数快照 |
| [rust-research/query-server.mjs](./rust-research/query-server.mjs) | 不依赖第三方库的 A2S 查询工具 |
| [tools/rust-research/](./tools/rust-research/) | 公开资料获取和程序集静态复核脚本 |
| [HANDOFF.md](./HANDOFF.md) | 换电脑后继续工作的上下文与下一步 |

目标游戏地址为 `202.189.21.138:28015`，查询地址为 `202.189.21.138:28017`。可以在仓库根目录读取公开服务器信息：

```powershell
node .\rust-research\query-server.mjs --host 202.189.21.138 --port 28017
```

研究快照记录于 2026-10-23；目标服务器和 Steam 公开分支之后可能更新。`steam-user.gamesPlayed()` 设置的是 Steam 游戏活动状态，不能据此认定账号已经进入 Rust 服务器。

2026-10-24 已完成真实客户端的当前会话与正常重连观察，记录了两次 RakNet 握手和人数差异样本。见 [客户端观察报告](./rust-research/client-observation-2026-10-24.md)。本轮实际服务器为 `61.147.247.35:28015`（查询 `28016`），与前述研究目标分别记录。该观察阶段之后已实现下述独立玩家连接。

后续已实测独立 Steam 票据签发和原生 RakNet 连接，完成真实身份提交、审批、Ready、自身玩家实体及 FinishLoading 确认，并实现网页持续连接和断开。见 [独立连接研究](./rust-research/independent-connection-2026-10-24.md)。持续连接使用 `rust-session`，限时研究使用 `rust-connect`；玩家入服与有效 EAC 状态分别记录。
