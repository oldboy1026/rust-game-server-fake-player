# 项目接续

开始工作前阅读 `HANDOFF.md`，了解已有进度、证据位置和当前待办。用户提供的新指示优先。

- Steam 服务在 `steam-multi-account/`，研究报告在 `rust-research/`，复核工具在 `tools/rust-research/`。
- 原始抓包和本机资料保存在被忽略的 `captures/` 或 `work/` 中。保护 `data/` 中的账号凭据，避免输出或提交密钥、Cookie 和认证票据。
- 清楚区分 Steam 游戏活动状态、A2S 查询、实际 Rust 玩家连接与有效 EAC 会话；结论应注明证据和未验证部分。
- 代码应使用相对路径或由用户提供的路径，避免依赖原电脑的用户名和工作目录。
