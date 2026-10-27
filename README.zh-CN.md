# Steam 多账号管理与 Rust 连接研究

[English](README.md) · [简体中文](README.zh-CN.md) · [英文文档目录](docs/ENGLISH_INDEX.md)

**2026-10-27 当前状态：** 已按项目所有者要求删除本机服务的全部 48 个已导入账号，运行中账号列表和持久化账号存储均为 0。网页提供中英文界面和代码、研究方向说明；README 默认展示英文，本文件保留中文版。独立程序在已验证的非 EAC 配置上完成过真实入服；有效 Rust EAC 会话和 Facepunch 公共人数增加仍未解决。查询代理已完成本机 A2S 0→2 对照，不能据此声称公共后台采用。请阅读 [英文代码说明](docs/CODE_GUIDE.md)、[研究方向](docs/RESEARCH.md) 和当前 [HANDOFF.md](HANDOFF.md)；下文服务器与客户端记录均为历史证据，不是当前登录或连接状态。

这个项目包含可运行的 Node.js Steam 多账号管理服务，以及 Rust 2635 协议、EOS/EAC 会话的研究资料。

新增：`/rust` 网页支持按游戏 IPv4+端口查询 Facepunch 公共人数、服务器 cp、A2S 人数和可选公开玩家条目；无需登录 Steam。查询端口由 Steam 登记精确匹配或手动填写。参考 [服务器上传文件及验证步骤](server-upload/README.zh-CN.md)，可对一个已经正常入服的玩家手动刷新原版资料，尚未验证能改变公共人数，不解决 EAC 准入。最新只读查询证据见 [public-query-verification-2026-10-26.json](rust-research/public-query-verification-2026-10-26.json)。

已编译的 [Oxide.Ext.RustPresenceBridge.dll](server-upload/rust-presence-bridge/dist/Oxide.Ext.RustPresenceBridge.dll) 放置于服务器 `RustDedicated_Data/Managed/`，需要重启和兼容 Oxide；[DLL 上传与 Node.js 联动步骤](server-upload/rust-presence-bridge/README.zh-CN.md)。构建及隔离验证已完成，目标服加载、EAC 和公共人数改变尚未验证。

**已实现 Steam 多账号管理，并在 `61.147.247.35:28015` 通过独立 Node.js/Python 程序完成真实账号入服和持续连接。程序自行登录 Steam、取得票据和建立 Rust 传输，不调用 Steam 桌面客户端或 Rust 游戏进程。当前没有实现有效 EAC 受保护会话，结果限于已验证的服务器配置。**

实测期间原有 Steam/Rust 客户端保留作观察基线；尚未进行将两者全部退出后的重复连接。独立程序仍需要本机兼容版本的 `RakNet.dll` 和 64 位 Python。

## 在另一台 Windows 电脑继续

安装 Git 和 Node.js 22 或更新版本，在 PowerShell 中执行：

```powershell
git clone https://github.com/oldboy1026/rust-game-server-fake-player.git
cd rust-game-server-fake-player
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
| [steam-multi-account/README.zh-CN.md](./steam-multi-account/README.zh-CN.md) | HTTP API、中英文管理页面、Node.js SDK、Windows 启动脚本和已有测试 |
| [英文文档目录](docs/ENGLISH_INDEX.md) | 代码、研究方向、历史研究及工具/部署说明的英文入口 |
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

最初研究记录的游戏地址为 `202.189.21.138:28015`，查询地址为 `202.189.21.138:28017`；这是历史目标，运行实验时需明确当前已获授权的地址。历史公开查询命令如下：

```powershell
node .\rust-research\query-server.mjs --host 202.189.21.138 --port 28017
```

研究快照记录于 2026-10-23；目标服务器和 Steam 公开分支之后可能更新。`steam-user.gamesPlayed()` 设置的是 Steam 游戏活动状态，不能据此认定账号已经进入 Rust 服务器。

2026-10-24 已完成真实客户端的当前会话与正常重连观察，记录了两次 RakNet 握手和人数差异样本。见 [客户端观察报告](./rust-research/client-observation-2026-10-24.md)。本轮实际服务器为 `61.147.247.35:28015`（查询 `28016`），与前述研究目标分别记录。该观察阶段之后已实现下述独立玩家连接。

后续已实测独立 Steam 票据签发和原生 RakNet 连接，完成真实身份提交、审批、Ready、自身玩家实体及 FinishLoading 确认，并实现网页持续连接和断开。见 [独立连接研究](./rust-research/independent-connection-2026-10-24.md)。持续连接使用 `rust-session`，限时研究使用 `rust-connect`；玩家入服与有效 EAC 状态分别记录。

## 分享可验证的解决方案

如果你解决了 **Rust 公共服务器列表人数增加**，或能够 **建立有效的 Rust EAC 安全连接**，欢迎联系并分享你的研究消息。我可能愿意付费购买经过验证、可以运行的解决方案。联系邮箱：**[oldboy1026@gmail.com](mailto:oldboy1026@gmail.com)**。

请说明 Rust 版本、服务器配置、复现步骤和独立验证结果，区分真实玩家连接、查询条目与 Facepunch 公共人数；不要发送账号密码或可重复使用的认证票据。

## 许可证

项目许可证见 [LICENSE](LICENSE)。第三方组件、游戏文件与服务仍适用各自的许可和使用条件。
